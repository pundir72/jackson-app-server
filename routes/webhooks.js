/**
 * Webhook Routes
 * Handle callbacks from third-party services (Besitos, BitLabs, etc.)
 * @module routes/webhooks
 */

const express = require('express');
const router = express.Router();
const UserChallengeProgress = require('../models/UserChallengeProgress');
const BesitosConversion = require('../models/BesitosConversion');
const DailyChallenge = require('../models/DailyChallenge');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const AdjustCallback = require('../models/AdjustCallback');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');
const streakRouter = require('./streak');
const getStreakConfig = streakRouter.getStreakConfig;
const getMilestoneReward = streakRouter.getMilestoneReward;

/**
 * @route   POST /api/webhooks/besitos/conversion
 * @desc    Handle Besitos conversion webhook
 * @body    {string} userId - User ID
 * @body    {string} offerId - Offer ID
 * @body    {string} conversionId - Conversion ID from Besitos
 * @body    {string} status - Conversion status
 * @body    {number} rewardAmount - Reward amount
 * @access  Public (but should verify signature in production)
 */
router.post('/besitos/conversion', async (req, res) => {
  try {
    const {
      userId,
      offerId,
      conversionId,
      status,
      rewardAmount,
      taskId,
      metadata
    } = req.body;
    
    console.log('Besitos webhook received:', {
      userId,
      offerId,
      conversionId,
      status
    });
    
    // Validate required fields
    if (!userId || !offerId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, offerId, status'
      });
    }
    
    // Find the user
    const user = await User.findById(userId).select('wallet xp streak');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Create or update Besitos conversion record
    let conversion = await BesitosConversion.findOne({ conversionId });
    
    if (!conversion) {
      conversion = new BesitosConversion({
        userId,
        besitosUserId: metadata?.besitosUserId || userId,
        offerId,
        offerName: metadata?.offerName || 'Unknown Offer',
        offerType: metadata?.offerType || 'other',
        conversionId,
        conversionStatus: status,
        rewardAmount: rewardAmount || 0,
        eventTimestamp: new Date(),
        metadata: metadata || {}
      });
    } else {
      conversion.conversionStatus = status;
      if (status === 'completed') {
        conversion.completedAt = new Date();
      }
    }
    
    await conversion.save();
    
    // If conversion is completed, check if it's part of a daily challenge
    if (status === 'completed') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find today's challenge with this SDK task
      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: 'live',
        'sdkTask.provider': 'besitos',
        'sdkTask.offerId': offerId
      });
      
      if (challenge) {
        // Get user's progress for this challenge
        let progress = await UserChallengeProgress.getUserChallengeForDate(userId, today);
        
        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            userId,
            challenge._id,
            today
          );
        }
        
        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: taskId || conversionId,
          conversionId: conversion._id
        };
        
        // Mark challenge as completed
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward
        });
        
        // Credit user rewards (apply tier multiplier to XP)
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp = challenge.xpReward;
        const { finalXP, multiplier: tierMultiplier } =
          await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;
        
        // Update streak
        const todayStr = today.toISOString().split('T')[0];
        const streak = user.streak || {};
        if (!streak.completedTasks) streak.completedTasks = [];
        
        let newStreak = streak.current || 0;
        let milestoneRewardEarned = null;
        
        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          newStreak = (streak.current || 0) + 1;
          streak.current = newStreak;
          streak.lastUpdated = new Date();
          streak.lastTaskType = 'challenge';
          user.streak = streak;

          // Check for milestone rewards
          try {
            const STREAK_CONFIG = await getStreakConfig();
            const milestoneReward = getMilestoneReward(newStreak, STREAK_CONFIG);
            
            if (milestoneReward && milestoneReward.rewards && milestoneReward.rewards.length > 0) {
              const rewardsEarned = [];
              
              // Award all rewards for this milestone
              for (const reward of milestoneReward.rewards) {
                if (reward.type === 'coins') {
                  user.wallet.balance = (user.wallet.balance || 0) + reward.value;
                } else if (reward.type === 'xp') {
                  const { finalXP: milestoneXP } = await applyTierMultiplierToXP(user, reward.value);
                  user.xp.current = (user.xp.current || 0) + milestoneXP;
                  user.xp.total = (user.xp.total || 0) + milestoneXP;
                }
                
                // Create transaction record for each reward
                const milestoneTransaction = new Transaction({
                  user: userId,
                  type: 'credit',
                  balanceType: reward.type === 'coins' ? 'coins' : 'xp',
                  amount: reward.value,
                  description: `Streak Milestone Reward - Day ${newStreak} - ${reward.type === 'coins' ? 'Coins' : 'XP'}`,
                  status: milestoneReward.claimMode === 'auto' ? 'completed' : 'pending',
                  referenceId: `STREAK-${newStreak}-${reward.type}-${Date.now()}`,
                  metadata: {
                    milestoneDay: newStreak,
                    rewardType: reward.type,
                    rewardValue: reward.value,
                    claimMode: milestoneReward.claimMode,
                    source: 'besitos_webhook'
                  }
                });
                
                await milestoneTransaction.save();
                rewardsEarned.push({ type: reward.type, value: reward.value });
              }
              
              milestoneRewardEarned = {
                day: newStreak,
                rewards: rewardsEarned,
                claimMode: milestoneReward.claimMode,
                requiresAd: milestoneReward.claimMode === 'watch_ad'
              };
            }
          } catch (error) {
            console.error('Error awarding milestone reward:', error);
            // Continue even if milestone reward fails
          }
        }
        
        await user.save();
        
        // Mark rewards as claimed
        await progress.claimRewards();
        
        // Update challenge analytics
        await challenge.updateAnalytics('complete', {
          coins: challenge.coinReward,
          xp: finalXP
        });
        
        // Create transaction record
        const transaction = new Transaction({
          user: userId,
          type: 'credit',
          amount: challenge.coinReward,
          description: `Daily Challenge (Besitos): ${challenge.title}`,
          status: 'completed',
          metadata: {
            challengeId: challenge._id,
            conversionId: conversion._id,
            offerId,
            source: 'besitos_webhook'
          },
          referenceId: `BESITOS-CHALLENGE-${challenge._id}-${Date.now()}`
        });
        
        await transaction.save();
        
        // Update conversion with credits
        await conversion.creditRewards(challenge.coinReward, baseXp);
        
        console.log(`Daily challenge completed via Besitos webhook for user ${userId}`);
      }
    }
    
    res.json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        conversionId: conversion._id,
        status: conversion.conversionStatus,
        challengeCompleted: conversion.isCredited
      }
    });
  } catch (error) {
    console.error('Error processing Besitos webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/bitlabs/completion
 * @desc    Handle BitLabs survey completion webhook
 * @body    {string} userId - User ID
 * @body    {string} surveyId - Survey ID
 * @body    {string} status - Completion status
 * @body    {number} reward - Reward amount
 * @access  Public (but should verify signature in production)
 */
router.post('/bitlabs/completion', async (req, res) => {
  try {
    const { userId, surveyId, status, reward, metadata } = req.body;
    
    console.log('BitLabs webhook received:', {
      userId,
      surveyId,
      status
    });
    
    // Validate required fields
    if (!userId || !surveyId || !status) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, surveyId, status'
      });
    }
    
    if (status === 'completed') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find today's challenge with this survey
      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: 'live',
        'sdkTask.provider': 'bitlabs',
        'sdkTask.taskId': surveyId
      });
      
      if (challenge) {
        const user = await User.findById(userId).select('wallet xp streak');
        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }
        
        let progress = await UserChallengeProgress.getUserChallengeForDate(userId, today);
        
        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            userId,
            challenge._id,
            today
          );
        }
        
        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: surveyId
        };
        
        // Complete the challenge (store base XP)
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward
        });
        
        // Credit user (apply tier multiplier to XP)
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp2 = challenge.xpReward;
        const { finalXP: finalXP2, multiplier: tierMultiplier2 } =
          await applyTierMultiplierToXP(user, baseXp2);

        user.xp.current = (user.xp.current || 0) + finalXP2;
        user.xp.total = (user.xp.total || 0) + finalXP2;
        
        // Update streak
        const todayStr = today.toISOString().split('T')[0];
        const streak = user.streak || {};
        if (!streak.completedTasks) streak.completedTasks = [];
        
        let newStreak = streak.current || 0;
        let milestoneRewardEarned = null;
        
        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          newStreak = (streak.current || 0) + 1;
          streak.current = newStreak;
          streak.lastUpdated = new Date();
          user.streak = streak;

          // Check for milestone rewards
          try {
            const STREAK_CONFIG = await getStreakConfig();
            const milestoneReward = getMilestoneReward(newStreak, STREAK_CONFIG);
            
            if (milestoneReward && milestoneReward.rewards && milestoneReward.rewards.length > 0) {
              const rewardsEarned = [];
              
              // Award all rewards for this milestone
              for (const reward of milestoneReward.rewards) {
                if (reward.type === 'coins') {
                  user.wallet.balance = (user.wallet.balance || 0) + reward.value;
                } else if (reward.type === 'xp') {
                  const { finalXP: milestoneXP } = await applyTierMultiplierToXP(user, reward.value);
                  user.xp.current = (user.xp.current || 0) + milestoneXP;
                  user.xp.total = (user.xp.total || 0) + milestoneXP;
                }
                
                // Create transaction record for each reward
                const milestoneTransaction = new Transaction({
                  user: userId,
                  type: 'credit',
                  balanceType: reward.type === 'coins' ? 'coins' : 'xp',
                  amount: reward.value,
                  description: `Streak Milestone Reward - Day ${newStreak} - ${reward.type === 'coins' ? 'Coins' : 'XP'}`,
                  status: milestoneReward.claimMode === 'auto' ? 'completed' : 'pending',
                  referenceId: `STREAK-${newStreak}-${reward.type}-${Date.now()}`,
                  metadata: {
                    milestoneDay: newStreak,
                    rewardType: reward.type,
                    rewardValue: reward.value,
                    claimMode: milestoneReward.claimMode,
                    source: 'bitlabs_webhook'
                  }
                });
                
                await milestoneTransaction.save();
                rewardsEarned.push({ type: reward.type, value: reward.value });
              }
              
              milestoneRewardEarned = {
                day: newStreak,
                rewards: rewardsEarned,
                claimMode: milestoneReward.claimMode,
                requiresAd: milestoneReward.claimMode === 'watch_ad'
              };
            }
          } catch (error) {
            console.error('Error awarding milestone reward:', error);
            // Continue even if milestone reward fails
          }
        }
        
        await user.save();
        await progress.claimRewards();
        await challenge.updateAnalytics('complete');
        
        console.log(`Daily challenge completed via BitLabs webhook for user ${userId}`);
      }
    }
    
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('Error processing BitLabs webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process webhook'
    });
  }
});

/**
 * @route   POST /api/webhooks/adjust/callback
 * @desc    Handle Adjust raw data export callbacks
 * @access  Public (Adjust sends data to this endpoint)
 * @body    Adjust callback data (varies by activity type)
 * @note    Documentation: https://help.adjust.com/en/article/raw-data-exports
 * 
 * Adjust sends raw data for various activities:
 * - Impressions, Clicks, Installs, Sessions
 * - In-app events, Reattributions
 * - ATT status updates, SKAdNetwork data
 * - Updated attributions, Ad spend
 * - Erased users (GDPR), Ad revenue
 * - Subscriptions, Uninstalls, Reinstalls
 * - Rejected installs/reattributions
 */
router.post('/adjust/callback', async (req, res) => {
  try {
    const callbackData = req.body;
    
    console.log('Adjust callback received:', {
      activityKind: callbackData.activity_kind || callbackData.activityKind,
      appToken: callbackData.app_token || callbackData.appToken,
      timestamp: new Date().toISOString()
    });

    // Determine activity kind
    const activityKind = callbackData.activity_kind || callbackData.activityKind || 'unknown';
    
    // Extract common fields
    const adjustCallback = new AdjustCallback({
      activityKind: activityKind,
      appToken: callbackData.app_token || callbackData.appToken,
      trackerToken: callbackData.tracker_token || callbackData.trackerToken,
      trackerName: callbackData.tracker_name || callbackData.trackerName,
      network: callbackData.network,
      campaign: callbackData.campaign,
      adgroup: callbackData.adgroup,
      creative: callbackData.creative,
      clickLabel: callbackData.click_label || callbackData.clickLabel,

      // Device identifiers
      idfa: callbackData.idfa,
      idfv: callbackData.idfv,
      gpsAdid: callbackData.gps_adid || callbackData.gpsAdid,
      fireAdid: callbackData.fire_adid || callbackData.fireAdid,
      oaid: callbackData.oaid,
      webUuid: callbackData.web_uuid || callbackData.webUuid,
      androidId: callbackData.android_id || callbackData.androidId,

      // Adjust user ID
      adjustUserId: callbackData.adid || callbackData.adjustId || callbackData.user_id || callbackData.userId,

      // Event information (for in-app events)
      eventToken: callbackData.event_token || callbackData.eventToken,
      eventName: callbackData.event_name || callbackData.eventName,
      revenue: callbackData.revenue ? Number(callbackData.revenue) : null,
      currency: callbackData.currency,
      callbackParams: callbackData.callback_params || callbackData.callbackParams,
      partnerParams: callbackData.partner_params || callbackData.partnerParams,

      // Timestamps
      clickTime: callbackData.click_time || callbackData.clickTime ? new Date(callbackData.click_time || callbackData.clickTime) : null,
      installTime: callbackData.install_time || callbackData.installTime ? new Date(callbackData.install_time || callbackData.installTime) : null,
      eventTime: callbackData.event_time || callbackData.eventTime ? new Date(callbackData.event_time || callbackData.eventTime) : null,
      createdAtAdjust: callbackData.created_at || callbackData.createdAt ? new Date(callbackData.created_at || callbackData.createdAt) : new Date(),

      // Attribution information
      attributionType: callbackData.attribution_type || callbackData.attributionType,
      attributionWindow: callbackData.attribution_window || callbackData.attributionWindow,
      isOrganic: callbackData.is_organic || callbackData.isOrganic === true || callbackData.isOrganic === 'true',
      isReattribution: callbackData.is_reattribution || callbackData.isReattribution === true || callbackData.isReattribution === 'true',

      // Location information
      country: callbackData.country,
      region: callbackData.region,
      city: callbackData.city,
      ipAddress: callbackData.ip_address || callbackData.ipAddress || req.ip,
      userAgent: callbackData.user_agent || callbackData.userAgent || req.headers['user-agent'],

      // Platform information
      platform: callbackData.platform,
      osVersion: callbackData.os_version || callbackData.osVersion,
      appVersion: callbackData.app_version || callbackData.appVersion,
      deviceType: callbackData.device_type || callbackData.deviceType,
      deviceName: callbackData.device_name || callbackData.deviceName,

      // SKAdNetwork information (iOS)
      skadnetworkConversionValue: callbackData.skadnetwork_conversion_value || callbackData.skadnetworkConversionValue,
      skadnetworkCoarseValue: callbackData.skadnetwork_coarse_value || callbackData.skadnetworkCoarseValue,
      skadnetworkLockWindow: callbackData.skadnetwork_lock_window || callbackData.skadnetworkLockWindow,
      skadnetworkPostbackSequenceIndex: callbackData.skadnetwork_postback_sequence_index || callbackData.skadnetworkPostbackSequenceIndex,

      // Subscription information
      subscriptionPeriod: callbackData.subscription_period || callbackData.subscriptionPeriod,
      subscriptionState: callbackData.subscription_state || callbackData.subscriptionState,
      subscriptionProductId: callbackData.subscription_product_id || callbackData.subscriptionProductId,

      // Store raw data
      rawData: callbackData
    });

    // Try to find user by device identifiers or Adjust user ID
    // Note: Adjust user ID can be stored in user metadata or we can match by device identifiers
    // For now, we'll store the Adjust user ID in the callback and process it later
    // You can enhance this by storing adjustUserId in User.metadata if needed

    // Save callback
    await adjustCallback.save();

    // Process based on activity kind
    setImmediate(async () => {
      try {
        await processAdjustCallback(adjustCallback);
        adjustCallback.processed = true;
        adjustCallback.processedAt = new Date();
        await adjustCallback.save();
      } catch (error) {
        console.error('Error processing Adjust callback:', error);
        adjustCallback.processingError = error.message;
        await adjustCallback.save();
      }
    });

    // Always return 200 OK to Adjust (they retry on errors)
    res.status(200).json({
      success: true,
      message: 'Callback received and queued for processing',
      callbackId: adjustCallback._id
    });
  } catch (error) {
    console.error('Error processing Adjust callback:', error);
    // Still return 200 to prevent Adjust from retrying
    res.status(200).json({
      success: false,
      error: 'Callback received but processing failed',
      message: error.message
    });
  }
});

/**
 * Process Adjust callback based on activity kind
 * @param {Object} callback - AdjustCallback document
 */
async function processAdjustCallback(callback) {
  switch (callback.activityKind) {
    case 'install':
      await processInstall(callback);
      break;
    case 'event':
      await processEvent(callback);
      break;
    case 'session':
      await processSession(callback);
      break;
    case 'ad_revenue':
      await processAdRevenue(callback);
      break;
    case 'reattribution':
      await processReattribution(callback);
      break;
    case 'uninstall':
      await processUninstall(callback);
      break;
    case 'reinstall':
      await processReinstall(callback);
      break;
    default:
      console.log(`No specific processing for activity kind: ${callback.activityKind}`);
  }
}

/**
 * Process install callback
 */
async function processInstall(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Store Adjust user ID in metadata
      if (!user.metadata) {
        user.metadata = {};
      }
      if (!user.metadata.adjust) {
        user.metadata.adjust = {};
      }
      user.metadata.adjust.userId = callback.adjustUserId;
      
      // Store attribution information in metadata
      user.metadata.adjust.attribution = {
        trackerToken: callback.trackerToken,
        trackerName: callback.trackerName,
        network: callback.network,
        campaign: callback.campaign,
        adgroup: callback.adgroup,
        creative: callback.creative,
        isOrganic: callback.isOrganic,
        installTime: callback.installTime || callback.createdAtAdjust
      };
      
      // Update device information if available
      if (callback.platform) {
        user.device.type = callback.platform;
      }
      if (callback.deviceType) {
        user.device.model = callback.deviceType;
      }
      if (callback.osVersion) {
        user.device.os = callback.osVersion;
      }
      user.device.lastUpdated = new Date();
      
      await user.save();
      console.log(`Processed Adjust install for user ${callback.userId}`);
    }
  }
}

/**
 * Process in-app event callback
 */
async function processEvent(callback) {
  // Events are already tracked via S2S API, but we can log them here
  console.log(`Adjust event received: ${callback.eventName || callback.eventToken}`, {
    userId: callback.userId,
    revenue: callback.revenue,
    currency: callback.currency
  });
  
  // You can add additional processing here if needed
  // e.g., update user analytics, trigger notifications, etc.
}

/**
 * Process session callback
 */
async function processSession(callback) {
  // Log session for analytics
  console.log(`Adjust session received for user ${callback.userId || callback.adjustUserId}`);
  
  // You can add session tracking logic here
}

/**
 * Process ad revenue callback
 */
async function processAdRevenue(callback) {
  // Ad revenue is already tracked via S2S API, but we can log it here
  console.log(`Adjust ad revenue received:`, {
    userId: callback.userId,
    revenue: callback.revenue,
    currency: callback.currency,
    network: callback.network
  });
}

/**
 * Process reattribution callback
 */
async function processReattribution(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Initialize metadata if needed
      if (!user.metadata) {
        user.metadata = {};
      }
      if (!user.metadata.adjust) {
        user.metadata.adjust = {};
      }
      if (!user.metadata.adjust.attribution) {
        user.metadata.adjust.attribution = {};
      }
      
      // Update attribution information
      user.metadata.adjust.attribution.trackerToken = callback.trackerToken;
      user.metadata.adjust.attribution.trackerName = callback.trackerName;
      user.metadata.adjust.attribution.network = callback.network;
      user.metadata.adjust.attribution.campaign = callback.campaign;
      user.metadata.adjust.attribution.isReattribution = true;
      user.metadata.adjust.attribution.reattributionTime = callback.createdAtAdjust;
      
      await user.save();
      console.log(`Processed Adjust reattribution for user ${callback.userId}`);
    }
  }
}

/**
 * Process uninstall callback
 */
async function processUninstall(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Mark user as uninstalled
      if (!user.metadata) {
        user.metadata = {};
      }
      user.metadata.uninstalled = true;
      user.metadata.uninstalledAt = callback.createdAtAdjust || new Date();
      
      await user.save();
      console.log(`Processed Adjust uninstall for user ${callback.userId}`);
    }
  }
}

/**
 * Process reinstall callback
 */
async function processReinstall(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Mark user as reinstalled
      if (user.metadata && user.metadata.uninstalled) {
        user.metadata.uninstalled = false;
        user.metadata.reinstalled = true;
        user.metadata.reinstalledAt = callback.createdAtAdjust || new Date();
        
        await user.save();
        console.log(`Processed Adjust reinstall for user ${callback.userId}`);
      }
    }
  }
}

module.exports = router;


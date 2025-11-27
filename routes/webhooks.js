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
const AdjustAttribution = require('../models/AdjustAttribution');

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
        
        // Credit user rewards
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        user.xp.current = (user.xp.current || 0) + challenge.xpReward;
        user.xp.total = (user.xp.total || 0) + challenge.xpReward;
        
        // Update streak
        const todayStr = today.toISOString().split('T')[0];
        const streak = user.streak || {};
        if (!streak.completedTasks) streak.completedTasks = [];
        
        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          streak.current = (streak.current || 0) + 1;
          streak.lastUpdated = new Date();
          streak.lastTaskType = 'challenge';
          user.streak = streak;
        }
        
        await user.save();
        
        // Mark rewards as claimed
        await progress.claimRewards();
        
        // Update challenge analytics
        await challenge.updateAnalytics('complete', {
          coins: challenge.coinReward,
          xp: challenge.xpReward
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
        await conversion.creditRewards(challenge.coinReward, challenge.xpReward);
        
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
        
        // Complete the challenge
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward
        });
        
        // Credit user
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        user.xp.current = (user.xp.current || 0) + challenge.xpReward;
        user.xp.total = (user.xp.total || 0) + challenge.xpReward;
        
        // Update streak
        const todayStr = today.toISOString().split('T')[0];
        const streak = user.streak || {};
        if (!streak.completedTasks) streak.completedTasks = [];
        
        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          streak.current = (streak.current || 0) + 1;
          streak.lastUpdated = new Date();
          user.streak = streak;
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
 * @route   POST /api/webhooks/adjust/attribution
 * @desc    Handle Adjust attribution webhook callback
 * @body    Adjust attribution callback data
 * @access  Public (but should verify signature in production)
 */
router.post('/adjust/attribution', async (req, res) => {
  try {
    const attributionData = req.body;
    
    console.log('Adjust attribution webhook received:', {
      adjustId: attributionData.adjust_id,
      network: attributionData.network,
      campaign: attributionData.campaign
    });

    // Extract user ID from callback params if available
    const userId = attributionData.callback_params?.user_id || attributionData.user_id;
    
    if (!userId) {
      console.warn('Adjust webhook: No user_id found in callback params');
      return res.status(200).json({ received: true }); // Still return 200 to Adjust
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`Adjust webhook: User not found: ${userId}`);
      return res.status(200).json({ received: true });
    }

    // Map Adjust webhook data to our schema
    const mappedData = {
      userId: user._id,
      adjustId: attributionData.adjust_id,
      network: attributionData.network,
      campaign: attributionData.campaign,
      adgroup: attributionData.adgroup,
      creative: attributionData.creative,
      clickLabel: attributionData.click_label,
      trackerToken: attributionData.tracker_token,
      trackerName: attributionData.tracker_name,
      campaignId: attributionData.campaign_id,
      adgroupId: attributionData.adgroup_id,
      creativeId: attributionData.creative_id,
      idfa: attributionData.idfa,
      idfv: attributionData.idfv,
      gpsAdid: attributionData.gps_adid,
      androidId: attributionData.android_id,
      fireAdid: attributionData.fire_adid,
      windowsAdid: attributionData.windows_adid,
      amazonAdid: attributionData.amazon_adid,
      appToken: attributionData.app_token,
      appVersion: attributionData.app_version,
      appName: attributionData.app_name,
      deviceType: attributionData.device_type,
      deviceName: attributionData.device_name,
      osName: attributionData.os_name,
      osVersion: attributionData.os_version,
      environment: attributionData.environment || 'production',
      country: attributionData.country,
      region: attributionData.region,
      city: attributionData.city,
      language: attributionData.language,
      ipAddress: attributionData.ip_address,
      attributionType: attributionData.attribution_type,
      clickTime: attributionData.click_time ? new Date(attributionData.click_time) : null,
      installTime: attributionData.install_time ? new Date(attributionData.install_time) : null,
      impressionTime: attributionData.impression_time ? new Date(attributionData.impression_time) : null,
      isOrganic: attributionData.is_organic === 'true' || attributionData.is_organic === true,
      isReattributed: attributionData.is_reattributed === 'true' || attributionData.is_reattributed === true,
      metadata: {
        raw: attributionData
      }
    };

    // Check if attribution already exists
    const existingAttribution = await AdjustAttribution.findOne({
      userId: user._id,
      isActive: true
    });

    if (existingAttribution) {
      // Update existing attribution
      Object.assign(existingAttribution, mappedData);
      await existingAttribution.save();
    } else {
      // Create new attribution
      const newAttribution = new AdjustAttribution(mappedData);
      await newAttribution.save();
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Adjust attribution webhook error:', error);
    // Still return 200 to Adjust to prevent retries
    res.status(200).json({ received: true });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { progressResetMiddleware } = require('../middleware/dailyProgressReset');
const accountOverviewService = require('../utils/accountOverview');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const UserAchievement = require('../models/UserAchievement');

// All configuration is now dynamic and user-specific
// No static configuration needed

/**
 * GET /api/account-overview
 * Get My Account Overview data with total earnings and progress tracking
 */
router.get('/', protect, progressResetMiddleware(), async (req, res) => {
  try {
    const accountOverview = await accountOverviewService.getAccountOverview(req.user.userId);
    
    res.json({
      success: true,
      data: accountOverview
    });
  } catch (error) {
    console.error('Error getting account overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get account overview data'
    });
  }
});

/**
 * POST /api/account-overview/claim-reward
 * Claim a milestone reward
 */
router.post('/claim-reward', protect, async (req, res) => {
  try {
    const { milestoneType } = req.body; // 'gamesPlayed', 'coinsEarned', 'challengesCompleted'
    
    const result = await accountOverviewService.claimMilestoneReward(req.user.userId, milestoneType);
    
    res.json({
      success: true,
      data: {
        message: 'Milestone reward claimed successfully!',
        ...result
      }
    });
  } catch (error) {
    console.error('Error claiming milestone reward:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to claim milestone reward'
    });
  }
});

/**
 * PUT /api/account-overview/update-progress
 * Update progress for a specific activity
 */
router.put('/update-progress', protect, async (req, res) => {
  try {
    const { activityType, progressData } = req.body; // 'game', 'coin', 'challenge'
    
    const updatedProgress = await accountOverviewService.updateProgress(req.user.userId, activityType, progressData);
    
    res.json({
      success: true,
      data: {
        message: 'Progress updated successfully',
        updatedProgress
      }
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update progress'
    });
  }
});

/**
 * GET /api/account-overview/history
 * Get progress history for the account overview
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1d':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    // Get progress history
    const history = await accountOverviewService.getProgressHistory(req.user.userId, startDate, endDate);

    res.json({
      success: true,
      data: {
        period,
        history,
        summary: {
          totalGamesPlayed: history.gamesPlayed.total,
          totalCoinsEarned: history.coinsEarned.total,
          totalChallengesCompleted: history.challengesCompleted.total,
          averageDailyProgress: {
            gamesPlayed: history.gamesPlayed.average,
            coinsEarned: history.coinsEarned.average,
            challengesCompleted: history.challengesCompleted.average
          }
        }
      }
    });
  } catch (error) {
    console.error('Error getting progress history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get progress history'
    });
  }
});

/**
 * PUT /api/account-overview/goals
 * Update user's daily goals
 */
router.put('/goals', protect, async (req, res) => {
  try {
    const { gamesPlayed, coinsEarned, challengesCompleted } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate goals
    if (gamesPlayed !== undefined) {
      if (gamesPlayed < 1 || gamesPlayed > 20) {
        return res.status(400).json({
          success: false,
          error: 'Games played goal must be between 1 and 20'
        });
      }
      user.onboarding.dailyGoals.gamesPlayed = gamesPlayed;
    }

    if (coinsEarned !== undefined) {
      if (coinsEarned < 100 || coinsEarned > 5000) {
        return res.status(400).json({
          success: false,
          error: 'Coins earned goal must be between 100 and 5000'
        });
      }
      user.onboarding.dailyGoals.coinsEarned = coinsEarned;
    }

    if (challengesCompleted !== undefined) {
      if (challengesCompleted < 1 || challengesCompleted > 10) {
        return res.status(400).json({
          success: false,
          error: 'Challenges completed goal must be between 1 and 10'
        });
      }
      user.onboarding.dailyGoals.challengesCompleted = challengesCompleted;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Daily goals updated successfully',
        goals: user.onboarding.dailyGoals
      }
    });
  } catch (error) {
    console.error('Error updating daily goals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update daily goals'
    });
  }
});

/**
 * GET /api/account-overview/ad-reward/cooldown
 * Get ad reward cooldown period and next available reward time
 * Returns: cooldown period (4 hours), next reward time, reward amount (50 coins)
 */
router.get('/ad-reward/cooldown', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('adRewardTracking wallet');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Configuration: 4 hour cooldown, 50 coins reward
    const COOLDOWN_HOURS = 4;
    const REWARD_COINS = 50;
    const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

    // Get last ad reward time from user metadata
    // Store in user.adRewardTracking.lastAdRewardAt or use metadata
    const lastAdRewardAt = user.adRewardTracking?.lastAdRewardAt || null;
    const now = new Date();
    
    let nextRewardAt = null;
    let isAvailable = false;
    let timeRemaining = 0;

    if (lastAdRewardAt) {
      const lastRewardTime = new Date(lastAdRewardAt);
      const timeSinceLastReward = now.getTime() - lastRewardTime.getTime();
      
      if (timeSinceLastReward >= COOLDOWN_MS) {
        // Cooldown has passed
        isAvailable = true;
        nextRewardAt = now; // Available now
      } else {
        // Still in cooldown
        timeRemaining = COOLDOWN_MS - timeSinceLastReward;
        nextRewardAt = new Date(lastRewardTime.getTime() + COOLDOWN_MS);
      }
    } else {
      // Never claimed before - available immediately
      isAvailable = true;
      nextRewardAt = now;
    }

    res.json({
      success: true,
      data: {
        cooldownHours: COOLDOWN_HOURS,
        rewardCoins: REWARD_COINS,
        isAvailable,
        nextRewardAt: nextRewardAt.toISOString(),
        timeRemainingMs: timeRemaining,
        timeRemainingFormatted: formatTimeRemaining(timeRemaining),
        lastRewardAt: lastAdRewardAt ? new Date(lastAdRewardAt).toISOString() : null
      }
    });
  } catch (error) {
    console.error('Error getting ad reward cooldown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ad reward cooldown'
    });
  }
});

/**
 * POST /api/account-overview/ad-reward/claim
 * Claim ad reward after watching ads
 * Body: { userId, rewardAmount, ads (payload) }
 * Creates transaction log and updates daily coin earn tracking
 */
router.post('/ad-reward/claim', protect, async (req, res) => {
  try {
    const { rewardAmount, ads } = req.body;
    const userId = req.user.userId;

    // Configuration: 4 hour cooldown, 50 coins reward
    const COOLDOWN_HOURS = 4;
    const REWARD_COINS = 50;
    const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;

    // Get user (include name fields for transaction log)
    const user = await User.findById(userId).select('wallet adRewardTracking firstName lastName username');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build display name for logging
    const userDisplayName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || userId;

    // Check cooldown
    const lastAdRewardAt = user.adRewardTracking?.lastAdRewardAt || null;
    const now = new Date();

    if (lastAdRewardAt) {
      const lastRewardTime = new Date(lastAdRewardAt);
      const timeSinceLastReward = now.getTime() - lastRewardTime.getTime();

      // Duplicate guard: block if claimed within last 30 seconds (prevents multiple entries from retries)
      const DUPLICATE_GUARD_MS = 30 * 1000;
      if (timeSinceLastReward < DUPLICATE_GUARD_MS) {
        // Return last transaction info without creating a new one
        const lastTransaction = await Transaction.findOne({
          user: userId,
          'metadata.source': 'ad_reward'
        }).sort({ createdAt: -1 }).select('_id referenceId status description amount');

        return res.json({
          success: true,
          message: 'Ad reward already claimed recently',
          data: {
            user: { name: userDisplayName, id: userId },
            coinsRewarded: lastTransaction?.amount || 0,
            newBalance: user.wallet.balance,
            transaction: lastTransaction ? {
              id: lastTransaction._id,
              referenceId: lastTransaction.referenceId,
              status: lastTransaction.status,
              description: lastTransaction.description
            } : null,
            alreadyClaimed: true
          }
        });
      }
    }

    // Use provided rewardAmount or default to 50 coins
    const coinsToReward = rewardAmount && rewardAmount > 0 ? rewardAmount : REWARD_COINS;

    // Initialize wallet if needed
    if (!user.wallet) {
      user.wallet = { balance: 0, lastUpdated: now };
    }

    // Credit coins to user
    user.wallet.balance = (user.wallet.balance || 0) + coinsToReward;
    user.wallet.lastUpdated = now;
    user.markModified('wallet');

    // Update ad reward tracking
    if (!user.adRewardTracking) {
      user.adRewardTracking = {};
    }
    user.adRewardTracking.lastAdRewardAt = now;
    user.adRewardTracking.totalAdRewardsClaimed = (user.adRewardTracking.totalAdRewardsClaimed || 0) + 1;
    user.markModified('adRewardTracking');

    const totalClaimed = user.adRewardTracking.totalAdRewardsClaimed;
    const referenceId = `AD-REWARD-${userId}-${Date.now()}`;

    // Create transaction log with user name
    const transaction = new Transaction({
      user: userId,
      type: 'reward',
      balanceType: 'coins',
      amount: coinsToReward,
      description: `Ad Reward - ${userDisplayName} watched ad and earned ${coinsToReward} coins`,
      status: 'completed',
      referenceId,
      metadata: {
        source: 'ad_reward',
        userName: userDisplayName,
        userId,
        rewardAmount: coinsToReward,
        ads: ads || null,
        cooldownHours: COOLDOWN_HOURS,
        claimedAt: now.toISOString(),
        totalAdRewardsClaimed: totalClaimed
      }
    });

    // Save user and transaction
    await Promise.all([user.save(), transaction.save()]);

    // Log reward claim
    console.log(`[AD-REWARD] CLAIMED | User: ${userDisplayName} (${userId}) | Coins: +${coinsToReward} | New Balance: ${user.wallet.balance} | Ref: ${referenceId} | Total Claims: ${totalClaimed} | Time: ${now.toISOString()}`);

    // Get updated account overview to return fresh progress data (non-blocking)
    let accountOverview = null;
    try {
      accountOverview = await accountOverviewService.getAccountOverview(userId);
    } catch (overviewError) {
      console.error('Error fetching account overview after ad reward:', overviewError);
    }

    res.json({
      success: true,
      message: 'Ad reward claimed successfully',
      data: {
        user: {
          name: userDisplayName,
          id: userId
        },
        coinsRewarded: coinsToReward,
        newBalance: user.wallet.balance,
        transaction: {
          id: transaction._id,
          referenceId: transaction.referenceId,
          status: transaction.status,
          description: transaction.description
        },
        cooldown: {
          hours: COOLDOWN_HOURS,
          nextRewardAt: new Date(now.getTime() + COOLDOWN_MS).toISOString()
        },
        totalAdRewardsClaimed: totalClaimed,
        accountOverview: accountOverview ? {
          progress: accountOverview.progress,
          totalEarnings: accountOverview.totalEarnings
        } : null
      }
    });
  } catch (error) {
    console.error('Error claiming ad reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim ad reward',
      details: error.message
    });
  }
});

/**
 * Helper function to format time remaining
 */
function formatTimeRemaining(ms) {
  if (ms <= 0) return '0 minutes';
  
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0 && minutes > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
}

module.exports = router;

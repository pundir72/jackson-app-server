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


module.exports = router;

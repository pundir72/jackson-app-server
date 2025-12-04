/**
 * Admin Daily Rewards V2 Routes
 * Extended configuration (reward types, weekly multipliers, etc.)
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const DailyRewardConfigV2 = require('../models/DailyRewardConfigV2');
const DailyRewardProgress = require('../models/DailyRewardProgress');
const { getISOWeekKey, getWeekBoundsUtc } = require('../utils/dailyRewardHelpersV2');

// ==================== REWARD CONFIGURATION V2 ====================

router.get('/config', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfigV2.findOne({ isActive: true })
      .sort({ version: -1 });
    
    if (!config) {
      return res.json({
        success: true,
        data: null,
        message: 'No active V2 configuration found. Please create one.'
      });
    }
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting daily reward V2 config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get V2 configuration'
    });
  }
});

router.get('/configs', adminAuth, async (req, res) => {
  try {
    const configs = await DailyRewardConfigV2.find()
      .sort({ version: -1, createdAt: -1 });
    
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('Error listing V2 configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list V2 configurations'
    });
  }
});

router.post('/config', adminAuth, [
  body('version').optional().isInt({ min: 1 }).withMessage('Version must be a positive integer'),
  body('days').isArray({ min: 7, max: 7 }).withMessage('Must provide exactly 7 days'),
  body('days.*.dayNumber').isInt({ min: 1, max: 7 }).withMessage('Day number must be 1-7'),
  body('days.*.rewardType').optional().isIn(['Coins', 'XP', 'Both']).withMessage('Reward type must be Coins, XP, or Both'),
  body('days.*.coinValue').optional().isFloat({ min: 0 }).withMessage('Coin value must be non-negative'),
  body('days.*.xpValue').optional().isFloat({ min: 0 }).withMessage('XP value must be non-negative'),
  body('bigReward.enabled').optional().isBoolean(),
  body('bigReward.rewardType').optional().isIn(['Coins', 'XP', 'Both']),
  body('bigReward.coinValue').optional().isFloat({ min: 0 }),
  body('bigReward.xpValue').optional().isFloat({ min: 0 }),
  body('weeklyMultiplier.enabled').optional().isBoolean(),
  body('weeklyMultiplier.week2').optional().isFloat({ min: 1.0 }),
  body('weeklyMultiplier.week3').optional().isFloat({ min: 1.0 }),
  body('weeklyMultiplier.week4').optional().isFloat({ min: 1.0 }),
  body('weeklyMultiplier.roundingRule').optional().isIn(['Round Nearest', 'Round Down'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { 
      version, 
      days, 
      bigReward, 
      fallbackReward, 
      weeklyMultiplier,
      isActive 
    } = req.body;
    
    if (!days || days.length !== 7) {
      return res.status(400).json({
        success: false,
        error: 'Must provide exactly 7 days'
      });
    }
    
    const dayNumbers = days.map(d => d.dayNumber).sort();
    if (dayNumbers.join(',') !== '1,2,3,4,5,6,7') {
      return res.status(400).json({
        success: false,
        error: 'Must provide exactly days 1-7 with unique dayNumber values'
      });
    }
    
    // Validate each day based on rewardType
    for (const day of days) {
      const rewardType = day.rewardType || 'Both';
      
      if (rewardType === 'Coins' || rewardType === 'Both') {
        const coinValue = day.coinValue !== undefined ? day.coinValue : day.coins;
        if (coinValue === undefined || coinValue === null || coinValue < 0) {
          return res.status(400).json({
            success: false,
            error: `Day ${day.dayNumber}: Coin value is required when reward type is Coins or Both`
          });
        }
      }
      
      if (rewardType === 'XP' || rewardType === 'Both') {
        const xpValue = day.xpValue !== undefined ? day.xpValue : day.xp;
        if (xpValue === undefined || xpValue === null || xpValue < 0) {
          return res.status(400).json({
            success: false,
            error: `Day ${day.dayNumber}: XP value is required when reward type is XP or Both`
          });
        }
      }
    }
    
    // Validate Day-1 when active
    if (isActive !== false) {
      const day1 = days.find(d => d.dayNumber === 1);
      if (!day1 || day1.active === false) {
        return res.status(400).json({
          success: false,
          error: 'Day-1 must be configured and active if Daily Reward V2 is ON'
        });
      }
    }
    
    // Validate Big Reward when enabled
    if (bigReward && bigReward.enabled !== false) {
      const bigRewardType = bigReward.rewardType || 'Both';
      
      if (bigRewardType === 'Coins' || bigRewardType === 'Both') {
        const coinValue = bigReward.coinValue !== undefined ? bigReward.coinValue : bigReward.coins;
        if (coinValue === undefined || coinValue === null || coinValue < 0) {
          return res.status(400).json({
            success: false,
            error: 'Big Reward coin value is required when Big Reward Type is Coins or Both'
          });
        }
      }
      
      if (bigRewardType === 'XP' || bigRewardType === 'Both') {
        const xpValue = bigReward.xpValue !== undefined ? bigReward.xpValue : bigReward.xp;
        if (xpValue === undefined || xpValue === null || xpValue < 0) {
          return res.status(400).json({
            success: false,
            error: 'Big Reward XP value is required when Big Reward Type is XP or Both'
          });
        }
      }
    }
    
    // Validate Weekly Multiplier
    if (weeklyMultiplier && weeklyMultiplier.enabled) {
      if (!weeklyMultiplier.week2 || weeklyMultiplier.week2 < 1.0) {
        return res.status(400).json({
          success: false,
          error: 'Week 2 multiplier is required and must be >= 1.0 when Weekly Multiplier is enabled'
        });
      }
      
      if (!weeklyMultiplier.roundingRule) {
        return res.status(400).json({
          success: false,
          error: 'Rounding rule is required when Weekly Multiplier is enabled'
        });
      }
    }
    
    // Deactivate old configs if setting this as active (V2 scope only)
    if (isActive !== false) {
      await DailyRewardConfigV2.updateMany(
        { isActive: true },
        { $set: { isActive: false } }
      );
    }
    
    const config = new DailyRewardConfigV2({
      version: version || 1,
      days,
      bigReward: bigReward || {},
      fallbackReward: fallbackReward || {},
      weeklyMultiplier: weeklyMultiplier || { enabled: false },
      isActive: isActive !== false,
      updatedBy: req.user.userId
    });
    
    await config.save();
    
    res.status(201).json({
      success: true,
      message: 'V2 configuration saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Error saving V2 config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save V2 configuration',
      message: error.message
    });
  }
});

router.patch('/config/:id/toggle', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfigV2.findById(req.params.id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'V2 configuration not found'
      });
    }
    
    if (!config.isActive) {
      await DailyRewardConfigV2.updateMany(
        { _id: { $ne: config._id }, isActive: true },
        { $set: { isActive: false } }
      );
    }
    
    config.isActive = !config.isActive;
    config.updatedBy = req.user.userId;
    await config.save();
    
    res.json({
      success: true,
      message: `V2 configuration ${config.isActive ? 'activated' : 'deactivated'}`,
      data: {
        id: config._id,
        isActive: config.isActive
      }
    });
  } catch (error) {
    console.error('Error toggling V2 config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle V2 configuration'
    });
  }
});

router.delete('/config/:id', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfigV2.findById(req.params.id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'V2 configuration not found'
      });
    }
    
    if (config.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active V2 configuration. Deactivate it first.'
      });
    }
    
    await config.deleteOne();
    
    res.json({
      success: true,
      message: 'V2 configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting V2 config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete V2 configuration'
    });
  }
});

// Reuse user progress & summary endpoints for analytics (same as V1)

router.get('/users/:userId/week', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const weekKey = getISOWeekKey(date);
    
    const progress = await DailyRewardProgress.findOne({ userId, weekKey });
    
    if (!progress) {
      return res.json({
        success: true,
        data: null,
        message: 'No progress found for this week'
      });
    }
    
    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error getting user week progress V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user progress V2'
    });
  }
});

router.get('/users/:userId/history', adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks = 10 } = req.query;
    
    const history = await DailyRewardProgress.find({ userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting user history V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user history V2'
    });
  }
});

router.get('/summary', adminAuth, async (req, res) => {
  try {
    const weekKey = req.query.weekKey || getISOWeekKey(new Date());
    
    const stats = await DailyRewardProgress.aggregate([
      { $match: { weekKey } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          bigRewardsGranted: {
            $sum: { $cond: ['$bigRewardGranted', 1, 0] }
          },
          perfectWeeks: {
            $sum: { $cond: ['$bigRewardEligible', 1, 0] }
          }
        }
      }
    ]);
    
    const dayStats = await DailyRewardProgress.aggregate([
      { $match: { weekKey } },
      { $unwind: '$days' },
      {
        $group: {
          _id: '$days.dayNumber',
          claimed: {
            $sum: { $cond: [{ $eq: ['$days.status', 'claimed'] }, 1, 0] }
          },
          missed: {
            $sum: { $cond: [{ $eq: ['$days.status', 'missed'] }, 1, 0] }
          },
          totalUsers: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        weekKey,
        overall: stats[0] || { totalUsers: 0, bigRewardsGranted: 0, perfectWeeks: 0 },
        perDay: dayStats
      }
    });
  } catch (error) {
    console.error('Error getting summary V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get summary V2'
    });
  }
});

module.exports = router;



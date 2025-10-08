/**
 * Admin Daily Rewards Routes
 * Manage daily reward configuration and monitor user progress
 * @module routes/admin-daily-rewards
 */

const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const DailyRewardConfig = require('../models/DailyRewardConfig');
const DailyRewardProgress = require('../models/DailyRewardProgress');
const { getISOWeekKey, getWeekBoundsUtc } = require('../utils/dailyRewardHelpers');

// ==================== REWARD CONFIGURATION ====================

/**
 * @route   GET /api/admin/daily-rewards/config
 * @desc    Get active daily reward configuration
 * @access  Admin
 */
router.get('/config', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfig.findOne({ isActive: true })
      .sort({ version: -1 });
    
    if (!config) {
      return res.json({
        success: true,
        data: null,
        message: 'No active configuration found. Please create one.'
      });
    }
    
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting daily reward config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration'
    });
  }
});

/**
 * @route   GET /api/admin/daily-rewards/configs
 * @desc    List all configurations
 * @access  Admin
 */
router.get('/configs', adminAuth, async (req, res) => {
  try {
    const configs = await DailyRewardConfig.find()
      .sort({ version: -1, createdAt: -1 });
    
    res.json({
      success: true,
      data: configs
    });
  } catch (error) {
    console.error('Error listing configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list configurations'
    });
  }
});

/**
 * @route   POST /api/admin/daily-rewards/config
 * @desc    Create or update daily reward configuration
 * @access  Admin
 */
router.post('/config', adminAuth, [
  body('version').optional().isInt({ min: 1 }).withMessage('Version must be a positive integer'),
  body('days').isArray({ min: 7, max: 7 }).withMessage('Must provide exactly 7 days'),
  body('days.*.dayNumber').isInt({ min: 1, max: 7 }).withMessage('Day number must be 1-7'),
  body('days.*.coins').isInt({ min: 0 }).withMessage('Coins must be non-negative'),
  body('days.*.xp').isInt({ min: 0 }).withMessage('XP must be non-negative'),
  body('bigReward.coins').isInt({ min: 0 }).withMessage('Big reward coins must be non-negative'),
  body('bigReward.xp').isInt({ min: 0 }).withMessage('Big reward XP must be non-negative'),
  body('fallbackReward.coins').isInt({ min: 0 }).withMessage('Fallback coins must be non-negative'),
  body('fallbackReward.xp').isInt({ min: 0 }).withMessage('Fallback XP must be non-negative')
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
    
    const { version, days, bigReward, fallbackReward, isActive } = req.body;
    
    // Validate all 7 days are present
    const dayNumbers = days.map(d => d.dayNumber).sort();
    if (dayNumbers.join(',') !== '1,2,3,4,5,6,7') {
      return res.status(400).json({
        success: false,
        error: 'Must provide exactly days 1-7 with unique dayNumber values'
      });
    }
    
    // Deactivate old configs if setting this as active
    if (isActive !== false) {
      await DailyRewardConfig.updateMany(
        { isActive: true },
        { $set: { isActive: false } }
      );
    }
    
    const config = new DailyRewardConfig({
      version: version || 1,
      days,
      bigReward,
      fallbackReward,
      isActive: isActive !== false
    });
    
    await config.save();
    
    res.status(201).json({
      success: true,
      message: 'Configuration saved successfully',
      data: config
    });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save configuration',
      message: error.message
    });
  }
});

/**
 * @route   PATCH /api/admin/daily-rewards/config/:id/toggle
 * @desc    Toggle config active status
 * @access  Admin
 */
router.patch('/config/:id/toggle', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfig.findById(req.params.id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }
    
    // If activating, deactivate others
    if (!config.isActive) {
      await DailyRewardConfig.updateMany(
        { _id: { $ne: config._id }, isActive: true },
        { $set: { isActive: false } }
      );
    }
    
    config.isActive = !config.isActive;
    await config.save();
    
    res.json({
      success: true,
      message: `Configuration ${config.isActive ? 'activated' : 'deactivated'}`,
      data: {
        id: config._id,
        isActive: config.isActive
      }
    });
  } catch (error) {
    console.error('Error toggling config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle configuration'
    });
  }
});

/**
 * @route   DELETE /api/admin/daily-rewards/config/:id
 * @desc    Delete a configuration
 * @access  Admin
 */
router.delete('/config/:id', adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfig.findById(req.params.id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }
    
    if (config.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active configuration. Deactivate it first.'
      });
    }
    
    await config.deleteOne();
    
    res.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete configuration'
    });
  }
});

// ==================== USER PROGRESS MONITORING ====================

/**
 * @route   GET /api/admin/daily-rewards/users/:userId/week
 * @desc    Get user's week progress
 * @access  Admin
 */
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
    console.error('Error getting user week progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user progress'
    });
  }
});

/**
 * @route   GET /api/admin/daily-rewards/users/:userId/history
 * @desc    Get user's complete history
 * @access  Admin
 */
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
    console.error('Error getting user history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user history'
    });
  }
});

/**
 * @route   GET /api/admin/daily-rewards/summary
 * @desc    Get summary statistics for a week
 * @access  Admin
 */
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
    
    // Calculate claim rates per day
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
    console.error('Error getting summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get summary'
    });
  }
});

module.exports = router;


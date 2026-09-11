/**
 * Admin Walkathon Routes
 * Administrative endpoints for walkathon management
 * @module routes/admin-walkathon
 */

const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const mongoose = require('mongoose');

// Models
const Walkathon = require('../models/Walkathon');
const UserWalkathonProgress = require('../models/UserWalkathonProgress');
const StepData = require('../models/StepData');
const User = require('../models/User');

// Services
const walkathonService = require('../services/walkathonService');

// Middleware
const { adminAuth } = require('../middleware/adminAuth');

// ==================== WALKATHON MANAGEMENT ====================

/**
 * @route   GET /api/admin/walkathon/challenges
 * @desc    Get all walkathon challenges with pagination and filters
 * @access  Admin
 */
router.get('/challenges', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['upcoming', 'active', 'completed', 'cancelled']).withMessage('Invalid status'),
  query('weekKey').optional().isString().withMessage('Week key must be a string'),
  query('search').optional().isString().withMessage('Search must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.weekKey) filter.weekKey = req.query.weekKey;
    if (req.query.search) {
      filter.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const walkathons = await Walkathon.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort({ weekStart: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Walkathon.countDocuments(filter);

    res.json({
      success: true,
      data: {
        walkathons: walkathons.map(w => w.getDisplayData()),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting walkathon challenges:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon challenges'
    });
  }
});

/**
 * @route   POST /api/admin/walkathon/challenges
 * @desc    Create a new walkathon challenge
 * @access  Admin
 */
router.post('/challenges', adminAuth, [
  body('title').notEmpty().withMessage('Title is required'),
  body('description').optional().isString(),
  body('weekKey').notEmpty().withMessage('Week key is required'),
  body('weekStart').isISO8601().withMessage('Week start must be a valid date'),
  body('weekEnd').isISO8601().withMessage('Week end must be a valid date'),
  body('rewardTiers').isArray({ min: 1 }).withMessage('At least one reward tier is required'),
  body('rewardTiers.*.stepMilestone').isInt({ min: 0 }).withMessage('Step milestone must be a positive integer'),
  body('rewardTiers.*.xpReward').isInt({ min: 0 }).withMessage('XP reward must be a positive integer'),
  body('rewardTiers.*.coinReward').optional().isInt({ min: 0 }).withMessage('Coin reward must be a positive integer'),
  body('eligibility.countries').optional().isArray(),
  body('eligibility.minXPLevel').optional().isInt({ min: 0 }),
  body('eligibility.maxXPLevel').optional().isInt({ min: 0 }),
  body('maxParticipants').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      title,
      description,
      weekKey,
      weekStart,
      weekEnd,
      rewardTiers,
      eligibility,
      maxParticipants,
      joinDeadline
    } = req.body;

    // Check if walkathon already exists for this week
    const existingWalkathon = await Walkathon.findOne({ weekKey });
    if (existingWalkathon) {
      return res.status(400).json({
        success: false,
        error: 'Walkathon already exists for this week'
      });
    }

    const walkathon = new Walkathon({
      title,
      description,
      weekKey,
      weekStart: new Date(weekStart),
      weekEnd: new Date(weekEnd),
      rewardTiers,
      eligibility: eligibility || {},
      maxParticipants,
      joinDeadline: joinDeadline ? new Date(joinDeadline) : undefined,
      createdBy: req.user.userId,
      status: 'upcoming'
    });

    await walkathon.save();

    res.status(201).json({
      success: true,
      data: {
        message: 'Walkathon created successfully',
        walkathon: walkathon.getDisplayData()
      }
    });
  } catch (error) {
    console.error('Error creating walkathon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create walkathon'
    });
  }
});

/**
 * @route   PUT /api/admin/walkathon/challenges/:id
 * @desc    Update walkathon challenge
 * @access  Admin
 */
router.put('/challenges/:id', adminAuth, [
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('description').optional().isString(),
  body('rewardTiers').optional().isArray({ min: 1 }),
  body('eligibility').optional().isObject(),
  body('maxParticipants').optional().isInt({ min: 1 }),
  body('status').optional().isIn(['upcoming', 'active', 'completed', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const walkathonId = req.params.id;
    const updateData = req.body;

    // Remove fields that shouldn't be updated
    delete updateData.weekKey;
    delete updateData.weekStart;
    delete updateData.weekEnd;
    delete updateData.createdBy;

    const walkathon = await Walkathon.findByIdAndUpdate(
      walkathonId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!walkathon) {
      return res.status(404).json({
        success: false,
        error: 'Walkathon not found'
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Walkathon updated successfully',
        walkathon: walkathon.getDisplayData()
      }
    });
  } catch (error) {
    console.error('Error updating walkathon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update walkathon'
    });
  }
});

/**
 * @route   POST /api/admin/walkathon/challenges/:id/activate
 * @desc    Activate a walkathon whose configured dates include the current time
 * @access  Admin
 */
router.post('/challenges/:id/activate', adminAuth, async (req, res) => {
  try {
    const walkathon = await Walkathon.findById(req.params.id);
    if (!walkathon) {
      return res.status(404).json({
        success: false,
        error: 'Walkathon not found'
      });
    }

    const now = new Date();
    if (now < walkathon.weekStart || now > walkathon.weekEnd) {
      return res.status(400).json({
        success: false,
        error: 'Walkathon dates do not include the current time',
        details: {
          weekStart: walkathon.weekStart,
          weekEnd: walkathon.weekEnd,
          currentTime: now
        }
      });
    }

    await Walkathon.updateMany(
      {
        _id: { $ne: walkathon._id },
        status: 'active'
      },
      { status: 'completed' }
    );

    walkathon.isActive = true;
    walkathon.status = 'active';
    await walkathon.save();

    res.json({
      success: true,
      data: {
        message: 'Walkathon activated successfully',
        walkathon: walkathon.getDisplayData()
      }
    });
  } catch (error) {
    console.error('Error activating walkathon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to activate walkathon'
    });
  }
});

/**
 * @route   DELETE /api/admin/walkathon/challenges/:id
 * @desc    Delete walkathon challenge
 * @access  Admin
 */
router.delete('/challenges/:id', adminAuth, async (req, res) => {
  try {
    const walkathonId = req.params.id;

    const walkathon = await Walkathon.findById(walkathonId);
    if (!walkathon) {
      return res.status(404).json({
        success: false,
        error: 'Walkathon not found'
      });
    }

    // Check if walkathon is active
    if (walkathon.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete active walkathon'
      });
    }

    // Delete related progress records
    await UserWalkathonProgress.deleteMany({ walkathonId });

    await Walkathon.findByIdAndDelete(walkathonId);

    res.json({
      success: true,
      data: {
        message: 'Walkathon deleted successfully'
      }
    });
  } catch (error) {
    console.error('Error deleting walkathon:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete walkathon'
    });
  }
});

// ==================== PARTICIPANTS MANAGEMENT ====================

/**
 * @route   GET /api/admin/walkathon/participants
 * @desc    Get walkathon participants with filters
 * @access  Admin
 */
router.get('/participants', adminAuth, [
  query('weekKey').optional().isString(),
  query('status').optional().isIn(['joined', 'active', 'completed', 'expired', 'withdrawn']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.weekKey) filter.weekKey = req.query.weekKey;
    if (req.query.status) filter.status = req.query.status;

    const participants = await UserWalkathonProgress.find(filter)
      .populate('userId', 'firstName lastName email profile.avatar xp.current vip.level')
      .populate('walkathonId', 'title weekKey')
      .sort({ totalStepsCompleted: -1 })
      .skip(skip)
      .limit(limit);

    const total = await UserWalkathonProgress.countDocuments(filter);

    res.json({
      success: true,
      data: {
        participants: participants.map(p => ({
          id: p._id,
          userId: p.userId._id,
          userName: p.userId.firstName || 'Anonymous',
          userEmail: p.userId.email,
          userAvatar: p.userId.profile?.avatar,
          userXP: p.userId.xp?.current || 0,
          userVIP: p.userId.vip?.level || 'free',
          walkathonTitle: p.walkathonId.title,
          weekKey: p.weekKey,
          totalSteps: p.totalStepsCompleted,
          milestonesReached: p.milestonesReached,
          rewardsClaimed: p.rewardsClaimed,
          totalXPClaimed: p.totalXPClaimed,
          totalCoinsClaimed: p.totalCoinsClaimed,
          status: p.status,
          joinedAt: p.joinedAt,
          lastStepSync: p.lastStepSync
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting walkathon participants:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon participants'
    });
  }
});

// ==================== STATISTICS ====================

/**
 * @route   GET /api/admin/walkathon/stats
 * @desc    Get walkathon statistics
 * @access  Admin
 */
router.get('/stats', adminAuth, [
  query('weekKey').optional().isString(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req, res) => {
  try {
    const { weekKey, startDate, endDate } = req.query;

    let stats = {};

    if (weekKey) {
      // Get stats for specific week
      stats = await walkathonService.getWalkathonStats(weekKey);
    } else {
      // Get overall stats
      const totalWalkathons = await Walkathon.countDocuments();
      const activeWalkathons = await Walkathon.countDocuments({ status: 'active' });
      const totalParticipants = await UserWalkathonProgress.countDocuments();
      const totalSteps = await StepData.aggregate([
        { $group: { _id: null, totalSteps: { $sum: '$steps' } } }
      ]);

      stats = {
        hasStats: true,
        overall: {
          totalWalkathons,
          activeWalkathons,
          totalParticipants,
          totalSteps: totalSteps.length > 0 ? totalSteps[0].totalSteps : 0
        }
      };
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting walkathon stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon stats'
    });
  }
});

// ==================== MANUAL ACTIONS ====================

/**
 * @route   POST /api/admin/walkathon/sync-lifecycle
 * @desc    Create/activate the current walkathon and prepare the next week
 * @access  Admin
 */
router.post('/sync-lifecycle', adminAuth, async (req, res) => {
  try {
    const result = await walkathonService.syncWalkathonLifecycle();
    res.json({
      success: true,
      data: {
        message: 'Walkathon lifecycle synchronized successfully',
        ...result
      }
    });
  } catch (error) {
    console.error('Error synchronizing walkathon lifecycle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to synchronize walkathon lifecycle'
    });
  }
});

/**
 * @route   POST /api/admin/walkathon/reset-weekly
 * @desc    Manually trigger weekly walkathon reset
 * @access  Admin
 */
router.post('/reset-weekly', adminAuth, async (req, res) => {
  try {
    const walkathonScheduler = require('../utils/walkathonScheduler');
    const result = await walkathonScheduler.triggerWeeklyReset();

    res.json({
      success: true,
      data: {
        message: 'Weekly walkathon reset triggered successfully',
        result
      }
    });
  } catch (error) {
    console.error('Error triggering weekly reset:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger weekly reset'
    });
  }
});

/**
 * @route   POST /api/admin/walkathon/update-leaderboard
 * @desc    Manually trigger step leaderboard update
 * @access  Admin
 */
router.post('/update-leaderboard', adminAuth, async (req, res) => {
  try {
    const walkathonScheduler = require('../utils/walkathonScheduler');
    const result = await walkathonScheduler.triggerStepLeaderboardUpdate();

    res.json({
      success: true,
      data: {
        message: 'Step leaderboard update triggered successfully',
        result
      }
    });
  } catch (error) {
    console.error('Error triggering leaderboard update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger leaderboard update'
    });
  }
});

/**
 * @route   GET /api/admin/walkathon/scheduler-status
 * @desc    Get walkathon scheduler status
 * @access  Admin
 */
router.get('/scheduler-status', adminAuth, async (req, res) => {
  try {
    const walkathonScheduler = require('../utils/walkathonScheduler');
    const status = walkathonScheduler.getSchedulerStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status'
    });
  }
});

module.exports = router;



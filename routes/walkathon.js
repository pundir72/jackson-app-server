/**
 * Walkathon Routes
 * API endpoints for walkathon functionality
 * @module routes/walkathon
 */

const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Middleware
const protect = require('../middleware/auth');
const walkathonService = require('../services/walkathonService');

// Rate limiting for step sync
const stepSyncLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 step syncs per 15 minutes
  message: {
    success: false,
    error: 'Too many step sync requests, please try again later'
  }
});

// Validation middleware
const validateStepData = [
  body('steps')
    .isInt({ min: 0, max: 100000 })
    .withMessage('Steps must be a number between 0 and 100,000'),
  body('date')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date'),
  body('source')
    .optional()
    .isIn(['healthkit', 'manual', 'imported'])
    .withMessage('Source must be healthkit, manual, or imported')
];

const validateMilestone = [
  body('milestone')
    .isInt({ min: 0 })
    .withMessage('Milestone must be a positive integer')
];

// ==================== WALKATHON STATUS ====================

/**
 * @route   GET /api/walkathon/status
 * @desc    Get current walkathon status and user eligibility
 * @access  Private
 */
router.get('/status', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Get current walkathon
    const currentWalkathon = await walkathonService.getCurrentWalkathon();
    const upcomingWalkathon = await walkathonService.getUpcomingWalkathon();
    
    if (!currentWalkathon) {
      return res.json({
        success: true,
        data: {
          hasActiveWalkathon: false,
          message: 'No active walkathon found',
          upcomingWalkathon: upcomingWalkathon ? upcomingWalkathon.getDisplayData() : null
        }
      });
    }

    // Check user eligibility
    const eligibility = await walkathonService.checkUserEligibility(userId);
    
    // Get user's current progress if they've joined
    let userProgress = null;
    try {
      const progress = await walkathonService.getUserProgress(userId);
      if (progress.hasProgress) {
        userProgress = progress;
      }
    } catch (error) {
      // User hasn't joined yet, that's okay
    }

    res.json({
      success: true,
      data: {
        hasActiveWalkathon: true,
        walkathon: currentWalkathon.getDisplayData(),
        eligibility,
        userProgress,
        upcomingWalkathon: upcomingWalkathon ? upcomingWalkathon.getDisplayData() : null
      }
    });
  } catch (error) {
    console.error('Error getting walkathon status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon status'
    });
  }
});

// ==================== JOIN WALKATHON ====================

/**
 * @route   POST /api/walkathon/join
 * @desc    Join current walkathon
 * @access  Private
 */
router.post('/join', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const result = await walkathonService.joinWalkathon(userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error joining walkathon:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to join walkathon'
    });
  }
});

// ==================== SYNC STEP DATA ====================

/**
 * @route   POST /api/walkathon/sync-steps
 * @desc    Sync step data from HealthKit or manual input
 * @access  Private
 */
router.post('/sync-steps', stepSyncLimiter, protect, validateStepData, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.userId;
    const { steps, date, source = 'healthkit', deviceInfo, healthKitData } = req.body;
    
    const result = await walkathonService.syncStepData(userId, steps, date, {
      source,
      deviceInfo,
      healthKitData
    });
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error syncing step data:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to sync step data'
    });
  }
});

// ==================== GET PROGRESS ====================

/**
 * @route   GET /api/walkathon/progress
 * @desc    Get user's walkathon progress
 * @query   {string} weekKey - Week key (optional)
 * @access  Private
 */
router.get('/progress', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { weekKey } = req.query;
    
    const result = await walkathonService.getUserProgress(userId, weekKey);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting user progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user progress'
    });
  }
});

// ==================== CLAIM REWARD ====================

/**
 * @route   POST /api/walkathon/claim-reward
 * @desc    Claim reward for reaching a milestone
 * @access  Private
 */
router.post('/claim-reward', protect, validateMilestone, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.userId;
    const { milestone } = req.body;
    
    const result = await walkathonService.claimReward(userId, milestone);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error claiming reward:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to claim reward'
    });
  }
});

// ==================== LEADERBOARD ====================

/**
 * @route   GET /api/walkathon/leaderboard
 * @desc    Get walkathon leaderboard
 * @query   {string} weekKey - Week key (optional)
 * @query   {number} limit - Number of entries (default: 100)
 * @access  Private
 */
router.get('/leaderboard', protect, [
  query('weekKey').optional().isString().withMessage('Week key must be a string'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000')
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

    const { weekKey, limit = 100 } = req.query;
    
    const result = await walkathonService.getWalkathonLeaderboard(weekKey, parseInt(limit));
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting walkathon leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon leaderboard'
    });
  }
});

// ==================== USER RANK ====================

/**
 * @route   GET /api/walkathon/rank
 * @desc    Get user's rank in walkathon
 * @query   {string} weekKey - Week key (optional)
 * @access  Private
 */
router.get('/rank', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { weekKey } = req.query;
    
    const result = await walkathonService.getUserRank(userId, weekKey);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting user rank:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user rank'
    });
  }
});

// ==================== WALKATHON STATS ====================

/**
 * @route   GET /api/walkathon/stats
 * @desc    Get walkathon statistics
 * @query   {string} weekKey - Week key (optional)
 * @access  Private
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const { weekKey } = req.query;
    
    const result = await walkathonService.getWalkathonStats(weekKey);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting walkathon stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get walkathon stats'
    });
  }
});

// ==================== BULK STEP SYNC ====================

/**
 * @route   POST /api/walkathon/bulk-sync-steps
 * @desc    Sync multiple days of step data
 * @access  Private
 */
router.post('/bulk-sync-steps', stepSyncLimiter, protect, [
  body('stepsData')
    .isArray({ min: 1, max: 30 })
    .withMessage('Steps data must be an array with 1-30 entries'),
  body('stepsData.*.steps')
    .isInt({ min: 0, max: 100000 })
    .withMessage('Each step count must be between 0 and 100,000'),
  body('stepsData.*.date')
    .isISO8601()
    .withMessage('Each date must be a valid ISO 8601 date')
], async (req, res) => {
  try {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const userId = req.user.userId;
    const { stepsData, source = 'healthkit', deviceInfo } = req.body;
    
    const results = [];
     errors = [];
    
    // Process each step data entry
    for (const stepEntry of stepsData) {
      try {
        const result = await walkathonService.syncStepData(
          userId, 
          stepEntry.steps, 
          stepEntry.date, 
          { source, deviceInfo }
        );
        results.push(result);
      } catch (error) {
        errors.push({
          date: stepEntry.date,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      data: {
        processed: results.length,
        errors: errors.length,
        results,
        errors
      }
    });
  } catch (error) {
    console.error('Error bulk syncing step data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk sync step data'
    });
  }
});

// ==================== HEALTH CHECK ====================

/**
 * @route   GET /api/walkathon/health
 * @desc    Health check for walkathon service
 * @access  Private
 */
router.get('/health', protect, async (req, res) => {
  try {
    const currentWalkathon = await walkathonService.getCurrentWalkathon();
    const upcomingWalkathon = await walkathonService.getUpcomingWalkathon();
    
    res.json({
      success: true,
      data: {
        service: 'walkathon',
        status: 'healthy',
        currentWalkathon: currentWalkathon ? currentWalkathon.weekKey : null,
        upcomingWalkathon: upcomingWalkathon ? upcomingWalkathon.weekKey : null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in walkathon health check:', error);
    res.status(500).json({
      success: false,
      error: 'Walkathon service health check failed'
    });
  }
});

module.exports = router;



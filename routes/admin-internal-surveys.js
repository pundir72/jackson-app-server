const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const InternalSurvey = require('../models/InternalSurvey');
const UserSurveyProgress = require('../models/UserSurveyProgress');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// ==================== SURVEY MANAGEMENT ====================

/**
 * @route   GET /api/admin/internal-surveys
 * @desc    Get all internal surveys with filtering and pagination
 * @access  Private (Admin)
 */
router.get('/', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['draft', 'active', 'paused', 'completed', 'expired']).withMessage('Invalid status'),
  query('category').optional().isString().withMessage('Category must be a string'),
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

    const { page = 1, limit = 20, status, category, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [surveys, total] = await Promise.all([
      InternalSurvey.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      InternalSurvey.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        surveys: surveys.map(survey => survey.getDisplayData ? survey.getDisplayData() : survey),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting internal surveys:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get internal surveys'
    });
  }
});

/**
 * @route   GET /api/admin/internal-surveys/:id
 * @desc    Get single internal survey by ID
 * @access  Private (Admin)
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const survey = await InternalSurvey.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    res.json({
      success: true,
      data: survey.getDisplayData()
    });
  } catch (error) {
    console.error('Error getting internal survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get internal survey'
    });
  }
});

/**
 * @route   POST /api/admin/internal-surveys
 * @desc    Create new internal survey
 * @access  Private (Admin)
 */
router.post('/', adminAuth, [
  body('title').notEmpty().withMessage('Title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('category').isIn(['finance', 'shopping', 'entertainment', 'technology', 'health', 'travel', 'education', 'gaming', 'lifestyle', 'other']).withMessage('Invalid category'),
  body('difficulty').isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty'),
  body('estimatedTime').isInt({ min: 1 }).withMessage('Estimated time must be a positive integer'),
  body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
  body('questions.*.text').notEmpty().withMessage('Question text is required'),
  body('questions.*.type').isIn(['multiple_choice', 'text', 'rating', 'yes_no', 'multiple_select']).withMessage('Invalid question type'),
  body('reward.coins').isInt({ min: 0 }).withMessage('Coin reward must be non-negative'),
  body('reward.xp').isInt({ min: 0 }).withMessage('XP reward must be non-negative'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required')
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

    const surveyData = {
      ...req.body,
      createdBy: req.user.userId,
      questions: req.body.questions.map((q, index) => ({
        ...q,
        id: q.id || `q${index + 1}`,
        order: q.order || index
      }))
    };

    const survey = new InternalSurvey(surveyData);
    await survey.save();

    res.status(201).json({
      success: true,
      data: survey.getDisplayData(),
      message: 'Survey created successfully'
    });
  } catch (error) {
    console.error('Error creating internal survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create internal survey'
    });
  }
});

/**
 * @route   PUT /api/admin/internal-surveys/:id
 * @desc    Update internal survey
 * @access  Private (Admin)
 */
router.put('/:id', adminAuth, [
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('category').optional().isIn(['finance', 'shopping', 'entertainment', 'technology', 'health', 'travel', 'education', 'gaming', 'lifestyle', 'other']).withMessage('Invalid category'),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty'),
  body('estimatedTime').optional().isInt({ min: 1 }).withMessage('Estimated time must be a positive integer'),
  body('status').optional().isIn(['draft', 'active', 'paused', 'completed', 'expired']).withMessage('Invalid status'),
  body('reward.coins').optional().isInt({ min: 0 }).withMessage('Coin reward must be non-negative'),
  body('reward.xp').optional().isInt({ min: 0 }).withMessage('XP reward must be non-negative')
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

    const survey = await InternalSurvey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    // Update survey
    Object.assign(survey, req.body);
    survey.updatedBy = req.user.userId;
    await survey.save();

    res.json({
      success: true,
      data: survey.getDisplayData(),
      message: 'Survey updated successfully'
    });
  } catch (error) {
    console.error('Error updating internal survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update internal survey'
    });
  }
});

/**
 * @route   DELETE /api/admin/internal-surveys/:id
 * @desc    Delete internal survey
 * @access  Private (Admin)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const survey = await InternalSurvey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    // Check if survey has participants
    const participantCount = await UserSurveyProgress.countDocuments({ surveyId: survey._id });
    if (participantCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete survey with existing participants'
      });
    }

    await InternalSurvey.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Survey deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting internal survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete internal survey'
    });
  }
});

// ==================== SURVEY ANALYTICS ====================

/**
 * @route   GET /api/admin/internal-surveys/:id/analytics
 * @desc    Get survey analytics
 * @access  Private (Admin)
 */
router.get('/:id/analytics', adminAuth, async (req, res) => {
  try {
    const survey = await InternalSurvey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    // Get detailed analytics
    const stats = await UserSurveyProgress.getSurveyStats(req.params.id);
    const participants = await UserSurveyProgress.find({ surveyId: req.params.id })
      .populate('userId', 'firstName lastName email')
      .sort({ startedAt: -1 });

    const analytics = {
      survey: survey.getDisplayData(),
      overview: {
        totalViews: survey.analytics.views,
        totalStarts: survey.analytics.starts,
        totalCompletions: survey.analytics.completions,
        totalAbandonments: survey.analytics.abandonment,
        conversionRate: survey.analytics.conversionRate,
        avgCompletionTime: survey.analytics.avgCompletionTime,
        totalRewardsGiven: survey.analytics.totalRewardsGiven
      },
      statusBreakdown: stats,
      recentParticipants: participants.slice(0, 10),
      totalParticipants: participants.length
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting survey analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey analytics'
    });
  }
});

/**
 * @route   GET /api/admin/internal-surveys/:id/participants
 * @desc    Get survey participants
 * @access  Private (Admin)
 */
router.get('/:id/participants', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['started', 'in_progress', 'completed', 'abandoned', 'expired']).withMessage('Invalid status')
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

    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = { surveyId: req.params.id };
    if (status) query.status = status;

    const [participants, total] = await Promise.all([
      UserSurveyProgress.find(query)
        .populate('userId', 'firstName lastName email')
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      UserSurveyProgress.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        participants,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting survey participants:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey participants'
    });
  }
});

module.exports = router;



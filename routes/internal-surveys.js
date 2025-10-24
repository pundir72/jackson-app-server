const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');
const auth = require('../middleware/auth');
const InternalSurvey = require('../models/InternalSurvey');
const UserSurveyProgress = require('../models/UserSurveyProgress');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');

// ==================== SURVEY DISCOVERY ====================

/**
 * @route   GET /api/internal-surveys/available
 * @desc    Get available surveys for user
 * @access  Private
 */
router.get('/available', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user profile for eligibility
    const userProfile = {
      country: user.country,
      age: user.age,
      xpLevel: user.xpLevel,
      gender: user.gender,
      deviceType: req.headers['user-agent']?.includes('iPhone') ? 'ios' : 'android'
    };

    // Get eligible surveys
    const surveys = await InternalSurvey.getSurveysForUser(userProfile);
    
    // Filter out surveys user has already completed
    const completedSurveyIds = await UserSurveyProgress.find({
      userId: req.user.userId,
      status: 'completed'
    }).distinct('surveyId');

    const availableSurveys = surveys.filter(survey => 
      !completedSurveyIds.includes(survey._id.toString())
    );

    // Format survey data for display
    const surveyCards = availableSurveys.map(survey => ({
      id: survey._id,
      title: survey.title,
      description: survey.description,
      category: survey.category,
      difficulty: survey.difficulty,
      estimatedTime: survey.estimatedTime,
      reward: survey.reward,
      eligibility: survey.eligibility,
      displaySettings: survey.displaySettings,
      metadata: {
        tags: survey.metadata.tags,
        thumbnail: survey.metadata.thumbnail,
        instructions: survey.metadata.instructions
      },
      isCurrentlyActive: survey.isCurrentlyActive
    }));

    res.json({
      success: true,
      data: {
        surveys: surveyCards,
        total: surveyCards.length,
        userProfile
      }
    });
  } catch (error) {
    console.error('Error getting available surveys:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get available surveys'
    });
  }
});

/**
 * @route   GET /api/internal-surveys/:id/details
 * @desc    Get survey details
 * @access  Private
 */
router.get('/:id/details', auth, async (req, res) => {
  try {
    const survey = await InternalSurvey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    // Check if survey is active
    if (!survey.isCurrentlyActive) {
      return res.status(400).json({
        success: false,
        error: 'Survey is not currently active'
      });
    }

    // Get user profile for eligibility check
    const user = await User.findById(req.user.userId);
    const userProfile = {
      country: user.country,
      age: user.age,
      xpLevel: user.xpLevel,
      gender: user.gender,
      deviceType: req.headers['user-agent']?.includes('iPhone') ? 'ios' : 'android'
    };

    const eligibilityCheck = survey.checkUserEligibility(userProfile);
    if (!eligibilityCheck.eligible) {
      return res.status(403).json({
        success: false,
        error: eligibilityCheck.reason
      });
    }

    // Check if user has already completed this survey
    const existingProgress = await UserSurveyProgress.findOne({
      userId: req.user.userId,
      surveyId: survey._id,
      status: 'completed'
    });

    if (existingProgress) {
      return res.status(400).json({
        success: false,
        error: 'Survey already completed'
      });
    }

    res.json({
      success: true,
      data: {
        id: survey._id,
        title: survey.title,
        description: survey.description,
        category: survey.category,
        difficulty: survey.difficulty,
        estimatedTime: survey.estimatedTime,
        reward: survey.reward,
        questions: survey.questions,
        displaySettings: survey.displaySettings,
        metadata: survey.metadata,
        eligibility: survey.eligibility
      }
    });
  } catch (error) {
    console.error('Error getting survey details:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey details'
    });
  }
});

// ==================== SURVEY INTERACTION ====================

/**
 * @route   POST /api/internal-surveys/:id/start
 * @desc    Start a survey
 * @access  Private
 */
router.post('/:id/start', auth, async (req, res) => {
  try {
    const survey = await InternalSurvey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({
        success: false,
        error: 'Survey not found'
      });
    }

    // Check if survey is active
    if (!survey.isCurrentlyActive) {
      return res.status(400).json({
        success: false,
        error: 'Survey is not currently active'
      });
    }

    // Check if user has already started this survey
    const existingProgress = await UserSurveyProgress.findOne({
      userId: req.user.userId,
      surveyId: survey._id
    });

    if (existingProgress) {
      if (existingProgress.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Survey already completed'
        });
      }
      
      // Return existing progress
      return res.json({
        success: true,
        data: {
          sessionId: existingProgress.sessionData.sessionId,
          progress: existingProgress.getProgressData(),
          survey: {
            id: survey._id,
            title: survey.title,
            questions: survey.questions
          }
        }
      });
    }

    // Create new survey progress
    const sessionId = uuidv4();
    const progress = new UserSurveyProgress({
      userId: req.user.userId,
      surveyId: survey._id,
      status: 'started',
      progress: {
        currentQuestion: 0,
        totalQuestions: survey.questions.length,
        completionPercentage: 0
      },
      sessionData: {
        sessionId,
        deviceInfo: req.body.deviceInfo || {},
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip
      },
      metadata: {
        completionSource: req.body.source || 'web',
        userProfile: {
          country: req.user.country,
          age: req.user.age,
          xpLevel: req.user.xpLevel
        }
      }
    });

    await progress.save();

    // Update survey analytics
    await survey.incrementStart();

    res.json({
      success: true,
      data: {
        sessionId,
        progress: progress.getProgressData(),
        survey: {
          id: survey._id,
          title: survey.title,
          questions: survey.questions
        }
      }
    });
  } catch (error) {
    console.error('Error starting survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start survey'
    });
  }
});

/**
 * @route   POST /api/internal-surveys/:id/answer
 * @desc    Submit answer to survey question
 * @access  Private
 */
router.post('/:id/answer', auth, [
  body('questionId').notEmpty().withMessage('Question ID is required'),
  body('answer').notEmpty().withMessage('Answer is required'),
  body('sessionId').notEmpty().withMessage('Session ID is required')
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

    const { questionId, answer, sessionId } = req.body;

    // Find survey progress
    const progress = await UserSurveyProgress.findOne({
      userId: req.user.userId,
      surveyId: req.params.id,
      'sessionData.sessionId': sessionId
    });

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Survey session not found'
      });
    }

    if (progress.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Survey already completed'
      });
    }

    // Update progress with answer
    progress.updateProgress(questionId, answer);
    progress.status = 'in_progress';
    await progress.save();

    res.json({
      success: true,
      data: {
        progress: progress.getProgressData(),
        nextQuestion: progress.progress.currentQuestion < progress.progress.totalQuestions ? 
          progress.progress.currentQuestion + 1 : null
      }
    });
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit answer'
    });
  }
});

/**
 * @route   POST /api/internal-surveys/:id/complete
 * @desc    Complete survey and claim rewards
 * @access  Private
 */
router.post('/:id/complete', auth, [
  body('sessionId').notEmpty().withMessage('Session ID is required')
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

    const { sessionId } = req.body;

    // Find survey progress
    const progress = await UserSurveyProgress.findOne({
      userId: req.user.userId,
      surveyId: req.params.id,
      'sessionData.sessionId': sessionId
    }).populate('surveyId');

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Survey session not found'
      });
    }

    if (progress.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Survey already completed'
      });
    }

    // Complete the survey
    progress.completeSurvey();
    progress.setReward(progress.surveyId.reward.coins, progress.surveyId.reward.xp);
    await progress.save();

    // Update survey analytics
    await progress.surveyId.incrementCompletion();

    // Credit rewards to user
    const user = await User.findById(req.user.userId);
    if (user) {
      user.coins += progress.reward.coins;
      user.xp.current += progress.reward.xp;
      user.xp.total += progress.reward.xp;
      await user.save();

      // Create transaction record
      const transaction = new Transaction({
        userId: req.user.userId,
        type: 'survey_reward',
        amount: progress.reward.coins,
        xp: progress.reward.xp,
        description: `Survey completion reward: ${progress.surveyId.title}`,
        metadata: {
          surveyId: progress.surveyId._id,
          sessionId: sessionId,
          surveyTitle: progress.surveyId.title
        }
      });
      await transaction.save();
    }

    res.json({
      success: true,
      data: {
        progress: progress.getProgressData(),
        rewards: {
          coins: progress.reward.coins,
          xp: progress.reward.xp
        },
        completionMessage: progress.surveyId.metadata.completionMessage
      }
    });
  } catch (error) {
    console.error('Error completing survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to complete survey'
    });
  }
});

/**
 * @route   POST /api/internal-surveys/:id/abandon
 * @desc    Abandon survey
 * @access  Private
 */
router.post('/:id/abandon', auth, [
  body('sessionId').notEmpty().withMessage('Session ID is required')
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

    const { sessionId } = req.body;

    // Find survey progress
    const progress = await UserSurveyProgress.findOne({
      userId: req.user.userId,
      surveyId: req.params.id,
      'sessionData.sessionId': sessionId
    });

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Survey session not found'
      });
    }

    if (progress.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Survey already completed'
      });
    }

    // Abandon the survey
    progress.abandonSurvey();
    await progress.save();

    // Update survey analytics
    const survey = await InternalSurvey.findById(req.params.id);
    await survey.incrementAbandonment();

    res.json({
      success: true,
      data: {
        progress: progress.getProgressData()
      }
    });
  } catch (error) {
    console.error('Error abandoning survey:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to abandon survey'
    });
  }
});

// ==================== SURVEY PROGRESS ====================

/**
 * @route   GET /api/internal-surveys/progress
 * @desc    Get user's survey progress
 * @access  Private
 */
router.get('/progress', auth, async (req, res) => {
  try {
    const progress = await UserSurveyProgress.getUserSurveys(req.user.userId);
    
    res.json({
      success: true,
      data: {
        surveys: progress.map(p => ({
          id: p._id,
          surveyId: p.surveyId,
          status: p.status,
          startedAt: p.startedAt,
          completedAt: p.completedAt,
          progress: p.progress,
          reward: p.reward,
          survey: p.surveyId
        }))
      }
    });
  } catch (error) {
    console.error('Error getting survey progress:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey progress'
    });
  }
});

/**
 * @route   GET /api/internal-surveys/:id/progress
 * @desc    Get specific survey progress
 * @access  Private
 */
router.get('/:id/progress', auth, async (req, res) => {
  try {
    const progress = await UserSurveyProgress.getUserProgress(req.user.userId, req.params.id);
    
    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Survey progress not found'
      });
    }

    res.json({
      success: true,
      data: progress.getProgressData()
    });
  } catch (error) {
    console.error('Error getting survey progress:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey progress'
    });
  }
});

/**
 * @route   GET /api/internal-surveys/completed
 * @desc    Get user's completed surveys
 * @access  Private
 */
router.get('/completed', auth, async (req, res) => {
  try {
    const completedSurveys = await UserSurveyProgress.getCompletedSurveys(req.user.userId);
    
    res.json({
      success: true,
      data: {
        surveys: completedSurveys.map(p => ({
          id: p._id,
          survey: p.surveyId,
          completedAt: p.completedAt,
          reward: p.reward,
          analytics: p.analytics
        }))
      }
    });
  } catch (error) {
    console.error('Error getting completed surveys:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get completed surveys'
    });
  }
});

module.exports = router;



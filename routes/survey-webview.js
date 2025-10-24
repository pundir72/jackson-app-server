const express = require('express');
const router = express.Router();
const { param, query, body } = require('express-validator');
const auth = require('../middleware/auth');
const InternalSurvey = require('../models/InternalSurvey');
const UserSurveyProgress = require('../models/UserSurveyProgress');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');

// ==================== WEBVIEW INTEGRATION ====================

/**
 * @route   GET /api/survey-webview/:id
 * @desc    Get survey for WebView display
 * @access  Private
 */
router.get('/:id', auth, [
  param('id').isMongoId().withMessage('Invalid survey ID'),
  query('sessionId').optional().isUUID().withMessage('Invalid session ID')
], async (req, res) => {
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

    // Get or create session
    let sessionId = req.query.sessionId;
    let progress = null;

    if (sessionId) {
      progress = await UserSurveyProgress.findOne({
        userId: req.user.userId,
        surveyId: survey._id,
        'sessionData.sessionId': sessionId
      });
    }

    if (!progress) {
      // Create new session
      sessionId = uuidv4();
      progress = new UserSurveyProgress({
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
          completionSource: 'webview',
          userProfile: {
            country: user.country,
            age: user.age,
            xpLevel: user.xpLevel
          }
        }
      });

      await progress.save();

      // Update survey analytics
      await survey.incrementStart();
    }

    // Format survey for WebView
    const webviewData = {
      survey: {
        id: survey._id,
        title: survey.title,
        description: survey.description,
        category: survey.category,
        difficulty: survey.difficulty,
        estimatedTime: survey.estimatedTime,
        reward: survey.reward,
        questions: survey.questions,
        displaySettings: survey.displaySettings,
        metadata: survey.metadata
      },
      session: {
        sessionId: progress.sessionData.sessionId,
        progress: progress.getProgressData(),
        userProfile
      },
      config: {
        allowPartialCompletion: survey.displaySettings.allowPartialCompletion,
        showProgress: survey.displaySettings.showProgress,
        requireAllQuestions: survey.displaySettings.requireAllQuestions
      }
    };

    res.json({
      success: true,
      data: webviewData
    });
  } catch (error) {
    console.error('Error getting survey for WebView:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey for WebView'
    });
  }
});

/**
 * @route   POST /api/survey-webview/:id/submit
 * @desc    Submit survey answers from WebView
 * @access  Private
 */
router.post('/:id/submit', auth, [
  param('id').isMongoId().withMessage('Invalid survey ID'),
  body('sessionId').notEmpty().withMessage('Session ID is required'),
  body('answers').isArray().withMessage('Answers must be an array')
], async (req, res) => {
  try {
    const { sessionId, answers } = req.body;

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

    // Update progress with all answers
    answers.forEach(answer => {
      progress.updateProgress(answer.questionId, answer.answer);
    });

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
    console.error('Error submitting survey from WebView:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit survey'
    });
  }
});

/**
 * @route   GET /api/survey-webview/:id/status
 * @desc    Get survey status for WebView
 * @access  Private
 */
router.get('/:id/status', auth, [
  param('id').isMongoId().withMessage('Invalid survey ID'),
  query('sessionId').notEmpty().withMessage('Session ID is required')
], async (req, res) => {
  try {
    const { sessionId } = req.query;

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

    res.json({
      success: true,
      data: {
        status: progress.status,
        progress: progress.getProgressData(),
        isCompleted: progress.isCompleted,
        isExpired: progress.isExpired
      }
    });
  } catch (error) {
    console.error('Error getting survey status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get survey status'
    });
  }
});

module.exports = router;



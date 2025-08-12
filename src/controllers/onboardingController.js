const UserPreference = require('../models/UserPreference');
const User = require('../models/User');
const MasterData = require('../models/MasterData');
const { successResponse, errorResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// Temporary in-memory storage for anonymous onboarding (will be linked to user during registration)
const anonymousOnboardingData = new Map();

// Complete an onboarding step
const completeOnboardingStep = async (req, res) => {
  try {
    const { step, data } = req.body;
    
    // Generate a simple session ID for anonymous users
    const sessionId = req.headers['x-session-id'] || `anon_${Date.now()}`;
    
    // Get or create session data
    if (!anonymousOnboardingData.has(sessionId)) {
      anonymousOnboardingData.set(sessionId, {
        steps: [],
        preferences: {}
      });
    }
    
    const sessionData = anonymousOnboardingData.get(sessionId);
    
    // Add step to completed steps
    if (!sessionData.steps.includes(step)) {
      sessionData.steps.push(step);
    }
    
    // Store step data
    if (data) {
      sessionData.preferences[step] = data;
    }
    
    // Set response header for frontend to use
    res.set('X-Session-ID', sessionId);
    
    logger.info(`Onboarding step completed: ${step} for session: ${sessionId}`);

    res.json(successResponse({
      step,
      sessionId,
      completedSteps: sessionData.steps,
      isCompleted: sessionData.steps.length >= 5 // Basic completion check
    }, 'Step completed successfully'));

  } catch (error) {
    logger.error('Complete onboarding step error:', error);
    res.status(500).json(errorResponse('Failed to complete onboarding step', 500));
  }
};

// Get onboarding progress
const getOnboardingProgress = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !anonymousOnboardingData.has(sessionId)) {
      return res.json(successResponse({
        progress: 0,
        completedSteps: [],
        totalSteps: 5,
        currentStep: 'welcome',
        isCompleted: false
      }, 'No onboarding progress found'));
    }

    const sessionData = anonymousOnboardingData.get(sessionId);
    const progress = Math.round((sessionData.steps.length / 5) * 100);
    
    res.json(successResponse({
      progress,
      completedSteps: sessionData.steps,
      preferences: sessionData.preferences
    }, 'Onboarding progress retrieved successfully'));

  } catch (error) {
    logger.error('Get onboarding progress error:', error);
    res.status(500).json(errorResponse('Failed to get onboarding progress', 500));
  }
};

// Save all onboarding preferences
const saveOnboardingPreferences = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !anonymousOnboardingData.has(sessionId)) {
      return res.status(400).json(errorResponse('No active onboarding session', 400));
    }

    const sessionData = anonymousOnboardingData.get(sessionId);
    
    // Mark as completed
    sessionData.isCompleted = true;
    
    logger.info(`Onboarding completed for session: ${sessionId}`);

    res.json(successResponse({
      sessionId,
      preferences: sessionData.preferences,
      isCompleted: true
    }, 'Onboarding preferences saved successfully'));

  } catch (error) {
    logger.error('Save onboarding preferences error:', error);
    res.status(500).json(errorResponse('Failed to save onboarding preferences', 500));
  }
};

// Resume onboarding from where user left off
const resumeOnboarding = async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !anonymousOnboardingData.has(sessionId)) {
      return res.json(successResponse({
        currentStep: 'welcome',
        progress: 0,
        isCompleted: false
      }, 'Starting new onboarding'));
    }

    const sessionData = anonymousOnboardingData.get(sessionId);
    
    if (sessionData.isCompleted) {
      return res.json(successResponse({
        currentStep: 'completed',
        progress: 100,
        isCompleted: true
      }, 'Onboarding already completed'));
    }

    const progress = Math.round((sessionData.steps.length / 5) * 100);
    
    res.json(successResponse({
      currentStep: sessionData.steps[sessionData.steps.length - 1] || 'welcome',
      progress,
      completedSteps: sessionData.steps,
      isCompleted: false
    }, 'Onboarding resumed successfully'));

  } catch (error) {
    logger.error('Resume onboarding error:', error);
    res.status(500).json(errorResponse('Failed to resume onboarding', 500));
  }
};

// Get onboarding options from master data
const getOnboardingOptions = async (req, res) => {
  try {
    const categories = [
      'age_ranges',
      'genders',
      'primary_goals',
      'improvement_areas',
      'game_preferences',
      'game_styles',
      'player_types',
      'daily_earning_goals'
    ];

    const options = {};
    
    for (const category of categories) {
      const data = await MasterData.findByCategory(category);
      if (data) {
        options[category] = data.getActiveData();
      }
    }

    logger.info('Onboarding options retrieved successfully');

    res.json(successResponse(options, 'Onboarding options retrieved successfully'));

  } catch (error) {
    logger.error('Get onboarding options error:', error);
    res.status(500).json(errorResponse('Failed to get onboarding options', 500));
  }
};

module.exports = {
  completeOnboardingStep,
  getOnboardingProgress,
  saveOnboardingPreferences,
  resumeOnboarding,
  getOnboardingOptions
}; 
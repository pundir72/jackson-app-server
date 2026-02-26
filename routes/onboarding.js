const express = require('express');
const router = express.Router();
const User = require('../models/User');
const MasterData = require('../models/MasterData');
const analytics = require('../utils/analytics');
const logOnboardingEvent = require('../utils/onboardingEvents');
const auth = require('../middleware/auth');

// Helper function to get next onboarding step
function getNextOnboardingStep(user) {
    const onboarding = user.onboarding || {};
    
    if (!onboarding.completed) {
        if (!onboarding.primaryGoal) return 'primary_goal';
        if (!onboarding.gender) return 'gender';
        if (!onboarding.ageRange) return 'age_range';
        if (!onboarding.gamePreferences?.length) return 'game_preferences';
        if (!onboarding.gameStyle) return 'game_style';
        if (!onboarding.improvementArea) return 'improvement_area';
        if (!onboarding.dailyEarningGoal) return 'daily_goal';
    }
    
    return 'completed';
}

// Get onboarding status (auth required)
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const onboardingStatus = {
      completed: {
        primaryGoal: !!user.onboarding?.primaryGoal,
        gender: !!user.onboarding?.gender,
        ageRange: !!user.onboarding?.ageRange,
        gamePreferences: user.onboarding?.gamePreferences?.length > 0,
        gameStyle: !!user.onboarding?.gameStyle,
        improvementArea: !!user.onboarding?.improvementArea,
        dailyGoal: !!user.onboarding?.dailyEarningGoal
      }
    };

    try {
      onboardingStatus.nextStep = getNextOnboardingStep(user);
      res.status(200).json(onboardingStatus);
    } catch (error) {
      console.error('Error getting next onboarding step:', error);
      res.status(500).json({ error: 'Failed to get onboarding status' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get onboarding status' });
  }
});

// Get screen options
router.get('/options/:screen', async (req, res) => {
  try {
    const { screen } = req.params;
    const options = await MasterData.findOne({ screen, active: true })
      .select('options maxSelection')
      .sort({ 'options.order': 1 });

    if (!options) {
      return res.status(404).json({ error: 'Screen options not found' });
    }

    res.status(200).json(options);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get screen options' });
  }
});

// Update primary goal
router.put('/primary-goal', async (req, res) => {
  try {
    const { mobile, goal } = req.body;
    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const validOptions = await MasterData.findOne({ screen: 'primary_goal', active: true });
    
    if (!validOptions || !validOptions.options.some(opt => opt.id === goal)) {
      return res.status(400).json({ error: 'Invalid goal option' });
    }

    const user = await User.findOneAndUpdate(
      { mobile },
      { primaryGoal: goal },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Primary goal updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update primary goal' });
  }
});

// Update gender
router.put('/gender', async (req, res) => {
  try {
    const { mobile, gender } = req.body;
    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const validOptions = await MasterData.findOne({ screen: 'gender', active: true });
    
    if (!validOptions || !validOptions.options.some(opt => opt.id === gender)) {
      return res.status(400).json({ error: 'Invalid gender option' });
    }

    const user = await User.findOneAndUpdate(
      { mobile },
      { gender },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Gender updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update gender' });
  }
});

// Update age range
router.put('/age-range', async (req, res) => {
  try {
    const { mobile, ageRange } = req.body;

    if (!mobile || !ageRange) {
      return res.status(400).json({ error: 'Mobile and age range are required' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const update = {
      $set: {
        'onboarding.steps.ageRange': {
          completed: true,
          value: ageRange
        }
      }
    };

    if (getCurrentStep(user) === 'ageRange') {
      update.$set['onboarding.completed'] = true;
    }

    await User.findOneAndUpdate(
      { mobile },
      update,
      { new: true }
    );

    await logOnboardingEvent(user, 'age_range_updated', { ageRange });

    res.status(200).json({
      message: 'Age range updated successfully',
      nextStep: getCurrentStep(user)
    });

  } catch (error) {
    console.error('Error updating age range:', error);
    await analytics.log('onboarding_error', {
      error: error.message,
      stack: error.stack,
      step: 'age_range'
    });
    res.status(500).json({ error: 'Failed to update age range' });
  }
});

// Update improvement area
router.put('/improvement-area', async (req, res) => {
  try {
    const { mobile, area } = req.body;

    if (!mobile || !area) {
      return res.status(400).json({ error: 'Mobile and improvement area are required' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const update = {
      $set: {
        'onboarding.steps.improvementArea': {
          completed: true,
          value: area
        }
      }
    };

    if (getCurrentStep(user) === 'improvementArea') {
      update.$set['onboarding.completed'] = true;
    }

    await User.findOneAndUpdate(
      { mobile },
      update,
      { new: true }
    );

    await logOnboardingEvent(user, 'improvement_area_updated', { area });

    res.status(200).json({
      message: 'Improvement area updated successfully',
      nextStep: getCurrentStep(user)
    });

  } catch (error) {
    console.error('Error updating improvement area:', error);
    await analytics.log('onboarding_error', {
      error: error.message,
      stack: error.stack,
      step: 'improvement_area'
    });
    res.status(500).json({ error: 'Failed to update improvement area' });
  }
});

// Update daily earning goal
router.put('/daily-earning-goal', async (req, res) => {
  try {
    const { mobile, goal } = req.body;

    if (!mobile || !goal) {
      return res.status(400).json({ error: 'Mobile and goal are required' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const update = {
      $set: {
        'onboarding.steps.dailyEarningGoal': {
          completed: true,
          value: goal
        }
      }
    };

    if (getCurrentStep(user) === 'dailyEarningGoal') {
      update.$set['onboarding.completed'] = true;
    }

    await User.findOneAndUpdate(
      { mobile },
      update,
      { new: true }
    );

    await logOnboardingEvent(user, 'daily_earning_goal_updated', { goal });

    res.status(200).json({
      message: 'Daily earning goal updated successfully',
      nextStep: getCurrentStep(user)
    });

  } catch (error) {
    console.error('Error updating daily earning goal:', error);
    await analytics.log('onboarding_error', {
      error: error.message,
      stack: error.stack,
      step: 'daily_earning_goal'
    });
    res.status(500).json({ error: 'Failed to update daily earning goal' });
  }
});

/**
 * POST /api/onboarding/submit
 * Submit all onboarding answers at once (same shape as signup stores them).
 * Auth required; user identified by JWT. Body: primaryGoal?, gender?, ageRange?, gamePreferences?, gameStyle?, improvementArea?, dailyEarningGoal?
 */
router.post('/submit', auth, async (req, res) => {
  try {
    const {
      primaryGoal,
      gender,
      ageRange,
      gamePreferences,
      gameStyle,
      improvementArea,
      dailyEarningGoal,
    } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Same structure as signup route (auth.js register)
    const onboardingUpdate = {
      'onboarding.completed': true,
      'onboarding.step': 7, // all steps done
      'onboarding.primaryGoal': primaryGoal || undefined,
      'onboarding.gender': gender || undefined,
      'onboarding.ageRange': ageRange || undefined,
      'onboarding.gamePreferences': Array.isArray(gamePreferences) ? gamePreferences : [],
      'onboarding.gameStyle': gameStyle || undefined,
      'onboarding.improvementArea': improvementArea || undefined,
      'onboarding.dailyEarningGoal': typeof dailyEarningGoal === 'number' ? dailyEarningGoal : undefined,
      'onboarding.dailyGoals': {
        gamesPlayed: 5,
        coinsEarned: typeof dailyEarningGoal === 'number' ? dailyEarningGoal : 900,
        challengesCompleted: 3,
      },
    };

    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: onboardingUpdate },
      { new: true }
    ).select('onboarding');

    await logOnboardingEvent(updated, 'onboarding_submitted', {
      primaryGoal: !!primaryGoal,
      gender: !!gender,
      ageRange: !!ageRange,
      gamePreferences: Array.isArray(gamePreferences) ? gamePreferences.length : 0,
      gameStyle: !!gameStyle,
      improvementArea: !!improvementArea,
      dailyEarningGoal: typeof dailyEarningGoal === 'number',
    });

    res.status(200).json({
      message: 'Onboarding saved successfully',
      onboarding: updated.onboarding,
    });
  } catch (error) {
    console.error('Error submitting onboarding:', error);
    await analytics.log('onboarding_error', {
      error: error.message,
      stack: error.stack,
      step: 'submit',
    });
    res.status(500).json({ error: 'Failed to save onboarding', message: error.message });
  }
});

// Reset onboarding
router.post('/reset', async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile is required' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await User.findOneAndUpdate(
      { mobile },
      { 
        $set: {
          'onboarding.completed': false,
          'onboarding.steps': {
            primaryGoal: { completed: false, value: null },
            gender: { completed: false, value: null },
            ageRange: { completed: false, value: null },
            improvementArea: { completed: false, value: null },
            dailyEarningGoal: { completed: false, value: null }
          }
        }
      },
      { new: true }
    );

    await logOnboardingEvent(user, 'onboarding_reset');

    res.status(200).json({ message: 'Onboarding reset successfully' });

  } catch (error) {
    console.error('Error resetting onboarding:', error);
    await analytics.log('onboarding_error', {
      error: error.message,
      stack: error.stack,
      step: 'reset'
    });
    res.status(500).json({ error: 'Failed to reset onboarding' });
  }
});

module.exports = router;

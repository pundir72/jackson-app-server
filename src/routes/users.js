const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

// Import controllers
const userController = require('../controllers/userController');
const { validateRequest } = require('../middleware/validation');
const { avatarUpload } = require('../middleware/upload');

// Validation rules
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Please provide a valid date of birth'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other', 'prefer_not_to_say'])
    .withMessage('Please provide a valid gender'),
  body('ageRange')
    .optional()
    .isIn(['under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'])
    .withMessage('Please provide a valid age range'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('Please provide a valid timezone'),
  body('language')
    .optional()
    .isIn(['en', 'es', 'fr', 'de', 'it', 'pt'])
    .withMessage('Please provide a valid language'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD'])
    .withMessage('Please provide a valid currency'),
];

const updatePreferencesValidation = [
  body('primaryGoal')
    .optional()
    .isIn(['save_money', 'earn_cashback', 'play_games', 'learn_finance', 'social_connection'])
    .withMessage('Please provide a valid primary goal'),
  body('improvementAreas')
    .optional()
    .isArray()
    .withMessage('Improvement areas must be an array'),
  body('gameStylePreferences')
    .optional()
    .isArray()
    .withMessage('Game style preferences must be an array'),
  body('gameCategories')
    .optional()
    .isArray()
    .withMessage('Game categories must be an array'),
  body('dailyEarningGoal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Daily earning goal must be a positive number'),
  body('weeklyEarningGoal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Weekly earning goal must be a positive number'),
  body('monthlyEarningGoal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly earning goal must be a positive number'),
  body('preferredStores')
    .optional()
    .isArray()
    .withMessage('Preferred stores must be an array'),
  body('preferredCategories')
    .optional()
    .isArray()
    .withMessage('Preferred categories must be an array'),
  body('maxDailySpend')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum daily spend must be a positive number'),
  body('maxWeeklySpend')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum weekly spend must be a positive number'),
  body('maxMonthlySpend')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum monthly spend must be a positive number'),
  body('budgetAlerts')
    .optional()
    .isBoolean()
    .withMessage('Budget alerts must be a boolean'),
  body('spendingAlerts')
    .optional()
    .isBoolean()
    .withMessage('Spending alerts must be a boolean'),
  body('rewardAlerts')
    .optional()
    .isBoolean()
    .withMessage('Reward alerts must be a boolean'),
  body('challengeAlerts')
    .optional()
    .isBoolean()
    .withMessage('Challenge alerts must be a boolean'),
  body('gameAlerts')
    .optional()
    .isBoolean()
    .withMessage('Game alerts must be a boolean'),
  body('vipAlerts')
    .optional()
    .isBoolean()
    .withMessage('VIP alerts must be a boolean'),
  body('cashCoachAlerts')
    .optional()
    .isBoolean()
    .withMessage('Cash Coach alerts must be a boolean'),
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'auto'])
    .withMessage('Please provide a valid theme'),
  body('fontSize')
    .optional()
    .isIn(['small', 'medium', 'large'])
    .withMessage('Please provide a valid font size'),
  body('soundEnabled')
    .optional()
    .isBoolean()
    .withMessage('Sound enabled must be a boolean'),
  body('vibrationEnabled')
    .optional()
    .isBoolean()
    .withMessage('Vibration enabled must be a boolean'),
  body('autoSync')
    .optional()
    .isBoolean()
    .withMessage('Auto sync must be a boolean'),
  body('dataUsage')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Please provide a valid data usage setting'),
  body('privacyLevel')
    .optional()
    .isIn(['public', 'friends', 'private'])
    .withMessage('Please provide a valid privacy level'),
  body('shareProgress')
    .optional()
    .isBoolean()
    .withMessage('Share progress must be a boolean'),
  body('shareAchievements')
    .optional()
    .isBoolean()
    .withMessage('Share achievements must be a boolean'),
  body('shareLeaderboard')
    .optional()
    .isBoolean()
    .withMessage('Share leaderboard must be a boolean'),
];

const updateLocationValidation = [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('locationEnabled')
    .isBoolean()
    .withMessage('Location enabled must be a boolean'),
];

const updateNotificationsValidation = [
  body('pushNotifications')
    .isBoolean()
    .withMessage('Push notifications must be a boolean'),
  body('emailNotifications')
    .isBoolean()
    .withMessage('Email notifications must be a boolean'),
  body('smsNotifications')
    .isBoolean()
    .withMessage('SMS notifications must be a boolean'),
];

// Routes
router.get('/profile', userController.getProfile);
router.put('/profile', updateProfileValidation, validateRequest, userController.updateProfile);
router.post('/upload-avatar', avatarUpload, userController.uploadAvatar);
router.get('/preferences', userController.getPreferences);
router.put('/preferences', updatePreferencesValidation, validateRequest, userController.updatePreferences);
router.put('/location', updateLocationValidation, validateRequest, userController.updateLocation);
router.put('/notifications', updateNotificationsValidation, validateRequest, userController.updateNotifications);
router.get('/stats', userController.getStats);
router.get('/achievements', userController.getAchievements);
router.get('/referrals', userController.getReferrals);
router.post('/referral-code', userController.generateReferralCode);
router.delete('/account', userController.deleteAccount);

module.exports = router; 
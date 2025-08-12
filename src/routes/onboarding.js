const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');

// Simple validation - just check if step exists
const completeStepValidation = [
  (req, res, next) => {
    if (!req.body.step) {
      return res.status(400).json({
        success: false,
        message: 'Step is required',
        statusCode: 400
      });
    }
    next();
  }
];

// Routes
router.get('/options', onboardingController.getOnboardingOptions);

router.post('/step-complete', 
  ...completeStepValidation, 
  onboardingController.completeOnboardingStep
);

router.get('/progress', 
  onboardingController.getOnboardingProgress
);

router.post('/save-preferences', 
  onboardingController.saveOnboardingPreferences
);

router.get('/resume', 
  onboardingController.resumeOnboarding
);

module.exports = router; 
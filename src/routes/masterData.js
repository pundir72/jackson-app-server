const express = require('express');
const router = express.Router();
const masterDataController = require('../controllers/masterDataController');

// Get all onboarding master data
router.get('/onboarding', masterDataController.getOnboardingMasterData);

// Get master data by category
router.get('/:category', masterDataController.getMasterDataByCategory);

// Get all master data
router.get('/', masterDataController.getAllMasterData);

// Initialize master data (admin function)
router.post('/init', masterDataController.initializeMasterData);

module.exports = router; 
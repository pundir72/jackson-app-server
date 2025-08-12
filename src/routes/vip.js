const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const {
  getBenefits,
  getPlans,
  upgradeToVIP,
  cancelVIP,
  getVIPStatus,
  getVIPStats,
  updateVIPSettings,
} = require('../controllers/vipController');

// VIP information
router.get('/benefits', protect, getBenefits);
router.get('/plans', protect, getPlans);
router.get('/status', protect, getVIPStatus);
router.get('/stats', protect, getVIPStats);

// VIP management
router.post('/upgrade', protect, upgradeToVIP);
router.post('/cancel', protect, cancelVIP);
router.put('/settings', protect, updateVIPSettings);

module.exports = router; 
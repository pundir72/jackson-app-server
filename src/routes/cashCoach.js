const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const {
  getFinancialTips,
  getFinancialGoals,
  createFinancialGoal,
  updateFinancialGoal,
  addContribution,
  getGoalStats,
  getEducationContent,
  getRecommendations,
} = require('../controllers/cashCoachController');

// Financial education
router.get('/tips', protect, getFinancialTips);
router.get('/education', protect, getEducationContent);
router.get('/recommendations', protect, getRecommendations);

// Financial goals
router.get('/goals', protect, getFinancialGoals);
router.post('/goals', protect, createFinancialGoal);
router.put('/goals/:id', protect, updateFinancialGoal);
router.post('/goals/:id/contribute', protect, addContribution);
router.get('/goals/stats', protect, getGoalStats);

module.exports = router; 
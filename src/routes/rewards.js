const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const {
  getDailyChallenges,
  getChallenges,
  getChallengeById,
  completeChallenge,
  getRewardsHistory,
  getLeaderboard,
  getPointsBalance,
  getCashbackBalance,
  redeemPoints,
  redeemCashback,
} = require('../controllers/rewardsController');

// Challenge routes
router.get('/challenges/daily', protect, getDailyChallenges);
router.get('/challenges', protect, getChallenges);
router.get('/challenges/:id', protect, getChallengeById);
router.post('/challenges/complete', protect, completeChallenge);

// Rewards routes
router.get('/history', protect, getRewardsHistory);
router.get('/leaderboard', protect, getLeaderboard);
router.get('/points/balance', protect, getPointsBalance);
router.get('/cashback/balance', protect, getCashbackBalance);
router.post('/points/redeem', protect, redeemPoints);
router.post('/cashback/redeem', protect, redeemCashback);

module.exports = router; 
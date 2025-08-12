const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const {
  getWalletBalance,
  getWalletTransactions,
  withdrawFunds,
  addFunds,
  updateWalletSettings,
  getWalletStats,
} = require('../controllers/walletController');

// Wallet balance and transactions
router.get('/balance', protect, getWalletBalance);
router.get('/transactions', protect, getWalletTransactions);
router.get('/stats', protect, getWalletStats);

// Wallet operations
router.post('/withdraw', protect, withdrawFunds);
router.post('/add-funds', protect, addFunds);
router.put('/settings', protect, updateWalletSettings);

module.exports = router; 
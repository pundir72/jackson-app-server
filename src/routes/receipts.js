const express = require('express');
const router = express.Router();
const { authMiddleware: protect } = require('../middleware/auth');
const { receiptUpload } = require('../middleware/upload');
const {
  scanReceipt,
  getReceiptHistory,
  verifyReceipt,
  getReceiptStats,
  getReceiptById,
  deleteReceipt,
} = require('../controllers/receiptsController');

// Receipt scanning and management
router.post('/scan', protect, receiptUpload, scanReceipt);
router.get('/history', protect, getReceiptHistory);
router.get('/stats', protect, getReceiptStats);
router.get('/:id', protect, getReceiptById);
router.put('/:receiptId/verify', protect, verifyReceipt);
router.delete('/:id', protect, deleteReceipt);

module.exports = router; 
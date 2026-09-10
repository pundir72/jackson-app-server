const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const appleIAPController = require('../controllers/appleIAP.controller');

/**
 * @route   POST /api/apple-iap/verify
 * @desc    Verify Apple IAP purchase and create subscription
 * @access  Private
 */
router.post('/verify', protect, [
  body('transactionReceipt').notEmpty().withMessage('Transaction receipt is required'),
  body('transactionId').notEmpty().withMessage('Transaction ID is required'),
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('subscriptionId').notEmpty().withMessage('Subscription ID is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  await appleIAPController.verifyPurchase(req, res);
});

/**
 * @route   GET /api/apple-iap/history
 * @desc    Get user's Apple IAP purchase history
 * @access  Private
 */
router.get('/history', protect, async (req, res) => {
  await appleIAPController.getPurchaseHistory(req, res);
});

/**
 * @route   GET /api/apple-iap/subscription/active
 * @desc    Get active Apple IAP subscription
 * @access  Private
 */
router.get('/subscription/active', protect, async (req, res) => {
  await appleIAPController.getActiveSubscription(req, res);
});

/**
 * @route   POST /api/apple-iap/subscription/refresh
 * @desc    Refresh Apple IAP subscription status
 * @access  Private
 */
router.post('/subscription/refresh/:purchaseId', protect, async (req, res) => {
  await appleIAPController.refreshSubscription(req, res);
});

/**
 * @route   POST /api/apple-iap/webhook
 * @desc    Handle Apple App Store Server Notifications (webhooks)
 * @access  Public (but verified via JWT signature)
 */
router.post('/webhook', express.json(), async (req, res) => {
  await appleIAPController.handleWebhook(req, res);
});

module.exports = router;

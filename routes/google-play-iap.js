const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const googlePlayController = require('../controllers/googlePlay.controller');

/**
 * Google Play In-App Purchase Routes
 * All routes for managing Google Play purchases and subscriptions
 */

/**
 * @route   POST /api/google-play-iap/verify
 * @desc    Verify a Google Play purchase (subscription or one-time)
 * @access  Private
 */
router.post('/verify', protect, [
  body('purchaseToken')
    .notEmpty()
    .withMessage('Purchase token is required'),
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('orderId')
    .notEmpty()
    .withMessage('Order ID is required'),
  body('purchaseType')
    .optional()
    .isIn(['subscription', 'one_time'])
    .withMessage('Purchase type must be subscription or one_time'),
  body('packageName')
    .optional()
    .isString()
    .withMessage('Package name must be a string'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  await googlePlayController.verifyPurchase(req, res);
});

/**
 * @route   GET /api/google-play-iap/history
 * @desc    Get user's purchase history
 * @access  Private
 */
router.get('/history', protect, [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('purchaseType')
    .optional()
    .isIn(['subscription', 'one_time'])
    .withMessage('Purchase type must be subscription or one_time')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  await googlePlayController.getPurchaseHistory(req, res);
});

/**
 * @route   GET /api/google-play-iap/subscription/active
 * @desc    Get user's active subscription
 * @access  Private
 */
router.get('/subscription/active', protect, [
  query('productId')
    .optional()
    .isString()
    .withMessage('Product ID must be a string')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  await googlePlayController.getActiveSubscription(req, res);
});

/**
 * @route   POST /api/google-play-iap/subscription/:purchaseId/refresh
 * @desc    Refresh subscription status from Google Play
 * @access  Private
 */
router.post('/subscription/:purchaseId/refresh', protect, async (req, res) => {
  await googlePlayController.refreshSubscription(req, res);
});

/**
 * @route   POST /api/google-play-iap/webhook
 * @desc    Handle Google Play Real-time Developer Notifications
 * @access  Public (verified by Google)
 */
router.post('/webhook', express.json(), async (req, res) => {
  await googlePlayController.handleWebhook(req, res);
});

/**
 * @route   GET /api/google-play-iap/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Google Play IAP service is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

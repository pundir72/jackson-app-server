/**
 * Bitlabs Routes
 * API routes for Bitlabs game offers integration
 * @module routes/bitlabs
 */

const express = require('express');
const router = express.Router();
const bitlabsController = require('../controllers/bitlabs.controller');
const bitlabsService = require('../services/bitlabs.service');
const protect = require('../middleware/auth');
const User = require('../models/User');

/**
 * @route   GET /api/bitlabs/offers
 * @desc    Get available Bitlabs offers
 * @access  Private
 */
router.get('/offers', protect, bitlabsController.getOffers);

/**
 * @route   GET /api/bitlabs/game-offers
 * @desc    Get available Bitlabs game offers
 * @access  Private
 */
router.get('/game-offers', protect, bitlabsController.getGameOffers);

/**
 * @route   GET /api/bitlabs/health
 * @desc    Health check for Bitlabs API
 * @access  Public
 */
router.get('/health', bitlabsController.healthCheck);

/**
 * @route   GET /api/bitlabs/surveys
 * @desc    Get available Bitlabs surveys
 * @access  Private
 */
router.get('/surveys', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const queryParams = req.query;
    const result = await bitlabsService.getSurveys(queryParams, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch surveys'
    });
  }
});

/**
 * @route   GET /api/bitlabs/cashback
 * @desc    Get available Bitlabs cashback offers
 * @access  Private
 */
router.get('/cashback', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const queryParams = req.query;
    const result = await bitlabsService.getCashbackOffers(queryParams, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch cashback offers'
    });
  }
});

/**
 * @route   GET /api/bitlabs/clicks
 * @desc    Get clicks
 * @access  Private
 */
router.get('/clicks', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const queryParams = req.query;
    const result = await bitlabsService.getClicks(queryParams, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch clicks'
    });
  }
});

/**
 * @route   POST /api/bitlabs/clicks
 * @desc    Create click
 * @access  Private
 */
router.post('/clicks', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const clickData = req.body;
    const result = await bitlabsService.createClick(clickData, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to create click'
    });
  }
});

/**
 * @route   GET /api/bitlabs/clicks/:clickId
 * @desc    Get click by ID
 * @access  Private
 */
router.get('/clicks/:clickId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { clickId } = req.params;
    const result = await bitlabsService.getClickById(clickId, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch click'
    });
  }
});

/**
 * @route   PUT /api/bitlabs/clicks/:clickId
 * @desc    Update click
 * @access  Private
 */
router.put('/clicks/:clickId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { clickId } = req.params;
    const updateData = req.body;
    const result = await bitlabsService.updateClick(clickId, updateData, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to update click'
    });
  }
});

/**
 * @route   GET /api/bitlabs/surveys/reconciliation-count
 * @desc    Get survey reconciliation count
 * @access  Private
 */
router.get('/surveys/reconciliation-count', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const queryParams = req.query;
    const result = await bitlabsService.getSurveyReconciliationCount(queryParams, user?._id?.toString());
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch reconciliation count'
    });
  }
});

/**
 * @route   GET /api/bitlabs/user/history/magic-receipts/:receiptOfferId?
 * @desc    Get user magic receipt history
 * @access  Private
 */
router.get('/user/history/magic-receipts/:receiptOfferId?', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const { receiptOfferId } = req.params;
    const result = await bitlabsService.getUserMagicReceiptHistory(
      user?._id?.toString(),
      receiptOfferId || null
    );
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch magic receipt history'
    });
  }
});

/**
 * @route   GET /api/bitlabs/user-history/:userId
 * @desc    Get user offer history
 * @access  Private
 */
router.get('/user-history/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await bitlabsService.getUserOfferHistory(userId);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch user history'
    });
  }
});

/**
 * @route   GET /api/bitlabs/user-history/:userId/:offerId
 * @desc    Get user offer history for specific offer
 * @access  Private
 */
router.get('/user-history/:userId/:offerId', protect, async (req, res) => {
  try {
    const { userId, offerId } = req.params;
    const result = await bitlabsService.getUserOfferHistory(userId, offerId);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch user offer history'
    });
  }
});

/**
 * @route   GET /api/bitlabs/user-maid/:userId
 * @desc    Get user MAID
 * @access  Private
 */
router.get('/user-maid/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await bitlabsService.getUserMaid(userId);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch user MAID'
    });
  }
});

module.exports = router;


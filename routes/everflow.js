/**
 * Everflow Routes
 * API routes for Everflow non-gaming offers integration
 * @module routes/everflow
 */

const express = require("express");
const router = express.Router();
const everflowController = require("../controllers/everflow.controller");
const protect = require("../middleware/auth");
const { adminAuth } = require("../middleware/adminAuth");

/**
 * @route   GET /api/everflow/health
 * @desc    Health check for Everflow API
 * @access  Public
 */
router.get("/health", everflowController.healthCheck);

/**
 * @route   GET /api/everflow/offers
 * @desc    Get available Everflow offers (non-gaming)
 * @query   {string} platform - Platform filter (iOS, Android, etc.)
 * @query   {string} country - Country code filter
 * @query   {string} type - Offer type (survey, shopping, cashback, magic_receipt, etc.)
 * @query   {string} category - Category filter
 * @access  Private (requires authentication)
 */
router.get("/offers", protect, everflowController.getOffers);

/**
 * @route   GET /api/everflow/conversions
 * @desc    Get conversions data (Admin only)
 * @query   {string} from - Start date (YYYY-MM-DD)
 * @query   {string} to - End date (YYYY-MM-DD)
 * @query   {string} status - Conversion status filter
 * @query   {string} userId - User ID filter
 * @query   {number} limit - Limit results (default: 100)
 * @query   {number} skip - Skip results (default: 0)
 * @access  Private (Admin only)
 */
router.get("/conversions", protect, adminAuth, everflowController.getConversions);

/**
 * @route   GET /api/everflow/user-conversions/:userId
 * @desc    Get user's conversions
 * @param   {string} userId - User ID
 * @query   {string} status - Conversion status filter
 * @access  Private (user can only access their own conversions)
 */
router.get("/user-conversions/:userId", protect, everflowController.getUserConversions);

module.exports = router;

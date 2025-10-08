/**
 * Besitos Routes
 * API endpoints for Besitos integration (game offers and surveys)
 * @module routes/besitos
 */

const express = require('express');
const router = express.Router();
const besitosController = require('../controllers/besitos.controller');
const auth = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const rateLimit = require('express-rate-limit');

// Rate limiting for Besitos API calls
const besitosLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: {
        success: false,
        error: {
            message: 'Too many requests to Besitos API. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED'
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Health check endpoint (public)
router.get('/health', besitosController.healthCheck);

// ===================================
// User-facing endpoints (authenticated)
// ===================================

/**
 * @route   GET /api/besitos/offers
 * @desc    Get available game offers
 * @query   {string} platform - Platform filter (iOS, Android)
 * @query   {string} country - Country code filter (US, UK, etc.)
 * @query   {string} category - Category filter
 * @access  Private (requires authentication)
 */
router.get('/offers', auth, besitosLimiter, besitosController.getOffers);

/**
 * @route   GET /api/besitos/user-data/:userId
 * @desc    Get user activity and data from Besitos
 * @param   {string} userId - User ID
 * @access  Private (user can only access their own data)
 */
router.get('/user-data/:userId', auth, besitosLimiter, besitosController.getUserData);

/**
 * @route   GET /api/besitos/surveys/:userId
 * @desc    Get available surveys for user
 * @param   {string} userId - User ID
 * @query   {string} platform - Platform filter
 * @access  Private (user can only access their own surveys)
 */
router.get('/surveys/:userId', auth, besitosLimiter, besitosController.getSurveysWall);

/**
 * @route   GET /api/besitos/user-profiling/:userId
 * @desc    Get user profiling questions
 * @param   {string} userId - User ID
 * @access  Private (user can only access their own profiling)
 */
router.get('/user-profiling/:userId', auth, besitosLimiter, besitosController.getUserProfiling);

/**
 * @route   GET /api/besitos/messenger
 * @desc    Get messenger data and upcoming goals
 * @access  Private
 */
router.get('/messenger', auth, besitosLimiter, besitosController.getMessenger);

/**
 * @route   POST /api/besitos/conversion
 * @desc    Submit conversion/postback to Besitos
 * @body    {Object} conversionData - Conversion details
 * @access  Private
 */
router.post('/conversion', auth, besitosLimiter, besitosController.submitConversion);

// ===================================
// Admin-only endpoints
// ===================================

/**
 * @route   GET /api/besitos/conversions
 * @desc    Get conversions data (Admin only)
 * @query   {string} from - Start date (YYYY-MM-DD)
 * @query   {string} to - End date (YYYY-MM-DD)
 * @query   {string} status - Conversion status filter
 * @access  Private (Admin only)
 */
router.get('/conversions', auth, adminAuth, besitosLimiter, besitosController.getConversions);

module.exports = router;


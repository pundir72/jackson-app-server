/**
 * Adjust Routes
 * Frontend-facing routes for Adjust S2S integration
 * Frontend developers will call these endpoints
 * @module routes/adjust
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const adjustService = require('../services/adjust.service');
const AdjustAttribution = require('../models/AdjustAttribution');
const User = require('../models/User');

/**
 * @route   POST /api/adjust/track-event
 * @desc    Track an event to Adjust (called by frontend)
 * @body    {string} eventType - Event type (e.g., 'game_complete', 'purchase', 'level_up') - preferred
 * @body    {string} eventToken - Adjust event token (optional, only if eventType not configured)
 * @body    {string} idfa - iOS IDFA (required for iOS)
 * @body    {string} gpsAdid - Android GPS ADID (required for Android)
 * @body    {string} idfv - iOS IDFV (backup identifier)
 * @body    {string} androidId - Android ID (backup identifier)
 * @body    {number} revenue - Revenue amount (optional)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {Object} callbackParams - Callback parameters (optional)
 * @body    {Object} partnerParams - Partner parameters (optional)
 * @body    {string} environment - Environment: sandbox or production (optional)
 * @access  Protected (User must be authenticated)
 */
router.post('/track-event', protect, [
    body('eventType').optional().isString(),
    body('eventToken').optional().isString(),
    body('idfa').optional().isString(),
    body('gpsAdid').optional().isString(),
    body('idfv').optional().isString(),
    body('androidId').optional().isString(),
    body('revenue').optional().isNumeric().withMessage('revenue must be a number'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('currency must be 3 characters'),
    body('environment').optional().isIn(['sandbox', 'production']).withMessage('environment must be sandbox or production')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            eventType,
            eventToken,
            idfa,
            gpsAdid,
            idfv,
            androidId,
            fireAdid,
            windowsAdid,
            amazonAdid,
            revenue,
            currency,
            callbackParams,
            partnerParams,
            environment,
            osName  // Allow frontend to specify OS name explicitly
        } = req.body;

        // Validate: either eventType or eventToken must be provided
        if (!eventType && !eventToken) {
            return res.status(400).json({
                success: false,
                message: 'Either eventType or eventToken is required'
            });
        }

        // Get user from token
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Add user ID to callback params
        const enhancedCallbackParams = {
            ...callbackParams,
            user_id: user._id.toString(),
            user_email: user.email || ''
        };

        // Track event to Adjust
        const result = await adjustService.trackEvent({
            eventType,  // Preferred: backend will map to event token
            eventToken,  // Fallback: if eventType not configured
            idfa,
            gpsAdid,
            idfv,
            androidId,
            fireAdid,
            windowsAdid,
            amazonAdid,
            revenue,
            currency,
            callbackParams: enhancedCallbackParams,
            partnerParams,
            environment,
            osName  // Pass OS name if provided
        });

        if (result.success) {
            res.json({
                success: true,
                message: 'Event tracked successfully',
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('Adjust track-event error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track event',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/adjust/track-ad-revenue
 * @desc    Track ad revenue to Adjust (called by frontend)
 * @body    {string} source - Revenue source (required)
 * @body    {number} revenue - Revenue amount (required)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {string} publisher - Publisher name (optional)
 * @body    {string} mediationNetwork - Mediation network (optional)
 * @body    {string} adUnit - Ad unit identifier (optional)
 * @body    {string} adType - Ad type (optional)
 * @body    {string} idfa - iOS IDFA (required for iOS)
 * @body    {string} gpsAdid - Android GPS ADID (required for Android)
 * @body    {Object} callbackParams - Callback parameters (optional)
 * @access  Protected (User must be authenticated)
 */
router.post('/track-ad-revenue', protect, [
    body('source').notEmpty().withMessage('source is required'),
    body('revenue').isNumeric().withMessage('revenue is required and must be a number'),
    body('currency').optional().isString().isLength({ min: 3, max: 3 }),
    body('idfa').optional().isString(),
    body('gpsAdid').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            source,
            revenue,
            currency,
            publisher,
            mediationNetwork,
            adUnit,
            adType,
            idfa,
            gpsAdid,
            idfv,
            androidId,
            callbackParams
        } = req.body;

        // Get user from token
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Add user ID to callback params
        const enhancedCallbackParams = {
            ...callbackParams,
            user_id: user._id.toString()
        };

        // Track ad revenue to Adjust
        const result = await adjustService.trackAdRevenue({
            source,
            revenue,
            currency,
            publisher,
            mediationNetwork,
            adUnit,
            adType,
            idfa,
            gpsAdid,
            idfv,
            androidId,
            callbackParams: enhancedCallbackParams
        });

        if (result.success) {
            res.json({
                success: true,
                message: 'Ad revenue tracked successfully',
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('Adjust track-ad-revenue error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track ad revenue',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/adjust/track-session
 * @desc    Track a session to Adjust (called by frontend)
 * @body    {string} idfa - iOS IDFA (required for iOS)
 * @body    {string} gpsAdid - Android GPS ADID (required for Android)
 * @body    {string} idfv - iOS IDFV (backup)
 * @body    {string} androidId - Android ID (backup)
 * @body    {Object} callbackParams - Callback parameters (optional)
 * @access  Protected (User must be authenticated)
 */
router.post('/track-session', protect, [
    body('idfa').optional().isString(),
    body('gpsAdid').optional().isString(),
    body('idfv').optional().isString(),
    body('androidId').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            idfa,
            gpsAdid,
            idfv,
            androidId,
            fireAdid,
            windowsAdid,
            amazonAdid,
            callbackParams
        } = req.body;

        // Get user from token
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Add user ID to callback params
        const enhancedCallbackParams = {
            ...callbackParams,
            user_id: user._id.toString()
        };

        // Track session to Adjust
        const result = await adjustService.trackSession({
            idfa,
            gpsAdid,
            idfv,
            androidId,
            fireAdid,
            windowsAdid,
            amazonAdid,
            callbackParams: enhancedCallbackParams
        });

        if (result.success) {
            res.json({
                success: true,
                message: 'Session tracked successfully',
                data: result.data
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                error: result.error
            });
        }

    } catch (error) {
        console.error('Adjust track-session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to track session',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/adjust/save-attribution
 * @desc    Save attribution data from Adjust (called by frontend after receiving attribution callback)
 * @body    {Object} attributionData - Attribution data from Adjust
 * @access  Protected (User must be authenticated)
 */
router.post('/save-attribution', protect, async (req, res) => {
    try {
        const attributionData = req.body;
        const userId = req.user.userId;

        // Check if attribution already exists for this user
        const existingAttribution = await AdjustAttribution.findOne({
            userId: userId,
            isActive: true
        });

        if (existingAttribution) {
            // Update existing attribution
            Object.assign(existingAttribution, {
                ...attributionData,
                userId: userId,
                isActive: true
            });
            await existingAttribution.save();

            res.json({
                success: true,
                message: 'Attribution updated successfully',
                data: existingAttribution
            });
        } else {
            // Create new attribution
            const newAttribution = new AdjustAttribution({
                ...attributionData,
                userId: userId,
                isActive: true
            });
            await newAttribution.save();

            res.json({
                success: true,
                message: 'Attribution saved successfully',
                data: newAttribution
            });
        }

    } catch (error) {
        console.error('Adjust save-attribution error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save attribution',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/adjust/attribution
 * @desc    Get user's attribution data
 * @access  Protected (User must be authenticated)
 */
router.get('/attribution', protect, async (req, res) => {
    try {
        const userId = req.user.userId;

        const attribution = await AdjustAttribution.getUserAttribution(userId);

        if (!attribution) {
            return res.json({
                success: true,
                message: 'No attribution data found',
                data: null
            });
        }

        res.json({
            success: true,
            data: attribution
        });

    } catch (error) {
        console.error('Adjust get-attribution error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get attribution',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/adjust/test-direct
 * @desc    Test endpoint - sends exact request to Adjust (for debugging)
 * @body    {string} eventToken - Adjust event token
 * @body    {string} appToken - Adjust app token
 * @body    {string} gpsAdid - Android GPS ADID
 * @body    {string} idfa - iOS IDFA
 * @access  Protected (User must be authenticated)
 */
router.post('/test-direct', protect, async (req, res) => {
    try {
        const { eventToken, appToken, gpsAdid, idfa } = req.body;

        if (!eventToken || !appToken) {
            return res.status(400).json({
                success: false,
                message: 'eventToken and appToken are required'
            });
        }

        if (!gpsAdid && !idfa) {
            return res.status(400).json({
                success: false,
                message: 'At least one device identifier (gpsAdid or idfa) is required'
            });
        }

        // Build exact request like curl
        const params = new URLSearchParams();
        params.append('s2s', '1');
        params.append('app_token', appToken);
        params.append('event_token', eventToken);
        
        if (gpsAdid) {
            params.append('gps_adid', gpsAdid);
            params.append('os_name', 'android');
        }
        if (idfa) {
            params.append('idfa', idfa);
            params.append('os_name', 'ios');
        }

        const url = `https://s2s.adjust.com/event?${params.toString()}`;
        
        console.log('Direct Adjust Request URL:', url);

        const axios = require('axios');
        const response = await axios.post(url, null, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('Direct Adjust Response:', {
            status: response.status,
            data: response.data
        });

        res.json({
            success: true,
            message: 'Direct request sent',
            requestUrl: url,
            response: {
                status: response.status,
                data: response.data
            }
        });

    } catch (error) {
        console.error('Direct Adjust test error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to send direct request',
            error: error.response?.data || error.message,
            requestUrl: error.config?.url
        });
    }
});

module.exports = router;


/**
 * Adjust S2S API Routes V2
 * Implements S2S event tracking with Firebase App Check, Firebase Auth, event validation, and campaign filtering
 * Based on client document requirements
 * @module routes/adjust-v2
 */

const express = require('express');
const router = express.Router();
const { verifyAppCheck } = require('../middleware/firebaseAppCheck');
const { verifyFirebaseIdToken } = require('../middleware/firebaseAuth');
const { validateLevelEvent, validateEvent } = require('../middleware/eventValidation');
const { checkOfferwallCampaign } = require('../middleware/campaignFilter');
const adjustService = require('../services/adjust.service');
const User = require('../models/User');
const AdjustEventToken = require('../models/AdjustEventToken');
const config = require('../config/config');

/**
 * @route   POST /api/v2/adjust/report-event
 * @desc    Report S2S event to Adjust (V2 - with full security)
 * @access  Private (requires Firebase App Check + Firebase Auth)
 * @headers X-Firebase-AppCheck: <app-check-token>
 * @headers Authorization: Bearer <firebase-id-token>
 * @body    {string} eventType - Event type (e.g., 'level_complete', 'game_complete')
 * @body    {number} levelNumber - Level number (required for level_complete events)
 * @body    {string} eventToken - Adjust event token (required)
 * @body    {string} deviceId - Device identifier (gps_adid, idfa, etc.)
 * @body    {object} metadata - Additional event metadata (optional)
 * @body    {number} revenue - Revenue amount (optional)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {object} callbackParams - Callback parameters (optional)
 * @note    This endpoint implements the full security stack:
 *          - Firebase App Check verification
 *          - Firebase ID token verification
 *          - Event validation (level progression)
 *          - Campaign filtering (offerwall only)
 */
router.post('/report-event',
  verifyAppCheck,              // Step 1: Verify App Check token
  verifyFirebaseIdToken,       // Step 2: Verify Firebase ID token
  checkOfferwallCampaign,      // Step 3: Check if user from offerwall campaign
  validateEvent,               // Step 4: Validate event type and parameters
  validateLevelEvent,          // Step 5: Validate level progression (if level event)
  async (req, res) => {
    try {
      const {
        eventType,
        levelNumber,
        eventToken,
        deviceId,
        metadata = {},
        revenue,
        currency = 'USD',
        callbackParams = {}
      } = req.body;

      // Validate required fields
      if (!eventType) {
        return res.status(400).json({
          success: false,
          error: 'eventType is required',
          code: 'EVENT_TYPE_MISSING'
        });
      }

      if (!eventToken) {
        return res.status(400).json({
          success: false,
          error: 'eventToken is required. Get event tokens from Adjust Dashboard or use GET /api/v2/adjust/events to see available tokens.',
          code: 'EVENT_TOKEN_MISSING'
        });
      }

      // Validate event token exists in database (optional check)
      // This helps ensure only configured events are used
      const eventTokenDoc = await AdjustEventToken.findByToken(eventToken);
      if (eventTokenDoc && !eventTokenDoc.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Event token is inactive',
          code: 'EVENT_TOKEN_INACTIVE'
        });
      }
      
      // If event token exists, use its metadata
      if (eventTokenDoc && eventTokenDoc.isS2S) {
        // Verify this is an S2S event
        req.eventTokenDoc = eventTokenDoc;
      }

      // Get user info
      const userId = req.user?.userId || req.firebaseUser?.uid;
      const userDocument = req.userDocument;

      // Build device identifiers
      // Priority: provided deviceId > user deviceInfo > system device identifier
      const deviceIds = {};
      
      if (deviceId) {
        // Try to determine device type from deviceId format
        // Android: usually starts with specific patterns
        // iOS: UUID format
        if (deviceId.length === 36 && deviceId.includes('-')) {
          // Likely iOS IDFA or similar
          deviceIds.idfa = deviceId;
        } else {
          // Likely Android GPS ADID
          deviceIds.gps_adid = deviceId;
        }
      } else if (userDocument?.deviceInfo) {
        // Use device info from user profile
        const deviceInfo = userDocument.deviceInfo;
        if (deviceInfo.idfa) deviceIds.idfa = deviceInfo.idfa;
        if (deviceInfo.gpsAdid) deviceIds.gps_adid = deviceInfo.gpsAdid;
        if (deviceInfo.fireAdid) deviceIds.fire_adid = deviceInfo.fireAdid;
        if (deviceInfo.oaid) deviceIds.oaid = deviceInfo.oaid;
        if (deviceInfo.webUuid) deviceIds.web_uuid = deviceInfo.webUuid;
        if (deviceInfo.idfv) deviceIds.idfv = deviceInfo.idfv;
        if (deviceInfo.androidId) deviceIds.android_id = deviceInfo.androidId;
      }

      // Ensure at least one device identifier
      if (Object.keys(deviceIds).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Device identifier required. Provide deviceId or ensure user has device info.',
          code: 'DEVICE_ID_MISSING'
        });
      }

      // Build event data for Adjust
      const eventData = {
        event_token: eventToken,
        s2s: '1', // Required for S2S requests
        ...deviceIds
      };

      // Add revenue if provided
      if (revenue !== undefined && revenue !== null) {
        eventData.revenue = Number(revenue);
        eventData.currency = currency;
      }

      // Build callback parameters
      const finalCallbackParams = {
        userId: userId,
        eventType: eventType,
        ...(levelNumber && { level: levelNumber }),
        ...(req.attribution && {
          campaign: req.attribution.campaign,
          network: req.attribution.network
        }),
        ...callbackParams,
        ...metadata
      };

      eventData.callback_params = JSON.stringify(finalCallbackParams);

      // Send event to Adjust S2S API
      const adjustResult = await adjustService.sendEvent(eventData);

      // Update user progress if level event
      if (eventType === 'level_complete' && req.validatedLevel && userDocument) {
        try {
          if (!userDocument.progress) {
            userDocument.progress = {};
          }
          userDocument.progress.lastLevel = req.validatedLevel;
          userDocument.progress.lastLevelCompletedAt = new Date();
          await userDocument.save();
        } catch (updateError) {
          console.error('Error updating user progress:', updateError);
          // Don't fail the request if progress update fails
        }
      }

      // Log successful event
      console.log(`✅ S2S Event tracked: ${eventType} for user ${userId}`, {
        level: levelNumber,
        campaign: req.attribution?.campaign,
        eventToken: eventToken
      });

      return res.status(200).json({
        success: true,
        message: 'Event reported successfully',
        data: {
          eventType: eventType,
          level: levelNumber || null,
          adjustResponse: adjustResult.data,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error reporting S2S event:', error);
      
      return res.status(error.status || 500).json({
        success: false,
        error: error.message || 'Failed to report event',
        code: error.code || 'EVENT_REPORT_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

/**
 * @route   GET /api/v2/adjust/health
 * @desc    Health check for V2 S2S service
 * @access  Public
 */
router.get('/health', async (req, res) => {
  try {
    const { isFirebaseInitialized } = require('../utils/firebaseAdmin');
    const adjustHealth = await adjustService.healthCheck();
    
    res.json({
      success: true,
      data: {
        service: 'Adjust S2S V2',
        firebaseConfigured: isFirebaseInitialized(),
        adjustConfigured: adjustHealth.configured,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/v2/adjust/config
 * @desc    Get configuration info for client
 * @access  Private (requires Firebase Auth)
 */
router.get('/config',
  verifyFirebaseIdToken,
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          version: '2.0',
          requiresAppCheck: true,
          requiresFirebaseAuth: true,
          allowedEventTypes: [
            'level_complete',
            'game_complete',
            'achievement_unlocked',
            'purchase',
            'ad_revenue',
            'session_start',
            'custom'
          ],
          offerwallCampaigns: process.env.OFFERWALL_CAMPAIGNS?.split(',') || [],
          allowLevelSkipping: process.env.ALLOW_LEVEL_SKIPPING === 'true',
          allowOrganicUsers: process.env.ALLOW_ORGANIC_USERS === 'true'
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to get config',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/v2/adjust/events
 * @desc    Get available Adjust event tokens (S2S events only)
 * @access  Private (requires Firebase Auth)
 * @query   category - Filter by category
 * @query   search - Search by name
 */
router.get('/events',
  verifyFirebaseIdToken,
  async (req, res) => {
    try {
      const { category, search } = req.query;
      
      const query = { isS2S: true, isActive: true };
      
      if (category) {
        query.category = category;
      }
      
      if (search) {
        query.name = { $regex: search, $options: 'i' };
      }
      
      const events = await AdjustEventToken.find(query)
        .select('token name category description')
        .sort({ name: 1 })
        .lean();
      
      res.json({
        success: true,
        data: {
          events,
          count: events.length,
          message: 'These are the available S2S event tokens. Use the token field when calling /report-event.'
        }
      });
    } catch (error) {
      console.error('Error fetching Adjust events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get events',
        message: error.message
      });
    }
  }
);

module.exports = router;


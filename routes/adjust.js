/**
 * Adjust S2S API Routes
 * Provides REST API endpoints for frontend to track events via Adjust
 * @module routes/adjust
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const adjustService = require('../services/adjust.service');
const User = require('../models/User');

/**
 * @route   POST /api/adjust/event
 * @desc    Track a custom event to Adjust
 * @access  Private (requires authentication)
 * @body    {string} eventToken - Adjust event token (REQUIRED - get from admin or Adjust Dashboard)
 * @body    {number} revenue - Revenue amount (optional)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {object} callbackParams - Callback parameters (optional)
 * @body    {object} deviceIds - Device identifiers (optional)
 * @note    Event tokens are created in Adjust Dashboard by admins. 
 *          Use GET /api/adjust/events to see available standard events.
 *          For custom events, contact admin to get event tokens.
 */
router.post('/event', protect, async (req, res) => {
  try {
    const { eventToken, revenue, currency = 'USD', callbackParams = {}, deviceIds = {} } = req.body;

    if (!eventToken) {
      return res.status(400).json({
        success: false,
        error: 'eventToken is required. Event tokens are created in Adjust Dashboard by admins. Use GET /api/adjust/events to see available standard events, or contact admin for custom event tokens.'
      });
    }

    // Get user to extract device info if not provided
    const user = await User.findById(req.user.userId).select('deviceInfo').lean();
    
    // Build device identifiers (use provided or from user profile)
    const finalDeviceIds = {
      ...(deviceIds.idfa || user?.deviceInfo?.idfa ? { idfa: deviceIds.idfa || user.deviceInfo.idfa } : {}),
      ...(deviceIds.gps_adid || user?.deviceInfo?.gpsAdid ? { gps_adid: deviceIds.gps_adid || user.deviceInfo.gpsAdid } : {}),
      ...(deviceIds.fire_adid || user?.deviceInfo?.fireAdid ? { fire_adid: deviceIds.fire_adid || user.deviceInfo.fireAdid } : {}),
      ...(deviceIds.oaid || user?.deviceInfo?.oaid ? { oaid: deviceIds.oaid || user.deviceInfo.oaid } : {}),
      ...(deviceIds.web_uuid || user?.deviceInfo?.webUuid ? { web_uuid: deviceIds.web_uuid || user.deviceInfo.webUuid } : {}),
      ...(deviceIds.idfv || user?.deviceInfo?.idfv ? { idfv: deviceIds.idfv || user.deviceInfo.idfv } : {}),
      ...(deviceIds.android_id || user?.deviceInfo?.androidId ? { android_id: deviceIds.android_id || user.deviceInfo.androidId } : {})
    };

    // Build event data
    const eventData = {
      event_token: eventToken,
      ...(revenue !== undefined && revenue !== null ? { revenue: Number(revenue) } : {}),
      currency: currency,
      ...finalDeviceIds
    };

    // Add callback params if provided
    if (Object.keys(callbackParams).length > 0) {
      eventData.callback_params = typeof callbackParams === 'string' 
        ? callbackParams 
        : JSON.stringify({
          userId: req.user.userId,
          ...callbackParams
        });
    } else {
      // Always include userId in callback params
      eventData.callback_params = JSON.stringify({
        userId: req.user.userId
      });
    }

    // Send event to Adjust
    const result = await adjustService.sendEvent(eventData);

    res.json({
      success: true,
      message: 'Event tracked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error tracking Adjust event:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to track event',
      details: error.data || null
    });
  }
});

/**
 * @route   POST /api/adjust/purchase
 * @desc    Track a purchase event to Adjust
 * @access  Private (requires authentication)
 * @body    {string} eventToken - Adjust event token for purchases (optional, uses default if not provided)
 * @body    {number} revenue - Revenue amount (required)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {string} productId - Product ID (optional)
 * @body    {string} purchaseType - Purchase type (optional)
 * @body    {object} deviceIds - Device identifiers (optional)
 */
router.post('/purchase', protect, async (req, res) => {
  try {
    const { 
      eventToken, 
      revenue, 
      currency = 'USD', 
      productId, 
      purchaseType,
      deviceIds = {} 
    } = req.body;

    if (revenue === undefined || revenue === null) {
      return res.status(400).json({
        success: false,
        error: 'revenue is required'
      });
    }

    // Get user to extract device info if not provided
    const user = await User.findById(req.user.userId).select('deviceInfo').lean();
    
    // Build device identifiers
    const finalDeviceIds = {
      ...(deviceIds.idfa || user?.deviceInfo?.idfa ? { idfa: deviceIds.idfa || user.deviceInfo.idfa } : {}),
      ...(deviceIds.gps_adid || user?.deviceInfo?.gpsAdid ? { gps_adid: deviceIds.gps_adid || user.deviceInfo.gpsAdid } : {}),
      ...(deviceIds.fire_adid || user?.deviceInfo?.fireAdid ? { fire_adid: deviceIds.fire_adid || user.deviceInfo.fireAdid } : {}),
      ...(deviceIds.oaid || user?.deviceInfo?.oaid ? { oaid: deviceIds.oaid || user.deviceInfo.oaid } : {}),
      ...(deviceIds.web_uuid || user?.deviceInfo?.webUuid ? { web_uuid: deviceIds.web_uuid || user.deviceInfo.webUuid } : {}),
      ...(deviceIds.idfv || user?.deviceInfo?.idfv ? { idfv: deviceIds.idfv || user.deviceInfo.idfv } : {}),
      ...(deviceIds.android_id || user?.deviceInfo?.androidId ? { android_id: deviceIds.android_id || user.deviceInfo.androidId } : {})
    };

    // Use provided event token or default from env
    const finalEventToken = eventToken || process.env.ADJUST_PURCHASE_EVENT_TOKEN;

    if (!finalEventToken) {
      return res.status(400).json({
        success: false,
        error: 'eventToken is required. Either provide it in the request or set ADJUST_PURCHASE_EVENT_TOKEN in environment variables.'
      });
    }

    // Track purchase
    const result = await adjustService.trackPurchase({
      userId: req.user.userId,
      eventToken: finalEventToken,
      revenue: Number(revenue),
      currency: currency,
      deviceIds: finalDeviceIds,
      callbackParams: {
        productId: productId || null,
        purchaseType: purchaseType || null
      }
    });

    res.json({
      success: true,
      message: 'Purchase tracked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error tracking Adjust purchase:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to track purchase',
      details: error.data || null
    });
  }
});

/**
 * @route   POST /api/adjust/game-complete
 * @desc    Track a game completion event to Adjust
 * @access  Private (requires authentication)
 * @body    {string} eventToken - Adjust event token for game completions (optional)
 * @body    {string} gameId - Game ID (optional)
 * @body    {number} reward - Reward amount (optional)
 * @body    {object} deviceIds - Device identifiers (optional)
 */
router.post('/game-complete', protect, async (req, res) => {
  try {
    const { eventToken, gameId, reward, deviceIds = {} } = req.body;

    // Get user to extract device info if not provided
    const user = await User.findById(req.user.userId).select('deviceInfo').lean();
    
    // Build device identifiers
    const finalDeviceIds = {
      ...(deviceIds.idfa || user?.deviceInfo?.idfa ? { idfa: deviceIds.idfa || user.deviceInfo.idfa } : {}),
      ...(deviceIds.gps_adid || user?.deviceInfo?.gpsAdid ? { gps_adid: deviceIds.gps_adid || user.deviceInfo.gpsAdid } : {}),
      ...(deviceIds.fire_adid || user?.deviceInfo?.fireAdid ? { fire_adid: deviceIds.fire_adid || user.deviceInfo.fireAdid } : {}),
      ...(deviceIds.oaid || user?.deviceInfo?.oaid ? { oaid: deviceIds.oaid || user.deviceInfo.oaid } : {}),
      ...(deviceIds.web_uuid || user?.deviceInfo?.webUuid ? { web_uuid: deviceIds.web_uuid || user.deviceInfo.webUuid } : {}),
      ...(deviceIds.idfv || user?.deviceInfo?.idfv ? { idfv: deviceIds.idfv || user.deviceInfo.idfv } : {}),
      ...(deviceIds.android_id || user?.deviceInfo?.androidId ? { android_id: deviceIds.android_id || user.deviceInfo.androidId } : {})
    };

    // Use provided event token or default from env
    const finalEventToken = eventToken || process.env.ADJUST_GAME_COMPLETE_EVENT_TOKEN;

    if (!finalEventToken) {
      return res.status(400).json({
        success: false,
        error: 'eventToken is required. Either provide it in the request or set ADJUST_GAME_COMPLETE_EVENT_TOKEN in environment variables.'
      });
    }

    // Track game completion
    const result = await adjustService.trackGameCompletion({
      userId: req.user.userId,
      eventToken: finalEventToken,
      deviceIds: finalDeviceIds,
      callbackParams: {
        gameId: gameId || null,
        reward: reward || null
      }
    });

    res.json({
      success: true,
      message: 'Game completion tracked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error tracking Adjust game completion:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to track game completion',
      details: error.data || null
    });
  }
});

/**
 * @route   POST /api/adjust/ad-revenue
 * @desc    Track ad revenue to Adjust
 * @access  Private (requires authentication)
 * @body    {number} revenue - Revenue amount (required)
 * @body    {string} currency - Currency code (required)
 * @body    {string} adRevenueNetwork - Ad network name (required)
 * @body    {string} adRevenuePlacement - Ad placement ID (optional)
 * @body    {string} adRevenueUnit - Ad unit type (optional)
 * @body    {object} deviceIds - Device identifiers (optional)
 */
router.post('/ad-revenue', protect, async (req, res) => {
  try {
    const { 
      revenue, 
      currency, 
      adRevenueNetwork, 
      adRevenuePlacement, 
      adRevenueUnit,
      deviceIds = {} 
    } = req.body;

    if (revenue === undefined || revenue === null) {
      return res.status(400).json({
        success: false,
        error: 'revenue is required'
      });
    }
    if (!currency) {
      return res.status(400).json({
        success: false,
        error: 'currency is required'
      });
    }
    if (!adRevenueNetwork) {
      return res.status(400).json({
        success: false,
        error: 'adRevenueNetwork is required'
      });
    }

    // Get user to extract device info if not provided
    const user = await User.findById(req.user.userId).select('deviceInfo').lean();
    
    // Build device identifiers
    const finalDeviceIds = {
      ...(deviceIds.idfa || user?.deviceInfo?.idfa ? { idfa: deviceIds.idfa || user.deviceInfo.idfa } : {}),
      ...(deviceIds.gps_adid || user?.deviceInfo?.gpsAdid ? { gps_adid: deviceIds.gps_adid || user.deviceInfo.gpsAdid } : {}),
      ...(deviceIds.fire_adid || user?.deviceInfo?.fireAdid ? { fire_adid: deviceIds.fire_adid || user.deviceInfo.fireAdid } : {}),
      ...(deviceIds.oaid || user?.deviceInfo?.oaid ? { oaid: deviceIds.oaid || user.deviceInfo.oaid } : {}),
      ...(deviceIds.web_uuid || user?.deviceInfo?.webUuid ? { web_uuid: deviceIds.web_uuid || user.deviceInfo.webUuid } : {}),
      ...(deviceIds.idfv || user?.deviceInfo?.idfv ? { idfv: deviceIds.idfv || user.deviceInfo.idfv } : {}),
      ...(deviceIds.android_id || user?.deviceInfo?.androidId ? { android_id: deviceIds.android_id || user.deviceInfo.androidId } : {})
    };

    // Track ad revenue
    const result = await adjustService.sendAdRevenue({
      revenue: Number(revenue),
      currency: currency,
      ad_revenue_network: adRevenueNetwork,
      ad_revenue_placement: adRevenuePlacement || null,
      ad_revenue_unit: adRevenueUnit || null,
      ...finalDeviceIds
    });

    res.json({
      success: true,
      message: 'Ad revenue tracked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error tracking Adjust ad revenue:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to track ad revenue',
      details: error.data || null
    });
  }
});

/**
 * @route   POST /api/adjust/session
 * @desc    Track a session to Adjust
 * @access  Private (requires authentication)
 * @body    {object} deviceIds - Device identifiers (optional)
 */
router.post('/session', protect, async (req, res) => {
  try {
    const { deviceIds = {} } = req.body;

    // Get user to extract device info if not provided
    const user = await User.findById(req.user.userId).select('deviceInfo').lean();
    
    // Build device identifiers
    const finalDeviceIds = {
      ...(deviceIds.idfa || user?.deviceInfo?.idfa ? { idfa: deviceIds.idfa || user.deviceInfo.idfa } : {}),
      ...(deviceIds.gps_adid || user?.deviceInfo?.gpsAdid ? { gps_adid: deviceIds.gps_adid || user.deviceInfo.gpsAdid } : {}),
      ...(deviceIds.fire_adid || user?.deviceInfo?.fireAdid ? { fire_adid: deviceIds.fire_adid || user.deviceInfo.fireAdid } : {}),
      ...(deviceIds.oaid || user?.deviceInfo?.oaid ? { oaid: deviceIds.oaid || user.deviceInfo.oaid } : {}),
      ...(deviceIds.web_uuid || user?.deviceInfo?.webUuid ? { web_uuid: deviceIds.web_uuid || user.deviceInfo.webUuid } : {}),
      ...(deviceIds.idfv || user?.deviceInfo?.idfv ? { idfv: deviceIds.idfv || user.deviceInfo.idfv } : {}),
      ...(deviceIds.android_id || user?.deviceInfo?.androidId ? { android_id: deviceIds.android_id || user.deviceInfo.androidId } : {})
    };

    // Track session
    const result = await adjustService.sendSession({
      created_at: new Date().toISOString(),
      ...finalDeviceIds
    });

    res.json({
      success: true,
      message: 'Session tracked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error tracking Adjust session:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to track session',
      details: error.data || null
    });
  }
});

/**
 * @route   GET /api/adjust/health
 * @desc    Check Adjust S2S service health/configuration
 * @access  Private (requires authentication)
 */
router.get('/health', protect, async (req, res) => {
  try {
    const health = await adjustService.healthCheck();
    res.json({
      success: true,
      data: health
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
 * @route   GET /api/adjust/events
 * @desc    Get list of available Adjust event tokens
 * @access  Private (requires authentication)
 * @desc    Returns standard event tokens configured in environment and instructions for custom events
 */
router.get('/events', protect, async (req, res) => {
  try {
    const events = [];

    // Standard events (from environment variables)
    if (process.env.ADJUST_PURCHASE_EVENT_TOKEN) {
      events.push({
        name: 'Purchase',
        eventToken: process.env.ADJUST_PURCHASE_EVENT_TOKEN,
        category: 'purchase',
        endpoint: '/api/adjust/purchase',
        description: 'Track purchase events. Can be called without eventToken.',
        requiresEventToken: false
      });
    }

    if (process.env.ADJUST_GAME_COMPLETE_EVENT_TOKEN) {
      events.push({
        name: 'Game Complete',
        eventToken: process.env.ADJUST_GAME_COMPLETE_EVENT_TOKEN,
        category: 'game',
        endpoint: '/api/adjust/game-complete',
        description: 'Track game completion events. Can be called without eventToken.',
        requiresEventToken: false
      });
    }

    if (process.env.ADJUST_AD_REVENUE_EVENT_TOKEN) {
      events.push({
        name: 'Ad Revenue',
        eventToken: process.env.ADJUST_AD_REVENUE_EVENT_TOKEN,
        category: 'ad',
        endpoint: '/api/adjust/ad-revenue',
        description: 'Track ad revenue. Can be called without eventToken.',
        requiresEventToken: false
      });
    }

    res.json({
      success: true,
      data: {
        events: events,
        message: events.length > 0 
          ? 'Standard events configured. For custom events, contact admin to get event tokens from Adjust Dashboard.'
          : 'No standard events configured. Contact admin to set up event tokens.',
        instructions: {
          standardEvents: 'Standard events (Purchase, Game Complete, Ad Revenue) can be called without providing eventToken. The backend uses default tokens from environment variables.',
          customEvents: 'For custom events, you need to provide eventToken in the request. Event tokens are created in Adjust Dashboard by admins and should be shared with the development team.',
          howToGetTokens: 'To get event tokens: 1) Contact admin, 2) Admin creates events in Adjust Dashboard, 3) Admin shares event tokens with team, 4) Use tokens in /api/adjust/event endpoint'
        }
      }
    });
  } catch (error) {
    console.error('Error getting Adjust events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get events',
      message: error.message
    });
  }
});

module.exports = router;


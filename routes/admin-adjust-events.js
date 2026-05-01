/**
 * Admin Routes for Adjust Event Tokens
 * Manage Adjust event tokens (CRUD operations)
 * @module routes/admin-adjust-events
 */

const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const AdjustEventToken = require('../models/AdjustEventToken');
const AdjustCallback = require('../models/AdjustCallback');
const adjustService = require('../services/adjust.service');

const getReportRows = (reportData) => {
  if (!reportData) return [];
  if (Array.isArray(reportData.rows)) return reportData.rows;
  if (Array.isArray(reportData.result_set)) return reportData.result_set;
  return [];
};

const toInt = (value) => parseInt(value || 0, 10);
const toFloat = (value) => parseFloat(value || 0);
const getActivityTime = (callback) => (
  callback.eventTime ||
  callback.installTime ||
  callback.clickTime ||
  callback.createdAtAdjust ||
  callback.createdAt
);

const getInstallStatus = (callback) => {
  if (callback.activityKind === 'install' || callback.installTime) return 'Installed';
  if (callback.activityKind === 'rejected_install') return 'Rejected';
  if (callback.activityKind === 'click') return 'Clicked';
  if (callback.activityKind === 'event') return 'Event';
  return callback.activityKind || 'Unknown';
};

const formatCallbackRow = (callback) => {
  // Map platform to osName for consistency with Adjust data
  // Adjust sends 'platform' field (iOS, android, etc.)
  const osName = callback.platform || callback.osName || null;

  // Build device identifiers object
  const deviceIdentifiers = {
    idfa: callback.idfa || null,
    idfv: callback.idfv || null,
    gpsAdid: callback.gpsAdid || null,
    fireAdid: callback.fireAdid || null,
    oaid: callback.oaid || null,
    androidId: callback.androidId || null,
    webUuid: callback.webUuid || null,
    adjustUserId: callback.adjustUserId || null
  };

  // Build SKAdNetwork data if applicable
  const skadnetwork = callback.activityKind.includes('skadnetwork') ? {
    conversionValue: callback.skadnetworkConversionValue || null,
    coarseValue: callback.skadnetworkCoarseValue || null,
    version: callback.skVersion || null,
    campaignId: callback.skCampaignId || null,
    networkId: callback.skNetworkId || null,
    fidelityType: callback.skFidelityType || null,
    postbackSequenceIndex: callback.skadnetworkPostbackSequenceIndex || null,
    lockWindow: callback.skadnetworkLockWindow || false,
    payload: callback.skPayload || null
  } : null;

  // Build subscription data if applicable
  const subscription = callback.subscriptionPeriod ? {
    period: callback.subscriptionPeriod || null,
    state: callback.subscriptionState || null,
    productId: callback.subscriptionProductId || null
  } : null;

  return {
    id: callback._id,
    clickId: callback.clickLabel || callback.rawData?.click_id || callback.rawData?.clickId || callback._id?.toString(),
    installStatus: getInstallStatus(callback),
    timestamp: getActivityTime(callback),
    activityKind: callback.activityKind,

    // Source/Attribution info
    source: {
      network: callback.network || (callback.isOrganic ? 'Organic' : 'N/A'),
      campaign: callback.campaign || 'N/A',
      adgroup: callback.adgroup || 'N/A',
      creative: callback.creative || 'N/A',
      trackerToken: callback.trackerToken || 'N/A',
      trackerName: callback.trackerName || 'N/A'
    },

    // Location
    country: callback.country || 'N/A',
    region: callback.region || 'N/A',
    city: callback.city || 'N/A',
    ipAddress: callback.ipAddress || 'N/A',
    userAgent: callback.userAgent || 'N/A',

    // Revenue
    revenue: callback.revenue || 0,
    currency: callback.currency || null,
    reportingRevenue: callback.reportingRevenue || 0,

    // Activity counts
    clicks: callback.activityKind === 'click' ? 1 : 0,
    installs: callback.activityKind === 'install' ? 1 : 0,
    events: callback.activityKind === 'event' ? 1 : 0,

    // Event info
    eventToken: callback.eventToken || null,
    eventName: callback.eventName || null,
    callbackParams: callback.callbackParams || null,
    partnerParams: callback.partnerParams || null,

    // Platform & Device info
    platform: callback.platform || null,
    osName: osName,
    osVersion: callback.osVersion || null,
    deviceType: callback.deviceType || null,
    deviceName: callback.deviceName || null,
    deviceManufacturer: callback.deviceManufacturer || null,
    appVersion: callback.appVersion || null,
    store: callback.store || null,

    // Attribution
    matchType: callback.matchType || null,
    attributionType: callback.attributionType || null,
    isOrganic: callback.isOrganic || false,
    isReattribution: callback.isReattribution || false,

    // iOS ATT
    attStatus: callback.attStatus,

    // Device identifiers (grouped)
    deviceIdentifiers,

    // Timestamps
    clickTime: callback.clickTime || null,
    installTime: callback.installTime || null,
    installedAt: callback.installedAt || null,
    eventTime: callback.eventTime || null,
    impressionTime: callback.impressionTime || null,
    uninstallTime: callback.uninstallTime || null,
    createdAtAdjust: callback.createdAtAdjust || null,

    // SKAdNetwork (iOS)
    skadnetwork,

    // Subscription (if applicable)
    subscription,

    // Additional
    nonce: callback.nonce || null,
    publisherParameter: callback.publisherParameter || null,
    rawData: callback.rawData || {},
    isAggregated: false
  };
};

/**
 * @route   GET /api/admin/adjust-events
 * @desc    Get all Adjust event tokens (with filters)
 * @access  Admin
 * @query   category - Filter by category (Adjust dimension / raw data grouping)
 * @query   isS2S - Filter by S2S events (true/false) - Adjust S2S vs SDK
 * @query   isActive - Filter by active status (true/false)
 * @query   unique - Filter by unique/deduplication flag (true/false)
 * @query   environment - Filter by Adjust environment (sandbox|production)
 * @query   isRevenueEvent - Filter by revenue event (true/false)
 * @query   search - Search by name or token
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const { category, isS2S, isActive, unique, environment, isRevenueEvent, search } = req.query;
    
    // Build query
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (isS2S !== undefined) {
      query.isS2S = isS2S === 'true';
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (unique !== undefined) {
      query.unique = unique === 'true';
    }
    
    if (environment) {
      query.environment = environment;
    }
    
    if (isRevenueEvent !== undefined) {
      query.isRevenueEvent = isRevenueEvent === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { token: { $regex: search, $options: 'i' } }
      ];
    }
    
    const events = await AdjustEventToken.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: events,
      count: events.length
    });
  } catch (error) {
    console.error('Error fetching Adjust event tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event tokens',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/:id
 * @desc    Get single Adjust event token
 * @access  Admin
 */
router.get('/:id([0-9a-fA-F]{24})', adminAuth, async (req, res) => {
  try {
    const event = await AdjustEventToken.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event token not found' });
    }
    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Error fetching event token:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch event token', message: error.message });
  }
});

/**
 * @route   POST /api/admin/adjust-events
 * @desc    Create new Adjust event token
 * @access  Admin
 * @body    {string} token - Event token (required)
 * @body    {string} name - Event name (required)
 * @body    {boolean} unique - Unique flag (default: false)
 * @body    {string} category - Event category (optional)
 * @body    {boolean} isS2S - Is S2S event (optional, auto-detected)
 * @body    {string} description - Description (optional)
 * @body    {object} metadata - Additional metadata (optional)
 */
router.post('/', adminAuth, [
  body('token').trim().notEmpty().withMessage('Token is required'),
  body('name').trim().notEmpty().withMessage('Name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { token, name, unique = false, category, isS2S, environment, isRevenueEvent, description, metadata } = req.body;
    
    // Check if token already exists
    const existing = await AdjustEventToken.findOne({ token });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Event token already exists',
        existingId: existing._id
      });
    }
    
    const event = new AdjustEventToken({
      token,
      name,
      unique,
      category,
      isS2S,
      environment: environment === 'sandbox' ? 'sandbox' : 'production',
      isRevenueEvent: !!isRevenueEvent,
      description,
      metadata: metadata || {}
    });
    
    await event.save();
    
    res.status(201).json({
      success: true,
      message: 'Event token created successfully',
      data: event
    });
  } catch (error) {
    console.error('Error creating Adjust event token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create event token',
      message: error.message
    });
  }
});

/**
 * @route   POST /api/admin/adjust-events/bulk
 * @desc    Bulk import Adjust event tokens
 * @access  Admin
 * @body    {array} events - Array of event objects [{token, name, unique}, ...]
 */
router.post('/bulk', adminAuth, [
  body('events').isArray({ min: 1 }).withMessage('Events array is required'),
  body('events.*.token').trim().notEmpty().withMessage('Token is required for all events'),
  body('events.*.name').trim().notEmpty().withMessage('Name is required for all events')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { events } = req.body;
    const results = {
      created: 0,
      skipped: 0,
      errors: []
    };
    
    for (const eventData of events) {
      try {
        const { token, name, unique = false, category, environment, isRevenueEvent, description, metadata } = eventData;
        
        // Check if exists
        const existing = await AdjustEventToken.findOne({ token });
        if (existing) {
          results.skipped++;
          continue;
        }
        
        const event = new AdjustEventToken({
          token,
          name,
          unique,
          category,
          environment: environment === 'sandbox' ? 'sandbox' : 'production',
          isRevenueEvent: !!isRevenueEvent,
          description,
          metadata: metadata || {}
        });
        
        await event.save();
        results.created++;
      } catch (error) {
        results.errors.push({
          token: eventData.token,
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Bulk import completed: ${results.created} created, ${results.skipped} skipped`,
      data: results
    });
  } catch (error) {
    console.error('Error bulk importing Adjust event tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk import event tokens',
      message: error.message
    });
  }
});

/**
 * @route   PUT /api/admin/adjust-events/:id
 * @desc    Update Adjust event token
 * @access  Admin
 */
router.put('/:id([0-9a-fA-F]{24})', adminAuth, async (req, res) => {
  try {
    const { name, unique, category, isS2S, isActive, environment, isRevenueEvent, description, metadata } = req.body;
    
    const event = await AdjustEventToken.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event token not found'
      });
    }
    
    if (name !== undefined) event.name = name;
    if (unique !== undefined) event.unique = unique;
    if (category !== undefined) event.category = category;
    if (isS2S !== undefined) event.isS2S = isS2S;
    if (isActive !== undefined) event.isActive = isActive;
    if (environment !== undefined) event.environment = environment === 'sandbox' ? 'sandbox' : 'production';
    if (isRevenueEvent !== undefined) event.isRevenueEvent = !!isRevenueEvent;
    if (description !== undefined) event.description = description;
    if (metadata !== undefined) event.metadata = { ...event.metadata, ...metadata };
    
    await event.save();
    
    res.json({
      success: true,
      message: 'Event token updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Error updating Adjust event token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update event token',
      message: error.message
    });
  }
});

/**
 * @route   DELETE /api/admin/adjust-events/:id
 * @desc    Delete Adjust event token
 * @access  Admin
 */
router.delete('/:id([0-9a-fA-F]{24})', adminAuth, async (req, res) => {
  try {
    const event = await AdjustEventToken.findById(req.params.id);
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event token not found'
      });
    }
    
    await event.deleteOne();
    
    res.json({
      success: true,
      message: 'Event token deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Adjust event token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete event token',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/categories/list
 * @desc    Get list of available categories
 * @access  Admin
 */
router.get('/categories/list', adminAuth, async (req, res) => {
  try {
    const categories = await AdjustEventToken.distinct('category');
    const categoryCounts = await AdjustEventToken.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        categories,
        counts: categoryCounts
      }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/s2s/list
 * @desc    Get all S2S event tokens
 * @access  Admin
 */
router.get('/s2s/list', adminAuth, async (req, res) => {
  try {
    const s2sEvents = await AdjustEventToken.find({ isS2S: true, isActive: true })
      .sort({ name: 1 })
      .lean();
    
    res.json({
      success: true,
      data: s2sEvents,
      count: s2sEvents.length
    });
  } catch (error) {
    console.error('Error fetching S2S events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch S2S events',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/:token/analytics
 * @desc    Get analytics data for a specific event token
 * @access  Admin
 * @query   startDate - Start date (YYYY-MM-DD, optional, defaults to 30 days ago)
 * @query   endDate - End date (YYYY-MM-DD, optional, defaults to today)
 * @query   type - Analytics type: 'complete', 'events', 'installs', 'revenue', 'devices' (optional, defaults to 'complete')
 */
router.get('/:token/analytics', adminAuth, async (req, res) => {
  try {
    const { token } = req.params;
    const { startDate, endDate, type = 'complete' } = req.query;

    // Verify token exists in database
    const eventToken = await AdjustEventToken.findByToken(token);
    if (!eventToken) {
      return res.status(404).json({
        success: false,
        error: 'Event token not found in database'
      });
    }

    let analyticsData;

    switch (type) {
      case 'events':
        analyticsData = await adjustService.getEventAnalytics({
          eventToken: token,
          eventName: eventToken.name,
          startDate,
          endDate
        });
        break;
      case 'installs':
        analyticsData = await adjustService.getInstallsBySource({
          eventToken: token,
          eventName: eventToken.name,
          startDate,
          endDate
        });
        break;
      case 'revenue':
        analyticsData = await adjustService.getRevenueData({
          eventToken: token,
          eventName: eventToken.name,
          startDate,
          endDate
        });
        break;
      case 'devices':
        analyticsData = await adjustService.getDeviceLocationData({
          eventToken: token,
          eventName: eventToken.name,
          startDate,
          endDate
        });
        break;
      case 'complete':
      default:
        analyticsData = await adjustService.getTokenAnalytics({
          eventToken: token,
          eventName: eventToken.name,
          startDate,
          endDate
        });
        break;
    }

    res.json({
      success: true,
      data: {
        ...analyticsData.data,
        eventToken: {
          token: eventToken.token,
          name: eventToken.name,
          category: eventToken.category,
          isS2S: eventToken.isS2S
        }
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Failed to fetch analytics',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/callbacks
 * @desc    Get tracking data directly from Adjust API with filters
 * @access  Admin
 * @query   clickId - Filter by click label/ID
 * @query   eventToken - Filter by event token
 * @query   activityKind - Filter by activity type (click, install, event, etc.)
 * @query   country - Filter by country code (e.g., US, IN)
 * @query   network - Filter by network name
 * @query   startDate - Start date (YYYY-MM-DD)
 * @query   endDate - End date (YYYY-MM-DD)
 * @query   page - Page number (default:1)
 * @query   limit - Items per page (default:100)
 * 
 * Uses Adjust Report Service API: GET https://automate.adjust.com/reports-service/report
 * Dimensions: app, click_label, activity_kind, network, campaign, country, created_at, installed_at, event_token, event_name
 * Metrics: clicks, installs, events, revenue, impressions
 */
router.get('/callbacks', adminAuth, async (req, res) => {
  try {
    const {
      clickId,
      eventToken,
      activityKind,
      country,
      network,
      startDate,
      endDate,
      page = 1,
      limit = 100
    } = req.query;

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 100);
    const skip = (pageNumber - 1) * pageSize;

    const callbackQuery = {};
    if (clickId) callbackQuery.clickLabel = { $regex: clickId, $options: 'i' };
    if (eventToken) callbackQuery.eventToken = eventToken;
    if (activityKind) callbackQuery.activityKind = activityKind;
    if (country) callbackQuery.country = country.toUpperCase();
    if (network) callbackQuery.network = { $regex: network, $options: 'i' };
    if (startDate || endDate) {
      callbackQuery.createdAt = {};
      if (startDate) callbackQuery.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) callbackQuery.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const rawTotal = await AdjustCallback.countDocuments(callbackQuery);
    if (rawTotal > 0 || clickId || eventToken || activityKind) {
      const callbacks = await AdjustCallback.find(callbackQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean();

      return res.json({
        success: true,
        data: callbacks.map(formatCallbackRow),
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: rawTotal,
          totalPages: Math.ceil(rawTotal / pageSize)
        },
        source: 'adjust-callbacks',
        note: rawTotal > 0
          ? 'Showing true click-level data stored from Adjust callbacks.'
          : 'No stored Adjust callback rows matched these filters.'
      });
    }

    /* ============================================================
       ONLY use MongoDB webhook data for per-user click-level details.
       Adjust Report Service API returns aggregated totals only —
       it does NOT provide individual click/user records.
       
       Fallback to Adjust API has been commented out until webhooks
       are configured in the Adjust dashboard at:
       Adjust Dashboard → Settings → Raw Data Exports → Set up
       
       Webhook endpoint: POST /api/webhooks/adjust/callback
       ============================================================ */
    
    return res.json({
      success: true,
      data: [],
      pagination: { page: pageNumber, limit: pageSize, total: 0, totalPages: 0 },
      source: 'adjust-callbacks',
      note: 'No individual click-level data found. Please configure Raw Data Exports (webhooks) in Adjust Dashboard → Settings → Raw Data Exports to receive per-user tracking data.'
    });

    /* --- COMMENTED OUT: Adjust Report Service API fallback (returns aggregated data, not per-user) ---
    if (!adjustService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'Adjust API is not configured. Please set ADJUST_API_TOKEN and ADJUST_APP_TOKEN.'
      });
    }

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const isShortRange = (new Date(end) - new Date(start)) <= 7 * 24 * 60 * 60 * 1000;
    const timeDimension = isShortRange ? 'hour' : 'day';

     const filters = {
       app: [adjustService.appToken],
     };

     if (country) {
       filters.country_code = [country.toUpperCase()];
     }

     if (network) {
       filters.network = [network];
     }

    console.log('\n🔍 Adjust API Debug: /callbacks');
    console.log('   Date range:', `${start}:${end}`);
    console.log('   Short range (<=7 days):', isShortRange);
    console.log('   Time dimension:', timeDimension);
    console.log('   Filters:', JSON.stringify(filters, null, 2));

      const response = await adjustService.analyticsClient.get('/report', {
        params: {
          dimensions: `app,network,campaign,adgroup,creative,country_code,country,${timeDimension}`,
          metrics: 'clicks,installs,events,impressions,revenue,daus',
          date_period: `${start}:${end}`,
          app_token__in: adjustService.appToken,
          ...(country ? { country_code__in: country.toUpperCase() } : {}),
          ...(network ? { network__contains: network } : {}),
          sort: `-${timeDimension}`,
          limit: pageSize * pageNumber,
        }
     });

    console.log('✅ Adjust API Response Status:', response.status);
    console.log('   Data rows:', getReportRows(response.data).length);

    if (!response.data) {
      return res.json({
        success: true,
        data: [],
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, totalPages: 0 }
      });
    }

    const resultSet = getReportRows(response.data);
    const paginatedResults = resultSet.slice(skip, skip + pageSize);

    const formattedData = paginatedResults.map(row => ({
      clickId: `${row[timeDimension] || 'time'}-${row.network || 'organic'}-${row.campaign || 'campaign'}-${row.country_code || row.country || 'country'}`,
      installStatus: toInt(row.installs) > 0 ? 'Installed' : (toInt(row.clicks) > 0 ? 'Clicked' : 'No install'),
      timestamp: row[timeDimension] || null,
      date: row[timeDimension] || null,
      activityKind: toInt(row.installs) > 0 ? 'install' : (toInt(row.clicks) > 0 ? 'click' : 'event'),
      source: {
        network: row.network || 'Organic',
        campaign: row.campaign || 'N/A',
        adgroup: row.adgroup || 'N/A',
        creative: row.creative || 'N/A'
      },
      country: row.country_code || row.country || 'N/A',
      revenue: toFloat(row.revenue),
      clicks: toInt(row.clicks),
      installs: toInt(row.installs),
      events: toInt(row.events),
      impressions: toInt(row.impressions),
      daus: row.daus || 0,
      isAggregated: true
    }));

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        total: resultSet.length,
        totalPages: Math.ceil(resultSet.length / pageSize)
      },
      source: 'adjust-report-service',
      note: ''
    });
    --- END COMMENTED OUT --- */
  } catch (error) {
    console.error('Error fetching callbacks from Adjust API:', error);
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: 'Adjust API Error',
        message: error.response.data?.error_desc || error.message,
        adjustError: error.response.data
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch callbacks',
      message: error.message
    });
  }
});
 
/**
 * @route   GET /api/admin/adjust-events/callbacks/:clickId/details
 * @desc    Get tracking details (note: click_label is not a valid Adjust API dimension)
 * @access  Admin
 * @param   clickId - The click ID (not used in API, returns general analytics)
 */
router.get('/callbacks/:clickId/details', adminAuth, async (req, res) => {
  try {
    const { clickId } = req.params;
    const { startDate, endDate } = req.query;

    if (!clickId) {
      return res.status(400).json({
        success: false,
        error: 'Click ID is required'
      });
    }

    const detailQuery = {
      $or: [
        { clickLabel: clickId },
        { trackerToken: clickId },
        { _id: /^[0-9a-fA-F]{24}$/.test(clickId) ? clickId : undefined }
      ].filter((condition) => !Object.values(condition).includes(undefined))
    };

    if (startDate || endDate) {
      detailQuery.createdAt = {};
      if (startDate) detailQuery.createdAt.$gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) detailQuery.createdAt.$lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    const storedCallbacks = await AdjustCallback.find(detailQuery)
      .sort({ createdAt: 1 })
      .lean();

    if (storedCallbacks.length > 0) {
      const rows = storedCallbacks.map(formatCallbackRow);
      const installRow = rows.find((row) => row.installStatus === 'Installed');
      const firstRow = rows[0];

      return res.json({
        success: true,
        data: {
          clickId,
          installStatus: installRow ? 'Installed' : firstRow.installStatus,
          timestamp: firstRow.timestamp,
          summary: {
            totalRecords: rows.length,
            totalClicks: rows.reduce((sum, row) => sum + row.clicks, 0),
            totalInstalls: rows.reduce((sum, row) => sum + row.installs, 0),
            totalEvents: rows.reduce((sum, row) => sum + row.events, 0),
            totalRevenue: rows.reduce((sum, row) => sum + row.revenue, 0)
          },
          attributionInfo: {
            network: firstRow.source.network,
            campaign: firstRow.source.campaign,
            adgroup: firstRow.source.adgroup,
            creative: firstRow.source.creative,
            trackerToken: firstRow.source.trackerToken,
            trackerName: firstRow.source.trackerName,
            matchType: firstRow.matchType
          },
          locationInfo: {
            country: firstRow.country,
            region: firstRow.region,
            city: firstRow.city
          },
          deviceInfo: {
            platform: firstRow.platform,
            osName: firstRow.osName,
            deviceType: firstRow.deviceType,
            deviceName: firstRow.deviceName,
            deviceManufacturer: firstRow.deviceManufacturer,
            appVersion: firstRow.appVersion,
            store: firstRow.store,
            attStatus: firstRow.attStatus,
            nonce: firstRow.nonce
          },
          reportingRevenue: firstRow.reportingRevenue,
          publisherParameter: firstRow.publisherParameter,
          timeline: rows,
          rawData: storedCallbacks.map((callback) => callback.rawData || {}),
          source: 'adjust-callbacks'
        },
        source: 'Adjust callbacks'
      });
    }

    return res.status(404).json({
      success: false,
      error: 'No stored Adjust callback found for this Click ID',
      message: 'Raw click-level details are only available when Adjust callbacks/raw exports are stored in the database.'
    });
  } catch (error) {
    console.error('Error fetching click details:', error);
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: 'Failed to fetch click details',
        message: error.response.data?.error || error.message
      });
    }
    res.status(500).json({
      success: false,
      error: 'Failed to fetch click details',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/adjust-events/analytics/overview
 * @desc    Get comprehensive app-wide analytics with full Adjust data
 * @access  Admin
 * @query   startDate - Start date (YYYY-MM-DD)
 * @query   endDate - End date (YYYY-MM-DD)
 * @query   country - Filter by country code (optional)
 * @query   network - Filter by network (optional)
 */
router.get('/analytics/overview', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, country, network } = req.query;

    const adjustService = require('../services/adjust.service');
    
    if (!adjustService.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'Adjust API is not configured. Please set ADJUST_API_TOKEN and ADJUST_APP_TOKEN.'
      });
    }

    // Use Adjust API to get complete analytics (app-wide)
    const result = await adjustService.getCompleteAnalytics({
      startDate: startDate || null,
      endDate: endDate || null,
      country: country || null,
      network: network || null
    });

    if (!result.success || !result.data) {
      return res.json({
        success: true,
        data: {
          summary: { totalEvents: 0, totalInstalls: 0, totalClicks: 0, totalRevenue: 0, totalImpressions: 0 },
          byCountry: [],
          byNetwork: [],
          clickTracking: [],
          byToken: [],
          byActivity: {}
        },
        source: 'adjust-api'
      });
    }

    const analytics = result.data.analytics || {};
    const summary = result.data.summary || {};

    // Transform sources data to byNetwork and byCountry
    const sourcesData = getReportRows(analytics.sources?.data);
    const byNetwork = sourcesData.map(row => ({
      network: row.network || 'Organic',
      campaign: row.campaign || 'N/A',
      adgroup: row.adgroup || 'N/A',
      creative: row.creative || 'N/A',
      total: (parseInt(row.events || 0) + parseInt(row.installs || 0) + parseInt(row.clicks || 0)),
      installs: parseInt(row.installs || 0),
      events: parseInt(row.events || 0),
      clicks: parseInt(row.clicks || 0),
      impressions: parseInt(row.impressions || 0),
      revenue: parseFloat(row.revenue || 0),
      daus: row.daus || 0
    }));

    const deviceData = getReportRows(analytics.devices?.data);
    const countryMap = {};
    deviceData.forEach(row => {
      const countryKey = row.country_code || row.country;
      if (countryKey) {
        if (!countryMap[countryKey]) {
          countryMap[countryKey] = { country: countryKey, installs: 0, events: 0, revenue: 0, impressions: 0 };
        }
        countryMap[countryKey].installs += parseInt(row.installs || 0);
        countryMap[countryKey].events += parseInt(row.events || 0);
        countryMap[countryKey].revenue += parseFloat(row.revenue || 0);
        countryMap[countryKey].impressions += parseInt(row.impressions || 0);
        countryMap[countryKey].daus = row.daus || 0;
      }
    });
    const byCountry = Object.values(countryMap);

    // Transform click tracking data
    const clickData = getReportRows(analytics.clickTracking?.data);
    const clickTracking = clickData.map(row => ({
      clickId: row.click_label || `${row.hour || row.day || 'date'}-${row.network || 'organic'}-${row.campaign || 'campaign'}-${row.country_code || row.country || 'country'}`,
      installStatus: parseInt(row.installs || 0) > 0 ? 'Installed' : (parseInt(row.clicks || 0) > 0 ? 'Clicked' : 'No install'),
      count: parseInt(row.clicks || 0) + parseInt(row.installs || 0) + parseInt(row.events || 0),
      hasInstall: parseInt(row.installs || 0) > 0,
      hasEvent: parseInt(row.events || 0) > 0,
      timestamp: row.hour || row.day || null,
      date: row.hour || row.day || null,
      isAggregated: true,
      ...row
    }));

    // Format the response for frontend
    const response = {
      success: true,
      data: {
        summary: summary,
        byCountry: byCountry,
        byNetwork: byNetwork,
        clickTracking: clickTracking,
        byToken: [], // event_token dimension not available
        byActivity: {}, // activity_kind dimension not available
        raw: {
          kpis: getReportRows(analytics.kpis?.data),
          sources: sourcesData,
          devices: deviceData,
          clickTracking: clickData,
          revenue: getReportRows(analytics.revenue?.data)
        }
      },
      source: 'adjust-api'
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching analytics overview from Adjust API:', error);
    
    // Return proper error from Adjust API
    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        error: 'Adjust API Error',
        message: error.response.data?.error_desc || error.message,
        adjustError: error.response.data
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics overview',
      message: error.message
    });
  }
});

module.exports = router;


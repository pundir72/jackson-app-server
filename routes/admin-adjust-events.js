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
const adjustService = require('../services/adjust.service');

/**
 * @route   GET /api/admin/adjust-events
 * @desc    Get all Adjust event tokens (with filters)
 * @access  Admin
 * @query   category - Filter by category
 * @query   isS2S - Filter by S2S events (true/false)
 * @query   isActive - Filter by active status (true/false)
 * @query   search - Search by name or token
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const { category, isS2S, isActive, search } = req.query;
    
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
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const event = await AdjustEventToken.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event token not found'
      });
    }
    
    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Error fetching Adjust event token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event token',
      message: error.message
    });
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
    
    const { token, name, unique = false, category, isS2S, description, metadata } = req.body;
    
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
        const { token, name, unique = false, category, description, metadata } = eventData;
        
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
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, unique, category, isS2S, isActive, description, metadata } = req.body;
    
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
router.delete('/:id', adminAuth, async (req, res) => {
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
          startDate,
          endDate
        });
        break;
      case 'installs':
        analyticsData = await adjustService.getInstallsBySource({
          eventToken: token,
          startDate,
          endDate
        });
        break;
      case 'revenue':
        analyticsData = await adjustService.getRevenueData({
          eventToken: token,
          startDate,
          endDate
        });
        break;
      case 'devices':
        analyticsData = await adjustService.getDeviceLocationData({
          eventToken: token,
          startDate,
          endDate
        });
        break;
      case 'complete':
      default:
        analyticsData = await adjustService.getCompleteAnalytics({
          eventToken: token,
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

module.exports = router;


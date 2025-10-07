const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const mongoose = require('mongoose');

// Import models
const SurveySDK = require('../models/SurveySDK');
const SurveyOffer = require('../models/SurveyOffer');
const SurveyAnalytics = require('../models/SurveyAnalytics');
const User = require('../models/User');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// ==================== SDK MANAGEMENT ====================

// Get all SDKs with filtering and pagination
router.get('/sdk/list', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all',
      category = 'all'
    } = req.query;
    
    let query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== 'all') {
      query.isActive = status === 'active';
    }
    
    // Category filter
    if (category !== 'all') {
      query['metadata.category'] = category;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [sdks, total] = await Promise.all([
      SurveySDK.find(query)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .lean(),
      SurveySDK.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: {
        sdks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting SDK list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SDK list',
      error: error.message
    });
  }
});

// Get specific SDK
router.get('/sdk/:id', adminAuth, async (req, res) => {
  try {
    const sdk = await SurveySDK.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }
    
    res.json({
      success: true,
      data: sdk
    });
  } catch (error) {
    console.error('Error getting SDK:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SDK',
      error: error.message
    });
  }
});

// Create new SDK
router.post('/sdk', adminAuth, [
  body('name').notEmpty().withMessage('SDK name is required'),
  body('displayName').notEmpty().withMessage('Display name is required'),
  body('apiKey').notEmpty().withMessage('API key is required'),
  body('baseUrl').isURL().withMessage('Base URL must be valid')
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
    
    const sdkData = {
      ...req.body,
      createdBy: req.user.userId
    };
    
    const sdk = new SurveySDK(sdkData);
    await sdk.save();
    
    res.status(201).json({
      success: true,
      message: 'SDK created successfully',
      data: sdk
    });
  } catch (error) {
    console.error('Error creating SDK:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create SDK',
      error: error.message
    });
  }
});

// Update SDK configuration
router.put('/sdk/:id/config', adminAuth, [
  body('displayName').optional().notEmpty().withMessage('Display name cannot be empty'),
  body('apiKey').optional().notEmpty().withMessage('API key cannot be empty'),
  body('baseUrl').optional().isURL().withMessage('Base URL must be valid'),
  body('maxDailyUsers').optional().isInt({ min: 1 }).withMessage('Max daily users must be a positive integer')
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
    
    const updateData = {
      ...req.body,
      updatedBy: req.user.userId
    };
    
    const sdk = await SurveySDK.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }
    
    res.json({
      success: true,
      message: 'SDK configuration updated successfully',
      data: sdk
    });
  } catch (error) {
    console.error('Error updating SDK config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SDK configuration',
      error: error.message
    });
  }
});

// Update SDK segment rules
router.put('/sdk/:id/segments', adminAuth, [
  body('segmentRules.age').optional().isArray().withMessage('Age must be an array'),
  body('segmentRules.gender').optional().isArray().withMessage('Gender must be an array'),
  body('segmentRules.countries').optional().isArray().withMessage('Countries must be an array'),
  body('segmentRules.isEnabled').optional().isBoolean().withMessage('Enabled status must be boolean')
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
    
    const sdk = await SurveySDK.findById(req.params.id);
    
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }
    
    sdk.segmentRules = {
      ...sdk.segmentRules,
      ...req.body.segmentRules
    };
    sdk.updatedBy = req.user.userId;
    
    await sdk.save();
    
    res.json({
      success: true,
      message: 'Segment rules updated successfully',
      data: sdk.segmentRules
    });
  } catch (error) {
    console.error('Error updating segment rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update segment rules',
      error: error.message
    });
  }
});

// Toggle SDK status
router.patch('/sdk/:id/status', adminAuth, async (req, res) => {
  try {
    const sdk = await SurveySDK.findById(req.params.id);
    
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }
    
    sdk.isActive = !sdk.isActive;
    sdk.updatedBy = req.user.userId;
    
    await sdk.save();
    
    res.json({
      success: true,
      message: `SDK ${sdk.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: sdk.isActive }
    });
  } catch (error) {
    console.error('Error toggling SDK status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle SDK status',
      error: error.message
    });
  }
});

// Preview audience for segment rules
router.post('/sdk/audience-preview', adminAuth, [
  body('segmentRules.age').optional().isArray().withMessage('Age must be an array'),
  body('segmentRules.gender').optional().isArray().withMessage('Gender must be an array'),
  body('segmentRules.countries').optional().isArray().withMessage('Countries must be an array')
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
    
    const { segmentRules } = req.body;
    let userQuery = {};
    
    // Build query based on segment rules
    if (segmentRules.age && segmentRules.age.length > 0) {
      // Convert age groups to age ranges
      const ageRanges = segmentRules.age.map(ageGroup => {
        switch (ageGroup) {
          case '18-24': return { age: { $gte: 18, $lte: 24 } };
          case '25-34': return { age: { $gte: 25, $lte: 34 } };
          case '35-44': return { age: { $gte: 35, $lte: 44 } };
          case '45-54': return { age: { $gte: 45, $lte: 54 } };
          case '55-64': return { age: { $gte: 55, $lte: 64 } };
          case '65+': return { age: { $gte: 65 } };
          default: return {};
        }
      });
      userQuery.$or = ageRanges;
    }
    
    if (segmentRules.gender && segmentRules.gender.length > 0) {
      userQuery.gender = { $in: segmentRules.gender };
    }
    
    if (segmentRules.countries && segmentRules.countries.length > 0) {
      userQuery.country = { $in: segmentRules.countries };
    }
    
    const matchingUsers = await User.countDocuments(userQuery);
    
    res.json({
      success: true,
      data: {
        segmentRules,
        matchingUsers,
        percentage: await User.countDocuments() > 0 ? 
          ((matchingUsers / await User.countDocuments()) * 100).toFixed(2) : 0
      }
    });
  } catch (error) {
    console.error('Error previewing audience:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to preview audience',
      error: error.message
    });
  }
});

// ==================== LIVE OFFERS & ANALYTICS ====================

// Create new offer manually
router.post('/offers', adminAuth, [
  body('sdkId').isMongoId().withMessage('SDK ID is required and must be valid'),
  body('externalId').notEmpty().withMessage('External ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('coinReward').isInt({ min: 1 }).withMessage('Coin reward must be a positive integer'),
  body('estimatedTime').isInt({ min: 1 }).withMessage('Estimated time must be a positive integer'),
  body('category').optional().isIn(['finance', 'shopping', 'entertainment', 'technology', 'health', 'travel', 'education', 'other']).withMessage('Invalid category'),
  body('status').optional().isIn(['live', 'paused', 'completed', 'expired', 'error']).withMessage('Invalid status')
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

    // Check if SDK exists
    const sdk = await SurveySDK.findById(req.body.sdkId);
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }

    // Check if offer with same external ID already exists for this SDK
    const existingOffer = await SurveyOffer.findOne({
      sdkId: req.body.sdkId,
      externalId: req.body.externalId
    });

    if (existingOffer) {
      return res.status(409).json({
        success: false,
        message: 'Offer with this external ID already exists for this SDK'
      });
    }

    const offerData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const offer = new SurveyOffer(offerData);
    await offer.save();

    // Populate the response
    await offer.populate('sdkId', 'name displayName');

    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: offer
    });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create offer',
      error: error.message
    });
  }
});

// Sync offers from external SDK
router.post('/offers/sync/:sdkId', adminAuth, async (req, res) => {
  try {
    const sdk = await SurveySDK.findById(req.params.sdkId);
    
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }

    if (!sdk.isActive) {
      return res.status(400).json({
        success: false,
        message: 'SDK is not active'
      });
    }

    // This is where you would integrate with the actual SDK API
    // For now, we'll simulate fetching offers from external SDK
    const mockExternalOffers = [
      {
        externalId: `ext_${Date.now()}_1`,
        title: 'Crypto Investment Survey',
        description: 'Share your thoughts on cryptocurrency investments',
        category: 'finance',
        coinReward: 150,
        estimatedTime: 8,
        targetAudience: {
          age: ['25-34', '35-44'],
          gender: ['male', 'female'],
          countries: ['US', 'CA']
        },
        requirements: {
          minAge: 18,
          maxAge: 65,
          deviceType: ['ios', 'android']
        },
        content: {
          instructions: 'Please answer all questions honestly',
          questions: [
            {
              id: 'q1',
              text: 'Do you currently invest in cryptocurrency?',
              type: 'yes_no',
              required: true
            }
          ]
        }
      },
      {
        externalId: `ext_${Date.now()}_2`,
        title: 'Shopping Habits Survey',
        description: 'Tell us about your online shopping preferences',
        category: 'shopping',
        coinReward: 200,
        estimatedTime: 12,
        targetAudience: {
          age: ['18-24', '25-34'],
          gender: ['male', 'female'],
          countries: ['US', 'GB']
        }
      }
    ];

    let syncedOffers = [];
    let updatedOffers = [];
    let errors = [];

    for (const externalOffer of mockExternalOffers) {
      try {
        // Check if offer already exists
        let offer = await SurveyOffer.findOne({
          sdkId: req.params.sdkId,
          externalId: externalOffer.externalId
        });

        if (offer) {
          // Update existing offer
          Object.assign(offer, {
            ...externalOffer,
            updatedBy: req.user.userId,
            status: 'live' // Reactivate when syncing
          });
          await offer.save();
          updatedOffers.push(offer);
        } else {
          // Create new offer
          const newOffer = new SurveyOffer({
            ...externalOffer,
            sdkId: req.params.sdkId,
            status: 'live',
            createdBy: req.user.userId
          });
          await newOffer.save();
          syncedOffers.push(newOffer);
        }
      } catch (offerError) {
        errors.push({
          externalId: externalOffer.externalId,
          error: offerError.message
        });
      }
    }

    // Update SDK analytics
    sdk.analytics.totalOffers += syncedOffers.length;
    sdk.analytics.lastSyncAt = new Date();
    await sdk.save();

    res.json({
      success: true,
      message: 'Offers synced successfully',
      data: {
        syncedCount: syncedOffers.length,
        updatedCount: updatedOffers.length,
        errorCount: errors.length,
        syncedOffers: syncedOffers.map(offer => ({
          id: offer._id,
          externalId: offer.externalId,
          title: offer.title,
          coinReward: offer.coinReward
        })),
        updatedOffers: updatedOffers.map(offer => ({
          id: offer._id,
          externalId: offer.externalId,
          title: offer.title,
          coinReward: offer.coinReward
        })),
        errors
      }
    });
  } catch (error) {
    console.error('Error syncing offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync offers',
      error: error.message
    });
  }
});

// Bulk create offers
router.post('/offers/bulk', adminAuth, [
  body('sdkId').isMongoId().withMessage('SDK ID is required and must be valid'),
  body('offers').isArray({ min: 1 }).withMessage('Offers array is required and cannot be empty'),
  body('offers.*.externalId').notEmpty().withMessage('Each offer must have an external ID'),
  body('offers.*.title').notEmpty().withMessage('Each offer must have a title'),
  body('offers.*.coinReward').isInt({ min: 1 }).withMessage('Each offer must have a positive coin reward'),
  body('offers.*.estimatedTime').isInt({ min: 1 }).withMessage('Each offer must have estimated time')
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

    const { sdkId, offers } = req.body;

    // Check if SDK exists
    const sdk = await SurveySDK.findById(sdkId);
    if (!sdk) {
      return res.status(404).json({
        success: false,
        message: 'SDK not found'
      });
    }

    let createdOffers = [];
    let skippedOffers = [];
    let failedOffers = [];

    for (const offerData of offers) {
      try {
        // Check if offer already exists
        const existingOffer = await SurveyOffer.findOne({
          sdkId: sdkId,
          externalId: offerData.externalId
        });

        if (existingOffer) {
          skippedOffers.push({
            externalId: offerData.externalId,
            title: offerData.title,
            reason: 'Already exists'
          });
          continue;
        }

        const newOffer = new SurveyOffer({
          ...offerData,
          sdkId: sdkId,
          status: offerData.status || 'live',
          createdBy: req.user.userId
        });

        await newOffer.save();
        createdOffers.push({
          id: newOffer._id,
          externalId: newOffer.externalId,
          title: newOffer.title,
          coinReward: newOffer.coinReward
        });
      } catch (offerError) {
        failedOffers.push({
          externalId: offerData.externalId,
          title: offerData.title,
          error: offerError.message
        });
      }
    }

    // Update SDK analytics
    sdk.analytics.totalOffers += createdOffers.length;
    sdk.analytics.lastSyncAt = new Date();
    await sdk.save();

    res.status(201).json({
      success: true,
      message: 'Bulk offer creation completed',
      data: {
        totalProcessed: offers.length,
        createdCount: createdOffers.length,
        skippedCount: skippedOffers.length,
        failedCount: failedOffers.length,
        createdOffers,
        skippedOffers,
        failedOffers
      }
    });
  } catch (error) {
    console.error('Error bulk creating offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk create offers',
      error: error.message
    });
  }
});

// Get live offers with filtering and analytics
router.get('/offers/live', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sdkId').optional().isMongoId().withMessage('SDK ID must be valid'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('status').optional().isIn(['live', 'paused', 'completed', 'expired']).withMessage('Invalid status'),
  query('sortBy').optional().isIn(['title', 'coinReward', 'completions', 'conversionRate', 'createdAt']).withMessage('Invalid sort field'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc')
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
    
    const { 
      page = 1, 
      limit = 20, 
      sdkId = '', 
      category = '', 
      status = 'live',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    let query = {};
    
    // SDK filter
    if (sdkId) {
      query.sdkId = sdkId;
    }
    
    // Category filter
    if (category) {
      query.category = category;
    }
    
    // Status filter
    if (status) {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sortObj = {};
    sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const [offers, total] = await Promise.all([
      SurveyOffer.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('sdkId', 'name displayName')
        .lean(),
      SurveyOffer.countDocuments(query)
    ]);
    
    // Add engagement funnel data to each offer
    const offersWithAnalytics = offers.map(offer => ({
      ...offer,
      engagementFunnel: {
        views: offer.analytics.views,
        starts: offer.analytics.starts,
        completions: offer.analytics.completions,
        conversionRate: offer.analytics.conversionRate,
        avgCompletionTime: offer.analytics.avgCompletionTime
      }
    }));
    
    res.json({
      success: true,
      data: {
        offers: offersWithAnalytics,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting live offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get live offers',
      error: error.message
    });
  }
});

// Get specific offer with detailed analytics
router.get('/offers/:id', adminAuth, async (req, res) => {
  try {
    const offer = await SurveyOffer.findById(req.params.id)
      .populate('sdkId', 'name displayName')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    // Get detailed analytics for the offer
    const analytics = await SurveyAnalytics.getOfferPerformance(
      req.params.id,
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      new Date()
    );
    
    res.json({
      success: true,
      data: {
        ...offer.toObject(),
        detailedAnalytics: analytics
      }
    });
  } catch (error) {
    console.error('Error getting offer details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offer details',
      error: error.message
    });
  }
});

// Update offer status
router.patch('/offers/:id/status', adminAuth, [
  body('status').isIn(['live', 'paused', 'completed', 'expired']).withMessage('Invalid status')
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
    
    const offer = await SurveyOffer.findById(req.params.id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    const oldStatus = offer.status;
    offer.status = req.body.status;
    offer.updatedBy = req.user.userId;
    
    await offer.save();
    
    res.json({
      success: true,
      message: `Offer status updated from ${oldStatus} to ${req.body.status}`,
      data: { 
        id: offer._id,
        status: offer.status,
        previousStatus: oldStatus
      }
    });
  } catch (error) {
    console.error('Error updating offer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer status',
      error: error.message
    });
  }
});

// Update offer coin reward
router.patch('/offers/:id/reward', adminAuth, [
  body('coinReward').isInt({ min: 1 }).withMessage('Coin reward must be a positive integer')
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
    
    const offer = await SurveyOffer.findById(req.params.id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    const oldReward = offer.coinReward;
    offer.coinReward = req.body.coinReward;
    offer.updatedBy = req.user.userId;
    
    await offer.save();
    
    res.json({
      success: true,
      message: `Offer reward updated from ${oldReward} to ${req.body.coinReward} coins`,
      data: { 
        id: offer._id,
        coinReward: offer.coinReward,
        previousReward: oldReward
      }
    });
  } catch (error) {
    console.error('Error updating offer reward:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer reward',
      error: error.message
    });
  }
});

// ==================== PERFORMANCE ANALYTICS ====================

// Get SDK performance statistics
router.get('/performance/stats', adminAuth, [
  query('sdkId').optional().isMongoId().withMessage('SDK ID must be valid'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date'),
  query('period').optional().isIn(['day', 'week', 'month']).withMessage('Period must be day, week, or month')
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
    
    const { sdkId, startDate, endDate, period = 'day' } = req.query;
    
    let dateRange = {};
    if (startDate || endDate) {
      dateRange.createdAt = {};
      if (startDate) dateRange.createdAt.$gte = new Date(startDate);
      if (endDate) dateRange.createdAt.$lte = new Date(endDate);
    } else {
      // Default to last 30 days if no date range specified
      dateRange.createdAt = {
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      };
    }
    
    let query = { ...dateRange };
    if (sdkId) {
      query.sdkId = sdkId;
    }
    
    // Get performance metrics
    const performance = await SurveyAnalytics.getSDKPerformance(
      sdkId,
      dateRange.createdAt?.$gte,
      dateRange.createdAt?.$lte
    );
    
    // Get top performing offers
    const topOffers = await SurveyAnalytics.getTopPerformers(10, dateRange.createdAt?.$gte, dateRange.createdAt?.$lte);
    
    // Get conversion funnel
    const conversionFunnel = await SurveyAnalytics.getConversionFunnel(
      sdkId,
      null,
      dateRange.createdAt?.$gte,
      dateRange.createdAt?.$lte
    );
    
    res.json({
      success: true,
      data: {
        performance,
        topOffers,
        conversionFunnel,
        dateRange: {
          startDate: dateRange.createdAt?.$gte,
          endDate: dateRange.createdAt?.$lte,
          period
        }
      }
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance statistics',
      error: error.message
    });
  }
});

// Export performance data
router.get('/performance/export', adminAuth, [
  query('format').optional().isIn(['csv', 'json']).withMessage('Format must be csv or json'),
  query('sdkId').optional().isMongoId().withMessage('SDK ID must be valid'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date')
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
    
    const { format = 'csv', sdkId, startDate, endDate } = req.query;
    
    let query = {};
    if (sdkId) {
      query.sdkId = sdkId;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const offers = await SurveyOffer.find(query)
      .populate('sdkId', 'name displayName')
      .sort({ createdAt: -1 })
      .lean();
    
    if (format === 'csv') {
      // Generate CSV data
      const csvHeaders = [
        'Offer ID', 'Title', 'SDK', 'Category', 'Coin Reward', 'Status',
        'Views', 'Starts', 'Completions', 'Conversion Rate', 'Avg Completion Time',
        'Coins Issued', 'Created At'
      ];
      
      const csvRows = offers.map(offer => [
        offer._id,
        offer.title,
        offer.sdkId?.displayName || offer.sdkId?.name,
        offer.category,
        offer.coinReward,
        offer.status,
        offer.analytics.views,
        offer.analytics.starts,
        offer.analytics.completions,
        offer.analytics.conversionRate.toFixed(2) + '%',
        offer.analytics.avgCompletionTime + 's',
        offer.analytics.coinsIssued,
        offer.createdAt.toISOString()
      ]);
      
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="survey_performance_export.csv"');
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: {
          offers,
          exportInfo: {
            totalOffers: offers.length,
            exportedAt: new Date().toISOString(),
            filters: { sdkId, startDate, endDate }
          }
        }
      });
    }
  } catch (error) {
    console.error('Error exporting performance data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export performance data',
      error: error.message
    });
  }
});

// Get segmented performance analytics
router.get('/performance/segmented', adminAuth, [
  query('segmentType').isIn(['age', 'gender', 'country']).withMessage('Segment type must be age, gender, or country'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601 date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601 date')
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
    
    const { segmentType, startDate, endDate } = req.query;
    
    const segmentedPerformance = await SurveyAnalytics.getSegmentedPerformance(
      segmentType,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );
    
    res.json({
      success: true,
      data: {
        segmentType,
        performance: segmentedPerformance,
        dateRange: {
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null
        }
      }
    });
  } catch (error) {
    console.error('Error getting segmented performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get segmented performance',
      error: error.message
    });
  }
});

module.exports = router;

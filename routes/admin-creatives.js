/**
 * Admin Creative Management Routes
 * Upload, manage, and track marketing creatives/banners
 * @module routes/admin-creatives
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { body, query, validationResult } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const Creative = require('../models/Creative');
const config = require('../config/config');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/creatives');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'creative-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/png', 'image/jpg', 'image/jpeg', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PNG, JPG, JPEG, and WEBP files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// ==================== CREATIVES CRUD ====================

/**
 * @route   GET /api/admin/creatives
 * @desc    List all creatives with filters
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} search - Search in title, PID, placement
 * @query   {string} placement - Filter by placement
 * @query   {string} campaignPID - Filter by campaign PID
 * @query   {string} segment - Filter by segment
 * @query   {string} status - Filter by status (Active/Inactive)
 * @query   {string} startDate - Filter by creation start date
 * @query   {string} endDate - Filter by creation end date
 * @access  Admin
 */
router.get('/', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
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
      limit = 10,
      search,
      placement,
      campaignPID,
      segment,
      status,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = { isDeleted: false };

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { campaignPID: { $regex: search, $options: 'i' } },
        { placement: { $regex: search, $options: 'i' } },
        { segment: { $regex: search, $options: 'i' } }
      ];
    }

    // Filters
    if (placement) query.placement = placement;
    if (campaignPID) query.campaignPID = campaignPID;
    if (segment) query.segment = { $regex: segment, $options: 'i' };
    if (status) query.status = status;

    // Date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [creatives, total] = await Promise.all([
      Creative.find(query)
        .select('-auditLog') // Exclude audit log from list view
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .lean(),
      Creative.countDocuments(query)
    ]);

    // Format creatives for frontend
    const formattedCreatives = creatives.map(creative => ({
      ...creative,
      id: creative._id,
      ctr: `${creative.analytics.ctr.toFixed(2)}%`,
      imageUrl: creative.imageUrl.startsWith('http') 
        ? creative.imageUrl 
        : `${config.IMAGE_BASE_URL}${creative.imageUrl}`
    }));

    res.json({
      success: true,
      data: {
        creatives: formattedCreatives,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error listing creatives:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list creatives',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/admin/creatives/:id
 * @desc    Get single creative by ID
 * @access  Admin
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const creative = await Creative.findOne({
      _id: req.params.id,
      isDeleted: false
    })
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

    if (!creative) {
      return res.status(404).json({
        success: false,
        error: 'Creative not found'
      });
    }

    // Add audit log entry
    await creative.addAuditLog('VIEW', req.user.userId);

    res.json({
      success: true,
      data: {
        ...creative.toObject(),
        imageUrl: creative.imageUrl.startsWith('http') 
          ? creative.imageUrl 
          : `${config.IMAGE_BASE_URL}${creative.imageUrl}`
      }
    });
  } catch (error) {
    console.error('Error getting creative:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get creative'
    });
  }
});

/**
 * @route   POST /api/admin/creatives
 * @desc    Create new creative with file upload
 * @access  Admin
 */
router.post('/', adminAuth, upload.single('file'), [
  body('title').notEmpty().withMessage('Title is required')
    .isLength({ min: 3, max: 50 }).withMessage('Title must be 3-50 characters')
    .matches(/^[a-zA-Z0-9\s]+$/).withMessage('Title must be alphanumeric only'),
  body('placement').notEmpty().withMessage('Placement is required'),
  body('campaignPID').notEmpty().withMessage('Campaign PID is required')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('PID must be alphanumeric with underscores only'),
  body('segment').notEmpty().withMessage('Target segment is required'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Creative file is required'
      });
    }

    // Check for duplicate title
    const existing = await Creative.findOne({
      title: req.body.title,
      isDeleted: false
    });

    if (existing) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      
      return res.status(409).json({
        success: false,
        error: 'Creative with this title already exists'
      });
    }

    // Get image dimensions using sharp
    const metadata = await sharp(req.file.path).metadata();

    // Create creative
    const creative = new Creative({
      title: req.body.title,
      placement: req.body.placement,
      campaignPID: req.body.campaignPID,
      segment: req.body.segment,
      status: req.body.status || 'Active',
      imageUrl: `/uploads/creatives/${req.file.filename}`,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      metadata: {
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        aspectRatio: `${metadata.width}:${metadata.height}`,
        priority: req.body.priority || 0,
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        notes: req.body.notes || ''
      },
      createdBy: req.user.userId,
      auditLog: [{
        action: 'CREATE',
        adminId: req.user.userId,
        timestamp: new Date()
      }]
    });

    await creative.save();

    res.status(201).json({
      success: true,
      message: 'Creative created successfully',
      data: {
        ...creative.toObject(),
        id: creative._id,
        imageUrl: `${config.IMAGE_BASE_URL}${creative.imageUrl}`
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }

    console.error('Error creating creative:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create creative',
      message: error.message
    });
  }
});

/**
 * @route   PUT /api/admin/creatives/:id
 * @desc    Update creative
 * @access  Admin
 */
router.put('/:id', adminAuth, upload.single('file'), [
  body('title').optional().isLength({ min: 3, max: 50 }).withMessage('Title must be 3-50 characters')
    .matches(/^[a-zA-Z0-9\s]+$/).withMessage('Title must be alphanumeric only'),
  body('placement').optional().notEmpty().withMessage('Placement cannot be empty'),
  body('campaignPID').optional().matches(/^[a-zA-Z0-9_]+$/).withMessage('PID must be alphanumeric with underscores only'),
  body('status').optional().isIn(['Active', 'Inactive']).withMessage('Status must be Active or Inactive')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Clean up uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const creative = await Creative.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!creative) {
      // Clean up uploaded file
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      
      return res.status(404).json({
        success: false,
        error: 'Creative not found'
      });
    }

    // Check for duplicate title if title is being updated
    if (req.body.title && req.body.title !== creative.title) {
      const existing = await Creative.findOne({
        title: req.body.title,
        isDeleted: false,
        _id: { $ne: creative._id }
      });

      if (existing) {
        if (req.file) fs.unlinkSync(req.file.path);
        
        return res.status(409).json({
          success: false,
          error: 'Creative with this title already exists'
        });
      }
    }

    // Track changes for audit log
    const changes = {};
    
    // Update fields
    if (req.body.title) {
      changes.title = { from: creative.title, to: req.body.title };
      creative.title = req.body.title;
    }
    if (req.body.placement) {
      changes.placement = { from: creative.placement, to: req.body.placement };
      creative.placement = req.body.placement;
    }
    if (req.body.campaignPID) {
      changes.campaignPID = { from: creative.campaignPID, to: req.body.campaignPID };
      creative.campaignPID = req.body.campaignPID;
    }
    if (req.body.segment) {
      changes.segment = { from: creative.segment, to: req.body.segment };
      creative.segment = req.body.segment;
    }
    if (req.body.status) {
      changes.status = { from: creative.status, to: req.body.status };
      creative.status = req.body.status;
    }

    // Update metadata
    if (req.body.priority !== undefined) creative.metadata.priority = req.body.priority;
    if (req.body.startDate) creative.metadata.startDate = new Date(req.body.startDate);
    if (req.body.endDate) creative.metadata.endDate = new Date(req.body.endDate);
    if (req.body.notes) creative.metadata.notes = req.body.notes;

    // Handle file update
    if (req.file) {
      // Delete old file
      if (creative.imageUrl && !creative.imageUrl.startsWith('http')) {
        const oldFilePath = path.join(__dirname, '..', creative.imageUrl);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      // Get new image dimensions
      const metadata = await sharp(req.file.path).metadata();

      creative.imageUrl = `/uploads/creatives/${req.file.filename}`;
      creative.originalFileName = req.file.originalname;
      creative.fileSize = req.file.size;
      creative.mimeType = req.file.mimetype;
      creative.metadata.dimensions = {
        width: metadata.width,
        height: metadata.height
      };
      creative.metadata.aspectRatio = `${metadata.width}:${metadata.height}`;
      
      changes.image = { updated: true };
    }

    creative.updatedBy = req.user.userId;

    // Add audit log
    creative.auditLog.push({
      action: 'EDIT',
      adminId: req.user.userId,
      timestamp: new Date(),
      changes
    });

    await creative.save();

    res.json({
      success: true,
      message: 'Creative updated successfully',
      data: {
        ...creative.toObject(),
        id: creative._id,
        imageUrl: `${config.IMAGE_BASE_URL}${creative.imageUrl}`
      }
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error deleting file:', e);
      }
    }

    console.error('Error updating creative:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update creative',
      message: error.message
    });
  }
});

/**
 * @route   DELETE /api/admin/creatives/:id
 * @desc    Soft delete creative
 * @access  Admin
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const creative = await Creative.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!creative) {
      return res.status(404).json({
        success: false,
        error: 'Creative not found'
      });
    }

    await creative.softDelete(req.user.userId);

    res.json({
      success: true,
      message: 'Creative deleted successfully',
      data: {
        id: creative._id,
        title: creative.title
      }
    });
  } catch (error) {
    console.error('Error deleting creative:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete creative'
    });
  }
});

/**
 * @route   PATCH /api/admin/creatives/:id/status
 * @desc    Toggle creative status (Active/Inactive)
 * @access  Admin
 */
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const creative = await Creative.findOne({
      _id: req.params.id,
      isDeleted: false
    });

    if (!creative) {
      return res.status(404).json({
        success: false,
        error: 'Creative not found'
      });
    }

    await creative.toggleStatus(req.user.userId);

    res.json({
      success: true,
      message: `Creative ${creative.status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: creative._id,
        status: creative.status
      }
    });
  } catch (error) {
    console.error('Error toggling status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle creative status'
    });
  }
});

// ==================== PERFORMANCE & ANALYTICS ====================

/**
 * @route   GET /api/admin/creatives/performance/stats
 * @desc    Get performance statistics
 * @query   {string} placement - Filter by placement
 * @query   {string} campaignPID - Filter by PID
 * @query   {string} status - Filter by status
 * @query   {string} startDate - Start date
 * @query   {string} endDate - End date
 * @access  Admin
 */
router.get('/performance/stats', adminAuth, async (req, res) => {
  try {
    const { placement, campaignPID, status, startDate, endDate } = req.query;

    const filters = {};
    if (placement) filters.placement = placement;
    if (campaignPID) filters.campaignPID = campaignPID;
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const stats = await Creative.getPerformanceStats(filters);

    // Get top performers
    const topPerformers = await Creative.getTopPerformers(5);

    res.json({
      success: true,
      data: {
        overall: stats[0] || {
          totalCreatives: 0,
          activeCreatives: 0,
          totalViews: 0,
          totalClicks: 0,
          avgCTR: 0
        },
        topPerformers: topPerformers.map(c => ({
          id: c._id,
          title: c.title,
          placement: c.placement,
          views: c.analytics.views,
          clicks: c.analytics.clicks,
          ctr: c.analytics.ctr.toFixed(2) + '%'
        }))
      }
    });
  } catch (error) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get performance statistics'
    });
  }
});

/**
 * @route   POST /api/admin/creatives/:id/track
 * @desc    Record view or click for analytics
 * @body    {string} eventType - 'view' or 'click'
 * @access  Public (called from app)
 */
router.post('/:id/track', async (req, res) => {
  try {
    const { eventType } = req.body;

    if (!['view', 'click'].includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: 'Event type must be "view" or "click"'
      });
    }

    const creative = await Creative.findOne({
      _id: req.params.id,
      isDeleted: false,
      status: 'Active'
    });

    if (!creative) {
      return res.status(404).json({
        success: false,
        error: 'Creative not found'
      });
    }

    if (eventType === 'view') {
      await creative.recordView();
    } else {
      await creative.recordClick();
    }

    res.json({
      success: true,
      message: `${eventType} recorded successfully`,
      data: {
        views: creative.analytics.views,
        clicks: creative.analytics.clicks,
        ctr: creative.analytics.ctr.toFixed(2) + '%'
      }
    });
  } catch (error) {
    console.error('Error tracking event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track event'
    });
  }
});

// ==================== MASTER DATA ====================

/**
 * @route   GET /api/admin/creatives/master/placements
 * @desc    Get all placement options
 * @access  Admin
 */
router.get('/master/placements', adminAuth, async (req, res) => {
  try {
    const placements = [
      'Home Top',
      'Home Middle',
      'Home Bottom',
      'Spin Wheel',
      'Offers Top',
      'Offers Bottom',
      'Profile Top',
      'Profile Middle',
      'Games Top',
      'Rewards Top',
      'Highest Earning Section',
      'Most Played Games',
      'Race Section'
    ];

    res.json({
      success: true,
      data: placements
    });
  } catch (error) {
    console.error('Error getting placements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get placements'
    });
  }
});

/**
 * @route   GET /api/admin/creatives/master/segments
 * @desc    Get all segment options
 * @access  Admin
 */
router.get('/master/segments', adminAuth, async (req, res) => {
  try {
    const segments = [
      'All Users',
      'New Users',
      'VIP Users',
      'Gold Tier',
      'Platinum Tier',
      'Bronze Tier',
      'India',
      'USA',
      'UK',
      'High Spenders',
      'Active Players'
    ];

    res.json({
      success: true,
      data: segments
    });
  } catch (error) {
    console.error('Error getting segments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get segments'
    });
  }
});

/**
 * @route   GET /api/admin/creatives/master/pids
 * @desc    Get all campaign PIDs
 * @access  Admin
 */
router.get('/master/pids', adminAuth, async (req, res) => {
  try {
    // Get unique PIDs from existing creatives
    const pids = await Creative.distinct('campaignPID', { isDeleted: false });

    // Add default/common PIDs
    const defaultPIDs = [
      'fb_spin_223',
      'organic_default',
      'google_welcome_456',
      'internal_vip_789',
      'weekend_special_101',
      'tiktok_promo_334',
      'instagram_boost_567',
      'youtube_campaign_890',
      'top_earners_showcase',
      'popular_games_promo',
      'daily_race_promo'
    ];

    const allPIDs = [...new Set([...pids, ...defaultPIDs])].sort();

    res.json({
      success: true,
      data: allPIDs
    });
  } catch (error) {
    console.error('Error getting PIDs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get PIDs'
    });
  }
});

module.exports = router;


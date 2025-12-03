const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import models
const GameTip = require('../models/GameTip');
const Game = require('../models/Game');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// Configure multer for tip media uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/game-tips');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg|mp4|webm|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// ==================== ADMIN GAME TIPS MANAGEMENT ====================

/**
 * @route   GET /api/admin/game-tips
 * @desc    Get all game tips with filtering and pagination
 * @access  Private (Admin)
 */
router.get('/', adminAuth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('gameId').optional().isString(),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('difficulty').optional().isString().withMessage('Difficulty must be a string'),
  query('isActive').optional().isBoolean(),
  query('isFeatured').optional().isBoolean(),
  query('search').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      gameId,
      category,
      difficulty,
      isActive,
      isFeatured,
      search
    } = req.query;

    // Build filter query
    const filter = {};
    if (gameId) filter.gameId = gameId;
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';
    
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { title: regex },
        { content: regex },
        { tags: { $in: [regex] } }
      ];
    }

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNum - 1) * pageSize;

    // Get tips with pagination
    const [tips, total] = await Promise.all([
      GameTip.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      GameTip.countDocuments(filter)
    ]);

    // Get analytics summary
    const analytics = await GameTip.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$analytics.views' },
          totalBookmarks: { $sum: '$analytics.bookmarks' },
          totalShares: { $sum: '$analytics.shares' },
          totalHelpfulVotes: { $sum: '$analytics.helpfulVotes' },
          totalNotHelpfulVotes: { $sum: '$analytics.notHelpfulVotes' },
          avgViews: { $avg: '$analytics.views' },
          avgBookmarks: { $avg: '$analytics.bookmarks' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        tips: tips.map(tip => ({
          id: tip._id,
          gameId: tip.gameId,
          title: tip.title,
          content: tip.content,
          category: tip.category,
          categoryDisplayName: tip.categoryDisplayName,
          difficulty: tip.difficulty,
          estimatedReadTime: tip.estimatedReadTime,
          tags: tip.tags,
          isActive: tip.isActive,
          isFeatured: tip.isFeatured,
          order: tip.order,
          media: tip.media,
          analytics: tip.analytics,
          createdBy: tip.createdBy,
          updatedBy: tip.updatedBy,
          publishedAt: tip.publishedAt,
          lastModifiedAt: tip.lastModifiedAt,
          createdAt: tip.createdAt,
          updatedAt: tip.updatedAt
        })),
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize)
        },
        analytics: analytics[0] || {
          totalViews: 0,
          totalBookmarks: 0,
          totalShares: 0,
          totalHelpfulVotes: 0,
          totalNotHelpfulVotes: 0,
          avgViews: 0,
          avgBookmarks: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching game tips:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch game tips'
    });
  }
});

/**
 * @route   GET /api/admin/game-tips/:id
 * @desc    Get a specific game tip
 * @access  Private (Admin)
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tip ID'
      });
    }

    const tip = await GameTip.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Game tip not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: tip._id,
        gameId: tip.gameId,
        title: tip.title,
        content: tip.content,
        category: tip.category,
        categoryDisplayName: tip.categoryDisplayName,
        difficulty: tip.difficulty,
        estimatedReadTime: tip.estimatedReadTime,
        tags: tip.tags,
        isActive: tip.isActive,
        isFeatured: tip.isFeatured,
        order: tip.order,
        media: tip.media,
        analytics: tip.analytics,
        seo: tip.seo,
        createdBy: tip.createdBy,
        updatedBy: tip.updatedBy,
        publishedAt: tip.publishedAt,
        lastModifiedAt: tip.lastModifiedAt,
        createdAt: tip.createdAt,
        updatedAt: tip.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching game tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch game tip'
    });
  }
});

/**
 * @route   POST /api/admin/game-tips
 * @desc    Create a new game tip
 * @access  Private (Admin)
 */
router.post('/', adminAuth, upload.single('media'), [
  body('gameId').notEmpty().withMessage('Game ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('content').notEmpty().withMessage('Content is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('categoryDisplayName').notEmpty().withMessage('Category display name is required'),
  body('difficulty').optional().isString().withMessage('Difficulty must be a string'),
  body('estimatedReadTime').optional().isInt({ min: 1, max: 10 }),
  body('tags').optional().isArray(),
  body('order').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
  body('isFeatured').optional().isBoolean(),
  body('seo.metaDescription').optional().isLength({ max: 160 }),
  body('seo.keywords').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      gameId,
      title,
      content,
      category,
      categoryDisplayName,
      difficulty = 'beginner',
      estimatedReadTime = 2,
      tags = [],
      order = 0,
      isActive = true,
      isFeatured = false,
      seo = {}
    } = req.body;

    // Check if game exists
    const game = await Game.findOne({ gameId, isActive: true });
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    // Handle media upload
    let media = {};
    if (req.file) {
      const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      media[fileType] = {
        url: `/uploads/game-tips/${req.file.filename}`,
        alt: req.body.mediaAlt || title
      };
      
      if (fileType === 'video') {
        media.video.duration = req.body.mediaDuration ? parseInt(req.body.mediaDuration) : null;
        media.video.thumbnail = req.body.mediaThumbnail || null;
      }
    }

    // Create new game tip
    const gameTip = new GameTip({
      gameId,
      title,
      content,
      category,
      categoryDisplayName,
      difficulty,
      estimatedReadTime,
      tags,
      order,
      isActive,
      isFeatured,
      media,
      seo,
      createdBy: req.user.userId,
      updatedBy: req.user.userId
    });

    await gameTip.save();

    res.status(201).json({
      success: true,
      data: {
        id: gameTip._id,
        gameId: gameTip.gameId,
        title: gameTip.title,
        content: gameTip.content,
        category: gameTip.category,
        categoryDisplayName: gameTip.categoryDisplayName,
        difficulty: gameTip.difficulty,
        estimatedReadTime: gameTip.estimatedReadTime,
        tags: gameTip.tags,
        isActive: gameTip.isActive,
        isFeatured: gameTip.isFeatured,
        order: gameTip.order,
        media: gameTip.media,
        seo: gameTip.seo,
        publishedAt: gameTip.publishedAt,
        createdAt: gameTip.createdAt
      },
      message: 'Game tip created successfully'
    });
  } catch (error) {
    console.error('Error creating game tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create game tip'
    });
  }
});

/**
 * @route   PUT /api/admin/game-tips/:id
 * @desc    Update a game tip
 * @access  Private (Admin)
 */
router.put('/:id', adminAuth, upload.single('media'), [
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('content').optional().notEmpty().withMessage('Content cannot be empty'),
  body('category').optional().isString().withMessage('Category must be a string'),
  body('categoryDisplayName').optional().notEmpty().withMessage('Category display name cannot be empty'),
  body('difficulty').optional().isString().withMessage('Difficulty must be a string'),
  body('estimatedReadTime').optional().isInt({ min: 1, max: 10 }),
  body('tags').optional().isArray(),
  body('order').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean(),
  body('isFeatured').optional().isBoolean(),
  body('seo.metaDescription').optional().isLength({ max: 160 }),
  body('seo.keywords').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tip ID'
      });
    }

    const tip = await GameTip.findById(id);
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Game tip not found'
      });
    }

    // Update fields
    const updateFields = {};
    if (req.body.title !== undefined) updateFields.title = req.body.title;
    if (req.body.content !== undefined) updateFields.content = req.body.content;
    if (req.body.category !== undefined) updateFields.category = req.body.category;
    if (req.body.categoryDisplayName !== undefined) updateFields.categoryDisplayName = req.body.categoryDisplayName;
    if (req.body.difficulty !== undefined) updateFields.difficulty = req.body.difficulty;
    if (req.body.estimatedReadTime !== undefined) updateFields.estimatedReadTime = req.body.estimatedReadTime;
    if (req.body.tags !== undefined) updateFields.tags = req.body.tags;
    if (req.body.order !== undefined) updateFields.order = req.body.order;
    if (req.body.isActive !== undefined) updateFields.isActive = req.body.isActive;
    if (req.body.isFeatured !== undefined) updateFields.isFeatured = req.body.isFeatured;
    if (req.body.seo !== undefined) updateFields.seo = req.body.seo;

    // Handle media upload
    if (req.file) {
      const fileType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      updateFields.media = {
        ...tip.media,
        [fileType]: {
          url: `/uploads/game-tips/${req.file.filename}`,
          alt: req.body.mediaAlt || tip.title
        }
      };
      
      if (fileType === 'video') {
        updateFields.media.video.duration = req.body.mediaDuration ? parseInt(req.body.mediaDuration) : null;
        updateFields.media.video.thumbnail = req.body.mediaThumbnail || null;
      }
    }

    updateFields.updatedBy = req.user.userId;

    const updatedTip = await GameTip.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: {
        id: updatedTip._id,
        gameId: updatedTip.gameId,
        title: updatedTip.title,
        content: updatedTip.content,
        category: updatedTip.category,
        categoryDisplayName: updatedTip.categoryDisplayName,
        difficulty: updatedTip.difficulty,
        estimatedReadTime: updatedTip.estimatedReadTime,
        tags: updatedTip.tags,
        isActive: updatedTip.isActive,
        isFeatured: updatedTip.isFeatured,
        order: updatedTip.order,
        media: updatedTip.media,
        seo: updatedTip.seo,
        lastModifiedAt: updatedTip.lastModifiedAt,
        updatedAt: updatedTip.updatedAt
      },
      message: 'Game tip updated successfully'
    });
  } catch (error) {
    console.error('Error updating game tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update game tip'
    });
  }
});

/**
 * @route   DELETE /api/admin/game-tips/:id
 * @desc    Delete a game tip
 * @access  Private (Admin)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tip ID'
      });
    }

    const tip = await GameTip.findById(id);
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Game tip not found'
      });
    }

    await GameTip.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Game tip deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete game tip'
    });
  }
});

/**
 * @route   POST /api/admin/game-tips/:id/toggle-status
 * @desc    Toggle tip active status
 * @access  Private (Admin)
 */
router.post('/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tip ID'
      });
    }

    const tip = await GameTip.findById(id);
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Game tip not found'
      });
    }

    tip.isActive = !tip.isActive;
    tip.updatedBy = req.user.userId;
    await tip.save();

    res.json({
      success: true,
      data: {
        id: tip._id,
        isActive: tip.isActive
      },
      message: `Game tip ${tip.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling tip status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle tip status'
    });
  }
});

/**
 * @route   POST /api/admin/game-tips/:id/toggle-featured
 * @desc    Toggle tip featured status
 * @access  Private (Admin)
 */
router.post('/:id/toggle-featured', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tip ID'
      });
    }

    const tip = await GameTip.findById(id);
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Game tip not found'
      });
    }

    tip.isFeatured = !tip.isFeatured;
    tip.updatedBy = req.user.userId;
    await tip.save();

    res.json({
      success: true,
      data: {
        id: tip._id,
        isFeatured: tip.isFeatured
      },
      message: `Game tip ${tip.isFeatured ? 'featured' : 'unfeatured'} successfully`
    });
  } catch (error) {
    console.error('Error toggling featured status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to toggle featured status'
    });
  }
});

/**
 * @route   GET /api/admin/game-tips/analytics/overview
 * @desc    Get analytics overview for game tips
 * @access  Private (Admin)
 */
router.get('/analytics/overview', adminAuth, [
  query('gameId').optional().isString(),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { gameId, category, dateFrom, dateTo } = req.query;

    // Build filter
    const filter = {};
    if (gameId) filter.gameId = gameId;
    if (category) filter.category = category;
    if (dateFrom || dateTo) {
      filter.publishedAt = {};
      if (dateFrom) filter.publishedAt.$gte = new Date(dateFrom);
      if (dateTo) filter.publishedAt.$lte = new Date(dateTo);
    }

    // Get analytics data
    const [
      totalTips,
      activeTips,
      featuredTips,
      categoryStats,
      topTips,
      recentTips
    ] = await Promise.all([
      GameTip.countDocuments(filter),
      GameTip.countDocuments({ ...filter, isActive: true }),
      GameTip.countDocuments({ ...filter, isFeatured: true }),
      GameTip.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]),
      GameTip.find(filter)
        .sort({ 'analytics.views': -1 })
        .limit(10)
        .select('title gameId analytics.views analytics.bookmarks analytics.shares'),
      GameTip.find(filter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title gameId category publishedAt')
    ]);

    // Get overall analytics
    const overallStats = await GameTip.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$analytics.views' },
          totalBookmarks: { $sum: '$analytics.bookmarks' },
          totalShares: { $sum: '$analytics.shares' },
          totalHelpfulVotes: { $sum: '$analytics.helpfulVotes' },
          totalNotHelpfulVotes: { $sum: '$analytics.notHelpfulVotes' },
          avgViews: { $avg: '$analytics.views' },
          avgBookmarks: { $avg: '$analytics.bookmarks' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalTips,
          activeTips,
          featuredTips,
          inactiveTips: totalTips - activeTips
        },
        analytics: overallStats[0] || {
          totalViews: 0,
          totalBookmarks: 0,
          totalShares: 0,
          totalHelpfulVotes: 0,
          totalNotHelpfulVotes: 0,
          avgViews: 0,
          avgBookmarks: 0
        },
        categoryStats,
        topTips: topTips.map(tip => ({
          id: tip._id,
          title: tip.title,
          gameId: tip.gameId,
          views: tip.analytics.views,
          bookmarks: tip.analytics.bookmarks,
          shares: tip.analytics.shares
        })),
        recentTips: recentTips.map(tip => ({
          id: tip._id,
          title: tip.title,
          gameId: tip.gameId,
          category: tip.category,
          publishedAt: tip.publishedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analytics'
    });
  }
});

/**
 * @route   GET /api/admin/game-tips/games
 * @desc    Get games with tips enabled
 * @access  Private (Admin)
 */
router.get('/games', adminAuth, async (req, res) => {
  try {
    const games = await Game.find({ 
      isActive: true, 
      tipsEnabled: true 
    })
    .select('gameId title description bannerImage')
    .sort({ title: 1 });

    // Get tip counts for each game
    const gamesWithTipCounts = await Promise.all(
      games.map(async (game) => {
        const tipCount = await GameTip.countDocuments({ gameId: game.gameId });
        const activeTipCount = await GameTip.countDocuments({ 
          gameId: game.gameId, 
          isActive: true 
        });
        
        return {
          gameId: game.gameId,
          title: game.title,
          description: game.description,
          bannerImage: game.bannerImage,
          totalTips: tipCount,
          activeTips: activeTipCount
        };
      })
    );

    res.json({
      success: true,
      data: {
        games: gamesWithTipCounts,
        totalGames: gamesWithTipCounts.length
      }
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch games'
    });
  }
});

module.exports = router;

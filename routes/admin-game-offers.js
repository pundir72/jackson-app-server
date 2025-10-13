const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Import models
const Offer = require('../models/Offer');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const GameDisplayRule = require('../models/GameDisplayRule');
const TaskProgressionRule = require('../models/TaskProgressionRule');
const WelcomeBonusTimer = require('../models/WelcomeBonusTimer');
const besitosController = require('../controllers/besitos.controller');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// Configure multer for offer creative uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/offer-creatives');
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp, svg)'));
    }
  }
});

// ==================== OFFERS MANAGEMENT ====================

// Get all offers with filtering and pagination
router.get('/offers', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      country = '',
      sdkProvider = '',
      xptr = '',
      adOffer = '',
      status = 'all'
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Country filter
    if (country) {
      query.countries = { $in: [country] };
    }

    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }

    // XPTR filter
    if (xptr) {
      query.xptrRule = { $regex: xptr, $options: 'i' };
    }

    // Ad Offer filter
    if (adOffer !== '') {
      query.isAdSupported = adOffer === 'true';
    }

    // Status filter
    if (status !== 'all') {
      query.isActive = status === 'active';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const offers = await Offer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sdkProvider', 'name')
      .lean();

    const total = await Offer.countDocuments(query);

    res.json({
      success: true,
      data: {
        offers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offers',
      error: error.message
    });
  }
});

// Get single offer by ID
router.get('/offers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id)
      .populate('sdkProvider', 'name')
      .lean();

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    res.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('Error getting offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offer',
      error: error.message
    });
  }
});

// Check if offer ID is available
router.get('/offers/check-id/:offerId', adminAuth, async (req, res) => {
  try {
    const { offerId } = req.params;

    const existingOffer = await Offer.findOne({ offerId });

    res.json({
      success: true,
      available: !existingOffer,
      message: existingOffer
        ? 'This offer ID is already taken'
        : 'This offer ID is available'
    });
  } catch (error) {
    console.error('Error checking offer ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check offer ID',
      error: error.message
    });
  }
});

// Create new offer with file uploads
router.post('/offers',
  adminAuth,
  upload.fields([
    { name: 'offerCardImage', maxCount: 1 },
    { name: 'additionalAssets', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      // Check if offer with this offerId already exists
      const existingOffer = await Offer.findOne({ offerId: req.body.offerId });
      if (existingOffer) {
        return res.status(400).json({
          success: false,
          message: 'An offer with this ID already exists. The offerId field must be unique.',
          error: 'DUPLICATE_OFFER_ID'
        });
      }
      // Lookup offer from Besitos by offerId provided without sending headers
      req.query.offer_id = req.body.offerId;
      const captureOffer = () => {
        let payload = null; let code = 200;
        return {
          res: {
            status(c){ code = c; return this; },
            json(obj){ payload = obj; return this; }
          },
          get(){ return payload || { success: false, data: [] }; }
        };
      };
      const cap1 = captureOffer();
      await besitosController.getOffers(req, cap1.res);
      const getOffer = cap1.get();
      // If external offer lookup fails or returns empty, stop processing
      if (!getOffer || getOffer.success !== true || !Array.isArray(getOffer.data) || getOffer.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'External offer not found for the provided offerId',
          error: 'EXTERNAL_OFFER_NOT_FOUND'
        });
      }

      // Parse JSON fields from form-data
      const offerData = {
        offerId: req.body.offerId,
        name: req.body.name,
        description: req.body.description,
        sdkProvider: req.body.sdkProvider,
        startDate: req.body.startDate,
        expiryDate: req.body.expiryDate,
        countries: JSON.parse(req.body.countries || '[]'),
        cities: req.body.cities ? JSON.parse(req.body.cities) : [],
        tierAccess: JSON.parse(req.body.tierAccess || '[]'),
        ageGroups: req.body.ageGroups ? JSON.parse(req.body.ageGroups) : [],
        gender: req.body.gender,
        marketingChannel: req.body.marketingChannel,
        campaignName: req.body.campaignName,
        xpTier: req.body.xpTier ? parseInt(req.body.xpTier) : 1,
        isActive: req.body.isActive === 'true',
        isDefaultFallback: req.body.isDefaultFallback === 'true',
        isAdSupported: req.body.isAdSupported === 'true',
        xptrRule: req.body.xptrRule,
        reward: {
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : 0,
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : 0
        },
        metadata: {
          estimatedTimeMinutes: req.body.estimatedTime ? parseInt(req.body.estimatedTime) : 5,
          difficulty: req.body.difficulty || 'easy',
          category: req.body.category || 'survey',
          deepLink: req.body.deepLink,
          trackingId: req.body.trackingId
        },
        createdBy: req.user.userId,
        deviceType: req.body.deviceType || 'android',
        uiSection: req.body.uiSection || ''
      };

      // Map external offer details into gameDetails snapshot
      const external = getOffer.data[0];
      offerData.gameDetails = {
        id: external.id || '',
        name: external.title || external.name || offerData.name,
        description: external.description || offerData.description,
        image: external.image || external.large_image || '',
        square_image: external.square_image || '',
        large_image: external.large_image || external.image || '',
        category: (Array.isArray(external.categories) && external.categories[0] && external.categories[0].name) ? external.categories[0].name : (external.category || ''),
        downloadUrl: external.url || ''
      };

      // Handle uploaded offer card image
      if (req.files && req.files.offerCardImage && req.files.offerCardImage[0]) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.offerCardImage[0].filename}`;

        offerData.creative = {
          offerCard: {
            imageUrl: imageUrl,
            layout: req.body.cardLayout || 'standard',
            dimensions: {
              width: req.body.cardWidth ? parseInt(req.body.cardWidth) : 320,
              height: req.body.cardHeight ? parseInt(req.body.cardHeight) : 180
            }
          },
          additionalAssets: []
        };

        // Store image URL in metadata as well for backward compatibility
        offerData.metadata.imageUrl = imageUrl;
      }

      // Handle additional asset uploads
      if (req.files && req.files.additionalAssets) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        if (!offerData.creative) {
          offerData.creative = { additionalAssets: [] };
        }

        req.files.additionalAssets.forEach((file, index) => {
          offerData.creative.additionalAssets.push({
            type: req.body[`assetType_${index}`] || 'banner',
            url: `${baseUrl}/uploads/offer-creatives/${file.filename}`,
            altText: req.body[`assetAlt_${index}`] || `Asset ${index + 1}`
          });
        });
      }

      const offer = new Offer(offerData);
      await offer.save();

      res.status(201).json({
        success: true,
        message: 'Offer created successfully',
        data: offer
      });
    } catch (error) {
      console.error('Error creating offer:', error);

      // Handle multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB',
          error: error.message
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === 'MongoServerError') {
        return res.status(400).json({
          success: false,
          message: 'An offer with this ID already exists. The offerId field must be unique.',
          error: 'DUPLICATE_OFFER_ID'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create offer',
        error: error.message
      });
    }
  });

// Update offer with file uploads
router.put('/offers/:id',
  adminAuth,
  upload.fields([
    { name: 'offerCardImage', maxCount: 1 },
    { name: 'additionalAssets', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Find existing offer
      const existingOffer = await Offer.findById(id);
      if (!existingOffer) {
        return res.status(404).json({
          success: false,
          message: 'Offer not found'
        });
      }

      // Check if updating offerId and if new offerId already exists
      if (req.body.offerId && req.body.offerId !== existingOffer.offerId) {
        const duplicateOffer = await Offer.findOne({
          offerId: req.body.offerId,
          _id: { $ne: id } // Exclude current offer
        });

        if (duplicateOffer) {
          return res.status(400).json({
            success: false,
            message: 'An offer with this ID already exists. The offerId field must be unique.',
            error: 'DUPLICATE_OFFER_ID'
          });
        }
      }

      // Build update data
      const updateData = {
        updatedBy: req.user.userId,
        updatedAt: new Date()
      };

      // Update basic fields if provided
      if (req.body.offerId) updateData.offerId = req.body.offerId;
      if (req.body.name) updateData.name = req.body.name;
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.sdkProvider) updateData.sdkProvider = req.body.sdkProvider;
      if (req.body.startDate) updateData.startDate = req.body.startDate;
      if (req.body.expiryDate) updateData.expiryDate = req.body.expiryDate;
      if (req.body.countries) updateData.countries = JSON.parse(req.body.countries);
      if (req.body.cities) updateData.cities = JSON.parse(req.body.cities);
      if (req.body.tierAccess) updateData.tierAccess = JSON.parse(req.body.tierAccess);
      if (req.body.ageGroups) updateData.ageGroups = JSON.parse(req.body.ageGroups);
      if (req.body.gender) updateData.gender = req.body.gender;
      if (req.body.marketingChannel) updateData.marketingChannel = req.body.marketingChannel;
      if (req.body.campaignName) updateData.campaignName = req.body.campaignName;
      if (req.body.xpTier) updateData.xpTier = parseInt(req.body.xpTier);
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive === 'true';
      if (req.body.isDefaultFallback !== undefined) updateData.isDefaultFallback = req.body.isDefaultFallback === 'true';
      if (req.body.isAdSupported !== undefined) updateData.isAdSupported = req.body.isAdSupported === 'true';
      if (req.body.xptrRule) updateData.xptrRule = req.body.xptrRule;

      // Update rewards
      if (req.body.rewardCoins || req.body.rewardXP) {
        updateData.reward = {
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : existingOffer.reward?.coins || 0,
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : existingOffer.reward?.xp || 0
        };
      }

      // Update metadata
      if (req.body.estimatedTime || req.body.difficulty || req.body.category || req.body.deepLink || req.body.trackingId) {
        updateData.metadata = {
          ...existingOffer.metadata?.toObject(),
          estimatedTimeMinutes: req.body.estimatedTime ? parseInt(req.body.estimatedTime) : existingOffer.metadata?.estimatedTimeMinutes,
          difficulty: req.body.difficulty || existingOffer.metadata?.difficulty,
          category: req.body.category || existingOffer.metadata?.category,
          deepLink: req.body.deepLink || existingOffer.metadata?.deepLink,
          trackingId: req.body.trackingId || existingOffer.metadata?.trackingId
        };
      }

      // Handle new uploaded offer card image
      if (req.files && req.files.offerCardImage && req.files.offerCardImage[0]) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.offerCardImage[0].filename}`;

        updateData.creative = {
          ...existingOffer.creative?.toObject(),
          offerCard: {
            imageUrl: imageUrl,
            layout: req.body.cardLayout || existingOffer.creative?.offerCard?.layout || 'standard',
            dimensions: {
              width: req.body.cardWidth ? parseInt(req.body.cardWidth) : existingOffer.creative?.offerCard?.dimensions?.width || 320,
              height: req.body.cardHeight ? parseInt(req.body.cardHeight) : existingOffer.creative?.offerCard?.dimensions?.height || 180
            }
          }
        };

        // Update metadata imageUrl for backward compatibility
        if (!updateData.metadata) updateData.metadata = {};
        updateData.metadata.imageUrl = imageUrl;
      }

      // Handle new additional asset uploads
      if (req.files && req.files.additionalAssets) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        if (!updateData.creative) {
          updateData.creative = existingOffer.creative?.toObject() || {};
        }

        updateData.creative.additionalAssets = existingOffer.creative?.additionalAssets || [];

        req.files.additionalAssets.forEach((file, index) => {
          updateData.creative.additionalAssets.push({
            type: req.body[`assetType_${index}`] || 'banner',
            url: `${baseUrl}/uploads/offer-creatives/${file.filename}`,
            altText: req.body[`assetAlt_${index}`] || `Asset ${index + 1}`
          });
        });
      }

      const offer = await Offer.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Offer updated successfully',
        data: offer
      });
    } catch (error) {
      console.error('Error updating offer:', error);

      // Handle multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB',
          error: error.message
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === 'MongoServerError') {
        return res.status(400).json({
          success: false,
          message: 'An offer with this ID already exists. The offerId field must be unique.',
          error: 'DUPLICATE_OFFER_ID'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update offer',
        error: error.message
      });
    }
  });

// Delete offer
router.delete('/offers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findByIdAndDelete(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete offer',
      error: error.message
    });
  }
});

// Toggle offer status
router.patch('/offers/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }

    offer.isActive = !offer.isActive;
    offer.updatedBy = req.user.userId;
    offer.updatedAt = new Date();

    await offer.save();

    res.json({
      success: true,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: offer.isActive }
    });
  } catch (error) {
    console.error('Error toggling offer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle offer status',
      error: error.message
    });
  }
});

// ==================== GAMES MANAGEMENT ====================

// Get all games with filtering and pagination
router.get('/games', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      country = '',
      sdkProvider = '',
      xptr = '',
      adGame = '',
      status = 'all'
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Country filter
    if (country) {
      query.countries = { $in: [country] };
    }

    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }

    // XPTR filter
    if (xptr) {
      query.xptrRules = { $regex: xptr, $options: 'i' };
    }

    // Ad Game filter
    if (adGame !== '') {
      query.isAdSupported = adGame === 'true';
    }

    // Status filter
    if (status !== 'all') {
      query.isActive = status === 'active';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sdkProvider', 'name')
      .lean();

    // Add task count for each game
    const gamesWithTaskCount = await Promise.all(
      games.map(async (game) => {
        const taskCount = await GameTask.countDocuments({ gameId: game._id });
        return { ...game, taskCount };
      })
    );

    const total = await Game.countDocuments(query);

    res.json({
      success: true,
      data: {
        games: gamesWithTaskCount,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get games',
      error: error.message
    });
  }
});

// Get single game by ID
router.get('/games/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log({ id })
    const game = await Game.findById(id)
      .populate('sdkProvider', 'name')
      .lean();

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    // Get task count
    const taskCount = await GameTask.countDocuments({ gameId: id });
    game.taskCount = taskCount;

    res.json({
      success: true,
      data: game
    });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get game',
      error: error.message
    });
  }
});

// Check if game ID is available
router.get('/games/check-id/:gameId', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;

    const existingGame = await Game.findOne({ gameId });

    res.json({
      success: true,
      available: !existingGame,
      message: existingGame
        ? 'This game ID is already taken'
        : 'This game ID is available'
    });
  } catch (error) {
    console.error('Error checking game ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check game ID',
      error: error.message
    });
  }
});

// Create new game with file uploads
router.post('/games',
  adminAuth,
  upload.fields([
    { name: 'gameThumbnail', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      // Check if game with this gameId already exists
      const existingGame = await Game.findOne({ gameId: req.body.gameId });
      if (existingGame) {
        return res.status(400).json({
          success: false,
          message: 'A game with this ID already exists. The gameId must be unique.',
          error: 'DUPLICATE_GAME_ID'
        });
      }

      // Fetch external details (Besitos) by gameId without sending headers
      req.query.offer_id = req.body.gameId;
      const captureGame = () => {
        let payload = null; let code = 200;
        return {
          res: {
            status(c){ code = c; return this; },
            json(obj){ payload = obj; return this; }
          },
          get(){ return payload || { success: false, data: [] }; }
        };
      };
      const cap2 = captureGame();
      await besitosController.getOffers(req, cap2.res);
      const ext = cap2.get();
      if (!ext || ext.success !== true || !Array.isArray(ext.data) || ext.data.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'External game not found for the provided gameId',
          error: 'EXTERNAL_GAME_NOT_FOUND'
        });
      }
      const external = ext.data[0];

      // Parse JSON fields from form-data
      const gameData = {
        gameId: req.body.gameId,
        title: req.body.title,
        description: req.body.description,
        sdkProvider: req.body.sdkProvider,
        countries: JSON.parse(req.body.countries || '[]'),
        xptrRules: req.body.xptrRules,
        rewards: {
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : 0,
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : 0
        },
        defaultTaskCount: req.body.defaultTaskCount ? parseInt(req.body.defaultTaskCount) : 0,
        xpTier: req.body.xpTier ? parseInt(req.body.xpTier) : 1,
        isDefaultFallback: req.body.isDefaultFallback === 'true',
        ageGroups: req.body.ageGroups ? JSON.parse(req.body.ageGroups) : [],
        gender: req.body.gender,
        marketingChannel: req.body.marketingChannel,
        campaignName: req.body.campaignName,
        tierRestrictions: {
          minTier: req.body.tier || 'free',
          maxTier: 'platinum'
        },
        metadata: {
          genre: req.body.genre || 'puzzle',
          difficulty: req.body.difficulty || 'easy',
          rating: req.body.rating ? parseFloat(req.body.rating) : 3.0,
          estimatedPlayTime: req.body.estimatedPlayTime ? parseInt(req.body.estimatedPlayTime) : 10
        },
        isActive: req.body.isActive === 'true',
        isAdSupported: req.body.isAdSupported === 'true',
        createdBy: req.user.userId,
        deviceType: req.body.deviceType || 'android',
        uiSection: req.body.uiSection || ''
      };

      // Map external details into gameDetails snapshot
      gameData.gameDetails = {
        id: external.id || '',
        name: external.title || external.name || gameData.title,
        description: external.description || gameData.description,
        image: external.image || external.large_image || '',
        square_image: external.square_image || '',
        large_image: external.large_image || external.image || '',
        category: (Array.isArray(external.categories) && external.categories[0] && external.categories[0].name) ? external.categories[0].name : (external.category || ''),
        downloadUrl: external.url || ''
      };

      // Handle uploaded game thumbnail
      if (req.files && req.files.gameThumbnail && req.files.gameThumbnail[0]) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.gameThumbnail[0].filename}`;

        gameData.metadata.thumbnail = {
          url: imageUrl,
          dimensions: {
            width: req.body.thumbnailWidth ? parseInt(req.body.thumbnailWidth) : 300,
            height: req.body.thumbnailHeight ? parseInt(req.body.thumbnailHeight) : 300
          },
          altText: req.body.thumbnailAltText || gameData.title
        };

        // Store image URL in metadata as well for backward compatibility
        gameData.metadata.imageUrl = imageUrl;
      }

      const game = new Game(gameData);
      await game.save();

      res.status(201).json({
        success: true,
        message: 'Game created successfully',
        data: game
      });
    } catch (error) {
      console.error('Error creating game:', error);

      // Handle multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB',
          error: error.message
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === 'MongoServerError') {
        return res.status(400).json({
          success: false,
          message: 'A game with this ID already exists. The gameId must be unique.',
          error: 'DUPLICATE_GAME_ID'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create game',
        error: error.message
      });
    }
  });

// Update game with file uploads
router.put('/games/:id',
  adminAuth,
  upload.fields([
    { name: 'gameThumbnail', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Find existing game
      const existingGame = await Game.findById(id);
      if (!existingGame) {
        return res.status(404).json({
          success: false,
          message: 'Game not found'
        });
      }

      // Check if updating gameId and if new gameId already exists
      if (req.body.gameId && req.body.gameId !== existingGame.gameId) {
        const duplicateGame = await Game.findOne({
          gameId: req.body.gameId,
          _id: { $ne: id } // Exclude current game
        });

        if (duplicateGame) {
          return res.status(400).json({
            success: false,
            message: 'A game with this ID already exists. The gameId must be unique.',
            error: 'DUPLICATE_GAME_ID'
          });
        }
      }

      // Build update data
      const updateData = {
        updatedBy: req.user.userId,
        updatedAt: new Date()
      };

      // Update basic fields if provided
      if (req.body.gameId) updateData.gameId = req.body.gameId;
      if (req.body.title) updateData.title = req.body.title;
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.sdkProvider) updateData.sdkProvider = req.body.sdkProvider;
      if (req.body.countries) updateData.countries = JSON.parse(req.body.countries);
      if (req.body.xptrRules) updateData.xptrRules = req.body.xptrRules;
      if (req.body.ageGroups) updateData.ageGroups = JSON.parse(req.body.ageGroups);
      if (req.body.gender) updateData.gender = req.body.gender;
      if (req.body.marketingChannel) updateData.marketingChannel = req.body.marketingChannel;
      if (req.body.campaignName) updateData.campaignName = req.body.campaignName;
      if (req.body.xpTier) updateData.xpTier = parseInt(req.body.xpTier);
      if (req.body.defaultTaskCount) updateData.defaultTaskCount = parseInt(req.body.defaultTaskCount);
      if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive === 'true';
      if (req.body.isDefaultFallback !== undefined) updateData.isDefaultFallback = req.body.isDefaultFallback === 'true';
      if (req.body.isAdSupported !== undefined) updateData.isAdSupported = req.body.isAdSupported === 'true';

      // Update rewards
      if (req.body.rewardXP || req.body.rewardCoins) {
        updateData.rewards = {
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : existingGame.rewards?.xp || 0,
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : existingGame.rewards?.coins || 0
        };
      }

      // Update tier restrictions
      if (req.body.tier) {
        updateData.tierRestrictions = {
          ...existingGame.tierRestrictions?.toObject(),
          minTier: req.body.tier,
          maxTier: 'platinum'
        };
      }

      // Update metadata
      if (req.body.genre || req.body.difficulty || req.body.rating || req.body.estimatedPlayTime) {
        updateData.metadata = {
          ...existingGame.metadata?.toObject(),
          genre: req.body.genre || existingGame.metadata?.genre,
          difficulty: req.body.difficulty || existingGame.metadata?.difficulty,
          rating: req.body.rating ? parseFloat(req.body.rating) : existingGame.metadata?.rating,
          estimatedPlayTime: req.body.estimatedPlayTime ? parseInt(req.body.estimatedPlayTime) : existingGame.metadata?.estimatedPlayTime
        };
      }

      // Handle new uploaded game thumbnail
      if (req.files && req.files.gameThumbnail && req.files.gameThumbnail[0]) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.gameThumbnail[0].filename}`;

        if (!updateData.metadata) updateData.metadata = {};
        updateData.metadata.thumbnail = {
          url: imageUrl,
          dimensions: {
            width: req.body.thumbnailWidth ? parseInt(req.body.thumbnailWidth) : existingGame.metadata?.thumbnail?.dimensions?.width || 300,
            height: req.body.thumbnailHeight ? parseInt(req.body.thumbnailHeight) : existingGame.metadata?.thumbnail?.dimensions?.height || 300
          },
          altText: req.body.thumbnailAltText || existingGame.title
        };

        // Update metadata imageUrl for backward compatibility
        updateData.metadata.imageUrl = imageUrl;
      }

      const game = await Game.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: 'Game updated successfully',
        data: game
      });
    } catch (error) {
      console.error('Error updating game:', error);

      // Handle multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File size too large. Maximum size is 5MB',
          error: error.message
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === 'MongoServerError') {
        return res.status(400).json({
          success: false,
          message: 'A game with this ID already exists. The gameId must be unique.',
          error: 'DUPLICATE_GAME_ID'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update game',
        error: error.message
      });
    }
  });

// Delete game
router.delete('/games/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if game has tasks
    const taskCount = await GameTask.countDocuments({ gameId: id });
    if (taskCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete game with existing tasks. Delete tasks first.'
      });
    }

    const game = await Game.findByIdAndDelete(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    res.json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete game',
      error: error.message
    });
  }
});

// ==================== TASKS MANAGEMENT ====================

// Get all tasks for a specific game
router.get('/games/:gameId/tasks', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const {
      page = 1,
      limit = 10,
      search = ''
    } = req.query;

    let query = { gameId };

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { completionRule: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tasks = await GameTask.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await GameTask.countDocuments(query);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tasks',
      error: error.message
    });
  }
});

// Get single task by ID
router.get('/tasks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findById(id).lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task',
      error: error.message
    });
  }
});

// Create new task
router.post('/games/:gameId/tasks', adminAuth, [
  body('name').notEmpty().withMessage('Task name is required'),
  body('completionRule').notEmpty().withMessage('Completion rule is required'),
  body('rewardType').isIn(['xp', 'coins']).withMessage('Reward type must be xp or coins'),
  body('rewardValue').isNumeric().withMessage('Reward value must be numeric')
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

    const { gameId } = req.params;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    const taskData = {
      ...req.body,
      gameId,
      createdBy: req.user.userId
    };

    const task = new GameTask(taskData);
    await task.save();

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error.message
    });
  }
});

// Update task
router.put('/tasks/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Task name cannot be empty'),
  body('completionRule').optional().notEmpty().withMessage('Completion rule cannot be empty'),
  body('rewardType').optional().isIn(['xp', 'coins']).withMessage('Reward type must be xp or coins'),
  body('rewardValue').optional().isNumeric().withMessage('Reward value must be numeric')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();

    const task = await GameTask.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task',
      error: error.message
    });
  }
});

// Delete task
router.delete('/tasks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message
    });
  }
});

// Toggle task override
router.patch('/tasks/:id/toggle-override', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    task.isOverride = !task.isOverride;
    task.updatedBy = req.user.userId;
    task.updatedAt = new Date();

    await task.save();

    res.json({
      success: true,
      message: `Task override ${task.isOverride ? 'enabled' : 'disabled'} successfully`,
      data: { isOverride: task.isOverride }
    });
  } catch (error) {
    console.error('Error toggling task override:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle task override',
      error: error.message
    });
  }
});

// ==================== GAME DISPLAY RULES ====================

// Get game display rules
router.get('/display-rules', adminAuth, async (req, res) => {
  try {
    const rules = await GameDisplayRule.find({ isEnabled: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting display rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get display rules',
      error: error.message
    });
  }
});

// Create game display rule
router.post('/display-rules', adminAuth, [
  body('userMilestone').notEmpty().withMessage('User milestone is required'),
  body('maxGamesToShow').isNumeric().withMessage('Max games to show must be numeric'),
  body('isEnabled').isBoolean().withMessage('Enabled status must be boolean')
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

    const ruleData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const rule = new GameDisplayRule(ruleData);
    await rule.save();

    res.status(201).json({
      success: true,
      message: 'Display rule created successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error creating display rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create display rule',
      error: error.message
    });
  }
});

// Update game display rule
router.put('/display-rules/:id', adminAuth, [
  body('maxGamesToShow').optional().isNumeric().withMessage('Max games to show must be numeric'),
  body('isEnabled').optional().isBoolean().withMessage('Enabled status must be boolean')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();

    const rule = await GameDisplayRule.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Display rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Display rule updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating display rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update display rule',
      error: error.message
    });
  }
});

// ==================== TASK PROGRESSION RULES ====================

// Get task progression rules
router.get('/progression-rules', adminAuth, async (req, res) => {
  try {
    const rules = await TaskProgressionRule.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('taskId', 'name')
      .lean();

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting progression rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progression rules',
      error: error.message
    });
  }
});

// Create task progression rule
router.post('/progression-rules', adminAuth, [
  body('taskId').notEmpty().withMessage('Task ID is required'),
  body('unlockCondition').notEmpty().withMessage('Unlock condition is required'),
  body('lockType').isIn(['sequential', 'timed', 'manual']).withMessage('Invalid lock type'),
  body('rewardTriggerRule').notEmpty().withMessage('Reward trigger rule is required')
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

    const ruleData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const rule = new TaskProgressionRule(ruleData);
    await rule.save();

    res.status(201).json({
      success: true,
      message: 'Progression rule created successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error creating progression rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create progression rule',
      error: error.message
    });
  }
});

// Update task progression rule
router.put('/progression-rules/:id', adminAuth, [
  body('unlockCondition').optional().notEmpty().withMessage('Unlock condition cannot be empty'),
  body('lockType').optional().isIn(['sequential', 'timed', 'manual']).withMessage('Invalid lock type'),
  body('rewardTriggerRule').optional().notEmpty().withMessage('Reward trigger rule cannot be empty')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();

    const rule = await TaskProgressionRule.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Progression rule not found'
      });
    }

    res.json({
      success: true,
      message: 'Progression rule updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating progression rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update progression rule',
      error: error.message
    });
  }
});

// ==================== WELCOME BONUS TIMER RULES ====================

// Get welcome bonus timer rules
router.get('/welcome-bonus-timer', adminAuth, async (req, res) => {
  try {
    const rules = await WelcomeBonusTimer.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting welcome bonus timer rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get welcome bonus timer rules',
      error: error.message
    });
  }
});

// Update welcome bonus timer rules
router.put('/welcome-bonus-timer', adminAuth, [
  body('unlockTimeHours').isNumeric().withMessage('Unlock time must be numeric'),
  body('completionDeadlineDays').isNumeric().withMessage('Completion deadline must be numeric')
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

    // Find existing rule or create new one
    let rule = await WelcomeBonusTimer.findOne({ isActive: true });

    if (rule) {
      rule.unlockTimeHours = req.body.unlockTimeHours;
      rule.completionDeadlineDays = req.body.completionDeadlineDays;
      rule.gameOverrides = req.body.gameOverrides || [];
      rule.xpTierOverrides = req.body.xpTierOverrides || [];
      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();
    } else {
      rule = new WelcomeBonusTimer({
        ...req.body,
        createdBy: req.user.userId
      });
    }

    await rule.save();

    res.json({
      success: true,
      message: 'Welcome bonus timer rules updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating welcome bonus timer rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update welcome bonus timer rules',
      error: error.message
    });
  }
});

// ==================== MASTER DATA ENDPOINTS ====================

// Get countries list
router.get('/master-data/countries', adminAuth, async (req, res) => {
  try {
    const countries = [
      { code: 'US', name: 'United States' },
      { code: 'IN', name: 'India' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'BR', name: 'Brazil' },
      { code: 'MX', name: 'Mexico' },
      { code: 'JP', name: 'Japan' }
    ];

    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    console.error('Error getting countries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get countries',
      error: error.message
    });
  }
});

// Get SDK providers list
router.get('/master-data/sdk-providers', adminAuth, async (req, res) => {
  try {
    const providers = [
      { id: 'bitlabs', name: 'BitLabs' },
      { id: 'adgem', name: 'AdGem' },
      { id: 'besitos', name: 'Besitos' },
      { id: 'cpx', name: 'CPX Research' },
      { id: 'ayet', name: 'Ayet Studios' },
      { id: 'unity', name: 'Unity Ads' },
      { id: 'ironsource', name: 'IronSource' }
    ];

    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('Error getting SDK providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SDK providers',
      error: error.message
    });
  }
});

// Get XPTR values list
router.get('/master-data/xptr-values', adminAuth, async (req, res) => {
  try {
    const xptrValues = [
      'Play 5 minutes',
      'Play 10 minutes',
      'Play 15 minutes',
      'Watch Ad',
      'Complete Level 1',
      'Complete Level 3',
      'Complete Level 5',
      'Install Game',
      'Open Event',
      'Video Completed'
    ];

    res.json({
      success: true,
      data: xptrValues
    });
  } catch (error) {
    console.error('Error getting XPTR values:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get XPTR values',
      error: error.message
    });
  }
});

// Get tier access list
router.get('/master-data/tier-access', adminAuth, async (req, res) => {
  try {
    const tiers = [
      { id: 'free', name: 'Free' },
      { id: 'bronze', name: 'Bronze' },
      { id: 'silver', name: 'Silver' },
      { id: 'gold', name: 'Gold' },
      { id: 'platinum', name: 'Platinum' }
    ];

    res.json({
      success: true,
      data: tiers
    });
  } catch (error) {
    console.error('Error getting tier access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tier access',
      error: error.message
    });
  }
});

// Check if game ID is available
router.get('/games/by-sdk/:sdk', adminAuth, async (req, res) => {
  try {
    const { sdk } = req.params;
    if (sdk === "besitos") {
      await besitosController.getOffers(req, res);
    } else {
      res.status(404).json({
        success: false,
        message: 'No games found for the selected SDK.'
      });
    }
  } catch (error) {
    console.error('Error while fetching game list:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the game list.',
      error: error.message
    });
  }
});

/**
 * Seed games from segments JSON structure
 * POST /api/admin/game-offers/seed-games
 * Body: {
 *   segments: { gender -> ageRange -> uiSection -> [titles] },
 *   region: 'US',
 *   device: 'android'
 * }
 */
router.post('/seed-games', adminAuth, async (req, res) => {
  try {
    const { segments, region = 'US', device = 'android' } = req.body;

    if (!segments || typeof segments !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'segments object is required in request body'
      });
    }

    const besitosService = require('../services/besitos.service');
    
    // Helper to normalize titles for matching
    const normalizeTitle = (title = '') => {
      return String(title)
        .toLowerCase()
        .replace(/®|\u00ae/g, '')
        .replace(/[^a-z0-9\s:-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const stripHtml = (html = '') => {
      return String(html).replace(/<[^>]*>/g, '').trim();
    };

    // Fetch all Besitos offers once
    console.log(`Fetching Besitos offers for ${device}/${region}...`);
    let offersPayload;
    try {
      offersPayload = await besitosService.getOffers({ 
        platform: device === 'ios' ? 'iOS' : 'Android', 
        country: region 
      });
    } catch (e) {
      console.error('Failed to fetch Besitos offers:', e);
      return res.status(503).json({
        success: false,
        message: 'Failed to fetch offers from Besitos API',
        error: e.message || 'Service unavailable'
      });
    }

    const offers = Array.isArray(offersPayload?.data) ? offersPayload.data : [];
    if (offers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No offers found from Besitos API'
      });
    }

    console.log(`Found ${offers.length} Besitos offers`);

    // Build a normalized lookup map
    const offerMap = new Map();
    offers.forEach(offer => {
      const norm = normalizeTitle(offer.title || offer.name);
      if (norm) {
        offerMap.set(norm, offer);
      }
    });

    // Process segments
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      matched: [],
      unmatched: []
    };

    for (const [genderKey, ageRanges] of Object.entries(segments)) {
      const gender = genderKey.toLowerCase();

      for (const [ageRangeKey, uiSections] of Object.entries(ageRanges)) {
        for (const [uiSectionKey, titles] of Object.entries(uiSections)) {
          if (!Array.isArray(titles)) continue;

          for (const title of titles) {
            const norm = normalizeTitle(title);
            const external = offerMap.get(norm);

            if (!external) {
              results.unmatched.push({ title, gender, ageRange: ageRangeKey, uiSection: uiSectionKey });
              results.skipped++;
              continue;
            }

            results.matched.push({ title, gameId: external.id });

            // Build game data
            const gameData = {
              gameId: external.id,
              title: external.title || external.name || title,
              description: stripHtml(external.description || '') || 'No description available',
              category: (Array.isArray(external.categories) && external.categories[0]?.name) 
                ? external.categories[0].name 
                : (external.category || 'General'),
              
              sdkProvider: 'besitos',
              countries: [region],
              xptrRules: 'default',
              platform: device === 'ios' ? 'iOS' : 'Android',
              status: 'active',
              
              rewards: {
                coins: 50,
                xp: 100
              },

              metadata: {
                genre: (Array.isArray(external.categories) && external.categories[0]?.name) 
                  ? external.categories[0].name 
                  : (external.category || 'General'),
                thumbnail: {
                  url: external.large_image || external.image || external.square_image || '',
                  dimensions: { width: 512, height: 512 },
                  altText: `${external.title || title} thumbnail`
                },
                images: {
                  icon: external.square_image || external.image || '',
                  banner: external.large_image || external.image || '',
                  screenshots: []
                },
                packageName: external.bundle_id || '',
                developer: '',
                rating: 4.0,
                downloads: '1M+',
                size: '',
                version: '',
                lastUpdated: new Date(),
                ageRating: '12+'
              },

              gameDetails: {
                id: external.id || '',
                name: external.title || external.name || title,
                description: stripHtml(external.description || ''),
                image: external.image || external.large_image || '',
                square_image: external.square_image || '',
                large_image: external.large_image || external.image || '',
                category: (Array.isArray(external.categories) && external.categories[0]?.name) 
                  ? external.categories[0].name 
                  : (external.category || ''),
                downloadUrl: external.url || ''
              },

              uiSection: uiSectionKey,
              gender: gender,
              ageGroups: [ageRangeKey],
              createdBy: req.user.userId
            };

            try {
              const existing = await Game.findOne({ gameId: external.id });
              
              if (existing) {
                // Update targeting, uiSection, and gameDetails
                await Game.updateOne(
                  { gameId: external.id },
                  {
                    $set: {
                      uiSection: uiSectionKey,
                      gender: gender,
                      ageGroups: [ageRangeKey],
                      gameDetails: gameData.gameDetails,
                      metadata: gameData.metadata,
                      title: gameData.title,
                      description: gameData.description,
                      category: gameData.category
                    }
                  }
                );
                results.updated++;
              } else {
                // Create new game
                await Game.create(gameData);
                results.created++;
              }
            } catch (err) {
              console.error(`Error upserting game ${external.id}:`, err.message);
              results.errors.push({
                title,
                gameId: external.id,
                error: err.message
              });
            }
          }
        }
      }
    }

    console.log('Seed complete:', results);

    res.json({
      success: true,
      message: 'Game seeding completed',
      data: {
        summary: {
          totalProcessed: results.created + results.updated + results.skipped,
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          errors: results.errors.length
        },
        matched: results.matched.length,
        unmatched: results.unmatched,
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Error seeding games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to seed games',
      error: error.message
    });
  }
});


module.exports = router;

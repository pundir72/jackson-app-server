/**
 * Non-Game Offers Routes
 * Handles surveys, magic receipts, cashback, and shopping offers
 * @module routes/non-game-offers
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const bitlabsNonGames = require('../utils/bitlabs-non-games');

/**
 * GET /api/non-game-offers
 * Get all non-game offers (surveys, magic receipts, cashback, shopping)
 */
router.get('/', protect, async (req, res) => {
  try {
    const { type = 'all', category = 'all', page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const result = await bitlabsNonGames.getNonGameOffers({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13',
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      type,
      category
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch non-game offers'
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.offers.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        offers: paginatedOffers,
        categorized: result.categorized,
        breakdown: result.breakdown,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.offers.length,
          pages: Math.ceil(result.offers.length / parseInt(limit))
        },
        type: type || 'all',
        category: category || 'all',
        totalOffers: result.totalOffers,
        estimatedEarnings: result.estimatedEarnings
      }
    });
  } catch (error) {
    console.error('Error getting non-game offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get non-game offers'
    });
  }
});

/**
 * GET /api/non-game-offers/surveys
 * Get survey offers
 */
router.get('/surveys', protect, async (req, res) => {
  try {
    const { category = 'all', page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const result = await bitlabsNonGames.getSurveys({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13',
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      category
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch surveys'
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.categorized.surveys.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        surveys: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.categorized.surveys.length,
          pages: Math.ceil(result.categorized.surveys.length / parseInt(limit))
        },
        totalSurveys: result.categorized.surveys.length,
        estimatedEarnings: result.categorized.surveys.reduce((sum, s) => sum + (s.reward?.coins || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error getting surveys:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get surveys'
    });
  }
});

/**
 * GET /api/non-game-offers/magic-receipts
 * Get magic receipt offers
 */
router.get('/magic-receipts', protect, async (req, res) => {
  try {
    const { category = 'all', page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const result = await bitlabsNonGames.getMagicReceipts({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13',
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      category
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch magic receipts'
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.categorized.magicReceipts.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        magicReceipts: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.categorized.magicReceipts.length,
          pages: Math.ceil(result.categorized.magicReceipts.length / parseInt(limit))
        },
        totalMagicReceipts: result.categorized.magicReceipts.length,
        estimatedEarnings: result.categorized.magicReceipts.reduce((sum, m) => sum + (m.reward?.coins || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error getting magic receipts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get magic receipts'
    });
  }
});

/**
 * GET /api/non-game-offers/cashback
 * Get cashback offers
 */
router.get('/cashback', protect, async (req, res) => {
  try {
    const { category = 'all', page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const result = await bitlabsNonGames.getCashbackOffers({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13',
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      category
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch cashback offers'
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.categorized.cashback.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        cashback: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.categorized.cashback.length,
          pages: Math.ceil(result.categorized.cashback.length / parseInt(limit))
        },
        totalCashback: result.categorized.cashback.length,
        estimatedEarnings: result.categorized.cashback.reduce((sum, c) => sum + (c.reward?.coins || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error getting cashback offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cashback offers'
    });
  }
});

/**
 * GET /api/non-game-offers/shopping
 * Get shopping offers
 */
router.get('/shopping', protect, async (req, res) => {
  try {
    const { category = 'all', page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const result = await bitlabsNonGames.getShoppingOffers({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13',
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress
      },
      category
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to fetch shopping offers'
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.categorized.shopping.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        shopping: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.categorized.shopping.length,
          pages: Math.ceil(result.categorized.shopping.length / parseInt(limit))
        },
        totalShopping: result.categorized.shopping.length,
        estimatedEarnings: result.categorized.shopping.reduce((sum, s) => sum + (s.reward?.coins || 0), 0)
      }
    });
  } catch (error) {
    console.error('Error getting shopping offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get shopping offers'
    });
  }
});

/**
 * POST /api/non-game-offers/click
 * Track offer click
 */
router.post('/click', protect, async (req, res) => {
  try {
    const { offerId, offerType } = req.body;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: 'offerId is required'
      });
    }

    const result = await bitlabsNonGames.trackOfferClick({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || 'other'
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || 'Failed to track offer click'
      });
    }

    res.json({
      success: true,
      data: {
        trackingId: result.trackingId,
        message: result.message
      }
    });
  } catch (error) {
    console.error('Error tracking offer click:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track offer click'
    });
  }
});

/**
 * POST /api/non-game-offers/complete
 * Track offer completion and award rewards
 */
router.post('/complete', protect, async (req, res) => {
  try {
    const { offerId, offerType, completionData, reward } = req.body;
    const user = await User.findById(req.user.userId).select('wallet xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: 'offerId is required'
      });
    }

    // Track completion
    const trackingResult = await bitlabsNonGames.trackCompletion({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || 'other',
      completionData,
      reward
    });

    if (!trackingResult.success) {
      return res.status(500).json({
        success: false,
        error: trackingResult.error || 'Failed to track offer completion'
      });
    }

    // Award rewards if provided
    const finalReward = reward || trackingResult.reward || 0;
    if (finalReward > 0) {
      const coins = Math.round(finalReward);
      const xp = Math.round(finalReward * 0.5);

      // Update user wallet and XP
      user.wallet.balance = (user.wallet.balance || 0) + coins;
      user.wallet.lastUpdated = new Date();
      user.xp.current = (user.xp.current || 0) + xp;
      user.xp.total = (user.xp.total || 0) + xp;

      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: 'credit',
        amount: coins,
        description: `Non-game offer completed - ${offerType || 'offer'}`,
        status: 'completed',
        referenceId: offerId
      });

      await Promise.all([
        user.save(),
        transaction.save()
      ]);

      res.json({
        success: true,
        data: {
          message: 'Offer completed successfully!',
          reward: {
            coins,
            xp
          },
          newBalance: user.wallet.balance,
          newXP: user.xp.current
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          message: 'Offer completion tracked',
          reward: {
            coins: 0,
            xp: 0
          }
        }
      });
    }
  } catch (error) {
    console.error('Error tracking offer completion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track offer completion'
    });
  }
});

/**
 * POST /api/non-game-offers/callback/bitlabs
 * Webhook endpoint for Bitlabs callbacks
 */
router.post('/callback/bitlabs', async (req, res) => {
  try {
    const { signature, ...callbackData } = req.body;

    // Verify callback signature
    const verification = await bitlabsNonGames.verifyCallback({
      callbackData,
      signature
    });

    if (!verification.success || !verification.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback signature'
      });
    }

    // Process callback data
    const { userId, offerId, reward, status } = callbackData;

    if (userId && offerId && reward && status === 'completed') {
      // Find user and award reward
      const user = await User.findById(userId).select('wallet xp');
      if (user) {
        const coins = Math.round(reward);
        const xp = Math.round(reward * 0.5);

        user.wallet.balance = (user.wallet.balance || 0) + coins;
        user.wallet.lastUpdated = new Date();
        user.xp.current = (user.xp.current || 0) + xp;
        user.xp.total = (user.xp.total || 0) + xp;

        const transaction = new Transaction({
          user: user._id,
          type: 'credit',
          amount: coins,
          description: `Bitlabs offer completed - ${offerId}`,
          status: 'completed',
          referenceId: offerId
        });

        await Promise.all([
          user.save(),
          transaction.save()
        ]);
      }
    }

    res.json({
      success: true,
      message: 'Callback processed successfully'
    });
  } catch (error) {
    console.error('Error processing Bitlabs callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process callback'
    });
  }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const besitos = require('../utils/besitos');
const verisoul = require('../utils/verisoul');
const analytics = require('../utils/analytics');

// Get available game offers
router.get('/offers', protect, async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get Besitos game offers
    const besitosResult = await besitos.getGameOffers({
      userId: user._id.toString(),
      userProfile: {
        age: user.profile?.age || 25,
        gender: user.profile?.gender || 'other',
        country: user.location?.country || 'US',
        language: user.preferences?.language || 'en',
        interests: user.preferences?.interests || [],
        gamingPreferences: user.preferences?.gamingPreferences || [],
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceModel: 'iPhone 13'
      }
    });

    if (!besitosResult.success) {
      return res.status(500).json({
        success: false,
        error: besitosResult.error || 'Failed to get game offers'
      });
    }

    // Filter by category if specified
    let offers = besitosResult.offers;
    if (category && category !== 'all') {
      offers = offers.filter(offer => offer.category === category);
    }

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = offers.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        offers: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: offers.length,
          pages: Math.ceil(offers.length / limit)
        },
        category: category || 'all',
        totalOffers: besitosResult.totalOffers,
        estimatedEarnings: besitosResult.estimatedEarnings
      }
    });
  } catch (error) {
    console.error('Error getting game offers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game offers'
    });
  }
});

// Track game installation
router.post('/install', protect, async (req, res) => {
  try {
    const { offerId, gameId } = req.body;
    const user = await User.findById(req.user.userId).select('profile location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Track installation with Besitos
    const trackingResult = await besitos.trackInstallation({
      userId: user._id.toString(),
      offerId: offerId,
      gameId: gameId,
      deviceInfo: {
        platform: 'mobile',
        osVersion: 'iOS 15.0',
        appVersion: '1.0.0',
        deviceId: req.headers['x-device-id'] || 'unknown',
        ipAddress: req.ip
      }
    });

    if (!trackingResult.success) {
      return res.status(400).json({
        success: false,
        error: trackingResult.error || 'Failed to track installation'
      });
    }

    // Update user's games array
    const existingGameIndex = user.games.findIndex(g => g.gameId === gameId);
    if (existingGameIndex >= 0) {
      user.games[existingGameIndex].installedAt = new Date();
      user.games[existingGameIndex].trackingId = trackingResult.trackingId;
      user.games[existingGameIndex].status = 'installed'; // Ensure status is set
      if (offerId) user.games[existingGameIndex].offerId = offerId; // Update offerId if provided
    } else {
      user.games.push({
        gameId: gameId,
        offerId: offerId,
        installedAt: new Date(),
        trackingId: trackingResult.trackingId,
        status: 'installed'
      });
    }

    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Game installation tracked successfully',
        trackingId: trackingResult.trackingId,
        status: trackingResult.status,
        reward: trackingResult.reward
      }
    });
  } catch (error) {
    console.error('Error tracking game installation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track game installation'
    });
  }
});

// Track game completion
router.post('/complete', protect, async (req, res) => {
  try {
    const { offerId, gameId, completionData } = req.body;
    const user = await User.findById(req.user.userId).select('xp vip wallet games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Track completion with Besitos
    const completionResult = await besitos.trackCompletion({
      userId: user._id.toString(),
      offerId: offerId,
      gameId: gameId,
      completionData: {
        levelReached: completionData.levelReached || 1,
        score: completionData.score || 0,
        timePlayedMinutes: completionData.timePlayedMinutes || 0,
        tasksCompleted: completionData.tasksCompleted || [],
        achievements: completionData.achievements || []
      }
    });

    if (!completionResult.success) {
      return res.status(400).json({
        success: false,
        error: completionResult.error || 'Failed to track completion'
      });
    }

    // Calculate final reward with VIP multiplier
    const vipMultiplier = await getVIPMultiplier(user);
    const finalReward = Math.round(completionResult.totalReward * vipMultiplier);
    const xpReward = Math.round(finalReward * 0.5);

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + finalReward;
    user.wallet.lastUpdated = new Date();
    user.xp.current = (user.xp.current || 0) + xpReward;
    user.xp.total = (user.xp.total || 0) + xpReward;

    // Update game status
    const gameIndex = user.games.findIndex(g => g.gameId === gameId);
    if (gameIndex >= 0) {
      user.games[gameIndex].completed = true;
      user.games[gameIndex].completedAt = new Date();
      user.games[gameIndex].levelReached = completionData.levelReached || 1;
      user.games[gameIndex].score = completionData.score || 0;
      user.games[gameIndex].timePlayed = completionData.timePlayedMinutes || 0;
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: finalReward,
      description: `Game completed - ${gameId}`,
      status: 'completed',
      referenceId: `GAME-${gameId}-${Date.now()}`
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        message: 'Game completed successfully!',
        reward: finalReward,
        xpReward: xpReward,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        bonusReward: completionResult.bonusReward
      }
    });
  } catch (error) {
    console.error('Error tracking game completion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track game completion'
    });
  }
});

// Get game offer categories
router.get('/categories', protect, async (req, res) => {
  try {
    const categoriesResult = await besitos.getCategories();

    if (!categoriesResult.success) {
      return res.status(500).json({
        success: false,
        error: categoriesResult.error || 'Failed to get categories'
      });
    }

    res.json({
      success: true,
      data: {
        categories: categoriesResult.categories
      }
    });
  } catch (error) {
    console.error('Error getting game categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game categories'
    });
  }
});

// Get user game history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const user = await User.findById(req.user.userId).select('games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get Besitos history
    const historyResult = await besitos.getUserHistory(user._id.toString(), {
      page: parseInt(page),
      limit: parseInt(limit),
      status: status
    });

    if (!historyResult.success) {
      return res.status(500).json({
        success: false,
        error: historyResult.error || 'Failed to get game history'
      });
    }

    res.json({
      success: true,
      data: {
        history: historyResult.history,
        pagination: historyResult.pagination,
        totalEarnings: historyResult.totalEarnings
      }
    });
  } catch (error) {
    console.error('Error getting game history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game history'
    });
  }
});

// Get user earnings summary
router.get('/earnings', protect, async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get Besitos earnings summary
    const earningsResult = await besitos.getEarningsSummary(user._id.toString(), period);

    if (!earningsResult.success) {
      return res.status(500).json({
        success: false,
        error: earningsResult.error || 'Failed to get earnings summary'
      });
    }

    res.json({
      success: true,
      data: {
        summary: earningsResult.summary
      }
    });
  } catch (error) {
    console.error('Error getting earnings summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get earnings summary'
    });
  }
});

// Game offer completion callback (called by Besitos)
router.post('/callback/besitos', async (req, res) => {
  try {
    const { userId, offerId, trackingId, signature } = req.body;
    
    // Verify callback with Besitos
    const verification = await besitos.verifyCallback({
      userId: userId,
      offerId: offerId,
      trackingId: trackingId,
      signature: signature
    });

    if (!verification.success || !verification.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback data'
      });
    }

    // Find user
    const user = await User.findById(userId).select('xp vip wallet games');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Calculate final reward with VIP multiplier
    const vipMultiplier = await getVIPMultiplier(user);
    const finalReward = Math.round(verification.reward * vipMultiplier);
    const xpReward = Math.round(finalReward * 0.5);

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + finalReward;
    user.wallet.lastUpdated = new Date();
    user.xp.current = (user.xp.current || 0) + xpReward;
    user.xp.total = (user.xp.total || 0) + xpReward;

    // Update game status
    const gameIndex = user.games.findIndex(g => g.offerId === offerId);
    if (gameIndex >= 0) {
      user.games[gameIndex].completed = true;
      user.games[gameIndex].completedAt = new Date();
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: finalReward,
      description: `Game offer completed - ${offerId}`,
      status: 'completed',
      referenceId: `OFFER-${offerId}-${Date.now()}`
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    // Track OfferCompleted event (Analytics)
    await analytics.log('OfferCompleted', {
      userId: userId,
      offerId: offerId,
      provider: 'besitos',
      reward: finalReward,
      xpReward: xpReward,
      timestamp: new Date(),
      action: 'offer_completed'
    }).catch(err => console.error('Failed to log OfferCompleted event:', err));

    res.json({
      success: true,
      data: {
        message: 'Game offer completed successfully!',
        reward: finalReward,
        newBalance: user.wallet.balance
      }
    });
  } catch (error) {
    console.error('Error processing game offer callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process game offer callback'
    });
  }
});

// Helper functions
async function getVIPMultiplier(user) {
  try {
    const VIPTier = require('../models/VIPTier');
    const VIPSubscription = require('../models/VIPSubscription');
    
    const activeSubscription = await VIPSubscription.getActiveSubscription(user._id);
    if (!activeSubscription || !activeSubscription.isActive()) {
      return 1.0;
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    return tier ? tier.features.xpMultiplier || 1.0 : 1.0;
  } catch (error) {
    console.error('Error getting VIP multiplier:', error);
    return 1.0;
  }
}

module.exports = router;


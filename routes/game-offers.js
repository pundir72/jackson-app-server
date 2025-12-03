const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Game = require('../models/Game');
const besitos = require('../utils/besitos');
const bitlabsGames = require('../utils/bitlabs-games');
const bitlabsOfferCache = require('../utils/bitlabsOfferCache');
const verisoul = require('../utils/verisoul');

// Get available game offers
router.get('/offers', protect, async (req, res) => {
  try {
    const { category, page = 1, limit = 20, provider = 'all' } = req.query;
    const user = await User.findById(req.user.userId).select('xp vip profile location preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const allOffers = [];
    let totalOffers = 0;
    let estimatedEarnings = 0;

    // Get Besitos game offers (if provider is 'all' or 'besitos')
    if (provider === 'all' || provider === 'besitos') {
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

      if (besitosResult.success && besitosResult.offers) {
        // Add provider tag to each offer
        const besitosOffers = besitosResult.offers.map(offer => ({
          ...offer,
          provider: 'besitos'
        }));
        allOffers.push(...besitosOffers);
        totalOffers += besitosResult.totalOffers || 0;
        estimatedEarnings += besitosResult.estimatedEarnings || 0;
      }
    }

    // Get Bitlabs game offers (if provider is 'all' or 'bitlabs')
    if (provider === 'all' || provider === 'bitlabs') {
      const bitlabsResult = await bitlabsGames.getGameOffers({
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

      if (bitlabsResult.success && bitlabsResult.offers) {
        // Add provider tag to each offer
        const bitlabsOffers = bitlabsResult.offers.map(offer => ({
          ...offer,
          provider: 'bitlabs'
        }));
        allOffers.push(...bitlabsOffers);
        totalOffers += bitlabsResult.totalOffers || 0;
        estimatedEarnings += bitlabsResult.estimatedEarnings || 0;
      }
    }

    // Filter by category if specified
    let offers = allOffers;
    if (category && category !== 'all') {
      offers = offers.filter(offer => offer.category === category || offer.genre === category);
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
        provider: provider || 'all',
        totalOffers: totalOffers || offers.length,
        estimatedEarnings: estimatedEarnings
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
    const { offerId, gameId, provider = 'besitos' } = req.body;
    const user = await User.findById(req.user.userId).select('profile location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    let trackingResult;

    // Track installation based on provider
    if (provider === 'bitlabs') {
      trackingResult = await bitlabsGames.trackInstallation({
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
    } else {
      // Default to Besitos
      trackingResult = await besitos.trackInstallation({
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
    }

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
    const { offerId, gameId, completionData, provider = 'besitos' } = req.body;
    const user = await User.findById(req.user.userId).select('xp vip wallet games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    let completionResult;

    // Track completion based on provider
    if (provider === 'bitlabs') {
      completionResult = await bitlabsGames.trackCompletion({
        userId: user._id.toString(),
        offerId: offerId,
        gameId: gameId,
        completionData: {
          levelReached: completionData.levelReached || 1,
          score: completionData.score || 0,
          timePlayedMinutes: completionData.timePlayedMinutes || 0,
          tasksCompleted: completionData.tasksCompleted || [],
          achievements: completionData.achievements || [],
          reward: completionData.reward || 0
        }
      });
    } else {
      // Default to Besitos
      completionResult = await besitos.trackCompletion({
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
    }

    if (!completionResult.success) {
      return res.status(400).json({
        success: false,
        error: completionResult.error || 'Failed to track completion'
      });
    }

    // Calculate final reward with VIP multiplier
    const vipMultiplier = await getVIPMultiplier(user);
    const finalReward = Math.round(completionResult.totalReward * vipMultiplier);
    const baseXp = Math.round(finalReward * 0.5);

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + finalReward;
    user.wallet.lastUpdated = new Date();

    const { finalXP: xpReward, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, baseXp);

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

    // Find Game document to get ObjectId for proper linking
    let gameDoc = null;
    if (gameId) {
      gameDoc = await Game.findOne({ gameId: gameId }).select('_id').lean();
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: finalReward,
      balanceType: 'coins',
      description: `Game completed - ${gameId}`,
      status: 'completed',
      referenceId: `GAME-${gameId}-${Date.now()}`,
      gameId,
      game: gameDoc?._id || null, // Explicitly set game ObjectId if found
      metadata: {
        gameId,
        offerId,
        provider,
        completionSource: provider,
      },
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

// Game offer completion callback (called by Bitlabs)
router.post('/callback/bitlabs', async (req, res) => {
  try {
    const { userId, offerId, trackingId, signature, reward } = req.body;
    
    // Verify callback with Bitlabs
    const verification = await bitlabsGames.verifyCallback({
      userId: userId,
      offerId: offerId,
      trackingId: trackingId,
      signature: signature,
      reward: reward
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
    const finalReward = Math.round((verification.reward || reward || 0) * vipMultiplier);
    const baseXp = Math.round(finalReward * 0.5);

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + finalReward;
    user.wallet.lastUpdated = new Date();

    const { finalXP: xpReward, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, baseXp);

    user.xp.current = (user.xp.current || 0) + xpReward;
    user.xp.total = (user.xp.total || 0) + xpReward;

    // Update game status
    const gameIndex = user.games.findIndex(g => g.offerId === offerId);
    if (gameIndex >= 0) {
      user.games[gameIndex].completed = true;
      user.games[gameIndex].completedAt = new Date();
    }

    // Find Game document to get ObjectId for proper linking
    // Try to find by offerId first (in case offerId is the gameId), then try to find by any matching gameId
    let gameDoc = null;
    if (offerId) {
      gameDoc = await Game.findOne({ gameId: offerId }).select('_id').lean();
      // If not found, try to find by checking if offerId matches any game's metadata
      if (!gameDoc) {
        gameDoc = await Game.findOne({ 
          $or: [
            { 'gameDetails.id': offerId },
            { 'metadata.packageName': offerId }
          ]
        }).select('_id').lean();
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: finalReward,
      balanceType: 'coins',
      description: `Game offer completed - ${offerId} (Bitlabs)`,
      status: 'completed',
      referenceId: `OFFER-${offerId}-${Date.now()}`,
      gameId: offerId,
      game: gameDoc?._id || null, // Explicitly set game ObjectId if found
      metadata: {
        offerId,
        provider: 'bitlabs',
        gameId: offerId
      },
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

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
    const baseXp = Math.round(finalReward * 0.5);

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + finalReward;
    user.wallet.lastUpdated = new Date();

    const { finalXP: xpReward, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, baseXp);

    user.xp.current = (user.xp.current || 0) + xpReward;
    user.xp.total = (user.xp.total || 0) + xpReward;

    // Update game status
    const gameIndex = user.games.findIndex(g => g.offerId === offerId);
    if (gameIndex >= 0) {
      user.games[gameIndex].completed = true;
      user.games[gameIndex].completedAt = new Date();
    }

    // Find Game document to get ObjectId for proper linking
    // Try to find by offerId first (in case offerId is the gameId), then try to find by any matching gameId
    let gameDoc = null;
    if (offerId) {
      gameDoc = await Game.findOne({ gameId: offerId }).select('_id').lean();
      // If not found, try to find by checking if offerId matches any game's metadata
      if (!gameDoc) {
        gameDoc = await Game.findOne({ 
          $or: [
            { 'gameDetails.id': offerId },
            { 'metadata.packageName': offerId }
          ]
        }).select('_id').lean();
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: finalReward,
      balanceType: 'coins',
      description: `Game offer completed - ${offerId}`,
      status: 'completed',
      referenceId: `OFFER-${offerId}-${Date.now()}`,
      gameId: offerId,
      game: gameDoc?._id || null, // Explicitly set game ObjectId if found
      metadata: {
        offerId,
        provider: 'besitos',
        gameId: offerId
      },
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

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


const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const GameMessage = require('../models/GameMessage');
const BoosterReward = require('../models/BoosterReward');
const AIChat = require('../models/AIChat');
const { OpenAI } = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * GET /api/my-games
 * Get complete My Games screen data
 */
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('games wallet xp vip badges preferences onboarding')
      .populate('games.gameId');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's games with dynamic data
    const userGames = await getUserGamesWithMetadata(user);
    
    // Get account overview data
    const accountOverview = await getAccountOverviewData(user);
    
    // Get booster reward status
    const boosterStatus = await getBoosterRewardStatus(user._id);
    
    // Get non-gaming offers
    const nonGamingOffers = await getNonGamingOffers(user);
    
    // Get AI assistant status
    const aiAssistantStatus = await getAIAssistantStatus(user._id);

    res.json({
      success: true,
      data: {
        // App version (dynamic from env)
        appVersion: process.env.APP_VERSION || 'v1.0.0',
        buildNumber: process.env.BUILD_NUMBER || '1',
        
        // User games list
        games: userGames,
        
        // Account overview
        accountOverview,
        
        // Booster rewards
        boosterRewards: boosterStatus,
        
        // Non-gaming offers
        nonGamingOffers,
        
        // AI assistant
        aiAssistant: aiAssistantStatus,
        
        // Search functionality
        searchEnabled: true,
        
        // User preferences
        userPreferences: {
          searchHistory: user.preferences?.searchHistory || [],
          favoriteGames: user.preferences?.favoriteGames || [],
          lastSearchQuery: user.preferences?.lastSearchQuery || null
        }
      }
    });
  } catch (error) {
    console.error('Error getting My Games data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get My Games data'
    });
  }
});

/**
 * GET /api/my-games/search
 * Search games by title
 */
router.get('/search', protect, async (req, res) => {
  try {
    const { q: searchQuery, category, page = 1, limit = 20 } = req.query;
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('games preferences');

    // Search in user's games and available games
    const searchResults = await searchGames(searchQuery, user, {
      category,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Update user's search history
    await updateSearchHistory(user._id, searchQuery);

    res.json({
      success: true,
      data: {
        query: searchQuery,
        results: searchResults.games,
        pagination: searchResults.pagination,
        suggestions: searchResults.suggestions,
        totalFound: searchResults.total
      }
    });
  } catch (error) {
    console.error('Error searching games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search games'
    });
  }
});

/**
 * POST /api/my-games/ai-chat
 * AI Assistant chat
 */
router.post('/ai-chat', protect, async (req, res) => {
  try {
    const { message, gameId, context } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('games preferences onboarding');

    // Create AI chat session
    const chatSession = new AIChat({
      user: user._id,
      gameId: gameId || null,
      context: context || 'general',
      messages: [{
        role: 'user',
        content: message,
        timestamp: new Date()
      }]
    });

    // Generate AI response
    const aiResponse = await generateAIResponse(message, user, gameId, context);
    
    chatSession.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });

    await chatSession.save();

    res.json({
      success: true,
      data: {
        sessionId: chatSession._id,
        response: aiResponse,
        suggestions: generateChatSuggestions(aiResponse, gameId),
        gameContext: gameId ? await getGameContext(gameId) : null
      }
    });
  } catch (error) {
    console.error('Error with AI chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process AI chat request'
    });
  }
});

/**
 * GET /api/my-games/messages/:gameId
 * Get unread messages for a specific game
 */
router.get('/messages/:gameId', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const messages = await GameMessage.find({
      user: req.user.userId,
      gameId,
      isRead: false
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        gameId,
        unreadCount: messages.length,
        messages: messages.map(msg => ({
          id: msg._id,
          type: msg.type,
          title: msg.title,
          content: msg.content,
          priority: msg.priority,
          createdAt: msg.createdAt,
          expiresAt: msg.expiresAt
        }))
      }
    });
  } catch (error) {
    console.error('Error getting game messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game messages'
    });
  }
});

/**
 * PUT /api/my-games/messages/:messageId/read
 * Mark message as read
 */
router.put('/messages/:messageId/read', protect, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    const message = await GameMessage.findOneAndUpdate(
      { _id: messageId, user: req.user.userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'Message not found'
      });
    }

    res.json({
      success: true,
      data: {
        messageId: message._id,
        isRead: true,
        readAt: message.readAt
      }
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark message as read'
    });
  }
});

/**
 * POST /api/my-games/booster/claim
 * Claim booster reward after watching ad
 */
router.post('/booster/claim', protect, async (req, res) => {
  try {
    const { adId, adDuration, adProvider } = req.body;
    
    const user = await User.findById(req.user.userId)
      .select('wallet xp vip');

    // Check if user can claim booster reward
    const canClaim = await checkBoosterRewardEligibility(user._id);
    
    if (!canClaim.eligible) {
      return res.status(400).json({
        success: false,
        error: canClaim.reason,
        nextAvailableAt: canClaim.nextAvailableAt
      });
    }

    // Calculate booster reward
    const boosterReward = await calculateBoosterReward(user, adDuration);
    
    // Create booster reward record
    const boosterRecord = new BoosterReward({
      user: user._id,
      adId,
      adProvider,
      adDuration,
      reward: boosterReward,
      claimedAt: new Date()
    });

    // Update user's wallet and XP (apply tier multiplier to XP)
    user.wallet.balance += boosterReward.coins;
    user.wallet.lastUpdated = new Date();

    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      boosterReward.xp || 0
    );

    user.xp.current += finalXP;
    user.xp.total += finalXP;

    // Find game if gameId is available in context (may need to be passed in request)
    // For now, we'll try to get it from user's games if available
    let gameDoc = null;
    const { gameId } = req.body; // Check if gameId is passed in request
    if (gameId) {
      const Game = require('../models/Game');
      gameDoc = await Game.findOne({ gameId: gameId }).select('_id gameId').lean();
    }

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount: boosterReward.coins,
      balanceType: 'coins',
      description: `Booster reward from ${adProvider} ad${gameId ? ` - ${gameId}` : ''}`,
      status: 'completed',
      referenceId: `BOOSTER-${gameId || 'general'}-${Date.now()}`,
      gameId: gameDoc?.gameId || gameId || null,
      game: gameDoc?._id || null,
      metadata: {
        gameId: gameDoc?.gameId || gameId || null,
        adProvider: adProvider,
        adId: adId,
        source: 'booster_reward'
      },
    });

    await Promise.all([
      user.save(),
      boosterRecord.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        reward: boosterReward,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        nextAvailableAt: new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours
      }
    });
  } catch (error) {
    console.error('Error claiming booster reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim booster reward'
    });
  }
});

/**
 * GET /api/my-games/booster/status
 * Get booster reward status
 */
router.get('/booster/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    const boosterStatus = await getBoosterRewardStatus(user._id);
    
    res.json({
      success: true,
      data: boosterStatus
    });
  } catch (error) {
    console.error('Error getting booster status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get booster status'
    });
  }
});

/**
 * DELETE /api/my-games/games/:gameId
 * Remove game from user's list
 */
router.delete('/games/:gameId', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const user = await User.findById(req.user.userId);
    
    // Remove game from user's games array
    user.games = user.games.filter(game => game.gameId !== gameId);
    
    // Remove associated messages
    await GameMessage.deleteMany({
      user: user._id,
      gameId
    });
    
    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Game removed successfully',
        gameId
      }
    });
  } catch (error) {
    console.error('Error removing game:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove game'
    });
  }
});

/**
 * PUT /api/my-games/games/:gameId/favorite
 * Toggle favorite status for a game
 */
router.put('/games/:gameId/favorite', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { isFavorite } = req.body;
    
    const user = await User.findById(req.user.userId);
    
    if (!user.preferences) {
      user.preferences = {};
    }
    
    if (!user.preferences.favoriteGames) {
      user.preferences.favoriteGames = [];
    }
    
    if (isFavorite) {
      if (!user.preferences.favoriteGames.includes(gameId)) {
        user.preferences.favoriteGames.push(gameId);
      }
    } else {
      user.preferences.favoriteGames = user.preferences.favoriteGames.filter(
        id => id !== gameId
      );
    }
    
    await user.save();

    res.json({
      success: true,
      data: {
        gameId,
        isFavorite,
        favoriteGames: user.preferences.favoriteGames
      }
    });
  } catch (error) {
    console.error('Error toggling favorite:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle favorite status'
    });
  }
});

// Helper functions

async function getUserGamesWithMetadata(user) {
  const userGames = user.games || [];
  
  return Promise.all(userGames.map(async (game) => {
    // Get unread message count
    const unreadCount = await GameMessage.countDocuments({
      user: user._id,
      gameId: game.gameId,
      isRead: false
    });
    
    // Get game-specific data
    const gameData = await getGameData(game.gameId);
    
    return {
      gameId: game.gameId,
      title: gameData.title || 'Unknown Game',
      icon: gameData.icon || '🎮',
      description: gameData.description || '',
      category: gameData.category || 'General',
      coinReward: gameData.coinReward || 0,
      xpReward: gameData.xpReward || 0,
      difficulty: gameData.difficulty || 'Medium',
      timeRequired: gameData.timeRequired || '10 min',
      isInstalled: true,
      isFavorite: user.preferences?.favoriteGames?.includes(game.gameId) || false,
      playCount: game.playCount || 0,
      lastPlayed: game.lastPlayed,
      completed: game.completed || false,
      progress: game.progress || 0,
      hasUnread: unreadCount > 0,
      unreadCount,
      earningPotential: gameData.earningPotential || 0,
      isNew: gameData.isNew || false,
      isUpdated: gameData.isUpdated || false
    };
  }));
}

async function getAccountOverviewData(user) {
  // Get today's progress
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Get today's transactions
  const todayTransactions = await Transaction.find({
    user: user._id,
    type: 'credit',
    createdAt: { $gte: today, $lt: tomorrow }
  });
  
  const coinsEarnedToday = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  // Get games played today (including games with progress > 0)
  const gamesPlayedToday = user.games?.filter(game => {
    const gameDate = new Date(game.lastPlayed || game.completedAt);
    const isToday = gameDate >= today && gameDate < tomorrow;
    const hasProgress = game.completed || (game.progress && game.progress > 0);
    return isToday && hasProgress;
  }).length || 0;
  
  // Get challenges completed today
  const challengesCompletedToday = user.challenges?.filter(challenge => {
    const challengeDate = new Date(challenge.completedAt || challenge.date);
    return challengeDate >= today && challengeDate < tomorrow && challenge.completed;
  }).length || 0;
  
  return {
    totalEarnings: {
      coins: user.wallet?.balance || 0,
      xp: user.xp?.current || 0
    },
    todayProgress: {
      gamesPlayed: gamesPlayedToday,
      coinsEarned: coinsEarnedToday,
      challengesCompleted: challengesCompletedToday
    },
    streak: {
      current: user.streak?.current || 0,
      lastUpdated: user.streak?.lastUpdated
    },
    badges: user.badges || [],
    tier: getCurrentTier(user.xp?.current || 0)
  };
}

async function getBoosterRewardStatus(userId) {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  
  // Check last booster reward
  const lastBooster = await BoosterReward.findOne({
    user: userId,
    claimedAt: { $gte: fourHoursAgo }
  }).sort({ claimedAt: -1 });
  
  const isAvailable = !lastBooster;
  const nextAvailableAt = lastBooster ? 
    new Date(lastBooster.claimedAt.getTime() + 4 * 60 * 60 * 1000) : 
    now;
  
  return {
    isAvailable,
    nextAvailableAt,
    cooldownHours: 4,
    estimatedReward: {
      coins: 50,
      xp: 25
    }
  };
}

async function getNonGamingOffers(user) {
  // Get available survey offers
  const surveyOffers = await getSurveyOffers(user);
  
  // Get other non-gaming offers
  const otherOffers = await getOtherOffers(user);
  
  return {
    surveys: surveyOffers,
    otherOffers: otherOffers,
    totalAvailable: surveyOffers.length + otherOffers.length
  };
}

async function getAIAssistantStatus(userId) {
  // Check if user has active AI chat sessions
  const activeChats = await AIChat.countDocuments({
    user: userId,
    status: 'active'
  });
  
  return {
    isAvailable: true,
    activeChats,
    canStartNewChat: true,
    features: [
      'Game tips and strategies',
      'Earning optimization',
      'Challenge guidance',
      'General support'
    ]
  };
}

async function searchGames(query, user, options) {
  const { category, page, limit } = options;
  const skip = (page - 1) * limit;
  
  // Search in user's games
  const userGames = user.games || [];
  const userGameIds = userGames.map(g => g.gameId);
  
  // Search logic (simplified - in real implementation, this would search a games database)
  const searchResults = userGames.filter(game => {
    const gameData = getGameData(game.gameId);
    return gameData.title.toLowerCase().includes(query.toLowerCase()) ||
           gameData.description.toLowerCase().includes(query.toLowerCase());
  });
  
  // Add suggestions
  const suggestions = generateSearchSuggestions(query, userGames);
  
  return {
    games: searchResults.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total: searchResults.length,
      pages: Math.ceil(searchResults.length / limit)
    },
    suggestions,
    total: searchResults.length
  };
}

async function generateAIResponse(message, user, gameId, context) {
  try {
    const systemPrompt = `You are a helpful gaming assistant for the Jackson Rewards App. 
    User profile: ${user.onboarding?.primaryGoal || 'earn'} goal, ${user.onboarding?.ageRange || '18-25'} age range.
    ${gameId ? `Current game context: ${gameId}` : ''}
    ${context ? `Context: ${context}` : ''}
    
    Provide helpful, encouraging advice about earning coins, completing challenges, and gaming strategies.`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 200,
      temperature: 0.7
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "I'm here to help! Ask me about earning coins, completing challenges, or gaming strategies.";
  }
}

async function updateSearchHistory(userId, query) {
  await User.findByIdAndUpdate(userId, {
    $push: { 'preferences.searchHistory': { query, timestamp: new Date() } },
    $set: { 'preferences.lastSearchQuery': query }
  });
}

async function checkBoosterRewardEligibility(userId) {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  
  const lastBooster = await BoosterReward.findOne({
    user: userId,
    claimedAt: { $gte: fourHoursAgo }
  }).sort({ claimedAt: -1 });
  
  if (lastBooster) {
    const nextAvailable = new Date(lastBooster.claimedAt.getTime() + 4 * 60 * 60 * 1000);
    return {
      eligible: false,
      reason: 'Booster reward is on cooldown',
      nextAvailableAt: nextAvailable
    };
  }
  
  return { eligible: true };
}

async function calculateBoosterReward(user, adDuration) {
  const baseReward = { coins: 50, xp: 25 };
  
  // Adjust based on ad duration
  const durationMultiplier = Math.min(adDuration / 30, 2); // Max 2x for 60+ second ads
  
  // Adjust based on VIP status
  const vipMultiplier = user.vip?.level === 'free' ? 1 : 1.5;
  
  return {
    coins: Math.round(baseReward.coins * durationMultiplier * vipMultiplier),
    xp: Math.round(baseReward.xp * durationMultiplier * vipMultiplier)
  };
}

function getGameData(gameId) {
  // In real implementation, this would fetch from a games database
  const gameDatabase = {
    'orbit-fall': {
      title: 'Orbit Fall',
      icon: '🌌',
      description: 'High-reward action game',
      category: 'Action',
      coinReward: 150,
      xpReward: 75,
      difficulty: 'Hard',
      timeRequired: '15 min',
      earningPotential: 150
    },
    'puzzle-master': {
      title: 'Puzzle Master',
      icon: '🧩',
      description: 'Perfect for beginners',
      category: 'Puzzle',
      coinReward: 50,
      xpReward: 25,
      difficulty: 'Easy',
      timeRequired: '5 min',
      earningPotential: 50
    }
  };
  
  return gameDatabase[gameId] || {
    title: 'Unknown Game',
    icon: '🎮',
    description: 'Game description not available',
    category: 'General',
    coinReward: 0,
    xpReward: 0,
    difficulty: 'Medium',
    timeRequired: '10 min',
    earningPotential: 0
  };
}

function getCurrentTier(xp) {
  if (xp >= 1000) return { id: 'gold', name: 'Gold', color: '#FFD700' };
  if (xp >= 500) return { id: 'silver', name: 'Silver', color: '#C0C0C0' };
  return { id: 'bronze', name: 'Bronze', color: '#CD7F32' };
}

function generateSearchSuggestions(query, userGames) {
  const suggestions = [];
  
  // Add game titles that match
  userGames.forEach(game => {
    const gameData = getGameData(game.gameId);
    if (gameData.title.toLowerCase().includes(query.toLowerCase())) {
      suggestions.push({
        type: 'game',
        title: gameData.title,
        gameId: game.gameId
      });
    }
  });
  
  // Add common search terms
  const commonTerms = ['action', 'puzzle', 'strategy', 'racing', 'new', 'popular'];
  commonTerms.forEach(term => {
    if (term.includes(query.toLowerCase())) {
      suggestions.push({
        type: 'category',
        title: `Games in ${term} category`,
        category: term
      });
    }
  });
  
  return suggestions.slice(0, 5);
}

function generateChatSuggestions(aiResponse, gameId) {
  const suggestions = [
    'How can I earn more coins?',
    'What are the best strategies?',
    'How do I complete challenges faster?'
  ];
  
  if (gameId) {
    suggestions.unshift(`Tips for ${getGameData(gameId).title}`);
  }
  
  return suggestions;
}

async function getGameContext(gameId) {
  const gameData = getGameData(gameId);
  return {
    gameId,
    title: gameData.title,
    category: gameData.category,
    difficulty: gameData.difficulty
  };
}

async function getSurveyOffers(user) {
  // This would integrate with existing survey system
  return [
    {
      id: 'survey-1',
      title: 'Consumer Survey',
      description: 'Share your opinions and earn coins',
      reward: { coins: 25, xp: 10 },
      estimatedTime: '5 min',
      provider: 'BitLabs'
    }
  ];
}

async function getOtherOffers(user) {
  return [
    {
      id: 'offer-1',
      title: 'Download App',
      description: 'Download and try new apps',
      reward: { coins: 100, xp: 50 },
      estimatedTime: '10 min',
      provider: 'Everflow'
    }
  ];
}

module.exports = router;


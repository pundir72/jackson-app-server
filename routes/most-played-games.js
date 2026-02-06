const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');

// Game configuration
const GAME_CONFIG = {
  categories: {
    highest_earning: { minCoins: 100, maxCoins: 500, difficulty: 'High' },
    medium_earning: { minCoins: 50, maxCoins: 150, difficulty: 'Medium' },
    low_earning: { minCoins: 10, maxCoins: 50, difficulty: 'Low' }
  },
  genres: ['Action', 'Puzzle', 'Strategy', 'Arcade', 'Racing', 'Sports'],
  timeRequired: ['5 min', '10 min', '15 min', '20 min', '30 min']
};

// Get most played games for carousel
router.get('/carousel', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('games preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's most played games based on completion count and recent activity
    const mostPlayedGames = await getMostPlayedGames(user);
    
    res.json({
      success: true,
      data: {
        games: mostPlayedGames,
        totalGames: mostPlayedGames.length,
        hasMore: mostPlayedGames.length >= 5
      }
    });
  } catch (error) {
    console.error('Error getting most played games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get most played games'
    });
  }
});

// Get extended game list with categories
router.get('/extended', protect, async (req, res) => {
  try {
    const { category, page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select('games preferences xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's XP tier for filtering
    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    
    // Get games by category
    const games = await getGamesByCategory(category, currentTier, user);
    
    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedGames = games.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        games: paginatedGames,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: games.length,
          pages: Math.ceil(games.length / limit)
        },
        category: category || 'all',
        userTier: currentTier.id
      }
    });
  } catch (error) {
    console.error('Error getting extended game list:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get extended game list'
    });
  }
});

// Get game details
router.get('/:gameId', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const user = await User.findById(req.user.userId).select('xp vip games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const game = await getGameDetails(gameId, user);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    res.json({
      success: true,
      data: game
    });
  } catch (error) {
    console.error('Error getting game details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game details'
    });
  }
});

// Track game play
router.post('/:gameId/play', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { duration, level } = req.body;
    const user = await User.findById(req.user.userId).select('games xp wallet');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update game play tracking
    const gameIndex = user.games.findIndex(g => g.gameId === gameId);
    const now = new Date();
    let isNewPlay = false;
    
    if (gameIndex >= 0) {
      // Check if this is a new play (lastPlayed is being updated)
      const previousLastPlayed = user.games[gameIndex].lastPlayed;
      // Update existing game
      user.games[gameIndex].lastPlayed = now;
      user.games[gameIndex].playCount = (user.games[gameIndex].playCount || 0) + 1;
      user.games[gameIndex].totalDuration = (user.games[gameIndex].totalDuration || 0) + (duration || 0);
      user.games[gameIndex].lastLevel = level || user.games[gameIndex].lastLevel;
      // Consider it a new play if lastPlayed changed significantly (more than 1 minute ago)
      isNewPlay = !previousLastPlayed || (now - new Date(previousLastPlayed)) > 60000;
    } else {
      // Add new game
      user.games.push({
        gameId,
        firstPlayed: now,
        lastPlayed: now,
        playCount: 1,
        totalDuration: duration || 0,
        lastLevel: level || 1,
        completed: false
      });
      isNewPlay = true; // First time playing this game
    }
    
    await user.save();

    // CRITICAL: Increment continuous games played counter (not daily-based)
    // Counter resets only after milestone completion
    if (isNewPlay) {
      const accountOverviewService = require('../utils/accountOverview');
      await accountOverviewService.incrementGamesPlayedCounter(user._id);
    }
    
    res.json({
      success: true,
      data: {
        gameId,
        playCount: user.games[gameIndex >= 0 ? gameIndex : user.games.length - 1].playCount,
        message: 'Game play tracked successfully'
      }
    });
  } catch (error) {
    console.error('Error tracking game play:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track game play'
    });
  }
});

// Helper functions
// CRITICAL FIX: Fetch from Game collection and exclude downloaded games
// Downloaded games should only appear in "My Games → Downloaded", not in global views
async function getMostPlayedGames(user) {
  try {
    // Get user's downloaded game IDs to exclude them
    const downloadedGameIds = new Set();
    if (Array.isArray(user.games) && user.games.length > 0) {
      user.games
        .filter((g) => {
          // A game is considered downloaded if it has installedAt or status is 'installed'
          return (
            g.installedAt ||
            g.status === 'installed' ||
            (g.date && !g.completed)
          );
        })
        .forEach((g) => {
          // Add both gameId (string) and _id (if it's an ObjectId) to the set
          if (g.gameId) {
            downloadedGameIds.add(String(g.gameId));
          }
          if (g._id) {
            downloadedGameIds.add(String(g._id));
          }
        });
    }

    // Fetch games from Game collection, excluding downloaded games
    // Sort by popularity metrics (viewCount, playCount, or createdAt as fallback)
    const query = { status: 'active' };
    
    // CRITICAL FIX: Exclude downloaded games
    // Build exclusion query - exclude games where gameId OR _id matches downloaded games
    if (downloadedGameIds.size > 0) {
      const downloadedIdsArray = Array.from(downloadedGameIds);
      // Exclude by gameId (string) and _id (ObjectId if applicable)
      query.$and = [
        { gameId: { $nin: downloadedIdsArray } }
      ];
      // Also exclude by _id if any downloaded game IDs are valid ObjectIds
      const objectIdPattern = /^[0-9a-fA-F]{24}$/;
      const objectIds = downloadedIdsArray.filter(id => objectIdPattern.test(id));
      if (objectIds.length > 0) {
        const mongoose = require('mongoose');
        query.$and.push({ _id: { $nin: objectIds.map(id => new mongoose.Types.ObjectId(id)) } });
      }
    }
    
    const mostPlayedGames = await Game.find(query)
    .select('gameId title description category uiSection metadata gameDetails rewards')
    .sort({ 
      // Sort by popularity - you can adjust this based on your metrics
      createdAt: -1 // Most recent first as fallback
    })
    .limit(5)
    .lean();

    // Format the response
    return mostPlayedGames.map(game => ({
      gameId: game.gameId,
      title: game.title,
      name: game.title, // For backward compatibility
      description: game.description,
      category: game.category,
      icon: game.metadata?.thumbnail?.url || 
            game.gameDetails?.square_image || 
            game.gameDetails?.image || 
            '🎮',
      rewards: game.rewards || { coins: 0, xp: 0 },
      isDownloaded: false, // These are not downloaded games
      isInstalled: false,
      playCount: 0, // Not from user's games, so no play count
      progress: 0
    }));
  } catch (error) {
    console.error('Error fetching most played games:', error);
    // Return empty array on error to prevent breaking the carousel
    return [];
  }
}

async function getGamesByCategory(category, userTier, user) {
  const allGames = getAllGames();
  
  let filteredGames = allGames;
  
  // Filter by category
  if (category && category !== 'all') {
    filteredGames = allGames.filter(game => game.category === category);
  }
  
  // Filter by user tier
  filteredGames = filteredGames.filter(game => {
    const tierRequired = getTierForGame(game.id);
    return isTierUnlocked(userTier.id, tierRequired);
  });
  
  // Sort by earning potential
  filteredGames.sort((a, b) => b.earningPotential - a.earningPotential);
  
  return filteredGames;
}

function getGameDetails(gameId, user) {
  const game = getAllGames().find(g => g.id === gameId);
  if (!game) return null;
  
  const userGame = user.games.find(g => g.gameId === gameId);
  const currentXP = user.xp.current || 0;
  const currentTier = getCurrentTier(currentXP);
  
  return {
    ...game,
    isInstalled: !!userGame,
    playCount: userGame?.playCount || 0,
    lastPlayed: userGame?.lastPlayed,
    progress: userGame?.completed ? 100 : Math.min((userGame?.lastLevel || 1) * 10, 100),
    userTier: currentTier.id,
    isUnlocked: isTierUnlocked(currentTier.id, getTierForGame(gameId)),
    levels: generateGameLevels(gameId, currentTier)
  };
}

function getAllGames() {
  return [
    {
      id: 'orbit-fall',
      name: 'Orbit Fall',
      icon: '🌌',
      genre: 'Action',
      category: 'highest_earning',
      earningPotential: 300,
      difficulty: 'High',
      timeRequired: '15 min',
      description: 'Navigate through space obstacles and collect cosmic rewards',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/orbit-fall.jpg',
      isNew: false,
      viewCount: 10400
    },
    {
      id: 'puzzle-master',
      name: 'Puzzle Master',
      icon: '🧩',
      genre: 'Puzzle',
      category: 'medium_earning',
      earningPotential: 150,
      difficulty: 'Medium',
      timeRequired: '10 min',
      description: 'Solve challenging puzzles to earn rewards',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/puzzle-master.jpg',
      isNew: false,
      viewCount: 8500
    },
    {
      id: 'word-challenge',
      name: 'Word Challenge',
      icon: '📝',
      genre: 'Strategy',
      category: 'medium_earning',
      earningPotential: 200,
      difficulty: 'Medium',
      timeRequired: '10 min',
      description: 'Test your vocabulary and earn coins',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/word-challenge.jpg',
      isNew: true,
      viewCount: 6200
    },
    {
      id: 'memory-game',
      name: 'Memory Game',
      icon: '🧠',
      genre: 'Arcade',
      category: 'low_earning',
      earningPotential: 100,
      difficulty: 'Low',
      timeRequired: '5 min',
      description: 'Train your memory and earn rewards',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/memory-game.jpg',
      isNew: false,
      viewCount: 12000
    },
    {
      id: 'speed-racer',
      name: 'Speed Racer',
      icon: '🏎️',
      genre: 'Racing',
      category: 'highest_earning',
      earningPotential: 400,
      difficulty: 'High',
      timeRequired: '20 min',
      description: 'Race against time and opponents',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/speed-racer.jpg',
      isNew: true,
      viewCount: 7800
    }
  ];
}

function getRecommendedGames(user, count) {
  const allGames = getAllGames();
  const userGames = user.games || [];
  const playedGameIds = userGames.map(g => g.gameId);
  
  // Filter out already played games
  const availableGames = allGames.filter(game => !playedGameIds.includes(game.id));
  
  // Sort by earning potential and return top games
  return availableGames
    .sort((a, b) => b.earningPotential - a.earningPotential)
    .slice(0, count)
    .map(game => ({
      ...game,
      playCount: 0,
      isInstalled: false,
      progress: 0
    }));
}

function getGameData(gameId) {
  return getAllGames().find(g => g.id === gameId) || {
    id: gameId,
    name: 'Unknown Game',
    icon: '🎮',
    genre: 'Unknown',
    category: 'low_earning',
    earningPotential: 50,
    difficulty: 'Low',
    timeRequired: '5 min',
    description: 'A fun game to play',
    imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/default.jpg',
    isNew: false,
    viewCount: 0
  };
}

function getCurrentTier(xp) {
  if (xp >= 10000) return { id: 'expert', name: 'Expert' };
  if (xp >= 5000) return { id: 'senior', name: 'Senior' };
  if (xp >= 1000) return { id: 'mid', name: 'Mid-Level' };
  return { id: 'junior', name: 'Junior' };
}

function getTierForGame(gameId) {
  const tierMap = {
    'orbit-fall': 'senior',
    'speed-racer': 'expert',
    'puzzle-master': 'junior',
    'word-challenge': 'mid',
    'memory-game': 'junior'
  };
  return tierMap[gameId] || 'junior';
}

function isTierUnlocked(userTier, requiredTier) {
  const tierOrder = ['junior', 'mid', 'senior', 'expert'];
  const userIndex = tierOrder.indexOf(userTier);
  const requiredIndex = tierOrder.indexOf(requiredTier);
  return userIndex >= requiredIndex;
}

function generateGameLevels(gameId, userTier) {
  const baseLevels = 10;
  const levels = [];
  
  for (let i = 1; i <= baseLevels; i++) {
    const baseReward = 10 + (i * 5);
    const tierMultiplier = getTierMultiplier(userTier.id);
    const finalReward = Math.round(baseReward * tierMultiplier);
    
    levels.push({
      level: i,
      coins: finalReward,
      xp: Math.round(finalReward * 0.5),
      timeLimit: `${5 + (i * 2)} min`,
      description: `Complete level ${i} to earn ${finalReward} coins`,
      isLocked: i > 1,
      isCompleted: false
    });
  }
  
  return levels;
}

function getTierMultiplier(tierId) {
  const multipliers = {
    'junior': 1.0,
    'mid': 1.2,
    'senior': 1.5,
    'expert': 2.0
  };
  return multipliers[tierId] || 1.0;
}

module.exports = router;

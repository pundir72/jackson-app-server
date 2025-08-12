const Game = require('../models/Game');
const GameProgress = require('../models/GameProgress');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { sendNotification } = require('../services/notificationService');

// Get all games
const getGames = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      difficulty, 
      gameType, 
      featured, 
      new: isNew, 
      vipOnly 
    } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    const query = { isActive: true };
    
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (gameType) query.gameType = gameType;
    if (featured !== undefined) query.isFeatured = featured === 'true';
    if (isNew !== undefined) query.isNew = isNew === 'true';
    if (vipOnly !== undefined) query.isVipOnly = vipOnly === 'true';

    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Game.countDocuments(query);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Games retrieved successfully',
      data: {
        games,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve games',
      statusCode: 500,
    });
  }
};

// Get featured games
const getFeaturedGames = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    const games = await Game.findFeatured();

    res.status(200).json({
      success: true,
      message: 'Featured games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting featured games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve featured games',
      statusCode: 500,
    });
  }
};

// Get new games
const getNewGames = async (req, res) => {
  try {
    const games = await Game.findNew();

    res.status(200).json({
      success: true,
      message: 'New games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting new games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve new games',
      statusCode: 500,
    });
  }
};

// Get popular games
const getPopularGames = async (req, res) => {
  try {
    const games = await Game.findPopular();

    res.status(200).json({
      success: true,
      message: 'Popular games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting popular games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve popular games',
      statusCode: 500,
    });
  }
};

// Get top rated games
const getTopRatedGames = async (req, res) => {
  try {
    const games = await Game.findTopRated();

    res.status(200).json({
      success: true,
      message: 'Top rated games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting top rated games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve top rated games',
      statusCode: 500,
    });
  }
};

// Get game categories
const getGameCategories = async (req, res) => {
  try {
    const categories = [
      { id: 'puzzle', name: 'Puzzle', icon: '🧩' },
      { id: 'strategy', name: 'Strategy', icon: '🎯' },
      { id: 'action', name: 'Action', icon: '⚡' },
      { id: 'arcade', name: 'Arcade', icon: '🎮' },
      { id: 'educational', name: 'Educational', icon: '📚' },
      { id: 'casino', name: 'Casino', icon: '🎰' },
      { id: 'trivia', name: 'Trivia', icon: '❓' },
      { id: 'simulation', name: 'Simulation', icon: '🏗️' },
    ];

    res.status(200).json({
      success: true,
      message: 'Game categories retrieved successfully',
      data: { categories },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game categories',
      statusCode: 500,
    });
  }
};

// Get game by ID
const getGameById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Check if user can play this game
    if (!game.isAvailableForUser(user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not eligible to play this game',
        statusCode: 403,
      });
    }

    // Get user's progress for this game
    let progress = await GameProgress.findByUserAndGame(userId, id);
    if (!progress) {
      progress = await GameProgress.create({
        userId,
        gameId: id,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Game retrieved successfully',
      data: {
        game,
        progress,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game',
      statusCode: 500,
    });
  }
};

// Start playing a game
const playGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { gameData } = req.body;
    const userId = req.user.id;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Check if user can play this game
    if (!game.isAvailableForUser(user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not eligible to play this game',
        statusCode: 403,
      });
    }

    // Get or create progress
    let progress = await GameProgress.findByUserAndGame(userId, id);
    if (!progress) {
      progress = new GameProgress({
        userId,
        gameId: id,
        gameData,
      });
    }

    // Update game data
    if (gameData) {
      progress.gameData = { ...progress.gameData, ...gameData };
    }

    await progress.save();

    res.status(200).json({
      success: true,
      message: 'Game started successfully',
      data: {
        gameId: game._id,
        gameTitle: game.title,
        progress,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error starting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start game',
      statusCode: 500,
    });
  }
};

// Complete a game
const completeGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { score, gameData } = req.body;
    const userId = req.user.id;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Get progress
    let progress = await GameProgress.findByUserAndGame(userId, id);
    if (!progress) {
      return res.status(400).json({
        success: false,
        message: 'No active game session found',
        statusCode: 400,
      });
    }

    // Check if user can earn rewards
    if (!progress.canEarnRewards(game)) {
      return res.status(400).json({
        success: false,
        message: 'Daily reward limit reached for this game',
        statusCode: 400,
      });
    }

    // Calculate rewards
    const rewards = game.getRewardForUser(user);
    
    // Update progress
    await progress.updateScore(score, gameData?.timeSpent || 0);
    await progress.addReward(rewards.points, rewards.cashback);

    // Update user
    await user.addPoints(rewards.points);
    await user.addCashback(rewards.cashback);

    // Update wallet
    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }
    await wallet.addFunds(rewards.cashback, 'game');

    // Update game stats
    await game.updateStats(rewards.points, rewards.cashback);

    // Send notification
    await sendNotification(userId, {
      type: 'game_completed',
      title: 'Game Completed!',
      message: `You earned ${rewards.points} points and $${rewards.cashback} cashback!`,
      data: {
        gameId: game._id,
        gameTitle: game.title,
        score,
        rewards,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Game completed successfully',
      data: {
        game: {
          id: game._id,
          title: game.title,
        },
        score,
        rewards,
        progress,
        userStats: {
          totalPoints: user.totalPoints,
          totalCashback: user.totalCashback,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error completing game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete game',
      statusCode: 500,
    });
  }
};

// Rate a game
const rateGame = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, review } = req.body;
    const userId = req.user.id;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    // Update game rating
    await game.updateRating(rating);

    res.status(200).json({
      success: true,
      message: 'Game rated successfully',
      data: {
        gameId: game._id,
        newRating: game.averageRating,
        totalRatings: game.totalRatings,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error rating game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate game',
      statusCode: 500,
    });
  }
};

// Get game progress
const getGameProgress = async (req, res) => {
  try {
    const { gameId, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const skip = (page - 1) * limit;

    const query = { userId, isActive: true };
    if (gameId) query.gameId = gameId;

    const progress = await GameProgress.find(query)
      .populate('gameId', 'title category imageUrl')
      .sort({ lastPlayedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await GameProgress.countDocuments(query);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Game progress retrieved successfully',
      data: {
        progress,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game progress',
      statusCode: 500,
    });
  }
};

// Get game progress by ID
const getGameProgressById = async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.id;

    const progress = await GameProgress.findByUserAndGame(userId, gameId);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: 'Game progress not found',
        statusCode: 404,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Game progress retrieved successfully',
      data: { progress },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game progress by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game progress',
      statusCode: 500,
    });
  }
};

// Get game achievements
const getGameAchievements = async (req, res) => {
  try {
    const userId = req.user.id;

    const progress = await GameProgress.findByUserId(userId);
    const achievements = progress.reduce((acc, prog) => {
      acc.push(...prog.achievements);
      return acc;
    }, []);

    res.status(200).json({
      success: true,
      message: 'Game achievements retrieved successfully',
      data: { achievements },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game achievements',
      statusCode: 500,
    });
  }
};

// Get game leaderboard
const getGameLeaderboard = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { limit = 10 } = req.query;

    const leaderboard = await GameProgress.getLeaderboard(gameId, parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Game leaderboard retrieved successfully',
      data: { leaderboard },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game leaderboard',
      statusCode: 500,
    });
  }
};

// Get games by tags
const getGamesByTags = async (req, res) => {
  try {
    const { tags } = req.query;
    const { limit = 20 } = req.query;

    if (!tags) {
      return res.status(400).json({
        success: false,
        message: 'Tags parameter is required',
        statusCode: 400,
      });
    }

    const tagArray = tags.split(',').map(tag => tag.trim());
    const games = await Game.findByTags(tagArray, parseInt(limit));

    res.status(200).json({
      success: true,
      message: 'Games by tags retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting games by tags:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve games by tags',
      statusCode: 500,
    });
  }
};

// Get location-based games
const getLocationBasedGames = async (req, res) => {
  try {
    const games = await Game.findLocationBased();

    res.status(200).json({
      success: true,
      message: 'Location-based games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting location-based games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve location-based games',
      statusCode: 500,
    });
  }
};

// Get VIP games
const getVipGames = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.isVip) {
      return res.status(403).json({
        success: false,
        message: 'VIP membership required to access VIP games',
        statusCode: 403,
      });
    }

    const games = await Game.findVipGames();

    res.status(200).json({
      success: true,
      message: 'VIP games retrieved successfully',
      data: { games },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting VIP games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VIP games',
      statusCode: 500,
    });
  }
};

// Get game statistics
const getGameStats = async (req, res) => {
  try {
    const stats = await Game.getGameStats();
    const categoryStats = await Game.getCategoryStats();

    res.status(200).json({
      success: true,
      message: 'Game statistics retrieved successfully',
      data: { 
        stats,
        categoryStats 
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting game statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve game statistics',
      statusCode: 500,
    });
  }
};

// Toggle game featured status (Admin only)
const toggleGameFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.findById(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    await game.toggleFeatured();

    res.status(200).json({
      success: true,
      message: `Game ${game.isFeatured ? 'featured' : 'unfeatured'} successfully`,
      data: { game },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error toggling game featured status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle game featured status',
      statusCode: 500,
    });
  }
};

// Toggle game active status (Admin only)
const toggleGameActive = async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.findById(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    await game.toggleActive();

    res.status(200).json({
      success: true,
      message: `Game ${game.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { game },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error toggling game active status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle game active status',
      statusCode: 500,
    });
  }
};

// Add tag to game (Admin only)
const addGameTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({
        success: false,
        message: 'Tag is required',
        statusCode: 400,
      });
    }

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    await game.addTag(tag);

    res.status(200).json({
      success: true,
      message: 'Tag added to game successfully',
      data: { game },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error adding tag to game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add tag to game',
      statusCode: 500,
    });
  }
};

// Remove tag from game (Admin only)
const removeGameTag = async (req, res) => {
  try {
    const { id, tag } = req.params;

    const game = await Game.findById(id);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
        statusCode: 404,
      });
    }

    await game.removeTag(tag);

    res.status(200).json({
      success: true,
      message: 'Tag removed from game successfully',
      data: { game },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error removing tag from game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove tag from game',
      statusCode: 500,
    });
  }
};

module.exports = {
  getGames,
  getFeaturedGames,
  getNewGames,
  getPopularGames,
  getTopRatedGames,
  getGameCategories,
  getGameById,
  playGame,
  completeGame,
  rateGame,
  getGameProgress,
  getGameProgressById,
  getGameAchievements,
  getGameLeaderboard,
  getGamesByTags,
  getLocationBasedGames,
  getVipGames,
  getGameStats,
  toggleGameFeatured,
  toggleGameActive,
  addGameTag,
  removeGameTag,
}; 
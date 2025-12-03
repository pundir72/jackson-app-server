const express = require('express');
const router = express.Router();
const { query, body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Game = require('../models/Game');
const GameTip = require('../models/GameTip');

// ==================== GAME TIPS & TRICKS SCREEN ====================

/**
 * @route   GET /api/game-tips/:gameId
 * @desc    Get game tips and tricks for a specific game
 * @access  Private
 */
router.get('/:gameId', auth, [
  query('category').optional().isString().withMessage('Category must be a string'),
  query('difficulty').optional().isString().withMessage('Difficulty must be a string'),
  query('featured').optional().isBoolean(),
  query('search').optional().isString().trim()
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

    const { gameId } = req.params;
    const { category, difficulty, featured, search } = req.query;

    // Check if game exists and has tips enabled
    const game = await Game.findOne({ gameId, isActive: true });
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (!game.tipsEnabled) {
      return res.status(404).json({
        success: false,
        error: 'Game tips are not available for this game'
      });
    }

    let tips;
    
    // Search tips if search term provided
    if (search) {
      tips = await GameTip.searchTips(gameId, search);
    } else {
      // Get tips with filters
      const options = {};
      if (category) options.category = category;
      if (difficulty) options.difficulty = difficulty;
      if (featured === 'true') options.featured = true;
      
      tips = await GameTip.findByGame(gameId, options);
    }

    // Group tips by category
    const tipsByCategory = tips.reduce((acc, tip) => {
      const category = tip.category;
      if (!acc[category]) {
        acc[category] = {
          category,
          categoryDisplayName: tip.categoryDisplayName,
          tips: []
        };
      }
      acc[category].tips.push(tip.getSummary());
      return acc;
    }, {});

    // Get category display names
    const categoryDisplayNames = {
      getting_started: 'Getting Started',
      pro_strategies: 'Pro Strategies',
      leveling_tips: 'Leveling Tips',
      advanced_tactics: 'Advanced Tactics',
      general_tips: 'General Tips'
    };

    // Ensure all categories have display names
    Object.keys(tipsByCategory).forEach(category => {
      if (!tipsByCategory[category].categoryDisplayName) {
        tipsByCategory[category].categoryDisplayName = categoryDisplayNames[category] || category;
      }
    });

    res.json({
      success: true,
      data: {
        game: {
          gameId: game.gameId,
          title: game.title,
          description: game.description,
          bannerImage: game.bannerImage,
          tipsEnabled: game.tipsEnabled
        },
        tips: Object.values(tipsByCategory),
        totalTips: tips.length,
        categories: Object.keys(tipsByCategory).map(cat => ({
          category: cat,
          displayName: categoryDisplayNames[cat] || cat,
          count: tipsByCategory[cat].tips.length
        }))
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
 * @route   GET /api/game-tips/:gameId/featured
 * @desc    Get featured tips for a specific game
 * @access  Private
 */
router.get('/:gameId/featured', auth, async (req, res) => {
  try {
    const { gameId } = req.params;

    // Check if game exists and has tips enabled
    const game = await Game.findOne({ gameId, isActive: true });
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (!game.tipsEnabled) {
      return res.status(404).json({
        success: false,
        error: 'Game tips are not available for this game'
      });
    }

    const featuredTips = await GameTip.findFeatured(gameId);

    res.json({
      success: true,
      data: {
        game: {
          gameId: game.gameId,
          title: game.title,
          bannerImage: game.bannerImage
        },
        tips: featuredTips.map(tip => tip.getSummary()),
        totalFeatured: featuredTips.length
      }
    });
  } catch (error) {
    console.error('Error fetching featured tips:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch featured tips'
    });
  }
});

/**
 * @route   GET /api/game-tips/:gameId/categories
 * @desc    Get available tip categories for a game
 * @access  Private
 */
router.get('/:gameId/categories', auth, async (req, res) => {
  try {
    const { gameId } = req.params;

    // Check if game exists and has tips enabled
    const game = await Game.findOne({ gameId, isActive: true });
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (!game.tipsEnabled) {
      return res.status(404).json({
        success: false,
        error: 'Game tips are not available for this game'
      });
    }

    // Get distinct categories for this game
    const categories = await GameTip.distinct('category', { gameId, isActive: true });
    
    const categoryDisplayNames = {
      getting_started: 'Getting Started',
      pro_strategies: 'Pro Strategies',
      leveling_tips: 'Leveling Tips',
      advanced_tactics: 'Advanced Tactics',
      general_tips: 'General Tips'
    };

    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const count = await GameTip.countDocuments({ gameId, category, isActive: true });
        return {
          category,
          displayName: categoryDisplayNames[category] || category,
          count
        };
      })
    );

    res.json({
      success: true,
      data: {
        game: {
          gameId: game.gameId,
          title: game.title
        },
        categories: categoriesWithCounts,
        totalCategories: categories.length
      }
    });
  } catch (error) {
    console.error('Error fetching tip categories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tip categories'
    });
  }
});

/**
 * @route   GET /api/game-tips/:gameId/tip/:tipId
 * @desc    Get a specific tip and increment view count
 * @access  Private
 */
router.get('/:gameId/tip/:tipId', auth, async (req, res) => {
  try {
    const { gameId, tipId } = req.params;

    // Check if game exists and has tips enabled
    const game = await Game.findOne({ gameId, isActive: true });
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    if (!game.tipsEnabled) {
      return res.status(404).json({
        success: false,
        error: 'Game tips are not available for this game'
      });
    }

    const tip = await GameTip.findOne({ _id: tipId, gameId, isActive: true });
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Tip not found'
      });
    }

    // Increment view count
    await tip.incrementViews();

    res.json({
      success: true,
      data: {
        game: {
          gameId: game.gameId,
          title: game.title,
          bannerImage: game.bannerImage
        },
        tip: tip.getSummary()
      }
    });
  } catch (error) {
    console.error('Error fetching tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch tip'
    });
  }
});

/**
 * @route   POST /api/game-tips/:gameId/tip/:tipId/bookmark
 * @desc    Bookmark a tip (increment bookmark count)
 * @access  Private
 */
router.post('/:gameId/tip/:tipId/bookmark', auth, async (req, res) => {
  try {
    const { gameId, tipId } = req.params;

    const tip = await GameTip.findOne({ _id: tipId, gameId, isActive: true });
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Tip not found'
      });
    }

    // Increment bookmark count
    await tip.incrementBookmarks();

    res.json({
      success: true,
      data: {
        message: 'Tip bookmarked successfully',
        bookmarks: tip.analytics.bookmarks
      }
    });
  } catch (error) {
    console.error('Error bookmarking tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to bookmark tip'
    });
  }
});

/**
 * @route   POST /api/game-tips/:gameId/tip/:tipId/share
 * @desc    Share a tip (increment share count)
 * @access  Private
 */
router.post('/:gameId/tip/:tipId/share', auth, async (req, res) => {
  try {
    const { gameId, tipId } = req.params;

    const tip = await GameTip.findOne({ _id: tipId, gameId, isActive: true });
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Tip not found'
      });
    }

    // Increment share count
    await tip.incrementShares();

    res.json({
      success: true,
      data: {
        message: 'Tip shared successfully',
        shares: tip.analytics.shares
      }
    });
  } catch (error) {
    console.error('Error sharing tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to share tip'
    });
  }
});

/**
 * @route   POST /api/game-tips/:gameId/tip/:tipId/vote
 * @desc    Vote on tip helpfulness
 * @access  Private
 */
router.post('/:gameId/tip/:tipId/vote', auth, [
  body('helpful').isBoolean().withMessage('Helpful must be a boolean')
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

    const { gameId, tipId } = req.params;
    const { helpful } = req.body;

    const tip = await GameTip.findOne({ _id: tipId, gameId, isActive: true });
    if (!tip) {
      return res.status(404).json({
        success: false,
        error: 'Tip not found'
      });
    }

    // Vote on helpfulness
    if (helpful) {
      await tip.voteHelpful();
    } else {
      await tip.voteNotHelpful();
    }

    res.json({
      success: true,
      data: {
        message: `Tip marked as ${helpful ? 'helpful' : 'not helpful'}`,
        helpfulVotes: tip.analytics.helpfulVotes,
        notHelpfulVotes: tip.analytics.notHelpfulVotes,
        helpfulnessRatio: tip.helpfulnessRatio
      }
    });
  } catch (error) {
    console.error('Error voting on tip:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to vote on tip'
    });
  }
});

/**
 * @route   GET /api/game-tips/search
 * @desc    Search tips across all games
 * @access  Private
 */
router.get('/search', auth, [
  query('q').notEmpty().withMessage('Search query is required'),
  query('gameId').optional().isString(),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('difficulty').optional().isString().withMessage('Difficulty must be a string')
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

    const { q: searchTerm, gameId, category, difficulty } = req.query;

    let query = { isActive: true };
    
    if (gameId) {
      query.gameId = gameId;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Search in title, content, and tags
    const regex = new RegExp(searchTerm, 'i');
    query.$or = [
      { title: regex },
      { content: regex },
      { tags: { $in: [regex] } }
    ];

    const tips = await GameTip.find(query)
      .sort({ isFeatured: -1, order: 1, publishedAt: -1 })
      .limit(50);

    // Group by game
    const tipsByGame = tips.reduce((acc, tip) => {
      if (!acc[tip.gameId]) {
        acc[tip.gameId] = {
          gameId: tip.gameId,
          tips: []
        };
      }
      acc[tip.gameId].tips.push(tip.getSummary());
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        searchTerm,
        results: Object.values(tipsByGame),
        totalResults: tips.length,
        filters: {
          gameId: gameId || null,
          category: category || null,
          difficulty: difficulty || null
        }
      }
    });
  } catch (error) {
    console.error('Error searching tips:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search tips'
    });
  }
});

module.exports = router;

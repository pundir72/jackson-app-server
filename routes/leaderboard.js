const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const {
  getLeaderboard,
  getUserRank,
  getUserRanks,
  getLeaderboardSummary,
  getLeaderboardComparison,
  updateLeaderboard,
  updateAllLeaderboards,
  LEADERBOARD_CONFIG
} = require('../utils/leaderboard');

// Get leaderboard
router.get('/:category', protect, async (req, res) => {
  try {
    const { category } = req.params;
    const { timeframe = 'all_time', limit = 50 } = req.query;
    
    if (!LEADERBOARD_CONFIG.categories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    if (!LEADERBOARD_CONFIG.timeframes.includes(timeframe)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid timeframe'
      });
    }
    
    const leaderboard = await getLeaderboard(category, timeframe, parseInt(limit));
    
    res.json({
      success: true,
      data: {
        category,
        timeframe,
        leaderboard: leaderboard.entries,
        totalUsers: leaderboard.totalUsers,
        lastUpdated: leaderboard.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard'
    });
  }
});

// Get user's rank in leaderboard
router.get('/:category/rank', protect, async (req, res) => {
  try {
    const { category } = req.params;
    const { timeframe = 'all_time' } = req.query;
    
    if (!LEADERBOARD_CONFIG.categories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    const rankData = await getUserRank(req.user.userId, category, timeframe);
    
    if (!rankData) {
      return res.status(404).json({
        success: false,
        error: 'User not found in leaderboard'
      });
    }
    
    res.json({
      success: true,
      data: {
        category,
        timeframe,
        rank: rankData.rank,
        score: rankData.score,
        totalUsers: rankData.totalUsers,
        percentile: rankData.percentile
      }
    });
  } catch (error) {
    console.error('Error getting user rank:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user rank'
    });
  }
});

// Get user's ranks in all leaderboards
router.get('/user/ranks', protect, async (req, res) => {
  try {
    const ranks = await getUserRanks(req.user.userId);
    
    res.json({
      success: true,
      data: ranks
    });
  } catch (error) {
    console.error('Error getting user ranks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user ranks'
    });
  }
});

// Get leaderboard summary for user
router.get('/user/summary', protect, async (req, res) => {
  try {
    const summary = await getLeaderboardSummary(req.user.userId);
    
    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error getting leaderboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard summary'
    });
  }
});

// Get leaderboard comparison (users around current user)
router.get('/:category/compare', protect, async (req, res) => {
  try {
    const { category } = req.params;
    const { timeframe = 'all_time' } = req.query;
    
    if (!LEADERBOARD_CONFIG.categories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    const comparison = await getLeaderboardComparison(req.user.userId, category, timeframe);
    
    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: 'Comparison data not available'
      });
    }
    
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error getting leaderboard comparison:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard comparison'
    });
  }
});

// Get available categories and timeframes
router.get('/config/info', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        categories: LEADERBOARD_CONFIG.categories.map(category => ({
          id: category,
          name: getCategoryName(category),
          description: getCategoryDescription(category)
        })),
        timeframes: LEADERBOARD_CONFIG.timeframes.map(timeframe => ({
          id: timeframe,
          name: getTimeframeName(timeframe),
          description: getTimeframeDescription(timeframe)
        }))
      }
    });
  } catch (error) {
    console.error('Error getting leaderboard config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard config'
    });
  }
});

// Update specific leaderboard (admin only)
router.post('/:category/update', protect, async (req, res) => {
  try {
    const { category } = req.params;
    const { timeframe = 'all_time' } = req.body;
    
    // Check if user is admin (you might want to add proper admin middleware)
    // For now, allowing all authenticated users
    
    if (!LEADERBOARD_CONFIG.categories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    const leaderboard = await updateLeaderboard(category, timeframe);
    
    res.json({
      success: true,
      data: {
        message: 'Leaderboard updated successfully',
        category,
        timeframe,
        totalUsers: leaderboard.totalUsers,
        lastUpdated: leaderboard.lastUpdated
      }
    });
  } catch (error) {
    console.error('Error updating leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update leaderboard'
    });
  }
});

// Update all leaderboards (admin only)
router.post('/update-all', protect, async (req, res) => {
  try {
    // Check if user is admin (you might want to add proper admin middleware)
    // For now, allowing all authenticated users
    
    await updateAllLeaderboards();
    
    res.json({
      success: true,
      data: {
        message: 'All leaderboards updated successfully'
      }
    });
  } catch (error) {
    console.error('Error updating all leaderboards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update all leaderboards'
    });
  }
});

// Helper functions for display names
function getCategoryName(category) {
  const names = {
    xp: 'Experience Points',
    coins: 'Coins Earned',
    streak: 'Daily Streak',
    games: 'Games Played',
    surveys: 'Surveys Completed',
    races: 'Races Completed',
    overall: 'Overall Performance'
  };
  return names[category] || category;
}

function getCategoryDescription(category) {
  const descriptions = {
    xp: 'Ranked by total experience points earned',
    coins: 'Ranked by total coins earned',
    streak: 'Ranked by current daily streak',
    games: 'Ranked by total games played',
    surveys: 'Ranked by surveys completed',
    races: 'Ranked by races completed',
    overall: 'Ranked by weighted overall performance score'
  };
  return descriptions[category] || '';
}

function getTimeframeName(timeframe) {
  const names = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    all_time: 'All Time'
  };
  return names[timeframe] || timeframe;
}

function getTimeframeDescription(timeframe) {
  const descriptions = {
    daily: 'Updated every 24 hours',
    weekly: 'Updated every 7 days',
    monthly: 'Updated every 30 days',
    all_time: 'Cumulative since account creation'
  };
  return descriptions[timeframe] || '';
}

module.exports = router;

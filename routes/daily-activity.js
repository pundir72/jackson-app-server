/**
 * Daily Activity Routes
 * API endpoints for daily activity tracking and statistics
 * @module routes/daily-activity
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { 
  trackUserActivity, 
  getUserActivityStats, 
  getActivityLeaderboard,
  resetUserStreak,
  wasUserActiveOnDate
} = require('../utils/dailyActivityTracker');

/**
 * GET /api/daily-activity/stats
 * Get current user's activity statistics
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await getUserActivityStats(req.user.userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting activity stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity statistics'
    });
  }
});

/**
 * POST /api/daily-activity/track
 * Manually track user activity (usually handled by middleware)
 */
router.post('/track', protect, async (req, res) => {
  try {
    const result = await trackUserActivity(req.user.userId, {
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      forceTrack: true, // Force track even if already active today
      ...req.body
    });
    
    res.json(result);
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track activity'
    });
  }
});

/**
 * GET /api/daily-activity/leaderboard
 * Get activity leaderboard
 */
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const leaderboard = await getActivityLeaderboard(parseInt(limit));
    
    res.json({
      success: true,
      data: {
        leaderboard,
        userRank: await getUserRank(req.user.userId)
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

/**
 * GET /api/daily-activity/check/:date
 * Check if user was active on a specific date
 */
router.get('/check/:date', protect, async (req, res) => {
  try {
    const { date } = req.params;
    
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const wasActive = await wasUserActiveOnDate(req.user.userId, date);
    
    res.json({
      success: true,
      data: {
        date,
        wasActive
      }
    });
  } catch (error) {
    console.error('Error checking activity on date:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check activity on date'
    });
  }
});

/**
 * GET /api/daily-activity/history
 * Get user's activity history
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const stats = await getUserActivityStats(req.user.userId);
    
    // Generate activity history for the last N days
    const history = [];
    const today = new Date();
    
    for (let i = parseInt(days) - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const wasActive = stats.activeDates ? stats.activeDates.includes(dateStr) : false;
      
      history.push({
        date: dateStr,
        wasActive,
        isToday: i === 0,
        dayOfWeek: date.getDay() // 0 = Sunday, 1 = Monday, etc.
      });
    }
    
    res.json({
      success: true,
      data: {
        history,
        currentStreak: stats.currentStreak,
        totalActiveDays: stats.totalActiveDays,
        longestStreak: stats.longestStreak
      }
    });
  } catch (error) {
    console.error('Error getting activity history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity history'
    });
  }
});

/**
 * POST /api/daily-activity/reset-streak
 * Reset user's current streak (admin function)
 */
router.post('/reset-streak', protect, async (req, res) => {
  try {
    const { reason = 'user_request' } = req.body;
    
    const result = await resetUserStreak(req.user.userId, reason);
    
    res.json(result);
  } catch (error) {
    console.error('Error resetting streak:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset streak'
    });
  }
});

/**
 * POST /api/daily-activity/cleanup-history
 * Clean up invalid streak history entries
 */
router.post('/cleanup-history', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.userId);
    
    if (!user || !user.dailyActivity) {
      return res.json({
        success: true,
        message: 'No activity data to clean up',
        cleanedEntries: 0
      });
    }

    const originalLength = user.dailyActivity.streakHistory ? user.dailyActivity.streakHistory.length : 0;
    
    // Clean up invalid entries
    if (user.dailyActivity.streakHistory) {
      user.dailyActivity.streakHistory = user.dailyActivity.streakHistory.filter(entry => {
        const startTime = new Date(entry.startDate).getTime();
        const endTime = new Date(entry.endDate).getTime();
        return startTime !== endTime || entry.days > 1;
      });
    }
    
    const cleanedLength = user.dailyActivity.streakHistory ? user.dailyActivity.streakHistory.length : 0;
    const cleanedEntries = originalLength - cleanedLength;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Streak history cleaned up successfully',
      cleanedEntries: cleanedEntries,
      remainingEntries: cleanedLength
    });
  } catch (error) {
    console.error('Error cleaning up streak history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean up streak history'
    });
  }
});

/**
 * Helper function to get user's rank in leaderboard
 */
async function getUserRank(userId) {
  try {
    const User = require('../models/User');
    const user = await User.findById(userId).select('dailyActivity');
    if (!user || !user.dailyActivity) {
      return null;
    }

    const currentStreak = user.dailyActivity.currentStreak;
    const totalActiveDays = user.dailyActivity.totalActiveDays;
    
    // Count users with better streaks
    const betterStreakCount = await User.countDocuments({
      'dailyActivity.currentStreak': { $gt: currentStreak }
    });
    
    // Count users with same streak but more total days
    const sameStreakBetterTotal = await User.countDocuments({
      'dailyActivity.currentStreak': currentStreak,
      'dailyActivity.totalActiveDays': { $gt: totalActiveDays }
    });
    
    return betterStreakCount + sameStreakBetterTotal + 1;
  } catch (error) {
    console.error('Error calculating user rank:', error);
    return null;
  }
}

module.exports = router;

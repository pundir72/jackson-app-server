const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { 
  trackUserActivity, 
  getUserActivityStats, 
  resetUserStreak,
  cleanupStreakHistory 
} = require('../utils/dailyActivityTracker');

// GET /api/daily-activity/stats
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
      error: 'Failed to get activity stats' 
    });
  }
});

// POST /api/daily-activity/track
router.post('/track', protect, async (req, res) => {
  try {
    const { forceTrack = false } = req.body;
    const result = await trackUserActivity(req.user.userId, { forceTrack });
    res.json(result);
  } catch (error) {
    console.error('Error tracking activity:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to track activity' 
    });
  }
});

// POST /api/daily-activity/reset-streak
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

// POST /api/daily-activity/cleanup-history
router.post('/cleanup-history', protect, async (req, res) => {
  try {
    const result = await cleanupStreakHistory(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Error cleaning up streak history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup streak history' 
    });
  }
});

module.exports = router;

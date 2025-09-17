const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const cache = require('../utils/cache');

// Get cache performance stats
router.get('/cache-stats', protect, async (req, res) => {
  try {
    const stats = cache.getStats();
    
    res.json({
      success: true,
      data: {
        cache: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats'
    });
  }
});

// Clear all caches (admin only)
router.post('/clear-cache', protect, async (req, res) => {
  try {
    cache.clearAll();
    
    res.json({
      success: true,
      data: {
        message: 'All caches cleared successfully',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error clearing caches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear caches'
    });
  }
});

// Clear user-specific caches
router.post('/clear-user-cache/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { invalidateUserCaches } = require('../utils/optimizedProfile');
    
    invalidateUserCaches(userId);
    
    res.json({
      success: true,
      data: {
        message: `User caches cleared for user ${userId}`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error clearing user caches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear user caches'
    });
  }
});

module.exports = router;

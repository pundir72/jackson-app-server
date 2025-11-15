const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { getAllSDKStatus } = require('../utils/sdkStatus');

/**
 * GET /api/sdk/status
 * Get SDK initialization status (AC1)
 * Frontend uses this to conditionally show Non-Gaming Offers section
 */
router.get('/status', protect, async (req, res) => {
  try {
    const status = await getAllSDKStatus();

    res.json({
      success: true,
      data: {
        initialized: status.initialized,
        activeSDKs: status.activeSDKs,
        totalOffersAvailable: status.totalOffersAvailable,
        sdkStatus: status.sdkStatus,
        timestamp: status.timestamp,
        // Frontend can use this to show/hide section
        shouldShowSection: status.initialized && status.totalOffersAvailable > 0
      }
    });
  } catch (error) {
    console.error('Error getting SDK status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get SDK status',
      message: error.message
    });
  }
});

/**
 * GET /api/sdk/status/public
 * Public endpoint (no auth) for quick SDK health check
 * Used by frontend to check if SDKs are available before showing section
 */
router.get('/status/public', async (req, res) => {
  try {
    const status = await getAllSDKStatus();

    // Return minimal info for public endpoint
    res.json({
      success: true,
      initialized: status.initialized,
      activeSDKs: status.activeSDKs,
      totalOffersAvailable: status.totalOffersAvailable,
      shouldShowSection: status.initialized && status.totalOffersAvailable > 0
    });
  } catch (error) {
    console.error('Error getting public SDK status:', error);
    res.status(500).json({
      success: false,
      initialized: false,
      shouldShowSection: false
    });
  }
});

module.exports = router;






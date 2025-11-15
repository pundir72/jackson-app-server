const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const analytics = require('../utils/analytics');
const User = require('../models/User');

/**
 * POST /api/offers/non-gaming/track-tap
 * Track when user taps on an offer card (AC3 - Analytics)
 */
router.post('/track-tap', protect, async (req, res) => {
  try {
    const { offerId, offerTitle, provider, category } = req.body;
    const userId = req.user.userId;

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: 'Offer ID is required'
      });
    }

    // Track OfferTapped event
    await analytics.log('OfferTapped', {
      userId: userId,
      offerId: offerId,
      offerTitle: offerTitle || 'Unknown',
      provider: provider || 'unknown',
      category: category || 'unknown',
      timestamp: new Date(),
      action: 'offer_card_tapped'
    });

    res.json({
      success: true,
      message: 'Offer tap tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking offer tap:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track offer tap'
    });
  }
});

/**
 * POST /api/offers/non-gaming/track-view
 * Track when offers are viewed/displayed
 */
router.post('/track-view', protect, async (req, res) => {
  try {
    const { offerIds, provider } = req.body;
    const userId = req.user.userId;

    // Track OfferViewed event
    await analytics.log('OfferViewed', {
      userId: userId,
      offerIds: offerIds || [],
      provider: provider || 'all',
      timestamp: new Date(),
      action: 'offers_displayed'
    });

    res.json({
      success: true,
      message: 'Offer view tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking offer view:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track offer view'
    });
  }
});

module.exports = router;






const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const { adminAuth } = require('../middleware/adminAuth');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const { getVIPPricing } = require('../utils/pricing');

// ==================== VIP TIER MANAGEMENT ====================

/**
 * @route   GET /api/admin/vip/tiers
 * @desc    Get all VIP tiers with analytics
 * @access  Private (Admin)
 */
router.get('/tiers', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().withMessage('Search must be a string'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Invalid status')
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

    const { page = 1, limit = 20, search, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tierId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (status && status !== 'all') {
      query.active = status === 'active';
    }

    const [tiers, total] = await Promise.all([
      VIPTier.find(query)
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VIPTier.countDocuments(query)
    ]);

    // Get analytics for each tier
    const tiersWithAnalytics = await Promise.all(tiers.map(async (tier) => {
      const subscriptionCount = await VIPSubscription.countDocuments({ 
        tier: tier.tierId, 
        status: 'active' 
      });
      const totalRevenue = await VIPSubscription.aggregate([
        { $match: { tier: tier.tierId, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      return {
        ...tier,
        analytics: {
          activeSubscriptions: subscriptionCount,
          totalRevenue: totalRevenue[0]?.total || 0,
          conversionRate: 0 // Will be calculated based on business logic
        }
      };
    }));

    res.json({
      success: true,
      data: {
        tiers: tiersWithAnalytics,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP tiers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP tiers'
    });
  }
});

/**
 * @route   GET /api/admin/vip/tiers/:id
 * @desc    Get single VIP tier with detailed analytics
 * @access  Private (Admin)
 */
router.get('/tiers/:id', adminAuth, async (req, res) => {
  try {
    const tier = await VIPTier.findById(req.params.id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'VIP tier not found'
      });
    }

    // Get detailed analytics
    const analytics = await Promise.all([
      VIPSubscription.countDocuments({ tier: tier.tierId, status: 'active' }),
      VIPSubscription.countDocuments({ tier: tier.tierId }),
      VIPSubscription.aggregate([
        { $match: { tier: tier.tierId, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      VIPSubscription.aggregate([
        { $match: { tier: tier.tierId } },
        { $group: { _id: '$plan', count: { $sum: 1 } } }
      ])
    ]);

    const [activeSubscriptions, totalSubscriptions, revenue, planDistribution] = analytics;

    res.json({
      success: true,
      data: {
        tier,
        analytics: {
          activeSubscriptions,
          totalSubscriptions,
          totalRevenue: revenue[0]?.total || 0,
          planDistribution: planDistribution.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          conversionRate: totalSubscriptions > 0 ? (activeSubscriptions / totalSubscriptions) * 100 : 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP tier:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP tier'
    });
  }
});

/**
 * @route   POST /api/admin/vip/tiers
 * @desc    Create new VIP tier
 * @access  Private (Admin)
 */
router.post('/tiers', adminAuth, [
  body('tierId').isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier ID'),
  body('name').notEmpty().withMessage('Name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('pricing.monthly').isNumeric().withMessage('Monthly price must be a number'),
  body('pricing.yearly').isNumeric().withMessage('Yearly price must be a number'),
  body('benefits').isArray().withMessage('Benefits must be an array'),
  body('order').isNumeric().withMessage('Order must be a number'),
  body('features.noAds').isBoolean().withMessage('No ads must be boolean'),
  body('features.xpMultiplier').isNumeric().withMessage('XP multiplier must be a number'),
  body('features.weeklyXpBonus').isNumeric().withMessage('Weekly XP bonus must be a number'),
  body('features.bonusSpins').isNumeric().withMessage('Bonus spins must be a number')
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

    // Check if tier ID already exists
    const existingTier = await VIPTier.findOne({ tierId: req.body.tierId });
    if (existingTier) {
      return res.status(400).json({
        success: false,
        error: 'VIP tier with this ID already exists'
      });
    }

    const tier = new VIPTier(req.body);
    await tier.save();

    res.status(201).json({
      success: true,
      data: tier,
      message: 'VIP tier created successfully'
    });
  } catch (error) {
    console.error('Error creating VIP tier:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create VIP tier'
    });
  }
});

/**
 * @route   PUT /api/admin/vip/tiers/:id
 * @desc    Update VIP tier
 * @access  Private (Admin)
 */
router.put('/tiers/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('pricing.monthly').optional().isNumeric().withMessage('Monthly price must be a number'),
  body('pricing.yearly').optional().isNumeric().withMessage('Yearly price must be a number'),
  body('benefits').optional().isArray().withMessage('Benefits must be an array'),
  body('order').optional().isNumeric().withMessage('Order must be a number'),
  body('active').optional().isBoolean().withMessage('Active must be boolean')
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

    const tier = await VIPTier.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'VIP tier not found'
      });
    }

    res.json({
      success: true,
      data: tier,
      message: 'VIP tier updated successfully'
    });
  } catch (error) {
    console.error('Error updating VIP tier:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update VIP tier'
    });
  }
});

/**
 * @route   DELETE /api/admin/vip/tiers/:id
 * @desc    Delete VIP tier
 * @access  Private (Admin)
 */
router.delete('/tiers/:id', adminAuth, async (req, res) => {
  try {
    const tier = await VIPTier.findById(req.params.id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'VIP tier not found'
      });
    }

    // Check if tier has active subscriptions
    const activeSubscriptions = await VIPSubscription.countDocuments({
      tier: tier.tierId,
      status: 'active'
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete tier with active subscriptions'
      });
    }

    await VIPTier.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'VIP tier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting VIP tier:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete VIP tier'
    });
  }
});

// ==================== VIP SUBSCRIPTION MANAGEMENT ====================

/**
 * @route   GET /api/admin/vip/subscriptions
 * @desc    Get all VIP subscriptions with filtering
 * @access  Private (Admin)
 */
router.get('/subscriptions', adminAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'cancelled', 'expired', 'pending', 'failed', 'all']).withMessage('Invalid status'),
  query('tier').optional().isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier'),
  query('plan').optional().isIn(['weekly', 'monthly', 'yearly']).withMessage('Invalid plan')
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

    const { page = 1, limit = 20, status, tier, plan } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    let query = {};
    if (status && status !== 'all') query.status = status;
    if (tier) query.tier = tier;
    if (plan) query.plan = plan;

    const [subscriptions, total] = await Promise.all([
      VIPSubscription.find(query)
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VIPSubscription.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP subscriptions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP subscriptions'
    });
  }
});

/**
 * @route   GET /api/admin/vip/subscriptions/:id
 * @desc    Get single VIP subscription details
 * @access  Private (Admin)
 */
router.get('/subscriptions/:id', adminAuth, async (req, res) => {
  try {
    const subscription = await VIPSubscription.findById(req.params.id)
      .populate('userId', 'firstName lastName email profile.avatar');

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  } catch (error) {
    console.error('Error getting VIP subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP subscription'
    });
  }
});

/**
 * @route   PUT /api/admin/vip/subscriptions/:id/cancel
 * @desc    Cancel VIP subscription
 * @access  Private (Admin)
 */
router.put('/subscriptions/:id/cancel', adminAuth, [
  body('reason').optional().isString().withMessage('Reason must be a string')
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

    const subscription = await VIPSubscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    await subscription.cancel(req.body.reason || 'Admin cancelled');

    res.json({
      success: true,
      data: subscription,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel subscription'
    });
  }
});

/**
 * @route   PUT /api/admin/vip/subscriptions/:id/extend
 * @desc    Extend VIP subscription
 * @access  Private (Admin)
 */
router.put('/subscriptions/:id/extend', adminAuth, [
  body('months').isInt({ min: 1, max: 12 }).withMessage('Months must be between 1 and 12')
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

    const subscription = await VIPSubscription.findById(req.params.id);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
    }

    await subscription.extend(req.body.months);

    res.json({
      success: true,
      data: subscription,
      message: 'Subscription extended successfully'
    });
  } catch (error) {
    console.error('Error extending subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extend subscription'
    });
  }
});

// ==================== VIP ANALYTICS ====================

/**
 * @route   GET /api/admin/vip/analytics
 * @desc    Get VIP analytics dashboard
 * @access  Private (Admin)
 */
router.get('/analytics', adminAuth, [
  query('period').optional().isIn(['7d', '30d', '90d', '1y', 'all']).withMessage('Invalid period')
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

    const { period = '30d' } = req.query;
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'all':
        startDate = null;
        break;
    }

    // Build date filter
    const dateFilter = startDate ? { createdAt: { $gte: startDate } } : {};

    // Get analytics data
    const [
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue,
      tierDistribution,
      planDistribution,
      recentSubscriptions,
      expiringSubscriptions
    ] = await Promise.all([
      VIPSubscription.countDocuments(dateFilter),
      VIPSubscription.countDocuments({ ...dateFilter, status: 'active' }),
      VIPSubscription.aggregate([
        { $match: { ...dateFilter, status: 'active' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      VIPSubscription.aggregate([
        { $match: { ...dateFilter, status: 'active' } },
        { $group: { _id: '$tier', count: { $sum: 1 } } }
      ]),
      VIPSubscription.aggregate([
        { $match: { ...dateFilter, status: 'active' } },
        { $group: { _id: '$plan', count: { $sum: 1 } } }
      ]),
      VIPSubscription.find({ ...dateFilter, status: 'active' })
        .populate('userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      VIPSubscription.find({
        status: 'active',
        endDate: { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
      })
        .populate('userId', 'firstName lastName email')
        .sort({ endDate: 1 })
        .limit(10)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalSubscriptions,
          activeSubscriptions,
          totalRevenue: totalRevenue[0]?.total || 0,
          conversionRate: totalSubscriptions > 0 ? (activeSubscriptions / totalSubscriptions) * 100 : 0
        },
        distribution: {
          tiers: tierDistribution.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          plans: planDistribution.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {})
        },
        recent: recentSubscriptions,
        expiring: expiringSubscriptions,
        period
      }
    });
  } catch (error) {
    console.error('Error getting VIP analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get VIP analytics'
    });
  }
});

/**
 * @route   GET /api/admin/vip/pricing-config
 * @desc    Get pricing configuration for different regions
 * @access  Private (Admin)
 */
router.get('/pricing-config', adminAuth, async (req, res) => {
  try {
    const regions = ['US', 'EU', 'UK', 'IN'];
    const pricingConfig = {};

    for (const region of regions) {
      pricingConfig[region] = await getVIPPricing(region);
    }

    res.json({
      success: true,
      data: pricingConfig
    });
  } catch (error) {
    console.error('Error getting pricing config:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get pricing configuration'
    });
  }
});

module.exports = router;

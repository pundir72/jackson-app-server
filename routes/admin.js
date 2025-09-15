const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const { getVIPPricing } = require('../utils/pricing');

// Admin authentication middleware (you can enhance this later)
const adminAuth = (req, res, next) => {
  // For now, we'll use the same auth middleware
  // Later you can add role-based authentication
  protect(req, res, next);
};

// ==================== VIP TIERS MANAGEMENT ====================

// Get all VIP tiers (admin view)
router.get('/vip-tiers', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
    
    let query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tierId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status !== 'all') {
      query.active = status === 'active';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tiers = await VIPTier.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await VIPTier.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        tiers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP tiers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP tiers',
      error: error.message
    });
  }
});

// Get single VIP tier by ID
router.get('/vip-tiers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tier = await VIPTier.findById(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found'
      });
    }
    
    res.json({
      success: true,
      data: tier
    });
  } catch (error) {
    console.error('Error getting VIP tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP tier',
      error: error.message
    });
  }
});

// Create new VIP tier
router.post('/vip-tiers', adminAuth, [
  body('tierId').isIn(['bronze', 'gold', 'platinum']).withMessage('Invalid tier ID'),
  body('name').notEmpty().withMessage('Name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('pricing.monthly').isNumeric().withMessage('Monthly price must be a number'),
  body('pricing.yearly').isNumeric().withMessage('Yearly price must be a number'),
  body('benefits').isArray().withMessage('Benefits must be an array'),
  body('order').isNumeric().withMessage('Order must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const tierData = req.body;
    
    // Check if tier ID already exists
    const existingTier = await VIPTier.findOne({ tierId: tierData.tierId });
    if (existingTier) {
      return res.status(400).json({
        success: false,
        message: 'VIP tier with this ID already exists'
      });
    }
    
    const tier = new VIPTier(tierData);
    await tier.save();
    
    res.status(201).json({
      success: true,
      message: 'VIP tier created successfully',
      data: tier
    });
  } catch (error) {
    console.error('Error creating VIP tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create VIP tier',
      error: error.message
    });
  }
});

// Update VIP tier
router.put('/vip-tiers/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('pricing.monthly').optional().isNumeric().withMessage('Monthly price must be a number'),
  body('pricing.yearly').optional().isNumeric().withMessage('Yearly price must be a number'),
  body('benefits').optional().isArray().withMessage('Benefits must be an array'),
  body('order').optional().isNumeric().withMessage('Order must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const updateData = req.body;
    
    const tier = await VIPTier.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found'
      });
    }
    
    res.json({
      success: true,
      message: 'VIP tier updated successfully',
      data: tier
    });
  } catch (error) {
    console.error('Error updating VIP tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update VIP tier',
      error: error.message
    });
  }
});

// Delete VIP tier
router.delete('/vip-tiers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if tier is being used by any subscriptions
    const activeSubscriptions = await VIPSubscription.find({ tier: tier.tierId, status: 'active' });
    if (activeSubscriptions.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete tier with active subscriptions'
      });
    }
    
    const tier = await VIPTier.findByIdAndDelete(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found'
      });
    }
    
    res.json({
      success: true,
      message: 'VIP tier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting VIP tier:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete VIP tier',
      error: error.message
    });
  }
});

// Toggle VIP tier status (active/inactive)
router.patch('/vip-tiers/:id/toggle', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tier = await VIPTier.findById(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: 'VIP tier not found'
      });
    }
    
    tier.active = !tier.active;
    await tier.save();
    
    res.json({
      success: true,
      message: `VIP tier ${tier.active ? 'activated' : 'deactivated'} successfully`,
      data: tier
    });
  } catch (error) {
    console.error('Error toggling VIP tier status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle VIP tier status',
      error: error.message
    });
  }
});

// ==================== SUBSCRIPTIONS MANAGEMENT ====================

// Get all subscriptions (admin view)
router.get('/subscriptions', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status = 'all', 
      tier = 'all',
      search = '',
      startDate,
      endDate
    } = req.query;
    
    let query = {};
    
    // Status filter
    if (status !== 'all') {
      query.status = status;
    }
    
    // Tier filter
    if (tier !== 'all') {
      query.tier = tier;
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { paymentIntentId: { $regex: search, $options: 'i' } },
        { stripeSubscriptionId: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const subscriptions = await VIPSubscription.find(query)
      .populate('userId', 'firstName lastName email mobile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await VIPSubscription.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscriptions',
      error: error.message
    });
  }
});

// Get subscription statistics
router.get('/subscriptions/stats', adminAuth, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case '7d':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
        break;
      case '30d':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
        break;
      case '90d':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } };
        break;
      case '1y':
        dateFilter = { createdAt: { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) } };
        break;
    }
    
    const stats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSubscriptions: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          activeSubscriptions: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          cancelledSubscriptions: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          averageRevenue: { $avg: '$amount' }
        }
      }
    ]);
    
    const tierStats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        period,
        overview: stats[0] || {
          totalSubscriptions: 0,
          totalRevenue: 0,
          activeSubscriptions: 0,
          cancelledSubscriptions: 0,
          averageRevenue: 0
        },
        tierBreakdown: tierStats
      }
    });
  } catch (error) {
    console.error('Error getting subscription stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subscription statistics',
      error: error.message
    });
  }
});

// Cancel subscription (admin)
router.post('/subscriptions/:id/cancel', adminAuth, [
  body('reason').notEmpty().withMessage('Cancellation reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { id } = req.params;
    const { reason } = req.body;
    
    const subscription = await VIPSubscription.findById(id);
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    }
    
    await subscription.cancel(reason);
    
    // Update user's VIP status
    await User.findByIdAndUpdate(subscription.userId, {
      $set: {
        'vip.level': 'free',
        'vip.isActive': false,
        'vip.expires': null
      }
    });
    
    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: subscription.getSummary()
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.message
    });
  }
});

// ==================== USERS MANAGEMENT ====================

// Get VIP users
router.get('/users/vip', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, tier = 'all' } = req.query;
    
    let query = { 'vip.isActive': true };
    
    if (tier !== 'all') {
      query['vip.level'] = tier;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('firstName lastName email mobile vip createdAt')
      .sort({ 'vip.expires': -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting VIP users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get VIP users',
      error: error.message
    });
  }
});

// ==================== DASHBOARD STATS ====================

// Get admin dashboard statistics
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get basic counts
    const [
      totalUsers,
      vipUsers,
      totalSubscriptions,
      activeSubscriptions,
      totalTiers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 'vip.isActive': true }),
      VIPSubscription.countDocuments(),
      VIPSubscription.countDocuments({ status: 'active' }),
      VIPTier.countDocuments({ active: true })
    ]);
    
    // Get revenue stats
    const revenueStats = await VIPSubscription.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          monthlyRevenue: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', thirtyDaysAgo] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]);
    
    // Get tier distribution
    const tierDistribution = await VIPSubscription.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$tier',
          count: { $sum: 1 },
          revenue: { $sum: '$amount' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          vipUsers,
          totalSubscriptions,
          activeSubscriptions,
          totalTiers,
          vipConversionRate: totalUsers > 0 ? ((vipUsers / totalUsers) * 100).toFixed(2) : 0
        },
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          monthlyRevenue: 0
        },
        tierDistribution
      }
    });
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard statistics',
      error: error.message
    });
  }
});

module.exports = router;








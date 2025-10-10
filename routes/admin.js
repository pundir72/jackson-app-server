const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const { getVIPPricing } = require('../utils/pricing');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

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

// Get all users with filters and pagination
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      tier = 'all', 
      status = 'all',
      location = 'all',
      memberSince = 'all',
      gender = 'all',
      ageRange = 'all',
      search = ''
    } = req.query;
    
    let query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Tier filter
    if (tier !== 'all') {
      query['vip.level'] = tier;
    }
    
    // Status filter
    if (status !== 'all') {
      if (status === 'Active') {
        query['profile.status'] = 'active';
      } else if (status === 'Inactive') {
        query['profile.status'] = 'inactive';
      } else if (status === 'Paused') {
        query['profile.status'] = 'paused';
      }
    }
    
    // Gender filter
    if (gender !== 'all') {
      query['onboarding.gender'] = gender.toLowerCase();
    }
    
    // Age range filter
    if (ageRange !== 'all') {
      query['onboarding.ageRange'] = ageRange.replace('–', '-');
    }
    
    // Location filter (based on current location)
    if (location !== 'all') {
      query['location.current.city'] = { $regex: location.split(',')[0], $options: 'i' };
    }
    
    // Member since filter
    if (memberSince !== 'all') {
      const now = new Date();
      let dateFilter = {};
      
      switch (memberSince) {
        case 'Last 30 days':
          dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
          break;
        case 'Last 3 months':
          dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
          break;
        case 'Last 6 months':
          dateFilter = { $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000) };
          break;
        case 'Last year':
          dateFilter = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
          break;
        case 'More than a year':
          dateFilter = { $lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
          break;
      }
      
      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const users = await User.find(query)
      .select('firstName lastName email mobile vip profile onboarding location createdAt lastActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    // Transform users to match frontend format
    const transformedUsers = users.map(user => {
      const vip = user.vip || { level: 'free' };
      const profile = user.profile || { status: 'active', avatar: '' };
      const onboarding = user.onboarding || {};
      const locCurrent = (user.location && user.location.current) ? user.location.current : {};
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim() || 'N/A';
      const tierLevel = vip.level || 'free';
      const tier = tierLevel.charAt(0).toUpperCase() + tierLevel.slice(1);
      const statusVal = profile.status || 'active';
      const status = statusVal.charAt(0).toUpperCase() + statusVal.slice(1);
      const gender = onboarding.gender ? onboarding.gender.charAt(0).toUpperCase() + onboarding.gender.slice(1) : 'N/A';
      const ageRange = onboarding.ageRange || 'N/A';
      const location = (locCurrent.city && locCurrent.country)
        ? `${locCurrent.city}, ${locCurrent.country}`
        : 'N/A';
      
      // Generate user ID from MongoDB ObjectId
      const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`;
      
      return {
        id: user._id,
        userId,
        name: fullName,
        tier,
        tierIcon: getTierIcon(tier),
        tierBg: getTierBg(tier),
        tierBorder: getTierBorder(tier),
        tierColor: getTierColor(tier),
        email: user.email || 'N/A',
        phone: user.mobile || 'N/A',
        gender,
        age: ageRange,
        location,
        status,
        statusBg: getStatusBg(status),
        statusColor: getStatusColor(status),
        avatar: profile.avatar || 'https://c.animaapp.com/t66hdvJZ/img/avatar.svg',
        createdAt: user.createdAt,
        lastActive: user.lastActive || user.createdAt
      };
    });
    
    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
});

// Get VIP users (must come before /users/:id route)
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

// Export users data (must come before /users/:id route)
router.get('/users/export', adminAuth, async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    
    const users = await User.find({})
      .select('firstName lastName email mobile vip profile onboarding location createdAt')
      .sort({ createdAt: -1 });
    
    if (format === 'csv') {
      // Generate CSV data
      const csvHeaders = 'User ID,Name,Email,Phone,Gender,Age Range,Location,Tier,Status,Member Since\n';
      const csvData = users.map(user => {
        const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`;
        const fullName = `${user.firstName} ${user.lastName}`;
        const tier = user.vip.level.charAt(0).toUpperCase() + user.vip.level.slice(1);
        const status = user.profile.status.charAt(0).toUpperCase() + user.profile.status.slice(1);
        const gender = user.onboarding.gender ? user.onboarding.gender.charAt(0).toUpperCase() + user.onboarding.gender.slice(1) : 'N/A';
        const ageRange = user.onboarding.ageRange || 'N/A';
        const location = user.location.current.city && user.location.current.country 
          ? `${user.location.current.city}, ${user.location.current.country}` 
          : 'N/A';
        const memberSince = user.createdAt.toISOString().split('T')[0];
        
        return `${userId},"${fullName}",${user.email || 'N/A'},${user.mobile || 'N/A'},${gender},${ageRange},"${location}",${tier},${status},${memberSince}`;
      }).join('\n');
      
      const csvContent = csvHeaders + csvData;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=users-export-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: users,
        exportedAt: new Date(),
        totalUsers: users.length
      });
    }
  } catch (error) {
    console.error('Error exporting users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users',
      error: error.message
    });
  }
});

// Get single user details
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .populate('wallet.transactions')
      .populate('games')
      .populate('tasks')
      .populate('surveys');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Transform user data to match frontend format
    const safeVip = user.vip || { level: 'free' };
    const safeProfile = user.profile || { status: 'active', avatar: '' };
    const safeOnboarding = user.onboarding || {};
    const safeWallet = user.wallet || { balance: 0 };
    const safeXp = user.xp || { current: 0, tier: 1 };
    const safeLocation = (user.location && user.location.current) ? user.location.current : {};
    const safeGames = Array.isArray(user.games) ? user.games : [];
    const safeTasks = Array.isArray(user.tasks) ? user.tasks : [];
    const safeSurveys = Array.isArray(user.surveys) ? user.surveys : [];
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'N/A';
    const tierText = (safeVip.level || 'free');
    const statusText = (safeProfile.status || 'active');

    const transformedUser = {
      id: user._id,
      userId: `ID${user._id.toString().slice(-6).toUpperCase()}`,
      name: fullName,
      tier: tierText.charAt(0).toUpperCase() + tierText.slice(1),
      email: user.email || 'N/A',
      phone: user.mobile || 'N/A',
      gender: safeOnboarding.gender ? safeOnboarding.gender.charAt(0).toUpperCase() + safeOnboarding.gender.slice(1) : 'N/A',
      age: safeOnboarding.ageRange || 'N/A',
      location: (safeLocation.city && safeLocation.country) ? `${safeLocation.city}, ${safeLocation.country}` : 'N/A',
      status: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      avatar: safeProfile.avatar || 'https://c.animaapp.com/t66hdvJZ/img/avatar.svg',
      registrationDate: user.createdAt,
      memberSince: user.createdAt,
      lastActive: user.lastActive || user.createdAt,
      lastLoginAt: user.lastLoginAt || null,
      loginCount: typeof user.loginCount === 'number' ? user.loginCount : 0,
      appVersion: user.appVersion || 'N/A',
      accountStatus: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      faceVerification: user.isVerified ? 'Verified' : 'Not Verified',
      signupCountry: (user.signup && user.signup.country) ? user.signup.country : 'N/A',
      country: safeLocation.country || 'N/A',
      coinBalance: typeof safeWallet.balance === 'number' ? safeWallet.balance : 0,
      xp: typeof safeXp.current === 'number' ? safeXp.current : 0,
      xpTier: typeof safeXp.tier === 'number' ? safeXp.tier : 1,
      gamesPlayed: safeGames.length || 0,
      tasksCompleted: safeTasks.filter(task => task && task.completed).length || 0,
      surveysCompleted: safeSurveys.filter(survey => survey && survey.completed).length || 0,
      vip: safeVip,
      wallet: safeWallet,
      onboarding: safeOnboarding,
      profile: safeProfile
    };
    
    res.json({
      success: true,
      data: transformedUser
    });
  } catch (error) {
    console.error('Error getting user details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user details',
      error: error.message
    });
  }
});

// Update user
router.put('/users/:id', adminAuth, [
  body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
  body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('mobile').optional().isMobilePhone().withMessage('Invalid mobile number'),
  body('gender').optional().isIn(['male', 'female', 'other']).withMessage('Invalid gender'),
  body('ageRange').optional().isIn(['18-25', '26-35', '36-45', '46-55', '56+']).withMessage('Invalid age range'),
  body('status').optional().isIn(['active', 'inactive', 'paused']).withMessage('Invalid status')
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
    
    // Build update object
    const updateFields = {};
    
    if (updateData.firstName) updateFields.firstName = updateData.firstName;
    if (updateData.lastName) updateFields.lastName = updateData.lastName;
    if (updateData.email) updateFields.email = updateData.email;
    if (updateData.mobile) updateFields.mobile = updateData.mobile;
    if (updateData.gender) updateFields['onboarding.gender'] = updateData.gender;
    if (updateData.ageRange) updateFields['onboarding.ageRange'] = updateData.ageRange;
    if (updateData.status) updateFields['profile.status'] = updateData.status;
    
    const user = await User.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

// Update user status (suspend/activate)
router.patch('/users/:id/status', adminAuth, [
  body('status').isIn(['active', 'inactive', 'paused']).withMessage('Invalid status'),
  body('reason').optional().isString().withMessage('Reason must be a string')
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
    const { status, reason } = req.body;
    
    const user = await User.findByIdAndUpdate(
      id,
      { 
        'profile.status': status,
        'profile.statusReason': reason,
        'profile.statusUpdatedAt': new Date()
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    
    res.json({
      success: true,
      message: `User ${statusText.toLowerCase()}d successfully`,
      data: {
        id: user._id,
        status: statusText,
        reason
      }
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

// Send notification to user
router.post('/users/:id/notifications', adminAuth, [
  body('message').notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'warning', 'success', 'error']).withMessage('Invalid notification type')
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
    const { message, type = 'info' } = req.body;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Here you would integrate with your notification service
    // For now, we'll just log the notification
    console.log(`Sending ${type} notification to user ${user.firstName} ${user.lastName}: ${message}`);
    
    // You could store the notification in a database or send via push notification service
    // For example: await Notification.create({ userId: id, message, type, sentAt: new Date() });
    
    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        userId: id,
        message,
        type,
        sentAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification',
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

// Helper functions for user styling
function getTierIcon(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png';
    case 'gold':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--9@2x.png';
    case 'platinum':
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--10@2x.png';
    default:
      return 'https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png';
  }
}

function getTierBg(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#ffefda';
    case 'gold':
      return '#fffddf';
    case 'platinum':
      return '#f4f4f4';
    default:
      return '#ffefda';
  }
}

function getTierBorder(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#c77023';
    case 'gold':
      return '#f0c92e';
    case 'platinum':
      return '#9aa7b8';
    default:
      return '#c77023';
  }
}

function getTierColor(tier) {
  switch (tier.toLowerCase()) {
    case 'bronze':
      return '#f68d2b';
    case 'gold':
      return '#c7a20f';
    case 'platinum':
      return '#6f85a4';
    default:
      return '#f68d2b';
  }
}

function getStatusBg(status) {
  switch (status.toLowerCase()) {
    case 'active':
      return '#d3f8d2';
    case 'inactive':
      return '#ffdbd4';
    case 'paused':
      return '#fff2ab';
    default:
      return '#d3f8d2';
  }
}

function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case 'active':
      return '#066657';
    case 'inactive':
      return '#f40202';
    case 'paused':
      return '#6f631b';
    default:
      return '#066657';
  }
}

module.exports = router;

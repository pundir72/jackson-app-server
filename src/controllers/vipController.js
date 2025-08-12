const VIPMembership = require('../models/VIPMembership');
const User = require('../models/User');
const logger = require('../utils/logger');
const { sendNotification } = require('../services/notificationService');

// Get VIP benefits
const getBenefits = async (req, res) => {
  try {
    const benefits = [
      {
        id: 1,
        title: 'Higher Cashback Rates',
        description: 'Earn 2x cashback on all purchases and challenges',
        icon: '💰',
        value: '2x multiplier',
      },
      {
        id: 2,
        title: 'Exclusive Challenges',
        description: 'Access to VIP-only challenges with higher rewards',
        icon: '⭐',
        value: 'VIP challenges',
      },
      {
        id: 3,
        title: 'Priority Support',
        description: 'Get priority customer support and faster response times',
        icon: '🎧',
        value: '24/7 support',
      },
      {
        id: 4,
        title: 'Early Access',
        description: 'Be the first to try new features and games',
        icon: '🚀',
        value: 'Early access',
      },
      {
        id: 5,
        title: 'VIP Games',
        description: 'Access to exclusive VIP-only games',
        icon: '🎮',
        value: 'VIP games',
      },
      {
        id: 6,
        title: 'No Ads',
        description: 'Enjoy an ad-free experience',
        icon: '🚫',
        value: 'Ad-free',
      },
    ];

    res.status(200).json({
      success: true,
      message: 'VIP benefits retrieved successfully',
      data: { benefits },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting VIP benefits:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VIP benefits',
      statusCode: 500,
    });
  }
};

// Get VIP plans
const getPlans = async (req, res) => {
  try {
    const plans = [
      {
        id: 1,
        name: 'Monthly VIP',
        price: 9.99,
        duration: '1 month',
        originalPrice: 9.99,
        discountPercentage: 0,
        features: [
          '2x cashback rates',
          'Exclusive challenges',
          'Priority support',
          'Early access to features',
          'VIP-only games',
          'Ad-free experience',
        ],
        popular: false,
      },
      {
        id: 2,
        name: 'Quarterly VIP',
        price: 24.99,
        duration: '3 months',
        originalPrice: 29.97,
        discountPercentage: 17,
        features: [
          '2x cashback rates',
          'Exclusive challenges',
          'Priority support',
          'Early access to features',
          'VIP-only games',
          'Ad-free experience',
          'Quarterly bonus rewards',
        ],
        popular: true,
      },
      {
        id: 3,
        name: 'Yearly VIP',
        price: 79.99,
        duration: '12 months',
        originalPrice: 119.88,
        discountPercentage: 33,
        features: [
          '2x cashback rates',
          'Exclusive challenges',
          'Priority support',
          'Early access to features',
          'VIP-only games',
          'Ad-free experience',
          'Yearly bonus rewards',
          'Exclusive events',
        ],
        popular: false,
      },
    ];

    res.status(200).json({
      success: true,
      message: 'VIP plans retrieved successfully',
      data: { plans },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting VIP plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VIP plans',
      statusCode: 500,
    });
  }
};

// Upgrade to VIP
const upgradeToVIP = async (req, res) => {
  try {
    const { plan, paymentMethod, paymentDetails } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Check if user already has VIP
    const existingMembership = await VIPMembership.findByUserId(userId);
    if (existingMembership && existingMembership.isActive()) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active VIP membership',
        statusCode: 400,
      });
    }

    // Get plan details
    const plans = {
      monthly: { price: 9.99, duration: 1 },
      quarterly: { price: 24.99, duration: 3 },
      yearly: { price: 79.99, duration: 12 },
    };

    const selectedPlan = plans[plan];
    if (!selectedPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected',
        statusCode: 400,
      });
    }

    // Calculate end date
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + selectedPlan.duration);

    // Create VIP membership
    const membership = new VIPMembership({
      userId,
      plan,
      startDate,
      endDate,
      paymentMethod,
      paymentDetails,
      pricing: {
        originalPrice: selectedPlan.price,
        currency: 'USD',
      },
    });

    // Process payment (mock implementation)
    const paymentData = {
      amount: selectedPlan.price,
      currency: 'USD',
      paymentMethod,
      status: 'success',
      transactionId: `txn_${Date.now()}`,
    };

    await membership.addPayment(paymentData);
    await membership.save();

    // Update user VIP status
    user.isVip = true;
    user.vipExpiresAt = endDate;
    await user.save();

    // Send notification
    await sendNotification(userId, {
      type: 'vip_upgraded',
      title: 'Welcome to VIP!',
      message: `You are now a VIP member with ${plan} plan!`,
      data: {
        plan,
        expiryDate: endDate,
        benefits: [
          '2x cashback rates',
          'Exclusive challenges',
          'Priority support',
        ],
      },
    });

    res.status(200).json({
      success: true,
      message: 'VIP membership activated successfully',
      data: {
        membership: {
          id: membership._id,
          plan,
          startDate: membership.startDate,
          endDate: membership.endDate,
          status: membership.status,
        },
        user: {
          isVip: user.isVip,
          vipExpiresAt: user.vipExpiresAt,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error upgrading to VIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade to VIP',
      statusCode: 500,
    });
  }
};

// Cancel VIP membership
const cancelVIP = async (req, res) => {
  try {
    const { reason } = req.body;
    const userId = req.user.id;

    const membership = await VIPMembership.findByUserId(userId);
    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'No VIP membership found',
        statusCode: 404,
      });
    }

    if (!membership.isActive()) {
      return res.status(400).json({
        success: false,
        message: 'No active VIP membership to cancel',
        statusCode: 400,
      });
    }

    await membership.cancel(reason, userId);

    // Update user VIP status
    const user = await User.findById(userId);
    user.isVip = false;
    user.vipExpiresAt = null;
    await user.save();

    // Send notification
    await sendNotification(userId, {
      type: 'vip_cancelled',
      title: 'VIP Membership Cancelled',
      message: 'Your VIP membership has been cancelled.',
      data: {
        reason,
        cancelledAt: membership.cancellation.cancelledAt,
      },
    });

    res.status(200).json({
      success: true,
      message: 'VIP membership cancelled successfully',
      data: {
        membership: {
          id: membership._id,
          status: membership.status,
          cancelledAt: membership.cancellation.cancelledAt,
        },
        user: {
          isVip: user.isVip,
          vipExpiresAt: user.vipExpiresAt,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error cancelling VIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel VIP membership',
      statusCode: 500,
    });
  }
};

// Get VIP status
const getVIPStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const membership = await VIPMembership.findByUserId(userId);
    const user = await User.findById(userId);

    const status = {
      isVip: user.isVip,
      vipExpiresAt: user.vipExpiresAt,
      membership: membership ? {
        id: membership._id,
        plan: membership.plan,
        status: membership.status,
        startDate: membership.startDate,
        endDate: membership.endDate,
        autoRenew: membership.autoRenew,
        daysUntilExpiry: membership.daysUntilExpiry(),
        isActive: membership.isActive(),
        isExpired: membership.isExpired(),
      } : null,
    };

    res.status(200).json({
      success: true,
      message: 'VIP status retrieved successfully',
      data: { status },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting VIP status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VIP status',
      statusCode: 500,
    });
  }
};

// Get VIP usage statistics
const getVIPStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const membership = await VIPMembership.findByUserId(userId);
    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'No VIP membership found',
        statusCode: 404,
      });
    }

    const stats = {
      totalCashbackEarned: membership.usage.totalCashbackEarned,
      totalPointsEarned: membership.usage.totalPointsEarned,
      challengesCompleted: membership.usage.challengesCompleted,
      gamesPlayed: membership.usage.gamesPlayed,
      receiptsScanned: membership.usage.receiptsScanned,
      savings: membership.getSavings(),
      roi: membership.getROI(),
      daysRemaining: membership.daysUntilExpiry(),
    };

    res.status(200).json({
      success: true,
      message: 'VIP statistics retrieved successfully',
      data: { stats },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting VIP statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve VIP statistics',
      statusCode: 500,
    });
  }
};

// Update VIP settings
const updateVIPSettings = async (req, res) => {
  try {
    const { autoRenew, notifications } = req.body;
    const userId = req.user.id;

    const membership = await VIPMembership.findByUserId(userId);
    if (!membership) {
      return res.status(404).json({
        success: false,
        message: 'No VIP membership found',
        statusCode: 404,
      });
    }

    if (autoRenew !== undefined) {
      membership.autoRenew = autoRenew;
    }

    if (notifications) {
      membership.notifications = { ...membership.notifications, ...notifications };
    }

    await membership.save();

    res.status(200).json({
      success: true,
      message: 'VIP settings updated successfully',
      data: { membership },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error updating VIP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update VIP settings',
      statusCode: 500,
    });
  }
};

module.exports = {
  getBenefits,
  getPlans,
  upgradeToVIP,
  cancelVIP,
  getVIPStatus,
  getVIPStats,
  updateVIPSettings,
}; 
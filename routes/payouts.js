const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const tremendous = require('../utils/tremendous');
const verisoul = require('../utils/verisoul');

// Get available payout methods
router.get('/methods', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('location vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const country = user.location?.country || 'US';
    
    // Get supported currencies and reward types
    const [currenciesResult, rewardTypesResult] = await Promise.all([
      tremendous.getSupportedCurrencies(),
      tremendous.getRewardTypes(country)
    ]);

    const methods = [];

    if (currenciesResult.success) {
      methods.push({
        id: 'gift_card',
        name: 'Gift Card',
        description: 'Digital gift cards for popular retailers',
        icon: '🎁',
        isAvailable: true,
        currencies: currenciesResult.currencies.filter(c => c.isSupported),
        minAmount: 500, // $5.00
        maxAmount: 10000, // $100.00
        processingTime: 'Instant',
        fees: 0
      });
    }

    if (rewardTypesResult.success) {
      rewardTypesResult.rewardTypes.forEach(type => {
        if (type.isAvailable) {
          methods.push({
            id: type.id,
            name: type.name,
            description: type.description,
            icon: '💰',
            isAvailable: true,
            currencies: [{ code: type.currency, symbol: '$' }],
            minAmount: type.minAmount,
            maxAmount: type.maxAmount,
            processingTime: `${type.deliveryTime} hours`,
            fees: type.fees
          });
        }
      });
    }

    res.json({
      success: true,
      data: {
        methods,
        userCountry: country,
        message: 'Choose your preferred payout method'
      }
    });
  } catch (error) {
    console.error('Error getting payout methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout methods'
    });
  }
});

// Create payout request
router.post('/create', protect, async (req, res) => {
  try {
    const { amount, currency, method, recipient } = req.body;
    const user = await User.findById(req.user.userId).select('xp vip wallet location profile');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate amount
    const minAmount = 500; // $5.00 minimum
    const maxAmount = 10000; // $100.00 maximum
    const amountInCents = Math.round(amount * 100);

    if (amountInCents < minAmount || amountInCents > maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Amount must be between $${minAmount/100} and $${maxAmount/100}`
      });
    }

    // Check user balance
    const userBalance = user.wallet.balance || 0;
    const requiredCoins = Math.round(amountInCents * 10); // 10 coins per $1

    if (userBalance < requiredCoins) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient balance',
        required: requiredCoins,
        current: userBalance
      });
    }

    // Verify user identity with verisoul.ai
    const verification = await verisoul.verifyUserIdentity({
      userId: user._id.toString(),
      faceImage: req.body.faceImage, // Base64 encoded image
      location: {
        lat: user.location?.lat || 0,
        lng: user.location?.lng || 0,
        country: user.location?.country || 'US',
        city: user.location?.city || 'Unknown'
      },
      deviceInfo: {
        fingerprint: req.headers['x-device-fingerprint'] || 'unknown',
        platform: 'mobile',
        version: '1.0.0',
        model: 'iPhone 13',
        ipAddress: req.ip
      }
    });

    if (!verification.success || !verification.verified) {
      return res.status(400).json({
        success: false,
        error: 'Identity verification required for payouts',
        verificationRequired: true
      });
    }

    // Create payout with Tremendous
    const payoutResult = await tremendous.createPayout({
      userId: user._id.toString(),
      amount: amountInCents,
      currency: currency,
      recipient: {
        email: recipient.email,
        name: recipient.name,
        phone: recipient.phone
      },
      rewardType: method
    });

    if (!payoutResult.success) {
      return res.status(400).json({
        success: false,
        error: payoutResult.error || 'Failed to create payout'
      });
    }

    // Deduct coins from user balance
    user.wallet.balance = userBalance - requiredCoins;
    user.wallet.lastUpdated = new Date();

    // Create transaction record
    const transaction = new Transaction({
      user: user._id,
      type: 'debit',
      amount: requiredCoins,
      description: `Payout request - $${amount} ${currency}`,
      status: 'pending',
      referenceId: payoutResult.payoutId,
      metadata: {
        payoutId: payoutResult.payoutId,
        method: method,
        amount: amount,
        currency: currency,
        recipient: recipient
      }
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        message: 'Payout request created successfully!',
        payoutId: payoutResult.payoutId,
        status: payoutResult.status,
        amount: amount,
        currency: currency,
        method: method,
        estimatedDelivery: payoutResult.estimatedDelivery,
        trackingUrl: payoutResult.trackingUrl,
        newBalance: user.wallet.balance
      }
    });
  } catch (error) {
    console.error('Error creating payout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payout'
    });
  }
});

// Get payout status
router.get('/:payoutId/status', protect, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get payout status from Tremendous
    const statusResult = await tremendous.getPayoutStatus(payoutId);

    if (!statusResult.success) {
      return res.status(400).json({
        success: false,
        error: statusResult.error || 'Failed to get payout status'
      });
    }

    res.json({
      success: true,
      data: {
        payoutId: statusResult.payoutId,
        status: statusResult.status,
        amount: statusResult.amount,
        currency: statusResult.currency,
        rewardType: statusResult.rewardType,
        deliveredAt: statusResult.deliveredAt,
        claimedAt: statusResult.claimedAt,
        expiresAt: statusResult.expiresAt,
        trackingUrl: statusResult.trackingUrl
      }
    });
  } catch (error) {
    console.error('Error getting payout status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout status'
    });
  }
});

// Get user payout history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get payout history from Tremendous
    const historyResult = await tremendous.getUserPayouts(user._id.toString(), {
      page: parseInt(page),
      limit: parseInt(limit),
      status: status
    });

    if (!historyResult.success) {
      return res.status(500).json({
        success: false,
        error: historyResult.error || 'Failed to get payout history'
      });
    }

    res.json({
      success: true,
      data: {
        payouts: historyResult.payouts,
        pagination: historyResult.pagination,
        totalAmount: historyResult.totalAmount
      }
    });
  } catch (error) {
    console.error('Error getting payout history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout history'
    });
  }
});

// Cancel payout
router.post('/:payoutId/cancel', protect, async (req, res) => {
  try {
    const { payoutId } = req.params;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Cancel payout with Tremendous
    const cancelResult = await tremendous.cancelPayout(payoutId);

    if (!cancelResult.success) {
      return res.status(400).json({
        success: false,
        error: cancelResult.error || 'Failed to cancel payout'
      });
    }

    // Update transaction status
    await Transaction.findOneAndUpdate(
      { referenceId: payoutId, user: user._id },
      { status: 'cancelled' }
    );

    res.json({
      success: true,
      data: {
        message: 'Payout cancelled successfully',
        payoutId: cancelResult.payoutId,
        status: cancelResult.status,
        cancelledAt: cancelResult.cancelledAt
      }
    });
  } catch (error) {
    console.error('Error cancelling payout:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel payout'
    });
  }
});

// Get payout analytics
router.get('/analytics', protect, async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const user = await User.findById(req.user.userId).select('_id');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get payout analytics from Tremendous
    const analyticsResult = await tremendous.getPayoutAnalytics({
      startDate: startDate,
      endDate: endDate,
      groupBy: groupBy
    });

    if (!analyticsResult.success) {
      return res.status(500).json({
        success: false,
        error: analyticsResult.error || 'Failed to get payout analytics'
      });
    }

    res.json({
      success: true,
      data: {
        analytics: analyticsResult.analytics
      }
    });
  } catch (error) {
    console.error('Error getting payout analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout analytics'
    });
  }
});

// Payout completion callback (called by Tremendous)
router.post('/callback/tremendous', async (req, res) => {
  try {
    const { payoutId, status, signature } = req.body;
    
    // Verify callback with Tremendous
    const verification = await tremendous.verifyCallback({
      payoutId: payoutId,
      status: status,
      signature: signature
    });

    if (!verification.success || !verification.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback data'
      });
    }

    // Update transaction status
    const transaction = await Transaction.findOne({ referenceId: payoutId });
    if (transaction) {
      transaction.status = status === 'delivered' ? 'completed' : status;
      await transaction.save();
    }

    res.json({
      success: true,
      data: {
        message: 'Payout status updated successfully',
        payoutId: payoutId,
        status: status
      }
    });
  } catch (error) {
    console.error('Error processing payout callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process payout callback'
    });
  }
});

// Get payout limits and requirements
router.get('/limits', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp vip location');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    const vipLevel = user.vip?.level || 'free';
    const country = user.location?.country || 'US';

    // Define limits based on user tier and VIP status
    const limits = {
      minAmount: 5.00, // $5.00
      maxAmount: getMaxAmount(currentTier, vipLevel),
      dailyLimit: getDailyLimit(currentTier, vipLevel),
      monthlyLimit: getMonthlyLimit(currentTier, vipLevel),
      requiredCoins: 10, // 10 coins per $1
      processingTime: '1-24 hours',
      fees: 0,
      verificationRequired: true,
      supportedCountries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT'],
      supportedCurrencies: ['USD', 'CAD', 'GBP', 'AUD', 'EUR']
    };

    res.json({
      success: true,
      data: {
        limits,
        userTier: currentTier.id,
        vipLevel: vipLevel,
        country: country,
        isEligible: limits.supportedCountries.includes(country)
      }
    });
  } catch (error) {
    console.error('Error getting payout limits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payout limits'
    });
  }
});

// Helper functions
function getCurrentTier(xp) {
  if (xp >= 10000) return { id: 'expert', name: 'Expert' };
  if (xp >= 5000) return { id: 'senior', name: 'Senior' };
  if (xp >= 1000) return { id: 'mid', name: 'Mid-Level' };
  return { id: 'junior', name: 'Junior' };
}

function getMaxAmount(tier, vipLevel) {
  const baseAmounts = {
    'junior': 50.00,
    'mid': 100.00,
    'senior': 250.00,
    'expert': 500.00
  };

  const vipMultipliers = {
    'free': 1.0,
    'bronze': 1.5,
    'gold': 2.0,
    'platinum': 3.0
  };

  return baseAmounts[tier.id] * vipMultipliers[vipLevel];
}

function getDailyLimit(tier, vipLevel) {
  const baseLimits = {
    'junior': 2,
    'mid': 3,
    'senior': 5,
    'expert': 10
  };

  const vipMultipliers = {
    'free': 1.0,
    'bronze': 1.5,
    'gold': 2.0,
    'platinum': 3.0
  };

  return Math.round(baseLimits[tier.id] * vipMultipliers[vipLevel]);
}

function getMonthlyLimit(tier, vipLevel) {
  const baseLimits = {
    'junior': 10,
    'mid': 20,
    'senior': 50,
    'expert': 100
  };

  const vipMultipliers = {
    'free': 1.0,
    'bronze': 1.5,
    'gold': 2.0,
    'platinum': 3.0
  };

  return Math.round(baseLimits[tier.id] * vipMultipliers[vipLevel]);
}

module.exports = router;


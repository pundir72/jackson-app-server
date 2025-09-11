const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Spin wheel configuration
const SPIN_CONFIG = {
  minReward: 10,
  maxReward: 100,
  dailyLimit: 3,
  vipMultiplier: {
    bronze: 1.2,
    gold: 1.5,
    platinum: 2.0
  }
};

// Get spin status and available spins
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('wallet xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get today's spin count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySpins = await Transaction.countDocuments({
      user: req.user.userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i },
      createdAt: { $gte: today }
    });

    // Check VIP benefits
    const vipBenefits = await getUserVIPBenefits(req.user.userId);
    const dailyLimit = vipBenefits.unlimitedSpins ? 999 : SPIN_CONFIG.dailyLimit;
    const remainingSpins = Math.max(0, dailyLimit - todaySpins);

    res.json({
      success: true,
      data: {
        canSpin: remainingSpins > 0,
        remainingSpins,
        dailyLimit,
        vipMultiplier: vipBenefits.xpMultiplier || 1.0,
        isVIP: vipBenefits.isActive,
        lastSpinTime: await getLastSpinTime(req.user.userId)
      }
    });
  } catch (error) {
    console.error('Error getting spin status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get spin status'
    });
  }
});

// Perform spin action
router.post('/spin', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('wallet xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user can spin
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySpins = await Transaction.countDocuments({
      user: req.user.userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i },
      createdAt: { $gte: today }
    });

    const vipBenefits = await getUserVIPBenefits(req.user.userId);
    const dailyLimit = vipBenefits.unlimitedSpins ? 999 : SPIN_CONFIG.dailyLimit;
    
    if (todaySpins >= dailyLimit) {
      return res.status(400).json({
        success: false,
        error: 'Daily spin limit reached',
        data: {
          remainingSpins: 0,
          dailyLimit
        }
      });
    }

    // Calculate spin reward
    const baseReward = Math.floor(Math.random() * (SPIN_CONFIG.maxReward - SPIN_CONFIG.minReward + 1)) + SPIN_CONFIG.minReward;
    const vipMultiplier = vipBenefits.xpMultiplier || 1.0;
    const finalReward = Math.floor(baseReward * vipMultiplier);

    // Store pending reward (not credited until ad is watched)
    const spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    
    // Create pending transaction
    const pendingTransaction = new Transaction({
      user: req.user.userId,
      type: 'credit',
      amount: finalReward,
      description: `Spin reward (pending) - ${finalReward} coins`,
      status: 'pending',
      referenceId: spinId
    });

    await pendingTransaction.save();

    res.json({
      success: true,
      data: {
        spinId,
        reward: finalReward,
        baseReward,
        vipMultiplier,
        isVIP: vipBenefits.isActive,
        status: 'pending',
        message: 'Watch video ad to claim your reward!'
      }
    });
  } catch (error) {
    console.error('Error performing spin:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform spin'
    });
  }
});

// Redeem spin reward after watching ad
router.post('/redeem', protect, async (req, res) => {
  try {
    const { spinId } = req.body;
    
    if (!spinId) {
      return res.status(400).json({
        success: false,
        error: 'Spin ID is required'
      });
    }

    // Find pending transaction
    const transaction = await Transaction.findOne({
      user: req.user.userId,
      referenceId: spinId,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired spin reward'
      });
    }

    // Update user wallet
    const user = await User.findById(req.user.userId);
    user.wallet.balance += transaction.amount;
    user.wallet.lastUpdated = new Date();
    
    // Update XP
    const xpEarned = Math.floor(transaction.amount * 0.5); // 0.5 XP per coin
    user.xp.current += xpEarned;
    user.xp.total += xpEarned;

    // Update transaction status
    transaction.status = 'completed';
    transaction.description = `Spin reward - ${transaction.amount} coins`;

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        reward: transaction.amount,
        xpEarned,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        message: 'Reward claimed successfully!'
      }
    });
  } catch (error) {
    console.error('Error redeeming spin reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to redeem reward'
    });
  }
});

// Get spin history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const spins = await Transaction.find({
      user: req.user.userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i }
    })
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({
      user: req.user.userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i }
    });

    res.json({
      success: true,
      data: {
        spins: spins.map(spin => ({
          id: spin.referenceId,
          amount: spin.amount,
          status: spin.status,
          createdAt: spin.createdAt,
          description: spin.description
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting spin history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get spin history'
    });
  }
});

// Helper function to get VIP benefits
async function getUserVIPBenefits(userId) {
  try {
    const VIPTier = require('../models/VIPTier');
    const VIPSubscription = require('../models/VIPSubscription');
    
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!activeSubscription || !activeSubscription.isActive()) {
      return {
        isActive: false,
        xpMultiplier: 1.0,
        unlimitedSpins: false
      };
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    if (!tier) {
      return {
        isActive: false,
        xpMultiplier: 1.0,
        unlimitedSpins: false
      };
    }

    return {
      isActive: true,
      xpMultiplier: tier.features.xpMultiplier || 1.0,
      unlimitedSpins: tier.features.unlimitedSpins || false
    };
  } catch (error) {
    console.error('Error getting VIP benefits:', error);
    return {
      isActive: false,
      xpMultiplier: 1.0,
      unlimitedSpins: false
    };
  }
}

// Helper function to get last spin time
async function getLastSpinTime(userId) {
  try {
    const lastSpin = await Transaction.findOne({
      user: userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i }
    }).sort({ createdAt: -1 });

    return lastSpin ? lastSpin.createdAt : null;
  } catch (error) {
    return null;
  }
}

module.exports = router;


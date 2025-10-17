const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Get complete wallet screen data
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('wallet xp vip profile');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get recent transactions
    const recentTransactions = await Transaction.find({
      user: req.user.userId
    })
    .sort({ createdAt: -1 })
    .limit(5);

    // Get highest earning games (mock data - in real app, this would come from game analytics)
    const highestEarningGames = await getHighestEarningGames(req.user.userId);

    // Get VIP benefits
    const vipBenefits = await getUserVIPBenefits(req.user.userId);

    // Get spin status
    const spinStatus = await getSpinStatus(req.user.userId);

    // Get conversion rates
    const conversionRates = {
      USD: 0.01,
      INR: 0.83,
      EUR: 0.009
    };

    // Get withdrawal eligibility
    const withdrawalEligibility = await getWithdrawalEligibility(user);

    res.json({
      success: true,
      data: {
        // Header data
        user: {
          firstName: user.firstName || 'there',
          avatar: user.profile?.avatar || 'default-avatar.png'
        },
        
        // Wallet balance
        wallet: {
          balance: user.wallet.balance || 0,
          currency: user.wallet.currency || 'coins',
          lastUpdated: user.wallet.lastUpdated
        },
        
        // XP data
        xp: {
          current: user.xp.current || 0,
          level: user.xp.level || 1,
          tier: user.xp.tier || 1,
          streak: user.streak?.current || 0
        },
        
        // Recent transactions
        recentTransactions: recentTransactions.map(tx => ({
          id: tx.referenceId,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          status: tx.status,
          createdAt: tx.createdAt
        })),
        
        // Highest earning games
        highestEarningGames,
        
        // Spin status
        spin: {
          canSpin: spinStatus.canSpin,
          remainingSpins: spinStatus.remainingSpins,
          dailyLimit: spinStatus.dailyLimit,
          isVIP: spinStatus.isVIP
        },
        
        // Conversion rates
        conversionRates,
        
        // Withdrawal eligibility
        withdrawal: {
          isEligible: withdrawalEligibility.isEligible,
          minRequired: withdrawalEligibility.minRequired,
          currentBalance: withdrawalEligibility.currentBalance
        },
        
        // VIP status
        vip: {
          level: vipBenefits.tier,
          isActive: vipBenefits.isActive,
          benefits: vipBenefits.benefits,
          features: vipBenefits.features
        }
      }
    });
  } catch (error) {
    console.error('Error getting wallet screen data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get wallet screen data'
    });
  }
});

// Get transaction history with filters
router.get('/transactions', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    
    const filter = { user: req.user.userId };
    
    if (type) {
      filter.type = type;
    }
    
    if (status) {
      filter.status = status;
    }

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(filter);

    res.json({
      success: true,
      data: {
        transactions: transactions.map(tx => ({
          id: tx.referenceId,
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
          status: tx.status,
          createdAt: tx.createdAt
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
    console.error('Error getting transaction history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction history'
    });
  }
});

// Get earning statistics
router.get('/stats', protect, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    const user = await User.findById(req.user.userId).select('wallet xp');
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get earnings from transactions
    const earnings = await Transaction.find({
      user: req.user.userId,
      type: 'credit',
      createdAt: { $gte: startDate, $lte: endDate }
    });

    const totalEarnings = earnings.reduce((sum, tx) => sum + tx.amount, 0);
    
    // Get earnings by source
    const earningsBySource = {};
    earnings.forEach(tx => {
      const source = getTransactionSource(tx.description);
      earningsBySource[source] = (earningsBySource[source] || 0) + tx.amount;
    });

    res.json({
      success: true,
      data: {
        period,
        totalEarnings,
        earningsBySource,
        transactionCount: earnings.length,
        averageEarning: earnings.length > 0 ? totalEarnings / earnings.length : 0,
        currentBalance: user.wallet.balance || 0,
        currentXP: user.xp.current || 0
      }
    });
  } catch (error) {
    console.error('Error getting earning stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get earning statistics'
    });
  }
});

// Helper functions
async function getHighestEarningGames(userId) {
  // Mock data - in real app, this would come from game analytics
  return [
    {
      id: 'game1',
      name: 'Puzzle Master',
      icon: '🧩',
      earnings: 150,
      difficulty: 'Easy',
      timeRequired: '5 min'
    },
    {
      id: 'game2',
      name: 'Word Challenge',
      icon: '📝',
      earnings: 200,
      difficulty: 'Medium',
      timeRequired: '10 min'
    },
    {
      id: 'game3',
      name: 'Memory Game',
      icon: '🧠',
      earnings: 300,
      difficulty: 'Hard',
      timeRequired: '15 min'
    }
  ];
}

async function getUserVIPBenefits(userId) {
  try {
    const VIPTier = require('../models/VIPTier');
    const VIPSubscription = require('../models/VIPSubscription');
    
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!activeSubscription || !activeSubscription.isActive()) {
      return {
        tier: 'free',
        isActive: false,
        benefits: [],
        features: {
          noAds: false,
          xpMultiplier: 1.0,
          weeklyXpBonus: 0,
          bonusSpins: 0,
          prioritySupport: false,
          earlyAccess: false,
          unlimitedSpins: false
        }
      };
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    if (!tier) {
      return {
        tier: 'free',
        isActive: false,
        benefits: [],
        features: {
          noAds: false,
          xpMultiplier: 1.0,
          weeklyXpBonus: 0,
          bonusSpins: 0,
          prioritySupport: false,
          earlyAccess: false,
          unlimitedSpins: false
        }
      };
    }

    return {
      tier: activeSubscription.tier,
      isActive: true,
      benefits: tier.benefits || [],
      features: tier.features
    };
  } catch (error) {
    console.error('Error getting VIP benefits:', error);
    return {
      tier: 'free',
      isActive: false,
      benefits: [],
      features: {
        noAds: false,
        xpMultiplier: 1.0,
        weeklyXpBonus: 0,
        bonusSpins: 0,
        prioritySupport: false,
        earlyAccess: false,
        unlimitedSpins: false
      }
    };
  }
}

async function getSpinStatus(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaySpins = await Transaction.countDocuments({
      user: userId,
      type: 'credit',
      description: { $regex: /Spin.*reward/i },
      createdAt: { $gte: today }
    });

    const vipBenefits = await getUserVIPBenefits(userId);
    const dailyLimit = vipBenefits.features?.unlimitedSpins ? 999 : 3;
    const remainingSpins = Math.max(0, dailyLimit - todaySpins);

    return {
      canSpin: remainingSpins > 0,
      remainingSpins,
      dailyLimit,
      isVIP: vipBenefits.isActive
    };
  } catch (error) {
    console.error('Error getting spin status:', error);
    return {
      canSpin: false,
      remainingSpins: 0,
      dailyLimit: 3,
      isVIP: false
    };
  }
}

async function getWithdrawalEligibility(user) {
  const minRequired = 20; // $20
  const conversionRate = 0.01; // 1 coin = $0.01
  const coinBalance = user.wallet.balance || 0;
  const usdBalance = coinBalance * conversionRate;
  
  return {
    isEligible: usdBalance >= minRequired,
    currentBalance: usdBalance.toFixed(2),
    minRequired,
    shortfall: usdBalance < minRequired ? (minRequired - usdBalance).toFixed(2) : 0
  };
}

function getTransactionSource(description) {
  if (description.includes('Spin')) return 'Spin & Win';
  if (description.includes('Game')) return 'Games';
  if (description.includes('Survey')) return 'Surveys';
  if (description.includes('Referral')) return 'Referrals';
  if (description.includes('Receipt')) return 'Receipts';
  if (description.includes('Daily')) return 'Daily Rewards';
  return 'Other';
}

module.exports = router;



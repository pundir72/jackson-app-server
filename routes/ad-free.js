const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const adFreeSystem = require('../utils/adFreeSystem');

// Use pricing from ad-free system
const AD_FREE_PRICING = adFreeSystem.getAdFreePricing();

/**
 * GET /api/ad-free/status
 * Get user's current ad-free status
 */
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('adFreeUntil adFreePurchases adFreeStats vip');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Use separate ad-free system
    const adFreeStatus = await adFreeSystem.getAdFreeStatus(user._id);
    
    // Check VIP status for comparison
    const vipBenefits = await getUserVIPBenefits(user._id);
    
    res.json({
      success: true,
      data: {
        isAdFree: adFreeStatus.hasTemporaryAdFree,
        adFreeUntil: adFreeStatus.adFreeUntil,
        timeRemaining: adFreeStatus.timeRemaining,
        timeRemainingHours: adFreeStatus.timeRemainingHours,
        timeRemainingMinutes: adFreeStatus.timeRemainingMinutes,
        stats: adFreeStatus.stats,
        recentPurchases: adFreeStatus.recentPurchases,
        vipStatus: {
          hasVIP: vipBenefits.isActive,
          vipNoAds: vipBenefits.noAds
        },
        pricing: AD_FREE_PRICING
      }
    });
  } catch (error) {
    console.error('Error getting ad-free status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ad-free status'
    });
  }
});

/**
 * POST /api/ad-free/purchase
 * Purchase ad-free time with coins or XP
 */
router.post('/purchase', protect, async (req, res) => {
  try {
    const { duration, paymentMethod } = req.body;
    
    // Validate duration
    if (!duration || !AD_FREE_PRICING[duration]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid duration. Available: 1, 6, 12, 24, 72, 168 hours'
      });
    }
    
    // Validate payment method
    if (!paymentMethod || !['coins', 'xp', 'mixed'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method. Use: coins, xp, or mixed'
      });
    }
    
    const user = await User.findById(req.user.userId)
      .select('wallet xp adFreeUntil adFreePurchases adFreeStats vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user already has VIP (no need to purchase ad-free)
    const vipBenefits = await getUserVIPBenefits(user._id);
    if (vipBenefits.noAds) {
      return res.status(400).json({
        success: false,
        error: 'You already have VIP membership with ad-free benefits'
      });
    }
    
    const pricing = AD_FREE_PRICING[duration];
    let cost = { coins: 0, xp: 0 };
    let actualPaymentMethod = paymentMethod;
    
    // Calculate cost based on payment method
    if (paymentMethod === 'coins') {
      cost.coins = pricing.coins;
      if (user.wallet.balance < cost.coins) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins',
          data: {
            required: cost.coins,
            available: user.wallet.balance,
            shortfall: cost.coins - user.wallet.balance
          }
        });
      }
    } else if (paymentMethod === 'xp') {
      cost.xp = pricing.xp;
      if (user.xp.current < cost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient XP',
          data: {
            required: cost.xp,
            available: user.xp.current,
            shortfall: cost.xp - user.xp.current
          }
        });
      }
    } else if (paymentMethod === 'mixed') {
      // Allow mixed payment: 70% coins, 30% XP
      cost.coins = Math.floor(pricing.coins * 0.7);
      cost.xp = Math.floor(pricing.xp * 0.3);
      
      if (user.wallet.balance < cost.coins || user.xp.current < cost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins or XP for mixed payment',
          data: {
            required: cost,
            available: {
              coins: user.wallet.balance,
              xp: user.xp.current
            }
          }
        });
      }
    }
    
    // Deduct payment
    if (cost.coins > 0) {
      user.wallet.balance -= cost.coins;
      user.wallet.lastUpdated = new Date();
    }
    
    if (cost.xp > 0) {
      user.xp.current -= cost.xp;
      // Don't reduce total XP, just current
    }
    
    // Purchase ad-free time
    const purchase = user.purchaseAdFree(duration, cost, actualPaymentMethod);
    
    // Create transaction records
    const transactions = [];
    
    if (cost.coins > 0) {
      const coinTransaction = new Transaction({
        user: user._id,
        type: 'debit',
        amount: cost.coins,
        description: `Ad-free purchase (${duration}h) - ${cost.coins} coins`,
        status: 'completed',
        referenceId: `ADFREE-${Date.now()}-COINS`
      });
      transactions.push(coinTransaction);
    }
    
    if (cost.xp > 0) {
      const xpTransaction = new Transaction({
        user: user._id,
        type: 'debit',
        amount: cost.xp,
        description: `Ad-free purchase (${duration}h) - ${cost.xp} XP`,
        status: 'completed',
        referenceId: `ADFREE-${Date.now()}-XP`
      });
      transactions.push(xpTransaction);
    }
    
    // Save user and transactions
    await Promise.all([
      user.save(),
      ...transactions.map(t => t.save())
    ]);
    
    res.json({
      success: true,
      data: {
        purchase: {
          duration: duration,
          cost: cost,
          paymentMethod: actualPaymentMethod,
          expiresAt: purchase.expiresAt,
          purchaseDate: purchase.purchaseDate
        },
        newBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current
        },
        adFreeStatus: {
          isAdFree: user.isAdFree(),
          adFreeUntil: user.adFreeUntil,
          timeRemaining: user.getAdFreeTimeRemaining()
        },
        message: `Ad-free time purchased successfully! You're ad-free for ${duration} hours.`
      }
    });
  } catch (error) {
    console.error('Error purchasing ad-free time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to purchase ad-free time'
    });
  }
});

/**
 * GET /api/ad-free/pricing
 * Get available ad-free pricing options
 */
router.get('/pricing', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('wallet xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check VIP status
    const vipBenefits = await getUserVIPBenefits(user._id);
    
    const pricing = Object.entries(AD_FREE_PRICING).map(([duration, cost]) => {
      const durationHours = parseInt(duration);
      const canAffordCoins = user.wallet.balance >= cost.coins;
      const canAffordXP = user.xp.current >= cost.xp;
      const canAffordMixed = user.wallet.balance >= Math.floor(cost.coins * 0.7) && 
                            user.xp.current >= Math.floor(cost.xp * 0.3);
      
      return {
        duration: durationHours,
        durationText: getDurationText(durationHours),
        cost: cost,
        canAfford: {
          coins: canAffordCoins,
          xp: canAffordXP,
          mixed: canAffordMixed
        },
        available: !vipBenefits.noAds // Not available if user has VIP
      };
    });
    
    res.json({
      success: true,
      data: {
        pricing: pricing,
        userBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current
        },
        vipStatus: {
          hasVIP: vipBenefits.isActive,
          vipNoAds: vipBenefits.noAds
        }
      }
    });
  } catch (error) {
    console.error('Error getting ad-free pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ad-free pricing'
    });
  }
});

/**
 * GET /api/ad-free/history
 * Get user's ad-free purchase history
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const user = await User.findById(req.user.userId)
      .select('adFreePurchases adFreeStats');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const purchases = user.adFreePurchases
      .sort((a, b) => b.purchaseDate - a.purchaseDate)
      .slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      data: {
        purchases: purchases,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: user.adFreePurchases.length,
          pages: Math.ceil(user.adFreePurchases.length / limit)
        },
        stats: user.adFreeStats || {
          totalPurchases: 0,
          totalCoinsSpent: 0,
          totalXPSpent: 0,
          totalHoursPurchased: 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting ad-free history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ad-free history'
    });
  }
});

/**
 * POST /api/ad-free/extend
 * Extend existing ad-free time
 */
router.post('/extend', protect, async (req, res) => {
  try {
    const { duration, paymentMethod } = req.body;
    
    // Validate duration
    if (!duration || !AD_FREE_PRICING[duration]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid duration. Available: 1, 6, 12, 24, 72, 168 hours'
      });
    }
    
    const user = await User.findById(req.user.userId)
      .select('wallet xp adFreeUntil adFreePurchases adFreeStats vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check if user already has VIP
    const vipBenefits = await getUserVIPBenefits(user._id);
    if (vipBenefits.noAds) {
      return res.status(400).json({
        success: false,
        error: 'You already have VIP membership with ad-free benefits'
      });
    }
    
    const pricing = AD_FREE_PRICING[duration];
    let cost = { coins: 0, xp: 0 };
    
    // Calculate cost based on payment method
    if (paymentMethod === 'coins') {
      cost.coins = pricing.coins;
      if (user.wallet.balance < cost.coins) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins'
        });
      }
    } else if (paymentMethod === 'xp') {
      cost.xp = pricing.xp;
      if (user.xp.current < cost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient XP'
        });
      }
    } else if (paymentMethod === 'mixed') {
      cost.coins = Math.floor(pricing.coins * 0.7);
      cost.xp = Math.floor(pricing.xp * 0.3);
      
      if (user.wallet.balance < cost.coins || user.xp.current < cost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins or XP for mixed payment'
        });
      }
    }
    
    // Deduct payment
    if (cost.coins > 0) {
      user.wallet.balance -= cost.coins;
      user.wallet.lastUpdated = new Date();
    }
    
    if (cost.xp > 0) {
      user.xp.current -= cost.xp;
    }
    
    // Extend ad-free time
    const purchase = user.purchaseAdFree(duration, cost, paymentMethod);
    
    // Create transaction records
    const transactions = [];
    
    if (cost.coins > 0) {
      const coinTransaction = new Transaction({
        user: user._id,
        type: 'debit',
        amount: cost.coins,
        description: `Ad-free extension (${duration}h) - ${cost.coins} coins`,
        status: 'completed',
        referenceId: `ADFREE-EXTEND-${Date.now()}-COINS`
      });
      transactions.push(coinTransaction);
    }
    
    if (cost.xp > 0) {
      const xpTransaction = new Transaction({
        user: user._id,
        type: 'debit',
        amount: cost.xp,
        description: `Ad-free extension (${duration}h) - ${cost.xp} XP`,
        status: 'completed',
        referenceId: `ADFREE-EXTEND-${Date.now()}-XP`
      });
      transactions.push(xpTransaction);
    }
    
    // Save user and transactions
    await Promise.all([
      user.save(),
      ...transactions.map(t => t.save())
    ]);
    
    res.json({
      success: true,
      data: {
        extension: {
          duration: duration,
          cost: cost,
          paymentMethod: paymentMethod,
          newExpiresAt: purchase.expiresAt,
          purchaseDate: purchase.purchaseDate
        },
        newBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current
        },
        adFreeStatus: {
          isAdFree: user.isAdFree(),
          adFreeUntil: user.adFreeUntil,
          timeRemaining: user.getAdFreeTimeRemaining()
        },
        message: `Ad-free time extended by ${duration} hours!`
      }
    });
  } catch (error) {
    console.error('Error extending ad-free time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend ad-free time'
    });
  }
});

// Helper functions
async function getUserVIPBenefits(userId) {
  try {
    const { getUserVIPBenefits } = require('../utils/vipBenefits');
    return await getUserVIPBenefits(userId);
  } catch (error) {
    console.error('Error getting VIP benefits:', error);
    return {
      isActive: false,
      noAds: false
    };
  }
}

function getDurationText(hours) {
  if (hours === 1) return '1 hour';
  if (hours === 6) return '6 hours';
  if (hours === 12) return '12 hours';
  if (hours === 24) return '1 day';
  if (hours === 72) return '3 days';
  if (hours === 168) return '1 week';
  return `${hours} hours`;
}

module.exports = router;

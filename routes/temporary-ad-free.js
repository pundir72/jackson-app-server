const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const adFreeSystem = require('../utils/adFreeSystem');

/**
 * GET /api/temporary-ad-free/status
 * Get user's current temporary ad-free status (separate from VIP)
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
    const { getUserVIPBenefits } = require('../utils/vipBenefits');
    const vipBenefits = await getUserVIPBenefits(user._id);
    
    res.json({
      success: true,
      data: {
        // Temporary ad-free status (separate from VIP)
        isTemporaryAdFree: adFreeStatus.hasTemporaryAdFree,
        adFreeUntil: adFreeStatus.adFreeUntil,
        timeRemaining: adFreeStatus.timeRemaining,
        timeRemainingHours: adFreeStatus.timeRemainingHours,
        timeRemainingMinutes: adFreeStatus.timeRemainingMinutes,
        stats: adFreeStatus.stats,
        recentPurchases: adFreeStatus.recentPurchases,
        
        // VIP status (for comparison)
        vipStatus: {
          hasVIP: vipBenefits.isActive,
          vipNoAds: vipBenefits.noAds
        },
        
        // Pricing options
        pricing: adFreeSystem.getAdFreePricing()
      }
    });
  } catch (error) {
    console.error('Error getting temporary ad-free status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get temporary ad-free status'
    });
  }
});

/**
 * POST /api/temporary-ad-free/purchase
 * Purchase temporary ad-free time with coins or XP (separate from VIP)
 */
router.post('/purchase', protect, async (req, res) => {
  try {
    const { duration, paymentMethod } = req.body;
    
    // Validate duration
    const pricing = adFreeSystem.getAdFreePricing();
    if (!duration || !pricing[duration]) {
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
    
    // Check if user already has VIP (no need to purchase temporary ad-free)
    const { getUserVIPBenefits } = require('../utils/vipBenefits');
    const vipBenefits = await getUserVIPBenefits(user._id);
    if (vipBenefits.noAds) {
      return res.status(400).json({
        success: false,
        error: 'You already have VIP membership with ad-free benefits'
      });
    }
    
    const cost = pricing[duration];
    let actualCost = { coins: 0, xp: 0 };
    
    // Calculate cost based on payment method
    if (paymentMethod === 'coins') {
      actualCost.coins = cost.coins;
      if (user.wallet.balance < actualCost.coins) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins',
          data: {
            required: actualCost.coins,
            available: user.wallet.balance,
            shortfall: actualCost.coins - user.wallet.balance
          }
        });
      }
    } else if (paymentMethod === 'xp') {
      actualCost.xp = cost.xp;
      if (user.xp.current < actualCost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient XP',
          data: {
            required: actualCost.xp,
            available: user.xp.current,
            shortfall: actualCost.xp - user.xp.current
          }
        });
      }
    } else if (paymentMethod === 'mixed') {
      // Allow mixed payment: 70% coins, 30% XP
      actualCost.coins = Math.floor(cost.coins * 0.7);
      actualCost.xp = Math.floor(cost.xp * 0.3);
      
      if (user.wallet.balance < actualCost.coins || user.xp.current < actualCost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins or XP for mixed payment',
          data: {
            required: actualCost,
            available: {
              coins: user.wallet.balance,
              xp: user.xp.current
            }
          }
        });
      }
    }
    
    // Use separate ad-free system for purchase
    try {
      const purchaseResult = await adFreeSystem.purchaseAdFreeTime(
        user._id,
        duration,
        actualCost,
        paymentMethod
      );
      
      // Create transaction records
      const transactions = [];
      
      if (actualCost.coins > 0) {
        const coinTransaction = new Transaction({
          user: user._id,
          type: 'debit',
          amount: actualCost.coins,
          description: `Temporary ad-free purchase (${duration}h) - ${actualCost.coins} coins`,
          status: 'completed',
          referenceId: `TEMP-ADFREE-${Date.now()}-COINS`
        });
        transactions.push(coinTransaction);
      }
      
      if (actualCost.xp > 0) {
        const xpTransaction = new Transaction({
          user: user._id,
          type: 'debit',
          amount: actualCost.xp,
          description: `Temporary ad-free purchase (${duration}h) - ${actualCost.xp} XP`,
          status: 'completed',
          referenceId: `TEMP-ADFREE-${Date.now()}-XP`
        });
        transactions.push(xpTransaction);
      }
      
      // Save transactions
      await Promise.all(transactions.map(t => t.save()));
      
      res.json({
        success: true,
        data: {
          purchase: {
            duration: duration,
            cost: actualCost,
            paymentMethod: paymentMethod,
            expiresAt: purchaseResult.purchase.expiresAt,
            purchaseDate: purchaseResult.purchase.purchaseDate
          },
          newBalance: purchaseResult.newBalance,
          adFreeStatus: purchaseResult.adFreeStatus,
          message: `Temporary ad-free time purchased successfully! You're ad-free for ${duration} hours.`
        }
      });
    } catch (purchaseError) {
      return res.status(400).json({
        success: false,
        error: purchaseError.message
      });
    }
  } catch (error) {
    console.error('Error purchasing temporary ad-free time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to purchase temporary ad-free time'
    });
  }
});

/**
 * GET /api/temporary-ad-free/pricing
 * Get available temporary ad-free pricing options
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
    const { getUserVIPBenefits } = require('../utils/vipBenefits');
    const vipBenefits = await getUserVIPBenefits(user._id);
    
    const pricing = adFreeSystem.getAdFreePricing();
    const pricingOptions = Object.entries(pricing).map(([duration, cost]) => {
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
        pricing: pricingOptions,
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
    console.error('Error getting temporary ad-free pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get temporary ad-free pricing'
    });
  }
});

/**
 * GET /api/temporary-ad-free/history
 * Get user's temporary ad-free purchase history
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
    console.error('Error getting temporary ad-free history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get temporary ad-free history'
    });
  }
});

/**
 * POST /api/temporary-ad-free/extend
 * Extend existing temporary ad-free time
 */
router.post('/extend', protect, async (req, res) => {
  try {
    const { duration, paymentMethod } = req.body;
    
    // Validate duration
    const pricing = adFreeSystem.getAdFreePricing();
    if (!duration || !pricing[duration]) {
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
    const { getUserVIPBenefits } = require('../utils/vipBenefits');
    const vipBenefits = await getUserVIPBenefits(user._id);
    if (vipBenefits.noAds) {
      return res.status(400).json({
        success: false,
        error: 'You already have VIP membership with ad-free benefits'
      });
    }
    
    const cost = pricing[duration];
    let actualCost = { coins: 0, xp: 0 };
    
    // Calculate cost based on payment method
    if (paymentMethod === 'coins') {
      actualCost.coins = cost.coins;
      if (user.wallet.balance < actualCost.coins) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins'
        });
      }
    } else if (paymentMethod === 'xp') {
      actualCost.xp = cost.xp;
      if (user.xp.current < actualCost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient XP'
        });
      }
    } else if (paymentMethod === 'mixed') {
      actualCost.coins = Math.floor(cost.coins * 0.7);
      actualCost.xp = Math.floor(cost.xp * 0.3);
      
      if (user.wallet.balance < actualCost.coins || user.xp.current < actualCost.xp) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient coins or XP for mixed payment'
        });
      }
    }
    
    // Use separate ad-free system for extension
    try {
      const purchaseResult = await adFreeSystem.purchaseAdFreeTime(
        user._id,
        duration,
        actualCost,
        paymentMethod
      );
      
      // Create transaction records
      const transactions = [];
      
      if (actualCost.coins > 0) {
        const coinTransaction = new Transaction({
          user: user._id,
          type: 'debit',
          amount: actualCost.coins,
          description: `Temporary ad-free extension (${duration}h) - ${actualCost.coins} coins`,
          status: 'completed',
          referenceId: `TEMP-ADFREE-EXTEND-${Date.now()}-COINS`
        });
        transactions.push(coinTransaction);
      }
      
      if (actualCost.xp > 0) {
        const xpTransaction = new Transaction({
          user: user._id,
          type: 'debit',
          amount: actualCost.xp,
          description: `Temporary ad-free extension (${duration}h) - ${actualCost.xp} XP`,
          status: 'completed',
          referenceId: `TEMP-ADFREE-EXTEND-${Date.now()}-XP`
        });
        transactions.push(xpTransaction);
      }
      
      // Save transactions
      await Promise.all(transactions.map(t => t.save()));
      
      res.json({
        success: true,
        data: {
          extension: {
            duration: duration,
            cost: actualCost,
            paymentMethod: paymentMethod,
            newExpiresAt: purchaseResult.purchase.expiresAt,
            purchaseDate: purchaseResult.purchase.purchaseDate
          },
          newBalance: purchaseResult.newBalance,
          adFreeStatus: purchaseResult.adFreeStatus,
          message: `Temporary ad-free time extended by ${duration} hours!`
        }
      });
    } catch (purchaseError) {
      return res.status(400).json({
        success: false,
        error: purchaseError.message
      });
    }
  } catch (error) {
    console.error('Error extending temporary ad-free time:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extend temporary ad-free time'
    });
  }
});

// Helper functions
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


const User = require('../models/User');

/**
 * Separate Ad-Free System using Coins/XP
 * This is completely independent of VIP subscription system
 */

/**
 * Check if user has temporary ad-free time (separate from VIP)
 * @param {string} userId - User ID
 * @returns {boolean} True if user has temporary ad-free time
 */
const hasTemporaryAdFree = async (userId) => {
  try {
    const user = await User.findById(userId).select('adFreeUntil');
    
    if (!user) {
      return false;
    }
    
    return user.isAdFree && user.isAdFree();
  } catch (error) {
    console.error('Error checking temporary ad-free status:', error);
    return false;
  }
};

/**
 * Check if user should see ads (combines VIP + temporary ad-free)
 * @param {string} userId - User ID
 * @returns {boolean} True if user should see ads
 */
const shouldShowAds = async (userId) => {
  try {
    // First check VIP status
    const { getUserVIPBenefits } = require('./vipBenefits');
    const vipBenefits = await getUserVIPBenefits(userId);
    
    // If user has VIP with no ads, don't show ads
    if (vipBenefits.noAds) {
      return false;
    }
    
    // If user has temporary ad-free time, don't show ads
    const hasTemporary = await hasTemporaryAdFree(userId);
    if (hasTemporary) {
      return false;
    }
    
    // Show ads by default
    return true;
  } catch (error) {
    console.error('Error checking ad display:', error);
    return true; // Show ads by default
  }
};

/**
 * Get user's ad-free status (separate from VIP)
 * @param {string} userId - User ID
 * @returns {Object} Ad-free status information
 */
const getAdFreeStatus = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('adFreeUntil adFreePurchases adFreeStats');
    
    if (!user) {
      return {
        hasTemporaryAdFree: false,
        adFreeUntil: null,
        timeRemaining: 0,
        stats: {
          totalPurchases: 0,
          totalCoinsSpent: 0,
          totalXPSpent: 0,
          totalHoursPurchased: 0
        }
      };
    }
    
    const isAdFree = user.isAdFree && user.isAdFree();
    const timeRemaining = user.getAdFreeTimeRemaining ? user.getAdFreeTimeRemaining() : 0;
    
    return {
      hasTemporaryAdFree: isAdFree,
      adFreeUntil: user.adFreeUntil,
      timeRemaining: timeRemaining,
      timeRemainingHours: Math.floor(timeRemaining / (1000 * 60 * 60)),
      timeRemainingMinutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)),
      stats: user.adFreeStats || {
        totalPurchases: 0,
        totalCoinsSpent: 0,
        totalXPSpent: 0,
        totalHoursPurchased: 0
      },
      recentPurchases: user.adFreePurchases
        ?.filter(p => p.isActive)
        ?.sort((a, b) => b.purchaseDate - a.purchaseDate)
        ?.slice(0, 5) || []
    };
  } catch (error) {
    console.error('Error getting ad-free status:', error);
    return {
      hasTemporaryAdFree: false,
      adFreeUntil: null,
      timeRemaining: 0,
      stats: {
        totalPurchases: 0,
        totalCoinsSpent: 0,
        totalXPSpent: 0,
        totalHoursPurchased: 0
      }
    };
  }
};

/**
 * Purchase temporary ad-free time
 * @param {string} userId - User ID
 * @param {number} duration - Duration in hours
 * @param {Object} cost - Cost object with coins and xp
 * @param {string} paymentMethod - Payment method
 * @returns {Object} Purchase result
 */
const purchaseAdFreeTime = async (userId, duration, cost, paymentMethod) => {
  try {
    const user = await User.findById(userId)
      .select('wallet xp adFreeUntil adFreePurchases adFreeStats');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Check if user already has VIP (prevent double ad-free)
    const { getUserVIPBenefits } = require('./vipBenefits');
    const vipBenefits = await getUserVIPBenefits(userId);
    if (vipBenefits.noAds) {
      throw new Error('You already have VIP membership with ad-free benefits');
    }
    
    // Validate payment
    if (cost.coins > 0 && user.wallet.balance < cost.coins) {
      throw new Error('Insufficient coins');
    }
    
    if (cost.xp > 0 && user.xp.current < cost.xp) {
      throw new Error('Insufficient XP');
    }
    
    // Deduct payment
    if (cost.coins > 0) {
      user.wallet.balance -= cost.coins;
      user.wallet.lastUpdated = new Date();
    }
    
    if (cost.xp > 0) {
      user.xp.current -= cost.xp;
    }
    
    // Purchase ad-free time
    const purchase = user.purchaseAdFree(duration, cost, paymentMethod);
    
    await user.save();
    
    return {
      success: true,
      purchase: purchase,
      newBalance: {
        coins: user.wallet.balance,
        xp: user.xp.current
      },
      adFreeStatus: {
        isAdFree: user.isAdFree(),
        adFreeUntil: user.adFreeUntil,
        timeRemaining: user.getAdFreeTimeRemaining()
      }
    };
  } catch (error) {
    console.error('Error purchasing ad-free time:', error);
    throw error;
  }
};

/**
 * Get ad-free pricing options
 * @returns {Object} Pricing configuration
 */
const getAdFreePricing = () => {
  return {
    1: { coins: 100, xp: 50 },      // 1 hour
    6: { coins: 500, xp: 200 },     // 6 hours  
    12: { coins: 900, xp: 350 },    // 12 hours
    24: { coins: 1500, xp: 500 },   // 24 hours
    72: { coins: 4000, xp: 1200 },  // 3 days
    168: { coins: 8000, xp: 2000 }  // 7 days
  };
};

/**
 * Check if user can afford ad-free purchase
 * @param {string} userId - User ID
 * @param {number} duration - Duration in hours
 * @param {string} paymentMethod - Payment method
 * @returns {Object} Affordability check result
 */
const canAffordAdFree = async (userId, duration, paymentMethod) => {
  try {
    const user = await User.findById(userId).select('wallet xp');
    
    if (!user) {
      return { canAfford: false, reason: 'User not found' };
    }
    
    const pricing = getAdFreePricing();
    const cost = pricing[duration];
    
    if (!cost) {
      return { canAfford: false, reason: 'Invalid duration' };
    }
    
    let requiredCost = { coins: 0, xp: 0 };
    
    if (paymentMethod === 'coins') {
      requiredCost.coins = cost.coins;
    } else if (paymentMethod === 'xp') {
      requiredCost.xp = cost.xp;
    } else if (paymentMethod === 'mixed') {
      requiredCost.coins = Math.floor(cost.coins * 0.7);
      requiredCost.xp = Math.floor(cost.xp * 0.3);
    }
    
    const canAffordCoins = user.wallet.balance >= requiredCost.coins;
    const canAffordXP = user.xp.current >= requiredCost.xp;
    
    return {
      canAfford: canAffordCoins && canAffordXP,
      required: requiredCost,
      available: {
        coins: user.wallet.balance,
        xp: user.xp.current
      },
      shortfall: {
        coins: Math.max(0, requiredCost.coins - user.wallet.balance),
        xp: Math.max(0, requiredCost.xp - user.xp.current)
      }
    };
  } catch (error) {
    console.error('Error checking affordability:', error);
    return { canAfford: false, reason: 'Error checking affordability' };
  }
};

module.exports = {
  hasTemporaryAdFree,
  shouldShowAds,
  getAdFreeStatus,
  purchaseAdFreeTime,
  getAdFreePricing,
  canAffordAdFree
};


const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');

// XP Tier configuration
const XP_TIER_CONFIG = {
  tiers: [
    { id: 'junior', name: 'Junior', minXP: 0, maxXP: 999, multiplier: 1.0, color: '#4CAF50' },
    { id: 'mid', name: 'Mid-Level', minXP: 1000, maxXP: 4999, multiplier: 1.2, color: '#FF9800' },
    { id: 'senior', name: 'Senior', minXP: 5000, maxXP: 9999, multiplier: 1.5, color: '#9C27B0' },
    { id: 'expert', name: 'Expert', minXP: 10000, maxXP: Infinity, multiplier: 2.0, color: '#F44336' }
  ],
  examples: {
    junior: { baseCoins: 10, multiplierCoins: 10, description: 'Earn 10 coins per task' },
    mid: { baseCoins: 10, multiplierCoins: 12, description: 'Earn 12 coins per task (1.2x multiplier)' },
    senior: { baseCoins: 10, multiplierCoins: 15, description: 'Earn 15 coins per task (1.5x multiplier)' },
    expert: { baseCoins: 10, multiplierCoins: 20, description: 'Earn 20 coins per task (2.0x multiplier)' }
  }
};

// Get XP tier progress and info
router.get('/progress', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    const nextTier = getNextTier(currentTier);
    
    // Calculate progress towards next tier
    const progressToNext = nextTier ? 
      Math.min(((currentXP - currentTier.minXP) / (nextTier.minXP - currentTier.minXP)) * 100, 100) : 100;
    
    const xpToNext = nextTier ? Math.max(nextTier.minXP - currentXP, 0) : 0;

    res.json({
      success: true,
      data: {
        currentTier: {
          id: currentTier.id,
          name: currentTier.name,
          minXP: currentTier.minXP,
          maxXP: currentTier.maxXP,
          multiplier: currentTier.multiplier,
          color: currentTier.color
        },
        nextTier: nextTier ? {
          id: nextTier.id,
          name: nextTier.name,
          minXP: nextTier.minXP,
          multiplier: nextTier.multiplier,
          color: nextTier.color
        } : null,
        progress: {
          currentXP,
          xpToNext,
          progressPercentage: Math.round(progressToNext),
          isMaxTier: !nextTier
        },
        examples: XP_TIER_CONFIG.examples
      }
    });
  } catch (error) {
    console.error('Error getting XP tier progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get XP tier progress'
    });
  }
});

// Get XP tier info modal data
router.get('/info', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp');
    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);

    res.json({
      success: true,
      data: {
        title: 'XP Points: How it benefits you',
        description: 'XP Points grant multipliers to your coin earnings. Higher tiers mean more rewards for the same effort!',
        tiers: XP_TIER_CONFIG.tiers.map(tier => ({
          ...tier,
          isCurrent: tier.id === currentTier.id,
          isUnlocked: currentXP >= tier.minXP,
          example: XP_TIER_CONFIG.examples[tier.id]
        })),
        currentTier: {
          ...currentTier,
          example: XP_TIER_CONFIG.examples[currentTier.id]
        },
        benefits: [
          'Higher XP tiers multiply your coin earnings',
          'Complete tasks and games to earn XP',
          'Maintain daily activity to keep your tier',
          'VIP members get bonus XP multipliers'
        ]
      }
    });
  } catch (error) {
    console.error('Error getting XP tier info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get XP tier info'
    });
  }
});

// Update XP (when user completes tasks)
router.post('/update', protect, async (req, res) => {
  try {
    const { xpEarned, source } = req.body;
    
    if (!xpEarned || xpEarned <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid XP amount is required'
      });
    }

    const user = await User.findById(req.user.userId).select('xp vip');
    
    // Get VIP multiplier
    const vipMultiplier = await getVIPMultiplier(user);
    const vipAdjustedXP = Math.round(xpEarned * vipMultiplier);

    // Apply tier multiplier after VIP
    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      vipAdjustedXP
    );

    // Update XP
    const oldXP = user.xp.current || 0;
    const newXP = oldXP + finalXP;
    
    user.xp.current = newXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
    user.xp.lastUpdated = new Date();
    
    // Check for tier upgrade
    const oldTier = getCurrentTier(oldXP);
    const newTier = getCurrentTier(newXP);
    const tierUpgraded = oldTier.id !== newTier.id;
    
    await user.save();
    
    res.json({
      success: true,
      data: {
        xpEarned: finalXP,
        oldXP,
        newXP,
        oldTier: oldTier.id,
        newTier: newTier.id,
        tierUpgraded,
        vipMultiplier,
        tierMultiplier,
        source: source || 'task'
      }
    });
  } catch (error) {
    console.error('Error updating XP:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update XP'
    });
  }
});

// Get tier comparison for all tiers
router.get('/comparison', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp');
    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);

    res.json({
      success: true,
      data: {
        currentTier: currentTier.id,
        tiers: XP_TIER_CONFIG.tiers.map(tier => ({
          ...tier,
          isCurrent: tier.id === currentTier.id,
          isUnlocked: currentXP >= tier.minXP,
          xpNeeded: Math.max(tier.minXP - currentXP, 0),
          example: XP_TIER_CONFIG.examples[tier.id],
          benefits: getTierBenefits(tier.id)
        }))
      }
    });
  } catch (error) {
    console.error('Error getting tier comparison:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tier comparison'
    });
  }
});

// Helper functions
function getCurrentTier(xp) {
  for (let i = XP_TIER_CONFIG.tiers.length - 1; i >= 0; i--) {
    const tier = XP_TIER_CONFIG.tiers[i];
    if (xp >= tier.minXP) {
      return tier;
    }
  }
  return XP_TIER_CONFIG.tiers[0]; // Default to Junior
}

function getNextTier(currentTier) {
  const currentIndex = XP_TIER_CONFIG.tiers.findIndex(tier => tier.id === currentTier.id);
  return currentIndex < XP_TIER_CONFIG.tiers.length - 1 ? 
    XP_TIER_CONFIG.tiers[currentIndex + 1] : null;
}

async function getVIPMultiplier(user) {
  try {
    const VIPTier = require('../models/VIPTier');
    const VIPSubscription = require('../models/VIPSubscription');
    
    const activeSubscription = await VIPSubscription.getActiveSubscription(user._id);
    if (!activeSubscription || !activeSubscription.isActive()) {
      return 1.0;
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    return tier ? tier.features.xpMultiplier || 1.0 : 1.0;
  } catch (error) {
    console.error('Error getting VIP multiplier:', error);
    return 1.0;
  }
}

function getTierBenefits(tierId) {
  const benefits = {
    junior: ['Basic coin earning', 'Access to free games', 'Daily rewards'],
    mid: ['1.2x coin multiplier', 'Priority support', 'Bonus daily rewards'],
    senior: ['1.5x coin multiplier', 'Exclusive games', 'Weekly bonus rewards'],
    expert: ['2.0x coin multiplier', 'All games unlocked', 'Monthly bonus rewards']
  };
  return benefits[tierId] || [];
}

module.exports = router;

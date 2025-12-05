const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const XPTierV2 = require('../models/XPTierV2');
const XPMultiplier = require('../models/XPMultiplier');
const { 
  getTierFromXPV2, 
  getTierKeyFromXPV2, 
  applyTierMultiplierToXPV2,
  getUserTierInfoV2 
} = require('../utils/xpTierMultiplierV2');
const { applyXPDecay, checkDecayStatus } = require('../utils/xpDecayV2');

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
    
    // Get current tier from V2 database
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error: 'No tier configuration found. Please configure tiers in admin panel.'
      });
    }

    // Get multiplier for current tier
    const tierKey = await getTierKeyFromXPV2(currentXP);
    const multiplierDoc = await XPMultiplier.findOne({
      tier: tierKey,
      isActive: true
    }).lean();
    const multiplier = multiplierDoc?.multiplier || 1.0;

    // Get next tier (tier with xpMin > currentXP)
    const nextTierDoc = await XPTierV2.findOne({
      xpMin: { $gt: currentXP },
      status: true
    }).sort({ xpMin: 1 });

    // Calculate progress towards next tier
    let progressToNext = 100;
    let xpToNext = 0;
    if (nextTierDoc) {
      const currentTierMax = currentTierDoc.xpMax || Infinity;
      const rangeSize = nextTierDoc.xpMin - currentTierDoc.xpMin;
      if (rangeSize > 0) {
        const progressInRange = currentXP - currentTierDoc.xpMin;
        progressToNext = Math.min((progressInRange / rangeSize) * 100, 100);
      }
      xpToNext = Math.max(nextTierDoc.xpMin - currentXP, 0);
    }

    // Map tier names to lowercase IDs for backward compatibility
    const tierIdMap = {
      'Junior': 'junior',
      'Middle': 'mid',
      'Senior': 'senior'
    };

    res.json({
      success: true,
      data: {
        currentTier: {
          id: tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
          name: currentTierDoc.tier,
          minXP: currentTierDoc.xpMin,
          maxXP: currentTierDoc.xpMax,
          multiplier: multiplier,
          xpRange: currentTierDoc.xpRange
        },
        nextTier: nextTierDoc ? {
          id: tierIdMap[nextTierDoc.tier] || nextTierDoc.tier.toLowerCase(),
          name: nextTierDoc.tier,
          minXP: nextTierDoc.xpMin,
          maxXP: nextTierDoc.xpMax,
          xpRange: nextTierDoc.xpRange
        } : null,
        progress: {
          currentXP,
          xpToNext,
          progressPercentage: Math.round(progressToNext),
          isMaxTier: !nextTierDoc
        }
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
    
    // Get all active tiers from V2 database
    const allTiers = await XPTierV2.find({ status: true }).sort({ xpMin: 1 }).lean();
    if (allTiers.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No tier configuration found. Please configure tiers in admin panel.'
      });
    }

    // Get current tier
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error: 'Unable to determine current tier'
      });
    }

    // Get multipliers for all tiers
    const tierKeyMap = {
      'Junior': 'JUNIOR',
      'Middle': 'MID',
      'Senior': 'SENIOR'
    };

    const tierIdMap = {
      'Junior': 'junior',
      'Middle': 'mid',
      'Senior': 'senior'
    };

    const tiersWithMultipliers = await Promise.all(
      allTiers.map(async (tier) => {
        const tierKey = tierKeyMap[tier.tier] || 'JUNIOR';
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true
        }).lean();
        const multiplier = multiplierDoc?.multiplier || 1.0;

        return {
          id: tierIdMap[tier.tier] || tier.tier.toLowerCase(),
          name: tier.tier,
          minXP: tier.xpMin,
          maxXP: tier.xpMax,
          multiplier: multiplier,
          xpRange: tier.xpRange,
          isCurrent: tier.tier === currentTierDoc.tier,
          isUnlocked: currentXP >= tier.xpMin,
          example: {
            baseCoins: 10,
            multiplierCoins: Math.round(10 * multiplier),
            description: `Earn ${Math.round(10 * multiplier)} coins per task (${multiplier}x multiplier)`
          }
        };
      })
    );

    const currentTierKey = tierKeyMap[currentTierDoc.tier] || 'JUNIOR';
    const currentMultiplierDoc = await XPMultiplier.findOne({
      tier: currentTierKey,
      isActive: true
    }).lean();
    const currentMultiplier = currentMultiplierDoc?.multiplier || 1.0;

    res.json({
      success: true,
      data: {
        title: 'XP Points: How it benefits you',
        description: 'XP Points grant multipliers to your coin earnings. Higher tiers mean more rewards for the same effort!',
        tiers: tiersWithMultipliers,
        currentTier: {
          id: tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
          name: currentTierDoc.tier,
          minXP: currentTierDoc.xpMin,
          maxXP: currentTierDoc.xpMax,
          multiplier: currentMultiplier,
          xpRange: currentTierDoc.xpRange,
          example: {
            baseCoins: 10,
            multiplierCoins: Math.round(10 * currentMultiplier),
            description: `Earn ${Math.round(10 * currentMultiplier)} coins per task (${currentMultiplier}x multiplier)`
          }
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

    // Apply tier multiplier after VIP using V2 logic
    const { finalXP, multiplier: tierMultiplier, tier } = await applyTierMultiplierToXPV2(
      user,
      vipAdjustedXP
    );

    // Update XP
    const oldXP = user.xp.current || 0;
    const newXP = oldXP + finalXP;
    
    user.xp.current = newXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
    user.xp.lastUpdated = new Date();
    
    // Check for tier upgrade using V2
    const oldTierDoc = await XPTierV2.findByXpValue(oldXP);
    const newTierDoc = await XPTierV2.findByXpValue(newXP);
    const tierUpgraded = oldTierDoc && newTierDoc && oldTierDoc.tier !== newTierDoc.tier;
    
    await user.save();
    
    // Map tier names to lowercase IDs for backward compatibility
    const tierIdMap = {
      'Junior': 'junior',
      'Middle': 'mid',
      'Senior': 'senior'
    };
    
    res.json({
      success: true,
      data: {
        xpEarned: finalXP,
        oldXP,
        newXP,
        oldTier: oldTierDoc ? (tierIdMap[oldTierDoc.tier] || oldTierDoc.tier.toLowerCase()) : 'junior',
        newTier: newTierDoc ? (tierIdMap[newTierDoc.tier] || newTierDoc.tier.toLowerCase()) : 'junior',
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
    
    // Get all active tiers from V2 database
    const allTiers = await XPTierV2.find({ status: true }).sort({ xpMin: 1 }).lean();
    if (allTiers.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No tier configuration found. Please configure tiers in admin panel.'
      });
    }

    // Get current tier
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error: 'Unable to determine current tier'
      });
    }

    // Get multipliers for all tiers
    const tierKeyMap = {
      'Junior': 'JUNIOR',
      'Middle': 'MID',
      'Senior': 'SENIOR'
    };

    const tierIdMap = {
      'Junior': 'junior',
      'Middle': 'mid',
      'Senior': 'senior'
    };

    const tiersWithData = await Promise.all(
      allTiers.map(async (tier) => {
        const tierKey = tierKeyMap[tier.tier] || 'JUNIOR';
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true
        }).lean();
        const multiplier = multiplierDoc?.multiplier || 1.0;

        return {
          id: tierIdMap[tier.tier] || tier.tier.toLowerCase(),
          name: tier.tier,
          minXP: tier.xpMin,
          maxXP: tier.xpMax,
          multiplier: multiplier,
          xpRange: tier.xpRange,
          isCurrent: tier.tier === currentTierDoc.tier,
          isUnlocked: currentXP >= tier.xpMin,
          xpNeeded: Math.max(tier.xpMin - currentXP, 0),
          example: {
            baseCoins: 10,
            multiplierCoins: Math.round(10 * multiplier),
            description: `Earn ${Math.round(10 * multiplier)} coins per task (${multiplier}x multiplier)`
          },
          benefits: getTierBenefits(tierIdMap[tier.tier] || tier.tier.toLowerCase())
        };
      })
    );

    res.json({
      success: true,
      data: {
        currentTier: tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
        tiers: tiersWithData
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

// Check XP Decay status for current user
router.get('/decay-status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp lastActive lastLoginAt createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const decayStatus = await checkDecayStatus(user);

    res.json({
      success: true,
      data: decayStatus
    });
  } catch (error) {
    console.error('Error checking decay status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check decay status'
    });
  }
});

// Apply XP Decay for current user (if eligible)
router.post('/apply-decay', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp lastActive lastLoginAt createdAt');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const decayResult = await applyXPDecay(user);

    res.json({
      success: true,
      data: decayResult
    });
  } catch (error) {
    console.error('Error applying decay:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to apply decay'
    });
  }
});

module.exports = router;

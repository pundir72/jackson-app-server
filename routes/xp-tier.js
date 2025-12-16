const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const XPTierV2 = require("../models/XPTierV2");
const XPTier = require("../models/XPTier");
const XPMultiplier = require("../models/XPMultiplier");
const axios = require("axios");
const {
  getTierFromXPV2,
  getTierKeyFromXPV2,
  applyTierMultiplierToXPV2,
  getUserTierInfoV2,
} = require("../utils/xpTierMultiplierV2");
const { applyXPDecay, checkDecayStatus } = require("../utils/xpDecayV2");

// Get XP tier progress and info
router.get("/progress", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("xp");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const currentXP = user.xp.current || 0;

    // Get current tier from V2 database
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error:
          "No tier configuration found. Please configure tiers in admin panel.",
      });
    }

    // Get multiplier for current tier
    const tierKey = await getTierKeyFromXPV2(currentXP);
    const multiplierDoc = await XPMultiplier.findOne({
      tier: tierKey,
      isActive: true,
    }).lean();
    const multiplier = multiplierDoc?.multiplier || 1.0;

    // Get next tier (tier with xpMin > currentXP)
    const nextTierDoc = await XPTierV2.findOne({
      xpMin: { $gt: currentXP },
      status: true,
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
      Junior: "junior",
      Middle: "mid",
      Senior: "senior",
    };

    res.json({
      success: true,
      data: {
        currentTier: {
          id:
            tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
          name: currentTierDoc.tier,
          minXP: currentTierDoc.xpMin,
          maxXP: currentTierDoc.xpMax,
          multiplier: multiplier,
          xpRange: currentTierDoc.xpRange,
        },
        nextTier: nextTierDoc
          ? {
              id: tierIdMap[nextTierDoc.tier] || nextTierDoc.tier.toLowerCase(),
              name: nextTierDoc.tier,
              minXP: nextTierDoc.xpMin,
              maxXP: nextTierDoc.xpMax,
              xpRange: nextTierDoc.xpRange,
            }
          : null,
        progress: {
          currentXP,
          xpToNext,
          progressPercentage: Math.round(progressToNext),
          isMaxTier: !nextTierDoc,
        },
      },
    });
  } catch (error) {
    console.error("Error getting XP tier progress:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get XP tier progress",
    });
  }
});

// Get XP tier info modal data
router.get("/info", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("xp");
    const currentXP = user.xp.current || 0;

    // Get all active tiers from V2 database
    const allTiers = await XPTierV2.find({ status: true })
      .sort({ xpMin: 1 })
      .lean();
    if (allTiers.length === 0) {
      return res.status(500).json({
        success: false,
        error:
          "No tier configuration found. Please configure tiers in admin panel.",
      });
    }

    // Get current tier
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error: "Unable to determine current tier",
      });
    }

    // Get multipliers for all tiers
    const tierKeyMap = {
      Junior: "JUNIOR",
      Middle: "MID",
      Senior: "SENIOR",
    };

    const tierIdMap = {
      Junior: "junior",
      Middle: "mid",
      Senior: "senior",
    };

    const tiersWithMultipliers = await Promise.all(
      allTiers.map(async (tier) => {
        const tierKey = tierKeyMap[tier.tier] || "JUNIOR";
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true,
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
            description: `Earn ${Math.round(
              10 * multiplier
            )} coins per task (${multiplier}x multiplier)`,
          },
        };
      })
    );

    const currentTierKey = tierKeyMap[currentTierDoc.tier] || "JUNIOR";
    const currentMultiplierDoc = await XPMultiplier.findOne({
      tier: currentTierKey,
      isActive: true,
    }).lean();
    const currentMultiplier = currentMultiplierDoc?.multiplier || 1.0;

    res.json({
      success: true,
      data: {
        title: "XP Points: How it benefits you",
        description:
          "XP Points grant multipliers to your coin earnings. Higher tiers mean more rewards for the same effort!",
        tiers: tiersWithMultipliers,
        currentTier: {
          id:
            tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
          name: currentTierDoc.tier,
          minXP: currentTierDoc.xpMin,
          maxXP: currentTierDoc.xpMax,
          multiplier: currentMultiplier,
          xpRange: currentTierDoc.xpRange,
          example: {
            baseCoins: 10,
            multiplierCoins: Math.round(10 * currentMultiplier),
            description: `Earn ${Math.round(
              10 * currentMultiplier
            )} coins per task (${currentMultiplier}x multiplier)`,
          },
        },
        benefits: [
          "Higher XP tiers multiply your coin earnings",
          "Complete tasks and games to earn XP",
          "Maintain daily activity to keep your tier",
          "VIP members get bonus XP multipliers",
        ],
      },
    });
  } catch (error) {
    console.error("Error getting XP tier info:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get XP tier info",
    });
  }
});

// Update XP (when user completes tasks)
router.post("/update", protect, async (req, res) => {
  try {
    const { xpEarned, source } = req.body;

    if (!xpEarned || xpEarned <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid XP amount is required",
      });
    }

    const user = await User.findById(req.user.userId).select("xp vip");

    // Get VIP multiplier
    const vipMultiplier = await getVIPMultiplier(user);
    const vipAdjustedXP = Math.round(xpEarned * vipMultiplier);

    // Apply tier multiplier after VIP using V2 logic
    const {
      finalXP,
      multiplier: tierMultiplier,
      tier,
    } = await applyTierMultiplierToXPV2(user, vipAdjustedXP);

    // Update XP
    const oldXP = user.xp.current || 0;
    const newXP = oldXP + finalXP;

    user.xp.current = newXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
    user.xp.lastUpdated = new Date();

    // Check for tier upgrade using V2
    const oldTierDoc = await XPTierV2.findByXpValue(oldXP);
    const newTierDoc = await XPTierV2.findByXpValue(newXP);
    const tierUpgraded =
      oldTierDoc && newTierDoc && oldTierDoc.tier !== newTierDoc.tier;

    await user.save();

    // Map tier names to lowercase IDs for backward compatibility
    const tierIdMap = {
      Junior: "junior",
      Middle: "mid",
      Senior: "senior",
    };

    res.json({
      success: true,
      data: {
        xpEarned: finalXP,
        oldXP,
        newXP,
        oldTier: oldTierDoc
          ? tierIdMap[oldTierDoc.tier] || oldTierDoc.tier.toLowerCase()
          : "junior",
        newTier: newTierDoc
          ? tierIdMap[newTierDoc.tier] || newTierDoc.tier.toLowerCase()
          : "junior",
        tierUpgraded,
        vipMultiplier,
        tierMultiplier,
        source: source || "task",
      },
    });
  } catch (error) {
    console.error("Error updating XP:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update XP",
    });
  }
});

// Get tier comparison for all tiers
router.get("/comparison", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("xp");
    const currentXP = user.xp.current || 0;

    // Get all active tiers from V2 database
    const allTiers = await XPTierV2.find({ status: true })
      .sort({ xpMin: 1 })
      .lean();
    if (allTiers.length === 0) {
      return res.status(500).json({
        success: false,
        error:
          "No tier configuration found. Please configure tiers in admin panel.",
      });
    }

    // Get current tier
    const currentTierDoc = await XPTierV2.findByXpValue(currentXP);
    if (!currentTierDoc) {
      return res.status(500).json({
        success: false,
        error: "Unable to determine current tier",
      });
    }

    // Get multipliers for all tiers
    const tierKeyMap = {
      Junior: "JUNIOR",
      Middle: "MID",
      Senior: "SENIOR",
    };

    const tierIdMap = {
      Junior: "junior",
      Middle: "mid",
      Senior: "senior",
    };

    const tiersWithData = await Promise.all(
      allTiers.map(async (tier) => {
        const tierKey = tierKeyMap[tier.tier] || "JUNIOR";
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true,
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
            description: `Earn ${Math.round(
              10 * multiplier
            )} coins per task (${multiplier}x multiplier)`,
          },
          benefits: getTierBenefits(
            tierIdMap[tier.tier] || tier.tier.toLowerCase()
          ),
        };
      })
    );

    res.json({
      success: true,
      data: {
        currentTier:
          tierIdMap[currentTierDoc.tier] || currentTierDoc.tier.toLowerCase(),
        tiers: tiersWithData,
      },
    });
  } catch (error) {
    console.error("Error getting tier comparison:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get tier comparison",
    });
  }
});

// Helper functions

async function getVIPMultiplier(user) {
  try {
    const VIPTier = require("../models/VIPTier");
    const VIPSubscription = require("../models/VIPSubscription");

    const activeSubscription = await VIPSubscription.getActiveSubscription(
      user._id
    );
    if (!activeSubscription || !activeSubscription.isActive()) {
      return 1.0;
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    return tier ? tier.features.xpMultiplier || 1.0 : 1.0;
  } catch (error) {
    console.error("Error getting VIP multiplier:", error);
    return 1.0;
  }
}

function getTierBenefits(tierId) {
  const benefits = {
    junior: ["Basic coin earning", "Access to free games", "Daily rewards"],
    mid: ["1.2x coin multiplier", "Priority support", "Bonus daily rewards"],
    senior: ["1.5x coin multiplier", "Exclusive games", "Weekly bonus rewards"],
    expert: [
      "2.0x coin multiplier",
      "All games unlocked",
      "Monthly bonus rewards",
    ],
  };
  return benefits[tierId] || [];
}

// Check XP Decay status for current user
router.get("/decay-status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "xp lastActive lastLoginAt createdAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const decayStatus = await checkDecayStatus(user);

    res.json({
      success: true,
      data: decayStatus,
    });
  } catch (error) {
    console.error("Error checking decay status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check decay status",
    });
  }
});

// Apply XP Decay for current user (if eligible)
router.post("/apply-decay", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "xp lastActive lastLoginAt createdAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const decayResult = await applyXPDecay(user);

    res.json({
      success: true,
      data: decayResult,
    });
  } catch (error) {
    console.error("Error applying decay:", error);
    res.status(500).json({
      success: false,
      error: "Failed to apply decay",
    });
  }
});

// Get XP progress bar data from admin configuration
// This endpoint uses the same XPTier model as the admin API and returns only data needed for progress bar
router.get("/progress-bar", protect, async (req, res) => {
  try {
    // Get user's current XP
    const user = await User.findById(req.user.userId).select("xp");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const currentXP = user.xp?.current || 0;

    // Fetch XP tiers from database (same model used by admin API)
    // This is more efficient than making HTTP call and uses the same data source
    let tiersData = [];

    try {
      // Query active tiers, sorted by order then by xpMin (same as admin API)
      tiersData = await XPTier.find({ status: true })
        .sort({ order: 1, xpMin: 1 })
        .lean();
    } catch (dbError) {
      console.error("Error fetching XP tiers from database:", dbError.message);
      // Fallback: Try fetching from admin API if database query fails
      try {
        const adminApiUrl =
          process.env.ADMIN_API_BASE_URL ||
          "https://rewardsapi.hireagent.co/api";
        const response = await axios.get(
          `${adminApiUrl}/admin/rewards/xp-tiers?status=true`,
          {
            timeout: 10000,
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (
          response.data &&
          response.data.success &&
          Array.isArray(response.data.data)
        ) {
          tiersData = response.data.data
            .filter((tier) => tier.status === true)
            .sort(
              (a, b) => (a.order || 0) - (b.order || 0) || a.xpMin - b.xpMin
            );
        }
      } catch (apiError) {
        console.error(
          "Error fetching XP tiers from admin API fallback:",
          apiError.message
        );
        return res.status(500).json({
          success: false,
          error: "Failed to fetch XP tier configuration",
          details: "Both database and API queries failed",
        });
      }
    }

    if (tiersData.length === 0) {
      return res.status(500).json({
        success: false,
        error:
          "No active XP tiers found in admin configuration. Please configure tiers in admin panel.",
      });
    }

    // Get the highest tier's max XP as the total goal
    const highestTier = tiersData[tiersData.length - 1];
    const totalXpGoal = highestTier.xpMax || highestTier.xpMin;

    // Calculate progress percentage
    const progressPercentage = Math.min((currentXP / totalXpGoal) * 100, 100);

    // Determine current tier based on XP
    let currentTier = tiersData[0]; // Default to first tier
    for (let i = tiersData.length - 1; i >= 0; i--) {
      if (currentXP >= tiersData[i].xpMin) {
        currentTier = tiersData[i];
        break;
      }
    }

    // Generate title based on progress
    let title = "You're off to a great start!";
    if (progressPercentage >= 80) {
      title = "You're almost there!";
    } else if (progressPercentage >= 50) {
      title = "You're making great progress!";
    } else if (progressPercentage >= 25) {
      title = "Keep it up!";
    }

    // Extract tier names for levels array
    const levels = tiersData.map((tier) => tier.tierName);

    // Prepare tier details for expanded view
    const tierDetails = tiersData.map((tier) => {
      // Extract multiplier from accessBenefits (e.g., "2x" -> 2, "1.2x" -> 1.2)
      let multiplier = 1;
      if (tier.accessBenefits) {
        const match = tier.accessBenefits.match(/(\d+\.?\d*)x/i);
        if (match) {
          multiplier = parseFloat(match[1]);
        }
      }

      // Use multipliers object if available (prioritize this over accessBenefits parsing)
      if (tier.multipliers && tier.multipliers.coins) {
        multiplier = tier.multipliers.coins;
      }

      return {
        name: tier.tierName,
        reward: tier.accessBenefits || `${multiplier}x`,
        multiplier: multiplier,
        xpMin: tier.xpMin,
        xpMax: tier.xpMax,
        xpRange: tier.xpRange || `${tier.xpMin} - ${tier.xpMax} XP`,
        // Example points calculation (base 5 points for completing 5 levels)
        examplePoints: Math.round(5 * multiplier),
      };
    });

    // Response data matching frontend component expectations
    res.json({
      success: true,
      data: {
        // Main progress bar data
        title: title,
        currentXP: currentXP,
        totalXP: totalXpGoal,
        levels: levels,
        progressPercentage: progressPercentage,

        // Current tier info
        currentTier: {
          name: currentTier.tierName,
          xpMin: currentTier.xpMin,
          xpMax: currentTier.xpMax,
          xpRange:
            currentTier.xpRange ||
            `${currentTier.xpMin} - ${currentTier.xpMax} XP`,
          accessBenefits: currentTier.accessBenefits,
          multiplier:
            tierDetails.find((t) => t.name === currentTier.tierName)
              ?.multiplier || 1,
        },

        // All tier details for expanded view
        tiers: tierDetails,
      },
    });
  } catch (error) {
    console.error("Error getting XP progress bar data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get XP progress bar data",
      details: error.message,
    });
  }
});

module.exports = router;

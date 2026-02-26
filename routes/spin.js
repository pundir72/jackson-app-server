const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const SpinWheelConfig = require("../models/SpinWheelConfig");
const SpinWheelReward = require("../models/SpinWheelReward");
const SpinWheelLog = require("../models/SpinWheelLog");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

// Default spin wheel configuration (fallback if no admin config exists)
const DEFAULT_SPIN_CONFIG = {
  minReward: 10,
  maxReward: 100,
  dailyLimit: 3,
  cooldownMinutes: 360,
  maxSpinsPerDay: 3,
  spinMode: "free",
  vipMultiplier: {
    bronze: 1.2,
    gold: 1.5,
    platinum: 2.0,
  },
};

// Helper function to normalize tier name for case-insensitive comparison
function normalizeTier(tier) {
  if (!tier) return "";
  return tier.toString().trim().toLowerCase();
}

// Helper function to check if a tier is in an array (case-insensitive)
function isTierEligible(userTier, eligibleTiers) {
  if (!eligibleTiers || eligibleTiers.length === 0) return true;
  if (!userTier) return false;

  const normalizedUserTier = normalizeTier(userTier);
  return eligibleTiers.some(
    (tier) => normalizeTier(tier) === normalizedUserTier,
  );
}

/**
 * Check if current UTC time is within the campaign start/end window.
 * Uses UTC for all comparisons so admin start/end times are enforced consistently.
 * @param {{ startDate?: Date | string | null, endDate?: Date | string | null }} config
 * @returns {boolean} true if within window (or no dates set), false if outside
 */
function isWithinCampaignWindowUTC(config) {
  if (!config) return true;
  const nowUtcMs = Date.now();
  if (config.startDate) {
    const startMs = new Date(config.startDate).getTime();
    if (Number.isNaN(startMs) || nowUtcMs < startMs) return false;
  }
  if (config.endDate) {
    const endMs = new Date(config.endDate).getTime();
    if (Number.isNaN(endMs) || nowUtcMs > endMs) return false;
  }
  return true;
}

// Helper function to get active spin wheel configuration
async function getSpinWheelConfig() {
  try {
    const config = await SpinWheelConfig.findOne({ isActive: true }).lean();
    if (!config) {
      return DEFAULT_SPIN_CONFIG;
    }
    return config;
  } catch (error) {
    console.error("Error getting spin wheel config:", error);
    return DEFAULT_SPIN_CONFIG;
  }
}

/**
 * Select a reward based on probability distribution (BUG-065 FIX)
 * Uses proper randomization with cumulative distribution
 * @param {Array} rewards - Array of reward objects with probability property
 * @returns {Object|null} Selected reward or null if no reward (when total probability < 100%)
 */
function selectRewardByProbability(rewards) {
  // BUG-065 FIX: Proper randomization logic
  // Calculate total probability of all rewards
  const totalProbability = rewards.reduce(
    (sum, r) => sum + (r.probability || 0),
    0,
  );

  // Handle edge case: no probabilities set
  if (totalProbability <= 0) {
    // Equal probability for all rewards
    const randomIndex = Math.floor(Math.random() * rewards.length);
    console.log(`🎲 Equal distribution: selected ${rewards[randomIndex].name}`);
    return rewards[randomIndex];
  }

  // CRITICAL FIX: Generate random between 0-100, not 0-totalProbability
  // This allows "no reward" outcomes when total probability < 100%
  const random = Math.random() * 100;

  console.log(
    `🎲 Randomization: random=${random.toFixed(2)}, totalProb=${totalProbability}%`,
  );

  // Build cumulative distribution and select reward
  let cumulative = 0;

  for (const reward of rewards) {
    const prob = reward.probability || 0;
    cumulative += prob;

    // Select reward if random falls within its probability range
    if (random < cumulative) {
      console.log(
        `🎯 Selected: ${reward.name} (${prob}%) - cumulative: ${cumulative}%`,
      );
      return reward;
    }
  }

  // CRITICAL: Return null for "no reward" outcomes (was always returning rewards[0])
  console.log(
    `🚫 No reward - random ${random.toFixed(2)} > total ${totalProbability}%`,
  );
  return null;
}

// Get spin wheel configuration and rewards
router.get("/config", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("vip");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get active spin wheel configuration
    const config = await getSpinWheelConfig();

    // Get user's VIP tier
    const userTier = user.vip?.level || "Bronze";

    // Get active rewards that are eligible for user's tier
    const allRewards = await SpinWheelReward.find({ isActive: true }).lean();
    const eligibleRewards = allRewards.filter((reward) => {
      return isTierEligible(userTier, reward.eligibleTiers);
    });

    // Check if user is eligible based on config tier restrictions
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    // Check campaign window (start/end date & time) in UTC - block if outside window
    const isWithinDateRange = isWithinCampaignWindowUTC(config);

    res.json({
      success: true,
      data: {
        config: {
          spinMode: config.spinMode || "free",
          cooldownMinutes: config.cooldownMinutes || 360,
          maxSpinsPerDay: config.maxSpinsPerDay || 3,
          eligibleTiers: config.eligibleTiers || [],
          vipMultipliers: config.vipMultipliers || {},
          visualSettings: config.visualSettings || {},
          startDate: config.startDate,
          endDate: config.endDate,
        },
        rewards: eligibleRewards.map((reward) => ({
          id: reward._id,
          name: reward.name,
          type: reward.type,
          amount: reward.amount,
          probability: reward.probability,
          icon: reward.icon,
          color: reward.color,
          metadata: reward.metadata,
        })),
        isEligible: isEligible && isWithinDateRange,
        userTier,
      },
    });
  } catch (error) {
    console.error("Error getting spin wheel config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get spin wheel configuration",
    });
  }
});

// Get spin status and available spins
router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("wallet xp vip");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get active spin wheel configuration
    let config = await SpinWheelConfig.findOne({ isActive: true });
    if (!config) {
      config = DEFAULT_SPIN_CONFIG;
    }

    // Get user's VIP tier
    const userTier = user.vip?.level || "Bronze";

    // Check if user is eligible based on config tier restrictions
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    // Check campaign window (start/end date & time) in UTC - block if outside window
    const isWithinDateRange = isWithinCampaignWindowUTC(config);

    if (!isEligible || !isWithinDateRange) {
      return res.json({
        success: true,
        data: {
          canSpin: false,
          remainingSpins: 0,
          dailyLimit: 0,
          vipMultiplier: 1.0,
          isVIP: false,
          lastSpinTime: null,
          reason: !isEligible
            ? "Not eligible for this spin wheel"
            : !isWithinDateRange
              ? "Spin wheel is not currently active. Please check the campaign dates."
              : "Spin wheel is not active",
        },
      });
    }

    // Get today's spin count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpins = await SpinWheelLog.countDocuments({
      user: req.user.userId,
      createdAt: { $gte: today },
    });

    // Check VIP benefits
    const vipBenefits = await getUserVIPBenefits(req.user.userId);
    let dailyLimit;
    if (config instanceof SpinWheelConfig) {
      dailyLimit = vipBenefits.unlimitedSpins
        ? 999
        : config.getMaxSpinsForUser(userTier);
    } else {
      dailyLimit = config.maxSpinsPerDay || 3;
    }

    // Get VIP multiplier from config (not from VIP benefits)
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] ||
      (config instanceof SpinWheelConfig
        ? 1.0
        : DEFAULT_SPIN_CONFIG.vipMultiplier?.[userTier.toLowerCase()] || 1.0);

    // Get last spin time and calculate cooldown remaining
    const lastSpinTime = await getLastSpinTime(req.user.userId);
    const cooldownMinutes = config.cooldownMinutes || 360;
    let cooldownRemaining = 0;

    if (lastSpinTime) {
      const now = Date.now();
      const lastSpinMs = lastSpinTime.getTime();
      const cooldownMs = cooldownMinutes * 60 * 1000;
      const elapsedMs = now - lastSpinMs;
      cooldownRemaining = Math.max(0, cooldownMs - elapsedMs);
    }

    // Return spin status
    res.json({
      success: true,
      data: {
        canSpin: todaySpins < dailyLimit,
        remainingSpins: Math.max(0, dailyLimit - todaySpins),
        dailyLimit: dailyLimit,
        vipMultiplier: vipMultiplier,
        isVIP: !!user.vip?.level,
        lastSpinTime: lastSpinTime,
        cooldownRemaining: cooldownRemaining,
        cooldownMinutes: cooldownMinutes,
      },
    });
  } catch (error) {
    console.error("Error getting spin status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get spin status",
    });
  }
});

// Perform a spin
router.post("/spin", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select("wallet xp vip");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get active spin wheel configuration
    let config = await SpinWheelConfig.findOne({ isActive: true });
    if (!config) {
      config = DEFAULT_SPIN_CONFIG;
    }

    // Get user's VIP tier
    const userTier = user.vip?.level || "Bronze";

    // Check if user is eligible based on config tier restrictions
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    // Check campaign window (start/end date & time) in UTC
    const isWithinDateRange = isWithinCampaignWindowUTC(config);

    if (!isEligible || !isWithinDateRange) {
      return res.status(400).json({
        success: false,
        error: !isEligible
          ? "Not eligible for this spin wheel"
          : "Spin wheel is not currently active. Please check the campaign dates.",
        cooldownMinutes: config.cooldownMinutes || 360,
      });
    }

    // Get today's spin count
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpins = await SpinWheelLog.countDocuments({
      user: userId,
      createdAt: { $gte: today },
    });

    // Check VIP benefits
    const vipBenefits = await getUserVIPBenefits(userId);
    let dailyLimit;
    if (config instanceof SpinWheelConfig) {
      dailyLimit = vipBenefits.unlimitedSpins
        ? 999
        : config.getMaxSpinsForUser(userTier);
    } else {
      dailyLimit = config.maxSpinsPerDay || 3;
    }

    // Check if user has spins remaining
    if (todaySpins >= dailyLimit) {
      return res.status(400).json({
        success: false,
        error: "Daily spin limit reached",
        data: {
          remainingSpins: 0,
          dailyLimit: dailyLimit,
          cooldownMinutes: config.cooldownMinutes || 360,
        },
      });
    }

    // Get active rewards that are eligible for user's tier
    const allRewards = await SpinWheelReward.find({ isActive: true }).lean();
    const eligibleRewards = allRewards.filter((reward) => {
      return isTierEligible(userTier, reward.eligibleTiers);
    });

    if (eligibleRewards.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No rewards available for your tier",
      });
    }

    // Select reward by probability
    const selectedReward = selectRewardByProbability(eligibleRewards);

    if (!selectedReward) {
      // No reward selected (probability-based)
      const spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const spinLog = new SpinWheelLog({
        user: userId,
        spinId: spinId,
        reward: null,
        rewardName: "No Reward",
        rewardType: "none",
        rewardAmount: 0,
        vipMultiplier: 1.0,
        spinMode: config.spinMode || "free",
        userTier: userTier,
        isWin: false,
      });
      await spinLog.save();

      return res.json({
        success: true,
        message: "No reward this time. Try again!",
        data: {
          spinId: spinLog._id,
          reward: null,
          status: "completed",
        },
      });
    }

    // Apply VIP multiplier if applicable
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;

    let finalAmount;
    let tierMultiplierValue = 1.0;
    let tierName = "";

    if (selectedReward.type === "coins" || selectedReward.type === "coin") {
      finalAmount = Math.floor(selectedReward.amount * vipMultiplier);
    } else if (selectedReward.type === "xp" || selectedReward.type === "XP") {
      // XP rewards get BOTH VIP multiplier and tier multiplier
      let xpAmountWithVIP = selectedReward.amount * vipMultiplier;

      // Apply XP tier multiplier based on user's current XP level
      const tierMultiplierResult = await applyTierMultiplierToXP(
        user,
        xpAmountWithVIP,
      );
      finalAmount = Math.floor(tierMultiplierResult.finalXP);
      tierMultiplierValue = tierMultiplierResult.multiplier;
      tierName = tierMultiplierResult.tier;

      console.log(
        `📊 XP Spin Multipliers - Base: ${selectedReward.amount}, VIP: ${vipMultiplier}x, Tier: ${tierMultiplierValue}x (${tierName}), Final: ${finalAmount}`,
      );
    } else {
      finalAmount = selectedReward.amount;
    }

    // Create spin log
    const spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const spinLog = new SpinWheelLog({
      user: userId,
      spinId: spinId,
      reward: selectedReward._id,
      rewardName: selectedReward.name,
      rewardType: selectedReward.type,
      rewardAmount: finalAmount,
      vipMultiplier:
        selectedReward.type === "coins" ||
        selectedReward.type === "coin" ||
        selectedReward.type === "xp" ||
        selectedReward.type === "XP"
          ? vipMultiplier
          : 1.0,
      tierMultiplier:
        selectedReward.type === "xp" || selectedReward.type === "XP"
          ? tierMultiplierValue
          : 1.0,
      tierName:
        selectedReward.type === "xp" || selectedReward.type === "XP"
          ? tierName
          : "",
      spinMode: config.spinMode || "free",
      userTier: userTier,
      isWin: true,
    });

    // For free spins, automatically credit the reward
    let coinsEarned = 0;
    let xpEarned = 0;
    let transaction = null;

    if (
      config.spinMode === "free" ||
      !config.spinMode ||
      config.spinMode !== "ad_based"
    ) {
      if (selectedReward.type === "coins" || selectedReward.type === "coin") {
        coinsEarned = finalAmount;
        user.wallet.balance += coinsEarned;
        user.wallet.lastUpdated = new Date();

        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "coins",
          amount: coinsEarned,
          description: `Spin reward - ${selectedReward.name} (${coinsEarned} coins)`,
          status: "completed",
          referenceId: spinLog.spinId,
        });
        await transaction.save();
        spinLog.transactionId = transaction._id;
      } else if (selectedReward.type === "xp" || selectedReward.type === "XP") {
        xpEarned = finalAmount;
        user.xp.current += xpEarned;
        user.xp.total += xpEarned;

        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "xp",
          amount: xpEarned,
          description: `Spin reward - ${selectedReward.name} (Base: ${selectedReward.amount} → VIP: ${vipMultiplier}x → Tier: ${tierMultiplierValue}x (${tierName}) → Total: ${xpEarned} XP)`,
          status: "completed",
          referenceId: spinLog.spinId,
        });
        await transaction.save();
        spinLog.transactionId = transaction._id;
      }

      await user.save();
    }

    // Save spin log
    await spinLog.save();

    // Update reward stats
    await SpinWheelReward.findByIdAndUpdate(selectedReward._id, {
      $inc: { "stats.totalWins": 1 },
      $set: { "stats.lastWon": new Date() },
    });

    // Get cooldown information for response
    const cooldownMinutes = config.cooldownMinutes || 360;
    const cooldownMs = cooldownMinutes * 60 * 1000;

    res.json({
      success: true,
      message:
        config.spinMode === "ad_based"
          ? "Watch video ad to claim your reward!"
          : "Spin completed successfully!",
      data: {
        spinId: spinLog._id,
        reward: {
          id: selectedReward._id,
          name: selectedReward.name,
          type: selectedReward.type,
          amount: finalAmount,
          baseAmount: selectedReward.amount,
          icon: selectedReward.icon,
          color: selectedReward.color,
          metadata: selectedReward.metadata,
        },
        vipMultiplier:
          selectedReward.type === "coins" ||
          selectedReward.type === "coin" ||
          selectedReward.type === "xp" ||
          selectedReward.type === "XP"
            ? vipMultiplier
            : 1.0,
        userTier,
        status: config.spinMode === "ad_based" ? "pending" : "completed",
        cooldownRemaining: cooldownMs,
        cooldownMinutes: cooldownMinutes,
        ...(config.spinMode !== "ad_based" && {
          coinsEarned,
          xpEarned,
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
        }),
      },
    });
  } catch (error) {
    console.error("Error performing spin:", error);
    res.status(500).json({
      success: false,
      error: "Failed to perform spin",
    });
  }
});

// Redeem spin reward after watching ad
router.post("/redeem", protect, async (req, res) => {
  try {
    const { spinId } = req.body;
    const userId = req.user.userId;

    if (!spinId) {
      return res.status(400).json({
        success: false,
        error: "Spin ID is required",
      });
    }

    const spinLog = await SpinWheelLog.findOne({
      user: userId,
      $or: [{ spinId: spinId }, { _id: spinId }],
    }).populate("reward");

    if (!spinLog) {
      // Also check for transaction (backward compatibility)
      const transaction = await Transaction.findOne({
        user: userId,
        referenceId: spinId,
        status: "pending",
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: "Invalid or expired spin reward",
        });
      }

      const user = await User.findById(userId).select("wallet xp");
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      user.wallet.balance += transaction.amount;
      user.wallet.lastUpdated = new Date();

      // NO bonus XP for coin rewards
      const xpEarned = 0;
      // Do NOT update XP for coin rewards

      transaction.status = "completed";
      transaction.description = `Spin reward - ${transaction.amount} coins`;

      await Promise.all([user.save(), transaction.save()]);

      return res.json({
        success: true,
        data: {
          reward: transaction.amount,
          xpEarned: 0,
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
          message: "Reward claimed successfully!",
        },
      });
    }

    const existingTransaction = await Transaction.findOne({
      user: userId,
      referenceId: spinLog.spinId || spinLog._id.toString(),
      status: "completed",
    });

    if (existingTransaction) {
      const user = await User.findById(userId).select("wallet xp");
      return res.json({
        success: true,
        data: {
          reward: existingTransaction.amount,
          xpEarned: 0, // NO bonus XP for coin rewards
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
          message: "Reward already claimed!",
          alreadyRedeemed: true,
        },
      });
    }

    let transaction = await Transaction.findOne({
      user: userId,
      referenceId: spinLog.spinId || spinLog._id.toString(),
      status: "pending",
    });

    const user = await User.findById(userId).select("wallet xp");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const rewardType =
      spinLog.rewardType || (spinLog.reward && spinLog.reward.type) || "coins";
    let coinsEarned = 0;
    let xpEarned = 0;
    let couponCode = null;

    // Handle different reward types - ensure exact type matching
    // VIP multiplier should ONLY apply to coins, not XP
    if (rewardType === "coins" || rewardType === "coin") {
      // Only give coins for coin rewards - NO bonus XP
      coinsEarned = spinLog.rewardAmount; // This already has VIP multiplier applied if it was a coin reward
      user.wallet.balance += coinsEarned;
      user.wallet.lastUpdated = new Date();
      // NO bonus XP for coin rewards
      xpEarned = 0;
    } else if (rewardType === "xp" || rewardType === "XP") {
      // Only give XP for XP rewards - amount already includes VIP and tier multipliers from spin
      xpEarned = spinLog.rewardAmount; // This includes VIP multiplier and tier multiplier applied
      user.xp.current += xpEarned;
      user.xp.total += xpEarned;
      // Do NOT give coins for XP rewards

      // Create transaction record for XP (showing final amount with all multipliers)
      transaction = new Transaction({
        user: userId,
        type: "credit",
        balanceType: "xp",
        amount: xpEarned,
        description: `Spin reward - ${spinLog.rewardName} (Base: ${spinLog.reward?.amount || 0} → VIP: ${spinLog.vipMultiplier}x → Tier: ${spinLog.tierMultiplier}x (${spinLog.tierName}) → Total: ${xpEarned} XP)`,
        status: "completed",
        referenceId: spinLog.spinId || spinLog._id.toString(),
      });
      await transaction.save();

      if (!spinLog.transactionId) {
        spinLog.transactionId = transaction._id;
        await spinLog.save();
      }
    } else if (rewardType === "coupon") {
      // Handle coupon rewards
      couponCode = spinLog.couponCode || `COUPON-${Date.now()}`;
      // Coupons don't give coins or XP
      coinsEarned = 0;
      xpEarned = 0;
    }

    // Save user changes (for coins rewards)
    if (rewardType === "coins" || rewardType === "coin") {
      await user.save();
    } else if (rewardType === "xp" || rewardType === "XP") {
      await user.save();
    }

    // Create transaction for coin rewards if not already created
    if ((rewardType === "coins" || rewardType === "coin") && !transaction) {
      transaction = new Transaction({
        user: userId,
        type: "credit",
        balanceType: "coins",
        amount: coinsEarned,
        description: `Spin reward - ${spinLog.rewardName || "Coins"} (${coinsEarned} coins)`,
        status: "completed",
        referenceId: spinLog.spinId || spinLog._id.toString(),
      });
      await transaction.save();

      if (!spinLog.transactionId) {
        spinLog.transactionId = transaction._id;
        await spinLog.save();
      }
    }

    res.json({
      success: true,
      data: {
        reward: spinLog.rewardAmount,
        rewardType: rewardType,
        coinsEarned: coinsEarned,
        xpEarned: xpEarned,
        couponCode: couponCode,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        message:
          rewardType === "coupon"
            ? `Coupon reward claimed! Code: ${couponCode}`
            : "Reward claimed successfully!",
        transactionId: transaction?._id,
        spinLogId: spinLog._id,
      },
    });
  } catch (error) {
    console.error("Error redeeming spin reward:", error);
    res.status(500).json({
      success: false,
      error: "Failed to redeem reward",
    });
  }
});

// Get spin history
router.get("/history", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const spins = await Transaction.find({
      user: req.user.userId,
      type: "credit",
      description: { $regex: /Spin.*reward/i },
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({
      user: req.user.userId,
      type: "credit",
      description: { $regex: /Spin.*reward/i },
    });

    res.json({
      success: true,
      data: {
        spins: spins.map((spin) => ({
          id: spin.referenceId,
          amount: spin.amount,
          status: spin.status,
          createdAt: spin.createdAt,
          description: spin.description,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting spin history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get spin history",
    });
  }
});

// Helper function to get VIP benefits
async function getUserVIPBenefits(userId) {
  try {
    const VIPTier = require("../models/VIPTier");
    const VIPSubscription = require("../models/VIPSubscription");

    const activeSubscription =
      await VIPSubscription.getActiveSubscription(userId);

    if (!activeSubscription || !activeSubscription.isActive()) {
      return {
        isActive: false,
        xpMultiplier: 1.0,
        unlimitedSpins: false,
      };
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    if (!tier) {
      return {
        isActive: false,
        xpMultiplier: 1.0,
        unlimitedSpins: false,
      };
    }

    return {
      isActive: true,
      xpMultiplier: tier.features.xpMultiplier || 1.0,
      unlimitedSpins: tier.features.unlimitedSpins || false,
    };
  } catch (error) {
    console.error("Error getting VIP benefits:", error);
    return {
      isActive: false,
      xpMultiplier: 1.0,
      unlimitedSpins: false,
    };
  }
}

// Helper function to get last spin time
async function getLastSpinTime(userId) {
  try {
    const lastSpin = await SpinWheelLog.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    return lastSpin ? lastSpin.createdAt : null;
  } catch (error) {
    return null;
  }
}

module.exports = router;

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
    (tier) => normalizeTier(tier) === normalizedUserTier
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
      // DEFAULT_SPIN_CONFIG
      const additional =
        { bronze: 5, silver: 0, gold: 10, platinum: 50, diamond: 0 }[
          userTier.toLowerCase()
        ] || 0;
      dailyLimit = vipBenefits.unlimitedSpins
        ? 999
        : (config.maxSpinsPerDay || 3) + additional;
    }
    const remainingSpins = Math.max(0, dailyLimit - todaySpins);

    // Check cooldown period
    const lastSpinTime = await getLastSpinTime(req.user.userId);
    const cooldownMinutes = config.cooldownMinutes || 360;
    let canSpinByCooldown = true;
    let cooldownRemaining = 0;

    if (lastSpinTime) {
      const timeSinceLastSpin = (now - lastSpinTime) / (1000 * 60); // minutes
      if (timeSinceLastSpin < cooldownMinutes) {
        canSpinByCooldown = false;
        cooldownRemaining = Math.ceil(cooldownMinutes - timeSinceLastSpin);
      }
    }

    // Get VIP multiplier from config
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;

    const canSpin = remainingSpins > 0 && canSpinByCooldown;

    res.json({
      success: true,
      data: {
        canSpin,
        remainingSpins,
        dailyLimit,
        vipMultiplier: vipMultiplier * (vipBenefits.xpMultiplier || 1.0),
        isVIP: vipBenefits.isActive,
        lastSpinTime,
        cooldownMinutes,
        cooldownRemaining,
        reason: !canSpin
          ? !canSpinByCooldown
            ? `Cooldown active. Please wait ${cooldownRemaining} more minutes.`
            : remainingSpins === 0
            ? "Daily spin limit reached"
            : "Cannot spin"
          : null,
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

// Perform spin action
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

    let config = await SpinWheelConfig.findOne({ isActive: true });
    if (!config) {
      config = DEFAULT_SPIN_CONFIG;
    }
    const userTier = user.vip?.level || "Bronze";
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    if (!isEligible) {
      return res.status(403).json({
        success: false,
        error: "Not eligible for this spin wheel",
      });
    }

    // Enforce campaign start/end in UTC - block spin if outside window
    if (!isWithinCampaignWindowUTC(config)) {
      return res.status(403).json({
        success: false,
        error:
          "Spin wheel is not currently active. Please check the campaign dates.",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpins = await SpinWheelLog.countDocuments({
      user: userId,
      createdAt: { $gte: today },
    });

    const vipBenefits = await getUserVIPBenefits(userId);
    let dailyLimit;
    if (config instanceof SpinWheelConfig) {
      dailyLimit = vipBenefits.unlimitedSpins
        ? 999
        : config.getMaxSpinsForUser(userTier);
    } else {
      // DEFAULT_SPIN_CONFIG
      const additional =
        { bronze: 5, silver: 0, gold: 10, platinum: 50, diamond: 0 }[
          userTier.toLowerCase()
        ] || 0;
      dailyLimit = vipBenefits.unlimitedSpins
        ? 999
        : (config.maxSpinsPerDay || 3) + additional;
    }

    if (todaySpins >= dailyLimit) {
      return res.status(400).json({
        success: false,
        error: "Daily spin limit reached",
        data: {
          remainingSpins: 0,
          dailyLimit,
          todaySpins,
        },
      });
    }

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

    // FIXED: Select reward by probability using proper weighted random selection
    // This fixes BUG-065: Rewards with <100% probability should allow "no reward" outcomes
    const totalProbability = eligibleRewards.reduce(
      (sum, r) => sum + (r.probability || 0),
      0
    );

    let selectedReward = null;

    if (totalProbability <= 0) {
      // Fallback: equal probability for all rewards if no probabilities set
      const randomIndex = Math.floor(Math.random() * eligibleRewards.length);
      selectedReward = eligibleRewards[randomIndex];
      console.log(`🎲 Spin: Equal distribution selected ${selectedReward.name}`);
    } else {
      // FIXED ALGORITHM: Generate random in [0, 100) range to allow "no reward" outcomes
      // This is the key fix for BUG-065
      const random = Math.random() * 100;

      // Build cumulative distribution and select reward
      let cumulative = 0;

      for (const reward of eligibleRewards) {
        const prob = reward.probability || 0;
        cumulative += prob;

        // Select reward if random falls within its probability range
        if (random < cumulative) {
          selectedReward = reward;
          break;
        }
      }

      // Log the outcome for debugging
      if (selectedReward) {
        console.log(`🎲 Spin: Selected ${selectedReward.name} (${selectedReward.probability}%) - Random: ${random.toFixed(2)}, Total: ${totalProbability}%`);
      } else {
        console.log(`🎲 Spin: No reward selected - Random: ${random.toFixed(2)}, Total: ${totalProbability}% (${100 - totalProbability}% chance of no reward)`);
      }
    }

    // Handle "no reward" outcome - this is now possible and correct
    if (!selectedReward) {
      // Still need to log the spin and update user stats for no-reward outcomes
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
        isWin: false, // No reward = not a win
      });

      // Update user spin count and last spin time
      user.spinCount = (user.spinCount || 0) + 1;
      user.lastSpinAt = new Date();
      await user.save();

      // Save spin log for no-reward outcome
      await spinLog.save();

      return res.json({
        success: true,
        data: {
          spinId: spinLog._id,
          reward: null,
          noReward: true,
          message: "Better luck next time!",
          totalProbability,
          remainingSpins: Math.max(0, dailyLimit - todaySpins - 1),
          userTier,
          status: "completed",
        },
      });
    }

    // VIP multiplier applies to both coins and XP rewards
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;

    // Apply multiplier to coins and XP, keep other reward types at configured amount
    let finalAmount;
    if (selectedReward.type === "coins" || selectedReward.type === "xp") {
      finalAmount = Math.floor(selectedReward.amount * vipMultiplier);
    } else {
      // For coupon, bonus_task, premium_feature - use exact configured amount
      finalAmount = selectedReward.amount;
    }

    const spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const spinLog = new SpinWheelLog({
      user: userId,
      spinId: spinId,
      reward: selectedReward._id,
      rewardName: selectedReward.name,
      rewardType: selectedReward.type, // Ensure type is correctly stored
      rewardAmount: finalAmount,
      vipMultiplier:
        selectedReward.type === "coins" || selectedReward.type === "xp"
          ? vipMultiplier
          : 1.0, // Log multiplier for coins and XP
      spinMode: config.spinMode || "free",
      userTier: userTier,
      isWin: true,
    });

    // For free spins, automatically credit the reward immediately
    // For ad-based spins, require user to call /redeem after watching ad
    let coinsEarned = 0;
    let xpEarned = 0;
    let transaction = null;

    if (
      config.spinMode === "free" ||
      !config.spinMode ||
      config.spinMode !== "ad_based"
    ) {
      // Auto-credit for free spins
      const rewardType = selectedReward.type;

      if (rewardType === "coins" || rewardType === "coin") {
        coinsEarned = finalAmount;
        user.wallet.balance += coinsEarned;
        user.wallet.lastUpdated = new Date();
        // NO bonus XP for coin rewards - only give coins
        xpEarned = 0;

        // Create transaction record
        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "coins",
          amount: coinsEarned,
          description: `Spin reward - ${selectedReward.name} (${coinsEarned} coins)`,
          status: "completed",
          referenceId: spinLog.spinId || spinLog._id.toString(),
        });
        await transaction.save();

        spinLog.transactionId = transaction._id;
      } else if (rewardType === "xp" || rewardType === "XP") {
        xpEarned = finalAmount;
        user.xp.current += xpEarned;
        user.xp.total += xpEarned;

        // Create transaction record for XP
        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "xp",
          amount: xpEarned,
          description: `Spin reward - ${selectedReward.name} (${xpEarned} XP)`,
          status: "completed",
          referenceId: spinLog.spinId || spinLog._id.toString(),
        });
        await transaction.save();

        spinLog.transactionId = transaction._id;
      }
    }

    // Update user spin count, last spin time, and wallet/XP (if updated)
    user.spinCount = (user.spinCount || 0) + 1;
    user.lastSpinAt = new Date();
    await user.save();

    // Save spin log
    await spinLog.save();

    // Update reward stats
    await SpinWheelReward.findByIdAndUpdate(selectedReward._id, {
      $inc: { "stats.totalWins": 1 },
      $set: { "stats.lastWon": new Date() },
    });

    res.json({
      success: true,
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
        vipMultiplier,
        isVIP: vipBenefits.isActive,
        userTier,
        status: config.spinMode === "ad_based" ? "pending" : "completed",
        message:
          config.spinMode === "ad_based"
            ? "Watch video ad to claim your reward!"
            : "Reward credited successfully!",
        // Include credited amounts for free spins
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

function selectRewardByProbability(rewards) {
  const cumulative = [];
  let sum = 0;
  for (const reward of rewards) {
    sum += reward.probability || 0;
    cumulative.push({ reward, cumulative: sum });
  }

  // Generate random number between 0 and total probability
  const random = Math.random() * sum;

  // Find the reward that matches the random number
  for (const item of cumulative) {
    if (random <= item.cumulative) {
      return item.reward;
    }
  }

  // Fallback to first reward if something goes wrong
  return rewards[0];
}

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
      // Only give XP for XP rewards - use exact configured amount (no multiplier)
      xpEarned = spinLog.rewardAmount; // This is the exact configured amount, no multiplier applied
      user.xp.current += xpEarned;
      user.xp.total += xpEarned;
      // Do NOT give coins for XP rewards

      // Create transaction record for XP
      transaction = new Transaction({
        user: userId,
        type: "credit",
        balanceType: "xp",
        amount: xpEarned,
        description: `Spin reward - ${spinLog.rewardName} (${xpEarned} XP)`,
        status: "completed",
        referenceId: spinLog.spinId || spinLog._id.toString(),
      });
      await transaction.save();

      if (!spinLog.transactionId) {
        spinLog.transactionId = transaction._id;
        await spinLog.save();
      }
    } else if (rewardType === "coupon") {
      // Handle coupon reward - store in metadata or user's coupon list
      const reward = await SpinWheelReward.findById(spinLog.reward);
      couponCode = reward?.metadata?.couponCode || `COUPON-${Date.now()}`;
      // You may want to store this in a separate Coupon model or user metadata
      // For now, we'll just return it in the response
    } else if (
      rewardType === "bonus_task" ||
      rewardType === "premium_feature"
    ) {
      // Handle other reward types - no coins or XP, just metadata
      const reward = await SpinWheelReward.findById(spinLog.reward);
      // Store in user metadata or handle separately
    }

    // Create transaction for coins (XP transactions are created above)
    if (rewardType === "coins" || rewardType === "coin") {
      if (transaction) {
        transaction.status = "completed";
        transaction.amount = spinLog.rewardAmount;
        transaction.description = `Spin reward - ${spinLog.rewardName} (${spinLog.rewardAmount} coins)`;
      } else {
        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "coins",
          amount: spinLog.rewardAmount,
          description: `Spin reward - ${spinLog.rewardName} (${spinLog.rewardAmount} coins)`,
          status: "completed",
          referenceId: spinLog.spinId || spinLog._id.toString(),
        });
      }
      await transaction.save();

      if (!spinLog.transactionId) {
        spinLog.transactionId = transaction._id;
        await spinLog.save();
      }
    }

    await user.save();

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

    const activeSubscription = await VIPSubscription.getActiveSubscription(
      userId
    );

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

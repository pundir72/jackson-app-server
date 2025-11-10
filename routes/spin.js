const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const SpinWheelConfig = require("../models/SpinWheelConfig");
const SpinWheelReward = require("../models/SpinWheelReward");
const SpinWheelLog = require("../models/SpinWheelLog");

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

    // Check date restrictions
    const now = new Date();
    const isWithinDateRange =
      (!config.startDate || now >= config.startDate) &&
      (!config.endDate || now <= config.endDate);

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
    const config = await getSpinWheelConfig();

    // Get user's VIP tier
    const userTier = user.vip?.level || "Bronze";

    // Check if user is eligible based on config tier restrictions
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    // Check date restrictions
    const now = new Date();
    const isWithinDateRange =
      (!config.startDate || now >= config.startDate) &&
      (!config.endDate || now <= config.endDate);

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
    const dailyLimit = vipBenefits.unlimitedSpins
      ? 999
      : config.maxSpinsPerDay || 3;
    const remainingSpins = Math.max(0, dailyLimit - todaySpins);

    // Get VIP multiplier from config
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;

    res.json({
      success: true,
      data: {
        canSpin: remainingSpins > 0,
        remainingSpins,
        dailyLimit,
        vipMultiplier: vipMultiplier * (vipBenefits.xpMultiplier || 1.0),
        isVIP: vipBenefits.isActive,
        lastSpinTime: await getLastSpinTime(req.user.userId),
        cooldownMinutes: config.cooldownMinutes || 360,
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

    const config = await getSpinWheelConfig();
    const userTier = user.vip?.level || "Bronze";
    const isEligible = isTierEligible(userTier, config.eligibleTiers);

    if (!isEligible) {
      return res.status(403).json({
        success: false,
        error: "Not eligible for this spin wheel",
      });
    }

    const now = new Date();
    const isWithinDateRange =
      (!config.startDate || now >= config.startDate) &&
      (!config.endDate || now <= config.endDate);

    if (!isWithinDateRange) {
      return res.status(403).json({
        success: false,
        error: "Spin wheel is not active",
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpins = await SpinWheelLog.countDocuments({
      user: userId,
      createdAt: { $gte: today },
    });

    const vipBenefits = await getUserVIPBenefits(userId);
    const dailyLimit = vipBenefits.unlimitedSpins
      ? 999
      : config.maxSpinsPerDay || 3;

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

    // Select reward by probability
    const totalProbability = eligibleRewards.reduce(
      (sum, r) => sum + (r.probability || 0),
      0
    );

    const cumulative = [];
    let sum = 0;
    for (let i = 0; i < eligibleRewards.length; i++) {
      const reward = eligibleRewards[i];
      const prob = reward.probability || 0;
      sum += prob;
      cumulative.push({ reward, cumulative: sum });
    }

    const random = Math.random() * totalProbability;
    let selectedReward = null;
    for (const item of cumulative) {
      if (random <= item.cumulative) {
        selectedReward = item.reward;
        break;
      }
    }

    if (!selectedReward) {
      selectedReward = eligibleRewards[0];
    }

    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;
    const finalAmount = Math.floor(selectedReward.amount * vipMultiplier);

    const spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const spinLog = new SpinWheelLog({
      user: userId,
      spinId: spinId,
      reward: selectedReward._id,
      rewardName: selectedReward.name,
      rewardType: selectedReward.type,
      rewardAmount: finalAmount,
      vipMultiplier: vipMultiplier,
      spinMode: config.spinMode || "free",
      userTier: userTier,
      isWin: true,
    });

    await spinLog.save();

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
        status: "pending",
        message:
          config.spinMode === "ad_based"
            ? "Watch video ad to claim your reward!"
            : "Reward will be credited shortly!",
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

      const xpEarned = Math.floor(transaction.amount * 0.5);
      user.xp.current += xpEarned;
      user.xp.total += xpEarned;

      transaction.status = "completed";
      transaction.description = `Spin reward - ${transaction.amount} coins`;

      await Promise.all([user.save(), transaction.save()]);

      return res.json({
        success: true,
        data: {
          reward: transaction.amount,
          xpEarned,
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
          xpEarned: Math.floor(existingTransaction.amount * 0.5),
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

    user.wallet.balance += spinLog.rewardAmount;
    user.wallet.lastUpdated = new Date();

    const xpEarned = Math.floor(spinLog.rewardAmount * 0.5);
    user.xp.current += xpEarned;
    user.xp.total += xpEarned;

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

    await user.save();

    res.json({
      success: true,
      data: {
        reward: spinLog.rewardAmount,
        xpEarned,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        message: "Reward claimed successfully!",
        transactionId: transaction._id,
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

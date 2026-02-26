const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const protect = require("../middleware/auth");
const DailyRewardProgress = require("../models/DailyRewardProgress");
const DailyRewardConfigV2 = require("../models/DailyRewardConfigV2");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { trackAchievements } = require("../utils/achievements");
const { applyTierMultiplierToXPV2 } = require("../utils/xpTierMultiplierV2");
const {
  loadUserWeekProgress,
  getUserWeekMetadata,
  getUserDayNumber,
  getUserWeekBounds,
} = require("../utils/dailyRewardUserWeekHelper");

/**
 * Daily Rewards V3 - User-Based Week System
 *
 * KEY DIFFERENCE FROM V2:
 * - V2: Uses calendar weeks (Monday-Sunday)
 * - V3: Uses user-specific weeks (starts from join date)
 *
 * EXAMPLE:
 * - User joins Wednesday → Week 1 = Wed-Tue, Week 2 = Wed-Tue
 * - User joins Friday → Week 1 = Fri-Thu, Week 2 = Fri-Thu
 *
 * BENEFITS:
 * - Every user gets full 7-day experience
 * - No "missed" days before join
 * - Simpler logic (no calendar week complexity)
 * - Always shows Day 1, 2, 3... (never calendar days)
 */

async function loadConfig() {
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({
    version: -1,
  });
  if (cfg) return cfg;
  return null;
}

// Helper function to apply multiplier with rounding
function applyMultiplier(value, multiplier, roundingRule = "Round Nearest") {
  const result = value * multiplier;
  switch (roundingRule) {
    case "Round Up":
      return Math.ceil(result);
    case "Round Down":
      return Math.floor(result);
    case "Round Nearest":
    default:
      return Math.round(result);
  }
}

function getWeekMultiplier(weeklyMultiplier, weekNumber) {
  console.log(
    `[getWeekMultiplier] weekNumber=${weekNumber}, enabled=${weeklyMultiplier?.enabled}`,
  );

  if (!weeklyMultiplier?.enabled || weekNumber <= 1) {
    console.log(`[getWeekMultiplier] returning 1.0 (disabled or week <= 1)`);
    return 1.0;
  }

  const configured = [];
  if (weeklyMultiplier.week2)
    configured.push({ weekNumber: 2, multiplier: weeklyMultiplier.week2 });
  if (weeklyMultiplier.week3)
    configured.push({ weekNumber: 3, multiplier: weeklyMultiplier.week3 });
  if (weeklyMultiplier.week4)
    configured.push({ weekNumber: 4, multiplier: weeklyMultiplier.week4 });
  if (weeklyMultiplier.additionalWeeks?.length) {
    weeklyMultiplier.additionalWeeks.forEach((w) => {
      if (w.weekNumber && w.multiplier) {
        configured.push({ weekNumber: w.weekNumber, multiplier: w.multiplier });
      }
    });
  }

  console.log(
    `[getWeekMultiplier] configured entries:`,
    JSON.stringify(configured),
  );

  if (configured.length === 0) {
    console.log(`[getWeekMultiplier] no entries configured, returning 1.0`);
    return 1.0;
  }

  configured.sort((a, b) => a.weekNumber - b.weekNumber);

  // Exact match, or fall back to last configured week <= current week
  let result = configured[0].multiplier;
  for (const entry of configured) {
    if (entry.weekNumber <= weekNumber) {
      result = entry.multiplier;
    } else {
      break;
    }
  }

  console.log(`[getWeekMultiplier] result for week ${weekNumber} = ${result}`);
  return result;
}

// GET /api/daily-rewards-v3/week
router.get("/week", protect, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const now = new Date();

    // Normalize dates for comparison (ignore time)
    const requestDate = new Date(date);
    requestDate.setUTCHours(0, 0, 0, 0);

    const todayDate = new Date(now);
    todayDate.setUTCHours(0, 0, 0, 0);

    // Check if requesting future date
    if (requestDate > todayDate) {
      return res.status(400).json({
        success: false,
        error: "Cannot access future weeks",
      });
    }

    const user = await User.findById(req.user.userId).select("createdAt");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Ensure createdAt is a valid Date object
    let userCreatedAt = user.createdAt;

    if (!userCreatedAt) {
      console.log(
        `⚠️ User ${req.user.userId} has no createdAt, using current date`,
      );
      userCreatedAt = new Date();
    } else if (typeof userCreatedAt === "string") {
      console.log(
        `⚠️ User ${req.user.userId} createdAt is string, converting to Date`,
      );
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(
          `❌ Invalid date string for user ${req.user.userId}, using current date`,
        );
        userCreatedAt = new Date();
      }
    } else if (!(userCreatedAt instanceof Date)) {
      console.log(
        `⚠️ User ${req.user.userId} createdAt is not Date object, converting`,
      );
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(
          `❌ Cannot convert createdAt for user ${req.user.userId}, using current date`,
        );
        userCreatedAt = new Date();
      }
    }

    // Check if requesting date before user joined (compare dates only)
    const joinDate = new Date(userCreatedAt);
    joinDate.setUTCHours(0, 0, 0, 0);

    if (requestDate < joinDate) {
      return res.status(400).json({
        success: false,
        error: "Cannot access dates before your account creation",
      });
    }

    // Load user's week progress
    const progress = await loadUserWeekProgress(req.user.userId, date);

    if (!progress) {
      return res.status(500).json({
        success: false,
        error: "Failed to load daily reward progress",
      });
    }

    // Load config
    const cfg = await loadConfig();
    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
        message: "Please contact support if you believe this is an error",
      });
    }

    // Get user's week metadata
    const weekMetadata = getUserWeekMetadata(userCreatedAt, now);
    const todayDayNumber = getUserDayNumber(userCreatedAt, now);
    const { weekNumber } = getUserWeekBounds(userCreatedAt, now);

    // Calculate weekly multiplier
    console.log(
      `[GET /week] user week=${weekNumber}, weeklyMultiplier config:`,
      JSON.stringify(cfg.weeklyMultiplier),
    );
    const weekMultiplier = getWeekMultiplier(cfg.weeklyMultiplier, weekNumber);
    console.log(`[GET /week] resolved weekMultiplier=${weekMultiplier}`);

    // Enrich days with config data
    const enrichedDays = progress.days.map((day) => {
      const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);

      if (!dayConfig) {
        return {
          ...day.toObject(),
          active: false,
          status: day.status === "claimed" ? "claimed" : "locked",
          rewardType: "Both",
          rewardCoins: 0,
          rewardXp: 0,
          claimButtonLabel: "CLAIM NOW",
          timerLabel: "Next reward in",
          claimableOnLoginOnly: false,
        };
      }

      // Check if day is active
      const isDayActive = dayConfig.active !== false;
      let dayStatus = day.status;
      if (!isDayActive && day.status !== "claimed") {
        dayStatus = "locked";
      }

      // Get base reward values
      const rewardType = dayConfig.rewardType || "Both";
      let baseCoins = 0;
      let baseXP = 0;

      if (rewardType === "Coins" || rewardType === "Both") {
        baseCoins =
          dayConfig.coinValue !== undefined
            ? dayConfig.coinValue
            : dayConfig.coins || 0;
      }
      if (rewardType === "XP" || rewardType === "Both") {
        baseXP =
          dayConfig.xpValue !== undefined
            ? dayConfig.xpValue
            : dayConfig.xp || 0;
      }

      // Apply weekly multiplier if enabled and week > 1
      let finalCoins = baseCoins;
      let finalXP = baseXP;
      if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
        const roundingRule =
          cfg.weeklyMultiplier?.roundingRule || "Round Nearest";
        finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
        finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
      }

      return {
        ...day.toObject(),
        status: dayStatus,
        active: isDayActive,
        rewardType: rewardType,
        rewardCoins: finalCoins,
        rewardXp: finalXP,
        claimButtonLabel: dayConfig.claimButtonLabel || "CLAIM NOW",
        timerLabel: dayConfig.timerLabel || "Next reward in",
        claimableOnLoginOnly: dayConfig.claimableOnLoginOnly || false,
      };
    });

    // Calculate countdown to next day
    const endOfDay = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    const countdown = Math.max(0, endOfDay - now);

    // Check big reward eligibility
    const isBigRewardEligible = progress.days
      .slice(0, 6)
      .every((d) => d.status === "claimed");

    return res.json({
      success: true,
      data: {
        weekKey: progress.weekKey,
        weekStart: progress.weekStart,
        weekEnd: progress.weekEnd,
        todayDayNumber,
        days: enrichedDays,
        bigRewardEligible: isBigRewardEligible,
        bigRewardGranted: progress.bigRewardGranted || false,
        countdown,
        weekNumber,
        weeklyMultiplier: {
          enabled: cfg.weeklyMultiplier?.enabled || false,
          currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
          status: cfg.weeklyMultiplier?.enabled
            ? `Weekly Multiplier: Week ${weekNumber} (${weekMultiplier}x)`
            : "Weekly Multiplier: Disabled",
        },
        bigReward: {
          enabled: cfg.bigReward?.enabled !== false,
          downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false,
          coins:
            cfg.bigReward?.coinValue !== undefined
              ? cfg.bigReward.coinValue
              : cfg.bigReward?.coins || 0,
          xp:
            cfg.bigReward?.xpValue !== undefined
              ? cfg.bigReward.xpValue
              : cfg.bigReward?.xp || 0,
          awardBadge: cfg.bigReward?.awardBadge || false,
        },
        userWeek: weekMetadata,
        displayMode: "USER_RELATIVE",
        isUserWeek: true,
      },
    });
  } catch (e) {
    console.error("Error getting daily reward V3 week:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to get daily reward week" });
  }
});

// POST /api/daily-rewards-v3/claim
router.post("/claim", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    const user = await User.findById(userId).select(
      "createdAt wallet xp badges",
    );
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Ensure createdAt is a valid Date object
    let userCreatedAt = user.createdAt;

    if (!userCreatedAt) {
      console.log(`⚠️ User ${userId} has no createdAt, using current date`);
      userCreatedAt = new Date();
    } else if (typeof userCreatedAt === "string") {
      console.log(`⚠️ User ${userId} createdAt is string, converting to Date`);
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(
          `❌ Invalid date string for user ${userId}, using current date`,
        );
        userCreatedAt = new Date();
      }
    } else if (!(userCreatedAt instanceof Date)) {
      console.log(`⚠️ User ${userId} createdAt is not Date object, converting`);
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(
          `❌ Cannot convert createdAt for user ${userId}, using current date`,
        );
        userCreatedAt = new Date();
      }
    }

    const todayDayNumber = getUserDayNumber(userCreatedAt, now);

    const progress = await loadUserWeekProgress(userId, now);
    const cfg = await loadConfig();

    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
      });
    }

    const day = progress.days.find((d) => d.dayNumber === todayDayNumber);

    if (!day || day.status !== "claimable") {
      return res
        .status(400)
        .json({ success: false, error: "Reward not claimable" });
    }

    const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);
    if (!dayConfig) {
      return res
        .status(400)
        .json({ success: false, error: "Day configuration not found" });
    }

    if (dayConfig.active === false) {
      return res
        .status(400)
        .json({ success: false, error: "This day's reward is not active" });
    }

    const { weekNumber } = getUserWeekBounds(userCreatedAt, now);

    // Calculate weekly multiplier
    console.log(
      `[POST /claim] user week=${weekNumber}, weeklyMultiplier config:`,
      JSON.stringify(cfg.weeklyMultiplier),
    );
    const weekMultiplier = getWeekMultiplier(cfg.weeklyMultiplier, weekNumber);
    console.log(`[POST /claim] resolved weekMultiplier=${weekMultiplier}`);

    const roundingRule = cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

    // Get base rewards
    let baseCoins = 0;
    let baseXP = 0;

    // Check for big reward (day 7)
    let bigReward = null;
    if (day.dayNumber === 7 && cfg.bigReward?.enabled !== false) {
      const downgradeOnMiss = cfg.bigReward.downgradeOnMiss !== false;

      if (downgradeOnMiss) {
        const allDays1to6Claimed = progress.days
          .slice(0, 6)
          .every((d) => d.status === "claimed");
        if (allDays1to6Claimed) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      } else {
        bigReward = cfg.bigReward;
        progress.bigRewardEligible = true;
        progress.bigRewardGranted = true;
      }

      if (bigReward) {
        const bigRewardType = bigReward.rewardType || "Both";
        if (bigRewardType === "Coins" || bigRewardType === "Both") {
          baseCoins =
            bigReward.coinValue !== undefined
              ? bigReward.coinValue
              : bigReward.coins || 0;
        }
        if (bigRewardType === "XP" || bigRewardType === "Both") {
          baseXP =
            bigReward.xpValue !== undefined
              ? bigReward.xpValue
              : bigReward.xp || 0;
        }
      } else {
        // Fallback to day 6 values
        const day6Config = cfg.days.find((d) => d.dayNumber === 6);
        if (day6Config && day6Config.active) {
          const rewardType = day6Config.rewardType || "Both";
          if (rewardType === "Coins" || rewardType === "Both") {
            baseCoins =
              day6Config.coinValue !== undefined
                ? day6Config.coinValue
                : day6Config.coins || 0;
          }
          if (rewardType === "XP" || rewardType === "Both") {
            baseXP =
              day6Config.xpValue !== undefined
                ? day6Config.xpValue
                : day6Config.xp || 0;
          }
        }
      }
    } else {
      // Normal day rewards
      const rewardType = dayConfig.rewardType || "Both";
      if (rewardType === "Coins" || rewardType === "Both") {
        baseCoins =
          dayConfig.coinValue !== undefined
            ? dayConfig.coinValue
            : dayConfig.coins || 0;
      }
      if (rewardType === "XP" || rewardType === "Both") {
        baseXP =
          dayConfig.xpValue !== undefined
            ? dayConfig.xpValue
            : dayConfig.xp || 0;
      }
    }

    // Apply weekly multiplier
    let finalCoins = baseCoins;
    let finalXP = baseXP;
    if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
      finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
      finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
    }

    const coins = finalCoins;
    const xp = finalXP;

    // Credit rewards
    const oldBalance = user.wallet.balance || 0;
    const oldXP = user.xp.current || 0;

    user.wallet.balance = oldBalance + coins;
    user.wallet.lastUpdated = now;

    const { finalXP: finalXPWithTier, multiplier: tierMultiplier } =
      await applyTierMultiplierToXPV2(user, xp || 0);

    user.xp.current = oldXP + finalXPWithTier;
    user.xp.total = (user.xp.total || 0) + finalXPWithTier;

    if (bigReward && cfg.bigReward?.awardBadge && cfg.bigReward?.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName))
        user.badges.push(cfg.bigReward.badgeName);
    }

    const tx = new Transaction({
      user: userId,
      type: "credit",
      amount: coins,
      description: `Daily Reward Day ${day.dayNumber}${bigReward ? " (Big Reward)" : ""} - Week ${weekNumber}`,
      status: "completed",
      metadata: {
        rewardDay: day.dayNumber,
        bigReward: !!bigReward,
        baseXp: xp,
        xp: finalXPWithTier,
        tierMultiplier,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        userWeekSystem: true,
      },
    });

    await Promise.all([user.save(), tx.save()]);

    // Mark as claimed
    day.status = "claimed";
    day.claimedAt = now;
    day.coins = coins;
    day.xp = xp;

    // Update next day status
    if (day.dayNumber < 7) {
      const nextDay = progress.days.find(
        (d) => d.dayNumber === day.dayNumber + 1,
      );
      if (nextDay && nextDay.status === "locked") {
        nextDay.status = "claimable";
      }
    }

    progress.lastUpdated = now;
    await progress.save();

    // Track achievements
    setImmediate(async () => {
      try {
        const totalClaimed = await DailyRewardProgress.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: "$days" },
          { $match: { "days.status": "claimed" } },
          { $count: "total" },
        ]);

        const dailyRewardsClaimed =
          totalClaimed.length > 0 ? totalClaimed[0].total : 0;

        await trackAchievements(userId, "wallet", {
          coins: coins,
          xp: xp,
          dayNumber: day.dayNumber,
          bigReward: !!bigReward,
          category: "daily_reward_v3",
          dailyRewardsClaimed: dailyRewardsClaimed,
          weekNumber: weekNumber,
        });
      } catch (error) {
        console.error("Error tracking daily reward V3 achievements:", error);
      }
    });

    res.json({
      success: true,
      data: {
        day: day.dayNumber,
        coins,
        baseXP: xp,
        xp: finalXPWithTier,
        tierMultiplier: tierMultiplier,
        bigReward: !!bigReward,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
      },
    });
  } catch (e) {
    console.error("Error claiming daily reward V3:", e);
    res.status(500).json({
      success: false,
      error: "Failed to claim daily reward",
      message: process.env.NODE_ENV === "development" ? e.message : undefined,
    });
  }
});

// GET /api/daily-rewards-v3/history
router.get("/history", protect, async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const records = await DailyRewardProgress.find({
      userId: req.user.userId,
      weekKey: { $regex: /^USER-W/ }, // Only user-based weeks
    })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({ success: true, data: records });
  } catch (e) {
    console.error("Error getting daily reward V3 history:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to get daily reward history" });
  }
});

module.exports = router;

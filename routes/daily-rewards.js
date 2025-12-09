const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const protect = require("../middleware/auth");
const DailyRewardProgress = require("../models/DailyRewardProgress");
const DailyRewardConfigV2 = require("../models/DailyRewardConfigV2");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const {
  getISOWeekKey,
  getWeekBoundsUtc,
  initWeekDays,
} = require("../utils/dailyRewardHelpers");
const {
  calculateUserWeekNumber,
  getWeekMultiplier,
  applyMultiplier,
} = require("../utils/dailyRewardHelpersV2");
const { trackAchievements } = require("../utils/achievements");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const { getTierKeyFromXPV2 } = require("../utils/xpTierMultiplierV2");
const XPMultiplier = require("../models/XPMultiplier");

// Load or create weekly progress
async function loadProgress(userId, dateUtc = new Date()) {
  // Always use actual current date for logic, not the requested date
  const now = new Date();
  const currentWeekKey = getISOWeekKey(now);
  const requestedWeekKey = getISOWeekKey(dateUtc);
  const isCurrentWeek = requestedWeekKey === currentWeekKey;

  const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
  const weekKey = requestedWeekKey;

  // Get user account creation date to enforce access restriction
  const user = await User.findById(userId).select("createdAt");
  if (!user) {
    return null; // User not found
  }

  const userCreatedAt = user.createdAt || new Date();

  // Check if requested week is before user account creation
  // User should only access data from their account creation date onward
  // Allow access if the week contains or is after the user's creation date
  if (weekEnd < userCreatedAt) {
    // Entire week is before user account was created - not allowed
    return null;
  }

  let progress = await DailyRewardProgress.findOne({ userId, weekKey });

  // Calculate today's index using actual current date (not requested date)
  const todayIdx = (now.getUTCDay() + 6) % 7; // 0..6 Mon..Sun

  if (!progress) {
    // Check if this is a future week (not allowed)
    const requestedDate = new Date(dateUtc);
    if (requestedDate > now) {
      // Future week - return null
      return null;
    }

    progress = await DailyRewardProgress.create({
      userId,
      weekKey,
      weekStart,
      weekEnd,
      days: initWeekDays(),
    });

    // Initialize states based on whether it's current week and user creation date
    let changed = false;

    // Check if this week contains the user's creation date
    const weekContainsUserCreation =
      weekStart <= userCreatedAt && weekEnd >= userCreatedAt;

    // Calculate which day of the week the user was created (0-6, Mon-Sun) within this specific week
    let userCreatedDayIdx = -1;
    if (weekContainsUserCreation) {
      // Calculate days difference from week start to user creation date
      const daysDiff = Math.floor(
        (userCreatedAt - weekStart) / (24 * 60 * 60 * 1000)
      );
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
    }

    if (isCurrentWeek) {
      // Current week: use actual today's index
      // Past days missed, today claimable, future days locked
      // But also check user creation date - days before user creation should be missed
      progress.days.forEach((d, idx) => {
        // If user was created in this week, mark days before creation as missed
        if (weekContainsUserCreation && idx < userCreatedDayIdx) {
          d.status = "missed";
          changed = true;
        } else if (idx < todayIdx && d.status === "locked") {
          d.status = "missed";
          changed = true;
        } else if (idx === todayIdx && d.status === "locked") {
          d.status = "claimable";
          changed = true;
        }
        // Future days remain locked
      });
    } else {
      // Previous week: check if user was created in this week
      if (weekContainsUserCreation) {
        // User was created in this week - mark days before creation as missed
        progress.days.forEach((d, idx) => {
          if (idx < userCreatedDayIdx && d.status === "locked") {
            d.status = "missed";
            changed = true;
          } else if (idx >= userCreatedDayIdx && d.status === "locked") {
            d.status = "missed"; // Past week days after creation are also missed
            changed = true;
          }
        });
      } else {
        // Entire week is before or after user creation - all days should be missed
        progress.days.forEach((d) => {
          if (d.status === "locked") {
            d.status = "missed";
            changed = true;
          }
        });
      }
    }

    if (changed) await progress.save();
  }

  // Safety net: ensure proper status based on actual current date and user creation date
  // For current week: today is claimable, past days are missed
  // For previous weeks: all days should be either claimed or missed (never locked or claimable)
  // Also ensure days before user creation are marked as missed
  let changed = false;

  // Check if this week contains the user's creation date
  const weekContainsUserCreation =
    weekStart <= userCreatedAt && weekEnd >= userCreatedAt;

  // Calculate which day of the week the user was created (0-6, Mon-Sun) within this specific week
  let userCreatedDayIdx = -1;
  if (weekContainsUserCreation) {
    // Calculate days difference from week start to user creation date
    const daysDiff = Math.floor(
      (userCreatedAt - weekStart) / (24 * 60 * 60 * 1000)
    );
    userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
  }

  progress.days.forEach((d, idx) => {
    // Don't change already claimed rewards
    if (d.status === "claimed") return;

    // First check: days before user creation should always be missed
    if (weekContainsUserCreation && idx < userCreatedDayIdx) {
      if (d.status !== "missed") {
        d.status = "missed";
        changed = true;
      }
      return; // Skip other checks for days before creation
    }

    if (isCurrentWeek) {
      // Current week logic: use actual today's index
      // Past days missed, today claimable, future days locked
      if (idx < todayIdx) {
        // Past day - should be missed
        if (d.status === "locked" || d.status === "claimable") {
          d.status = "missed";
          changed = true;
        }
      } else if (idx === todayIdx) {
        // Today - should be claimable
        if (d.status === "locked") {
          d.status = "claimable";
          changed = true;
        }
      }
      // Future days remain locked (no change needed)
    } else {
      // Previous week logic: all days should be either claimed or missed (never locked or claimable)
      if (d.status === "locked" || d.status === "claimable") {
        d.status = "missed";
        changed = true;
      }
    }
  });

  if (changed) await progress.save();
  return progress;
}

async function loadConfig() {
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({
    version: -1,
  });
  if (cfg) return cfg;
  // Fallback default (V2 structure)
  return {
    version: 2,
    days: Array.from({ length: 7 }, (_, i) => ({
      dayNumber: i + 1,
      active: true,
      rewardType: "Both",
      coinValue: 10,
      xpValue: 5,
      coins: 10,
      xp: 5,
    })),
    bigReward: {
      enabled: true,
      rewardType: "Both",
      coinValue: 200,
      xpValue: 100,
      coins: 200,
      xp: 100,
      awardBadge: false,
    },
    fallbackReward: { coins: 50, xp: 25 },
  };
}

// GET /api/daily-rewards/week?date=YYYY-MM-DD
router.get("/week", protect, async (req, res) => {
  try {
    // Use UTC date to avoid timezone issues
    // If date query provided, parse it; otherwise use current UTC date
    let date;
    if (req.query.date) {
      date = new Date(req.query.date);
    } else {
      // Get current UTC date (not local time)
      const nowUtc = new Date();
      date = new Date(
        Date.UTC(
          nowUtc.getUTCFullYear(),
          nowUtc.getUTCMonth(),
          nowUtc.getUTCDate()
        )
      );
    }
    const now = new Date();
    // Also ensure 'now' is in UTC for consistency
    const nowUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    console.log("=== DAILY REWARDS WEEK DEBUG ===");
    console.log("Requested date (local):", date.toString());
    console.log("Requested date (UTC):", date.toISOString());
    console.log("Current date (local):", now.toString());
    console.log("Current date (UTC):", nowUtc.toISOString());
    console.log("Requested week key:", getISOWeekKey(date));
    console.log("Current week key:", getISOWeekKey(nowUtc));

    // Use UTC dates for comparison (already set to midnight UTC)
    const startOfDate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
    const startOfNow = new Date(
      Date.UTC(
        nowUtc.getUTCFullYear(),
        nowUtc.getUTCMonth(),
        nowUtc.getUTCDate()
      )
    );

    // Validate date - ensure it's not a future date
    if (startOfDate > startOfNow) {
      return res.status(400).json({
        success: false,
        error: "Cannot access future weeks",
      });
    }

    // Get user account creation date and XP
    const user = await User.findById(req.user.userId).select("createdAt xp");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userCreatedAt = user.createdAt || new Date();
    const startOfUserCreatedAt = new Date(userCreatedAt.setHours(0, 0, 0, 0));

    // Compare only by date (ignore time)
    if (startOfUserCreatedAt > startOfDate) {
      return res.status(400).json({
        success: false,
        error:
          "You can only access data from your account creation date onward",
      });
    }

    // Check if requested week is before user account creation
    // Ensure date is in UTC format for getWeekBoundsUtc
    const dateUtc = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
    const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
    console.log("Week bounds:", {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weekKey: getISOWeekKey(dateUtc),
    });

    // Allow access if the week contains or is after the user's creation date
    if (weekEnd < userCreatedAt) {
      // Requested week is before user account was created - redirect to current week
      const progress = await loadProgress(req.user.userId, nowUtc);

      if (!progress) {
        return res.status(500).json({
          success: false,
          error: "Failed to load current week progress",
        });
      }

      // Load admin configuration to include reward values
      const cfg = await loadConfig();

      // Calculate week number and multiplier
      const today = new Date();
      const weekNumber = await calculateUserWeekNumber(
        req.user.userId,
        today,
        DailyRewardProgress
      );
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      const roundingRule =
        cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

      // Get user's XP tier multiplier for coins (user already loaded above)
      let xpTierMultiplier = 1.0;
      if (user && user.xp && user.xp.current !== undefined) {
        try {
          const tierKey = await getTierKeyFromXPV2(
            userForMultiplier.xp.current
          );
          const multiplierDoc = await XPMultiplier.findOne({
            tier: tierKey,
            isActive: true,
          }).lean();
          xpTierMultiplier = multiplierDoc?.multiplier || 1.0;
        } catch (error) {
          console.error(
            "Error getting XP tier multiplier for daily rewards:",
            error
          );
        }
      }

      // Enrich days with reward values from config (ONLY from admin config V2, no fallbacks)
      const enrichedDays = progress.days.map((day) => {
        const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);
        // Use admin config V2 values only - check if day is active
        if (!dayConfig || !dayConfig.active) {
          return {
            ...day.toObject(),
            rewardCoins: 0,
            rewardXp: 0,
          };
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
          finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
          finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
        }

        // Apply XP tier multiplier to XP only (after weekly multiplier)
        if (xpTierMultiplier > 1.0) {
          finalXP = applyMultiplier(finalXP, xpTierMultiplier, roundingRule);
        }

        return {
          ...day.toObject(),
          // Include reward values from admin config V2 (with weekly multiplier and XP tier multiplier applied)
          rewardCoins: finalCoins,
          rewardXp: finalXP,
        };
      });

      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      // Calculate end of day in local timezone (not UTC) for accurate countdown
      const endOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      );

      return res.json({
        success: true,
        data: {
          weekKey: progress.weekKey,
          weekStart: progress.weekStart,
          weekEnd: progress.weekEnd,
          todayDayNumber,
          days: enrichedDays,
          bigRewardEligible: progress.bigRewardEligible,
          bigRewardGranted: progress.bigRewardGranted,
          countdown: Math.max(0, endOfDay - today),
          weekNumber,
          weeklyMultiplier: {
            enabled: cfg.weeklyMultiplier?.enabled || false,
            currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
            status: cfg.weeklyMultiplier?.enabled
              ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
              : "Weekly Multiplier: Disabled",
          },
          // Include big reward configuration from admin V2
          bigReward: {
            enabled: cfg.bigReward?.enabled ?? true,
            coins: cfg.bigReward?.coinValue ?? cfg.bigReward?.coins ?? 200,
            xp: cfg.bigReward?.xpValue ?? cfg.bigReward?.xp ?? 100,
            awardBadge: cfg.bigReward?.awardBadge ?? false,
          },
        },
        message:
          "You can only access data from your account creation date onward",
      });
    }

    const progress = await loadProgress(req.user.userId, dateUtc);
    console.log(
      "Loaded progress week key:",
      progress ? progress.weekKey : "null"
    );
    console.log("=== END DAILY REWARDS WEEK DEBUG ===");

    // If loadProgress returns null (access denied or error)
    if (!progress) {
      // Fallback to current week
      const currentProgress = await loadProgress(req.user.userId, now);

      if (!currentProgress) {
        console.log("=== END DAILY REWARDS WEEK DEBUG ===");
        return res.status(500).json({
          success: false,
          error: "Failed to load current week progress",
        });
      }

      // Load admin configuration to include reward values
      const cfg = await loadConfig();

      // Calculate week number and multiplier
      const today = new Date();
      const weekNumber = await calculateUserWeekNumber(
        req.user.userId,
        today,
        DailyRewardProgress
      );
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      const roundingRule =
        cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

      // Enrich days with reward values from config (ONLY from admin config, no fallbacks)
      const enrichedDays = currentProgress.days.map((day) => {
        const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);
        // Use admin config values only - if not found, config is invalid
        if (!dayConfig || !dayConfig.active) {
          return {
            ...day.toObject(),
            rewardCoins: 0,
            rewardXp: 0,
          };
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
          finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
          finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
        }

        return {
          ...day.toObject(),
          // Include reward values from admin config (with weekly multiplier applied)
          rewardCoins: finalCoins,
          rewardXp: finalXP,
        };
      });

      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      // Calculate end of day in local timezone (not UTC) for accurate countdown
      const endOfDay = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
        23,
        59,
        59,
        999
      );

      return res.json({
        success: true,
        data: {
          weekKey: currentProgress.weekKey,
          weekStart: currentProgress.weekStart,
          weekEnd: currentProgress.weekEnd,
          todayDayNumber,
          days: enrichedDays,
          bigRewardEligible: currentProgress.bigRewardEligible,
          bigRewardGranted: currentProgress.bigRewardGranted,
          countdown: Math.max(0, endOfDay - today),
          weekNumber,
          weeklyMultiplier: {
            enabled: cfg.weeklyMultiplier?.enabled || false,
            currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
            status: cfg.weeklyMultiplier?.enabled
              ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
              : "Weekly Multiplier: Disabled",
          },
          // Include big reward configuration from admin V2
          bigReward: {
            enabled: cfg.bigReward?.enabled ?? true,
            coins: cfg.bigReward?.coinValue ?? cfg.bigReward?.coins ?? 200,
            xp: cfg.bigReward?.xpValue ?? cfg.bigReward?.xp ?? 100,
            awardBadge: cfg.bigReward?.awardBadge ?? false,
          },
        },
        message: "Redirected to current week",
      });
    }

    // Load admin configuration to include reward values
    const cfg = await loadConfig();

    // Calculate week number and multiplier
    const today = new Date();
    const weekNumber = await calculateUserWeekNumber(
      req.user.userId,
      today,
      DailyRewardProgress
    );
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    const roundingRule = cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

    // Get user's XP tier multiplier for coins
    let xpTierMultiplier = 1.0;
    const userForMultiplier = await User.findById(req.user.userId).select("xp");
    if (
      userForMultiplier &&
      userForMultiplier.xp &&
      userForMultiplier.xp.current !== undefined
    ) {
      try {
        const tierKey = await getTierKeyFromXPV2(userForMultiplier.xp.current);
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true,
        }).lean();
        xpTierMultiplier = multiplierDoc?.multiplier || 1.0;
      } catch (error) {
        console.error(
          "Error getting XP tier multiplier for daily rewards:",
          error
        );
      }
    }

    // Enrich days with reward values from config (ONLY from admin config V2, no fallbacks)
    const enrichedDays = progress.days.map((day) => {
      const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);
      // Use admin config V2 values only - check if day is active
      if (!dayConfig || !dayConfig.active) {
        return {
          ...day.toObject(),
          rewardCoins: 0,
          rewardXp: 0,
        };
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
        finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
        finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
      }

      // Apply XP tier multiplier to XP only (after weekly multiplier)
      if (xpTierMultiplier > 1.0) {
        finalXP = applyMultiplier(finalXP, xpTierMultiplier, roundingRule);
      }

      return {
        ...day.toObject(),
        // Include reward values from admin config V2 (with weekly multiplier and XP tier multiplier applied)
        rewardCoins: finalCoins,
        rewardXp: finalXP,
      };
    });

    const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1; // 1..7 Mon..Sun
    // Calculate end of day in local timezone (not UTC) for accurate countdown
    const endOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999
    );

    res.json({
      success: true,
      data: {
        weekKey: progress.weekKey,
        weekStart: progress.weekStart,
        weekEnd: progress.weekEnd,
        todayDayNumber,
        days: enrichedDays,
        bigRewardEligible: progress.bigRewardEligible,
        bigRewardGranted: progress.bigRewardGranted,
        countdown: Math.max(0, endOfDay - today),
        weekNumber,
        weeklyMultiplier: {
          enabled: cfg.weeklyMultiplier?.enabled || false,
          currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
          status: cfg.weeklyMultiplier?.enabled
            ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
            : "Weekly Multiplier: Disabled",
        },
        // Include big reward configuration from admin V2
        bigReward: {
          enabled: cfg.bigReward?.enabled ?? true,
          coins: cfg.bigReward?.coinValue ?? cfg.bigReward?.coins ?? 200,
          xp: cfg.bigReward?.xpValue ?? cfg.bigReward?.xp ?? 100,
          awardBadge: cfg.bigReward?.awardBadge ?? false,
        },
      },
    });
  } catch (e) {
    console.error("Error getting daily reward week:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to get daily reward week" });
  }
});

// POST /api/daily-rewards/claim
router.post("/claim", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const progress = await loadProgress(userId, now);
    const cfg = await loadConfig();

    const todayIdx = (now.getUTCDay() + 6) % 7; // 0..6
    const day = progress.days[todayIdx];

    if (!day || day.status !== "claimable") {
      return res
        .status(400)
        .json({ success: false, error: "Reward not claimable" });
    }

    // Calculate week number and multiplier
    const weekNumber = await calculateUserWeekNumber(
      userId,
      now,
      DailyRewardProgress
    );
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    const roundingRule = cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

    // Load user with all needed fields (for XP tier multiplier and later for crediting rewards)
    const user = await User.findById(userId).select("wallet xp badges");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Get user's XP tier multiplier for coins and XP
    let xpTierMultiplier = 1.0;
    if (user && user.xp && user.xp.current !== undefined) {
      try {
        const tierKey = await getTierKeyFromXPV2(user.xp.current);
        const multiplierDoc = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true,
        }).lean();
        xpTierMultiplier = multiplierDoc?.multiplier || 1.0;
      } catch (error) {
        console.error(
          "Error getting XP tier multiplier for daily rewards claim:",
          error
        );
      }
    }

    // Determine reward from admin config
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
        dayConfig.xpValue !== undefined ? dayConfig.xpValue : dayConfig.xp || 0;
    }

    // Apply weekly multiplier if enabled and week > 1
    let finalCoins = baseCoins;
    let finalXP = baseXP;
    if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
      finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
      finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
    }

    // Apply XP tier multiplier to XP only (after weekly multiplier)
    if (xpTierMultiplier > 1.0) {
      finalXP = applyMultiplier(finalXP, xpTierMultiplier, roundingRule);
    }

    // Check perfect streak for big reward on Day 7 (V2 config)
    let bigReward = null;
    let bigRewardCoins = 0;
    let bigRewardXP = 0;

    if (day.dayNumber === 7 && cfg.bigReward?.enabled !== false) {
      const downgradeOnMiss = cfg.bigReward.downgradeOnMiss !== false;

      if (downgradeOnMiss) {
        const allClaimed = progress.days
          .slice(0, 6)
          .every((d) => d.status === "claimed");
        if (allClaimed && weekNumber === 1) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      } else {
        if (weekNumber === 1) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      }

      if (bigReward) {
        const bigRewardType = bigReward.rewardType || "Both";

        if (bigRewardType === "Coins" || bigRewardType === "Both") {
          bigRewardCoins =
            bigReward.coinValue !== undefined
              ? bigReward.coinValue
              : bigReward.coins || 0;
        }
        if (bigRewardType === "XP" || bigRewardType === "Both") {
          bigRewardXP =
            bigReward.xpValue !== undefined
              ? bigReward.xpValue
              : bigReward.xp || 0;
        }

        if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
          bigRewardCoins = applyMultiplier(
            bigRewardCoins,
            weekMultiplier,
            roundingRule
          );
          bigRewardXP = applyMultiplier(
            bigRewardXP,
            weekMultiplier,
            roundingRule
          );
        }

        // Apply XP tier multiplier to big reward XP only (after weekly multiplier)
        if (xpTierMultiplier > 1.0) {
          bigRewardXP = applyMultiplier(
            bigRewardXP,
            xpTierMultiplier,
            roundingRule
          );
        }
      } else if (weekNumber === 1) {
        bigRewardCoins = cfg.fallbackReward?.coins || 0;
        bigRewardXP = cfg.fallbackReward?.xp || 0;
      }
    }

    const coins = finalCoins + bigRewardCoins;
    const xp = finalXP + bigRewardXP;

    // CRITICAL: Credit rewards FIRST before marking as claimed
    // This ensures atomicity - if crediting fails, status remains claimable
    // (user already loaded above)
    const oldBalance = user.wallet.balance || 0;
    const oldXP = user.xp.current || 0;

    user.wallet.balance = oldBalance + coins;
    user.wallet.lastUpdated = now;

    const { finalXP: finalXPWithTier, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, xp || 0);

    user.xp.current = oldXP + finalXPWithTier;
    user.xp.total = (user.xp.total || 0) + finalXPWithTier;
    // Award badge if big reward is granted and badge is enabled (V2 config)
    if (bigReward && bigReward.awardBadge && cfg.bigReward?.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName))
        user.badges.push(cfg.bigReward.badgeName);
    }

    // Create a single transaction for both coins and XP
    const baseDescription = `Daily Reward Day ${day.dayNumber}${
      bigReward ? " (Big Reward)" : ""
    }`;

    // Determine primary balance type and amount
    // If both coins and XP exist, use coins as primary, otherwise use whichever exists
    let primaryAmount = 0;
    let primaryBalanceType = "coins";

    if (coins > 0 && finalXP > 0) {
      // Both rewards - use coins as primary
      primaryAmount = coins;
      primaryBalanceType = "coins";
    } else if (coins > 0) {
      // Only coins
      primaryAmount = coins;
      primaryBalanceType = "coins";
    } else if (finalXP > 0) {
      // Only XP
      primaryAmount = finalXP;
      primaryBalanceType = "xp";
    }

    // Create single transaction with both coins and XP
    const tx = new Transaction({
      user: userId,
      type: "credit",
      amount: primaryAmount,
      balanceType: primaryBalanceType,
      description: baseDescription,
      status: "completed",
      metadata: {
        rewardDay: day.dayNumber,
        bigReward: !!bigReward,
        // Include both coins and XP in metadata
        // Use base XP value (before tier multiplier) in xp field
        coins: coins,
        xp: xp, // Base XP value before tier multiplier
        baseXp: xp, // Base XP value before tier multiplier
        finalXp: finalXPWithTier, // Final XP value after tier multiplier
        tierMultiplier,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        rewardType:
          coins > 0 && finalXPWithTier > 0
            ? "Both"
            : coins > 0
            ? "Coins"
            : "XP",
      },
    });

    // Save user and transaction together - if this fails, status won't be marked as claimed
    try {
      await Promise.all([user.save(), tx.save()]);
    } catch (error) {
      // Rollback user changes if transaction save fails
      user.wallet.balance = oldBalance;
      user.xp.current = oldXP;
      await user.save();
      throw error;
    }

    // ONLY AFTER successfully crediting rewards, mark as claimed
    day.status = "claimed";
    day.claimedAt = now;
    day.coins = coins;
    day.xp = xp;

    // Unlock next day (or mark missed for past days)
    if (todayIdx + 1 < progress.days.length) {
      const next = progress.days[todayIdx + 1];
      if (next.status === "locked") next.status = "claimable";
    }

    // If any previous day is still locked, mark it as missed
    progress.days.forEach((d, idx) => {
      if (idx < todayIdx && d.status === "locked") d.status = "missed";
    });

    progress.lastUpdated = now;
    await progress.save();

    // Track achievements for daily reward claim
    setImmediate(async () => {
      try {
        // Count total daily rewards claimed by this user
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
          category: "daily_reward",
          dailyRewardsClaimed: dailyRewardsClaimed,
          weekNumber: weekNumber,
        });
      } catch (error) {
        console.error("Error tracking daily reward achievements:", error);
      }
    });

    res.json({
      success: true,
      data: {
        day: day.dayNumber,
        coins,
        xp: finalXPWithTier, // Final XP value after tier multiplier (e.g., 44 = 22 base × 2.0 multiplier)
        baseXp: xp, // Base XP value before tier multiplier (e.g., 22)
        tierMultiplier: tierMultiplier, // Tier multiplier that was applied (e.g., 2.0)
        bigReward: !!bigReward,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
      },
    });
  } catch (e) {
    console.error("Error claiming daily reward:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to claim daily reward" });
  }
});

// GET /api/daily-rewards/history?weeks=4
router.get("/history", protect, async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const records = await DailyRewardProgress.find({ userId: req.user.userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({ success: true, data: records });
  } catch (e) {
    console.error("Error getting daily reward history:", e);
    res
      .status(500)
      .json({ success: false, error: "Failed to get daily reward history" });
  }
});

module.exports = router;

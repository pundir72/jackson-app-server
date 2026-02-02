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
  calculateYearTransitionMetadata,
  getUserFirstWeek,
} = require("../utils/dailyRewardHelpersV2");
const { trackAchievements } = require("../utils/achievements");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const { getTierKeyFromXPV2 } = require("../utils/xpTierMultiplierV2");
const XPMultiplier = require("../models/XPMultiplier");
const XPTier = require("../models/XPTier");

/**
 * Load or create weekly progress for Daily Rewards
 * 
 * MID-WEEK JOIN BEHAVIOR:
 * When a user joins mid-week (not on Monday), the following logic applies:
 * 
 * 1. Days before user creation: Marked as "missed" (user cannot claim rewards for days before they joined)
 * 2. Day of creation: If it's today, marked as "claimable"; if it's in the past, marked as "missed"
 * 3. Days after creation (within the same week): Follow normal progression (claimable today, locked for future)
 * 4. Big Reward Eligibility: 
 *    - User must claim ALL 6 days (Day 1-6) AFTER their creation date to be eligible for Day 7 big reward
 *    - If user joined on Day 3, they need to claim Day 3, 4, 5, 6 to be eligible (4 days total)
 *    - Days 1-2 before their creation are automatically marked as "missed" and don't count toward eligibility
 * 
 * Example: User joins on Wednesday (Day 3 of the week)
 * - Day 1 (Mon): MISSED (before creation)
 * - Day 2 (Tue): MISSED (before creation)
 * - Day 3 (Wed): CLAIMABLE (if today) or MISSED (if past)
 * - Day 4-6: Follow normal progression
 * - Day 7: Eligible for big reward ONLY if Days 3-6 are all claimed
 * 
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for (defaults to current date)
 * @returns {Object|null} DailyRewardProgress document or null if access denied
 */
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
    // MID-WEEK JOIN LOGIC: Handle users who joined mid-week
    let changed = false;

    // Check if this week contains the user's creation date (MID-WEEK JOIN DETECTION)
    const weekContainsUserCreation =
      weekStart <= userCreatedAt && weekEnd >= userCreatedAt;

    // Calculate which day of the week the user was created (0-6, Mon-Sun) within this specific week
    // This is used to mark days before user creation as "missed"
    let userCreatedDayIdx = -1;
    if (weekContainsUserCreation) {
      // Calculate days difference from week start to user creation date
      const daysDiff = Math.floor(
        (userCreatedAt - weekStart) / (24 * 60 * 60 * 1000)
      );
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
    }

    if (isCurrentWeek) {
      // CURRENT WEEK LOGIC (MID-WEEK JOIN HANDLING):
      // - Days before user creation: Marked as "missed" (user joined mid-week)
      // - Today: Marked as "claimable" if it's the creation day or later
      // - Past days (after creation): Marked as "missed"
      // - Future days: Remain "locked"
      progress.days.forEach((d, idx) => {
        // MID-WEEK JOIN: If user was created in this week, mark days before creation as missed
        if (weekContainsUserCreation && idx < userCreatedDayIdx) {
          d.status = "missed";
          changed = true;
        } else if (idx < todayIdx && d.status === "locked") {
          // Past days (after creation) are missed
          d.status = "missed";
          changed = true;
        } else if (idx === todayIdx && d.status === "locked") {
          // Today is claimable (if it's creation day or later)
          d.status = "claimable";
          changed = true;
        }
        // Future days remain locked (no change needed)
      });
    } else {
      // PREVIOUS WEEK LOGIC (MID-WEEK JOIN HANDLING):
      // - If user was created in this week: days before creation are missed
      // - Days after creation in past week are also missed (can't claim past rewards)
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

  // SAFETY NET: Ensure proper status based on actual current date and user creation date
  // This enforces MID-WEEK JOIN logic consistently
  // For current week: today is claimable, past days are missed
  // For previous weeks: all days should be either claimed or missed (never locked or claimable)
  // Also ensure days before user creation are marked as missed
  let changed = false;

  // MID-WEEK JOIN DETECTION: Check if this week contains the user's creation date
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

    // MID-WEEK JOIN: First check - days before user creation should always be missed
    // This ensures users who joined mid-week cannot claim rewards for days before they joined
    if (weekContainsUserCreation && idx < userCreatedDayIdx) {
      if (d.status !== "missed") {
        d.status = "missed";
        changed = true;
      }
      return; // Skip other checks for days before creation
    }

    if (isCurrentWeek) {
      // CURRENT WEEK LOGIC (MID-WEEK JOIN HANDLING):
      // Past days (after creation) missed, today claimable, future days locked
      if (idx < todayIdx) {
        // Past day (after creation) - should be missed
        if (d.status === "locked" || d.status === "claimable") {
          d.status = "missed";
          changed = true;
        }
      } else if (idx === todayIdx) {
        // Today (must be creation day or later) - should be claimable
        if (d.status === "locked") {
          d.status = "claimable";
          changed = true;
        }
      }
      // Future days remain locked (no change needed)
    } else {
      // PREVIOUS WEEK LOGIC: all days should be either claimed or missed (never locked or claimable)
      if (d.status === "locked" || d.status === "claimable") {
        d.status = "missed";
        changed = true;
      }
    }
  });

  if (changed) await progress.save();
  return progress;
}

/**
 * Calculate mid-week join metadata for a user in a given week
 * @param {Date} weekStart - Start of the week (Monday 00:00 UTC)
 * @param {Date} weekEnd - End of the week (Sunday 23:59:59 UTC)
 * @param {Date} userCreatedAt - User account creation date
 * @returns {Object} Mid-week join metadata
 */
function calculateMidWeekJoinMetadata(weekStart, weekEnd, userCreatedAt) {
  const weekContainsUserCreation = weekStart <= userCreatedAt && weekEnd >= userCreatedAt;
  
  if (!weekContainsUserCreation) {
    return {
      isMidWeekJoin: false,
      userCreatedDayIndex: null,
      userCreatedDayNumber: null,
      daysMissedBeforeJoin: 0,
      daysAvailableAfterJoin: 7,
    };
  }

  // Calculate which day of the week the user was created (0-6, Mon-Sun)
  const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
  const userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
  const userCreatedDayNumber = userCreatedDayIdx + 1; // Convert to 1-7 (Mon-Sun)

  return {
    isMidWeekJoin: userCreatedDayIdx > 0, // True if joined after Monday (Day 0)
    userCreatedDayIndex: userCreatedDayIdx,
    userCreatedDayNumber: userCreatedDayNumber,
    daysMissedBeforeJoin: userCreatedDayIdx, // Days before user creation
    daysAvailableAfterJoin: 7 - userCreatedDayIdx, // Days available after creation
    message: userCreatedDayIdx > 0 
      ? `You joined on Day ${userCreatedDayNumber} of this week. Days 1-${userCreatedDayIdx} are marked as missed. You can claim rewards from Day ${userCreatedDayNumber} onwards.`
      : "You joined at the start of the week. All days are available.",
  };
}

async function loadConfig() {
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({
    version: -1,
  });
  if (cfg) return cfg;
  // CRITICAL FIX: Return null if no active config exists (module is disabled)
  // This allows endpoints to check and return appropriate error messages
  return null;
}

// Helper function to parse accessBenefits multiplier (e.g., "1.5x" -> 1.5)
function parseAccessBenefitsMultiplier(accessBenefits) {
  if (!accessBenefits || typeof accessBenefits !== "string") {
    return 1.0;
  }
  const match = accessBenefits.match(/(\d+\.?\d*)x/i);
  if (match && match[1]) {
    return parseFloat(match[1]) || 1.0;
  }
  return 1.0;
}

// Helper function to get user's accessBenefits multiplier from XPTier
async function getAccessBenefitsMultiplier(userXp) {
  try {
    console.log("=== TIER SELECTION DEBUG ===");
    console.log("User XP:", userXp);

    // Get all active tiers for debugging
    const allTiers = await XPTier.find({ status: true })
      .sort({ xpMin: 1 })
      .lean();
    console.log(
      "All active tiers:",
      allTiers.map((t) => ({
        tierName: t.tierName,
        xpMin: t.xpMin,
        xpMax: t.xpMax,
        accessBenefits: t.accessBenefits,
      }))
    );

    // Find matching tier (now async)
    const tier = await XPTier.findByXpValue(userXp);

    if (tier) {
      // Check if XP falls within tier range or exceeds it
      const withinRange = userXp >= tier.xpMin && userXp <= tier.xpMax;
      const exceedsMax = userXp > tier.xpMax;

      console.log("Matched tier:", {
        tierName: tier.tierName,
        xpMin: tier.xpMin,
        xpMax: tier.xpMax,
        accessBenefits: tier.accessBenefits,
        _id: tier._id,
        userXp: userXp,
        withinRange: withinRange,
        exceedsMax: exceedsMax,
      });

      if (exceedsMax) {
        console.log(
          "ℹ️ INFO: User XP exceeds tier max, using highest tier as fallback"
        );
      }

      // Check if multiple tiers could match
      const matchingTiers = allTiers.filter(
        (t) => userXp >= t.xpMin && userXp <= t.xpMax
      );
      if (matchingTiers.length > 1) {
        console.warn(
          "⚠️ WARNING: Multiple tiers match this XP value!",
          matchingTiers.map((t) => ({
            tierName: t.tierName,
            xpMin: t.xpMin,
            xpMax: t.xpMax,
          }))
        );
      }

      if (tier.accessBenefits) {
        const multiplier = parseAccessBenefitsMultiplier(tier.accessBenefits);
        console.log(
          "Parsed multiplier:",
          multiplier,
          "from accessBenefits:",
          tier.accessBenefits
        );
        console.log("=== END TIER SELECTION DEBUG ===");
        return multiplier;
      }
    } else {
      console.log("❌ No tier found for XP:", userXp);
      console.log("=== END TIER SELECTION DEBUG ===");
    }
  } catch (error) {
    console.error("Error getting accessBenefits multiplier:", error);
    console.log("=== END TIER SELECTION DEBUG ===");
  }
  return 1.0;
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
      
      // CRITICAL FIX: Check if Daily Reward module is active
      if (!cfg || cfg.isActive === false) {
        return res.status(503).json({
          success: false,
          error: "Daily Reward module is currently disabled",
          message: "Please contact support if you believe this is an error",
        });
      }

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

      // Get user's accessBenefits multiplier from XPTier
      let accessBenefitsMultiplier = 1.0;
      if (user && user.xp && user.xp.current !== undefined) {
        accessBenefitsMultiplier = await getAccessBenefitsMultiplier(
          user.xp.current
        );
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

        // Apply accessBenefits multiplier to XP only (after weekly multiplier)
        if (accessBenefitsMultiplier > 1.0) {
          finalXP = applyMultiplier(
            finalXP,
            accessBenefitsMultiplier,
            roundingRule
          );
        }

        return {
          ...day.toObject(),
          // Include reward values from admin config V2 (with weekly multiplier applied, accessBenefits multiplier applied to XP only)
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

      // Calculate mid-week join metadata
      const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
        progress.weekStart,
        progress.weekEnd,
        userCreatedAt
      );

      // Calculate year transition metadata for weekly multiplier
      const firstWeekStart = await getUserFirstWeek(req.user.userId, DailyRewardProgress);
      const yearTransitionMetadata = calculateYearTransitionMetadata(
        firstWeekStart,
        today,
        weekNumber
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
          // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
          midWeekJoin: midWeekJoinMetadata,
          // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
          yearTransition: yearTransitionMetadata,
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

    // Load admin configuration to check if module is active
    const cfg = await loadConfig();
    
    // CRITICAL FIX: Check if Daily Reward module is active
    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
        message: "Please contact support if you believe this is an error",
      });
    }

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
      
      // CRITICAL FIX: Check if Daily Reward module is active
      if (!cfg || cfg.isActive === false) {
        return res.status(503).json({
          success: false,
          error: "Daily Reward module is currently disabled",
          message: "Please contact support if you believe this is an error",
        });
      }

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

      // Get user's accessBenefits multiplier from XPTier
      const userForAccessBenefits = await User.findById(req.user.userId).select(
        "xp"
      );
      let accessBenefitsMultiplier = 1.0;
      if (
        userForAccessBenefits &&
        userForAccessBenefits.xp &&
        userForAccessBenefits.xp.current !== undefined
      ) {
        accessBenefitsMultiplier = await getAccessBenefitsMultiplier(
          userForAccessBenefits.xp.current
        );
      }

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

        // Apply accessBenefits multiplier to XP only (after weekly multiplier)
        if (accessBenefitsMultiplier > 1.0) {
          finalXP = applyMultiplier(
            finalXP,
            accessBenefitsMultiplier,
            roundingRule
          );
        }

        return {
          ...day.toObject(),
          // Include reward values from admin config (with weekly multiplier applied, accessBenefits multiplier applied to XP only)
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

      // Calculate mid-week join metadata
      const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
        currentProgress.weekStart,
        currentProgress.weekEnd,
        userCreatedAt
      );

      // Calculate year transition metadata for weekly multiplier
      const firstWeekStart = await getUserFirstWeek(req.user.userId, DailyRewardProgress);
      const yearTransitionMetadata = calculateYearTransitionMetadata(
        firstWeekStart,
        today,
        weekNumber
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
          // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
          midWeekJoin: midWeekJoinMetadata,
          // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
          yearTransition: yearTransitionMetadata,
        },
        message: "Redirected to current week",
      });
    }

    // cfg is already declared at line 630, reuse it here
    // CRITICAL FIX: Check if Daily Reward module is active
    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
        message: "Please contact support if you believe this is an error",
      });
    }

    // Calculate week number and multiplier
    const today = new Date();
    const weekNumber = await calculateUserWeekNumber(
      req.user.userId,
      today,
      DailyRewardProgress
    );
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    const roundingRule = cfg.weeklyMultiplier?.roundingRule || "Round Nearest";

    // Get user's accessBenefits multiplier from XPTier
    const userForAccessBenefits = await User.findById(req.user.userId).select(
      "xp"
    );
    let accessBenefitsMultiplier = 1.0;
    if (
      userForAccessBenefits &&
      userForAccessBenefits.xp &&
      userForAccessBenefits.xp.current !== undefined
    ) {
      accessBenefitsMultiplier = await getAccessBenefitsMultiplier(
        userForAccessBenefits.xp.current
      );
    }

    // Enrich days with reward values from config (ONLY from admin config V2, no fallbacks)
    const enrichedDays = progress.days.map((day) => {
      const dayConfig = cfg.days.find((d) => d.dayNumber === day.dayNumber);
      
      // Special handling for day 7
      if (day.dayNumber === 7) {
        // If big reward is eligible, use big reward values
        if (progress.bigRewardEligible && cfg.bigReward?.enabled) {
          let baseCoins = cfg.bigReward?.coinValue ?? cfg.bigReward?.coins ?? 200;
          let baseXP = cfg.bigReward?.xpValue ?? cfg.bigReward?.xp ?? 100;

          // Apply weekly multiplier if enabled and week > 1
          let finalCoins = baseCoins;
          let finalXP = baseXP;
          if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
            finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
            finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
          }

          // Apply accessBenefits multiplier to XP only (after weekly multiplier)
          if (accessBenefitsMultiplier > 1.0) {
            finalXP = applyMultiplier(
              finalXP,
              accessBenefitsMultiplier,
              roundingRule
            );
          }

          return {
            ...day.toObject(),
            rewardCoins: finalCoins,
            rewardXp: finalXP,
          };
        } else {
          // Big reward not eligible - use day 6's values as fallback
          const day6 = progress.days.find((d) => d.dayNumber === 6);
          if (day6) {
            const day6Config = cfg.days.find((d) => d.dayNumber === 6);
            if (day6Config && day6Config.active) {
              const rewardType = day6Config.rewardType || "Both";
              let baseCoins = 0;
              let baseXP = 0;

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

              // Apply weekly multiplier if enabled and week > 1
              let finalCoins = baseCoins;
              let finalXP = baseXP;
              if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
                finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
                finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
              }

              // Apply accessBenefits multiplier to XP only (after weekly multiplier)
              if (accessBenefitsMultiplier > 1.0) {
                finalXP = applyMultiplier(
                  finalXP,
                  accessBenefitsMultiplier,
                  roundingRule
                );
              }

              return {
                ...day.toObject(),
                rewardCoins: finalCoins,
                rewardXp: finalXP,
              };
            }
          }
          // If day 6 config not found or inactive, return 0
          return {
            ...day.toObject(),
            rewardCoins: 0,
            rewardXp: 0,
          };
        }
      }

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

      // Apply accessBenefits multiplier to XP only (after weekly multiplier)
      if (accessBenefitsMultiplier > 1.0) {
        finalXP = applyMultiplier(
          finalXP,
          accessBenefitsMultiplier,
          roundingRule
        );
      }

      return {
        ...day.toObject(),
        // Include reward values from admin config V2 (with weekly multiplier applied, accessBenefits multiplier applied to XP only)
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

    // Calculate mid-week join metadata
    // Reuse the user and userCreatedAt variables already fetched/declared earlier in this function
    const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
      progress.weekStart,
      progress.weekEnd,
      userCreatedAt
    );

    // Calculate year transition metadata for weekly multiplier
    const firstWeekStart = await getUserFirstWeek(req.user.userId, DailyRewardProgress);
    const yearTransitionMetadata = calculateYearTransitionMetadata(
      firstWeekStart,
      today,
      weekNumber
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
        // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
        midWeekJoin: midWeekJoinMetadata,
        // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
        yearTransition: yearTransitionMetadata,
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
    
    // CRITICAL FIX: Check if Daily Reward module is active
    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
        message: "Please contact support if you believe this is an error",
      });
    }

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

    // Get user's accessBenefits multiplier from XPTier (for display/calculation)
    let accessBenefitsMultiplier = 1.0;
    if (user && user.xp && user.xp.current !== undefined) {
      accessBenefitsMultiplier = await getAccessBenefitsMultiplier(
        user.xp.current
      );
    }

    // Special handling for day 7 - check big reward eligibility first
    // MID-WEEK JOIN: Big reward eligibility must account for users who joined mid-week
    let bigReward = null;
    let bigRewardCoins = 0;
    let bigRewardXP = 0;
    let baseCoins = 0;
    let baseXP = 0;

    // Get user creation date to check mid-week join eligibility
    const userForBigReward = await User.findById(userId).select("createdAt");
    const userCreatedAt = userForBigReward?.createdAt || new Date();
    const { weekStart } = getWeekBoundsUtc(now);
    const weekContainsUserCreation = weekStart <= userCreatedAt && progress.weekEnd >= userCreatedAt;
    let userCreatedDayIdx = -1;
    if (weekContainsUserCreation) {
      const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
    }

    if (day.dayNumber === 7) {
      // MID-WEEK JOIN BIG REWARD ELIGIBILITY:
      // Check if all days AFTER user creation (days 1-6) are claimed
      // For mid-week joins, only days after creation count toward eligibility
      let allRequiredDaysClaimed = false;
      if (weekContainsUserCreation && userCreatedDayIdx > 0) {
        // User joined mid-week: check if all days from creation day to day 6 are claimed
        // Days before creation are already marked as "missed" and don't count
        const requiredDays = progress.days.slice(userCreatedDayIdx, 6); // Days from creation to day 6 (exclusive of day 7)
        allRequiredDaysClaimed = requiredDays.every(d => d.status === 'claimed');
      } else {
        // User joined at start of week: check if all days 1-6 are claimed
        const days1to6 = progress.days.slice(0, 6); // Days 1-6 (indices 0-5)
        allRequiredDaysClaimed = days1to6.every(d => d.status === 'claimed');
      }

      // Update big reward eligibility based on mid-week join logic
      if (allRequiredDaysClaimed && cfg.bigReward?.enabled) {
        progress.bigRewardEligible = true;
      } else {
        progress.bigRewardEligible = false;
      }

      // For day 7, use big reward if eligible, otherwise use day 6's values
      if (progress.bigRewardEligible && cfg.bigReward?.enabled) {
        // Use big reward values
        bigReward = cfg.bigReward;
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

        // Weekly multiplier will be applied to baseCoins/baseXP later
        progress.bigRewardGranted = true;
      } else {
        // Big reward not eligible - use day 6's values as fallback
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
      // For days 1-6, use normal day config
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
    }

    // Apply weekly multiplier if enabled and week > 1
    let finalCoins = baseCoins;
    let xpAfterWeekly = baseXP;
    if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
      finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
      xpAfterWeekly = applyMultiplier(baseXP, weekMultiplier, roundingRule);
    }

    // Store base XP (after weekly multiplier, before accessBenefits multiplier)
    // This will be used for metadata and passed to applyTierMultiplierToXP
    const baseXPForTier = xpAfterWeekly;

    // CRITICAL FIX: For day 7, baseCoins/baseXP already contain big reward values (if eligible)
    // or day 6 values (if not eligible). bigRewardCoins/bigRewardXP are always 0 in V1 logic.
    // This is correct - we just add 0, which doesn't change the value.
    const coins = finalCoins + bigRewardCoins;
    // XP before tier multiplier (after weekly multiplier)
    const baseXPTotal = baseXPForTier + bigRewardXP;

    // Debug logging for multiplier calculations
    console.log('=== DAILY REWARD V1 MULTIPLIER DEBUG ===', {
      userId,
      dayNumber: day.dayNumber,
      weekNumber,
      weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
      weeklyMultiplierEnabled: cfg.weeklyMultiplier?.enabled,
      baseCoins,
      baseXP,
      finalCoins,
      xpAfterWeekly,
      bigRewardCoins,
      bigRewardXP,
      coins,
      baseXPTotal,
      bigReward: !!bigReward,
      bigRewardEligible: progress.bigRewardEligible,
    });

    // CRITICAL: Credit rewards FIRST before marking as claimed
    // This ensures atomicity - if crediting fails, status remains claimable
    // (user already loaded above)
    const oldBalance = user.wallet.balance || 0;
    const oldXP = user.xp.current || 0;

    user.wallet.balance = oldBalance + coins;
    user.wallet.lastUpdated = now;

    // Apply tier multiplier using applyTierMultiplierToXP (uses XPMultiplier)
    // This applies the accessBenefits multiplier from the tier
    const { finalXP: finalXPWithTier, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, baseXPTotal || 0);

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

    if (coins > 0 && finalXPWithTier > 0) {
      // Both rewards - use coins as primary
      primaryAmount = coins;
      primaryBalanceType = "coins";
    } else if (coins > 0) {
      // Only coins
      primaryAmount = coins;
      primaryBalanceType = "coins";
    } else if (finalXPWithTier > 0) {
      // Only XP
      primaryAmount = finalXPWithTier;
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
        coins: coins,
        // Base XP value (after weekly multiplier, before tier/accessBenefits multiplier)
        baseXp: baseXPTotal,
        // Final XP value after tier/accessBenefits multiplier (this is what user actually receives)
        finalXp: finalXPWithTier,
        // Tier multiplier that was applied (from XPMultiplier, same as accessBenefits)
        tierMultiplier: tierMultiplier,
        // Weekly multiplier that was applied
        weekNumber: weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        // Access benefits multiplier (same as tierMultiplier, for clarity)
        accessBenefitsMultiplier: tierMultiplier,
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
    day.xp = baseXPTotal; // Store base XP (before tier multiplier) in progress

    // MID-WEEK JOIN: Recalculate big reward eligibility after claiming any day
    // This ensures eligibility is updated correctly for mid-week joins
    if (day.dayNumber >= 1 && day.dayNumber <= 6) {
      // Get user creation date to check mid-week join eligibility
      const userForEligibility = await User.findById(userId).select("createdAt");
      const userCreatedAtForEligibility = userForEligibility?.createdAt || new Date();
      const { weekStart: weekStartForEligibility } = getWeekBoundsUtc(now);
      const weekContainsUserCreationForEligibility = 
        weekStartForEligibility <= userCreatedAtForEligibility && 
        progress.weekEnd >= userCreatedAtForEligibility;
      
      let userCreatedDayIdxForEligibility = -1;
      if (weekContainsUserCreationForEligibility) {
        const daysDiff = Math.floor(
          (userCreatedAtForEligibility - weekStartForEligibility) / (24 * 60 * 60 * 1000)
        );
        userCreatedDayIdxForEligibility = Math.max(0, Math.min(6, daysDiff));
      }

      // Check if all required days (after user creation) are claimed
      let allRequiredDaysClaimed = false;
      if (weekContainsUserCreationForEligibility && userCreatedDayIdxForEligibility > 0) {
        // User joined mid-week: check if all days from creation day to day 6 are claimed
        const requiredDays = progress.days.slice(userCreatedDayIdxForEligibility, 6);
        allRequiredDaysClaimed = requiredDays.every(d => d.status === 'claimed');
      } else {
        // User joined at start of week: check if all days 1-6 are claimed
        const days1to6 = progress.days.slice(0, 6);
        allRequiredDaysClaimed = days1to6.every(d => d.status === 'claimed');
      }

      // Update big reward eligibility
      if (allRequiredDaysClaimed && cfg.bigReward?.enabled) {
        progress.bigRewardEligible = true;
      } else {
        progress.bigRewardEligible = false;
      }
    }

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
          xp: finalXPWithTier, // Use final XP (after multiplier) for achievements
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
        xp: finalXPWithTier, // Final XP value after tier multiplier (e.g., 65 = 50 base × 1.3 multiplier)
        baseXp: baseXPTotal, // Base XP value before tier multiplier (e.g., 50)
        tierMultiplier: tierMultiplier, // Tier multiplier that was applied (e.g., 1.3)
        accessBenefitsMultiplier: tierMultiplier, // Same as tierMultiplier (for clarity)
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

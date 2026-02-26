const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/auth');
const DailyRewardProgress = require('../models/DailyRewardProgress');
const DailyRewardConfigV2 = require('../models/DailyRewardConfigV2');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { 
  getISOWeekKey, 
  getWeekBoundsUtc, 
  initWeekDays,
  calculateUserWeekNumber,
  getWeekMultiplier,
  applyMultiplier,
  calculateYearTransitionMetadata,
  getUserFirstWeek
} = require('../utils/dailyRewardHelpersV2');
const { trackAchievements } = require('../utils/achievements');
const { applyTierMultiplierToXPV2 } = require('../utils/xpTierMultiplierV2');
// ADM-DR-001 FIX: Import the fixed progress loader
const { loadProgressFixed, calculateMidWeekJoinMetadataFixed } = require('../utils/dailyRewardProgressFixed');

/**
 * Load or create weekly progress for Daily Rewards V2
 * 
 * ADM-DR-001 FIX: Correct behavior for mid-week join
 * 
 * CORRECT BEHAVIOR:
 * - FIRST WEEK: User-relative days (Day 1, 2, 3... starting from join date)
 *   - User joins on Wednesday → Wednesday becomes "Day 1"
 *   - User gets full 7 consecutive days of rewards
 *   - Days before join are hidden from UI
 * - SUBSEQUENT WEEKS: Calendar-based days (Monday, Tuesday, Wednesday...)
 * 
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for (defaults to current date)
 * @returns {Object|null} DailyRewardProgress document or null if access denied
 */
async function loadProgress(userId, dateUtc = new Date()) {
  // ADM-DR-001 FIX: Use the fixed progress loader with correct first-week logic
  return await loadProgressFixed(userId, dateUtc);
}

/**
 * Calculate mid-week join metadata for a user in a given week
 * ADM-DR-001 FIX: This now uses the fixed metadata calculator
 * @param {Date} weekStart - Start of the week (Monday 00:00 UTC)
 * @param {Date} weekEnd - End of the week (Sunday 23:59:59 UTC)
 * @param {Date} userCreatedAt - User account creation date
 * @returns {Object} Mid-week join metadata
 */
function calculateMidWeekJoinMetadata(weekStart, weekEnd, userCreatedAt) {
  // ADM-DR-001 FIX: Use the fixed metadata calculator
  return calculateMidWeekJoinMetadataFixed(weekStart, weekEnd, userCreatedAt);
}

async function loadConfig() {
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 });
  if (cfg) return cfg;
  // CRITICAL FIX: Return null if no active config exists (module is disabled)
  // This allows endpoints to check and return appropriate error messages
  return null;
}

// GET /api/daily-rewards-v2/week
router.get('/week', protect, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const now = new Date();

    const startOfDate = new Date(date.setHours(0, 0, 0, 0));
    const startOfNow = new Date(now.setHours(0, 0, 0, 0));

    if (startOfDate > startOfNow) {
      return res.status(400).json({
        success: false,
        error: 'Cannot access future weeks'
      });
    }

    const user = await User.findById(req.user.userId).select('createdAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userCreatedAt = user.createdAt || new Date();
    const startOfUserCreatedAt = new Date(userCreatedAt.setHours(0, 0, 0, 0));

    if (startOfUserCreatedAt > startOfDate) {
      return res.status(400).json({
        success: false,
        error: 'You can only access data from your account creation date onward'
      });
    }

    const { weekStart, weekEnd } = getWeekBoundsUtc(date);

    if (weekEnd < userCreatedAt) {
      const progress = await loadProgress(req.user.userId, now);

      if (!progress) {
        return res.status(500).json({
          success: false,
          error: 'Failed to load current week progress'
        });
      }

      const today = new Date();
      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

      const cfg = await loadConfig();
      
      // CRITICAL FIX: Check if Daily Reward module is active
      if (!cfg || cfg.isActive === false) {
        return res.status(503).json({
          success: false,
          error: "Daily Reward module is currently disabled",
          message: "Please contact support if you believe this is an error",
        });
      }
      
      const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      
      // ADM-DR-001 FIX: Filter out hidden days (days before user joined in first week)
      const enrichedDays = progress.days
        .filter((day) => !day.hidden) // Remove hidden days from response
        .map(day => {
        const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
        if (!dayConfig) {
          return {
            ...day.toObject(),
            active: false,
            status: day.status === 'claimed' ? 'claimed' : 'locked', // If no config, mark as locked (except already claimed)
            rewardType: 'Both',
            rewardCoins: 0,
            rewardXp: 0,
            claimButtonLabel: 'CLAIM NOW',
            timerLabel: 'Next reward in',
            claimableOnLoginOnly: false
          };
        }
        
        // CRITICAL FIX: If day is inactive, override status to 'locked' (unless already claimed)
        const isDayActive = dayConfig.active !== false;
        let dayStatus = day.status;
        if (!isDayActive && day.status !== 'claimed') {
          dayStatus = 'locked'; // Disable claiming for inactive days
        }
        
        // Get base reward values from admin config
        const rewardType = dayConfig.rewardType || 'Both';
        let baseCoins = 0;
        let baseXP = 0;
        
        if (rewardType === 'Coins' || rewardType === 'Both') {
          baseCoins = dayConfig.coinValue !== undefined ? dayConfig.coinValue : dayConfig.coins || 0;
        }
        if (rewardType === 'XP' || rewardType === 'Both') {
          baseXP = dayConfig.xpValue !== undefined ? dayConfig.xpValue : dayConfig.xp || 0;
        }
        
        // Apply weekly multiplier if enabled and week > 1
        let finalCoins = baseCoins;
        let finalXP = baseXP;
        if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
          const roundingRule = cfg.weeklyMultiplier?.roundingRule || 'Round Nearest';
          finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
          finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
        }
        
        return {
          ...day.toObject(),
          status: dayStatus, // Use overridden status
          active: isDayActive,
          rewardType: rewardType,
          rewardCoins: finalCoins,
          rewardXp: finalXP,
          claimButtonLabel: dayConfig.claimButtonLabel || 'CLAIM NOW',
          timerLabel: dayConfig.timerLabel || 'Next reward in',
          claimableOnLoginOnly: dayConfig.claimableOnLoginOnly || false
        };
      });

      // Calculate mid-week join metadata
      const userForMetadata = await User.findById(req.user.userId).select('createdAt');
      const userCreatedAtForMetadata = userForMetadata?.createdAt || new Date();
      const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
        progress.weekStart,
        progress.weekEnd,
        userCreatedAtForMetadata
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
              : 'Weekly Multiplier: Disabled'
          },
          bigReward: {
            enabled: cfg.bigReward?.enabled !== false,
            downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false,
            coins: cfg.bigReward?.coinValue !== undefined ? cfg.bigReward.coinValue : (cfg.bigReward?.coins || 0),
            xp: cfg.bigReward?.xpValue !== undefined ? cfg.bigReward.xpValue : (cfg.bigReward?.xp || 0),
            awardBadge: cfg.bigReward?.awardBadge || false
          },
          // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
          midWeekJoin: midWeekJoinMetadata,
          // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
          yearTransition: yearTransitionMetadata,
          // ADM-DR-001 FIX: Display mode for frontend
          displayMode: progress._doc?.displayMode || 'CALENDAR',
          isFirstWeek: progress._doc?.isFirstWeek || false,
          userJoinDayIndex: progress._doc?.userJoinDayIndex,
        },
        message: 'You can only access data from your account creation date onward'
      });
    }

    const progress = await loadProgress(req.user.userId, date);

    if (!progress) {
      const currentProgress = await loadProgress(req.user.userId, now);

      if (!currentProgress) {
        return res.status(500).json({
          success: false,
          error: 'Failed to load current week progress'
        });
      }

      const today = new Date();
      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

      const cfg = await loadConfig();
      
      // CRITICAL FIX: Check if Daily Reward module is active
      if (!cfg || cfg.isActive === false) {
        return res.status(503).json({
          success: false,
          error: "Daily Reward module is currently disabled",
          message: "Please contact support if you believe this is an error",
        });
      }
      
      const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      
      // ADM-DR-001 FIX: Filter out hidden days (days before user joined in first week)
      const enrichedDays = currentProgress.days
        .filter((day) => !day.hidden) // Remove hidden days from response
        .map(day => {
        const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
        
        // CRITICAL FIX: If day is inactive, override status to 'locked' (unless already claimed)
        const isDayActive = dayConfig?.active !== false;
        let dayStatus = day.status;
        if (!isDayActive && day.status !== 'claimed') {
          dayStatus = 'locked'; // Disable claiming for inactive days
        }
        
        return {
          ...day.toObject(),
          status: dayStatus, // Use overridden status
          active: isDayActive,
          rewardType: dayConfig?.rewardType || 'Both',
          claimButtonLabel: dayConfig?.claimButtonLabel || 'CLAIM NOW',
          timerLabel: dayConfig?.timerLabel || 'Next reward in',
          claimableOnLoginOnly: dayConfig?.claimableOnLoginOnly || false
        };
      });

      // Calculate mid-week join metadata
      const userForMetadata = await User.findById(req.user.userId).select('createdAt');
      const userCreatedAtForMetadata = userForMetadata?.createdAt || new Date();
      const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
        currentProgress.weekStart,
        currentProgress.weekEnd,
        userCreatedAtForMetadata
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
              : 'Weekly Multiplier: Disabled'
          },
          bigReward: {
            enabled: cfg.bigReward?.enabled !== false,
            downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false,
            coins: cfg.bigReward?.coinValue !== undefined ? cfg.bigReward.coinValue : (cfg.bigReward?.coins || 0),
            xp: cfg.bigReward?.xpValue !== undefined ? cfg.bigReward.xpValue : (cfg.bigReward?.xp || 0),
            awardBadge: cfg.bigReward?.awardBadge || false
          },
          // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
          midWeekJoin: midWeekJoinMetadata,
          // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
          yearTransition: yearTransitionMetadata,
          // ADM-DR-001 FIX: Display mode for frontend
          displayMode: currentProgress._doc?.displayMode || 'CALENDAR',
          isFirstWeek: currentProgress._doc?.isFirstWeek || false,
          userJoinDayIndex: currentProgress._doc?.userJoinDayIndex,
        },
        message: 'Redirected to current week'
      });
    }

    const today = new Date();
    const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
    const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    const cfg = await loadConfig();
    
    // CRITICAL FIX: Check if Daily Reward module is active
    if (!cfg || cfg.isActive === false) {
      return res.status(503).json({
        success: false,
        error: "Daily Reward module is currently disabled",
        message: "Please contact support if you believe this is an error",
      });
    }
    
    const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    
    // ADM-DR-001 FIX: Filter out hidden days (days before user joined in first week)
    const enrichedDays = progress.days
      .filter((day) => !day.hidden) // Remove hidden days from response
      .map(day => {
      const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
      if (!dayConfig) {
        return {
          ...day.toObject(),
          active: false,
          status: day.status === 'claimed' ? 'claimed' : 'locked', // If no config, mark as locked (except already claimed)
          rewardType: 'Both',
          rewardCoins: 0,
          rewardXp: 0,
          claimButtonLabel: 'CLAIM NOW',
          timerLabel: 'Next reward in',
          claimableOnLoginOnly: false
        };
      }
      
      // CRITICAL FIX: If day is inactive, override status to 'locked' (unless already claimed)
      const isDayActive = dayConfig.active !== false;
      let dayStatus = day.status;
      if (!isDayActive && day.status !== 'claimed') {
        dayStatus = 'locked'; // Disable claiming for inactive days
      }
      
      // Get base reward values from admin config
      const rewardType = dayConfig.rewardType || 'Both';
      let baseCoins = 0;
      let baseXP = 0;
      
      if (rewardType === 'Coins' || rewardType === 'Both') {
        baseCoins = dayConfig.coinValue !== undefined ? dayConfig.coinValue : dayConfig.coins || 0;
      }
      if (rewardType === 'XP' || rewardType === 'Both') {
        baseXP = dayConfig.xpValue !== undefined ? dayConfig.xpValue : dayConfig.xp || 0;
      }
      
      // Apply weekly multiplier if enabled and week > 1
      let finalCoins = baseCoins;
      let finalXP = baseXP;
      if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
        const roundingRule = cfg.weeklyMultiplier?.roundingRule || 'Round Nearest';
        finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
        finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
      }
      
      return {
        ...day.toObject(),
        status: dayStatus, // Use overridden status
        active: isDayActive,
        rewardType: rewardType,
        rewardCoins: finalCoins,
        rewardXp: finalXP,
        claimButtonLabel: dayConfig.claimButtonLabel || 'CLAIM NOW',
        timerLabel: dayConfig.timerLabel || 'Next reward in',
        claimableOnLoginOnly: dayConfig.claimableOnLoginOnly || false
      };
    });

    // Calculate mid-week join metadata
    const userForMetadata = await User.findById(req.user.userId).select('createdAt');
    const userCreatedAtForMetadata = userForMetadata?.createdAt || new Date();
    const midWeekJoinMetadata = calculateMidWeekJoinMetadata(
      progress.weekStart,
      progress.weekEnd,
      userCreatedAtForMetadata
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
            : 'Weekly Multiplier: Disabled'
        },
        bigReward: {
          enabled: cfg.bigReward?.enabled !== false,
          downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false,
          coins: cfg.bigReward?.coinValue !== undefined ? cfg.bigReward.coinValue : (cfg.bigReward?.coins || 0),
          xp: cfg.bigReward?.xpValue !== undefined ? cfg.bigReward.xpValue : (cfg.bigReward?.xp || 0),
          awardBadge: cfg.bigReward?.awardBadge || false
        },
        // MID-WEEK JOIN METADATA: Clarify behavior for users who joined mid-week
        midWeekJoin: midWeekJoinMetadata,
        // YEAR TRANSITION METADATA: Clarify weekly multiplier behavior across year boundaries
        yearTransition: yearTransitionMetadata,
        // ADM-DR-001 FIX: Display mode for frontend
        displayMode: progress._doc?.displayMode || 'CALENDAR',
        isFirstWeek: progress._doc?.isFirstWeek || false,
        userJoinDayIndex: progress._doc?.userJoinDayIndex,
      }
    });
  } catch (e) {
    console.error('Error getting daily reward V2 week:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward V2 week' });
  }
});

// POST /api/daily-rewards-v2/claim
router.post('/claim', protect, async (req, res) => {
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

    const todayIdx = ((now.getUTCDay() + 6) % 7);
    const day = progress.days[todayIdx];

    if (!day || (day.status !== 'claimable')) {
      return res.status(400).json({ success: false, error: 'Reward not claimable' });
    }

    const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
    if (!dayConfig) {
      return res.status(400).json({ success: false, error: 'Day configuration not found' });
    }

    if (dayConfig.active === false) {
      return res.status(400).json({ success: false, error: 'This day\'s reward is not active' });
    }

    const weekNumber = await calculateUserWeekNumber(userId, now, DailyRewardProgress);
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    const roundingRule = cfg.weeklyMultiplier?.roundingRule || 'Round Nearest';

    let bigReward = null;
    let baseCoins = 0;
    let baseXP = 0;

    // CRITICAL FIX: For day 7, check big reward eligibility FIRST before calculating base rewards
    // This prevents double-counting (base day 7 reward + big reward)
    if (day.dayNumber === 7 && cfg.bigReward?.enabled !== false) {
      // MID-WEEK JOIN BIG REWARD ELIGIBILITY:
      // Check if all days AFTER user creation (days 1-6) are claimed
      // For mid-week joins, only days after creation count toward eligibility
      const userForBigReward = await User.findById(userId).select('createdAt');
      const userCreatedAtForBigReward = userForBigReward?.createdAt || new Date();
      const { weekStart: weekStartForBigReward } = getWeekBoundsUtc(now);
      const weekContainsUserCreationForBigReward = 
        weekStartForBigReward <= userCreatedAtForBigReward && 
        progress.weekEnd >= userCreatedAtForBigReward;
      
      let userCreatedDayIdxForBigReward = -1;
      if (weekContainsUserCreationForBigReward) {
        const daysDiff = Math.floor(
          (userCreatedAtForBigReward - weekStartForBigReward) / (24 * 60 * 60 * 1000)
        );
        userCreatedDayIdxForBigReward = Math.max(0, Math.min(6, daysDiff));
      }

      const downgradeOnMiss = cfg.bigReward.downgradeOnMiss !== false;
      
      if (downgradeOnMiss) {
        // MID-WEEK JOIN: Check if all required days (after user creation) are claimed
        let allRequiredDaysClaimed = false;
        if (weekContainsUserCreationForBigReward && userCreatedDayIdxForBigReward > 0) {
          // User joined mid-week: check if all days from creation day to day 6 are claimed
          const requiredDays = progress.days.slice(userCreatedDayIdxForBigReward, 6);
          allRequiredDaysClaimed = requiredDays.every(d => d.status === 'claimed');
        } else {
          // User joined at start of week: check if all days 1-6 are claimed
          allRequiredDaysClaimed = progress.days.slice(0, 6).every(d => d.status === 'claimed');
        }
        
        // CRITICAL FIX: Big reward should be available in ALL weeks if eligible, not just week 1
        if (allRequiredDaysClaimed) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      } else {
        // If downgradeOnMiss is false, big reward is always eligible (regardless of week number or mid-week join)
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
      }

      if (bigReward) {
        const bigRewardType = bigReward.rewardType || 'Both';
        
        if (bigRewardType === 'Coins' || bigRewardType === 'Both') {
          baseCoins = bigReward.coinValue !== undefined ? bigReward.coinValue : bigReward.coins || 0;
        }
        if (bigRewardType === 'XP' || bigRewardType === 'Both') {
          baseXP = bigReward.xpValue !== undefined ? bigReward.xpValue : bigReward.xp || 0;
        }
        // CRITICAL FIX: For day 7 with big reward, use big reward values as base (not day 7 config)
        // Weekly multiplier will be applied to baseCoins/baseXP later
      } else {
        // Big reward not eligible - use day 6's values as fallback (or day 7 config if exists)
        const day6Config = cfg.days.find((d) => d.dayNumber === 6);
        if (day6Config && day6Config.active) {
          const rewardType = day6Config.rewardType || 'Both';
          if (rewardType === 'Coins' || rewardType === 'Both') {
            baseCoins = day6Config.coinValue !== undefined ? day6Config.coinValue : day6Config.coins || 0;
          }
          if (rewardType === 'XP' || rewardType === 'Both') {
            baseXP = day6Config.xpValue !== undefined ? day6Config.xpValue : day6Config.xp || 0;
          }
        }
      }
    } else {
      // For days 1-6, use normal day config
      const rewardType = dayConfig.rewardType || 'Both';
      if (rewardType === 'Coins' || rewardType === 'Both') {
        baseCoins = dayConfig.coinValue !== undefined ? dayConfig.coinValue : dayConfig.coins || 0;
      }
      if (rewardType === 'XP' || rewardType === 'Both') {
        baseXP = dayConfig.xpValue !== undefined ? dayConfig.xpValue : dayConfig.xp || 0;
        }
    }

    // Apply weekly multiplier if enabled and week > 1
    let finalCoins = baseCoins;
    let finalXP = baseXP;
        if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
      finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
      finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
        }

    // CRITICAL FIX: For day 7, coins and XP are already calculated correctly above
    // (baseCoins/baseXP contain big reward values if eligible, or day 6 values if not)
    // No need to add bigRewardCoins/bigRewardXP separately - that was causing double-counting
    const coins = finalCoins;
    const xp = finalXP;

    // Debug logging for multiplier calculations
    console.log('=== DAILY REWARD V2 MULTIPLIER DEBUG ===', {
      userId,
      dayNumber: day.dayNumber,
      weekNumber,
      weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
      weeklyMultiplierEnabled: cfg.weeklyMultiplier?.enabled,
      baseCoins,
      baseXP,
      finalCoins,
      finalXP,
      bigReward: !!bigReward,
      bigRewardEligible: progress.bigRewardEligible,
    });

    // CRITICAL: Credit rewards FIRST before marking as claimed
    // This ensures atomicity - if crediting fails, status remains claimable
    const user = await User.findById(userId).select('wallet xp badges');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const oldBalance = user.wallet.balance || 0;
    const oldXP = user.xp.current || 0;

    user.wallet.balance = oldBalance + coins;
    user.wallet.lastUpdated = now;

    const { finalXP: finalXPWithTier, multiplier: tierMultiplier } = await applyTierMultiplierToXPV2(
      user,
      xp || 0
    );

    user.xp.current = oldXP + finalXPWithTier;
    user.xp.total = (user.xp.total || 0) + finalXPWithTier;
    
    if (bigReward && cfg.bigReward?.awardBadge && cfg.bigReward?.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName)) user.badges.push(cfg.bigReward.badgeName);
    }

    const tx = new Transaction({
      user: userId,
      type: 'credit',
      amount: coins,
      description: `Daily Reward V2 Day ${day.dayNumber}${bigReward ? ' (Big Reward)' : ''}${weekNumber > 1 ? ` Week ${weekNumber}` : ''}`,
      status: 'completed',
      metadata: { 
        rewardDay: day.dayNumber, 
        bigReward: !!bigReward, 
        baseXp: xp, 
        xp: finalXPWithTier, 
        tierMultiplier,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0
      }
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
    day.status = 'claimed';
    day.claimedAt = now;
    day.coins = coins;
    day.xp = xp;

    // MID-WEEK JOIN: Recalculate big reward eligibility after claiming any day 1-6
    // This ensures eligibility is updated correctly for mid-week joins
    if (day.dayNumber >= 1 && day.dayNumber <= 6 && cfg.bigReward?.downgradeOnMiss !== false) {
      const userForEligibility = await User.findById(userId).select('createdAt');
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
      // CRITICAL FIX: Big reward should be available in ALL weeks if eligible, not just week 1
      if (allRequiredDaysClaimed && cfg.bigReward?.enabled !== false) {
        progress.bigRewardEligible = true;
      } else {
        progress.bigRewardEligible = false;
      }
    }

    if (todayIdx + 1 < progress.days.length) {
      const next = progress.days[todayIdx + 1];
      if (next.status === 'locked') next.status = 'claimable';
    }

    progress.days.forEach((d, idx) => {
      if (idx < todayIdx && d.status === 'locked') d.status = 'missed';
    });

    progress.lastUpdated = now;
    await progress.save();

    setImmediate(async () => {
      try {
        const totalClaimed = await DailyRewardProgress.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$days' },
          { $match: { 'days.status': 'claimed' } },
          { $count: 'total' }
        ]);

        const dailyRewardsClaimed = totalClaimed.length > 0 ? totalClaimed[0].total : 0;

        await trackAchievements(userId, 'wallet', {
          coins: coins,
          xp: xp,
          dayNumber: day.dayNumber,
          bigReward: !!bigReward,
          category: 'daily_reward_v2',
          dailyRewardsClaimed: dailyRewardsClaimed,
          weekNumber: weekNumber
        });
      } catch (error) {
        console.error('Error tracking daily reward V2 achievements:', error);
      }
    });

    res.json({
      success: true,
      data: {
        day: day.dayNumber,
        coins,
        baseXP: xp, // Base XP before tier multiplier
        xp: finalXPWithTier, // Final XP after tier multiplier applied
        tierMultiplier: tierMultiplier, // Show the multiplier that was applied
        bigReward: !!bigReward,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      }
    });
  } catch (e) {
    console.error('Error claiming daily reward V2:', e);
    
    // If progress was already saved with status='claimed' but rewards weren't credited,
    // we need to rollback the status (though this shouldn't happen with the new order)
    // This is a safety check in case of unexpected errors
    try {
      const progress = await DailyRewardProgress.findOne({ userId: req.user.userId, weekStart: { $lte: new Date() } })
        .sort({ weekStart: -1 });
      if (progress) {
        const todayIdx = ((new Date().getUTCDay() + 6) % 7);
        const day = progress.days[todayIdx];
        // Only rollback if status is claimed but no transaction exists
        if (day && day.status === 'claimed' && day.claimedAt) {
          const tx = await Transaction.findOne({
            user: req.user.userId,
            'metadata.rewardDay': day.dayNumber,
            'metadata.weekNumber': progress.weekNumber || 1,
            createdAt: { $gte: new Date(day.claimedAt.getTime() - 5000) } // Within 5 seconds
          });
          if (!tx) {
            // No transaction found, rollback status
            day.status = 'claimable';
            day.claimedAt = null;
            await progress.save();
            console.log(`Rolled back daily reward V2 claim status for user ${req.user.userId}, day ${day.dayNumber}`);
          }
        }
      }
    } catch (rollbackError) {
      console.error('Error during rollback:', rollbackError);
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to claim daily reward V2',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined
    });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const records = await DailyRewardProgress.find({ userId: req.user.userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({ success: true, data: records });
  } catch (e) {
    console.error('Error getting daily reward V2 history:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward V2 history' });
  }
});

module.exports = router;



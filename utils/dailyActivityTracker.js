/**
 * Daily Activity Tracker Utility
 * Tracks user daily activity and manages streak counting
 * @module utils/dailyActivityTracker
 */

const User = require("../models/User");
const Transaction = require("../models/Transaction");
const { trackAchievements } = require("./achievements");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const StreakBonusConfig = require("../models/StreakBonusConfig");

// Cache for streak config (refresh every 5 minutes)
let streakConfigCache = null;
let streakConfigCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Default streak milestone configuration (fallback if DB config not available)
const DEFAULT_STREAK_MILESTONES = [7, 14, 21, 30];
const DEFAULT_STREAK_REWARDS = {
  7: { coins: 50, xp: 25, badge: "Week Warrior 🏆" },
  14: { coins: 150, xp: 75, badge: "Fortnight Fighter 🥇" },
  21: { coins: 300, xp: 150, badge: "Three Week Titan 🏅" },
  30: { coins: 500, xp: 250, badge: "Monthly Master 👑" },
};

// Get streak configuration from database
async function getStreakConfig() {
  const now = Date.now();
  
  // Return cached config if still valid
  if (streakConfigCache && streakConfigCacheTime && (now - streakConfigCacheTime) < CACHE_DURATION) {
    return streakConfigCache;
  }
  
  try {
    const config = await StreakBonusConfig.getConfig();
    const activeMilestones = config.getActiveMilestones();
    
    // Build milestones and rewards from active milestones
    const milestones = activeMilestones.map(m => m.day).sort((a, b) => a - b);
    const rewards = {};
    
    activeMilestones.forEach(milestone => {
      rewards[milestone.day] = {
        rewardType: milestone.rewardType,
        rewardValue: milestone.rewardValue,
        claimMode: milestone.claimMode
      };
    });
    
    streakConfigCache = {
      milestones,
      rewards
    };
    
    streakConfigCacheTime = now;
    return streakConfigCache;
  } catch (error) {
    console.error('Error loading streak config from database, using defaults:', error);
    // Return default config if DB fails
    streakConfigCache = {
      milestones: DEFAULT_STREAK_MILESTONES,
      rewards: DEFAULT_STREAK_REWARDS
    };
    streakConfigCacheTime = now;
    return streakConfigCache;
  }
}

/**
 * Track user activity for today
 * This should be called whenever a user performs any action in the app
 * @param {string} userId - User ID
 * @param {Object} options - Additional tracking options
 * @param {boolean} options.forceTrack - Force track even if already active today
 * @returns {Promise<Object>} Updated activity data
 */
async function trackUserActivity(userId, options = {}) {
  try {
    console.log("Tracking user activity for user:", userId);
    const user = await User.findById(userId).select(
      "wallet xp badges dailyActivity"
    );
    if (!user) {
      throw new Error("User not found");
    }

    const today = new Date();
    const todayStr = getDateString(today);

    // Initialize dailyActivity if it doesn't exist
    if (!user.dailyActivity) {
      user.dailyActivity = {
        currentStreak: 0,
        lastActiveDate: null,
        totalActiveDays: 0,
        activeDates: [],
        longestStreak: 0,
        streakHistory: [],
        lastStreakReset: null,
        resetReason: null,
        awardedMilestones: [], // Track which milestones have been awarded
      };
    }

    const activity = user.dailyActivity;
    const lastActiveDate = activity.lastActiveDate
      ? new Date(activity.lastActiveDate)
      : null;
    const lastActiveStr = lastActiveDate ? getDateString(lastActiveDate) : null;

    // Check if user was already active today
    const isAlreadyActiveToday = activity.activeDates.includes(todayStr);
    const forceTrack = options.forceTrack || false;

    if (!isAlreadyActiveToday || forceTrack) {
      // User is active for the first time today OR force tracking
      if (!isAlreadyActiveToday) {
        activity.activeDates.push(todayStr);
        activity.totalActiveDays += 1;
      }
      activity.lastActiveDate = today;

      // Calculate streak (always recalculate when force tracking)
      await updateStreak(user, activity, todayStr, lastActiveStr);

      // Check for milestone rewards after streak update
      const rewardAwarded = await checkAndAwardMilestoneRewards(user, activity);
    } else {
      // User was already active today, just update lastActiveDate
      activity.lastActiveDate = today;
      // Still need to update streak in case it was reset to 0
      await updateStreak(user, activity, todayStr, lastActiveStr);

      // Check for milestone rewards even if already active today (in case streak was updated)
      const rewardAwarded = await checkAndAwardMilestoneRewards(user, activity);
    }

    // Store reward info for response
    let milestoneRewardInfo = null;
    const currentStreak = activity.currentStreak || 0;
    if (
      STREAK_MILESTONES.includes(currentStreak) &&
      activity.awardedMilestones &&
      activity.awardedMilestones.includes(currentStreak)
    ) {
      const lastAwarded =
        activity.awardedMilestones[activity.awardedMilestones.length - 1];
      if (lastAwarded === currentStreak) {
        milestoneRewardInfo = STREAK_REWARDS[currentStreak];
      }
    }

    await user.save();

    // Track achievements for daily activity
    setImmediate(async () => {
      try {
        await trackAchievements(userId, "daily_activity", {
          currentStreak: activity.currentStreak,
          totalActiveDays: activity.totalActiveDays,
          longestStreak: activity.longestStreak,
          isNewDay: !isAlreadyActiveToday,
        });

        // Also track streak achievements
        await trackAchievements(userId, "streak", {
          currentStreak: activity.currentStreak,
          longestStreak: activity.longestStreak,
        });
      } catch (error) {
        console.error("Error tracking daily activity achievements:", error);
      }
    });

    // Check if a milestone reward was just awarded in this call
    const justAwardedMilestone = milestoneRewardInfo !== null;
    const milestoneReward = milestoneRewardInfo;

    return {
      success: true,
      data: {
        currentStreak: activity.currentStreak,
        totalActiveDays: activity.totalActiveDays,
        longestStreak: activity.longestStreak,
        lastActiveDate: activity.lastActiveDate,
        streakHistory: activity.streakHistory,
        isActiveToday: true,
        lastStreakReset: activity.lastStreakReset,
        resetReason: activity.resetReason,
        isNewDay: !isAlreadyActiveToday,
        milestoneReached: justAwardedMilestone,
        milestoneReward: milestoneReward
          ? {
              day: currentStreak,
              coins: milestoneReward.coins,
              xp: milestoneReward.xp,
              badge: milestoneReward.badge,
            }
          : null,
        newBalance: user.wallet?.balance || 0,
        newXP: user.xp?.current || 0,
      },
    };
  } catch (error) {
    console.error("Error tracking user activity:", error);
    throw error;
  }
}

/**
 * Update user streak based on activity
 * @param {Object} user - User document
 * @param {Object} activity - User's daily activity data
 * @param {string} todayStr - Today's date string
 * @param {string} lastActiveStr - Last active date string
 */
async function updateStreak(user, activity, todayStr, lastActiveStr) {
  const today = new Date();

  if (!lastActiveStr) {
    // First time user is active
    activity.currentStreak = 1;
    activity.longestStreak = Math.max(activity.longestStreak, 1);
    return;
  }

  const lastActiveDate = new Date(lastActiveStr);
  const daysDiff = Math.floor((today - lastActiveDate) / (1000 * 60 * 60 * 24));

  if (daysDiff === 1) {
    // Consecutive day - increment streak
    activity.currentStreak += 1;
    activity.longestStreak = Math.max(
      activity.longestStreak,
      activity.currentStreak
    );
  } else if (daysDiff > 1) {
    // Streak broken - reset to 1
    await recordStreakHistory(user, activity);
    activity.currentStreak = 1;
    activity.lastStreakReset = today;
    activity.resetReason = "missed_day";
  } else if (daysDiff === 0) {
    // Same day - if streak is 0 (after reset), set it to 1
    if (activity.currentStreak === 0) {
      activity.currentStreak = 1;
      activity.longestStreak = Math.max(activity.longestStreak, 1);
    }
  }
}

/**
 * Record streak history when streak is broken
 * @param {Object} user - User document
 * @param {Object} activity - User's daily activity data
 */
async function recordStreakHistory(user, activity) {
  if (activity.currentStreak > 0) {
    // Find the start date of the broken streak
    const endDate = new Date(activity.lastActiveDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (activity.currentStreak - 1));

    // Only record streak history if it's a meaningful streak (more than 1 day or spans multiple days)
    if (
      activity.currentStreak > 1 ||
      startDate.getTime() !== endDate.getTime()
    ) {
      activity.streakHistory.push({
        startDate: startDate,
        endDate: endDate,
        days: activity.currentStreak,
        brokenAt: new Date(),
      });

      // Keep only last 10 streak records to prevent document bloat
      if (activity.streakHistory.length > 10) {
        activity.streakHistory = activity.streakHistory.slice(-10);
      }
    }
  }
}

/**
 * Get user activity statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Activity statistics
 */
async function getUserActivityStats(userId) {
  try {
    const user = await User.findById(userId).select("dailyActivity");
    if (!user || !user.dailyActivity) {
      return {
        currentStreak: 0,
        totalActiveDays: 0,
        longestStreak: 0,
        lastActiveDate: null,
        streakHistory: [],
        isActiveToday: false,
      };
    }

    const activity = user.dailyActivity;
    const todayStr = getDateString(new Date());
    const isActiveToday = activity.activeDates.includes(todayStr);

    // Clean up any invalid streak history entries
    cleanupStreakHistory(activity);

    // Save the cleaned up data
    if (activity.streakHistory) {
      await user.save();
    }

    return {
      currentStreak: activity.currentStreak,
      totalActiveDays: activity.totalActiveDays,
      longestStreak: activity.longestStreak,
      lastActiveDate: activity.lastActiveDate,
      streakHistory: activity.streakHistory,
      isActiveToday: isActiveToday,
      lastStreakReset: activity.lastStreakReset,
      resetReason: activity.resetReason,
    };
  } catch (error) {
    console.error("Error getting user activity stats:", error);
    throw error;
  }
}

/**
 * Get activity leaderboard
 * @param {number} limit - Number of users to return
 * @returns {Promise<Array>} Leaderboard data
 */
async function getActivityLeaderboard(limit = 10) {
  try {
    const users = await User.find({ "dailyActivity.currentStreak": { $gt: 0 } })
      .select(
        "firstName lastName dailyActivity.currentStreak dailyActivity.totalActiveDays"
      )
      .sort({
        "dailyActivity.currentStreak": -1,
        "dailyActivity.totalActiveDays": -1,
      })
      .limit(limit);

    return users.map((user, index) => ({
      rank: index + 1,
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      currentStreak: user.dailyActivity?.currentStreak || 0,
      totalActiveDays: user.dailyActivity?.totalActiveDays || 0,
    }));
  } catch (error) {
    console.error("Error getting activity leaderboard:", error);
    throw error;
  }
}

/**
 * Reset user streak (admin function)
 * @param {string} userId - User ID
 * @param {string} reason - Reason for reset
 * @returns {Promise<Object>} Result
 */
async function resetUserStreak(userId, reason = "admin_reset") {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.dailyActivity) {
      user.dailyActivity = {
        currentStreak: 0,
        lastActiveDate: null,
        totalActiveDays: 0,
        activeDates: [],
        longestStreak: 0,
        streakHistory: [],
        lastStreakReset: null,
        resetReason: null,
      };
    }

    // Only record streak history if there's a meaningful streak to record
    if (user.dailyActivity.currentStreak > 1) {
      await recordStreakHistory(user, user.dailyActivity);
    }

    user.dailyActivity.currentStreak = 0;
    user.dailyActivity.lastStreakReset = new Date();
    user.dailyActivity.resetReason = reason;

    await user.save();

    return {
      success: true,
      message: "User streak reset successfully",
      newStreak: 0,
    };
  } catch (error) {
    console.error("Error resetting user streak:", error);
    throw error;
  }
}

/**
 * Get date string in YYYY-MM-DD format
 * @param {Date} date - Date object
 * @returns {string} Date string
 */
function getDateString(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Clean up invalid streak history entries
 * @param {Object} activity - User's daily activity data
 */
function cleanupStreakHistory(activity) {
  if (activity.streakHistory && activity.streakHistory.length > 0) {
    // Remove entries where startDate equals endDate (invalid entries)
    activity.streakHistory = activity.streakHistory.filter((entry) => {
      const startTime = new Date(entry.startDate).getTime();
      const endTime = new Date(entry.endDate).getTime();
      return startTime !== endTime || entry.days > 1;
    });
  }
}

/**
 * Check if user was active on a specific date
 * @param {string} userId - User ID
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 * @returns {Promise<boolean>} Whether user was active
 */
async function wasUserActiveOnDate(userId, dateStr) {
  try {
    const user = await User.findById(userId).select("dailyActivity");
    if (!user || !user.dailyActivity) {
      return false;
    }

    return user.dailyActivity.activeDates.includes(dateStr);
  } catch (error) {
    console.error("Error checking user activity on date:", error);
    return false;
  }
}

async function checkAndAwardMilestoneRewards(user, activity) {
  try {
    const streakConfig = await getStreakConfig();
    const STREAK_MILESTONES = streakConfig.milestones;
    const STREAK_REWARDS = streakConfig.rewards;
    
    const currentStreak = activity.currentStreak || 0;

    // Initialize awardedMilestones if it doesn't exist
    if (!activity.awardedMilestones) {
      activity.awardedMilestones = [];
    }

    // Check if current streak matches any milestone
    if (STREAK_MILESTONES.includes(currentStreak)) {
      // Check if this milestone has already been awarded
      if (!activity.awardedMilestones.includes(currentStreak)) {
        const reward = STREAK_REWARDS[currentStreak];

        if (reward) {
          // Award reward based on reward type
          if (!user.wallet) user.wallet = { balance: 0 };
          if (!user.xp) user.xp = { current: 0, total: 0 };

          if (reward.rewardType === 'coins') {
            user.wallet.balance = (user.wallet.balance || 0) + reward.rewardValue;
            user.wallet.lastUpdated = new Date();
          } else if (reward.rewardType === 'xp') {
            const { finalXP } = await applyTierMultiplierToXP(user, reward.rewardValue || 0);
            user.xp.current = (user.xp.current || 0) + finalXP;
            user.xp.total = (user.xp.total || 0) + finalXP;
          }

          // Create transaction record
          const transaction = new Transaction({
            user: user._id,
            type: "credit",
            balanceType: reward.rewardType === 'coins' ? 'coins' : 'xp',
            amount: reward.rewardValue,
            description: `Streak Milestone Reward - Day ${currentStreak}`,
            status: reward.claimMode === 'auto' ? "completed" : "pending",
            referenceId: `STREAK-MILESTONE-${currentStreak}-${Date.now()}`,
            metadata: {
              milestoneDay: currentStreak,
              rewardType: reward.rewardType,
              claimMode: reward.claimMode,
            },
          });

          await transaction.save();

          // Mark milestone as awarded
          activity.awardedMilestones.push(currentStreak);

          console.log(
            `✅ Milestone reward awarded: Day ${currentStreak} - ${reward.rewardValue} ${reward.rewardType} (claimMode: ${reward.claimMode})`
          );

          return {
            day: currentStreak,
            rewardType: reward.rewardType,
            rewardValue: reward.rewardValue,
            claimMode: reward.claimMode,
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error checking and awarding milestone rewards:", error);
    return null;
  }
}

module.exports = {
  trackUserActivity,
  getUserActivityStats,
  getActivityLeaderboard,
  resetUserStreak,
  wasUserActiveOnDate,
  getDateString,
  cleanupStreakHistory,
};

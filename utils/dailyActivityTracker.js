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
const SpinWheelLog = require("../models/SpinWheelLog");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const DailyRewardProgress = require("../models/DailyRewardProgress");
const { getISOWeekKey } = require("../utils/dailyRewardHelpers");
const besitosService = require("../services/besitos.service");

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
    
    // Build milestones and rewards from active milestones (now supports multiple rewards per milestone)
    const milestones = activeMilestones.map(m => m.day).sort((a, b) => a - b);
    const rewards = {};
    
    activeMilestones.forEach(milestone => {
      rewards[milestone.day] = {
        rewards: milestone.rewards || [], // Array of { type, value }
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
    // Return default config if DB fails (convert to new format)
    const defaultRewards = {};
    Object.keys(DEFAULT_STREAK_REWARDS).forEach(day => {
      const reward = DEFAULT_STREAK_REWARDS[day];
      defaultRewards[day] = {
        rewards: [
          { type: 'coins', value: reward.coins || 0 },
          { type: 'xp', value: reward.xp || 0 }
        ].filter(r => r.value > 0),
        claimMode: 'auto'
      };
    });
    streakConfigCache = {
      milestones: DEFAULT_STREAK_MILESTONES,
      rewards: defaultRewards
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
    // console.log("Tracking user activity for user:", userId);
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

    // Validate and clean activeDates array to prevent duplicates and invalid entries
    if (activity.activeDates && Array.isArray(activity.activeDates)) {
      // Remove duplicates and invalid date formats
      const validDates = activity.activeDates.filter((dateStr, index, arr) => {
        // Check if it's a valid YYYY-MM-DD format
        const isValidFormat = isValidDateString(dateStr);
        // Check if it's not a duplicate
        const isUnique = arr.indexOf(dateStr) === index;
        return isValidFormat && isUnique;
      });
      
      // Sort dates to maintain chronological order
      validDates.sort();
      
      // Update the array if we found any issues
      if (validDates.length !== activity.activeDates.length) {
        console.log(`🔧 Cleaned activeDates for user ${userId}: removed ${activity.activeDates.length - validDates.length} invalid/duplicate entries`);
        activity.activeDates = validDates;
      }
    } else {
      // Initialize activeDates if it's not an array
      activity.activeDates = [];
    }

    // Store reward info for response
    let rewardAwarded = null;
    
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
      rewardAwarded = await checkAndAwardMilestoneRewards(user, activity);
    } else {
      // User was already active today, just update lastActiveDate
      activity.lastActiveDate = today;
      // Still need to update streak in case it was reset to 0
      await updateStreak(user, activity, todayStr, lastActiveStr);

      // Check for milestone rewards even if already active today (in case streak was updated)
      rewardAwarded = await checkAndAwardMilestoneRewards(user, activity);
    }

    // Store reward info for response - use the actual reward data from checkAndAwardMilestoneRewards
    let milestoneRewardInfo = null;
    const currentStreak = activity.currentStreak || 0;
    
    // If a reward was just awarded in this call, use that data
    if (rewardAwarded && rewardAwarded.day === currentStreak) {
      milestoneRewardInfo = rewardAwarded;
    } else {
      // Otherwise, check if milestone was awarded previously and get config from database
      if (activity.awardedMilestones && activity.awardedMilestones.includes(currentStreak)) {
        const lastAwarded = activity.awardedMilestones[activity.awardedMilestones.length - 1];
        if (lastAwarded === currentStreak) {
          // Get reward config from database
          const streakConfig = await getStreakConfig();
          const rewardConfig = streakConfig.rewards[currentStreak];
          
          if (rewardConfig && rewardConfig.rewards) {
            // Build reward info from database config
            const coins = rewardConfig.rewards.find(r => r.type === 'coins')?.value || 0;
            const xp = rewardConfig.rewards.find(r => r.type === 'xp')?.value || 0;
            
            milestoneRewardInfo = {
              day: currentStreak,
              rewards: rewardConfig.rewards,
              claimMode: rewardConfig.claimMode,
              coins: coins,
              xp: xp,
              directlyTransferred: true
            };
          }
        }
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
              day: milestoneReward.day || currentStreak,
              rewards: milestoneReward.rewards || [
                ...(milestoneReward.coins ? [{ type: 'coins', value: milestoneReward.coins }] : []),
                ...(milestoneReward.xp ? [{ type: 'xp', value: milestoneReward.xp }] : [])
              ],
              claimMode: milestoneReward.claimMode || 'auto',
              coins: milestoneReward.coins || 0,
              xp: milestoneReward.xp || 0,
              directlyTransferred: milestoneReward.directlyTransferred !== false,
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
 * Check if user completed any game task today from any downloaded game
 * @param {string} userId - User ID
 * @param {Date} today - Today's date
 * @returns {Promise<boolean>} Whether user completed any game task today
 */
async function checkGameTaskCompletionToday(userId, today) {
  try {
    // Call besitos API to get user's games with tasks
    const besitosResponse = await besitosService.getUserData(userId);
    const besitosData = besitosResponse.data || besitosResponse;

    // Get only downloaded games (in_progress and completed)
    // Available games are not downloaded yet, so we don't check them
    const inProgressGames = besitosData.in_progress || besitosData.data?.in_progress || [];
    const completedGames = besitosData.completed || besitosData.data?.completed || [];
    
    // Only check games that user has downloaded
    const downloadedGames = [...inProgressGames, ...completedGames];

    // Normalize today's date to UTC start and end of day for comparison
    const todayStr = today.toISOString().split('T')[0];
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // Check if any task from any downloaded game was completed today
    // Use completed_datetime from besitos API response to check if task was completed today
    for (const game of downloadedGames) {
      if (game.goals && Array.isArray(game.goals)) {
        for (const goal of game.goals) {
          // Check if task is completed
          if (goal.completed === true && goal.completed_datetime) {
            // Parse the completed_datetime (format: "2026-01-30 00:23:31")
            try {
              const completedDate = new Date(goal.completed_datetime);
              
              // Check if the completion date is within today's range
              if (completedDate >= normalizedStart && completedDate <= normalizedEnd) {
                return true;
              }
            } catch (error) {
              // If date parsing fails, skip this goal
              console.error("Error parsing completed_datetime:", goal.completed_datetime, error);
              continue;
            }
          }
        }
      }
    }

    // No tasks completed today
    return false;
  } catch (error) {
    console.error("Error checking game task completion:", error);
    // In case of error, assume no completion to be safe
    return false;
  }
}

/**
 * OLD LOGIC - COMMENTED OUT: Check if user completed any challenge today (spinwheel, daily challenge, or daily reward)
 * This logic is now replaced with game task completion logic
 * @param {string} userId - User ID
 * @param {Date} today - Today's date
 * @returns {Promise<boolean>} Whether user completed any challenge
 */
// async function checkChallengeCompletionToday(userId, today) {
//   try {
//     // Normalize today's date to UTC start and end of day
//     const normalizedStart = new Date(
//       Date.UTC(
//         today.getUTCFullYear(),
//         today.getUTCMonth(),
//         today.getUTCDate(),
//         0,
//         0,
//         0,
//         0
//       )
//     );
//     const normalizedEnd = new Date(
//       Date.UTC(
//         today.getUTCFullYear(),
//         today.getUTCMonth(),
//         today.getUTCDate(),
//         23,
//         59,
//         59,
//         999
//       )
//     );

//     // Check 1: Spinwheel completion
//     const spinWheelCompleted = await SpinWheelLog.findOne({
//       user: userId,
//       createdAt: { $gte: normalizedStart, $lte: normalizedEnd }
//     });

//     if (spinWheelCompleted) {
//       return true;
//     }

//     // Check 2: Daily Challenge completion
//     const challengeCompleted = await UserChallengeProgress.findOne({
//       userId: userId,
//       challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
//       status: 'completed'
//     });

//     if (challengeCompleted) {
//       return true;
//     }

//     // Check 3: Daily Reward completion (check if today's reward is claimed)
//     // Calculate today's day index (0-6, Monday = 0)
//     const todayIdx = (today.getUTCDay() + 6) % 7; // Convert Sunday=0 to Monday=0
//     
//     // Calculate week key using the same helper function as daily rewards
//     const weekKey = getISOWeekKey(today);

//     const dailyRewardProgress = await DailyRewardProgress.findOne({
//       userId: userId,
//       weekKey: weekKey
//     });

//     if (dailyRewardProgress && dailyRewardProgress.days && dailyRewardProgress.days[todayIdx]) {
//       const todayReward = dailyRewardProgress.days[todayIdx];
//       if (todayReward.status === 'claimed') {
//         return true;
//       }
//     }

//     // None of the challenges were completed today
//     return false;
//   } catch (error) {
//     console.error("Error checking challenge completion:", error);
//     // In case of error, assume no completion to be safe
//     return false;
//   }
// }

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
    const today = new Date();
    const todayStr = getDateString(today);
    const isActiveToday = activity.activeDates.includes(todayStr);

    // Check if user completed any game task today from any downloaded game
    const completedGameTaskToday = await checkGameTaskCompletionToday(userId, today);
    
    // OLD LOGIC - COMMENTED OUT: Check if user completed any challenge today (spinwheel, daily challenge, or daily reward)
    // const completedChallengeToday = await checkChallengeCompletionToday(userId, today);

    // Clean up any invalid streak history entries
    cleanupStreakHistory(activity);

    // NEW LOGIC: If user didn't complete any game task today, subtract 1 day from streak
    // (but not below 0)
    let adjustedStreak = activity.currentStreak || 0;
    let needsSave = false;

    if (!completedGameTaskToday && adjustedStreak > 0) {
      adjustedStreak = Math.max(0, adjustedStreak - 1);
      
      // Update the user's streak if it changed
      if (adjustedStreak !== activity.currentStreak) {
        activity.currentStreak = adjustedStreak;
        activity.lastStreakReset = today;
        activity.resetReason = "no_game_task_completed";
        needsSave = true;
      }
    }
    
    // OLD LOGIC - COMMENTED OUT: If user didn't complete any challenge today, subtract 1 day from streak
    // if (!completedChallengeToday && adjustedStreak > 0) {
    //   adjustedStreak = Math.max(0, adjustedStreak - 1);
    //   
    //   // Update the user's streak if it changed
    //   if (adjustedStreak !== activity.currentStreak) {
    //     activity.currentStreak = adjustedStreak;
    //     activity.lastStreakReset = today;
    //     activity.resetReason = "no_challenge_completed";
    //     needsSave = true;
    //   }
    // }

    // Save if any changes were made
    if (needsSave) {
      await user.save();
    }

    return {
      currentStreak: adjustedStreak,
      totalActiveDays: activity.totalActiveDays,
      longestStreak: activity.longestStreak,
      lastActiveDate: activity.lastActiveDate,
      streakHistory: activity.streakHistory,
      isActiveToday: isActiveToday,
      lastStreakReset: activity.lastStreakReset,
      resetReason: activity.resetReason,
      gameTaskCompletedToday: completedGameTaskToday,
      // OLD FIELD - COMMENTED OUT: challengeCompletedToday: completedChallengeToday,
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
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('Invalid date provided to getDateString');
  }
  return date.toISOString().split("T")[0];
}

/**
 * Validate date string format (YYYY-MM-DD)
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} Whether the date string is valid
 */
function isValidDateString(dateStr) {
  if (typeof dateStr !== 'string') return false;
  
  // Check format with regex
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  
  // Check if it's a valid date
  const date = new Date(dateStr + 'T00:00:00.000Z');
  return !isNaN(date.getTime()) && date.toISOString().split('T')[0] === dateStr;
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
      // Reload user's latest state to prevent race conditions (double-check before awarding)
      const latestUser = await User.findById(user._id).select('dailyActivity');
      const latestAwardedMilestones = latestUser?.dailyActivity?.awardedMilestones || [];
      
      // Check if this milestone has already been awarded (use latest state to prevent duplicates)
      if (!latestAwardedMilestones.includes(currentStreak) && !activity.awardedMilestones.includes(currentStreak)) {
        const rewardConfig = STREAK_REWARDS[currentStreak];

        if (rewardConfig && rewardConfig.rewards && rewardConfig.rewards.length > 0) {
          // Award all rewards for this milestone - DIRECTLY TRANSFER based on admin config
          if (!user.wallet) user.wallet = { balance: 0 };
          if (!user.xp) user.xp = { current: 0, total: 0 };

          const rewardsEarned = [];
          let coinsReward = 0;
          let xpReward = 0;
          let finalXP = 0;

          // Directly credit all rewards immediately based on admin config and collect values
          for (const reward of rewardConfig.rewards) {
            // Skip rewards with value 0
            if (reward.value === 0 || reward.value === null || reward.value === undefined) {
              continue;
            }

            if (reward.type === 'coins') {
              // Directly transfer coins to user wallet
              coinsReward = reward.value;
              user.wallet.balance = (user.wallet.balance || 0) + reward.value;
              user.wallet.lastUpdated = new Date();
            } else if (reward.type === 'xp') {
              // Directly transfer XP to user (with tier multiplier applied)
              const xpResult = await applyTierMultiplierToXP(user, reward.value || 0);
              finalXP = xpResult.finalXP;
              xpReward = reward.value; // Store original value
              user.xp.current = (user.xp.current || 0) + finalXP;
              user.xp.total = (user.xp.total || 0) + finalXP;
            }

            rewardsEarned.push({ 
              type: reward.type, 
              value: reward.type === 'xp' ? finalXP : reward.value 
            });
          }

          // Create a single transaction entry showing both coin and XP values
          const hasCoins = coinsReward > 0;
          const hasXP = xpReward > 0;
          const totalRewards = (hasCoins ? 1 : 0) + (hasXP ? 1 : 0);

          if (totalRewards > 0) {
            // Build description showing both values
            const rewardParts = [];
            if (hasCoins) rewardParts.push(`${coinsReward} Coins`);
            if (hasXP) rewardParts.push(`${finalXP} XP`);
            const description = `Login Streak Milestone Reward - Day ${currentStreak} - ${rewardParts.join(' + ')}`;

            // Use coins as primary balanceType if both exist, otherwise use the one that exists
            const primaryBalanceType = hasCoins ? 'coins' : 'xp';
            const primaryAmount = hasCoins ? coinsReward : finalXP;

            const transaction = new Transaction({
              user: user._id,
              type: "credit",
              balanceType: primaryBalanceType,
              amount: primaryAmount,
              description: description,
              status: "completed", // Always completed since rewards are directly transferred
              referenceId: `LOGIN-STREAK-${currentStreak}-${Date.now()}`,
              metadata: {
                source: "login_streak_milestone",
                milestoneDay: currentStreak,
                claimMode: rewardConfig.claimMode,
                directlyTransferred: true,
                rewards: {
                  coins: hasCoins ? coinsReward : null,
                  xp: hasXP ? { original: xpReward, final: finalXP } : null
                }
              },
            });

            await transaction.save();
          }

          // Mark milestone as awarded
          // Note: activity is a reference to user.dailyActivity, so this update will be saved when user.save() is called
          activity.awardedMilestones.push(currentStreak);

          const rewardsSummary = rewardsEarned.map(r => `${r.value} ${r.type}`).join(', ');
          console.log(
            `✅ Login Streak Milestone Reward Directly Transferred: Day ${currentStreak} - ${rewardsSummary} (claimMode: ${rewardConfig.claimMode})`
          );

          return {
            day: currentStreak,
            rewards: rewardsEarned,
            claimMode: rewardConfig.claimMode,
            directlyTransferred: true,
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
  isValidDateString,
  cleanupStreakHistory,
};

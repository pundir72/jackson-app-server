const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const StreakBonusConfig = require('../models/StreakBonusConfig');
const BonusDay = require('../models/BonusDay');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');

// Cache for streak config (refresh every 5 minutes)
let streakConfigCache = null;
let streakConfigCacheTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Streak configuration defaults (fallback if DB config not available)
const DEFAULT_STREAK_CONFIG = {
  maxDays: 30,
  milestones: [7, 14, 21, 30],
  rewards: {
    7: { coins: 50, xp: 25, badge: 'Week Warrior 🏆' },
    14: { coins: 150, xp: 75, badge: 'Fortnight Fighter 🥇' },
    21: { coins: 300, xp: 150, badge: 'Three Week Titan 🏅' },
    30: { coins: 500, xp: 250, badge: 'Monthly Master 👑' }
  },
  resetFallback: true, // Reset to last milestone instead of 0
  taskTypes: ['game', 'survey', 'challenge', 'receipt']
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
    
    // Build rewards object from active milestones (now supports multiple rewards per milestone)
    const rewards = {};
    activeMilestones.forEach(milestone => {
      rewards[milestone.day] = {
        rewards: milestone.rewards || [], // Array of { type, value }
        claimMode: milestone.claimMode
      };
    });
    
    // Build milestones array
    const milestones = activeMilestones.map(m => m.day).sort((a, b) => a - b);
    
    streakConfigCache = {
      maxDays: 30,
      milestones,
      rewards,
      resetFallback: true,
      taskTypes: ['game', 'survey', 'challenge', 'receipt'],
      _config: config // Store full config for reference
    };
    
    streakConfigCacheTime = now;
    return streakConfigCache;
  } catch (error) {
    console.error('Error loading streak config from database, using defaults:', error);
    // Return default config if DB fails (convert to new format)
    const defaultRewards = {};
    Object.keys(DEFAULT_STREAK_CONFIG.rewards).forEach(day => {
      const reward = DEFAULT_STREAK_CONFIG.rewards[day];
      defaultRewards[day] = {
        rewards: [
          { type: 'coins', value: reward.coins || 0 },
          { type: 'xp', value: reward.xp || 0 }
        ].filter(r => r.value > 0),
        claimMode: 'auto'
      };
    });
    streakConfigCache = {
      ...DEFAULT_STREAK_CONFIG,
      rewards: defaultRewards
    };
    streakConfigCacheTime = now;
    return streakConfigCache;
  }
}

// Clear cache (call this when config is updated)
function clearStreakConfigCache() {
  streakConfigCache = null;
  streakConfigCacheTime = null;
}

// Get bonus days (user-facing endpoint)
router.get('/bonus-days', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('streak country userSegment');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentStreak = user.streak?.current || 0;
    
    // Build user profile for eligibility check
    const userProfile = {
      currentStreak: currentStreak,
      country: user.country || null,
      userSegment: user.userSegment || 'all' // Default to 'all' if not set
    };

    // Get all active bonus days
    const allBonusDays = await BonusDay.findActive();
    
    // Filter bonus days based on user eligibility
    const eligibleBonusDays = allBonusDays
      .filter(bonusDay => bonusDay.isEligibleForUser(userProfile))
      .map(bonusDay => {
        // Check if user has reached this bonus day
        const isReached = currentStreak >= bonusDay.conditions.minStreak;
        const isUpcoming = currentStreak < bonusDay.conditions.minStreak;
        const daysRemaining = Math.max(0, bonusDay.conditions.minStreak - currentStreak);

        return {
          id: bonusDay._id,
          dayNumber: bonusDay.dayNumber,
          title: bonusDay.title,
          description: bonusDay.description,
          primaryReward: {
            type: bonusDay.primaryReward.type,
            value: bonusDay.primaryReward.value,
            metadata: bonusDay.primaryReward.metadata || {}
          },
          alternateReward: bonusDay.alternateReward ? {
            type: bonusDay.alternateReward.type,
            value: bonusDay.alternateReward.value,
            metadata: bonusDay.alternateReward.metadata || {}
          } : null,
          resetRule: {
            onMiss: bonusDay.resetRule.onMiss,
            gracePeriod: bonusDay.resetRule.gracePeriod,
            fallbackAction: bonusDay.resetRule.fallbackAction
          },
          status: {
            isReached: isReached,
            isUpcoming: isUpcoming,
            isEligible: true,
            daysRemaining: daysRemaining,
            currentStreak: currentStreak,
            requiredStreak: bonusDay.conditions.minStreak
          },
          notification: bonusDay.notification.enabled ? {
            title: bonusDay.notification.title || bonusDay.title,
            message: bonusDay.notification.message || bonusDay.description,
            imageUrl: bonusDay.notification.imageUrl,
            actionText: bonusDay.notification.actionText,
            scheduledTime: bonusDay.notification.scheduledTime
          } : null,
          banner: bonusDay.banner.enabled ? {
            title: bonusDay.banner.title || bonusDay.title,
            subtitle: bonusDay.banner.subtitle || bonusDay.description,
            imageUrl: bonusDay.banner.imageUrl,
            backgroundColor: bonusDay.banner.backgroundColor,
            textColor: bonusDay.banner.textColor,
            position: bonusDay.banner.position
          } : null
        };
      })
      .sort((a, b) => a.dayNumber - b.dayNumber); // Sort by day number

    res.json({
      success: true,
      data: {
        bonusDays: eligibleBonusDays,
        currentStreak: currentStreak,
        totalBonusDays: eligibleBonusDays.length,
        reachedBonusDays: eligibleBonusDays.filter(bd => bd.status.isReached).length,
        upcomingBonusDays: eligibleBonusDays.filter(bd => bd.status.isUpcoming).length
      }
    });
  } catch (error) {
    console.error('Error getting bonus days:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bonus days'
    });
  }
});

// Get streak status
router.get('/status', protect, async (req, res) => {
  try {
    const STREAK_CONFIG = await getStreakConfig();
    const user = await User.findById(req.user.userId).select('xp streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if streak needs to be updated BEFORE reading currentStreak
    const today = new Date();
    const streak = user.streak || {};
    const lastUpdate = streak.lastUpdated ? new Date(streak.lastUpdated) : null;
    const needsUpdate = !lastUpdate || !isSameDay(today, lastUpdate);
    
    if (needsUpdate) {
      await updateStreakStatus(user, STREAK_CONFIG);
      // Re-fetch user to ensure we have the latest streak data after update
      const updatedUser = await User.findById(req.user.userId).select('xp streak country userSegment');
      if (updatedUser) {
        user.streak = updatedUser.streak;
        if (updatedUser.country) user.country = updatedUser.country;
        if (updatedUser.userSegment) user.userSegment = updatedUser.userSegment;
      }
    }
    
    // Read currentStreak AFTER potential update to ensure we have the latest value
    const currentStreak = (user.streak || {}).current || 0;
    const lastMilestone = getLastMilestone(currentStreak, STREAK_CONFIG);
    const nextMilestone = getNextMilestone(currentStreak, STREAK_CONFIG);

    // Optionally include bonus days if requested
    let bonusDays = null;
    if (req.query.includeBonusDays === 'true') {
      try {
        const userProfile = {
          currentStreak: currentStreak,
          country: user.country || null,
          userSegment: user.userSegment || 'all'
        };
        
        const allBonusDays = await BonusDay.findActive();
        const eligibleBonusDays = allBonusDays
          .filter(bonusDay => bonusDay.isEligibleForUser(userProfile))
          .map(bonusDay => ({
            dayNumber: bonusDay.dayNumber,
            title: bonusDay.title,
            description: bonusDay.description,
            primaryReward: bonusDay.primaryReward,
            alternateReward: bonusDay.alternateReward,
            isReached: currentStreak >= bonusDay.conditions.minStreak,
            daysRemaining: Math.max(0, bonusDay.conditions.minStreak - currentStreak)
          }))
          .sort((a, b) => a.dayNumber - b.dayNumber);
        
        bonusDays = eligibleBonusDays;
      } catch (error) {
        console.error('Error loading bonus days in streak status:', error);
        // Don't fail the request if bonus days fail to load
      }
    }

    // Get completed tasks to properly determine which days are actually completed
    const completedTasks = (user.streak || {}).completedTasks || [];
    
    res.json({
      success: true,
      data: {
        currentStreak,
        lastMilestone,
        nextMilestone,
        isActive: currentStreak > 0,
        daysRemaining: nextMilestone ? nextMilestone.day - currentStreak : 0,
        progress: {
          current: currentStreak,
          target: nextMilestone ? nextMilestone.day : STREAK_CONFIG.maxDays,
          percentage: nextMilestone ? Math.round((currentStreak / nextMilestone.day) * 100) : 100
        },
        rewards: getAvailableRewards(currentStreak, STREAK_CONFIG),
        streakTree: generateStreakTree(currentStreak, STREAK_CONFIG, completedTasks),
        ...(bonusDays && { bonusDays })
      }
    });
  } catch (error) {
    console.error('Error getting streak status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak status'
    });
  }
});

// Complete daily task
router.post('/complete-task', protect, async (req, res) => {
  try {
    const STREAK_CONFIG = await getStreakConfig();
    const { taskType, taskId } = req.body;
    const user = await User.findById(req.user.userId).select('xp streak wallet country');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate task type
    if (!STREAK_CONFIG.taskTypes.includes(taskType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task type'
      });
    }

    // Check if task was already completed today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (user.streak?.completedTasks?.includes(todayStr)) {
      return res.status(400).json({
        success: false,
        error: 'Daily task already completed today'
      });
    }

    // Update streak
    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    const newStreak = currentStreak + 1;
    
    // Update streak data
    user.streak = {
      current: newStreak,
      lastUpdated: today,
      completedTasks: [...(streak.completedTasks || []), todayStr],
      lastTaskType: taskType,
      lastTaskId: taskId
    };

    // Check for milestone rewards - get country-specific config if available
    const userCountry = user.country || null;
    const milestoneReward = await getMilestoneRewardForUser(newStreak, STREAK_CONFIG, userCountry);
    let rewardEarned = null;
    
    if (milestoneReward && milestoneReward.rewards && milestoneReward.rewards.length > 0) {
      const rewardsEarned = [];
      
      // Award all rewards for this milestone
      for (const reward of milestoneReward.rewards) {
        if (reward.type === 'coins') {
          user.wallet.balance = (user.wallet.balance || 0) + reward.value;
        } else if (reward.type === 'xp') {
          const { finalXP } = await applyTierMultiplierToXP(user, reward.value);
          user.xp.current = (user.xp.current || 0) + finalXP;
          user.xp.total = (user.xp.total || 0) + finalXP;
        }
        
        // Create transaction record for each reward
        const transaction = new Transaction({
          user: req.user.userId,
          type: 'credit',
          balanceType: reward.type === 'coins' ? 'coins' : 'xp',
          amount: reward.value,
          description: `Streak Milestone Reward - Day ${newStreak} - ${reward.type === 'coins' ? 'Coins' : 'XP'}`,
          status: milestoneReward.claimMode === 'auto' ? 'completed' : 'pending',
          referenceId: `STREAK-${newStreak}-${reward.type}-${Date.now()}`,
          metadata: {
            milestoneDay: newStreak,
            rewardType: reward.type,
            rewardValue: reward.value,
            claimMode: milestoneReward.claimMode
          }
        });
        
        await transaction.save();
        
        rewardsEarned.push({
          type: reward.type,
          value: reward.value
        });
      }
      
      rewardEarned = {
        day: newStreak,
        rewards: rewardsEarned,
        claimMode: milestoneReward.claimMode,
        requiresAd: milestoneReward.claimMode === 'watch_ad'
      };
    }

    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Daily task completed!',
        newStreak: newStreak,
        milestoneReached: !!milestoneReward,
        reward: rewardEarned,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        badges: user.badges || []
      }
    });
  } catch (error) {
    console.error('Error completing daily task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete daily task'
    });
  }
});

// Get streak history
router.get('/history', protect, async (req, res) => {
  try {
    const STREAK_CONFIG = await getStreakConfig();
    const { page = 1, limit = 30 } = req.query;
    const user = await User.findById(req.user.userId).select('streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const streak = user.streak || {};
    const completedTasks = streak.completedTasks || [];
    
    // Generate streak history for the last 30 days
    const history = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const isCompleted = completedTasks.includes(dateStr);
      
      history.push({
        day: 30 - i,
        date: dateStr,
        isCompleted,
        isToday: i === 0,
        isMilestone: STREAK_CONFIG.milestones.includes(30 - i)
      });
    }

    res.json({
      success: true,
      data: {
        history,
        currentStreak: streak.current || 0,
        totalDays: completedTasks.length,
        milestones: STREAK_CONFIG.milestones.map(day => {
          const rewardConfig = STREAK_CONFIG.rewards[day];
          return {
            day,
            rewards: rewardConfig?.rewards || [],
            claimMode: rewardConfig?.claimMode || 'auto',
            isReached: (streak.current || 0) >= day
          };
        })
      }
    });
  } catch (error) {
    console.error('Error getting streak history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak history'
    });
  }
});

// Reset streak (if user misses a day)
router.post('/reset', protect, async (req, res) => {
  try {
    const STREAK_CONFIG = await getStreakConfig();
    const user = await User.findById(req.user.userId).select('streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    const lastMilestone = getLastMilestone(currentStreak, STREAK_CONFIG);
    
    if (STREAK_CONFIG.resetFallback && lastMilestone) {
      // Reset to last milestone
      user.streak = {
        current: lastMilestone.day,
        lastUpdated: new Date(),
        completedTasks: streak.completedTasks || [],
        resetAt: new Date(),
        resetReason: 'missed_day'
      };
      
      await user.save();
      
      res.json({
        success: true,
        data: {
          message: `Streak reset to Day ${lastMilestone.day} (last milestone)`,
          newStreak: lastMilestone.day,
          resetReason: 'missed_day'
        }
      });
    } else {
      // Reset to 0
      user.streak = {
        current: 0,
        lastUpdated: new Date(),
        completedTasks: [],
        resetAt: new Date(),
        resetReason: 'missed_day'
      };
      
      await user.save();
      
      res.json({
        success: true,
        data: {
          message: 'Streak reset to Day 0',
          newStreak: 0,
          resetReason: 'missed_day'
        }
      });
    }
  } catch (error) {
    console.error('Error resetting streak:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset streak'
    });
  }
});

// Get streak leaderboard
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get top users by streak
    const topUsers = await User.find({
      'streak.current': { $gt: 0 }
    })
    .select('firstName streak badges')
    .sort({ 'streak.current': -1 })
    .limit(parseInt(limit));

    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      name: user.firstName || 'Anonymous',
      streak: user.streak.current || 0,
      badges: user.badges || [],
      isCurrentUser: user._id.toString() === req.user.userId
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        totalUsers: topUsers.length
      }
    });
  } catch (error) {
    console.error('Error getting streak leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak leaderboard'
    });
  }
});

// Helper functions
async function updateStreakStatus(user, STREAK_CONFIG) {
  const today = new Date();
  const streak = user.streak || {};
  const lastUpdate = streak.lastUpdated ? new Date(streak.lastUpdated) : null;
  
  if (!lastUpdate) {
    // First time - initialize streak
    user.streak = {
      current: 0,
      lastUpdated: today,
      completedTasks: []
    };
  } else {
    const daysDiff = Math.floor((today - lastUpdate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 1) {
      // Streak broken - reset
      const lastMilestone = getLastMilestone(streak.current || 0, STREAK_CONFIG);
      
      if (STREAK_CONFIG.resetFallback && lastMilestone) {
        user.streak = {
          current: lastMilestone.day,
          lastUpdated: today,
          completedTasks: streak.completedTasks || [],
          resetAt: today,
          resetReason: 'missed_day'
        };
      } else {
        user.streak = {
          current: 0,
          lastUpdated: today,
          completedTasks: [],
          resetAt: today,
          resetReason: 'missed_day'
        };
      }
    }
  }
  
  await user.save();
}

function getLastMilestone(currentStreak, STREAK_CONFIG) {
  const milestones = STREAK_CONFIG.milestones.filter(day => day <= currentStreak);
  return milestones.length > 0 ? { day: Math.max(...milestones) } : null;
}

function getNextMilestone(currentStreak, STREAK_CONFIG) {
  const milestones = STREAK_CONFIG.milestones.filter(day => day > currentStreak);
  return milestones.length > 0 ? { day: Math.min(...milestones) } : null;
}

function getMilestoneReward(currentStreak, STREAK_CONFIG) {
  // Returns reward config with rewards array and claimMode
  return STREAK_CONFIG.rewards[currentStreak] || null;
}

// Get milestone reward considering user's country (if country-specific configs exist)
// Currently, StreakBonusConfig doesn't support country-specific rewards,
// but this function allows for future extension
async function getMilestoneRewardForUser(currentStreak, STREAK_CONFIG, userCountry) {
  // For now, use the global config from STREAK_CONFIG
  // The STREAK_CONFIG should already contain admin-configured rewards from the database
  // If country-specific support is needed in the future, it can be added here
  
  // Ensure we're using the admin-configured rewards, not defaults
  // The STREAK_CONFIG.rewards should already be populated from StreakBonusConfig.getConfig()
  const reward = STREAK_CONFIG.rewards[currentStreak];
  
  if (reward && reward.rewards && reward.rewards.length > 0) {
    // Admin-configured reward found
    return reward;
  }
  
  // Fallback: return null if no reward configured (shouldn't happen if admin configured properly)
  return null;
}

function getAvailableRewards(currentStreak, STREAK_CONFIG) {
  const rewards = [];
  
  STREAK_CONFIG.milestones.forEach(day => {
    if (day > currentStreak) {
      const rewardConfig = STREAK_CONFIG.rewards[day];
      rewards.push({
        day,
        rewards: rewardConfig?.rewards || [],
        claimMode: rewardConfig?.claimMode || 'auto',
        isReached: false,
        isNext: day === getNextMilestone(currentStreak, STREAK_CONFIG)?.day
      });
    }
  });
  
  return rewards;
}

function generateStreakTree(currentStreak, STREAK_CONFIG, completedTasks = []) {
  const tree = [];
  const today = new Date();
  
  // Sort completed tasks by date (most recent first) to map to streak days
  const sortedCompletedTasks = [...completedTasks]
    .map(dateStr => new Date(dateStr))
    .sort((a, b) => b - a)
    .slice(0, currentStreak); // Only take the most recent completed tasks up to currentStreak
  
  for (let day = 1; day <= STREAK_CONFIG.maxDays; day++) {
    let isCompleted = false;
    
    if (day <= currentStreak && sortedCompletedTasks.length > 0) {
      // For days within the current streak, check if there's a corresponding completed task
      // Day 1 = most recent completed day, Day N = N days ago
      const daysAgo = currentStreak - day;
      
      // Check if there's a completed task that matches this day's position in the streak
      // We check if the date is within the last N days
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - daysAgo);
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      // Only mark as completed if this specific date is in completedTasks
      isCompleted = completedTasks.includes(targetDateStr);
    } else {
      // Days beyond current streak are not completed
      isCompleted = false;
    }
    
    const isMilestone = STREAK_CONFIG.milestones.includes(day);
    
    const rewardConfig = isMilestone ? STREAK_CONFIG.rewards[day] : null;
    tree.push({
      day,
      isCompleted,
      isMilestone,
      rewards: rewardConfig?.rewards || [],
      claimMode: rewardConfig?.claimMode || 'auto',
      isCurrent: day === currentStreak + 1
    });
  }
  
  return tree;
}

function isSameDay(date1, date2) {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

// Export functions for use in other routes
module.exports = router;
module.exports.clearStreakConfigCache = clearStreakConfigCache;
module.exports.getStreakConfig = getStreakConfig;
module.exports.getMilestoneReward = getMilestoneReward;

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const StreakBonusConfig = require('../models/StreakBonusConfig');
const BonusDay = require('../models/BonusDay');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');
const XPTier = require('../models/XPTier');

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

// Helper function to get user's accessBenefits multiplier from XPTier (same as daily challenges)
async function getAccessBenefitsMultiplier(userXp) {
  try {
    // Find matching tier
    const tier = await XPTier.findByXpValue(userXp);

    if (tier && tier.accessBenefits) {
      const multiplier = parseAccessBenefitsMultiplier(tier.accessBenefits);
      return multiplier;
    }
  } catch (error) {
    console.error("Error getting accessBenefits multiplier:", error);
  }
  return 1.0;
}

// Get bonus days (user-facing endpoint)
router.get('/bonus-days', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('streak country userSegment xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentStreak = user.streak?.current || 0;
    const currentXp = user.xp?.current || 0;
    
    // Calculate tier multiplier and user tier (same logic as daily challenges)
    const tierMultiplier = await getAccessBenefitsMultiplier(currentXp);
    const tier = await XPTier.findByXpValue(currentXp);
    const userTier = tier ? tier.tierName : null;
    
    // Build user profile for eligibility check
    const userProfile = {
      currentStreak: currentStreak,
      country: user.country || null,
      userSegment: user.userSegment || 'all' // Default to 'all' if not set
    };

    // Get all active bonus days (show all, not just eligible ones)
    const allBonusDays = await BonusDay.findActive();
    
    // Map all bonus days with status and tier-multiplied rewards
    // Note: We show ALL bonus days so users can see upcoming rewards
    const bonusDaysWithStatus = allBonusDays.map(bonusDay => {
        // Check if user has reached this bonus day
        const isReached = currentStreak >= bonusDay.conditions.minStreak;
        const isUpcoming = currentStreak < bonusDay.conditions.minStreak;
        const daysRemaining = Math.max(0, bonusDay.conditions.minStreak - currentStreak);
        
        // Check if user is eligible for this bonus day (for claiming purposes)
        const isEligible = bonusDay.isEligibleForUser(userProfile);

        // Calculate tier-multiplied values for XP rewards
        const primaryIsXP = bonusDay.primaryReward.type === 'xp';
        const alternateIsXP = bonusDay.alternateReward?.type === 'xp';
        
        const primaryBaseValue = bonusDay.primaryReward.value;
        const primaryFinalValue = primaryIsXP 
          ? Math.round(primaryBaseValue * tierMultiplier)
          : primaryBaseValue;
        const primaryTierMultiplier = primaryIsXP ? tierMultiplier : 1.0;
        
        const alternateBaseValue = bonusDay.alternateReward?.value || 0;
        const alternateFinalValue = alternateIsXP
          ? Math.round(alternateBaseValue * tierMultiplier)
          : alternateBaseValue;
        const alternateTierMultiplier = alternateIsXP ? tierMultiplier : 1.0;

        // Calculate total coins and XP for this bonus day (for easy display)
        let totalCoins = 0;
        let totalXP = 0;
        let totalBaseXP = 0;
        
        if (bonusDay.primaryReward.type === 'coins') {
          totalCoins += primaryFinalValue;
        } else if (bonusDay.primaryReward.type === 'xp') {
          totalXP += primaryFinalValue;
          totalBaseXP += primaryBaseValue;
        }
        
        if (bonusDay.alternateReward) {
          if (bonusDay.alternateReward.type === 'coins') {
            totalCoins += alternateFinalValue;
          } else if (bonusDay.alternateReward.type === 'xp') {
            totalXP += alternateFinalValue;
            totalBaseXP += alternateBaseValue;
          }
        }

        // Determine primary reward type for display
        const rewardType = bonusDay.primaryReward.type;

        return {
          dayNumber: bonusDay.dayNumber,
          coins: totalCoins, // Total coins from all rewards (0 if no coins)
          xp: totalXP, // Total XP after tier multiplier (0 if no XP)
          isReached: isReached, // Whether user has reached this milestone
          rewardType: rewardType // Primary reward type (coins, xp, giftcard, etc.)
        };
      })
      .sort((a, b) => a.dayNumber - b.dayNumber); // Sort by day number

    // Calculate statistics
    const reachedBonusDays = bonusDaysWithStatus.filter(bd => bd.isReached);
    const upcomingBonusDays = bonusDaysWithStatus.filter(bd => !bd.isReached);
    
    // Count eligible bonus days (for reference - users can see all but only claim eligible ones)
    const eligibleBonusDays = allBonusDays.filter(bd => bd.isEligibleForUser(userProfile));

    res.json({
      success: true,
      data: {
        bonusDays: bonusDaysWithStatus, // Return all bonus days
        currentStreak: currentStreak,
        totalBonusDays: bonusDaysWithStatus.length,
        reachedBonusDays: reachedBonusDays.length,
        upcomingBonusDays: upcomingBonusDays.length,
        eligibleBonusDays: eligibleBonusDays.length, // Count of actually eligible ones
        userTier: userTier, // User's current tier
        tierMultiplier: tierMultiplier // Current tier multiplier
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
      // Load user's dailyActivity to check for duplicate milestone awards
      const userWithActivity = await User.findById(req.user.userId).select('dailyActivity');
      
      // Initialize dailyActivity if it doesn't exist
      if (!userWithActivity.dailyActivity) {
        userWithActivity.dailyActivity = {
          currentStreak: 0,
          lastActiveDate: null,
          totalActiveDays: 0,
          activeDates: [],
          longestStreak: 0,
          streakHistory: [],
          lastStreakReset: null,
          resetReason: null,
          awardedMilestones: [],
        };
      }
      
      // Initialize awardedMilestones if it doesn't exist
      if (!userWithActivity.dailyActivity.awardedMilestones) {
        userWithActivity.dailyActivity.awardedMilestones = [];
      }
      
      // Check if this milestone has already been awarded (prevent duplicates)
      const awardedMilestones = userWithActivity.dailyActivity.awardedMilestones || [];
      
      if (!awardedMilestones.includes(newStreak)) {
        // Milestone not yet awarded - proceed with awarding
        const rewardsEarned = [];
        let coinsReward = 0;
        let xpReward = 0;
        let finalXP = 0;
        
        // Award all rewards for this milestone and collect values
        for (const reward of milestoneReward.rewards) {
          if (reward.type === 'coins') {
            coinsReward = reward.value;
            user.wallet.balance = (user.wallet.balance || 0) + reward.value;
          } else if (reward.type === 'xp') {
            const xpResult = await applyTierMultiplierToXP(user, reward.value);
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
          const description = `Streak Milestone Reward - Day ${newStreak} - ${rewardParts.join(' + ')}`;
          
          // Use coins as primary balanceType if both exist, otherwise use the one that exists
          const primaryBalanceType = hasCoins ? 'coins' : 'xp';
          const primaryAmount = hasCoins ? coinsReward : finalXP;
          
          const transaction = new Transaction({
            user: req.user.userId,
            type: 'credit',
            balanceType: primaryBalanceType,
            amount: primaryAmount,
            description: description,
            status: milestoneReward.claimMode === 'auto' ? 'completed' : 'pending',
            referenceId: `STREAK-${newStreak}-${Date.now()}`,
            metadata: {
              milestoneDay: newStreak,
              claimMode: milestoneReward.claimMode,
              rewards: {
                coins: hasCoins ? coinsReward : null,
                xp: hasXP ? { original: xpReward, final: finalXP } : null
              }
            }
          });
          
          await transaction.save();
        }
        
        // Mark milestone as awarded to prevent duplicates
        userWithActivity.dailyActivity.awardedMilestones.push(newStreak);
        await userWithActivity.save();
        
        rewardEarned = {
          day: newStreak,
          rewards: rewardsEarned,
          claimMode: milestoneReward.claimMode,
          requiresAd: milestoneReward.claimMode === 'watch_ad'
        };
        
        console.log(`✅ Task Completion Streak Milestone Reward Awarded: Day ${newStreak} - Prevented duplicate`);
      } else {
        // Milestone already awarded - skip to prevent duplicate transactions
        console.log(`⚠️ Task Completion Streak Milestone Day ${newStreak} already awarded - skipping duplicate`);
        rewardEarned = null; // Don't return reward info if already awarded
      }
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
    const user = await User.findById(req.user.userId).select('streak xp');
    
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

    // Process milestones with XP multiplier applied (same as daily challenge/reward)
    const milestonesWithMultipliers = await Promise.all(
      STREAK_CONFIG.milestones.map(async (day) => {
        const rewardConfig = STREAK_CONFIG.rewards[day];
        if (!rewardConfig || !rewardConfig.rewards) {
          return {
            day,
            rewards: [],
            claimMode: 'auto',
            isReached: (streak.current || 0) >= day
          };
        }

        // Apply XP multiplier to each reward (same logic as daily challenge/reward)
        const processedRewards = await Promise.all(
          rewardConfig.rewards.map(async (reward) => {
            if (reward.type === 'xp' && reward.value > 0) {
              // Apply tier-based XP multiplier based on admin config
              const { finalXP } = await applyTierMultiplierToXP(user, reward.value);
              return {
                type: reward.type,
                value: finalXP // Return final XP after multiplier
              };
            } else {
              // Coins or other types - no multiplier needed
              return {
                type: reward.type,
                value: reward.value
              };
            }
          })
        );

        return {
          day,
          rewards: processedRewards,
          claimMode: rewardConfig.claimMode || 'auto',
          isReached: (streak.current || 0) >= day
        };
      })
    );

    res.json({
      success: true,
      data: {
        history,
        currentStreak: streak.current || 0,
        totalDays: completedTasks.length,
        milestones: milestonesWithMultipliers
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

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const StreakBonusConfig = require('../models/StreakBonusConfig');
const BonusDay = require('../models/BonusDay');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');
const XPTier = require('../models/XPTier');
const besitosService = require('../services/besitos.service');

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

    // ADM-DR-028 FIX: Get all active bonus days (show all, not just eligible ones)
    // findActive() already filters by isActive: true, so deleted bonus days won't appear
    const allBonusDays = await BonusDay.findActive();
    
    // Get completed tasks to verify actual completion (not just streak count)
    const completedTasks = user.streak?.completedTasks || [];
    const completedTasksSet = new Set(completedTasks);
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // CRITICAL FIX: Helper function to check if all required days are completed
    const areAllRequiredDaysCompleted = (bonusDay) => {
      // If requiresCompletion is false, skip the check
      if (bonusDay.conditions.requiresCompletion === false) {
        return currentStreak >= bonusDay.conditions.minStreak;
      }
      
      // Verify today is completed (streak must start from today)
      if (!completedTasksSet.has(todayStr)) {
        return false;
      }
      
      // Count consecutive completed days backwards from today
      let consecutiveCount = 0;
      const checkDate = new Date(today);
      for (let i = 0; i < bonusDay.conditions.minStreak; i++) {
        const dateStr = checkDate.toISOString().split('T')[0];
        if (completedTasksSet.has(dateStr)) {
          consecutiveCount++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          // Gap found - not all required days are completed
          return false;
        }
      }
      
      // Verify we have at least minStreak consecutive days
      return consecutiveCount >= bonusDay.conditions.minStreak;
    };
    
    // Map all bonus days with status and tier-multiplied rewards
    // Note: We show ALL bonus days so users can see upcoming rewards
    const bonusDaysWithStatus = allBonusDays.map(bonusDay => {
        // CRITICAL FIX: Check if user has reached this bonus day
        // For requiresCompletion=true, verify all required days are actually completed
        // For requiresCompletion=false, just check streak count
        const isReached = areAllRequiredDaysCompleted(bonusDay);
        const isUpcoming = !isReached;
        const daysRemaining = Math.max(0, bonusDay.conditions.minStreak - currentStreak);
        
        // CRITICAL FIX: Check if user is eligible for this bonus day (for claiming purposes)
        // Pass completedTasks to userProfile so isEligibleForUser can verify completion
        const userProfileWithCompletedTasks = {
          ...userProfile,
          completedTasks: completedTasks
        };
        const isEligible = bonusDay.isEligibleForUser(userProfileWithCompletedTasks);
        
        // CRITICAL FIX: Calculate progress percentage based on CONSECUTIVE completed days ending today
        // Progress should ONLY show consecutive days with NO gaps ending today
        // CLIENT REQUIREMENT: If user misses ANY day, progress should restart from beginning
        let progressPercentage = 0;
        if (bonusDay.conditions.requiresCompletion !== false) {
          // CRITICAL: Must start from today - if today is not completed, progress is 0
          const todayStr = today.toISOString().split('T')[0];
          if (!completedTasksSet.has(todayStr)) {
            progressPercentage = 0; // No progress if today is not completed
            console.log(`[BONUS-PROGRESS] Bonus Day ${bonusDay.dayNumber}: Progress = 0% (today not completed)`);
          } else {
            // Count consecutive completed days backwards from today (must be unbroken chain ending today)
            let consecutiveCompletedDays = 0;
            const checkDate = new Date(today);
            let foundGap = false;
            
            // Start from today and count backwards consecutively
            // CRITICAL: We only count up to minStreak days (the required days for this bonus)
            for (let i = 0; i < bonusDay.conditions.minStreak; i++) {
              const dateStr = checkDate.toISOString().split('T')[0];
              if (completedTasksSet.has(dateStr)) {
                consecutiveCompletedDays++;
                checkDate.setDate(checkDate.getDate() - 1);
              } else {
                // CRITICAL FIX: If we hit a gap, stop counting immediately
                // Progress should only reflect consecutive days ending today with NO gaps
                foundGap = true;
                console.log(`[BONUS-PROGRESS] Bonus Day ${bonusDay.dayNumber}: Gap found at ${dateStr}, stopping count at ${consecutiveCompletedDays} consecutive days`);
                break;
              }
            }
            
            // CRITICAL FIX: Progress should ONLY be calculated based on consecutive days ending today
            // CLIENT REQUIREMENT: If there's a gap (foundGap=true), progress should show ONLY the consecutive days from the gap forward
            // This means if user had 3 days, missed 1, then completed 2 more, progress shows 2 (not 3+2)
            if (consecutiveCompletedDays > 0) {
              progressPercentage = Math.min(100, Math.round((consecutiveCompletedDays / bonusDay.conditions.minStreak) * 100));
              console.log(`[BONUS-PROGRESS] Bonus Day ${bonusDay.dayNumber}: ${consecutiveCompletedDays}/${bonusDay.conditions.minStreak} consecutive days ending today = ${progressPercentage}%${foundGap ? ' (gap found, progress restarted from gap)' : ''}`);
            } else {
              progressPercentage = 0; // No progress if no consecutive days ending today
              console.log(`[BONUS-PROGRESS] Bonus Day ${bonusDay.dayNumber}: Progress = 0% (no consecutive days ending today)`);
            }
          }
        } else {
          // If requiresCompletion is false, use streak-based progress
          progressPercentage = Math.min(100, Math.round((currentStreak / bonusDay.conditions.minStreak) * 100));
          console.log(`[BONUS-PROGRESS] Bonus Day ${bonusDay.dayNumber}: Progress = ${progressPercentage}% (streak-based, requiresCompletion=false)`);
        }

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

        // CRITICAL FIX: Add resetRule information with clear explanations
        // This clarifies what "Reset on miss" means and how it affects streak/bonus logic
        const resetRule = bonusDay.resetRule || {};
        const resetRuleInfo = {
          onMiss: resetRule.onMiss !== undefined ? resetRule.onMiss : true, // Default: true
          gracePeriod: resetRule.gracePeriod || 0, // Days to wait before reset (0-7)
          fallbackAction: resetRule.fallbackAction || 'reset_streak', // Action when missed
          // Clear explanation for frontend display
          explanation: getResetRuleExplanation(resetRule)
        };

        return {
          dayNumber: bonusDay.dayNumber,
          coins: totalCoins, // Total coins from all rewards (0 if no coins)
          xp: totalXP, // Total XP after tier multiplier (0 if no XP)
          isReached: isReached, // Whether user has reached this milestone (all required days completed)
          isEligible: isEligible, // Whether user is eligible to claim (includes completion check)
          progressPercentage: progressPercentage, // Progress percentage based on completed days
          daysRemaining: daysRemaining, // Days remaining to reach milestone
          rewardType: rewardType, // Primary reward type (coins, xp, giftcard, etc.)
          resetRule: resetRuleInfo // Reset rule information with explanations
        };
      })
      .sort((a, b) => a.dayNumber - b.dayNumber); // Sort by day number

    // Calculate statistics
    const reachedBonusDays = bonusDaysWithStatus.filter(bd => bd.isReached);
    const upcomingBonusDays = bonusDaysWithStatus.filter(bd => !bd.isReached);
    
    // Count eligible bonus days (for reference - users can see all but only claim eligible ones)
    // CRITICAL FIX: Pass completedTasks to userProfile for proper eligibility check
    const userProfileForEligibility = {
      ...userProfile,
      completedTasks: completedTasks
    };
    const eligibleBonusDays = allBonusDays.filter(bd => bd.isEligibleForUser(userProfileForEligibility));

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

// CRITICAL FIX: Helper function to generate clear explanation for reset rule
// This clarifies what "Reset on miss" means and how it affects streak/bonus logic
function getResetRuleExplanation(resetRule) {
  const onMiss = resetRule?.onMiss !== undefined ? resetRule.onMiss : true;
  const gracePeriod = resetRule?.gracePeriod || 0;
  const fallbackAction = resetRule?.fallbackAction || 'reset_streak';

  if (!onMiss) {
    return {
      title: "No Reset on Miss",
      description: "Your streak will not be reset if you miss a day. You can continue from where you left off.",
      impact: "Missing a day does not affect your streak or bonus eligibility."
    };
  }

  // Build explanation based on grace period and fallback action
  let description = "";
  let impact = "";

  if (gracePeriod > 0) {
    description = `If you miss a day, you have ${gracePeriod} day${gracePeriod > 1 ? 's' : ''} grace period before your streak resets.`;
    impact = `Missing ${gracePeriod + 1} consecutive day${gracePeriod + 1 > 1 ? 's' : ''} will reset your streak.`;
  } else {
    description = "If you miss a day, your streak will be reset immediately.";
    impact = "Missing even one day will reset your streak to 0.";
  }

  // Add fallback action explanation
  switch (fallbackAction) {
    case 'pause_streak':
      description += " Your streak will be paused (not reset) when you miss a day.";
      impact += " Your streak count will remain but won't increase until you complete a day again.";
      break;
    case 'give_alternate':
      description += " You'll receive an alternate reward if you miss a day.";
      impact += " Missing a day will reset your streak but you'll still get a reward.";
      break;
    case 'no_action':
      description += " No action will be taken if you miss a day.";
      impact += " Your streak will remain unchanged even if you miss a day.";
      break;
    case 'reset_streak':
    default:
      description += " Your streak will be reset to 0 if you miss a day.";
      impact += " You'll need to start over from day 1 to reach this bonus again.";
      break;
  }

  return {
    title: "Reset on Miss",
    description: description,
    impact: impact,
    gracePeriodDays: gracePeriod,
    action: fallbackAction
  };
}

// Helper function to check if user completed any game task today
async function checkGameTaskCompletionToday(userId, today) {
  try {
    console.log('  [CHECK TASK] Checking if user completed any game task today...');
    console.log('  [CHECK TASK] User ID:', userId);
    console.log('  [CHECK TASK] Today:', today.toISOString().split('T')[0]);
    
    // Call besitos API to get user's games with tasks
    const besitosResponse = await besitosService.getUserData(userId);
    const besitosData = besitosResponse.data || besitosResponse;

    // Get only downloaded games (in_progress and completed)
    // Available games are not downloaded yet, so we don't check them
    const inProgressGames = besitosData.in_progress || besitosData.data?.in_progress || [];
    const completedGames = besitosData.completed || besitosData.data?.completed || [];
    
    // Only check games that user has downloaded
    const downloadedGames = [...inProgressGames, ...completedGames];
    
    console.log('  [CHECK TASK] Downloaded games count:', downloadedGames.length);
    console.log('  [CHECK TASK] In Progress games:', inProgressGames.length);
    console.log('  [CHECK TASK] Completed games:', completedGames.length);

    // Get today's date string in YYYY-MM-DD format for comparison
    // This avoids timezone issues by comparing date strings instead of timestamps
    const todayDateStr = today.toISOString().split('T')[0]; // "2026-01-30"
    
    console.log('  [CHECK TASK] Today date string (YYYY-MM-DD):', todayDateStr);

    // Check if any task from any downloaded game was completed today
    // Use completed_datetime from besitos API response to check if task was completed today
    let gameIndex = 0;
    for (const game of downloadedGames) {
      gameIndex++;
      if (game.goals && Array.isArray(game.goals)) {
        console.log(`  [CHECK TASK] Game ${gameIndex} (${game.title || game.id}): ${game.goals.length} goals`);
        let goalIndex = 0;
        for (const goal of game.goals) {
          goalIndex++;
          // Check if task is completed
          if (goal.completed === true && goal.completed_datetime) {
            // Parse the completed_datetime (format: "2026-01-30 00:23:31")
            try {
              // Extract date part from completed_datetime (format: "2026-01-30 00:23:31")
              // Split by space and take first part to get "2026-01-30"
              const completedDateStr = goal.completed_datetime.split(' ')[0];
              console.log(`    [CHECK TASK] Goal ${goalIndex} (${goal.text || goal.goal_id}): completed_datetime = ${goal.completed_datetime}, date part = ${completedDateStr}`);
              
              // Compare date strings directly (YYYY-MM-DD format)
              // This avoids timezone conversion issues
              if (completedDateStr === todayDateStr) {
                console.log(`    [CHECK TASK] ✅ FOUND! Goal ${goalIndex} was completed TODAY (${completedDateStr} === ${todayDateStr})`);
                return true;
              } else {
                console.log(`    [CHECK TASK] Goal ${goalIndex} was completed on ${completedDateStr}, not today (${todayDateStr})`);
              }
            } catch (error) {
              // If date parsing fails, skip this goal
              console.error(`    [CHECK TASK] Error parsing completed_datetime for goal ${goalIndex}:`, goal.completed_datetime, error);
              continue;
            }
          } else {
            if (goal.completed === true && !goal.completed_datetime) {
              console.log(`    [CHECK TASK] Goal ${goalIndex} is completed but has no completed_datetime`);
            }
          }
        }
      } else {
        console.log(`  [CHECK TASK] Game ${gameIndex} (${game.title || game.id}): No goals array`);
      }
    }

    // No tasks completed today
    console.log('  [CHECK TASK] ❌ No tasks completed today');
    return false;
  } catch (error) {
    console.error("  [CHECK TASK] Error checking game task completion:", error);
    return false;
  }
}

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

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const streak = user.streak || {};
    const lastUpdate = streak.lastUpdated ? new Date(streak.lastUpdated) : null;
    const lastUpdateStr = lastUpdate ? lastUpdate.toISOString().split('T')[0] : null;
    
    console.log('\n=== STREAK CALCULATION DEBUG START ===');
    console.log('Today:', todayStr);
    console.log('Last Update:', lastUpdateStr);
    console.log('Current Streak (from DB):', streak.current || 0);
    console.log('Completed Tasks (from DB):', streak.completedTasks || []);
    
    // NEW LOGIC: Check if user completed any game task today
    const completedGameTaskToday = await checkGameTaskCompletionToday(req.user.userId, today);
    console.log('Completed Game Task Today:', completedGameTaskToday);
    
    // Initialize streak if it doesn't exist
    if (!streak.current && streak.current !== 0) {
      streak.current = 0;
      streak.completedTasks = [];
      streak.lastUpdated = today;
      console.log('Initialized new streak');
    }
    
    // Ensure completedTasks is an array
    if (!streak.completedTasks) streak.completedTasks = [];
    
    // Check if we need to update streak based on game task completion
    const isNewDay = !lastUpdateStr || lastUpdateStr !== todayStr;
    console.log('Is New Day:', isNewDay);
    
    // Get current streak value
    const currentStreakValue = streak.current || 0;
    console.log('Current Streak Value:', currentStreakValue);
    
    if (isNewDay) {
      console.log('--- Processing NEW DAY ---');
      // It's a new day - update streak based on task completion
      let newStreakValue = currentStreakValue;
      
      if (completedGameTaskToday) {
        console.log('User completed task today - INCREASING streak by 1');
        // User completed a task today - increase streak by 1
        newStreakValue = currentStreakValue + 1;
        
        // Add today to completedTasks if not already there
        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          console.log('Added today to completedTasks');
        } else {
          console.log('Today already in completedTasks');
        }
        streak.lastUpdated = today;
      } else {
        console.log('User did NOT complete task today - DECREASING streak by 1');
        // User didn't complete any task today - decrease streak by 1 (but not below 0)
        newStreakValue = Math.max(0, currentStreakValue - 1);
        
        // Remove today from completedTasks if it was there
        const beforeFilter = streak.completedTasks.length;
        streak.completedTasks = streak.completedTasks.filter(date => date !== todayStr);
        const afterFilter = streak.completedTasks.length;
        console.log(`Filtered completedTasks: ${beforeFilter} -> ${afterFilter}`);
        
        streak.lastUpdated = today;
        if (newStreakValue < currentStreakValue) {
          streak.resetAt = today;
          streak.resetReason = 'no_game_task_completed';
        }
      }
      
      // Update streak value
      streak.current = newStreakValue;
      console.log(`Streak updated: ${currentStreakValue} -> ${newStreakValue}`);
      
    } else {
      console.log('--- Processing SAME DAY ---');
      // Same day - update based on current completion status
      if (completedGameTaskToday && !streak.completedTasks.includes(todayStr)) {
        console.log('Task completed today but not recorded - adding today');
        // Task completed today but not recorded - add it
        // Don't change streak on same day, just record the completion
        streak.completedTasks.push(todayStr);
        streak.lastUpdated = today;
      } else if (!completedGameTaskToday && streak.completedTasks.includes(todayStr)) {
        console.log('Task was marked as completed but actually not - removing today');
        // Task was marked as completed but actually not completed - remove it
        // Don't change streak on same day, just remove the completion
        streak.completedTasks = streak.completedTasks.filter(date => date !== todayStr);
        streak.lastUpdated = today;
      } else {
        console.log('No changes needed for same day');
      }
    }
    
    console.log('Completed Tasks (final):', [...streak.completedTasks]);
    console.log('Final Streak Value:', streak.current);
    
    // Only save if streak changed or if we need to update lastUpdated
    const oldStreak = currentStreakValue;
    const newStreak = streak.current;
    console.log('Old Streak:', oldStreak, '| New Streak:', newStreak);
    
    if (newStreak !== oldStreak || isNewDay) {
      console.log('Streak changed or new day - saving to database');
      await user.save();
      console.log('Saved to database');
      
      // Re-fetch user to ensure we have the latest streak data after update
      const updatedUser = await User.findById(req.user.userId).select('xp streak country userSegment');
      if (updatedUser) {
        user.streak = updatedUser.streak;
        if (updatedUser.country) user.country = updatedUser.country;
        if (updatedUser.userSegment) user.userSegment = updatedUser.userSegment;
        console.log('Re-fetched user from database');
      }
    } else {
      console.log('No changes - not saving to database');
    }
    
    console.log('Final Streak Value:', streak.current);
    console.log('=== STREAK CALCULATION DEBUG END ===\n');
    
    // OLD LOGIC - COMMENTED OUT: Check if streak needs to be updated BEFORE reading currentStreak
    // const needsUpdate = !lastUpdate || !isSameDay(today, lastUpdate);
    // if (needsUpdate) {
    //   await updateStreakStatus(user, STREAK_CONFIG);
    //   // Re-fetch user to ensure we have the latest streak data after update
    //   const updatedUser = await User.findById(req.user.userId).select('xp streak country userSegment');
    //   if (updatedUser) {
    //     user.streak = updatedUser.streak;
    //     if (updatedUser.country) user.country = updatedUser.country;
    //     if (updatedUser.userSegment) user.userSegment = updatedUser.userSegment;
    //   }
    // }
    
    // Read currentStreak - use the updated value from streak object
    const currentStreak = streak.current || 0;
    console.log('=== FINAL VALUES BEFORE RESPONSE ===');
    console.log('currentStreak (from streak.current):', currentStreak);
    console.log('streak.completedTasks (final):', streak.completedTasks || []);
    console.log('user.streak.current (from DB after save):', (user.streak || {}).current);
    
    const lastMilestone = getLastMilestone(currentStreak, STREAK_CONFIG);
    const nextMilestone = getNextMilestone(currentStreak, STREAK_CONFIG);
    console.log('lastMilestone:', lastMilestone);
    console.log('nextMilestone:', nextMilestone);

    // Optionally include bonus days if requested
    let bonusDays = null;
    if (req.query.includeBonusDays === 'true') {
      try {
        // CRITICAL FIX: Get completed tasks to verify actual completion
        const completedTasks = streak.completedTasks || [];
        const completedTasksSet = new Set(completedTasks);
        const todayStr = today.toISOString().split('T')[0];
        
        // CRITICAL FIX: Helper function to check if all required days are completed
        const areAllRequiredDaysCompleted = (bonusDay) => {
          // If requiresCompletion is false, skip the check
          if (bonusDay.conditions.requiresCompletion === false) {
            return currentStreak >= bonusDay.conditions.minStreak;
          }
          
          // Verify today is completed (streak must start from today)
          if (!completedTasksSet.has(todayStr)) {
            return false;
          }
          
          // Count consecutive completed days backwards from today
          let consecutiveCount = 0;
          const checkDate = new Date(today);
          for (let i = 0; i < bonusDay.conditions.minStreak; i++) {
            const dateStr = checkDate.toISOString().split('T')[0];
            if (completedTasksSet.has(dateStr)) {
              consecutiveCount++;
              checkDate.setDate(checkDate.getDate() - 1);
            } else {
              // Gap found - not all required days are completed
              return false;
            }
          }
          
          // Verify we have at least minStreak consecutive days
          return consecutiveCount >= bonusDay.conditions.minStreak;
        };
        
        const userProfile = {
          currentStreak: currentStreak,
          country: user.country || null,
          userSegment: user.userSegment || 'all',
          completedTasks: completedTasks // CRITICAL FIX: Pass completedTasks for verification
        };
        
        // ADM-DR-027 FIX: Get all active bonus days, but filter out duplicates
        // When admin edits Day-2 to Day-3, both might exist - we only want the most recent one
        const allBonusDays = await BonusDay.findActive();
        
        // ADM-DR-027 FIX: Group by dayNumber and keep only the most recently updated one
        const uniqueBonusDays = [];
        const bonusDaysByDayNumber = {};
        
        for (const bonusDay of allBonusDays) {
          const dayNum = bonusDay.dayNumber;
          if (!bonusDaysByDayNumber[dayNum] || 
              bonusDay.updatedAt > bonusDaysByDayNumber[dayNum].updatedAt) {
            bonusDaysByDayNumber[dayNum] = bonusDay;
          }
        }
        
        // Convert back to array
        const deduplicatedBonusDays = Object.values(bonusDaysByDayNumber);
        
        const eligibleBonusDays = deduplicatedBonusDays
          .filter(bonusDay => bonusDay.isEligibleForUser(userProfile))
          .map(bonusDay => {
            // CRITICAL FIX: Add resetRule information with clear explanations
            const resetRule = bonusDay.resetRule || {};
            const resetRuleInfo = {
              onMiss: resetRule.onMiss !== undefined ? resetRule.onMiss : true,
              gracePeriod: resetRule.gracePeriod || 0,
              fallbackAction: resetRule.fallbackAction || 'reset_streak',
              explanation: getResetRuleExplanation(resetRule)
            };
            
            return {
            dayNumber: bonusDay.dayNumber,
            title: bonusDay.title,
            description: bonusDay.description,
            primaryReward: bonusDay.primaryReward,
            alternateReward: bonusDay.alternateReward,
              isReached: areAllRequiredDaysCompleted(bonusDay), // CRITICAL FIX: Use completion check, not just streak count
              daysRemaining: Math.max(0, bonusDay.conditions.minStreak - currentStreak),
              resetRule: resetRuleInfo // Add reset rule information
            };
          })
          .sort((a, b) => a.dayNumber - b.dayNumber);
        
        bonusDays = eligibleBonusDays;
      } catch (error) {
        console.error('Error loading bonus days in streak status:', error);
        // Don't fail the request if bonus days fail to load
      }
    }

    // Get completed tasks to properly determine which days are actually completed
    const completedTasks = (user.streak || {}).completedTasks || [];
    console.log('=== GENERATING RESPONSE ===');
    console.log('completedTasks for streakTree:', completedTasks);
    console.log('currentStreak for streakTree:', currentStreak);
    
    const streakTree = generateStreakTree(currentStreak, STREAK_CONFIG, completedTasks);
    console.log('Generated streakTree - checking first few days:');
    streakTree.slice(0, 10).forEach(day => {
      console.log(`  Day ${day.day}: isCompleted=${day.isCompleted}, isCurrent=${day.isCurrent}`);
    });
    
    const responseData = {
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
        streakTree: streakTree,
        ...(bonusDays && { bonusDays })
      }
    };
    
    console.log('=== RESPONSE BEING SENT ===');
    console.log('Response currentStreak:', responseData.data.currentStreak);
    console.log('Response completedTasks count:', completedTasks.length);
    console.log('Response streakTree days completed:', streakTree.filter(d => d.isCompleted).length);
    console.log('=== END DEBUG ===\n');
    
    res.json(responseData);
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
  console.log('  [STREAK TREE] Generating streak tree...');
  console.log('  [STREAK TREE] currentStreak:', currentStreak);
  console.log('  [STREAK TREE] completedTasks:', completedTasks);
  
  const tree = [];
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Convert completedTasks to Set for faster lookup
  const completedSet = new Set(completedTasks);
  console.log('  [STREAK TREE] Today:', todayStr);
  console.log('  [STREAK TREE] Today in completedTasks?', completedSet.has(todayStr));
  
  // Generate tree for all 30 days
  // Each day represents: Day 1 = today, Day 2 = yesterday, Day N = N-1 days ago
  for (let day = 1; day <= STREAK_CONFIG.maxDays; day++) {
    // Calculate which actual date this day represents
    const daysAgo = day - 1; // Day 1 is 0 days ago (today), Day 2 is 1 day ago, etc.
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    
    // Check if this specific date is in completedTasks
    const isCompleted = completedSet.has(targetDateStr);
    
    if (day <= 10) {
      console.log(`  [STREAK TREE] Day ${day}: daysAgo=${daysAgo}, targetDate=${targetDateStr}, isCompleted=${isCompleted}`);
    }
    
    const isMilestone = STREAK_CONFIG.milestones.includes(day);
    const rewardConfig = isMilestone ? STREAK_CONFIG.rewards[day] : null;
    
    // isCurrent marks the next day the user needs to complete to increase streak
    // It's the day after the current streak value
    tree.push({
      day,
      isCompleted,
      isMilestone,
      rewards: rewardConfig?.rewards || [],
      claimMode: rewardConfig?.claimMode || 'auto',
      isCurrent: day === currentStreak + 1
    });
  }
  
  console.log('  [STREAK TREE] Generated tree with', tree.length, 'days');
  console.log('  [STREAK TREE] Days marked as completed:', tree.filter(d => d.isCompleted).map(d => d.day));
  
  return tree;
}

function isSameDay(date1, date2) {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

/**
 * Clean up completedTasks to only keep consecutive dates from today
 * This removes old dates that are not part of the current streak
 * @param {Array<string>} completedTasks - Array of date strings
 * @param {Date} today - Today's date
 * @returns {Array<string>} Cleaned array with only consecutive dates from today
 */
function cleanupCompletedTasks(completedTasks, today) {
  console.log('  [CLEANUP] Starting cleanup...');
  console.log('  [CLEANUP] Input completedTasks:', completedTasks);
  
  if (!completedTasks || completedTasks.length === 0) {
    console.log('  [CLEANUP] No completed tasks - returning empty array');
    return [];
  }
  
  const todayStr = today.toISOString().split('T')[0];
  const completedSet = new Set(completedTasks);
  
  console.log('  [CLEANUP] Today:', todayStr);
  console.log('  [CLEANUP] Today in completedTasks?', completedSet.has(todayStr));
  
  // If today is not in the array, return empty (streak is broken)
  if (!completedSet.has(todayStr)) {
    console.log('  [CLEANUP] Today NOT in completedTasks - streak broken, returning empty array');
    return [];
  }
  
  // Build array of consecutive dates from today backwards
  const consecutiveDates = [todayStr];
  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1);
  
  console.log('  [CLEANUP] Building consecutive dates from today backwards...');
  let iteration = 0;
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (completedSet.has(dateStr)) {
      consecutiveDates.push(dateStr);
      console.log(`  [CLEANUP] Day ${iteration + 1} ago (${dateStr}): FOUND - added to consecutive dates`);
      checkDate.setDate(checkDate.getDate() - 1);
      iteration++;
    } else {
      console.log(`  [CLEANUP] Day ${iteration + 1} ago (${dateStr}): NOT FOUND - breaking streak`);
      break;
    }
  }
  
  console.log('  [CLEANUP] Consecutive dates found:', consecutiveDates);
  console.log('  [CLEANUP] Total consecutive days:', consecutiveDates.length);
  return consecutiveDates;
}

/**
 * Calculate consecutive streak from completed tasks array
 * Counts backwards from today, checking for consecutive days
 * IMPORTANT: Streak must start from TODAY - if today is not completed, streak is 0
 * @param {Array<string>} completedTasks - Array of date strings (YYYY-MM-DD)
 * @param {Date} today - Today's date
 * @returns {number} Consecutive streak count
 */
function calculateConsecutiveStreak(completedTasks, today) {
  console.log('  [CALCULATE] Starting streak calculation...');
  console.log('  [CALCULATE] Input completedTasks:', completedTasks);
  
  if (!completedTasks || completedTasks.length === 0) {
    console.log('  [CALCULATE] No completed tasks - returning 0');
    return 0;
  }
  
  // Convert to Set for faster lookup
  const completedSet = new Set(completedTasks);
  
  // IMPORTANT: Streak must start from TODAY
  // If today is not completed, streak is 0
  const todayStr = today.toISOString().split('T')[0];
  console.log('  [CALCULATE] Today:', todayStr);
  console.log('  [CALCULATE] Today in completedTasks?', completedSet.has(todayStr));
  
  if (!completedSet.has(todayStr)) {
    // Today is not completed, so streak is broken
    console.log('  [CALCULATE] Today NOT completed - streak is 0');
    return 0;
  }
  
  // Count consecutive days backwards from today
  let streak = 1; // Start with 1 since today is completed
  const checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1); // Start checking from yesterday
  
  console.log('  [CALCULATE] Today is completed - starting with streak = 1');
  console.log('  [CALCULATE] Counting backwards from yesterday...');
  
  // Start from yesterday and go backwards
  let iteration = 0;
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    
    if (completedSet.has(dateStr)) {
      streak++;
      console.log(`  [CALCULATE] Day ${iteration + 1} ago (${dateStr}): FOUND - streak now = ${streak}`);
      // Go back one day
      checkDate.setDate(checkDate.getDate() - 1);
      iteration++;
    } else {
      console.log(`  [CALCULATE] Day ${iteration + 1} ago (${dateStr}): NOT FOUND - breaking streak`);
      break;
    }
  }
  
  console.log('  [CALCULATE] Final calculated streak:', streak);
  return streak;
}

// Export functions for use in other routes
module.exports = router;
module.exports.clearStreakConfigCache = clearStreakConfigCache;
module.exports.getStreakConfig = getStreakConfig;
module.exports.getMilestoneReward = getMilestoneReward;

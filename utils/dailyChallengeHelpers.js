/**
 * Daily Challenge Helper Functions
 * Utilities for daily challenge operations
 * @module utils/dailyChallengeHelpers
 */

const ChallengePauseRule = require('../models/ChallengePauseRule');
const User = require('../models/User');

/**
 * Apply pause rules when a user misses a daily challenge
 * @param {Object} user - User document
 * @param {number} daysMissed - Number of days missed
 * @returns {Object} Updated streak data and applied rule
 */
async function applyPauseRules(user, daysMissed = 1) {
  try {
    // Get active pause rules sorted by priority
    const pauseRules = await ChallengePauseRule.find({ isActive: true })
      .sort({ priority: -1 });
    
    if (pauseRules.length === 0) {
      // No pause rules configured, apply default reset
      return {
        action: 'reset_streak',
        newStreak: 0,
        message: 'Streak reset due to missed day'
      };
    }
    
    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    
    // Find applicable rule
    let applicableRule = null;
    for (const rule of pauseRules) {
      if (await isRuleApplicable(rule, user, currentStreak)) {
        applicableRule = rule;
        break;
      }
    }
    
    if (!applicableRule) {
      // No applicable rule found, apply default reset
      return {
        action: 'reset_streak',
        newStreak: 0,
        message: 'Streak reset due to missed day (no applicable pause rule)'
      };
    }
    
    // Apply the rule based on actionOnMiss
    let result = {};
    
    switch (applicableRule.actionOnMiss) {
      case 'pause_streak':
        // Keep the streak, don't increment or decrement
        result = {
          action: 'pause_streak',
          newStreak: currentStreak,
          message: 'Streak paused, no penalty applied',
          ruleApplied: applicableRule.ruleName
        };
        break;
      
      case 'grace_period':
        // Check if within grace days
        const missedDays = streak.missedDays || 0;
        if (missedDays < applicableRule.graceDays) {
          result = {
            action: 'grace_period',
            newStreak: currentStreak,
            graceDaysRemaining: applicableRule.graceDays - missedDays - 1,
            message: `Grace period active (${applicableRule.graceDays - missedDays - 1} days remaining)`,
            ruleApplied: applicableRule.ruleName
          };
          // Track missed days
          streak.missedDays = missedDays + 1;
        } else {
          // Grace period exhausted, reset streak
          result = {
            action: 'grace_expired',
            newStreak: 0,
            message: 'Grace period exhausted, streak reset',
            ruleApplied: applicableRule.ruleName
          };
          streak.missedDays = 0;
        }
        break;
      
      case 'fallback_reward':
        // Reset streak but give fallback reward
        result = {
          action: 'fallback_reward',
          newStreak: 0,
          fallbackReward: applicableRule.fallbackReward,
          message: 'Streak reset with fallback reward',
          ruleApplied: applicableRule.ruleName
        };
        break;
      
      case 'no_action':
        // Do nothing, keep streak as is
        result = {
          action: 'no_action',
          newStreak: currentStreak,
          message: 'No action taken on missed day',
          ruleApplied: applicableRule.ruleName
        };
        break;
      
      case 'reset_streak':
      default:
        // Reset streak to 0
        result = {
          action: 'reset_streak',
          newStreak: 0,
          message: 'Streak reset to zero',
          ruleApplied: applicableRule.ruleName
        };
        break;
    }
    
    return result;
  } catch (error) {
    console.error('Error applying pause rules:', error);
    // On error, default to pause (safest option)
    return {
      action: 'pause_streak',
      newStreak: (user.streak?.current || 0),
      message: 'Streak paused due to error in rule application',
      error: error.message
    };
  }
}

/**
 * Check if a pause rule is applicable to a user
 * @param {Object} rule - Pause rule document
 * @param {Object} user - User document
 * @param {number} currentStreak - Current streak count
 * @returns {boolean} Whether rule is applicable
 */
async function isRuleApplicable(rule, user, currentStreak) {
  const conditions = rule.conditions;
  
  // Check streak range
  if (conditions.minStreak && currentStreak < conditions.minStreak) {
    return false;
  }
  if (conditions.maxStreak && currentStreak > conditions.maxStreak) {
    return false;
  }
  
  // Check user segments
  if (conditions.userSegments && conditions.userSegments.length > 0) {
    if (!conditions.userSegments.includes('all')) {
      // Implement user segment logic
      const userSegment = getUserSegment(user);
      if (!conditions.userSegments.includes(userSegment)) {
        return false;
      }
    }
  }
  
  // Check country
  if (conditions.countries && conditions.countries.length > 0) {
    const userCountry = user.location?.current?.country;
    if (!conditions.countries.includes(userCountry)) {
      return false;
    }
  }
  
  // Check day of week
  if (rule.timing.daysOfWeek && rule.timing.daysOfWeek.length > 0) {
    const today = new Date().getDay();
    if (!rule.timing.daysOfWeek.includes(today)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get user segment based on user data
 * @param {Object} user - User document
 * @returns {string} User segment
 */
function getUserSegment(user) {
  // Simple segment logic - can be enhanced
  const createdAt = new Date(user.createdAt);
  const now = new Date();
  const daysSinceCreation = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
  
  if (daysSinceCreation <= 7) {
    return 'new_users';
  }
  
  if (user.vip?.isActive) {
    return 'vip_users';
  }
  
  const xp = user.xp?.current || 0;
  if (xp > 10000) {
    return 'high_engagement';
  } else if (xp < 1000) {
    return 'low_engagement';
  }
  
  return 'returning_users';
}

/**
 * Calculate streak milestones and rewards
 * @param {number} streakCount - Current streak count
 * @returns {Object} Milestone information
 */
function getStreakMilestones(streakCount) {
  const milestones = [
    { day: 5, coins: 50, xp: 25, badge: 'Week Warrior 🏆' },
    { day: 10, coins: 150, xp: 75, badge: 'Fortnight Fighter 🥇' },
    { day: 20, coins: 300, xp: 150, badge: 'Three Week Titan 🏅' },
    { day: 30, coins: 500, xp: 250, badge: 'Monthly Master 👑' }
  ];
  
  const lastMilestone = milestones
    .filter(m => m.day <= streakCount)
    .sort((a, b) => b.day - a.day)[0] || null;
  
  const nextMilestone = milestones
    .filter(m => m.day > streakCount)
    .sort((a, b) => a.day - b.day)[0] || null;
  
  const currentMilestone = milestones.find(m => m.day === streakCount) || null;
  
  return {
    lastMilestone,
    nextMilestone,
    currentMilestone,
    allMilestones: milestones
  };
}

module.exports = {
  applyPauseRules,
  isRuleApplicable,
  getUserSegment,
  getStreakMilestones
};


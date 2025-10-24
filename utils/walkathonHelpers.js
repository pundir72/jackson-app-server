/**
 * Walkathon Helper Functions
 * Utilities for walkathon operations and calculations
 * @module utils/walkathonHelpers
 */

const mongoose = require('mongoose');

/**
 * Get ISO week key for a given date
 * @param {Date} date - The date to get week key for
 * @returns {string} ISO week key (e.g., "2025-W01")
 */
function getISOWeekKey(date = new Date()) {
  const d = new Date(date);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

/**
 * Get week boundaries (start and end) for a given date
 * @param {Date} date - The date to get week boundaries for
 * @returns {Object} Object with weekStart and weekEnd dates
 */
function getWeekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  
  const weekStart = new Date(d.setUTCDate(diff));
  weekStart.setUTCHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  return { weekStart, weekEnd };
}

/**
 * Get next week key
 * @param {Date} date - Base date (default: current date)
 * @returns {string} Next week's ISO week key
 */
function getNextWeekKey(date = new Date()) {
  const nextWeek = new Date(date);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  return getISOWeekKey(nextWeek);
}

/**
 * Get previous week key
 * @param {Date} date - Base date (default: current date)
 * @returns {string} Previous week's ISO week key
 */
function getPreviousWeekKey(date = new Date()) {
  const prevWeek = new Date(date);
  prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
  return getISOWeekKey(prevWeek);
}

/**
 * Check if a date is within a week range
 * @param {Date} date - Date to check
 * @param {Date} weekStart - Week start date
 * @param {Date} weekEnd - Week end date
 * @returns {boolean} True if date is within week range
 */
function isDateInWeek(date, weekStart, weekEnd) {
  return date >= weekStart && date <= weekEnd;
}

/**
 * Get default reward tiers for walkathon
 * @returns {Array} Array of reward tier objects
 */
function getDefaultRewardTiers() {
  return [
    {
      stepMilestone: 1000,
      xpReward: 10,
      coinReward: 0,
      description: 'First Steps - 1,000 steps'
    },
    {
      stepMilestone: 2500,
      xpReward: 25,
      coinReward: 0,
      description: 'Getting Started - 2,500 steps'
    },
    {
      stepMilestone: 5000,
      xpReward: 50,
      coinReward: 0,
      description: 'Half Way There - 5,000 steps'
    },
    {
      stepMilestone: 7500,
      xpReward: 75,
      coinReward: 0,
      description: 'Almost There - 7,500 steps'
    },
    {
      stepMilestone: 10000,
      xpReward: 100,
      coinReward: 0,
      description: 'Daily Goal - 10,000 steps'
    },
    {
      stepMilestone: 15000,
      xpReward: 150,
      coinReward: 0,
      description: 'Active Day - 15,000 steps'
    },
    {
      stepMilestone: 20000,
      xpReward: 200,
      coinReward: 0,
      description: 'Super Active - 20,000 steps'
    }
  ];
}

/**
 * Get default eligibility criteria
 * @returns {Object} Default eligibility object
 */
function getDefaultEligibility() {
  return {
    countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'NO', 'DK', 'FI'],
    minXPLevel: 0,
    maxXPLevel: 999999,
    ageRestrictions: {
      minAge: 13,
      maxAge: 100
    }
  };
}

/**
 * Calculate progress percentage
 * @param {number} currentSteps - Current step count
 * @param {number} targetSteps - Target step count
 * @returns {number} Progress percentage (0-100)
 */
function calculateProgressPercentage(currentSteps, targetSteps) {
  if (targetSteps <= 0) return 0;
  return Math.min(100, Math.round((currentSteps / targetSteps) * 100));
}

/**
 * Get next milestone for given steps
 * @param {number} currentSteps - Current step count
 * @param {Array} rewardTiers - Array of reward tiers
 * @returns {Object|null} Next milestone tier or null
 */
function getNextMilestone(currentSteps, rewardTiers) {
  const nextTier = rewardTiers
    .filter(tier => currentSteps < tier.stepMilestone)
    .sort((a, b) => a.stepMilestone - b.stepMilestone)[0];
  
  return nextTier || null;
}

/**
 * Get reached milestones for given steps
 * @param {number} currentSteps - Current step count
 * @param {Array} rewardTiers - Array of reward tiers
 * @returns {Array} Array of reached milestone tiers
 */
function getReachedMilestones(currentSteps, rewardTiers) {
  return rewardTiers
    .filter(tier => currentSteps >= tier.stepMilestone)
    .sort((a, b) => a.stepMilestone - b.stepMilestone);
}

/**
 * Validate step data
 * @param {number} steps - Step count to validate
 * @returns {Object} Validation result
 */
function validateSteps(steps) {
  if (typeof steps !== 'number' || isNaN(steps)) {
    return {
      isValid: false,
      error: 'Steps must be a valid number'
    };
  }
  
  if (steps < 0) {
    return {
      isValid: false,
      error: 'Steps cannot be negative'
    };
  }
  
  if (steps > 100000) {
    return {
      isValid: false,
      error: 'Steps count seems unusually high'
    };
  }
  
  return {
    isValid: true,
    error: null
  };
}

/**
 * Format steps for display
 * @param {number} steps - Step count
 * @returns {string} Formatted step count
 */
function formatSteps(steps) {
  if (steps >= 1000000) {
    return `${(steps / 1000000).toFixed(1)}M`;
  } else if (steps >= 1000) {
    return `${(steps / 1000).toFixed(1)}K`;
  }
  return steps.toString();
}

/**
 * Calculate daily average steps
 * @param {Array} dailySteps - Array of daily step objects
 * @returns {number} Average steps per day
 */
function calculateDailyAverage(dailySteps) {
  if (!dailySteps || dailySteps.length === 0) return 0;
  
  const totalSteps = dailySteps.reduce((sum, day) => sum + day.steps, 0);
  return Math.round(totalSteps / dailySteps.length);
}

/**
 * Get step streak (consecutive days with steps > 0)
 * @param {Array} dailySteps - Array of daily step objects
 * @returns {number} Current streak count
 */
function getStepStreak(dailySteps) {
  if (!dailySteps || dailySteps.length === 0) return 0;
  
  // Sort by date descending
  const sortedSteps = dailySteps
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < sortedSteps.length; i++) {
    const stepDate = new Date(sortedSteps[i].date);
    stepDate.setHours(0, 0, 0, 0);
    
    const daysDiff = Math.floor((today - stepDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === i && sortedSteps[i].steps > 0) {
      streak++;
    } else {
      break;
    }
  }
  
  return streak;
}

/**
 * Generate walkathon statistics
 * @param {Array} participants - Array of participant progress objects
 * @returns {Object} Statistics object
 */
function generateWalkathonStats(participants) {
  if (!participants || participants.length === 0) {
    return {
      totalParticipants: 0,
      totalSteps: 0,
      averageSteps: 0,
      topPerformer: null,
      completionRate: 0
    };
  }
  
  const totalSteps = participants.reduce((sum, p) => sum + p.totalStepsCompleted, 0);
  const averageSteps = Math.round(totalSteps / participants.length);
  const topPerformer = participants.reduce((top, current) => 
    current.totalStepsCompleted > top.totalStepsCompleted ? current : top
  );
  const completedParticipants = participants.filter(p => p.status === 'completed').length;
  const completionRate = Math.round((completedParticipants / participants.length) * 100);
  
  return {
    totalParticipants: participants.length,
    totalSteps,
    averageSteps,
    topPerformer: {
      userId: topPerformer.userId,
      steps: topPerformer.totalStepsCompleted,
      name: topPerformer.userId?.firstName || 'Anonymous'
    },
    completionRate
  };
}

/**
 * Check if user can join walkathon
 * @param {Object} user - User object
 * @param {Object} walkathon - Walkathon object
 * @returns {Object} Join eligibility result
 */
function canUserJoinWalkathon(user, walkathon) {
  // Check if walkathon is joinable
  if (!walkathon.isJoinable) {
    return {
      canJoin: false,
      reason: 'Walkathon is not currently accepting new participants'
    };
  }
  
  // Check eligibility
  const eligibility = walkathon.checkEligibility(user);
  if (!eligibility.isEligible) {
    return {
      canJoin: false,
      reason: eligibility.reason
    };
  }
  
  return {
    canJoin: true,
    reason: null
  };
}

/**
 * Calculate XP bonus based on streak
 * @param {number} streak - Current streak count
 * @param {number} baseXP - Base XP reward
 * @returns {number} XP with streak bonus
 */
function calculateStreakBonus(streak, baseXP) {
  if (streak <= 0) return baseXP;
  
  // 10% bonus for every 7 days of streak, max 50% bonus
  const streakWeeks = Math.floor(streak / 7);
  const bonusPercentage = Math.min(0.5, streakWeeks * 0.1);
  
  return Math.round(baseXP * (1 + bonusPercentage));
}

/**
 * Get walkathon time remaining
 * @param {Date} weekEnd - Week end date
 * @returns {Object} Time remaining object
 */
function getTimeRemaining(weekEnd) {
  const now = new Date();
  const timeLeft = weekEnd - now;
  
  if (timeLeft <= 0) {
    return {
      isExpired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0
    };
  }
  
  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
  
  return {
    isExpired: false,
    days,
    hours,
    minutes,
    seconds,
    totalSeconds: Math.floor(timeLeft / 1000)
  };
}

module.exports = {
  getISOWeekKey,
  getWeekBounds,
  getNextWeekKey,
  getPreviousWeekKey,
  isDateInWeek,
  getDefaultRewardTiers,
  getDefaultEligibility,
  calculateProgressPercentage,
  getNextMilestone,
  getReachedMilestones,
  validateSteps,
  formatSteps,
  calculateDailyAverage,
  getStepStreak,
  generateWalkathonStats,
  canUserJoinWalkathon,
  calculateStreakBonus,
  getTimeRemaining
};



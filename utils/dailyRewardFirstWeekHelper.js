/**
 * Daily Reward First Week Helper for ADM-DR-001 Fix
 * 
 * SOLUTION: Fresh Week Start for New Users
 * - First week: User-relative days (Day 1, 2, 3... regardless of calendar)
 * - Subsequent weeks: Calendar-based days (Monday, Tuesday, Wednesday...)
 * 
 * This ensures all new users get a full 7-day reward experience
 */

const DailyRewardProgress = require('../models/DailyRewardProgress');
const { getISOWeekKey, getWeekBoundsUtc } = require('./dailyRewardHelpers');

/**
 * Check if this is the user's first daily reward week
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if this is the user's first week
 */
async function isUserFirstWeek(userId) {
  try {
    // Check if user has any previous daily reward progress
    const existingProgress = await DailyRewardProgress.findOne({ 
      userId: userId 
    }).sort({ createdAt: 1 }); // Get the earliest progress
    
    return !existingProgress; // First week if no previous progress exists
  } catch (error) {
    console.error('Error checking if user first week:', error);
    return false; // Default to false (use calendar week) if error
  }
}

/**
 * Calculate user-relative day number for first week
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {Object} User-relative day information
 */
function calculateUserRelativeDay(userCreatedAt, currentDate = new Date()) {
  // Calculate days since user creation
  const daysSinceCreation = Math.floor(
    (currentDate - userCreatedAt) / (24 * 60 * 60 * 1000)
  );
  
  // User-relative day number (1-7, then cycles)
  const userDayNumber = (daysSinceCreation % 7) + 1;
  
  // Calculate which "user week" this is (1, 2, 3...)
  const userWeekNumber = Math.floor(daysSinceCreation / 7) + 1;
  
  return {
    daysSinceCreation,
    userDayNumber,
    userWeekNumber,
    isFirstWeek: userWeekNumber === 1,
    isWithinFirstWeek: daysSinceCreation < 7
  };
}

/**
 * Initialize first week progress with user-relative days
 * @param {string} userId - User ID
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {Object} First week progress structure
 */
function initFirstWeekProgress(userId, userCreatedAt, currentDate = new Date()) {
  const userRelative = calculateUserRelativeDay(userCreatedAt, currentDate);
  
  // Create 7 days starting from user creation date
  const days = [];
  for (let i = 1; i <= 7; i++) {
    const dayDate = new Date(userCreatedAt);
    dayDate.setUTCDate(dayDate.getUTCDate() + (i - 1));
    
    let status = 'locked'; // Default status
    
    if (i < userRelative.userDayNumber) {
      // Past days that user missed
      status = 'missed';
    } else if (i === userRelative.userDayNumber) {
      // Today (user's current day)
      status = 'claimable';
    }
    // Future days remain 'locked'
    
    days.push({
      dayNumber: i,
      date: dayDate,
      status: status,
      claimedAt: null
    });
  }
  
  // Create week bounds based on user creation (not calendar week)
  const weekStart = new Date(userCreatedAt);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  // Create a special week key for first week (user-based)
  const firstWeekKey = `FIRST-${userId}-${weekStart.toISOString().split('T')[0]}`;
  
  return {
    userId,
    weekKey: firstWeekKey,
    weekStart,
    weekEnd,
    days,
    isFirstWeek: true,
    userCreatedAt,
    userRelativeInfo: userRelative
  };
}

/**
 * Update first week progress based on current date
 * @param {Object} progress - Existing first week progress
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {Object} Updated progress with correct statuses
 */
function updateFirstWeekProgress(progress, userCreatedAt, currentDate = new Date()) {
  const userRelative = calculateUserRelativeDay(userCreatedAt, currentDate);
  
  let changed = false;
  
  progress.days.forEach((day, index) => {
    // Don't change already claimed rewards
    if (day.status === 'claimed') return;
    
    const dayNumber = index + 1;
    let newStatus = day.status;
    
    if (dayNumber < userRelative.userDayNumber) {
      // Past days should be missed
      newStatus = 'missed';
    } else if (dayNumber === userRelative.userDayNumber) {
      // Today should be claimable
      newStatus = 'claimable';
    } else {
      // Future days should be locked
      newStatus = 'locked';
    }
    
    if (newStatus !== day.status) {
      day.status = newStatus;
      changed = true;
    }
  });
  
  // Update user relative info
  progress.userRelativeInfo = userRelative;
  
  return { progress, changed };
}

/**
 * Check if user has completed their first week
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {boolean} True if first week is complete
 */
function isFirstWeekComplete(userCreatedAt, currentDate = new Date()) {
  const daysSinceCreation = Math.floor(
    (currentDate - userCreatedAt) / (24 * 60 * 60 * 1000)
  );
  
  return daysSinceCreation >= 7;
}

/**
 * Get appropriate week key for user (first week or calendar week)
 * @param {string} userId - User ID
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {Promise<string>} Week key to use
 */
async function getUserWeekKey(userId, userCreatedAt, currentDate = new Date()) {
  const isFirst = await isUserFirstWeek(userId);
  
  if (isFirst && !isFirstWeekComplete(userCreatedAt, currentDate)) {
    // Use first week key
    const weekStart = new Date(userCreatedAt);
    weekStart.setUTCHours(0, 0, 0, 0);
    return `FIRST-${userId}-${weekStart.toISOString().split('T')[0]}`;
  } else {
    // Use calendar week key
    return getISOWeekKey(currentDate);
  }
}

/**
 * Create metadata for first week join behavior
 * @param {Date} userCreatedAt - User account creation date
 * @param {Date} currentDate - Current date
 * @returns {Object} First week metadata
 */
function createFirstWeekMetadata(userCreatedAt, currentDate = new Date()) {
  const userRelative = calculateUserRelativeDay(userCreatedAt, currentDate);
  
  return {
    isFirstWeek: userRelative.isFirstWeek,
    isWithinFirstWeek: userRelative.isWithinFirstWeek,
    daysSinceCreation: userRelative.daysSinceCreation,
    currentUserDay: userRelative.userDayNumber,
    userWeekNumber: userRelative.userWeekNumber,
    createdAt: userCreatedAt.toISOString(),
    message: userRelative.isWithinFirstWeek 
      ? `Welcome! This is your Day ${userRelative.userDayNumber} of daily rewards. You get a full 7-day experience starting from your join date.`
      : `You've completed your first week! Daily rewards now follow the calendar week (Monday-Sunday).`,
    explanation: "New users get a personalized 7-day reward cycle starting from their join date, ensuring everyone gets the full daily reward experience."
  };
}

module.exports = {
  isUserFirstWeek,
  calculateUserRelativeDay,
  initFirstWeekProgress,
  updateFirstWeekProgress,
  isFirstWeekComplete,
  getUserWeekKey,
  createFirstWeekMetadata
};
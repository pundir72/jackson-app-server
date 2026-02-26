/**
 * User-Based Week System for Daily Rewards
 * 
 * CONCEPT: Each user has their own 7-day cycle starting from their join date
 * - User joins Wednesday → Week 1 = Wed-Tue, Week 2 = Wed-Tue, etc.
 * - User joins Friday → Week 1 = Fri-Thu, Week 2 = Fri-Thu, etc.
 * 
 * This replaces the calendar-based Monday-Sunday week system.
 */

const DailyRewardProgress = require('../models/DailyRewardProgress');
const User = require('../models/User');

/**
 * Get user's week bounds based on their join date
 * @param {Date|string} userCreatedAt - User account creation date (Date object or ISO string)
 * @param {Date|string} currentDate - Current date (defaults to now)
 * @returns {Object} { weekStart, weekEnd, weekNumber, weekKey }
 */
function getUserWeekBounds(userCreatedAt, currentDate = new Date()) {
  // Ensure we have Date objects (handle both Date and string types)
  const joinDate = new Date(userCreatedAt);
  if (isNaN(joinDate.getTime())) {
    throw new Error('Invalid userCreatedAt date');
  }
  joinDate.setUTCHours(0, 0, 0, 0);
  
  const now = new Date(currentDate);
  if (isNaN(now.getTime())) {
    throw new Error('Invalid currentDate');
  }
  now.setUTCHours(0, 0, 0, 0);
  
  // Calculate days since user joined
  const daysSinceJoin = Math.floor((now - joinDate) / (24 * 60 * 60 * 1000));
  
  // Calculate which week number (1-based)
  const weekNumber = Math.floor(daysSinceJoin / 7) + 1;
  
  // Calculate week start (user's join day of the week)
  const weekStartOffset = (weekNumber - 1) * 7;
  const weekStart = new Date(joinDate);
  weekStart.setUTCDate(weekStart.getUTCDate() + weekStartOffset);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  // Calculate week end (6 days after week start)
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);
  
  // Generate week key (user-specific)
  const weekKey = `USER-W${weekNumber}`;
  
  return {
    weekStart,
    weekEnd,
    weekNumber,
    weekKey,
    daysSinceJoin,
    joinDate
  };
}

/**
 * Get current day number in user's week (1-7)
 * @param {Date|string} userCreatedAt - User account creation date (Date object or ISO string)
 * @param {Date|string} currentDate - Current date (defaults to now)
 * @returns {number} Day number (1-7)
 */
function getUserDayNumber(userCreatedAt, currentDate = new Date()) {
  const { weekStart } = getUserWeekBounds(userCreatedAt, currentDate);
  
  const now = new Date(currentDate);
  if (isNaN(now.getTime())) {
    throw new Error('Invalid currentDate');
  }
  now.setUTCHours(0, 0, 0, 0);
  
  const daysSinceWeekStart = Math.floor((now - weekStart) / (24 * 60 * 60 * 1000));
  
  // Day number is 1-7 (1 = first day of user's week)
  return Math.min(Math.max(daysSinceWeekStart + 1, 1), 7);
}

/**
 * Initialize 7 days for user's week
 * @returns {Array} Array of 7 day objects
 */
function initUserWeekDays() {
  return Array.from({ length: 7 }, (_, i) => ({
    dayNumber: i + 1, // 1-7 (Day 1, Day 2, Day 3...)
    status: 'locked',
    claimedAt: null,
    coins: 0,
    xp: 0
  }));
}

/**
 * Load or create user's weekly progress
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for (defaults to current date)
 * @returns {Object|null} DailyRewardProgress document or null if error
 */
async function loadUserWeekProgress(userId, dateUtc = new Date()) {
  try {
    const now = new Date();
    
    // Get user account creation date
    const user = await User.findById(userId).select('createdAt');
    if (!user) {
      console.log('❌ User not found');
      return null;
    }

    // Ensure createdAt is a valid Date object
    let userCreatedAt = user.createdAt;
    
    if (!userCreatedAt) {
      console.log(`   ⚠️ WARNING: User ${userId} has no createdAt field! Using current date as fallback.`);
      userCreatedAt = new Date();
    } else if (typeof userCreatedAt === 'string') {
      console.log(`   ⚠️ WARNING: User ${userId} createdAt is a string, converting to Date`);
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(`   ❌ ERROR: Invalid date string, using current date as fallback`);
        userCreatedAt = new Date();
      }
    } else if (!(userCreatedAt instanceof Date)) {
      console.log(`   ⚠️ WARNING: User ${userId} createdAt is not a Date object, converting`);
      userCreatedAt = new Date(userCreatedAt);
      if (isNaN(userCreatedAt.getTime())) {
        console.log(`   ❌ ERROR: Cannot convert to Date, using current date as fallback`);
        userCreatedAt = new Date();
      }
    }
    
    console.log(`\n🔍 User-Based Daily Reward Progress for user ${userId}:`);
    console.log(`   User joined: ${userCreatedAt.toISOString()}`);
    console.log(`   Date type: ${typeof userCreatedAt}, Is Date: ${userCreatedAt instanceof Date}`);
    
    // Get user's week bounds
    const { weekStart, weekEnd, weekNumber, weekKey, daysSinceJoin } = getUserWeekBounds(userCreatedAt, dateUtc);
    
    console.log(`   📅 User Week ${weekNumber}:`);
    console.log(`   Week Start: ${weekStart.toISOString()}`);
    console.log(`   Week End: ${weekEnd.toISOString()}`);
    console.log(`   Days since join: ${daysSinceJoin}`);
    
    // Check if requested date is before user joined (compare dates only, not timestamps)
    const requestDate = new Date(dateUtc);
    requestDate.setUTCHours(0, 0, 0, 0);
    
    const joinDate = new Date(userCreatedAt);
    joinDate.setUTCHours(0, 0, 0, 0);
    
    if (requestDate < joinDate) {
      console.log('   ❌ Requested date is before user joined');
      return null;
    }
    
    // Get current day number in user's week
    const todayDayNumber = getUserDayNumber(userCreatedAt, now);
    const requestedDayNumber = getUserDayNumber(userCreatedAt, dateUtc);
    const isCurrentWeek = (weekNumber === getUserWeekBounds(userCreatedAt, now).weekNumber);
    
    console.log(`   📍 Today is Day ${todayDayNumber} of user's week`);
    console.log(`   📍 Viewing: ${isCurrentWeek ? 'Current week' : `Week ${weekNumber}`}`);
    
    // Find or create progress document
    let progress = await DailyRewardProgress.findOne({ userId, weekKey });
    
    if (!progress) {
      // Create new progress document
      progress = await DailyRewardProgress.create({
        userId,
        weekKey,
        weekStart,
        weekEnd,
        days: initUserWeekDays(),
      });
      
      console.log('   ✅ Created new progress document');
      
      // Initialize day statuses
      let changed = false;
      
      progress.days.forEach((d, idx) => {
        const dayNumber = idx + 1; // 1-7
        
        if (isCurrentWeek) {
          // Current week logic
          if (dayNumber < todayDayNumber) {
            // Past days that weren't claimed
            d.status = 'missed';
            changed = true;
          } else if (dayNumber === todayDayNumber) {
            // Today is claimable
            d.status = 'claimable';
            changed = true;
            console.log(`   ✅ Day ${dayNumber} (today) marked as CLAIMABLE`);
          }
          // Future days remain locked
        } else if (weekEnd < now) {
          // Past week: all unclaimed days are missed
          if (d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          }
        }
        // Future weeks: all days remain locked
      });
      
      if (changed) {
        await progress.save();
        console.log('   ✅ Initialized day statuses');
      }
    } else {
      // Progress exists - apply safety net updates
      let changed = false;
      
      progress.days.forEach((d, idx) => {
        if (d.status === 'claimed') return; // Don't change claimed rewards
        
        const dayNumber = idx + 1;
        
        if (isCurrentWeek) {
          // Current week: update based on today
          if (dayNumber < todayDayNumber && d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          } else if (dayNumber === todayDayNumber && d.status === 'locked') {
            d.status = 'claimable';
            changed = true;
          }
        } else if (weekEnd < now) {
          // Past week: all unclaimed days are missed
          if (d.status === 'locked' || d.status === 'claimable') {
            d.status = 'missed';
            changed = true;
          }
        }
      });
      
      if (changed) {
        await progress.save();
        console.log('   ✅ Applied safety net updates');
      }
    }
    
    // Add metadata for frontend
    progress._doc.displayMode = 'USER_RELATIVE'; // Always user-relative
    progress._doc.isUserWeek = true;
    progress._doc.weekNumber = weekNumber;
    progress._doc.daysSinceJoin = daysSinceJoin;
    progress._doc.todayDayNumber = todayDayNumber;
    
    return progress;
    
  } catch (error) {
    console.error('❌ Error in loadUserWeekProgress:', error);
    return null;
  }
}

/**
 * Calculate user's week metadata
 * @param {Date|string} userCreatedAt - User account creation date (Date object or ISO string)
 * @param {Date|string} currentDate - Current date
 * @returns {Object} User week metadata
 */
function getUserWeekMetadata(userCreatedAt, currentDate = new Date()) {
  // Ensure we have Date objects
  const createdAt = new Date(userCreatedAt);
  if (isNaN(createdAt.getTime())) {
    throw new Error('Invalid userCreatedAt date');
  }
  
  const { weekStart, weekEnd, weekNumber, daysSinceJoin, joinDate } = getUserWeekBounds(createdAt, currentDate);
  const todayDayNumber = getUserDayNumber(createdAt, currentDate);
  
  const joinDayName = joinDate.toLocaleDateString('en-US', { weekday: 'long' });
  
  return {
    isUserWeek: true,
    weekNumber,
    daysSinceJoin,
    todayDayNumber,
    weekStart,
    weekEnd,
    joinDate,
    joinDayName,
    displayMode: 'USER_RELATIVE',
    message: `You're in Week ${weekNumber} of your Daily Rewards journey. Your week runs from ${joinDayName} to ${joinDayName} (7 days).`,
    explanation: `Your Daily Rewards cycle is personalized to your join date. Day 1 is always ${joinDayName}, and your week resets every 7 days from that date.`,
    behavior: 'USER_WEEK_SYSTEM'
  };
}

module.exports = {
  getUserWeekBounds,
  getUserDayNumber,
  initUserWeekDays,
  loadUserWeekProgress,
  getUserWeekMetadata
};

/**
 * Fixed Daily Reward Progress Loader for ADM-DR-001
 * 
 * SOLUTION: Fresh Week Start for New Users
 * - First week: User-relative days (ensures all users get 7 rewards)
 * - Subsequent weeks: Calendar-based days (existing behavior)
 */

const DailyRewardProgress = require('../models/DailyRewardProgress');
const User = require('../models/User');
const { getISOWeekKey, getWeekBoundsUtc, initWeekDays } = require('./dailyRewardHelpers');
const {
  isUserFirstWeek,
  calculateUserRelativeDay,
  initFirstWeekProgress,
  updateFirstWeekProgress,
  isFirstWeekComplete,
  getUserWeekKey,
  createFirstWeekMetadata
} = require('./dailyRewardFirstWeekHelper');

/**
 * FIXED: Load or create weekly progress for Daily Rewards
 * 
 * NEW BEHAVIOR (ADM-DR-001 FIX):
 * - FIRST WEEK: User-relative days starting from join date (Day 1, 2, 3...)
 * - SUBSEQUENT WEEKS: Calendar-based days (Monday, Tuesday, Wednesday...)
 * 
 * This ensures all new users get a full 7-day reward experience regardless of when they join
 * 
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for (defaults to current date)
 * @returns {Object|null} DailyRewardProgress document or null if access denied
 */
async function loadProgressFixed(userId, dateUtc = new Date()) {
  try {
    const now = new Date();
    
    // Get user account creation date
    const user = await User.findById(userId).select('createdAt');
    if (!user) {
      return null; // User not found
    }

    const userCreatedAt = user.createdAt || new Date();
    
    // Check if this is the user's first week
    const isFirst = await isUserFirstWeek(userId);
    const firstWeekComplete = isFirstWeekComplete(userCreatedAt, now);
    
    console.log(`🔍 Daily Reward Progress Debug for user ${userId}:`);
    console.log(`   User created: ${userCreatedAt.toISOString()}`);
    console.log(`   Is first week: ${isFirst}`);
    console.log(`   First week complete: ${firstWeekComplete}`);
    
    // FIRST WEEK LOGIC: User-relative days
    if (isFirst && !firstWeekComplete) {
      console.log('   📅 Using FIRST WEEK logic (user-relative days)');
      
      const userRelative = calculateUserRelativeDay(userCreatedAt, now);
      const weekKey = `FIRST-${userId}-${userCreatedAt.toISOString().split('T')[0]}`;
      
      let progress = await DailyRewardProgress.findOne({ userId, weekKey });
      
      if (!progress) {
        // Create new first week progress
        const firstWeekData = initFirstWeekProgress(userId, userCreatedAt, now);
        
        progress = await DailyRewardProgress.create(firstWeekData);
        console.log('   ✅ Created new first week progress');
      } else {
        // Update existing first week progress
        const { progress: updatedProgress, changed } = updateFirstWeekProgress(
          progress, 
          userCreatedAt, 
          now
        );
        
        if (changed) {
          await progress.save();
          console.log('   ✅ Updated first week progress');
        }
      }
      
      // Add first week metadata
      progress.firstWeekMetadata = createFirstWeekMetadata(userCreatedAt, now);
      
      return progress;
    }
    
    // CALENDAR WEEK LOGIC: Standard behavior for subsequent weeks
    console.log('   📅 Using CALENDAR WEEK logic (standard behavior)');
    
    const currentWeekKey = getISOWeekKey(now);
    const requestedWeekKey = getISOWeekKey(dateUtc);
    const isCurrentWeek = requestedWeekKey === currentWeekKey;

    const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
    const weekKey = requestedWeekKey;

    // Check if requested week is before user account creation
    if (weekEnd < userCreatedAt) {
      console.log('   ❌ Requested week is before user creation');
      return null;
    }

    let progress = await DailyRewardProgress.findOne({ userId, weekKey });
    const todayIdx = ((now.getUTCDay() + 6) % 7); // 0..6 Mon..Sun

    if (!progress) {
      // Check if this is a future week (not allowed)
      const requestedDate = new Date(dateUtc);
      if (requestedDate > now) {
        console.log('   ❌ Future week requested');
        return null;
      }

      progress = await DailyRewardProgress.create({
        userId,
        weekKey,
        weekStart,
        weekEnd,
        days: initWeekDays(),
      });

      console.log('   ✅ Created new calendar week progress');

      // Initialize states based on whether it's current week and user creation date
      let changed = false;
      const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);
      let userCreatedDayIdx = -1;
      
      if (weekContainsUserCreation) {
        const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
        userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
      }

      if (isCurrentWeek) {
        progress.days.forEach((d, idx) => {
          if (weekContainsUserCreation && idx < userCreatedDayIdx) {
            d.status = 'missed';
            changed = true;
          } else if (idx < todayIdx && d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          } else if (idx === todayIdx && d.status === 'locked') {
            d.status = 'claimable';
            changed = true;
          }
        });
      } else {
        if (weekContainsUserCreation) {
          progress.days.forEach((d, idx) => {
            if (idx < userCreatedDayIdx && d.status === 'locked') {
              d.status = 'missed';
              changed = true;
            } else if (idx >= userCreatedDayIdx && d.status === 'locked') {
              d.status = 'missed';
              changed = true;
            }
          });
        } else {
          progress.days.forEach((d) => {
            if (d.status === 'locked') {
              d.status = 'missed';
              changed = true;
            }
          });
        }
      }

      if (changed) {
        await progress.save();
        console.log('   ✅ Updated calendar week progress statuses');
      }
    }

    // Safety net for calendar weeks
    let changed = false;
    const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);
    let userCreatedDayIdx = -1;
    
    if (weekContainsUserCreation) {
      const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
    }

    progress.days.forEach((d, idx) => {
      if (d.status === 'claimed') return;

      if (weekContainsUserCreation && idx < userCreatedDayIdx) {
        if (d.status !== 'missed') {
          d.status = 'missed';
          changed = true;
        }
        return;
      }

      if (isCurrentWeek) {
        if (idx < todayIdx) {
          if (d.status === 'locked' || d.status === 'claimable') {
            d.status = 'missed';
            changed = true;
          }
        } else if (idx === todayIdx) {
          if (d.status === 'locked') {
            d.status = 'claimable';
            changed = true;
          }
        }
      } else {
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

    return progress;
    
  } catch (error) {
    console.error('❌ Error in loadProgressFixed:', error);
    return null;
  }
}

/**
 * Calculate comprehensive mid-week join metadata (enhanced for ADM-DR-001)
 * @param {Date} weekStart - Start of the week
 * @param {Date} weekEnd - End of the week  
 * @param {Date} userCreatedAt - User account creation date
 * @param {boolean} isFirstWeek - Whether this is user's first week
 * @returns {Object} Enhanced mid-week join metadata
 */
function calculateMidWeekJoinMetadataFixed(weekStart, weekEnd, userCreatedAt, isFirstWeek = false) {
  if (isFirstWeek) {
    // First week: User gets full experience regardless of join day
    const userRelative = calculateUserRelativeDay(userCreatedAt);
    
    return {
      isFirstWeek: true,
      isMidWeekJoin: false, // Not considered mid-week join in first week
      userCreatedDayIndex: null,
      userCreatedDayNumber: userRelative.userDayNumber,
      daysMissedBeforeJoin: 0, // No days missed in first week
      daysAvailableAfterJoin: 7, // All 7 days available
      message: `Welcome! This is your Day ${userRelative.userDayNumber} of daily rewards. You get a full 7-day experience starting from your join date.`,
      explanation: "New users get a personalized 7-day reward cycle, ensuring everyone gets the full daily reward experience.",
      behavior: "FRESH_WEEK_START"
    };
  }
  
  // Subsequent weeks: Use calendar-based logic
  const weekContainsUserCreation = weekStart <= userCreatedAt && weekEnd >= userCreatedAt;
  
  if (!weekContainsUserCreation) {
    return {
      isFirstWeek: false,
      isMidWeekJoin: false,
      userCreatedDayIndex: null,
      userCreatedDayNumber: null,
      daysMissedBeforeJoin: 0,
      daysAvailableAfterJoin: 7,
      message: "This week follows the standard calendar-based daily reward cycle.",
      explanation: "After your first week, daily rewards follow the calendar week (Monday-Sunday).",
      behavior: "CALENDAR_WEEK"
    };
  }

  const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
  const userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
  const userCreatedDayNumber = userCreatedDayIdx + 1;

  return {
    isFirstWeek: false,
    isMidWeekJoin: userCreatedDayIdx > 0,
    userCreatedDayIndex: userCreatedDayIdx,
    userCreatedDayNumber: userCreatedDayNumber,
    daysMissedBeforeJoin: userCreatedDayIdx,
    daysAvailableAfterJoin: 7 - userCreatedDayIdx,
    message: userCreatedDayIdx > 0 
      ? `You joined on Day ${userCreatedDayNumber} of this calendar week. Days 1-${userCreatedDayIdx} are marked as missed. You can claim rewards from Day ${userCreatedDayNumber} onwards.`
      : "You joined at the start of this calendar week. All days are available.",
    explanation: "After your first week, daily rewards follow the calendar week (Monday-Sunday).",
    behavior: "CALENDAR_WEEK"
  };
}

module.exports = {
  loadProgressFixed,
  calculateMidWeekJoinMetadataFixed
};
const User = require("../models/User");
const DailyRewardProgress = require("../models/DailyRewardProgress");
const {
  getISOWeekKey,
  getWeekBoundsUtc,
  initWeekDays,
} = require("./dailyRewardHelpers");

/**
 * Fixed Daily Reward Progress Loader for ADM-DR-001
 * 
 * CORRECT SOLUTION: User-Relative Days for First Week
 * - FIRST WEEK: User-relative days (Day 1, 2, 3... starting from join date)
 * - SUBSEQUENT WEEKS: Calendar-based days (Monday-Sunday)
 * - MID-WEEK JOIN: Join day becomes "Day 1", user gets full 7-day experience
 * 
 * This ensures new users always get a complete 7-day reward cycle regardless
 * of when they join during the week.
 * 
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for (defaults to current date)
 * @returns {Object|null} DailyRewardProgress document or null if access denied
 */

/**
 * Determine if a given week is the user's first week
 * @param {Date} weekStart - Start of the week
 * @param {Date} weekEnd - End of the week
 * @param {Date} userCreatedAt - User creation date
 * @returns {boolean} True if this is the user's first week
 */
function isUserFirstWeek(weekStart, weekEnd, userCreatedAt) {
  return weekStart <= userCreatedAt && weekEnd >= userCreatedAt;
}

/**
 * Calculate which day index (0-6) the user joined in their first week
 * @param {Date} weekStart - Start of the week (Monday 00:00 UTC)
 * @param {Date} userCreatedAt - User creation date
 * @returns {number} Day index (0-6, where 0 = Monday)
 */
function getUserJoinDayIndex(weekStart, userCreatedAt) {
  const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.min(6, daysDiff));
}

/**
 * Get the current day index (0-6, where 0 = Monday)
 * @param {Date} now - Current date
 * @returns {number} Day index
 */
function getCurrentDayIndex(now) {
  return (now.getUTCDay() + 6) % 7; // Convert Sunday=0 to Monday=0
}

async function loadProgressFixed(userId, dateUtc = new Date()) {
  try {
    const now = new Date();

    // Get user account creation date
    const user = await User.findById(userId).select("createdAt");
    if (!user) {
      console.log('❌ User not found');
      return null;
    }

    const userCreatedAt = user.createdAt || new Date();
    
    console.log(`\n🔍 Daily Reward Progress Debug for user ${userId}:`);
    console.log(`   User created: ${userCreatedAt.toISOString()}`);
    
    const currentWeekKey = getISOWeekKey(now);
    const requestedWeekKey = getISOWeekKey(dateUtc);
    const isCurrentWeek = requestedWeekKey === currentWeekKey;

    const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
    const weekKey = requestedWeekKey;

    // Check if requested week is before user account creation
    if (weekEnd < userCreatedAt) {
      console.log("   ❌ Requested week is before user creation");
      return null;
    }

    // Determine if this is the user's first week
    const isFirstWeek = isUserFirstWeek(weekStart, weekEnd, userCreatedAt);
    const userJoinDayIdx = isFirstWeek ? getUserJoinDayIndex(weekStart, userCreatedAt) : -1;
    const todayIdx = getCurrentDayIndex(now);

    console.log(`   📅 Week Type: ${isFirstWeek ? 'FIRST WEEK (User-Relative Days)' : 'SUBSEQUENT WEEK (Calendar Days)'}`);
    if (isFirstWeek) {
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      console.log(`   � User joined on ${dayNames[userJoinDayIdx]} (calendar day ${userJoinDayIdx + 1})`);
      console.log(`   ✅ Join day becomes "Day 1" - User gets full 7-day experience`);
    }

    let progress = await DailyRewardProgress.findOne({ userId, weekKey });

    if (!progress) {
      // Check if this is a future week (not allowed)
      if (dateUtc > now) {
        console.log('   ❌ Future week requested');
        return null;
      }

      // Create new progress document
      progress = await DailyRewardProgress.create({
        userId,
        weekKey,
        weekStart,
        weekEnd,
        days: initWeekDays(),
      });

      console.log('   ✅ Created new progress document');

      // Initialize day statuses based on week type
      let changed = false;

      if (isFirstWeek) {
        // FIRST WEEK: User-relative days
        // Days before join are HIDDEN (not shown to user)
        // Join day is Day 1 and is claimable
        progress.days.forEach((d, idx) => {
          if (idx < userJoinDayIdx) {
            // Days before join: mark as 'locked' but they won't be shown to user
            d.status = 'locked';
            d.hidden = true; // Flag to hide from UI
            changed = true;
          } else if (isCurrentWeek) {
            // Current week logic
            const relativeDay = idx - userJoinDayIdx; // 0 = Day 1, 1 = Day 2, etc.
            
            if (idx < todayIdx) {
              // Past days (after join) that weren't claimed
              d.status = 'missed';
              changed = true;
            } else if (idx === todayIdx) {
              // Today is claimable
              d.status = 'claimable';
              changed = true;
              console.log(`   ✅ Day ${relativeDay + 1} (today) marked as CLAIMABLE`);
            }
            // Future days remain locked
          } else {
            // Past first week: all days after join that weren't claimed are missed
            if (idx >= userJoinDayIdx) {
              d.status = 'missed';
              changed = true;
            }
          }
        });
      } else {
        // SUBSEQUENT WEEKS: Calendar-based days (Monday-Sunday)
        if (isCurrentWeek) {
          progress.days.forEach((d, idx) => {
            if (idx < todayIdx) {
              d.status = 'missed';
              changed = true;
            } else if (idx === todayIdx) {
              d.status = 'claimable';
              changed = true;
            }
            // Future days remain locked
          });
        } else {
          // Past week: all unclaimed days are missed
          progress.days.forEach((d) => {
            if (d.status === "locked") {
              d.status = "missed";
              changed = true;
            }
          });
        }
      }

      if (changed) {
        await progress.save();
        console.log('   ✅ Initialized day statuses');
      }
    } else {
      // Progress document exists - apply safety net updates
      let changed = false;

      if (isFirstWeek) {
        // FIRST WEEK: Ensure user-relative day logic is applied
        progress.days.forEach((d, idx) => {
          if (d.status === 'claimed') return; // Don't change claimed rewards

          if (idx < userJoinDayIdx) {
            // Days before join should be hidden
            if (!d.hidden) {
              d.hidden = true;
              changed = true;
            }
            if (d.status !== 'locked') {
              d.status = 'locked';
              changed = true;
            }
          } else if (isCurrentWeek) {
            // Current week: update based on today
            if (idx < todayIdx && d.status === 'locked') {
              d.status = 'missed';
              changed = true;
            } else if (idx === todayIdx && d.status === 'locked') {
              d.status = 'claimable';
              changed = true;
            }
          } else {
            // Past first week: all unclaimed days after join are missed
            if (idx >= userJoinDayIdx && (d.status === 'locked' || d.status === 'claimable')) {
              d.status = 'missed';
              changed = true;
            }
          }
        });
      } else {
        // SUBSEQUENT WEEKS: Calendar-based logic
        if (isCurrentWeek) {
          progress.days.forEach((d, idx) => {
            if (d.status === 'claimed') return;

            if (idx < todayIdx && (d.status === 'locked' || d.status === 'claimable')) {
              d.status = 'missed';
              changed = true;
            } else if (idx === todayIdx && d.status === 'locked') {
              d.status = 'claimable';
              changed = true;
            }
          });
        } else {
          // Past week: all unclaimed days are missed
          progress.days.forEach((d) => {
            if (d.status === 'claimed') return;
            if (d.status === 'locked' || d.status === 'claimable') {
              d.status = 'missed';
              changed = true;
            }
          });
        }
      }

      if (changed) {
        await progress.save();
        console.log('   ✅ Applied safety net updates');
      }
    }

    // Add metadata for frontend
    if (isFirstWeek) {
      progress._doc.isFirstWeek = true;
      progress._doc.userJoinDayIndex = userJoinDayIdx;
      progress._doc.displayMode = 'USER_RELATIVE'; // Frontend should show "Day 1, Day 2, Day 3..."
    } else {
      progress._doc.isFirstWeek = false;
      progress._doc.displayMode = 'CALENDAR'; // Frontend should show "Monday, Tuesday, Wednesday..."
    }

    return progress;
  } catch (error) {
    console.error("❌ Error in loadProgressFixed:", error);
    return null;
  }
}

/**
 * Calculate comprehensive mid-week join metadata (ADM-DR-001 FIX)
 * @param {Date} weekStart - Start of the week (Monday 00:00 UTC)
 * @param {Date} weekEnd - End of the week (Sunday 23:59:59 UTC)
 * @param {Date} userCreatedAt - User account creation date
 * @returns {Object} Enhanced mid-week join metadata
 */
function calculateMidWeekJoinMetadataFixed(weekStart, weekEnd, userCreatedAt) {
  const isFirstWeek = isUserFirstWeek(weekStart, weekEnd, userCreatedAt);
  
  if (!isFirstWeek) {
    return {
      isFirstWeek: false,
      isMidWeekJoin: false,
      userCreatedDayIndex: null,
      userCreatedDayNumber: null,
      displayMode: 'CALENDAR',
      message: "This week follows the standard calendar-based daily reward cycle (Monday-Sunday).",
      explanation: "Daily rewards are shown as calendar days: Monday, Tuesday, Wednesday, etc.",
      behavior: "CALENDAR_WEEK"
    };
  }

  // Calculate which calendar day user joined (0-6, Mon-Sun)
  const userJoinDayIdx = getUserJoinDayIndex(weekStart, userCreatedAt);
  const userJoinDayNumber = userJoinDayIdx + 1; // 1-7 (Mon-Sun)
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return {
    isFirstWeek: true,
    isMidWeekJoin: userJoinDayIdx > 0,
    userCreatedDayIndex: userJoinDayIdx,
    userCreatedDayNumber: userJoinDayNumber,
    joinDayName: dayNames[userJoinDayIdx],
    displayMode: 'USER_RELATIVE',
    totalDaysAvailable: 7,
    message: userJoinDayIdx > 0 
      ? `Welcome! You joined on ${dayNames[userJoinDayIdx]}. This is your Day 1! You'll get 7 consecutive days of rewards starting from today.`
      : "Welcome! You joined at the start of the week (Monday). You'll get 7 consecutive days of rewards.",
    explanation: "For your first week, daily rewards are shown as Day 1, Day 2, Day 3, etc., starting from your join date. You get a full 7-day reward experience!",
    behavior: "FIRST_WEEK_USER_RELATIVE"
  };
}

module.exports = {
  loadProgressFixed,
  calculateMidWeekJoinMetadataFixed,
  isUserFirstWeek,
  getUserJoinDayIndex
};

/**
 * Fixed Daily Reward Progress Loader for ADM-DR-001
 * 
 * SOLUTION: Calendar-Based Days with Previous Days Marked as Unclaimed
 * - ALL WEEKS: Calendar-based days (Monday-Sunday)
 * - MID-WEEK JOIN: Days before user creation are marked as "missed" or "unclaimed"
 * - User starts from actual calendar day they joined (not personal Day 1)
 * 
 * This ensures users who join mid-week see previous days as unclaimed/missed
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
    
    console.log(`🔍 Daily Reward Progress Debug for user ${userId}:`);
    console.log(`   User created: ${userCreatedAt.toISOString()}`);
    console.log(`   📅 Using CALENDAR WEEK logic (all weeks use calendar-based days)`);
    
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

    // ADM-DR-001 FIX: Calculate which calendar day user joined (0-6, Mon-Sun)
    const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);
    let userCreatedDayIdx = -1;
    let userCreatedDayNumber = null;
    
    if (weekContainsUserCreation) {
      const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
      userCreatedDayNumber = userCreatedDayIdx + 1; // 1-7 (Mon-Sun)
      console.log(`   📍 User joined on calendar Day ${userCreatedDayNumber} (${userCreatedDayIdx === 0 ? 'Monday' : userCreatedDayIdx === 1 ? 'Tuesday' : userCreatedDayIdx === 2 ? 'Wednesday' : userCreatedDayIdx === 3 ? 'Thursday' : userCreatedDayIdx === 4 ? 'Friday' : userCreatedDayIdx === 5 ? 'Saturday' : 'Sunday'})`);
      console.log(`   ⚠️  Days 1-${userCreatedDayIdx} (before join) will be marked as MISSED/UNCLAIMED`);
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

      // ADM-DR-001 FIX: Initialize states with mid-week join logic
      // Days before user creation are marked as "missed" (unclaimed)
      let changed = false;

      if (isCurrentWeek) {
        // CURRENT WEEK: Handle mid-week join and current day
        progress.days.forEach((d, idx) => {
          // ADM-DR-001 FIX: Days before user creation are marked as MISSED (unclaimed)
          if (weekContainsUserCreation && idx < userCreatedDayIdx) {
            d.status = 'missed'; // Previous days marked as unclaimed
            changed = true;
            console.log(`   ❌ Day ${idx + 1} marked as MISSED (before user join)`);
          } 
          // Days after user creation but before today are missed
          else if (weekContainsUserCreation && idx >= userCreatedDayIdx && idx < todayIdx) {
            d.status = 'missed';
            changed = true;
          }
          // Days before user creation (even if not in creation week) are missed
          else if (!weekContainsUserCreation && idx < todayIdx) {
            d.status = 'missed';
            changed = true;
          }
          // Today is claimable (only if it's on or after user creation day)
          else if (idx === todayIdx) {
            if (weekContainsUserCreation && idx >= userCreatedDayIdx) {
              d.status = 'claimable';
              changed = true;
              console.log(`   ✅ Day ${idx + 1} marked as CLAIMABLE (user's join day or later)`);
            } else if (!weekContainsUserCreation) {
              d.status = 'claimable';
              changed = true;
            }
          }
          // Future days remain locked
        });
      } else {
        // PAST WEEK: All days before user creation are missed, rest are missed too
        if (weekContainsUserCreation) {
          progress.days.forEach((d, idx) => {
            // Days before user creation are missed (unclaimed)
            if (idx < userCreatedDayIdx) {
              d.status = 'missed';
              changed = true;
            } 
            // Days after user creation in past week are also missed
            else if (idx >= userCreatedDayIdx && d.status === 'locked') {
              d.status = 'missed';
              changed = true;
            }
          });
        } else {
          // Entire week is before or after user creation - all days missed
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

    // ADM-DR-001 FIX: Safety net to ensure mid-week join logic is consistently applied
    let changed = false;

    progress.days.forEach((d, idx) => {
      if (d.status === 'claimed') return; // Don't change already claimed rewards

      // ADM-DR-001 FIX: Days before user creation should ALWAYS be marked as MISSED (unclaimed)
      if (weekContainsUserCreation && idx < userCreatedDayIdx) {
        if (d.status !== 'missed') {
          d.status = 'missed';
          changed = true;
          console.log(`   🔒 Day ${idx + 1} forced to MISSED (before user join)`);
        }
        return; // Skip other checks for days before creation
      }

      if (isCurrentWeek) {
        // Current week: Past days (after creation) are missed, today is claimable
        if (weekContainsUserCreation && idx >= userCreatedDayIdx && idx < todayIdx) {
          if (d.status === 'locked' || d.status === 'claimable') {
            d.status = 'missed';
            changed = true;
          }
        } else if (!weekContainsUserCreation && idx < todayIdx) {
          if (d.status === 'locked' || d.status === 'claimable') {
            d.status = 'missed';
            changed = true;
          }
        } else if (idx === todayIdx) {
          // Today is claimable only if it's on or after user creation day
          if (weekContainsUserCreation && idx >= userCreatedDayIdx && d.status === 'locked') {
            d.status = 'claimable';
            changed = true;
          } else if (!weekContainsUserCreation && d.status === 'locked') {
            d.status = 'claimable';
            changed = true;
          }
        }
      } else {
        // Past week: All unclaimed days are missed
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
 * Calculate comprehensive mid-week join metadata (ADM-DR-001 FIX)
 * @param {Date} weekStart - Start of the week (Monday 00:00 UTC)
 * @param {Date} weekEnd - End of the week (Sunday 23:59:59 UTC)
 * @param {Date} userCreatedAt - User account creation date
 * @param {boolean} isFirstWeek - Whether this is user's first week (deprecated, always false now)
 * @returns {Object} Enhanced mid-week join metadata
 */
function calculateMidWeekJoinMetadataFixed(weekStart, weekEnd, userCreatedAt, isFirstWeek = false) {
  // ADM-DR-001 FIX: Always use calendar-based logic (no special first week handling)
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
      explanation: "Daily rewards follow the calendar week (Monday-Sunday). Days before your join date are marked as missed/unclaimed.",
      behavior: "CALENDAR_WEEK"
    };
  }

  // Calculate which calendar day user joined (0-6, Mon-Sun)
  const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
  const userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
  const userCreatedDayNumber = userCreatedDayIdx + 1; // 1-7 (Mon-Sun)

  return {
    isFirstWeek: false,
    isMidWeekJoin: userCreatedDayIdx > 0,
    userCreatedDayIndex: userCreatedDayIdx,
    userCreatedDayNumber: userCreatedDayNumber,
    daysMissedBeforeJoin: userCreatedDayIdx,
    daysAvailableAfterJoin: 7 - userCreatedDayIdx,
    message: userCreatedDayIdx > 0 
      ? `You joined on Day ${userCreatedDayNumber} of this calendar week. Days 1-${userCreatedDayIdx} (before your join) are marked as MISSED/UNCLAIMED. You can claim rewards from Day ${userCreatedDayNumber} onwards.`
      : "You joined at the start of this calendar week (Monday). All days are available.",
    explanation: "Daily rewards follow the calendar week (Monday-Sunday). Days before your join date are marked as missed/unclaimed.",
    behavior: "CALENDAR_WEEK_WITH_MID_WEEK_JOIN"
  };
}

module.exports = {
  loadProgressFixed,
  calculateMidWeekJoinMetadataFixed
};
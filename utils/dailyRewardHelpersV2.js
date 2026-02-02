const getISOWeekKey = (dateUtc = new Date()) => {
  const d = new Date(
    Date.UTC(
      dateUtc.getUTCFullYear(),
      dateUtc.getUTCMonth(),
      dateUtc.getUTCDate()
    )
  );
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${weekNo}`;
};

const getWeekBoundsUtc = (dateUtc = new Date()) => {
  const day = dateUtc.getUTCDay();
  const monday = new Date(
    Date.UTC(
      dateUtc.getUTCFullYear(),
      dateUtc.getUTCMonth(),
      dateUtc.getUTCDate()
    )
  );
  const diffToMonday = (day + 6) % 7; // 0 (Mon) … 6 (Sun)
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
};

const initWeekDays = () =>
  Array.from({ length: 7 }, (_, idx) => ({
    dayNumber: idx + 1,
    status: idx === 0 ? "claimable" : "locked",
    claimedAt: null,
    coins: 0,
    xp: 0,
  }));

// V2 specific helpers

const calculateWeekNumber = (progress, dateUtc = new Date()) => {
  if (!progress || !progress.weekStart) return 1;
  const daysSinceFirstWeek = Math.floor(
    (dateUtc - progress.weekStart) / (24 * 60 * 60 * 1000)
  );
  const weekNumber = Math.floor(daysSinceFirstWeek / 7) + 1;
  return Math.max(1, weekNumber);
};

/**
 * Get the weekly multiplier for a given week number
 * 
 * YEAR TRANSITION BEHAVIOR:
 * This function handles week numbers that continue across year boundaries.
 * For weeks beyond the configured multipliers, it uses the highest configured multiplier as fallback.
 * 
 * Multiplier Resolution:
 * - Week 1: 1.0x (base rewards, no multiplier)
 * - Week 2: Uses week2 multiplier
 * - Week 3: Uses week3 multiplier (or week2 if week3 not set)
 * - Week 4: Uses week4 multiplier (or week3/week2 if not set)
 * - Week 5+: Uses additionalWeeks config if available, otherwise falls back to highest configured multiplier
 * 
 * Year Transition Example:
 * - User in Week 52 (Dec 2024) → Uses configured multiplier for week 52
 * - User in Week 53 (Jan 2025) → Uses highest configured multiplier (no reset to week 1)
 * 
 * @param {Object} config - DailyRewardConfigV2 object
 * @param {number} weekNumber - Current week number (continues across years)
 * @returns {number} Multiplier value (1.0 or higher)
 */
const getWeekMultiplier = (config, weekNumber) => {
  if (!config || !config.weeklyMultiplier || !config.weeklyMultiplier.enabled) {
    return 1.0;
  }

  if (weekNumber === 1) {
    return 1.0; // Week 1 uses base rewards
  }

  const { week2, week3, week4, additionalWeeks } = config.weeklyMultiplier;

  if (weekNumber === 2) {
    return week2 || 1.0;
  } else if (weekNumber === 3) {
    return week3 || week2 || 1.0;
  } else if (weekNumber === 4) {
    return week4 || week3 || week2 || 1.0;
  } else if (weekNumber > 4 && additionalWeeks && additionalWeeks.length > 0) {
    // First, try to find exact match
    const weekConfig = additionalWeeks.find((w) => w.weekNumber === weekNumber);
    if (weekConfig) {
      return weekConfig.multiplier;
    }

    // If no exact match, find the last (highest weekNumber) additional week
    const sortedAdditionalWeeks = additionalWeeks
      .filter((w) => w.weekNumber < weekNumber) // Only weeks before current week
      .sort((a, b) => b.weekNumber - a.weekNumber); // Sort descending

    if (sortedAdditionalWeeks.length > 0) {
      return sortedAdditionalWeeks[0].multiplier; // Return multiplier from highest week number
    }

    // Fallback to week4 if no additional weeks found before current week
    return week4 || week3 || week2 || 1.0;
  }

  // For weeks beyond configured range (including year transitions), use highest configured multiplier
  return week4 || week3 || week2 || 1.0;
};

const applyRoundingRule = (value, roundingRule = "Round Nearest") => {
  if (roundingRule === "Round Down") {
    return Math.floor(value);
  }
  return Math.round(value);
};

const applyMultiplier = (
  baseValue,
  multiplier,
  roundingRule = "Round Nearest"
) => {
  const multiplied = baseValue * multiplier;
  return applyRoundingRule(multiplied, roundingRule);
};

const getUserFirstWeek = async (userId, DailyRewardProgress) => {
  try {
    const firstProgress = await DailyRewardProgress.findOne({ userId })
      .sort({ weekStart: 1 })
      .limit(1);

    return firstProgress ? firstProgress.weekStart : null;
  } catch (error) {
    console.error("Error getting user first week (V2):", error);
    return null;
  }
};

/**
 * Calculate the user's current week number for Daily Rewards
 * 
 * YEAR TRANSITION BEHAVIOR:
 * The weekly multiplier continues indefinitely across year boundaries. Week numbers are calculated
 * based on the number of weeks since the user's first week, NOT based on calendar years.
 * 
 * Example:
 * - User starts on Dec 1, 2024 (Week 1)
 * - Dec 8, 2024 = Week 2
 * - Dec 29, 2024 = Week 5
 * - Jan 1, 2025 = Week 5 (continues from previous year, no reset)
 * - Jan 8, 2025 = Week 6 (continues progression)
 * 
 * IMPORTANT: Week numbers do NOT reset on January 1st. The multiplier progression continues
 * based on the user's first week start date, regardless of calendar year changes.
 * 
 * For weeks beyond the configured multipliers (week2, week3, week4, additionalWeeks):
 * - The system uses the highest configured multiplier as a fallback
 * - This ensures consistent rewards even after many weeks of participation
 * 
 * @param {string} userId - User ID
 * @param {Date} currentDate - Current date to calculate week number for
 * @param {Object} DailyRewardProgress - DailyRewardProgress model
 * @returns {Promise<number>} Week number (1-based, continues indefinitely across years)
 */
const calculateUserWeekNumber = async (
  userId,
  currentDate,
  DailyRewardProgress
) => {
  const firstWeekStart = await getUserFirstWeek(userId, DailyRewardProgress);

  if (!firstWeekStart) {
    return 1;
  }

  // Calculate days since user's first week (continues across year boundaries)
  const daysSinceFirstWeek = Math.floor(
    (currentDate - firstWeekStart) / (24 * 60 * 60 * 1000)
  );
  const weekNumber = Math.floor(daysSinceFirstWeek / 7) + 1;

  return Math.max(1, weekNumber);
};

/**
 * Calculate year transition metadata for weekly multiplier
 * @param {Date} firstWeekStart - User's first week start date
 * @param {Date} currentDate - Current date
 * @param {number} weekNumber - Current week number
 * @returns {Object} Year transition metadata
 */
const calculateYearTransitionMetadata = (firstWeekStart, currentDate, weekNumber) => {
  if (!firstWeekStart) {
    return {
      hasYearTransition: false,
      firstWeekYear: null,
      currentYear: currentDate.getUTCFullYear(),
      yearsSinceFirstWeek: 0,
      message: "Week number calculation starts from user's first week. Multipliers continue across year boundaries without reset.",
    };
  }

  const firstWeekYear = firstWeekStart.getUTCFullYear();
  const currentYear = currentDate.getUTCFullYear();
  const yearsSinceFirstWeek = currentYear - firstWeekYear;
  const hasYearTransition = yearsSinceFirstWeek > 0;

  return {
    hasYearTransition,
    firstWeekYear,
    currentYear,
    yearsSinceFirstWeek,
    firstWeekStart: firstWeekStart.toISOString(),
    weekNumber,
    message: hasYearTransition
      ? `Weekly multiplier continues across year boundaries. You're in Week ${weekNumber} (started in ${firstWeekYear}, currently in ${currentYear}). Multiplier progression does NOT reset on January 1st.`
      : `You're in Week ${weekNumber}. Weekly multiplier progression continues indefinitely and does not reset on year boundaries.`,
  };
};

module.exports = {
  getISOWeekKey,
  getWeekBoundsUtc,
  initWeekDays,
  calculateWeekNumber,
  getWeekMultiplier,
  applyRoundingRule,
  applyMultiplier,
  getUserFirstWeek,
  calculateUserWeekNumber,
  calculateYearTransitionMetadata,
};

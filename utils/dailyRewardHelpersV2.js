const getISOWeekKey = (dateUtc = new Date()) => {
  const d = new Date(Date.UTC(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth(), dateUtc.getUTCDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${weekNo}`;
};

const getWeekBoundsUtc = (dateUtc = new Date()) => {
  const day = dateUtc.getUTCDay();
  const monday = new Date(Date.UTC(dateUtc.getUTCFullYear(), dateUtc.getUTCMonth(), dateUtc.getUTCDate()));
  const diffToMonday = (day + 6) % 7; // 0 (Mon) … 6 (Sun)
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return { weekStart: monday, weekEnd: sunday };
};

const initWeekDays = () => Array.from({ length: 7 }, (_, idx) => ({
  dayNumber: idx + 1,
  status: idx === 0 ? 'claimable' : 'locked',
  claimedAt: null,
  coins: 0,
  xp: 0
}));

// V2 specific helpers

const calculateWeekNumber = (progress, dateUtc = new Date()) => {
  if (!progress || !progress.weekStart) return 1;
  const daysSinceFirstWeek = Math.floor((dateUtc - progress.weekStart) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(daysSinceFirstWeek / 7) + 1;
  return Math.max(1, weekNumber);
};

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
    const weekConfig = additionalWeeks.find(w => w.weekNumber === weekNumber);
    if (weekConfig) {
      return weekConfig.multiplier;
    }
    return week4 || week3 || week2 || 1.0;
  }
  
  return week4 || week3 || week2 || 1.0;
};

const applyRoundingRule = (value, roundingRule = 'Round Nearest') => {
  if (roundingRule === 'Round Down') {
    return Math.floor(value);
  }
  return Math.round(value);
};

const applyMultiplier = (baseValue, multiplier, roundingRule = 'Round Nearest') => {
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
    console.error('Error getting user first week (V2):', error);
    return null;
  }
};

const calculateUserWeekNumber = async (userId, currentDate, DailyRewardProgress) => {
  const firstWeekStart = await getUserFirstWeek(userId, DailyRewardProgress);
  
  if (!firstWeekStart) {
    return 1;
  }
  
  const daysSinceFirstWeek = Math.floor((currentDate - firstWeekStart) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.floor(daysSinceFirstWeek / 7) + 1;
  
  return Math.max(1, weekNumber);
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
  calculateUserWeekNumber
};



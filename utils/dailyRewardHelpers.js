const getISOWeekKey = (dateUtc = new Date()) => {
  // Ensure we're working with UTC dates
  const d = new Date(
    Date.UTC(
      dateUtc.getUTCFullYear(),
      dateUtc.getUTCMonth(),
      dateUtc.getUTCDate()
    )
  );

  // ISO 8601 week calculation algorithm
  // Get the date's day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
  const dayOfWeek = d.getUTCDay();

  // Convert to ISO day of week (1=Monday, 2=Tuesday, ..., 7=Sunday)
  const isoDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Find the Thursday of the current week (ISO weeks start on Monday)
  // Thursday is day 4 in ISO week
  const daysToThursday = 4 - isoDayOfWeek;
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + daysToThursday);

  // Get the year of the Thursday (this determines the ISO week year)
  const year = thursday.getUTCFullYear();

  // Calculate week number: find January 1st of the year, then find its Thursday
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const jan1Day = jan1.getUTCDay();
  const jan1IsoDay = jan1Day === 0 ? 7 : jan1Day;
  const daysToJan1Thursday = 4 - jan1IsoDay;
  const jan1Thursday = new Date(jan1);
  jan1Thursday.setUTCDate(jan1.getUTCDate() + daysToJan1Thursday);

  // If January 1st is Friday, Saturday, or Sunday, the Thursday is in the previous year
  // In that case, we need to use the previous year's week calculation
  if (jan1IsoDay > 4) {
    // January 1st is Fri/Sat/Sun, so week 1 starts the following Monday
    // Calculate from the previous year's last week
    const prevYear = year - 1;
    const prevJan1 = new Date(Date.UTC(prevYear, 0, 1));
    const prevJan1Day = prevJan1.getUTCDay();
    const prevJan1IsoDay = prevJan1Day === 0 ? 7 : prevJan1Day;
    const daysToPrevJan1Thursday = 4 - prevJan1IsoDay;
    const prevJan1Thursday = new Date(prevJan1);
    prevJan1Thursday.setUTCDate(prevJan1.getUTCDate() + daysToPrevJan1Thursday);

    const msDiff = thursday - prevJan1Thursday;
    const weekNo = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;
    return `${prevYear}-W${weekNo.toString().padStart(2, "0")}`;
  }

  // Calculate week number from January 1st Thursday
  const msDiff = thursday - jan1Thursday;
  const weekNo = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000)) + 1;

  return `${year}-W${weekNo.toString().padStart(2, "0")}`;
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

module.exports = {
  getISOWeekKey,
  getWeekBoundsUtc,
  initWeekDays,
};

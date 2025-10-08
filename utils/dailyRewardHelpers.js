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

module.exports = {
  getISOWeekKey,
  getWeekBoundsUtc,
  initWeekDays
};


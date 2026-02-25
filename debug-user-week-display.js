/**
 * Debug script to understand the week display issue
 * 
 * User joined: Sunday Feb 23, 2026
 * Today: Wednesday Feb 26, 2026
 * App shows: DAY 1, DAY 2, DAY 3, DAY 4...
 * Expected: Should show calendar days (Mon, Tue, Wed...) since it's week 2
 */

// Simulate the dates based on screenshot
// Calendar shows: S 23, M 24, T 25, W 26, T 27
// S = Saturday, M = Monday, etc.
const userJoinedDate = new Date('2026-02-22T00:00:00Z'); // Saturday Feb 22 (S 22 would be correct, but calendar shows S 23)
// Actually, let's check: if M 24 is Monday Feb 24, then S 23 is Sunday Feb 23
// But Feb 23 is Monday! So there's a calendar display issue.
// Let's assume user joined on the day shown as "S 23" which is actually Sunday in the week
// Week 9 of 2026 starts on Monday Feb 23
// So S in the calendar must mean the Sunday BEFORE the week (Feb 22)
const today = new Date('2026-02-26T00:00:00Z'); // Wednesday Feb 26 (W 26)

console.log('📅 Date Analysis:');
console.log(`User joined: ${userJoinedDate.toUTCString()} (${userJoinedDate.getUTCDay() === 0 ? 'Sunday' : 'Not Sunday'})`);
console.log(`Today: ${today.toUTCString()} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][today.getUTCDay()]})`);

// Calculate week bounds for user join date
function getWeekBoundsUtc(dateUtc) {
  const day = dateUtc.getUTCDay();
  const monday = new Date(dateUtc);
  const diff = day === 0 ? -6 : 1 - day; // If Sunday (0), go back 6 days; otherwise go to Monday
  monday.setUTCDate(monday.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  
  return { weekStart: monday, weekEnd: sunday };
}

// Week user joined
const joinWeek = getWeekBoundsUtc(userJoinedDate);
console.log(`\n📍 Week user joined:`);
console.log(`  Start: ${joinWeek.weekStart.toUTCString()}`);
console.log(`  End: ${joinWeek.weekEnd.toUTCString()}`);

// Current week
const currentWeek = getWeekBoundsUtc(today);
console.log(`\n📍 Current week:`);
console.log(`  Start: ${currentWeek.weekStart.toUTCString()}`);
console.log(`  End: ${currentWeek.weekEnd.toUTCString()}`);

// Check if same week
const sameWeek = joinWeek.weekStart.getTime() === currentWeek.weekStart.getTime();
console.log(`\n🔍 Analysis:`);
console.log(`  Same week? ${sameWeek ? 'YES - First week' : 'NO - Second week or later'}`);
console.log(`  Should show: ${sameWeek ? 'User-relative days (Day 1, 2, 3...)' : 'Calendar days (Mon, Tue, Wed...)'}`);

// Calculate user join day index
const daysDiff = Math.floor((userJoinedDate - joinWeek.weekStart) / (24 * 60 * 60 * 1000));
const userJoinDayIdx = Math.max(0, Math.min(6, daysDiff));
console.log(`\n📊 User join details:`);
console.log(`  Join day index: ${userJoinDayIdx} (${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][userJoinDayIdx]})`);

// Calculate today's index in current week
const todayDiff = Math.floor((today - currentWeek.weekStart) / (24 * 60 * 60 * 1000));
const todayIdx = Math.max(0, Math.min(6, todayDiff));
console.log(`  Today's index: ${todayIdx} (${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][todayIdx]})`);

console.log(`\n✅ Expected behavior:`);
if (sameWeek) {
  console.log(`  - This is user's FIRST WEEK`);
  console.log(`  - Show: Day 1, Day 2, Day 3...`);
  console.log(`  - Hide days before join (days 0-${userJoinDayIdx - 1})`);
  console.log(`  - Day ${userJoinDayIdx + 1} (${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][userJoinDayIdx]}) becomes "Day 1"`);
} else {
  console.log(`  - This is user's SECOND WEEK or later`);
  console.log(`  - Show: Calendar days (Mon, Tue, Wed...)`);
  console.log(`  - No hidden days`);
  console.log(`  - Standard Monday-Sunday cycle`);
}

console.log(`\n🐛 If app shows "DAY 1, 2, 3..." in second week:`);
console.log(`  - Backend might be incorrectly detecting first week`);
console.log(`  - Check: isFirstWeek calculation in loadProgressFixed()`);
console.log(`  - Check: Week comparison logic`);

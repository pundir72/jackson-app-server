/**
 * Set Daily Reward Progress for Testing
 *
 * This script sets a user's DailyRewardProgress so you can test
 * any day's reward (e.g. Day 7 big reward) without waiting.
 *
 * Usage:
 *   node set-user-streak.js user@example.com <day>
 *
 * Examples:
 *   node set-user-streak.js twotester@gmail.com 7
 *     → Days 1-6 become CLAIMED, Day 7 becomes CLAIMABLE (big reward unlocked)
 *
 *   node set-user-streak.js twotester@gmail.com 3
 *     → Days 1-2 become CLAIMED, Day 3 becomes CLAIMABLE
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');
const { getUserWeekBounds, getUserDayNumber } = require('./utils/dailyRewardUserWeekHelper');

async function setDailyRewardDay(email, targetDay) {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('Set Daily Reward Progress for Testing');
    console.log('='.repeat(70));

    console.log('\nConnecting to database...');
    await mongoose.connect("mongodb://jacksonuat:HJKHYUHBE67HDNB@82.25.105.119:27017/jackson-uat?authSource=admin");
    console.log('Connected\n');

    // Find user
    const user = await User.findOne({ email: new RegExp(`^${email.trim()}$`, 'i') }).select('email firstName lastName createdAt');
    if (!user) {
      console.log(`ERROR: User not found: ${email}`);
      return;
    }

    const now = new Date();
    const { weekKey, weekStart, weekEnd, weekNumber } = getUserWeekBounds(user.createdAt, now);
    const todayDayNumber = getUserDayNumber(user.createdAt, now);

    console.log(`User:       ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`User ID:    ${user._id}`);
    console.log(`Joined:     ${user.createdAt.toISOString().split('T')[0]}`);
    console.log(`Week:       ${weekKey} (Week ${weekNumber})`);
    console.log(`Week Start: ${weekStart.toISOString().split('T')[0]}`);
    console.log(`Week End:   ${weekEnd.toISOString().split('T')[0]}`);
    console.log(`Today is:   Day ${todayDayNumber} of this week`);
    console.log(`Target:     Set up to Day ${targetDay}`);
    console.log('');

    if (targetDay > 7 || targetDay < 1) {
      console.log('ERROR: Day must be between 1 and 7');
      return;
    }

    // Find existing progress for current week
    let progress = await DailyRewardProgress.findOne({ userId: user._id, weekKey });

    if (!progress) {
      console.log(`No DailyRewardProgress found for ${weekKey} — creating one...`);
      progress = await DailyRewardProgress.create({
        userId: user._id,
        weekKey,
        weekStart,
        weekEnd,
        days: Array.from({ length: 7 }, (_, i) => ({
          dayNumber: i + 1,
          status: 'locked',
          claimedAt: null,
          coins: 0,
          xp: 0
        }))
      });
      console.log('Created new DailyRewardProgress document');
    } else {
      console.log(`Found existing DailyRewardProgress for ${weekKey}`);
    }

    console.log('\nBefore:');
    progress.days.forEach(d => console.log(`   Day ${d.dayNumber}: ${d.status}`));

    // Update day statuses:
    // - Days 1 to (targetDay-1) → claimed
    // - Day targetDay → claimable
    // - Days after targetDay → locked
    const claimedAt = new Date(now);
    claimedAt.setDate(claimedAt.getDate() - (targetDay - 1)); // simulate past claims

    progress.days.forEach((d, idx) => {
      const dayNum = idx + 1;
      if (dayNum < targetDay) {
        d.status = 'claimed';
        d.claimedAt = new Date(claimedAt);
        claimedAt.setDate(claimedAt.getDate() + 1);
      } else if (dayNum === targetDay) {
        d.status = 'claimable';
        d.claimedAt = null;
      } else {
        d.status = 'locked';
        d.claimedAt = null;
      }
    });

    // Set bigRewardEligible if targeting day 7
    if (targetDay === 7) {
      progress.bigRewardEligible = true;
      progress.bigRewardGranted = false;
    }

    progress.lastUpdated = now;
    await progress.save();

    console.log('\nAfter:');
    progress.days.forEach(d => console.log(`   Day ${d.dayNumber}: ${d.status}`));

    console.log('\n' + '='.repeat(70));
    console.log('READY TO TEST!');
    console.log('='.repeat(70));

    if (targetDay === 7) {
      console.log(`\n   Days 1-6 are CLAIMED. Day 7 is CLAIMABLE.`);
      console.log(`   Open the app → Day 7 Big Reward is now unlocked and claimable!`);
    } else {
      console.log(`\n   Days 1-${targetDay - 1} are CLAIMED. Day ${targetDay} is CLAIMABLE.`);
      console.log(`   Open the app → Day ${targetDay} reward is now claimable!`);
    }

    console.log(`\n   User:    ${user.email}`);
    console.log(`   Week:    ${weekKey}`);
    console.log('');

  } catch (error) {
    console.error('\nError:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed\n');
  }
}

// Parse args
const email = process.argv[2];
const day = parseInt(process.argv[3], 10);

if (!email || isNaN(day) || day < 1 || day > 7) {
  console.log('');
  console.log('Usage:');
  console.log('   node set-user-streak.js <email> <day>\n');
  console.log('Examples:');
  console.log('   node set-user-streak.js twotester@gmail.com 7   → unlock Day 7 Big Reward');
  console.log('   node set-user-streak.js twotester@gmail.com 3   → unlock Day 3 reward');
  console.log('');
  process.exit(1);
}

setDailyRewardDay(email, day).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

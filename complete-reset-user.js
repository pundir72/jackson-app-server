/**
 * Complete Reset User
 * 1. Set createdAt to TODAY at midnight
 * 2. Delete all progress records
 * 3. Verify
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');

const userId = '6999e14f61f52e395e1531a4';

async function completeReset() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔄 COMPLETE RESET');
    console.log('='.repeat(70));

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 BEFORE:');
    console.log('   Email:', user.email);
    console.log('   createdAt:', user.createdAt);

    // Set createdAt to TODAY at midnight UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // Update directly in DB to bypass validation
    await User.updateOne(
      { _id: userId },
      { $set: { createdAt: today } }
    );

    console.log('\n✅ UPDATED:');
    console.log('   New createdAt:', user.createdAt);
    console.log('   ISO:', user.createdAt.toISOString());

    // Delete ALL progress records
    console.log('\n🗑️  DELETING PROGRESS:');
    const deleted = await DailyRewardProgress.deleteMany({ userId });
    console.log('   Deleted', deleted.deletedCount, 'records');

    // Verify
    const verify = await User.findById(userId);
    console.log('\n✅ VERIFIED:');
    console.log('   createdAt:', verify.createdAt);
    console.log('   Type:', typeof verify.createdAt);
    console.log('   Is Date:', verify.createdAt instanceof Date);

    const remaining = await DailyRewardProgress.countDocuments({ userId });
    console.log('   Remaining progress:', remaining);

    console.log('\n' + '='.repeat(70));
    console.log('✅ RESET COMPLETE!');
    console.log('\nNext steps:');
    console.log('1. Restart server: pm2 restart all');
    console.log('2. Clear app data or logout/login');
    console.log('3. Open Daily Rewards');
    console.log('\nExpected result:');
    console.log('- Week: USER-W1');
    console.log('- Day 1: CLAIMABLE (today)');
    console.log('- Day 2-7: LOCKED');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

completeReset();

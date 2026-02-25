/**
 * Clear User Progress and Force Refresh
 * Run this after changing user's createdAt date
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');

const userId = '6999e14f61f52e395e1531a4'; // manu@gmail.com

async function clearAndRefresh() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔄 Clearing User Progress and Forcing Refresh');
    console.log('='.repeat(70));

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 USER INFO:');
    console.log('   Email:', user.email);
    console.log('   Current createdAt:', user.createdAt);
    console.log('   Type:', typeof user.createdAt);
    console.log('   Is Date:', user.createdAt instanceof Date);

    // Delete ALL old progress records
    console.log('\n🗑️  DELETING OLD PROGRESS:');
    const deleted = await DailyRewardProgress.deleteMany({ userId });
    console.log('   Deleted', deleted.deletedCount, 'progress records');

    console.log('\n✅ DONE!');
    console.log('\nNext steps:');
    console.log('1. Restart your server (to clear any cache)');
    console.log('2. Clear app data or logout/login');
    console.log('3. Open Daily Rewards - should show fresh data');

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

clearAndRefresh();

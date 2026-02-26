/**
 * Debug User Date Issue
 * Check if user's createdAt is properly saved as Date type
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');

const userId = '6999e14f61f52e395e1531a4'; // manu@gmail.com

async function debugUserDate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Debugging User Date Issue');
    console.log('='.repeat(70));

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 USER INFO:');
    console.log('   Email:', user.email);
    console.log('   User ID:', user._id);

    console.log('\n📅 CREATED AT FIELD:');
    console.log('   Value:', user.createdAt);
    console.log('   Type:', typeof user.createdAt);
    console.log('   Is Date object:', user.createdAt instanceof Date);
    console.log('   ISO String:', user.createdAt ? user.createdAt.toISOString() : 'N/A');

    // Check if it's a valid date
    if (user.createdAt instanceof Date) {
      const isValid = !isNaN(user.createdAt.getTime());
      console.log('   Is Valid Date:', isValid ? '✅ YES' : '❌ NO');
      
      if (isValid) {
        console.log('   Date (UTC):', user.createdAt.toUTCString());
        console.log('   Date (Local):', user.createdAt.toLocaleString());
        
        // Calculate days since join
        const now = new Date();
        const daysSinceJoin = Math.floor((now - user.createdAt) / (24 * 60 * 60 * 1000));
        console.log('   Days since join:', daysSinceJoin);
        
        // Calculate week number
        const weekNumber = Math.floor(daysSinceJoin / 7) + 1;
        console.log('   Current week:', weekNumber);
      }
    } else {
      console.log('   ⚠️  WARNING: createdAt is not a Date object!');
      console.log('   Actual type:', Object.prototype.toString.call(user.createdAt));
    }

    // Check daily reward progress
    console.log('\n📊 DAILY REWARD PROGRESS:');
    const progress = await DailyRewardProgress.find({ userId })
      .sort({ weekStart: -1 })
      .limit(3);

    console.log('   Total progress records:', progress.length);
    
    if (progress.length > 0) {
      console.log('\n   Recent weeks:');
      progress.forEach((p, idx) => {
        console.log(`\n   ${idx + 1}. ${p.weekKey}`);
        console.log('      Week Start:', p.weekStart.toISOString());
        console.log('      Week End:', p.weekEnd.toISOString());
        console.log('      Days claimed:', p.days.filter(d => d.status === 'claimed').length);
      });
    }

    // Test date conversion
    console.log('\n🧪 TEST: Date Conversion');
    const testDate = new Date();
    console.log('   Current date:', testDate.toISOString());
    console.log('   Type:', typeof testDate);
    console.log('   Is Date:', testDate instanceof Date);

    // Check if we need to fix the date
    if (!(user.createdAt instanceof Date) || isNaN(user.createdAt.getTime())) {
      console.log('\n⚠️  USER DATE NEEDS FIXING!');
      console.log('   Current value:', user.createdAt);
      console.log('   Suggested fix: Set to today\'s date');
      
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      
      console.log('\n   Would set to:', today.toISOString());
      console.log('   Run fix-user-created-at.js to apply fix');
    } else {
      console.log('\n✅ USER DATE IS CORRECT');
    }

    // Check raw document from MongoDB
    console.log('\n🔍 RAW MONGODB DOCUMENT:');
    const rawUser = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
    console.log('   createdAt (raw):', rawUser.createdAt);
    console.log('   createdAt type:', typeof rawUser.createdAt);
    console.log('   createdAt constructor:', rawUser.createdAt?.constructor?.name);

    console.log('\n' + '='.repeat(70));
    console.log('✅ DEBUG COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

debugUserDate();

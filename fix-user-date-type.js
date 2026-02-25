/**
 * Fix User Date Type
 * Convert createdAt from string to Date if needed
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');

const userId = '6999e14f61f52e395e1531a4'; // manu@gmail.com

async function fixUserDateType() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔧 Fixing User Date Type');
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

    console.log('\n📅 CURRENT CREATED AT:');
    console.log('   Value:', user.createdAt);
    console.log('   Type:', typeof user.createdAt);
    console.log('   Is Date:', user.createdAt instanceof Date);

    // Check if it needs fixing
    if (user.createdAt instanceof Date && !isNaN(user.createdAt.getTime())) {
      console.log('\n✅ Date is already correct!');
      console.log('   ISO String:', user.createdAt.toISOString());
      console.log('   UTC String:', user.createdAt.toUTCString());
      
      // Calculate current week
      const now = new Date();
      const daysSinceJoin = Math.floor((now - user.createdAt) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.floor(daysSinceJoin / 7) + 1;
      
      console.log('\n📊 CALCULATED VALUES:');
      console.log('   Days since join:', daysSinceJoin);
      console.log('   Current week:', weekNumber);
      
      return;
    }

    console.log('\n⚠️  Date needs fixing!');

    // Try to convert existing value
    let newDate;
    
    if (typeof user.createdAt === 'string') {
      console.log('   Attempting to parse string:', user.createdAt);
      newDate = new Date(user.createdAt);
      
      if (isNaN(newDate.getTime())) {
        console.log('   ❌ String is not a valid date, using today');
        newDate = new Date();
        newDate.setUTCHours(0, 0, 0, 0);
      } else {
        console.log('   ✅ Successfully parsed string to date');
      }
    } else {
      console.log('   Using today\'s date');
      newDate = new Date();
      newDate.setUTCHours(0, 0, 0, 0);
    }

    console.log('\n🔄 APPLYING FIX:');
    console.log('   Old value:', user.createdAt);
    console.log('   New value:', newDate.toISOString());

    // Update user
    user.createdAt = newDate;
    await user.save();

    console.log('   ✅ User updated!');

    // Verify the fix
    const verifyUser = await User.findById(userId);
    console.log('\n✅ VERIFICATION:');
    console.log('   createdAt:', verifyUser.createdAt);
    console.log('   Type:', typeof verifyUser.createdAt);
    console.log('   Is Date:', verifyUser.createdAt instanceof Date);
    console.log('   Is Valid:', !isNaN(verifyUser.createdAt.getTime()));

    if (verifyUser.createdAt instanceof Date && !isNaN(verifyUser.createdAt.getTime())) {
      console.log('   ✅ Fix successful!');
      
      // Calculate values
      const now = new Date();
      const daysSinceJoin = Math.floor((now - verifyUser.createdAt) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.floor(daysSinceJoin / 7) + 1;
      
      console.log('\n📊 CALCULATED VALUES:');
      console.log('   Days since join:', daysSinceJoin);
      console.log('   Current week:', weekNumber);
      
      // Clear old progress if date changed significantly
      console.log('\n🗑️  CLEARING OLD PROGRESS:');
      const deleted = await DailyRewardProgress.deleteMany({ userId });
      console.log('   Deleted', deleted.deletedCount, 'progress records');
      console.log('   ✅ User can start fresh with correct date');
      
    } else {
      console.log('   ❌ Fix failed!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ FIX COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

fixUserDateType();

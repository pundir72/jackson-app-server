/**
 * RESET EVERYTHING - Complete Fresh Start
 * 1. Set user createdAt to TODAY at midnight
 * 2. Delete ALL daily reward progress
 * 3. Delete ALL transactions related to daily rewards
 * 4. Reset user XP and wallet (optional)
 * 5. Verify everything
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');
const Transaction = require('./models/Transaction');

const userId = '6999e14f61f52e395e1531a4'; // From token

async function resetEverything() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔄 RESET EVERYTHING - COMPLETE FRESH START');
    console.log('='.repeat(70));

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 USER BEFORE:');
    console.log('   Email:', user.email);
    console.log('   createdAt:', user.createdAt);
    console.log('   Wallet Balance:', user.wallet?.balance || 0);
    console.log('   Current XP:', user.xp?.current || 0);

    // 1. Set createdAt to TODAY at midnight UTC
    console.log('\n📅 STEP 1: Setting createdAt to TODAY at midnight...');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    await User.updateOne(
      { _id: userId },
      { $set: { createdAt: today } }
    );
    console.log('   ✅ createdAt set to:', today.toISOString());

    // 2. Delete ALL daily reward progress
    console.log('\n🗑️  STEP 2: Deleting ALL daily reward progress...');
    const deletedProgress = await DailyRewardProgress.deleteMany({ userId });
    console.log('   ✅ Deleted', deletedProgress.deletedCount, 'progress records');

    // 3. Delete ALL daily reward transactions
    console.log('\n🗑️  STEP 3: Deleting ALL daily reward transactions...');
    const deletedTx = await Transaction.deleteMany({
      user: userId,
      description: { $regex: /Daily Reward/i }
    });
    console.log('   ✅ Deleted', deletedTx.deletedCount, 'transactions');

    // 4. Reset wallet and XP (OPTIONAL - uncomment if needed)
    console.log('\n💰 STEP 4: Resetting wallet and XP...');
    await User.updateOne(
      { _id: userId },
      { 
        $set: { 
          'wallet.balance': 0,
          'wallet.lastUpdated': new Date(),
          'xp.current': 0,
          'xp.total': 0
        } 
      }
    );
    console.log('   ✅ Wallet and XP reset to 0');

    // 5. Verify
    console.log('\n✅ STEP 5: Verifying...');
    const verifyUser = await User.findById(userId);
    const remainingProgress = await DailyRewardProgress.countDocuments({ userId });
    const remainingTx = await Transaction.countDocuments({
      user: userId,
      description: { $regex: /Daily Reward/i }
    });

    console.log('\n📊 VERIFICATION:');
    console.log('   Email:', verifyUser.email);
    console.log('   createdAt:', verifyUser.createdAt.toISOString());
    console.log('   Wallet Balance:', verifyUser.wallet?.balance || 0);
    console.log('   Current XP:', verifyUser.xp?.current || 0);
    console.log('   Remaining Progress Records:', remainingProgress);
    console.log('   Remaining Transactions:', remainingTx);

    if (remainingProgress === 0 && remainingTx === 0) {
      console.log('\n✅ ALL CLEAN!');
    } else {
      console.log('\n⚠️  WARNING: Some records still exist!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ RESET COMPLETE!');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Stop your server (Ctrl+C)');
    console.log('2. Start your server: npm start');
    console.log('3. In app: Logout and login again');
    console.log('4. Open Daily Rewards');
    console.log('\n🎯 EXPECTED RESULT:');
    console.log('   Week: USER-W1');
    console.log('   Calendar: 25, 26, 27, 28, 01, 02, 03');
    console.log('   Day 1: CLAIMABLE (today - Feb 25)');
    console.log('   Day 2-7: LOCKED');
    console.log('   Streak: 0/7');
    console.log('   Wallet: 0 coins');
    console.log('   XP: 0');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

resetEverything();

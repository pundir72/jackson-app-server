/**
 * Check User's Daily Reward Claims
 * Verify multipliers, transactions, and wallet updates
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Transaction = require('./models/Transaction');
const DailyRewardProgress = require('./models/DailyRewardProgress');
const XPTier = require('./models/XPTier');

const userId = '6999e14f61f52e395e1531a4';

async function checkUserDailyRewards() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Checking Daily Reward Claims for User:', userId);
    console.log('='.repeat(70));

    // 1. Get user data
    const user = await User.findById(userId).select('email wallet xp createdAt');
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 USER INFO:');
    console.log('   Email:', user.email);
    console.log('   Wallet Balance:', user.wallet.balance);
    console.log('   Current XP:', user.xp.current);
    console.log('   Total XP:', user.xp.total);
    console.log('   Joined:', user.createdAt);

    // 2. Get user's XP tier
    const userXP = user.xp.current || 0;
    const tier = await XPTier.findOne({
      minXP: { $lte: userXP },
      maxXP: { $gte: userXP }
    }).select('name minXP maxXP accessBenefits');

    console.log('\n🎯 XP TIER:');
    if (tier) {
      console.log('   Tier:', tier.name);
      console.log('   Range:', tier.minXP, '-', tier.maxXP);
      console.log('   XP Multiplier:', tier.accessBenefits?.xpMultiplier || 1);
    } else {
      console.log('   ⚠️  No tier found for XP:', userXP);
    }

    // 3. Get daily reward progress
    const progress = await DailyRewardProgress.find({ userId })
      .sort({ weekStart: -1 })
      .limit(3);

    console.log('\n📅 DAILY REWARD PROGRESS:');
    console.log('   Total weeks:', progress.length);
    
    progress.forEach((week, idx) => {
      console.log(`\n   Week ${idx + 1}: ${week.weekKey}`);
      console.log('   Period:', week.weekStart.toISOString().split('T')[0], 'to', week.weekEnd.toISOString().split('T')[0]);
      console.log('   Days claimed:', week.days.filter(d => d.status === 'claimed').length, '/ 7');
      
      week.days.forEach(day => {
        if (day.status === 'claimed') {
          console.log(`      Day ${day.dayNumber}: ✅ Claimed - ${day.coins} coins, ${day.xp} XP (${day.claimedAt?.toISOString().split('T')[0]})`);
        }
      });
    });

    // 4. Get daily reward transactions
    const transactions = await Transaction.find({
      user: userId,
      description: { $regex: /Daily Reward/i }
    }).sort({ createdAt: -1 }).limit(10);

    console.log('\n💰 DAILY REWARD TRANSACTIONS:');
    console.log('   Total transactions:', transactions.length);
    
    if (transactions.length === 0) {
      console.log('   ⚠️  No daily reward transactions found');
    } else {
      console.log('\n   Recent transactions:');
      transactions.forEach((tx, idx) => {
        console.log(`\n   ${idx + 1}. ${tx.description}`);
        console.log('      Amount:', tx.amount, 'coins');
        console.log('      Status:', tx.status);
        console.log('      Date:', tx.createdAt.toISOString());
        
        if (tx.metadata) {
          console.log('      Metadata:');
          console.log('         Day:', tx.metadata.rewardDay);
          console.log('         Week:', tx.metadata.weekNumber);
          console.log('         Base XP:', tx.metadata.baseXp);
          console.log('         Final XP:', tx.metadata.xp);
          console.log('         Tier Multiplier:', tx.metadata.tierMultiplier || 'N/A');
          console.log('         Weekly Multiplier:', tx.metadata.weekMultiplier || 'N/A');
          console.log('         Big Reward:', tx.metadata.bigReward ? 'Yes' : 'No');
          console.log('         User Week System:', tx.metadata.userWeekSystem ? 'V3' : 'V1/V2');
        }
      });
    }

    // 5. Calculate expected vs actual
    console.log('\n📊 MULTIPLIER VERIFICATION:');
    
    const latestTx = transactions[0];
    if (latestTx && latestTx.metadata) {
      const baseXP = latestTx.metadata.baseXp || 0;
      const finalXP = latestTx.metadata.xp || 0;
      const tierMultiplier = latestTx.metadata.tierMultiplier || 1;
      const weekMultiplier = latestTx.metadata.weekMultiplier || 1;
      
      console.log('\n   Latest Claim Analysis:');
      console.log('   Base XP:', baseXP);
      console.log('   Tier Multiplier:', tierMultiplier);
      console.log('   Weekly Multiplier:', weekMultiplier);
      console.log('   Expected Final XP:', baseXP * tierMultiplier * weekMultiplier);
      console.log('   Actual Final XP:', finalXP);
      
      const expectedFinal = Math.round(baseXP * tierMultiplier * weekMultiplier);
      if (expectedFinal === finalXP) {
        console.log('   ✅ Multipliers applied correctly!');
      } else {
        console.log('   ❌ Multiplier mismatch!');
        console.log('   Difference:', finalXP - expectedFinal);
      }
    }

    // 6. Check wallet consistency
    console.log('\n💳 WALLET CONSISTENCY CHECK:');
    
    const allTransactions = await Transaction.find({ user: userId });
    const totalCredits = allTransactions
      .filter(tx => tx.type === 'credit' && tx.status === 'completed')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const totalDebits = allTransactions
      .filter(tx => tx.type === 'debit' && tx.status === 'completed')
      .reduce((sum, tx) => sum + tx.amount, 0);
    
    const expectedBalance = totalCredits - totalDebits;
    const actualBalance = user.wallet.balance;
    
    console.log('   Total Credits:', totalCredits);
    console.log('   Total Debits:', totalDebits);
    console.log('   Expected Balance:', expectedBalance);
    console.log('   Actual Balance:', actualBalance);
    
    if (expectedBalance === actualBalance) {
      console.log('   ✅ Wallet balance is correct!');
    } else {
      console.log('   ⚠️  Wallet balance mismatch!');
      console.log('   Difference:', actualBalance - expectedBalance);
    }

    // 7. Summary
    console.log('\n' + '='.repeat(70));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkUserDailyRewards();

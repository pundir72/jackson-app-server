/**
 * Debug Daily Challenge Issues
 * Check bonus day configuration and user progress
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const BonusDay = require('./models/BonusDay');
const Transaction = require('./models/Transaction');

const userId = '6999e14f61f52e395e1531a4';

async function debugDailyChallenge() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Debugging Daily Challenge');
    console.log('='.repeat(70));

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n👤 USER INFO:');
    console.log('   Email:', user.email);
    console.log('   Current Streak:', user.streak?.current || 0);
    console.log('   Completed Tasks:', user.streak?.completedTasks?.length || 0);
    console.log('   Last 5 tasks:', user.streak?.completedTasks?.slice(-5) || []);

    // Get bonus day configuration
    console.log('\n📅 BONUS DAY CONFIGURATION:');
    const bonusDays = await BonusDay.find({ isActive: true }).sort({ dayNumber: 1 });
    
    if (bonusDays.length === 0) {
      console.log('   ⚠️  No active bonus days configured!');
    } else {
      bonusDays.forEach(bonus => {
        console.log(`\n   Day ${bonus.dayNumber}: ${bonus.title}`);
        console.log('      Min Streak:', bonus.conditions?.minStreak || 0);
        console.log('      Requires Completion:', bonus.conditions?.requiresCompletion !== false);
        console.log('      Reward Type:', bonus.primaryReward?.type);
        console.log('      Reward Value:', bonus.primaryReward?.value);
        console.log('      Reset Rule:', bonus.resetRule?.onMiss ? 'Reset on miss' : 'No reset');
      });
    }

    // Get daily challenge transactions
    console.log('\n💰 DAILY CHALLENGE TRANSACTIONS:');
    const transactions = await Transaction.find({
      user: userId,
      $or: [
        { description: { $regex: /Daily Challenge/i } },
        { 'metadata.source': 'daily_challenge' },
        { 'metadata.source': 'bonus_day' }
      ]
    }).sort({ createdAt: -1 }).limit(10);

    if (transactions.length === 0) {
      console.log('   ⚠️  No daily challenge transactions found');
    } else {
      console.log(`   Total: ${transactions.length} transactions\n`);
      transactions.forEach((tx, idx) => {
        console.log(`   ${idx + 1}. ${tx.description}`);
        console.log('      Amount:', tx.amount);
        console.log('      Status:', tx.status);
        console.log('      Date:', tx.createdAt.toISOString());
        if (tx.metadata) {
          console.log('      Source:', tx.metadata.source);
          if (tx.metadata.bonusDayNumber) {
            console.log('      Bonus Day:', tx.metadata.bonusDayNumber);
          }
          if (tx.metadata.tierMultiplier) {
            console.log('      Tier Multiplier:', tx.metadata.tierMultiplier);
          }
        }
        console.log('');
      });
    }

    // Check if user is eligible for bonus day
    console.log('\n🎯 BONUS DAY ELIGIBILITY:');
    const currentStreak = user.streak?.current || 0;
    console.log('   Current Streak:', currentStreak);
    
    if (currentStreak >= 2) {
      const bonusDay2 = bonusDays.find(b => b.dayNumber === 2);
      if (bonusDay2) {
        const completedTasks = user.streak?.completedTasks || [];
        const userProfile = {
          currentStreak,
          completedTasks,
          country: user.country,
          userSegment: user.userSegment || 'all'
        };
        
        const isEligible = bonusDay2.isEligibleForUser(userProfile);
        console.log('\n   Day 2 Bonus:');
        console.log('      Configured:', 'Yes');
        console.log('      Min Streak:', bonusDay2.conditions?.minStreak);
        console.log('      Requires Completion:', bonusDay2.conditions?.requiresCompletion !== false);
        console.log('      Completed Tasks:', completedTasks.length);
        console.log('      Is Eligible:', isEligible ? '✅ YES' : '❌ NO');
        
        // Check if already claimed
        const existingTx = await Transaction.findOne({
          user: userId,
          'metadata.bonusDayNumber': 2,
          'metadata.source': 'bonus_day'
        });
        console.log('      Already Claimed:', existingTx ? '✅ YES' : '❌ NO');
      } else {
        console.log('   ⚠️  Day 2 bonus not configured');
      }
    } else {
      console.log('   ⚠️  Streak too low (need 2+)');
    }

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

debugDailyChallenge();

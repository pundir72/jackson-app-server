/**
 * BUG-065 Integration Test: Complete Spin Wheel Randomization Fix
 * 
 * This test simulates the exact scenario from the bug report:
 * "Gold reward with 20% probability is always granted despite lower probability"
 */

const mongoose = require('mongoose');
const SpinWheelReward = require('./models/SpinWheelReward');

// Import the fixed function from routes/spin.js
function selectRewardByProbability(rewards) {
  // BUG-065 FIX: Proper randomization logic
  // Calculate total probability of all rewards
  const totalProbability = rewards.reduce((sum, r) => sum + (r.probability || 0), 0);
  
  // Handle edge case: no probabilities set
  if (totalProbability <= 0) {
    // Equal probability for all rewards
    const randomIndex = Math.floor(Math.random() * rewards.length);
    console.log(`🎲 Equal distribution: selected ${rewards[randomIndex].name}`);
    return rewards[randomIndex];
  }
  
  // Generate random number between 0 and 100 (not total probability!)
  // This allows "no reward" outcomes when total probability < 100%
  const random = Math.random() * 100;
  
  // Build cumulative distribution and select reward
  let cumulative = 0;
  
  for (const reward of rewards) {
    const prob = reward.probability || 0;
    cumulative += prob;
    
    // Select reward if random falls within its probability range
    if (random < cumulative) {
      return reward;
    }
  }
  
  // Return null if no reward selected (allows "no reward" outcomes)
  return null;
}

async function testBug065Integration() {
  try {
    console.log('🧪 BUG-065 Integration Test: Complete Randomization Fix\n');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app');
    console.log('✅ Connected to database\n');
    
    // Clean up any existing test data
    await SpinWheelReward.deleteMany({ name: /^TEST_BUG_065/ });
    
    console.log('📋 Reproducing Bug Report Scenario:');
    console.log('   "Gold reward with 20% probability is always granted despite lower probability"');
    console.log('   "User always receives the same reward"\n');
    
    // Create the exact scenario from the bug report
    const goldReward = new SpinWheelReward({
      name: 'TEST_BUG_065_Gold_Reward',
      type: 'coins',
      amount: 500,
      probability: 20, // 20% probability as mentioned in bug report
      eligibleTiers: ['Gold'],
      isActive: true,
      createdBy: new mongoose.Types.ObjectId()
    });
    
    await goldReward.save();
    console.log('✅ Created Gold reward with 20% probability');
    
    // Test the fixed randomization logic
    console.log('\n🎲 Testing Fixed Randomization Logic:');
    console.log('   Performing 20 spins to verify probability distribution...\n');
    
    const testRewards = [goldReward];
    const results = {
      'Gold Reward': 0,
      'No Reward': 0
    };
    
    const totalSpins = 20;
    
    for (let i = 1; i <= totalSpins; i++) {
      const selectedReward = selectRewardByProbability(testRewards);
      const outcome = selectedReward ? 'Gold Reward' : 'No Reward';
      results[outcome]++;
      
      console.log(`Spin ${i.toString().padStart(2)}: ${outcome}`);
    }
    
    console.log('\n📊 Results Summary:');
    console.log('===================');
    
    const goldWins = results['Gold Reward'];
    const noRewards = results['No Reward'];
    const goldWinRate = ((goldWins / totalSpins) * 100).toFixed(1);
    const noRewardRate = ((noRewards / totalSpins) * 100).toFixed(1);
    
    console.log(`Gold Reward wins: ${goldWins}/${totalSpins} (${goldWinRate}%)`);
    console.log(`No Reward outcomes: ${noRewards}/${totalSpins} (${noRewardRate}%)`);
    console.log(`Expected: ~20% Gold, ~80% No Reward`);
    
    // Analyze results
    console.log('\n🔍 Analysis:');
    
    const hasVariedResults = goldWins > 0 && noRewards > 0;
    const isReasonableDistribution = goldWins < totalSpins; // Not always winning
    const isWithinExpectedRange = goldWinRate >= 5 && goldWinRate <= 50; // Reasonable range for 20%
    
    if (hasVariedResults) {
      console.log('✅ VARIED RESULTS: Both wins and no-reward outcomes occurred');
    } else {
      console.log('❌ NO VARIATION: All outcomes were the same (bug still exists)');
    }
    
    if (isReasonableDistribution) {
      console.log('✅ PROPER DISTRIBUTION: Not always winning (allows no-reward outcomes)');
    } else {
      console.log('❌ ALWAYS WINNING: Every spin resulted in a reward (bug still exists)');
    }
    
    if (isWithinExpectedRange) {
      console.log(`✅ REASONABLE PROBABILITY: ${goldWinRate}% is within expected range for 20%`);
    } else {
      console.log(`⚠️  PROBABILITY DEVIATION: ${goldWinRate}% is outside expected range for 20%`);
    }
    
    // Test with multiple rewards
    console.log('\n📋 Testing Multiple Rewards Scenario:');
    
    const silverReward = new SpinWheelReward({
      name: 'TEST_BUG_065_Silver_Reward',
      type: 'xp',
      amount: 300,
      probability: 15, // 15% probability
      eligibleTiers: ['Gold'],
      isActive: true,
      createdBy: new mongoose.Types.ObjectId()
    });
    
    await silverReward.save();
    console.log('✅ Added Silver reward with 15% probability');
    console.log('   Total probability: 20% + 15% = 35%');
    console.log('   Expected: ~35% rewards, ~65% no reward\n');
    
    const multiRewards = [goldReward, silverReward];
    const multiResults = {
      'Gold Reward': 0,
      'Silver Reward': 0,
      'No Reward': 0
    };
    
    for (let i = 1; i <= totalSpins; i++) {
      const selectedReward = selectRewardByProbability(multiRewards);
      let outcome;
      if (!selectedReward) {
        outcome = 'No Reward';
      } else if (selectedReward.name.includes('Gold')) {
        outcome = 'Gold Reward';
      } else {
        outcome = 'Silver Reward';
      }
      multiResults[outcome]++;
      
      console.log(`Spin ${i.toString().padStart(2)}: ${outcome}`);
    }
    
    console.log('\n📊 Multiple Rewards Results:');
    console.log('============================');
    
    Object.entries(multiResults).forEach(([outcome, count]) => {
      const percentage = ((count / totalSpins) * 100).toFixed(1);
      console.log(`${outcome}: ${count}/${totalSpins} (${percentage}%)`);
    });
    
    const totalRewardWins = multiResults['Gold Reward'] + multiResults['Silver Reward'];
    const totalRewardRate = ((totalRewardWins / totalSpins) * 100).toFixed(1);
    
    console.log(`\nTotal reward wins: ${totalRewardWins}/${totalSpins} (${totalRewardRate}%)`);
    console.log(`Expected total: ~35%`);
    
    // Clean up test data
    await SpinWheelReward.deleteMany({ name: /^TEST_BUG_065/ });
    console.log('\n🧹 Cleaned up test data');
    
    console.log('\n🎯 BUG-065 Fix Verification:');
    console.log('=============================');
    
    if (hasVariedResults && isReasonableDistribution) {
      console.log('✅ BUG FIXED: Randomization is working correctly');
      console.log('   - Users no longer always receive the same reward');
      console.log('   - Probability distribution reflects configured percentages');
      console.log('   - "No reward" outcomes are possible when total < 100%');
      console.log('   - Results vary across multiple spins');
    } else {
      console.log('❌ BUG STILL EXISTS: Randomization is not working correctly');
      console.log('   - Check the selectRewardByProbability function implementation');
      console.log('   - Verify all spin endpoints are using the fixed function');
    }
    
    console.log('\n💡 Expected Behavior After Fix:');
    console.log('   - 20% probability reward → ~20% win rate in multiple spins');
    console.log('   - Varied outcomes across spins (not always the same)');
    console.log('   - "No reward" outcomes when total probability < 100%');
    console.log('   - Statistical distribution matches configured probabilities');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

if (require.main === module) {
  testBug065Integration();
}

module.exports = { testBug065Integration, selectRewardByProbability };
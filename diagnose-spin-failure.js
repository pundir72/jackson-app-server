/**
 * Diagnose Spin Failure - BUG-065
 * 
 * Simple diagnostic to identify why tester gets "Failed to perform spin"
 */

const mongoose = require('mongoose');
const SpinWheelReward = require('./models/SpinWheelReward');
const SpinWheelConfig = require('./models/SpinWheelConfig');
const User = require('./models/User');

async function diagnoseSpin() {
  try {
    console.log('🔍 Diagnosing Spin Failure for BUG-065\n');
    
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jackson-app');
    console.log('✅ Database connection successful\n');
    
    // Check 1: Spin wheel configuration
    console.log('📋 Checking Spin Wheel Configuration:');
    const activeConfigs = await SpinWheelConfig.find({ isActive: true });
    console.log(`   Active configs found: ${activeConfigs.length}`);
    
    if (activeConfigs.length === 0) {
      console.log('❌ NO ACTIVE SPIN WHEEL CONFIG - This will cause spin failure!');
      console.log('   Solution: Admin needs to create and activate a spin wheel config');
    } else {
      const config = activeConfigs[0];
      console.log(`✅ Active config found: ${config.name || 'Unnamed'}`);
      console.log(`   Eligible tiers: ${config.eligibleTiers?.join(', ') || 'All'}`);
      console.log(`   Max spins per day: ${config.maxSpinsPerDay || 'Not set'}`);
      console.log(`   Spin mode: ${config.spinMode || 'free'}`);
      
      // Check campaign dates
      const now = new Date();
      if (config.startDate && new Date(config.startDate) > now) {
        console.log(`❌ CAMPAIGN NOT STARTED - Starts: ${config.startDate}`);
      } else if (config.endDate && new Date(config.endDate) < now) {
        console.log(`❌ CAMPAIGN ENDED - Ended: ${config.endDate}`);
      } else {
        console.log('✅ Campaign dates are valid (or not set)');
      }
    }
    
    // Check 2: Active rewards
    console.log('\n📋 Checking Active Rewards:');
    const activeRewards = await SpinWheelReward.find({ isActive: true });
    console.log(`   Active rewards found: ${activeRewards.length}`);
    
    if (activeRewards.length === 0) {
      console.log('❌ NO ACTIVE REWARDS - This will cause spin failure!');
      console.log('   Solution: Admin needs to create and activate rewards');
    } else {
      console.log('✅ Active rewards found:');
      
      // Group by tier
      const tierRewards = {};
      activeRewards.forEach(reward => {
        reward.eligibleTiers.forEach(tier => {
          if (!tierRewards[tier]) tierRewards[tier] = [];
          tierRewards[tier].push(reward);
        });
      });
      
      Object.entries(tierRewards).forEach(([tier, rewards]) => {
        const totalProb = rewards.reduce((sum, r) => sum + r.probability, 0);
        console.log(`   ${tier}: ${rewards.length} rewards, ${totalProb}% total probability`);
        
        rewards.forEach(reward => {
          console.log(`     - ${reward.name}: ${reward.probability}% (${reward.type})`);
        });
      });
    }
    
    // Check 3: Test user scenarios
    console.log('\n📋 Checking User Scenarios:');
    
    // Find a real user to test with
    const sampleUsers = await User.find({}).limit(3).select('firstName lastName email vip');
    console.log(`   Sample users found: ${sampleUsers.length}`);
    
    if (sampleUsers.length === 0) {
      console.log('❌ NO USERS FOUND - Need users to test spin');
    } else {
      sampleUsers.forEach(user => {
        const tier = user.vip?.level || 'Bronze';
        console.log(`   User: ${user.firstName} ${user.lastName} (${tier} tier)`);
      });
    }
    
    // Check 4: Syntax and function availability
    console.log('\n📋 Checking Code Integrity:');
    
    try {
      // Test if the selectRewardByProbability function works
      const testRewards = [
        { name: 'Test Reward', probability: 20, type: 'coins', amount: 100 }
      ];
      
      // Import the function from the routes file
      const fs = require('fs');
      const spinRouteContent = fs.readFileSync('./routes/spin.js', 'utf8');
      
      if (spinRouteContent.includes('selectRewardByProbability')) {
        console.log('✅ selectRewardByProbability function found in routes/spin.js');
      } else {
        console.log('❌ selectRewardByProbability function NOT found');
      }
      
      if (spinRouteContent.includes('Math.random() * 100')) {
        console.log('✅ Fixed randomization logic found (0-100 range)');
      } else if (spinRouteContent.includes('Math.random() * sum')) {
        console.log('❌ OLD randomization logic found (0-sum range) - BUG NOT FIXED!');
      } else {
        console.log('⚠️  Randomization logic unclear');
      }
      
      if (spinRouteContent.includes('return null')) {
        console.log('✅ "No reward" support found (can return null)');
      } else {
        console.log('❌ "No reward" support missing');
      }
      
    } catch (error) {
      console.log(`❌ Code check failed: ${error.message}`);
    }
    
    // Check 5: Common failure scenarios
    console.log('\n📋 Common Failure Scenarios:');
    
    const scenarios = [
      'User not eligible for spin wheel (tier mismatch)',
      'Daily spin limit reached',
      'Campaign not active (date range)',
      'No active spin wheel configuration',
      'No active rewards available',
      'Database connection issues',
      'Syntax errors in spin logic',
      'Missing required fields in models'
    ];
    
    scenarios.forEach((scenario, index) => {
      console.log(`   ${index + 1}. ${scenario}`);
    });
    
    console.log('\n💡 Debugging Steps for Tester:');
    console.log('1. Check browser console for detailed error messages');
    console.log('2. Check server logs when spin fails');
    console.log('3. Verify user has proper VIP tier (Gold for the test)');
    console.log('4. Ensure admin has created active spin wheel config');
    console.log('5. Ensure admin has created active rewards');
    console.log('6. Check if daily spin limit is reached');
    console.log('7. Restart server to ensure latest code is loaded');
    
    console.log('\n🔧 Quick Fix Checklist:');
    console.log('□ Active spin wheel configuration exists');
    console.log('□ Active rewards exist for user\'s tier');
    console.log('□ Campaign dates are valid (or not set)');
    console.log('□ User hasn\'t exceeded daily spin limit');
    console.log('□ Server has been restarted after code changes');
    console.log('□ No syntax errors in routes/spin.js');
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

if (require.main === module) {
  diagnoseSpin();
}

module.exports = { diagnoseSpin };
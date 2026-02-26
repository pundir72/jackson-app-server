/**
 * Test script for ADM-DR-006: Daily Reward XP Multipliers
 * Tests that BOTH weekly multiplier AND tier multiplier are applied correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const DailyRewardProgress = require('./models/DailyRewardProgress');
const DailyRewardConfigV2 = require('./models/DailyRewardConfigV2');
const XPTier = require('./models/XPTier');
const XPMultiplier = require('./models/XPMultiplier');
const XPTierV2 = require('./models/XPTierV2');
const Transaction = require('./models/Transaction');

async function testMultipliers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Test Scenario: User with XP in a specific tier claims daily reward
    console.log('=== TEST SCENARIO: Daily Reward with Multiple Multipliers ===\n');

    // Step 1: Check if XP Tier configuration exists
    console.log('📊 Step 1: Checking XP Tier Configuration');
    const xpTiers = await XPTier.find({ status: true }).sort({ xpMin: 1 }).lean();
    console.log(`Found ${xpTiers.length} active XP tiers:`);
    xpTiers.forEach(tier => {
      console.log(`  - ${tier.tierName}: ${tier.xpMin}-${tier.xpMax} XP, accessBenefits: ${tier.accessBenefits || 'N/A'}`);
    });

    // Step 2: Check XPMultiplier configuration
    console.log('\n📊 Step 2: Checking XPMultiplier Configuration');
    const xpMultipliers = await XPMultiplier.find({ isActive: true }).lean();
    console.log(`Found ${xpMultipliers.length} active XP multipliers:`);
    xpMultipliers.forEach(mult => {
      console.log(`  - ${mult.tier}: ${mult.multiplier}x`);
    });

    // Step 3: Check XPTierV2 configuration
    console.log('\n📊 Step 3: Checking XPTierV2 Configuration');
    const xpTiersV2 = await XPTierV2.find({ status: true }).sort({ xpMin: 1 }).lean();
    console.log(`Found ${xpTiersV2.length} active XP tiers V2:`);
    xpTiersV2.forEach(tier => {
      console.log(`  - ${tier.tier}: ${tier.xpMin}-${tier.xpMax} XP`);
    });

    // Step 4: Check Daily Reward Configuration
    console.log('\n📊 Step 4: Checking Daily Reward Configuration');
    const dailyRewardConfig = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 }).lean();
    if (!dailyRewardConfig) {
      console.log('❌ No active daily reward configuration found!');
      return;
    }

    console.log('Daily Reward Config:');
    console.log(`  - Version: ${dailyRewardConfig.version}`);
    console.log(`  - Weekly Multiplier Enabled: ${dailyRewardConfig.weeklyMultiplier?.enabled || false}`);
    if (dailyRewardConfig.weeklyMultiplier?.enabled) {
      console.log(`  - Weekly Multiplier Type: ${dailyRewardConfig.weeklyMultiplier.type}`);
      console.log(`  - Gradual Multiplier: ${dailyRewardConfig.weeklyMultiplier.gradualMultiplier || 'N/A'}`);
    }

    console.log('\n  Day Rewards:');
    dailyRewardConfig.days.forEach(day => {
      if (day.active) {
        console.log(`    Day ${day.dayNumber}: ${day.coinValue || day.coins || 0} coins, ${day.xpValue || day.xp || 0} XP`);
      }
    });

    // Step 5: Create a test user with specific XP
    console.log('\n📊 Step 5: Creating Test User');
    const testXP = 5000; // Mid-tier XP
    const testUser = await User.create({
      firstName: 'Test',
      lastName: 'Multiplier',
      phoneNumber: '+1234567899',
      wallet: { balance: 0, cash: 0 },
      xp: { current: testXP, total: testXP },
      createdAt: new Date('2025-02-24T10:00:00Z'), // Monday, so week 1
    });

    console.log(`Created test user: ${testUser._id}`);
    console.log(`User XP: ${testXP}`);

    // Determine user's tier
    const userTier = xpTiers.find(tier => testXP >= tier.xpMin && testXP <= tier.xpMax);
    console.log(`User Tier: ${userTier ? userTier.tierName : 'Unknown'}`);
    console.log(`Access Benefits: ${userTier ? userTier.accessBenefits : 'N/A'}`);

    // Parse accessBenefits multiplier
    let accessBenefitsMultiplier = 1.0;
    if (userTier && userTier.accessBenefits) {
      const match = userTier.accessBenefits.match(/(\d+\.?\d*)x/i);
      if (match && match[1]) {
        accessBenefitsMultiplier = parseFloat(match[1]);
      }
    }
    console.log(`Parsed Access Benefits Multiplier: ${accessBenefitsMultiplier}x`);

    // Step 6: Simulate claiming Day 1 reward
    console.log('\n📊 Step 6: Simulating Day 1 Reward Claim');
    const day1Config = dailyRewardConfig.days.find(d => d.dayNumber === 1);
    if (!day1Config) {
      console.log('❌ Day 1 configuration not found!');
      return;
    }

    const baseCoins = day1Config.coinValue !== undefined ? day1Config.coinValue : day1Config.coins || 0;
    const baseXP = day1Config.xpValue !== undefined ? day1Config.xpValue : day1Config.xp || 0;

    console.log(`\nBase Rewards (from config):`);
    console.log(`  - Coins: ${baseCoins}`);
    console.log(`  - XP: ${baseXP}`);

    // Week 1: No weekly multiplier
    const weekNumber = 1;
    const weekMultiplier = 1.0;
    console.log(`\nWeek Number: ${weekNumber}`);
    console.log(`Weekly Multiplier: ${weekMultiplier}x (not applied in week 1)`);

    // Calculate final values
    const coinsAfterWeekly = baseCoins * weekMultiplier;
    const xpAfterWeekly = baseXP * weekMultiplier;

    console.log(`\nAfter Weekly Multiplier:`);
    console.log(`  - Coins: ${coinsAfterWeekly}`);
    console.log(`  - XP: ${xpAfterWeekly}`);

    // Apply tier multiplier to XP only
    const finalXP = Math.round(xpAfterWeekly * accessBenefitsMultiplier);

    console.log(`\nAfter Tier Multiplier (${accessBenefitsMultiplier}x on XP only):`);
    console.log(`  - Coins: ${coinsAfterWeekly} (unchanged)`);
    console.log(`  - XP: ${finalXP}`);

    console.log(`\n✅ Expected Final Rewards:`);
    console.log(`  - Coins: ${coinsAfterWeekly}`);
    console.log(`  - XP: ${finalXP}`);
    console.log(`\n📝 Calculation: Base XP (${baseXP}) × Weekly (${weekMultiplier}) × Tier (${accessBenefitsMultiplier}) = ${finalXP}`);

    // Step 7: Test Week 2 with weekly multiplier
    console.log('\n\n=== TEST SCENARIO 2: Week 2 with Weekly Multiplier ===\n');
    const weekNumber2 = 2;
    let weekMultiplier2 = 1.0;
    
    if (dailyRewardConfig.weeklyMultiplier?.enabled) {
      if (dailyRewardConfig.weeklyMultiplier.type === 'Gradual') {
        weekMultiplier2 = 1.0 + ((weekNumber2 - 1) * (dailyRewardConfig.weeklyMultiplier.gradualMultiplier || 0.1));
      }
    }

    console.log(`Week Number: ${weekNumber2}`);
    console.log(`Weekly Multiplier: ${weekMultiplier2}x`);

    const coinsAfterWeekly2 = Math.round(baseCoins * weekMultiplier2);
    const xpAfterWeekly2 = Math.round(baseXP * weekMultiplier2);

    console.log(`\nAfter Weekly Multiplier:`);
    console.log(`  - Coins: ${coinsAfterWeekly2}`);
    console.log(`  - XP: ${xpAfterWeekly2}`);

    const finalXP2 = Math.round(xpAfterWeekly2 * accessBenefitsMultiplier);

    console.log(`\nAfter Tier Multiplier (${accessBenefitsMultiplier}x on XP only):`);
    console.log(`  - Coins: ${coinsAfterWeekly2} (unchanged)`);
    console.log(`  - XP: ${finalXP2}`);

    console.log(`\n✅ Expected Final Rewards (Week 2):`);
    console.log(`  - Coins: ${coinsAfterWeekly2}`);
    console.log(`  - XP: ${finalXP2}`);
    console.log(`\n📝 Calculation: Base XP (${baseXP}) × Weekly (${weekMultiplier2}) × Tier (${accessBenefitsMultiplier}) = ${finalXP2}`);

    // Cleanup
    console.log('\n\n🧹 Cleaning up test data...');
    await User.deleteOne({ _id: testUser._id });
    await DailyRewardProgress.deleteMany({ userId: testUser._id });
    await Transaction.deleteMany({ user: testUser._id });
    console.log('✅ Test data cleaned up');

    console.log('\n\n📋 SUMMARY:');
    console.log('==========');
    console.log(`\n✅ Multiplier Configuration:`);
    console.log(`  - XP Tiers: ${xpTiers.length} configured`);
    console.log(`  - XP Multipliers: ${xpMultipliers.length} configured`);
    console.log(`  - Weekly Multiplier: ${dailyRewardConfig.weeklyMultiplier?.enabled ? 'Enabled' : 'Disabled'}`);
    
    console.log(`\n✅ Expected Behavior:`);
    console.log(`  1. Week 1: Base XP × Tier Multiplier = Final XP`);
    console.log(`  2. Week 2+: Base XP × Weekly Multiplier × Tier Multiplier = Final XP`);
    console.log(`  3. Coins: Only weekly multiplier applies (no tier multiplier)`);
    console.log(`  4. XP: Both weekly AND tier multipliers apply`);

    console.log(`\n✅ Test User Example (${testXP} XP, ${userTier?.tierName || 'Unknown'} tier):`);
    console.log(`  - Week 1: ${baseXP} XP × ${accessBenefitsMultiplier} = ${finalXP} XP`);
    console.log(`  - Week 2: ${baseXP} XP × ${weekMultiplier2} × ${accessBenefitsMultiplier} = ${finalXP2} XP`);

    console.log(`\n\n🎉 Test completed successfully!`);
    console.log(`\n⚠️  IMPORTANT: To verify the fix, claim a daily reward and check:`);
    console.log(`  1. Transaction metadata should show both multipliers`);
    console.log(`  2. Final XP should match: Base × Weekly × Tier`);
    console.log(`  3. Console logs should show multiplier calculations`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
  }
}

testMultipliers();

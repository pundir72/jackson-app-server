/**
 * Quick verification script for ADM-DR-006
 * Checks if XP multipliers are configured and working
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const XPTier = require('./models/XPTier');
const XPMultiplier = require('./models/XPMultiplier');
const DailyRewardConfigV2 = require('./models/DailyRewardConfigV2');
const Transaction = require('./models/Transaction');

async function verifyMultipliers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    console.log('=== ADM-DR-006 MULTIPLIER VERIFICATION ===\n');

    // 1. Check XPTier Configuration
    console.log('1️⃣  Checking XPTier Configuration...');
    const xpTiers = await XPTier.find({ status: true }).sort({ xpMin: 1 }).lean();
    
    if (xpTiers.length === 0) {
      console.log('❌ NO ACTIVE XP TIERS FOUND!');
      console.log('   → This is the problem! Configure XP tiers in admin panel.\n');
    } else {
      console.log(`✅ Found ${xpTiers.length} active XP tiers:`);
      xpTiers.forEach(tier => {
        const hasMultiplier = tier.accessBenefits && tier.accessBenefits !== '1.0x';
        console.log(`   ${hasMultiplier ? '✅' : '❌'} ${tier.tierName}: ${tier.xpMin}-${tier.xpMax} XP, accessBenefits: ${tier.accessBenefits || 'NOT SET'}`);
      });
      console.log();
    }

    // 2. Check XPMultiplier Configuration
    console.log('2️⃣  Checking XPMultiplier Configuration...');
    const xpMultipliers = await XPMultiplier.find({ isActive: true }).lean();
    
    if (xpMultipliers.length === 0) {
      console.log('⚠️  No active XP multipliers found (this is OK if using XPTier.accessBenefits)');
    } else {
      console.log(`✅ Found ${xpMultipliers.length} active XP multipliers:`);
      xpMultipliers.forEach(mult => {
        console.log(`   ✅ ${mult.tier}: ${mult.multiplier}x`);
      });
    }
    console.log();

    // 3. Check Daily Reward Configuration
    console.log('3️⃣  Checking Daily Reward Configuration...');
    const dailyRewardConfig = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 }).lean();
    
    if (!dailyRewardConfig) {
      console.log('❌ NO ACTIVE DAILY REWARD CONFIGURATION FOUND!');
      console.log('   → Configure daily rewards in admin panel.\n');
    } else {
      console.log('✅ Daily Reward Configuration Found:');
      console.log(`   - Version: ${dailyRewardConfig.version}`);
      console.log(`   - Weekly Multiplier: ${dailyRewardConfig.weeklyMultiplier?.enabled ? 'ENABLED' : 'DISABLED'}`);
      if (dailyRewardConfig.weeklyMultiplier?.enabled) {
        console.log(`   - Type: ${dailyRewardConfig.weeklyMultiplier.type}`);
        console.log(`   - Gradual Multiplier: ${dailyRewardConfig.weeklyMultiplier.gradualMultiplier || 'N/A'}`);
      }
      console.log();
    }

    // 4. Check Recent Transactions
    console.log('4️⃣  Checking Recent Daily Reward Transactions...');
    const recentTransactions = await Transaction.find({
      description: /Daily Reward/,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('user', 'firstName lastName xp')
    .lean();

    if (recentTransactions.length === 0) {
      console.log('⚠️  No daily reward transactions in last 24 hours');
    } else {
      console.log(`✅ Found ${recentTransactions.length} recent transactions:\n`);
      
      recentTransactions.forEach((tx, index) => {
        console.log(`   Transaction ${index + 1}:`);
        console.log(`   - User: ${tx.user?.firstName} ${tx.user?.lastName}`);
        console.log(`   - Description: ${tx.description}`);
        console.log(`   - Amount: ${tx.amount} ${tx.balanceType}`);
        
        if (tx.metadata) {
          console.log(`   - Metadata:`);
          console.log(`     • Base XP: ${tx.metadata.baseXp || 'N/A'}`);
          console.log(`     • Final XP: ${tx.metadata.finalXp || tx.metadata.xp || 'N/A'}`);
          console.log(`     • Tier Multiplier: ${tx.metadata.tierMultiplier || tx.metadata.accessBenefitsMultiplier || 'N/A'}`);
          console.log(`     • Week Multiplier: ${tx.metadata.weekMultiplier || 'N/A'}`);
          if (tx.metadata.calculation) {
            console.log(`     • Calculation: ${tx.metadata.calculation}`);
          }
        }
        console.log();
      });
    }

    // 5. Test with a Specific User (if provided)
    const testUserId = process.argv[2]; // Pass user ID as command line argument
    if (testUserId) {
      console.log(`5️⃣  Testing with User ID: ${testUserId}...\n`);
      
      const user = await User.findById(testUserId).select('firstName lastName xp').lean();
      if (!user) {
        console.log('❌ User not found!');
      } else {
        console.log(`✅ User: ${user.firstName} ${user.lastName}`);
        console.log(`   - Current XP: ${user.xp?.current || 0}`);
        
        // Find which tier the user is in
        const userTier = xpTiers.find(tier => 
          (user.xp?.current || 0) >= tier.xpMin && 
          (user.xp?.current || 0) <= tier.xpMax
        );
        
        if (userTier) {
          console.log(`   - Tier: ${userTier.tierName}`);
          console.log(`   - Access Benefits: ${userTier.accessBenefits || 'NOT SET'}`);
          
          // Parse multiplier
          let multiplier = 1.0;
          if (userTier.accessBenefits) {
            const match = userTier.accessBenefits.match(/(\d+\.?\d*)x/i);
            if (match && match[1]) {
              multiplier = parseFloat(match[1]);
            }
          }
          console.log(`   - Tier Multiplier: ${multiplier}x`);
          
          // Show what they would get
          if (dailyRewardConfig) {
            const day1 = dailyRewardConfig.days.find(d => d.dayNumber === 1);
            if (day1) {
              const baseXP = day1.xpValue !== undefined ? day1.xpValue : day1.xp || 0;
              const finalXP = Math.round(baseXP * multiplier);
              console.log(`\n   📊 Expected Day 1 Reward (Week 1):`);
              console.log(`      Base XP: ${baseXP}`);
              console.log(`      × Tier Multiplier: ${multiplier}x`);
              console.log(`      = Final XP: ${finalXP}`);
            }
          }
        } else {
          console.log(`   ❌ User is NOT in any tier!`);
          console.log(`      User XP: ${user.xp?.current || 0}`);
          console.log(`      Available tiers:`);
          xpTiers.forEach(tier => {
            console.log(`        - ${tier.tierName}: ${tier.xpMin}-${tier.xpMax}`);
          });
        }
      }
    }

    // Summary
    console.log('\n\n📋 SUMMARY:');
    console.log('==========\n');
    
    const hasXPTiers = xpTiers.length > 0;
    const hasMultipliers = xpTiers.some(t => t.accessBenefits && t.accessBenefits !== '1.0x');
    const hasDailyRewardConfig = !!dailyRewardConfig;
    
    if (hasXPTiers && hasMultipliers && hasDailyRewardConfig) {
      console.log('✅ ALL CONFIGURATIONS ARE CORRECT!');
      console.log('\nIf multipliers are still not working:');
      console.log('1. Check that user is in a tier with multiplier');
      console.log('2. Check console logs when claiming reward');
      console.log('3. Check transaction metadata for multiplier values');
      console.log('4. Verify frontend is displaying correct values');
      console.log('\nTo test with a specific user:');
      console.log('node verify-adm-dr-006-multipliers.js USER_ID');
    } else {
      console.log('❌ CONFIGURATION ISSUES FOUND:\n');
      if (!hasXPTiers) {
        console.log('   ❌ No XP tiers configured');
        console.log('      → Go to Admin Panel → XP Tiers → Create tiers');
      }
      if (hasXPTiers && !hasMultipliers) {
        console.log('   ❌ XP tiers exist but no multipliers set');
        console.log('      → Edit each tier and set accessBenefits (e.g., "1.5x")');
      }
      if (!hasDailyRewardConfig) {
        console.log('   ❌ No daily reward configuration');
        console.log('      → Go to Admin Panel → Daily Rewards → Configure');
      }
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
  }
}

verifyMultipliers();

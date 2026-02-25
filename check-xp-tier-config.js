/**
 * Check XP Tier Configuration
 * Verify if XP tiers and multipliers are properly configured
 */

const mongoose = require('mongoose');
require('dotenv').config();

const XPTierV2 = require('./models/XPTierV2');
const XPMultiplier = require('./models/XPMultiplier');
const User = require('./models/User');

const userId = '6999e14f61f52e395e1531a4';

async function checkXPTierConfig() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Checking XP Tier Configuration');
    console.log('='.repeat(70));

    // 1. Check XPTierV2 configuration
    console.log('\n📊 XP TIERS (XPTierV2):');
    const tiers = await XPTierV2.find().sort({ minXP: 1 });
    
    if (tiers.length === 0) {
      console.log('   ❌ NO XP TIERS CONFIGURED!');
      console.log('   This is why tier multipliers are not working.');
    } else {
      console.log(`   Found ${tiers.length} tiers:\n`);
      tiers.forEach(tier => {
        console.log(`   ${tier.tier}:`);
        console.log(`      Range: ${tier.minXP} - ${tier.maxXP} XP`);
        console.log(`      Display: ${tier.xpRange}`);
        console.log(`      Active: ${tier.isActive !== false ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

    // 2. Check XPMultiplier configuration
    console.log('\n🎯 XP MULTIPLIERS (XPMultiplier):');
    const multipliers = await XPMultiplier.find();
    
    if (multipliers.length === 0) {
      console.log('   ❌ NO XP MULTIPLIERS CONFIGURED!');
      console.log('   This is why tier bonuses are not applied.');
    } else {
      console.log(`   Found ${multipliers.length} multipliers:\n`);
      multipliers.forEach(mult => {
        console.log(`   ${mult.tier}:`);
        console.log(`      Multiplier: ${mult.multiplier}x`);
        console.log(`      Active: ${mult.isActive ? 'Yes' : 'No'}`);
        console.log('');
      });
    }

    // 3. Check user's tier
    console.log('\n👤 USER TIER CHECK:');
    const user = await User.findById(userId).select('email xp');
    
    if (!user) {
      console.log('   ❌ User not found');
    } else {
      const currentXP = user.xp.current || 0;
      console.log(`   User: ${user.email}`);
      console.log(`   Current XP: ${currentXP}`);
      
      // Find matching tier
      const userTier = await XPTierV2.findByXpValue(currentXP);
      
      if (!userTier) {
        console.log(`   ❌ NO TIER FOUND for ${currentXP} XP`);
        console.log('   User falls outside all configured tier ranges.');
      } else {
        console.log(`   ✅ Tier: ${userTier.tier}`);
        console.log(`   Range: ${userTier.xpRange}`);
        
        // Find matching multiplier
        const tierMap = {
          'Junior': 'JUNIOR',
          'Middle': 'MID',
          'Senior': 'SENIOR'
        };
        const tierKey = tierMap[userTier.tier];
        
        const multiplier = await XPMultiplier.findOne({
          tier: tierKey,
          isActive: true
        });
        
        if (!multiplier) {
          console.log(`   ⚠️  No active multiplier for ${tierKey}`);
          console.log('   Default 1.0x will be used.');
        } else {
          console.log(`   ✅ Multiplier: ${multiplier.multiplier}x`);
        }
      }
    }

    // 4. Test calculation
    console.log('\n🧮 TEST CALCULATION:');
    console.log('   Scenario: User claims 30 base XP');
    
    if (tiers.length === 0 || multipliers.length === 0) {
      console.log('   Result: 30 XP (no multiplier applied)');
      console.log('   Reason: Tiers or multipliers not configured');
    } else {
      const user = await User.findById(userId);
      const { applyTierMultiplierToXPV2 } = require('./utils/xpTierMultiplierV2');
      const result = await applyTierMultiplierToXPV2(user, 30);
      
      console.log(`   Base XP: 30`);
      console.log(`   Tier: ${result.tier || 'None'}`);
      console.log(`   Multiplier: ${result.multiplier}x`);
      console.log(`   Final XP: ${result.finalXP}`);
      
      if (result.multiplier === 1.0) {
        console.log('   ⚠️  No multiplier applied (using default 1.0x)');
      } else {
        console.log('   ✅ Multiplier applied successfully!');
      }
    }

    // 5. Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    
    if (tiers.length === 0) {
      console.log('\n   ❌ CREATE XP TIERS:');
      console.log('   Go to Admin Panel → XP Tiers → Create New');
      console.log('   Example:');
      console.log('      Junior: 0-100 XP');
      console.log('      Middle: 101-500 XP');
      console.log('      Senior: 501-1000 XP');
    }
    
    if (multipliers.length === 0) {
      console.log('\n   ❌ CREATE XP MULTIPLIERS:');
      console.log('   Go to Admin Panel → XP Multipliers → Create New');
      console.log('   Example:');
      console.log('      JUNIOR: 1.0x');
      console.log('      MID: 1.2x');
      console.log('      SENIOR: 1.5x');
    }
    
    if (tiers.length > 0 && multipliers.length > 0) {
      console.log('\n   ✅ Configuration looks good!');
      console.log('   If multipliers still not working, check:');
      console.log('   1. Multipliers are marked as "active"');
      console.log('   2. User XP falls within a tier range');
      console.log('   3. Tier names match (Junior/Middle/Senior)');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ CHECK COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkXPTierConfig();

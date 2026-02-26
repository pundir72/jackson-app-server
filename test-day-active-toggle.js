/**
 * Test Day Active Toggle
 * This script tests if the day active/inactive toggle is working
 */

const mongoose = require('mongoose');
require('dotenv').config();

const DailyRewardConfigV2 = require('./models/DailyRewardConfigV2');

async function testDayActiveToggle() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Testing Day Active/Inactive Toggle');
    console.log('='.repeat(70));

    // Get current config
    const config = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 });
    
    if (!config) {
      console.log('❌ No active config found');
      return;
    }

    console.log('\n📋 Current Configuration:');
    console.log('   Config ID:', config._id);
    console.log('   Version:', config.version);
    console.log('   Is Active:', config.isActive);
    console.log('   Last Updated:', config.updatedAt);

    console.log('\n📅 Day Configuration:');
    config.days.forEach(day => {
      const status = day.active ? '✅ ACTIVE' : '❌ INACTIVE';
      console.log(`   Day ${day.dayNumber}: ${status} - ${day.coinValue} coins, ${day.xpValue} XP (${day.rewardType})`);
    });

    // Test: Toggle Day 3 active status
    console.log('\n🧪 TEST: Toggling Day 3 active status...');
    const day3 = config.days.find(d => d.dayNumber === 3);
    const originalStatus = day3.active;
    console.log(`   Original status: ${originalStatus ? 'ACTIVE' : 'INACTIVE'}`);
    
    // Toggle it
    day3.active = !day3.active;
    await config.save();
    
    console.log(`   New status: ${day3.active ? 'ACTIVE' : 'INACTIVE'}`);
    console.log('   ✅ Saved to database');

    // Verify it was saved
    const verifyConfig = await DailyRewardConfigV2.findById(config._id);
    const verifyDay3 = verifyConfig.days.find(d => d.dayNumber === 3);
    
    console.log('\n✅ VERIFICATION:');
    console.log(`   Day 3 status in DB: ${verifyDay3.active ? 'ACTIVE' : 'INACTIVE'}`);
    
    if (verifyDay3.active === day3.active) {
      console.log('   ✅ Toggle saved correctly!');
    } else {
      console.log('   ❌ Toggle NOT saved correctly!');
    }

    // Restore original status
    console.log('\n🔄 Restoring original status...');
    day3.active = originalStatus;
    await config.save();
    console.log('   ✅ Restored');

    console.log('\n' + '='.repeat(70));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testDayActiveToggle();

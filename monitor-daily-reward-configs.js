/**
 * Monitor Daily Reward Configuration Changes
 */

const mongoose = require('mongoose');
const DailyRewardConfig = require('./models/DailyRewardConfig');
const DailyRewardConfigV2 = require('./models/DailyRewardConfigV2');
require('dotenv').config();

async function monitorConfigs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const activeV1 = await DailyRewardConfig.countDocuments({ isActive: true });
    const activeV2 = await DailyRewardConfigV2.countDocuments({ isActive: true });
    
    console.log(`${new Date().toISOString()}: V1=${activeV1}, V2=${activeV2}`);
    
    if (activeV1 > 0 && activeV2 > 0) {
      console.log('⚠️  CONFLICT: Both V1 and V2 configs active!');
    } else if (activeV1 > 0) {
      console.log('ℹ️  Only V1 config active');
    } else if (activeV2 > 0) {
      console.log('ℹ️  Only V2 config active');
    } else {
      console.log('ℹ️  No active configs');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Monitor error:', error.message);
  }
}

monitorConfigs();
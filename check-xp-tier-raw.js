/**
 * Check raw XP tier data in database
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkRawData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const db = mongoose.connection.db;
    
    // Get raw XPTierV2 documents
    console.log('\n📊 RAW XP TIERS:');
    const tiers = await db.collection('xptierv2s').find().toArray();
    console.log(JSON.stringify(tiers, null, 2));
    
    // Get raw XPMultiplier documents
    console.log('\n🎯 RAW XP MULTIPLIERS:');
    const multipliers = await db.collection('xpmultipliers').find().toArray();
    console.log(JSON.stringify(multipliers, null, 2));
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkRawData();

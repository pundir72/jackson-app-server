/**
 * Check user's actual join date from database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUserJoinDate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get user
    const userId = '6999e14f61f52e395e1531a4';
    const user = await User.findById(userId).select('email createdAt');

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('\n📊 User Information:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Created At (raw): ${user.createdAt}`);
    console.log(`   Created At (ISO): ${user.createdAt.toISOString()}`);
    console.log(`   Created At (UTC): ${user.createdAt.toUTCString()}`);
    
    // Check what day of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = user.createdAt.getUTCDay();
    console.log(`   Day of Week: ${dayNames[dayOfWeek]}`);
    
    // Normalize to start of day
    const normalized = new Date(user.createdAt);
    normalized.setUTCHours(0, 0, 0, 0);
    console.log(`\n📅 Normalized (start of day):`);
    console.log(`   Date: ${normalized.toISOString()}`);
    console.log(`   Day of Week: ${dayNames[normalized.getUTCDay()]}`);
    
    // Check date components
    console.log(`\n🔍 Date Components:`);
    console.log(`   Year: ${user.createdAt.getUTCFullYear()}`);
    console.log(`   Month: ${user.createdAt.getUTCMonth() + 1} (${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][user.createdAt.getUTCMonth()]})`);
    console.log(`   Date: ${user.createdAt.getUTCDate()}`);
    console.log(`   Hours: ${user.createdAt.getUTCHours()}`);
    console.log(`   Minutes: ${user.createdAt.getUTCMinutes()}`);
    console.log(`   Seconds: ${user.createdAt.getUTCSeconds()}`);

    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserJoinDate();

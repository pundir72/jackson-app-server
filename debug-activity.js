/**
 * Debug script to check activity tracking
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const { trackUserActivity, getUserActivityStats } = require('./utils/dailyActivityTracker');

async function debugActivity() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/game-backend');
    console.log('✅ Connected to MongoDB');

    // Find a test user
    const testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      console.log('❌ Test user not found');
      return;
    }

    console.log('\n🔍 Current Activity Stats:');
    const stats = await getUserActivityStats(testUser._id.toString());
    console.log(JSON.stringify(stats, null, 2));

    console.log('\n📊 Manual Activity Tracking:');
    const result = await trackUserActivity(testUser._id.toString(), {
      endpoint: '/api/daily-activity/track',
      method: 'POST',
      debug: true
    });
    console.log('Tracking Result:', JSON.stringify(result, null, 2));

    console.log('\n🔍 Updated Activity Stats:');
    const updatedStats = await getUserActivityStats(testUser._id.toString());
    console.log(JSON.stringify(updatedStats, null, 2));

    // Check if user was already active today
    const today = new Date().toISOString().split('T')[0];
    const wasActiveToday = stats.activeDates ? stats.activeDates.includes(today) : false;
    console.log(`\n📅 Was user active today (${today})? ${wasActiveToday}`);

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugActivity();






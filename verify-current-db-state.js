/**
 * Verify Current Database State
 * Check what's actually stored in DB right now
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function verifyDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔍 Checking Current Database State');
    console.log('='.repeat(70));

    const userId = '6999e14f61f52e395e1531a4';

    // Check raw user document
    const rawUser = await mongoose.connection.db.collection('users').findOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });

    console.log('\n👤 USER (Raw from DB):');
    console.log('   Email:', rawUser.email);
    console.log('   createdAt:', rawUser.createdAt);
    console.log('   createdAt type:', typeof rawUser.createdAt);
    console.log('   createdAt constructor:', rawUser.createdAt?.constructor?.name);

    // Check progress records
    const progressRecords = await mongoose.connection.db.collection('dailyrewardprogresses')
      .find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ weekStart: -1 })
      .toArray();

    console.log('\n📊 PROGRESS RECORDS:');
    console.log('   Total records:', progressRecords.length);
    
    if (progressRecords.length > 0) {
      console.log('\n   Latest record:');
      const latest = progressRecords[0];
      console.log('   weekKey:', latest.weekKey);
      console.log('   weekStart:', latest.weekStart);
      console.log('   weekEnd:', latest.weekEnd);
      console.log('   Days claimed:', latest.days.filter(d => d.status === 'claimed').length);
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

verifyDB();

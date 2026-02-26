/**
 * Direct MongoDB update to set createdAt
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function directUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const userId = '6999e14f61f52e395e1531a4';
    const joinDate = new Date('2026-02-24T00:00:00.000Z');

    console.log(`🔧 Updating user ${userId}`);
    console.log(`   Setting createdAt to: ${joinDate.toISOString()}`);

    // Direct MongoDB update
    const result = await mongoose.connection.db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { 
        $set: { 
          createdAt: joinDate,
          updatedAt: new Date()
        } 
      }
    );

    console.log(`\n📊 Update Result:`);
    console.log(`   Matched: ${result.matchedCount}`);
    console.log(`   Modified: ${result.modifiedCount}`);

    // Verify
    const user = await mongoose.connection.db.collection('users').findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { email: 1, createdAt: 1, updatedAt: 1 } }
    );

    console.log(`\n✅ Verified:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   createdAt: ${user.createdAt ? user.createdAt.toISOString() : 'NULL'}`);
    console.log(`   updatedAt: ${user.updatedAt ? user.updatedAt.toISOString() : 'NULL'}`);

    if (user.createdAt) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      console.log(`   Day of week: ${dayNames[user.createdAt.getUTCDay()]}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

directUpdate();

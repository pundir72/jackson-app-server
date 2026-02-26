/**
 * Force Update Database - Direct MongoDB Commands
 * No Mongoose validation, just raw updates
 */

const mongoose = require('mongoose');
require('dotenv').config();

const userId = '6999e14f61f52e395e1531a4';

async function forceUpdate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\n🔧 FORCE UPDATE DATABASE');
    console.log('='.repeat(70));

    const db = mongoose.connection.db;

    // 1. Update user createdAt to TODAY at midnight
    console.log('\n📅 STEP 1: Updating user createdAt...');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    const userResult = await db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { createdAt: today } }
    );
    console.log('   Modified:', userResult.modifiedCount);
    console.log('   New createdAt:', today.toISOString());

    // 2. Delete ALL progress records
    console.log('\n🗑️  STEP 2: Deleting progress records...');
    const progressResult = await db.collection('dailyrewardprogresses').deleteMany({
      userId: new mongoose.Types.ObjectId(userId)
    });
    console.log('   Deleted:', progressResult.deletedCount);

    // 3. Delete ALL daily reward transactions
    console.log('\n🗑️  STEP 3: Deleting transactions...');
    const txResult = await db.collection('transactions').deleteMany({
      user: new mongoose.Types.ObjectId(userId),
      description: { $regex: /Daily Reward/i }
    });
    console.log('   Deleted:', txResult.deletedCount);

    // 4. Reset wallet and XP
    console.log('\n💰 STEP 4: Resetting wallet and XP...');
    const walletResult = await db.collection('users').updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { 
        $set: { 
          'wallet.balance': 0,
          'wallet.lastUpdated': new Date(),
          'xp.current': 0,
          'xp.total': 0
        } 
      }
    );
    console.log('   Modified:', walletResult.modifiedCount);

    // 5. Verify
    console.log('\n✅ VERIFICATION:');
    const user = await db.collection('users').findOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });
    const progressCount = await db.collection('dailyrewardprogresses').countDocuments({
      userId: new mongoose.Types.ObjectId(userId)
    });
    const txCount = await db.collection('transactions').countDocuments({
      user: new mongoose.Types.ObjectId(userId),
      description: { $regex: /Daily Reward/i }
    });

    console.log('   createdAt:', user.createdAt);
    console.log('   Wallet:', user.wallet?.balance || 0);
    console.log('   XP:', user.xp?.current || 0);
    console.log('   Progress records:', progressCount);
    console.log('   Transactions:', txCount);

    if (progressCount === 0 && txCount === 0) {
      console.log('\n✅ SUCCESS! Database is clean.');
    } else {
      console.log('\n⚠️  WARNING: Some records still exist!');
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ DONE!');
    console.log('\nNOW:');
    console.log('1. Stop server (Ctrl+C)');
    console.log('2. Start server: npm start');
    console.log('3. Logout/login in app');
    console.log('4. Open Daily Rewards');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

forceUpdate();

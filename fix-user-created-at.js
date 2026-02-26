/**
 * Fix users with missing createdAt field
 * 
 * This script finds users without createdAt and sets it based on:
 * 1. Their first transaction date
 * 2. Their first activity date
 * 3. Or a specified date
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const DailyRewardProgress = require('./models/DailyRewardProgress');

async function fixUserCreatedAt(userId, manualDate = null) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const user = await User.findById(userId);
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log(`📊 User: ${user.email || user._id}`);
    console.log(`   Current createdAt: ${user.createdAt || 'NULL'}`);

    if (user.createdAt) {
      console.log('   ✅ User already has createdAt field');
      await mongoose.disconnect();
      return;
    }

    let estimatedJoinDate = null;

    // Option 1: Use manual date if provided
    if (manualDate) {
      estimatedJoinDate = new Date(manualDate);
      console.log(`\n📅 Using manual date: ${estimatedJoinDate.toISOString()}`);
    }
    // Option 2: Find first transaction
    else {
      const firstTransaction = await Transaction.findOne({ user: userId })
        .sort({ createdAt: 1 })
        .select('createdAt description');

      if (firstTransaction && firstTransaction.createdAt) {
        estimatedJoinDate = firstTransaction.createdAt;
        console.log(`\n📅 Found first transaction:`);
        console.log(`   Date: ${firstTransaction.createdAt.toISOString()}`);
        console.log(`   Description: ${firstTransaction.description}`);
      }
    }

    // Option 3: Find first daily reward progress
    if (!estimatedJoinDate) {
      const firstProgress = await DailyRewardProgress.findOne({ userId })
        .sort({ weekStart: 1 })
        .select('weekStart weekKey');

      if (firstProgress && firstProgress.weekStart) {
        estimatedJoinDate = firstProgress.weekStart;
        console.log(`\n📅 Found first daily reward progress:`);
        console.log(`   Week: ${firstProgress.weekKey}`);
        console.log(`   Week Start: ${firstProgress.weekStart.toISOString()}`);
      }
    }

    // Option 4: Use updatedAt if available
    if (!estimatedJoinDate && user.updatedAt) {
      estimatedJoinDate = user.updatedAt;
      console.log(`\n📅 Using updatedAt as fallback:`);
      console.log(`   Date: ${user.updatedAt.toISOString()}`);
    }

    // Option 5: Use current date as last resort
    if (!estimatedJoinDate) {
      estimatedJoinDate = new Date();
      console.log(`\n⚠️ No historical data found, using current date:`);
      console.log(`   Date: ${estimatedJoinDate.toISOString()}`);
    }

    // Update user (skip validation to avoid issues with other fields)
    console.log(`\n🔧 Updating user...`);
    await User.updateOne(
      { _id: userId },
      { $set: { createdAt: estimatedJoinDate } }
    );

    console.log(`✅ Updated user createdAt to: ${estimatedJoinDate.toISOString()}`);
    console.log(`   Day of week: ${estimatedJoinDate.toLocaleDateString('en-US', { weekday: 'long' })}`);

    // Verify the update
    const updatedUser = await User.findById(userId).select('createdAt');
    if (updatedUser && updatedUser.createdAt) {
      console.log(`\n✅ Verified: ${updatedUser.createdAt.toISOString()}`);
    } else {
      console.log(`\n⚠️ Warning: Could not verify update`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get user ID from command line or use default
const userId = process.argv[2] || '6999e14f61f52e395e1531a4';
const manualDate = process.argv[3]; // Optional: '2026-02-24' or '2026-02-24T10:30:00Z'

console.log(`🔍 Fixing createdAt for user: ${userId}`);
if (manualDate) {
  console.log(`📅 Using manual date: ${manualDate}\n`);
}

fixUserCreatedAt(userId, manualDate);

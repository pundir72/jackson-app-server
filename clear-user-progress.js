/**
 * Clear user's daily reward progress to force recalculation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const DailyRewardProgress = require('./models/DailyRewardProgress');

async function clearProgress() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const userId = '6999e14f61f52e395e1531a4';

    // Find all progress documents for this user
    const progressDocs = await DailyRewardProgress.find({ userId });

    console.log(`📊 Found ${progressDocs.length} progress document(s) for user ${userId}:`);
    progressDocs.forEach(doc => {
      console.log(`   - ${doc.weekKey}: ${doc.weekStart.toISOString()} to ${doc.weekEnd.toISOString()}`);
    });

    if (progressDocs.length === 0) {
      console.log('\n✅ No progress documents to clear');
      await mongoose.disconnect();
      return;
    }

    // Delete all progress documents
    console.log(`\n🗑️  Deleting ${progressDocs.length} document(s)...`);
    const result = await DailyRewardProgress.deleteMany({ userId });
    console.log(`✅ Deleted ${result.deletedCount} document(s)`);

    console.log(`\n✅ User's daily reward progress has been cleared`);
    console.log(`   Next API call will create fresh progress based on new createdAt date`);

    await mongoose.disconnect();
    console.log('\n✅ Done');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

clearProgress();

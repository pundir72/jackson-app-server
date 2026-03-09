/**
 * Reset User to Fresh Verified State
 * 
 * This script resets a specific user (by email) to a fresh verified state
 * with all onboarding data cleared. The user will be like a newly registered
 * and verified user with no activity history.
 * 
 * Usage:
 *   node reset-user-to-fresh.js user@example.com
 * 
 * What gets reset:
 * - All game progress and history (including downloaded games via BatchClaim)
 * - All challenge completions (UserChallengeProgress)
 * - All transactions
 * - Wallet balance
 * - XP and levels
 * - Streaks and activity
 * - Surveys, tasks, rewards
 * - Survey progress (UserSurveyProgress)
 * - Step data for walkathon (StepData)
 * - Besitos user activities and conversions
 * - Everflow conversions (third-party offer tracking)
 * - Swipe undo logs
 * - User achievements
 * - AI chat sessions
 * - AppLovin rewarded ads
 * - Google Play purchases
 * - Payout requests
 * - VIP subscriptions
 * - Support tickets
 * - All related collections (DailyRewardProgress, SpinWheelLog, etc.)
 * - User.games array (clears all downloaded games from Besitos, Bitlabs, etc.)
 * 
 * What gets preserved:
 * - User account (email, password, name)
 * - Verified status (remains verified)
 * - Account creation date
 * - Wallet audit logs (for compliance)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

// Import all models
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const UserChallengeProgress = require('./models/UserChallengeProgress');
const DailyRewardProgress = require('./models/DailyRewardProgress');
const SpinWheelLog = require('./models/SpinWheelLog');
const UserSurveyProgress = require('./models/UserSurveyProgress');
const BatchClaim = require('./models/BatchClaim');
const StepData = require('./models/StepData');
const BesitosUserActivity = require('./models/BesitosUserActivity');
const SwipeUndoLog = require('./models/SwipeUndoLog');
const UserAchievement = require('./models/UserAchievement');
const WalletAuditLog = require('./models/WalletAuditLog');
const AIChat = require('./models/AIChat');
const AppLovinRewardedAd = require('./models/AppLovinRewardedAd');
const GooglePlayPurchase = require('./models/GooglePlayPurchase');
const PayoutRequest = require('./models/PayoutRequest');
const VIPSubscription = require('./models/VIPSubscription');
const Ticket = require('./models/Ticket');
const EverflowConversion = require('./models/EverflowConversion');

// Create readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask for confirmation
function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function resetUserToFresh(email) {
  try {
    console.log('🔄 Reset User to Fresh Verified State\n');
    console.log('='.repeat(70));
    
    // Connect to database
    console.log('📡 Connecting to database...');
    await mongoose.connect("mongodb://jacksonuat:HJKHYUHBE67HDNB@82.25.105.119:27017/jackson-uat?authSource=admin");
    console.log('✅ Connected to database\n');

    // Find user by email
    console.log(`🔍 Searching for user: ${email}`);
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      console.log('   Please check the email address and try again.');
      return;
    }

    console.log('✅ User found!');
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   User ID: ${user._id}`);
    console.log(`   Created: ${user.createdAt || 'N/A'}`);
    console.log(`   Verified: ${user.isVerified ? 'Yes' : 'No'}`);
    console.log('');

    // Show current user data summary
    console.log('📊 Current User Data Summary:');
    console.log('='.repeat(70));
    console.log(`   Wallet Balance: ${user.wallet?.balance || 0} coins`);
    console.log(`   XP: ${user.xp?.current || 0} (Level ${user.xp?.level || 1})`);
    console.log(`   Current Streak: ${user.streak?.current || 0} days`);
    console.log(`   Games Played: ${user.games?.length || 0}`);
    console.log(`   Surveys Completed: ${user.surveys?.filter(s => s.completed).length || 0}`);
    console.log(`   Tasks Completed: ${user.tasks?.filter(t => t.completed).length || 0}`);
    
    // Count related records
    const transactionCount = await Transaction.countDocuments({ user: user._id });
    const challengeProgressCount = await UserChallengeProgress.countDocuments({ userId: user._id });
    const dailyRewardCount = await DailyRewardProgress.countDocuments({ userId: user._id });
    const spinWheelCount = await SpinWheelLog.countDocuments({ user: user._id });
    const surveyProgressCount = await UserSurveyProgress.countDocuments({ userId: user._id });
    const batchClaimCount = await BatchClaim.countDocuments({ userId: user._id });
    const stepDataCount = await StepData.countDocuments({ userId: user._id });
    const besitosActivityCount = await BesitosUserActivity.countDocuments({ userId: user._id });
    const everflowConversionCount = await EverflowConversion.countDocuments({ userId: user._id });
    const swipeUndoCount = await SwipeUndoLog.countDocuments({ userId: user._id });
    const achievementCount = await UserAchievement.countDocuments({ user: user._id });
    const walletAuditCount = await WalletAuditLog.countDocuments({ targetUserId: user._id });
    const aiChatCount = await AIChat.countDocuments({ user: user._id });
    const appLovinAdCount = await AppLovinRewardedAd.countDocuments({ userId: user._id });
    const googlePlayCount = await GooglePlayPurchase.countDocuments({ userId: user._id });
    const payoutRequestCount = await PayoutRequest.countDocuments({ userId: user._id });
    const vipSubscriptionCount = await VIPSubscription.countDocuments({ userId: user._id });
    const ticketCount = await Ticket.countDocuments({ user: user._id });
    
    console.log(`   Transactions: ${transactionCount}`);
    console.log(`   Challenge Progress Records: ${challengeProgressCount}`);
    console.log(`   Daily Reward Records: ${dailyRewardCount}`);
    console.log(`   Spin Wheel Logs: ${spinWheelCount}`);
    console.log(`   Survey Progress: ${surveyProgressCount}`);
    console.log(`   Batch Claims (Downloaded Games): ${batchClaimCount}`);
    console.log(`   Step Data (Walkathon): ${stepDataCount}`);
    console.log(`   Besitos Activities: ${besitosActivityCount}`);
    console.log(`   Everflow Conversions: ${everflowConversionCount}`);
    console.log(`   Swipe Undo Logs: ${swipeUndoCount}`);
    console.log(`   User Achievements: ${achievementCount}`);
    console.log(`   Wallet Audit Logs: ${walletAuditCount}`);
    console.log(`   AI Chat Sessions: ${aiChatCount}`);
    console.log(`   AppLovin Rewarded Ads: ${appLovinAdCount}`);
    console.log(`   Google Play Purchases: ${googlePlayCount}`);
    console.log(`   Payout Requests: ${payoutRequestCount}`);
    console.log(`   VIP Subscriptions: ${vipSubscriptionCount}`);
    console.log(`   Support Tickets: ${ticketCount}`);
    console.log('');

    // Ask for confirmation
    console.log('⚠️  WARNING: This action will:');
    console.log('   1. Reset wallet balance to 0');
    console.log('   2. Reset XP to 0 (Level 1)');
    console.log('   3. Clear all game progress and history (including downloaded games)');
    console.log('   4. Clear all challenge completions');
    console.log('   5. Clear all streaks and activity');
    console.log('   6. Delete all transactions');
    console.log('   7. Delete all related progress records');
    console.log('   8. Clear surveys, tasks, and rewards');
    console.log('   9. Delete survey progress, batch claims, step data');
    console.log('   10. Delete Besitos activities, Everflow conversions');
    console.log('   11. Delete swipe undo logs, user achievements');
    console.log('   12. Delete AI chat sessions, AppLovin ads');
    console.log('   13. Delete Google Play purchases, payout requests');
    console.log('   14. Delete VIP subscriptions, support tickets');
    console.log('   15. Clear User.games array (all third-party downloaded games)');
    console.log('   16. Keep wallet audit logs for compliance');
    console.log('');
    console.log('✅ The user will remain VERIFIED and can login immediately.');
    console.log('');

    const confirmed = await askConfirmation('Are you sure you want to reset this user? (yes/no): ');
    
    if (!confirmed) {
      console.log('\n❌ Operation cancelled by user.');
      return;
    }

    console.log('\n🔄 Starting reset process...\n');

    // Step 1: Delete all related records
    console.log('📋 Step 1: Deleting related records');
    console.log('-'.repeat(70));
    
    const deleteTransactions = await Transaction.deleteMany({ user: user._id });
    console.log(`   ✅ Deleted ${deleteTransactions.deletedCount} transactions`);
    
    const deleteChallengeProgress = await UserChallengeProgress.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteChallengeProgress.deletedCount} challenge progress records`);
    
    const deleteDailyRewards = await DailyRewardProgress.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteDailyRewards.deletedCount} daily reward records`);
    
    const deleteSpinWheels = await SpinWheelLog.deleteMany({ user: user._id });
    console.log(`   ✅ Deleted ${deleteSpinWheels.deletedCount} spin wheel logs`);

    const deleteSurveyProgress = await UserSurveyProgress.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteSurveyProgress.deletedCount} survey progress records`);

    const deleteBatchClaims = await BatchClaim.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteBatchClaims.deletedCount} batch claims (downloaded games)`);

    const deleteStepData = await StepData.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteStepData.deletedCount} step data records`);

    const deleteBesitosActivity = await BesitosUserActivity.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteBesitosActivity.deletedCount} Besitos activity records`);

    const deleteEverflowConversions = await EverflowConversion.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteEverflowConversions.deletedCount} Everflow conversion records`);

    const deleteSwipeUndo = await SwipeUndoLog.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteSwipeUndo.deletedCount} swipe undo logs`);

    const deleteAchievements = await UserAchievement.deleteMany({ user: user._id });
    console.log(`   ✅ Deleted ${deleteAchievements.deletedCount} user achievements`);

    const deleteAIChats = await AIChat.deleteMany({ user: user._id });
    console.log(`   ✅ Deleted ${deleteAIChats.deletedCount} AI chat sessions`);

    const deleteAppLovinAds = await AppLovinRewardedAd.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteAppLovinAds.deletedCount} AppLovin rewarded ads`);

    const deleteGooglePlay = await GooglePlayPurchase.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteGooglePlay.deletedCount} Google Play purchases`);

    const deletePayoutRequests = await PayoutRequest.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deletePayoutRequests.deletedCount} payout requests`);

    const deleteVIPSubscriptions = await VIPSubscription.deleteMany({ userId: user._id });
    console.log(`   ✅ Deleted ${deleteVIPSubscriptions.deletedCount} VIP subscriptions`);

    const deleteTickets = await Ticket.deleteMany({ user: user._id });
    console.log(`   ✅ Deleted ${deleteTickets.deletedCount} support tickets`);

    // Note: WalletAuditLog is kept for compliance and audit trail
    console.log(`   ℹ️  Kept ${walletAuditCount} wallet audit logs for compliance`);

    // Try to delete from other collections if they exist
    try {
      if (mongoose.models.UserWalkathonProgress) {
        const UserWalkathonProgress = mongoose.model('UserWalkathonProgress');
        const deleteWalkathon = await UserWalkathonProgress.deleteMany({ userId: user._id });
        console.log(`   ✅ Deleted ${deleteWalkathon.deletedCount} walkathon progress records`);
      }
    } catch (err) {
      // Model doesn't exist, skip
    }

    try {
      if (mongoose.models.BesitosConversion) {
        const BesitosConversion = mongoose.model('BesitosConversion');
        const deleteConversions = await BesitosConversion.deleteMany({ userId: user._id });
        console.log(`   ✅ Deleted ${deleteConversions.deletedCount} conversion records`);
      }
    } catch (err) {
      // Model doesn't exist, skip
    }

    // Step 2: Reset user data
    console.log('\n📋 Step 2: Resetting user data');
    console.log('-'.repeat(70));

    // Reset wallet
    user.wallet = {
      balance: 0,
      lastUpdated: new Date(),
      transactions: []
    };
    console.log('   ✅ Reset wallet balance to 0');

    // Reset XP
    user.xp = {
      current: 0,
      total: 0,
      level: 1,
      lastUpdated: new Date()
    };
    console.log('   ✅ Reset XP to 0 (Level 1)');

    // Reset streak
    user.streak = {
      current: 0,
      completedTasks: [],
      lastUpdated: null,
      resetAt: null,
      resetReason: null,
      missedDays: 0
    };
    console.log('   ✅ Reset streak to 0');

    // Reset daily activity
    user.dailyActivity = {
      currentStreak: 0,
      lastActiveDate: null,
      totalActiveDays: 0,
      activeDates: [],
      longestStreak: 0,
      streakHistory: [],
      lastStreakReset: null,
      resetReason: null,
      awardedMilestones: []
    };
    console.log('   ✅ Reset daily activity');

    // Clear games
    user.games = [];
    console.log('   ✅ Cleared game history (including all third-party downloaded games from Besitos, Bitlabs, etc.)');

    // Clear surveys
    user.surveys = [];
    console.log('   ✅ Cleared survey history');

    // Clear tasks
    user.tasks = [];
    console.log('   ✅ Cleared task history');

    // Clear races
    user.races = [];
    console.log('   ✅ Cleared race history');

    // Clear badges and titles
    user.badges = [];
    user.titles = [];
    console.log('   ✅ Cleared badges and titles');

    // Reset referrals
    if (user.referrals) {
      user.referrals = {
        referralCode: user.referrals.referralCode, // Keep referral code
        referredBy: user.referrals.referredBy, // Keep who referred them
        referredUsers: [],
        totalReferrals: 0,
        earnings: {
          coins: 0,
          xp: 0
        }
      };
      console.log('   ✅ Reset referral earnings (kept referral code)');
    }

    // Reset achievements
    if (user.achievements) {
      user.achievements = [];
      console.log('   ✅ Cleared achievements');
    }

    // Reset milestones
    user.milestone_gamesPlayed_claimed = false;
    user.milestone_coinsEarned_claimed = false;
    user.milestone_challengesCompleted_claimed = false;
    console.log('   ✅ Reset milestone claims');

    // Reset continuous progress
    if (user.continuousProgress) {
      user.continuousProgress = {
        gamesPlayed: 0,
        challengesCompleted: 0,
        lastGamesReset: null,
        lastChallengesReset: null
      };
      console.log('   ✅ Reset continuous progress');
    }

    // Reset task progression
    if (user.taskProgression) {
      user.taskProgression = new Map();
      console.log('   ✅ Cleared task progression');
    }

    // Reset booster rewards
    if (user.boosterRewards) {
      user.boosterRewards = {
        lastClaimed: null,
        claimCount: 0,
        totalEarned: 0
      };
      console.log('   ✅ Reset booster rewards');
    }

    // Reset cash coach
    if (user.cashCoach) {
      user.cashCoach = {
        isActive: false,
        currentGoal: null,
        taskProgress: {
          steps: [],
          currentStep: 0,
          completedSteps: 0
        }
      };
      console.log('   ✅ Reset cash coach');
    }

    // Keep user verified
    user.isVerified = true;
    
    // Keep profile status active
    if (user.profile) {
      user.profile.status = 'active';
    }

    // Save the reset user
    await user.save();
    console.log('\n✅ User data saved successfully!');

    // Step 3: Verify reset
    console.log('\n📋 Step 3: Verifying reset');
    console.log('-'.repeat(70));
    
    const verifyUser = await User.findById(user._id);
    const verifyTransactions = await Transaction.countDocuments({ user: user._id });
    const verifyChallenges = await UserChallengeProgress.countDocuments({ userId: user._id });
    
    console.log(`   Wallet Balance: ${verifyUser.wallet?.balance || 0} (Expected: 0) ${verifyUser.wallet?.balance === 0 ? '✅' : '❌'}`);
    console.log(`   XP: ${verifyUser.xp?.current || 0} (Expected: 0) ${verifyUser.xp?.current === 0 ? '✅' : '❌'}`);
    console.log(`   Streak: ${verifyUser.streak?.current || 0} (Expected: 0) ${verifyUser.streak?.current === 0 ? '✅' : '❌'}`);
    console.log(`   Games: ${verifyUser.games?.length || 0} (Expected: 0) ${verifyUser.games?.length === 0 ? '✅' : '❌'}`);
    console.log(`   Transactions: ${verifyTransactions} (Expected: 0) ${verifyTransactions === 0 ? '✅' : '❌'}`);
    console.log(`   Challenge Progress: ${verifyChallenges} (Expected: 0) ${verifyChallenges === 0 ? '✅' : '❌'}`);
    console.log(`   Verified Status: ${verifyUser.isVerified ? 'Yes' : 'No'} (Expected: Yes) ${verifyUser.isVerified ? '✅' : '❌'}`);

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('🎉 USER RESET COMPLETE!');
    console.log('='.repeat(70));
    console.log(`\n✅ User "${verifyUser.email}" has been reset to fresh verified state.`);
    console.log('\nUser can now:');
    console.log('   • Login with existing credentials');
    console.log('   • Start fresh with all onboarding');
    console.log('   • Complete daily challenges from Day 1');
    console.log('   • Earn rewards and XP from scratch');
    console.log('\nUser Details:');
    console.log(`   Email: ${verifyUser.email}`);
    console.log(`   Name: ${verifyUser.firstName} ${verifyUser.lastName}`);
    console.log(`   User ID: ${verifyUser._id}`);
    console.log(`   Verified: ${verifyUser.isVerified ? 'Yes' : 'No'}`);
    console.log(`   Status: ${verifyUser.profile?.status || 'active'}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Error during reset:', error);
    console.error('\nStack trace:', error.stack);
  } finally {
    rl.close();
    await mongoose.connection.close();
    console.log('✅ Database connection closed\n');
  }
}

// Main execution
const email = process.argv[2];

if (!email) {
  console.log('❌ Error: Email address is required\n');
  console.log('Usage:');
  console.log('   node reset-user-to-fresh.js user@example.com\n');
  console.log('Example:');
  console.log('   node reset-user-to-fresh.js john.doe@example.com\n');
  process.exit(1);
}

// Run the reset
resetUserToFresh(email).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

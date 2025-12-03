const User = require('../models/User');

/**
 * Middleware to reset daily progress tracking for My Account Overview
 * This should be called daily to reset milestone claims and progress tracking
 */
async function resetDailyProgress() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Reset milestone claims for all users
    await User.updateMany(
      {
        $or: [
          { lastProgressReset: { $lt: today } },
          { lastProgressReset: { $exists: false } }
        ]
      },
      {
        $set: {
          milestone_gamesPlayed_claimed: false,
          milestone_coinsEarned_claimed: false,
          milestone_challengesCompleted_claimed: false,
          lastProgressReset: today
        }
      }
    );
    
    console.log('Daily progress reset completed for all users');
  } catch (error) {
    console.error('Error resetting daily progress:', error);
  }
}

/**
 * Middleware to check and reset progress for a specific user
 * This can be called when a user accesses their account overview
 */
async function checkUserProgressReset(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if progress needs to be reset for this user
    if (!user.lastProgressReset || user.lastProgressReset < today) {
      user.milestone_gamesPlayed_claimed = false;
      user.milestone_coinsEarned_claimed = false;
      user.milestone_challengesCompleted_claimed = false;
      user.lastProgressReset = today;
      
      await user.save();
      console.log(`Progress reset completed for user ${userId}`);
    }
  } catch (error) {
    console.error('Error checking user progress reset:', error);
  }
}

/**
 * Express middleware to automatically check progress reset
 */
function progressResetMiddleware() {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.userId) {
        await checkUserProgressReset(req.user.userId);
      }
      next();
    } catch (error) {
      console.error('Error in progress reset middleware:', error);
      next(); // Continue even if reset fails
    }
  };
}

module.exports = {
  resetDailyProgress,
  checkUserProgressReset,
  progressResetMiddleware
};

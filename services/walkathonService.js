/**
 * Walkathon Service
 * Business logic for walkathon operations
 * @module services/walkathonService
 */

const Walkathon = require('../models/Walkathon');
const UserWalkathonProgress = require('../models/UserWalkathonProgress');
const StepData = require('../models/StepData');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Leaderboard = require('../models/Leaderboard');
const { 
  getISOWeekKey, 
  getWeekBounds, 
  getDefaultRewardTiers, 
  getDefaultEligibility,
  validateSteps,
  canUserJoinWalkathon,
  generateWalkathonStats,
  getTimeRemaining
} = require('../utils/walkathonHelpers');

/**
 * Get current active walkathon
 * @returns {Promise<Object>} Current walkathon or null
 */
async function getCurrentWalkathon() {
  try {
    return await Walkathon.getCurrentWalkathon();
  } catch (error) {
    console.error('Error getting current walkathon:', error);
    throw error;
  }
}

/**
 * Get upcoming walkathon
 * @returns {Promise<Object>} Upcoming walkathon or null
 */
async function getUpcomingWalkathon() {
  try {
    return await Walkathon.getUpcomingWalkathon();
  } catch (error) {
    console.error('Error getting upcoming walkathon:', error);
    throw error;
  }
}

/**
 * Check user eligibility for walkathon
 * @param {string} userId - User ID
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @returns {Promise<Object>} Eligibility result
 */
async function checkUserEligibility(userId, weekKey = null) {
  try {
    const user = await User.findById(userId).select('xp age location');
    if (!user) {
      return {
        isEligible: false,
        reason: 'User not found'
      };
    }

    const walkathon = weekKey 
      ? await Walkathon.getWalkathonByWeekKey(weekKey)
      : await getCurrentWalkathon();

    if (!walkathon) {
      return {
        isEligible: false,
        reason: 'No active walkathon found'
      };
    }

    return walkathon.checkEligibility(user);
  } catch (error) {
    console.error('Error checking user eligibility:', error);
    throw error;
  }
}

/**
 * Join user to walkathon
 * @param {string} userId - User ID
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @returns {Promise<Object>} Join result
 */
async function joinWalkathon(userId, weekKey = null) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const walkathon = weekKey 
      ? await Walkathon.getWalkathonByWeekKey(weekKey)
      : await getCurrentWalkathon();

    if (!walkathon) {
      throw new Error('No active walkathon found');
    }

    // Check if user can join
    const canJoin = canUserJoinWalkathon(user, walkathon);
    if (!canJoin.canJoin) {
      throw new Error(canJoin.reason);
    }

    // Check if user already joined
    const existingProgress = await UserWalkathonProgress.findOne({ userId, weekKey: walkathon.weekKey });
    if (existingProgress) {
      throw new Error('User has already joined this walkathon');
    }

    // Create user progress record
    const progress = new UserWalkathonProgress({
      userId,
      walkathonId: walkathon._id,
      weekKey: walkathon.weekKey,
      status: 'active',
      deviceInfo: {
        platform: 'ios', // Default for now
        appVersion: '1.0.0'
      }
    });

    await progress.save();

    // Update walkathon participant count
    await Walkathon.findByIdAndUpdate(walkathon._id, {
      $inc: { totalParticipants: 1 }
    });

    return {
      success: true,
      message: 'Successfully joined walkathon',
      progress: progress.getProgressData()
    };
  } catch (error) {
    console.error('Error joining walkathon:', error);
    throw error;
  }
}

/**
 * Sync step data for user
 * @param {string} userId - User ID
 * @param {number} steps - Step count
 * @param {Date} date - Date for steps
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Sync result
 */
async function syncStepData(userId, steps, date, options = {}) {
  try {
    // Validate step data
    const validation = validateSteps(steps);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const stepDate = new Date(date);
    stepDate.setHours(0, 0, 0, 0);

    // Get current walkathon
    const walkathon = await getCurrentWalkathon();
    if (!walkathon) {
      throw new Error('No active walkathon found');
    }

    // Get or create user progress
    let progress = await UserWalkathonProgress.getUserProgress(userId, walkathon.weekKey);
    if (!progress) {
      throw new Error('User has not joined the current walkathon');
    }

    // Update step data
    await StepData.findOneAndUpdate(
      { userId, date: stepDate },
      {
        steps,
        source: options.source || 'healthkit',
        syncedAt: new Date(),
        deviceInfo: options.deviceInfo || {},
        healthKitData: options.healthKitData || {},
        isValidated: true
      },
      { upsert: true }
    );

    // Update progress
    progress.updateSteps(steps, stepDate, options.source || 'healthkit');
    
    // Check for new milestones
    const newMilestones = progress.checkMilestones();
    
    await progress.save();

    // Update walkathon total steps
    await Walkathon.findByIdAndUpdate(walkathon._id, {
      $inc: { totalSteps: steps }
    });

    return {
      success: true,
      message: 'Steps synced successfully',
      newMilestones,
      progress: progress.getProgressData()
    };
  } catch (error) {
    console.error('Error syncing step data:', error);
    throw error;
  }
}

/**
 * Get user's walkathon progress
 * @param {string} userId - User ID
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @returns {Promise<Object>} Progress data
 */
async function getUserProgress(userId, weekKey = null) {
  try {
    // If no weekKey provided, find the current active walkathon
    let currentWeekKey = weekKey;
    if (!currentWeekKey) {
      const activeWalkathon = await getCurrentWalkathon();
      if (!activeWalkathon) {
        return {
          hasProgress: false,
          message: 'No active walkathon found'
        };
      }
      currentWeekKey = activeWalkathon.weekKey;
    }
    
    const progress = await UserWalkathonProgress.getUserProgress(userId, currentWeekKey);
    
    if (!progress) {
      return {
        hasProgress: false,
        message: 'User has not joined this walkathon'
      };
    }

    const walkathon = progress.walkathonId;
    const timeRemaining = getTimeRemaining(walkathon.weekEnd);
    const userRank = await UserWalkathonProgress.getUserRank(userId, currentWeekKey);

    return {
      hasProgress: true,
      walkathon: walkathon.getDisplayData(),
      progress: progress.getProgressData(),
      timeRemaining,
      userRank,
      availableRewards: progress.getAvailableRewards()
    };
  } catch (error) {
    console.error('Error getting user progress:', error);
    throw error;
  }
}

/**
 * Claim reward for milestone
 * @param {string} userId - User ID
 * @param {number} milestone - Milestone step count
 * @returns {Promise<Object>} Claim result
 */
async function claimReward(userId, milestone) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Find the current active walkathon to get the correct week key
    const activeWalkathon = await getCurrentWalkathon();
    if (!activeWalkathon) {
      throw new Error('No active walkathon found');
    }
    
    const progress = await UserWalkathonProgress.getUserProgress(userId, activeWalkathon.weekKey);
    
    if (!progress) {
      throw new Error('User has not joined the current walkathon');
    }

    // Claim reward
    const reward = progress.claimReward(milestone);
    
    // Update user's XP (apply tier multiplier)
    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      reward.xpEarned || 0
    );
    user.xp.current = (user.xp.current || 0) + finalXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
    
    // Create transaction record
    const transaction = new Transaction({
      user: userId,
      type: 'credit',
      amount: reward.coinEarned,
      description: `Walkathon Reward - ${milestone} steps milestone`,
      status: 'completed',
      metadata: {
        walkathonId: progress.walkathonId,
        weekKey: activeWalkathon.weekKey,
        milestone: milestone,
        xpEarned: reward.xpEarned,
        source: 'walkathon'
      },
      referenceId: `WALKATHON-${progress.walkathonId}-${milestone}-${Date.now()}`
    });

    await transaction.save();
    
    // Update progress with transaction ID
    const rewardClaim = progress.rewardsClaimed.find(claim => claim.milestone === milestone);
    if (rewardClaim) {
      rewardClaim.transactionId = transaction._id;
    }
    
    await progress.save();
    await user.save();

    // Update walkathon stats
    await Walkathon.findByIdAndUpdate(progress.walkathonId, {
      $inc: { totalRewardsClaimed: 1 }
    });

    return {
      success: true,
      message: 'Reward claimed successfully',
      reward,
      transaction: transaction._id
    };
  } catch (error) {
    console.error('Error claiming reward:', error);
    throw error;
  }
}

/**
 * Get walkathon leaderboard
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @param {number} limit - Number of entries to return
 * @returns {Promise<Object>} Leaderboard data
 */
async function getWalkathonLeaderboard(weekKey = null, limit = 100) {
  try {
    // If no weekKey provided, find the current active walkathon
    let currentWeekKey = weekKey;
    if (!currentWeekKey) {
      const activeWalkathon = await getCurrentWalkathon();
      if (!activeWalkathon) {
        return {
          weekKey: null,
          leaderboard: [],
          totalParticipants: 0
        };
      }
      currentWeekKey = activeWalkathon.weekKey;
    }
    
    const leaderboard = await UserWalkathonProgress.getWeeklyLeaderboard(currentWeekKey, limit);
    
    // Add rank information
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      userId: entry.userId._id,
      displayName: entry.userId.firstName || 'Anonymous',
      avatar: entry.userId.profile?.avatar,
      totalSteps: entry.totalStepsCompleted,
      xpLevel: entry.userId.xp?.current || 0,
      vipLevel: entry.userId.vip?.level || 'free',
      badges: entry.userId.badges || []
    }));

    return {
      weekKey: currentWeekKey,
      leaderboard: rankedLeaderboard,
      totalParticipants: leaderboard.length
    };
  } catch (error) {
    console.error('Error getting walkathon leaderboard:', error);
    throw error;
  }
}

/**
 * Get user's rank in walkathon
 * @param {string} userId - User ID
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @returns {Promise<Object>} User rank data
 */
async function getUserRank(userId, weekKey = null) {
  try {
    // If no weekKey provided, find the current active walkathon
    let currentWeekKey = weekKey;
    if (!currentWeekKey) {
      const activeWalkathon = await getCurrentWalkathon();
      if (!activeWalkathon) {
        return null;
      }
      currentWeekKey = activeWalkathon.weekKey;
    }
    
    return await UserWalkathonProgress.getUserRank(userId, currentWeekKey);
  } catch (error) {
    console.error('Error getting user rank:', error);
    throw error;
  }
}

/**
 * Create new walkathon for next week
 * @param {Object} config - Walkathon configuration
 * @returns {Promise<Object>} Created walkathon
 */
async function createNextWeekWalkathon(config = {}) {
  try {
    const nextWeekKey = getISOWeekKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const { weekStart, weekEnd } = getWeekBounds(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const walkathon = new Walkathon({
      weekKey: nextWeekKey,
      weekStart,
      weekEnd,
      title: config.title || 'Weekly Walkathon Challenge',
      description: config.description || 'Complete daily step goals to earn XP rewards!',
      rewardTiers: config.rewardTiers || getDefaultRewardTiers(),
      eligibility: config.eligibility || getDefaultEligibility(),
      status: 'upcoming',
      createdBy: config.createdBy || null
    });

    await walkathon.save();
    return walkathon;
  } catch (error) {
    console.error('Error creating next week walkathon:', error);
    throw error;
  }
}

/**
 * Reset weekly walkathon (called by cron job)
 * @returns {Promise<Object>} Reset result
 */
async function resetWeeklyWalkathon() {
  try {
    const currentWeekKey = getISOWeekKey();
    const nextWeekKey = getISOWeekKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    // Mark current week as completed
    await Walkathon.updateMany(
      { weekKey: currentWeekKey, status: 'active' },
      { status: 'completed' }
    );

    // Mark user progress as expired
    await UserWalkathonProgress.updateMany(
      { weekKey: currentWeekKey, status: 'active' },
      { status: 'expired' }
    );

    // Create next week's walkathon if it doesn't exist
    const existingNextWeek = await Walkathon.findOne({ weekKey: nextWeekKey });
    if (!existingNextWeek) {
      await createNextWeekWalkathon();
    }

    // Update step-based leaderboard
    await updateStepLeaderboard();

    return {
      success: true,
      message: 'Weekly walkathon reset completed',
      currentWeek: currentWeekKey,
      nextWeek: nextWeekKey
    };
  } catch (error) {
    console.error('Error resetting weekly walkathon:', error);
    throw error;
  }
}

/**
 * Update step-based leaderboard
 * @returns {Promise<Object>} Update result
 */
async function updateStepLeaderboard() {
  try {
    const currentWeekKey = getISOWeekKey();
    const { weekStart, weekEnd } = getWeekBounds();

    // Get step leaderboard data
    const stepLeaderboard = await StepData.getWeeklyLeaderboard(weekStart, weekEnd, 100);

    // Update leaderboard
    await Leaderboard.updateLeaderboard('steps', 'weekly', stepLeaderboard);

    return {
      success: true,
      message: 'Step leaderboard updated',
      entries: stepLeaderboard.length
    };
  } catch (error) {
    console.error('Error updating step leaderboard:', error);
    throw error;
  }
}

/**
 * Get walkathon statistics
 * @param {string} weekKey - Week key (optional, defaults to current week)
 * @returns {Promise<Object>} Statistics data
 */
async function getWalkathonStats(weekKey = null) {
  try {
    const currentWeekKey = weekKey || getISOWeekKey();
    const walkathon = await Walkathon.getWalkathonByWeekKey(currentWeekKey);
    
    if (!walkathon) {
      return {
        hasStats: false,
        message: 'No walkathon found for this week'
      };
    }

    const participants = await UserWalkathonProgress.find({ weekKey: currentWeekKey })
      .populate('userId', 'firstName lastName');

    const stats = generateWalkathonStats(participants);

    return {
      hasStats: true,
      walkathon: walkathon.getDisplayData(),
      statistics: stats
    };
  } catch (error) {
    console.error('Error getting walkathon stats:', error);
    throw error;
  }
}

module.exports = {
  getCurrentWalkathon,
  getUpcomingWalkathon,
  checkUserEligibility,
  joinWalkathon,
  syncStepData,
  getUserProgress,
  claimReward,
  getWalkathonLeaderboard,
  getUserRank,
  createNextWeekWalkathon,
  resetWeeklyWalkathon,
  updateStepLeaderboard,
  getWalkathonStats
};


/**
 * User Challenge Progress Model
 * Tracks individual user progress on daily challenges
 * @module models/UserChallengeProgress
 */

const mongoose = require('mongoose');

const userChallengeProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  challengeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DailyChallenge',
    required: true,
    index: true
  },
  challengeDate: {
    type: Date,
    required: true,
    index: true
  },
  // User's selected game (if challenge allows selection)
  selectedGame: {
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game'
    },
    selectedAt: Date
  },
  // Progress tracking
  status: {
    type: String,
    enum: ['not_started', 'viewed', 'game_selected', 'started', 'in_progress', 'completed', 'failed', 'expired'],
    default: 'not_started',
    index: true
  },
  // Timestamps
  viewedAt: Date,
  startedAt: Date,
  completedAt: Date,
  expiredAt: Date,
  // Rewards
  rewardsEarned: {
    coins: {
      type: Number,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    },
    bonusCoins: {
      type: Number,
      default: 0
    },
    bonusXP: {
      type: Number,
      default: 0
    }
  },
  rewardsClaimed: {
    type: Boolean,
    default: false
  },
  rewardsClaimedAt: Date,
  // SDK task tracking
  sdkTaskProgress: {
    taskStarted: {
      type: Boolean,
      default: false
    },
    taskCompleted: {
      type: Boolean,
      default: false
    },
    externalTaskId: String,
    conversionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BesitosConversion'
    }
  },
  // Challenge-specific data
  progress: {
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    currentStep: {
      type: Number,
      default: 0
    },
    totalSteps: {
      type: Number,
      default: 1
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  // Error tracking
  errors: [{
    message: String,
    code: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Metadata
  metadata: {
    deviceType: String,
    platform: String,
    appVersion: String,
    ip: String,
    location: {
      country: String,
      city: String
    }
  }
}, {
  timestamps: true
});

// Compound indexes for performance
userChallengeProgressSchema.index({ userId: 1, challengeDate: 1 }, { unique: true });
userChallengeProgressSchema.index({ userId: 1, status: 1 });
userChallengeProgressSchema.index({ challengeId: 1, status: 1 });
userChallengeProgressSchema.index({ userId: 1, createdAt: -1 });
userChallengeProgressSchema.index({ challengeDate: -1, status: 1 });

// Virtual for time remaining
userChallengeProgressSchema.virtual('timeRemaining').get(function() {
  if (this.status === 'completed' || this.status === 'expired') {
    return 0;
  }
  
  // Calculate time until end of challenge date (midnight)
  const endOfDay = new Date(this.challengeDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const now = new Date();
  const remaining = endOfDay - now;
  
  return Math.max(0, remaining);
});

// Methods

/**
 * Mark challenge as viewed
 */
userChallengeProgressSchema.methods.markViewed = async function() {
  if (this.status === 'not_started') {
    this.status = 'viewed';
    this.viewedAt = new Date();
    return await this.save();
  }
  return this;
};

/**
 * Select a game for the challenge
 */
userChallengeProgressSchema.methods.selectGame = async function(gameId) {
  this.selectedGame = {
    gameId,
    selectedAt: new Date()
  };
  this.status = 'game_selected';
  return await this.save();
};

/**
 * Mark challenge as started
 */
userChallengeProgressSchema.methods.markStarted = async function() {
  if (['viewed', 'game_selected'].includes(this.status)) {
    this.status = 'started';
    this.startedAt = new Date();
    return await this.save();
  }
  return this;
};

/**
 * Update progress
 */
userChallengeProgressSchema.methods.updateProgress = async function(percentage, currentStep = null) {
  this.progress.percentage = Math.min(100, Math.max(0, percentage));
  if (currentStep !== null) {
    this.progress.currentStep = currentStep;
  }
  
  if (this.status === 'started' && this.progress.percentage > 0) {
    this.status = 'in_progress';
  }
  
  return await this.save();
};

/**
 * Mark challenge as completed
 */
userChallengeProgressSchema.methods.markCompleted = async function(rewardsData = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.progress.percentage = 100;
  
  if (rewardsData.coins !== undefined) {
    this.rewardsEarned.coins = rewardsData.coins;
  }
  if (rewardsData.xp !== undefined) {
    this.rewardsEarned.xp = rewardsData.xp;
  }
  if (rewardsData.bonusCoins !== undefined) {
    this.rewardsEarned.bonusCoins = rewardsData.bonusCoins;
  }
  if (rewardsData.bonusXP !== undefined) {
    this.rewardsEarned.bonusXP = rewardsData.bonusXP;
  }
  
  return await this.save();
};

/**
 * Claim rewards
 */
userChallengeProgressSchema.methods.claimRewards = async function() {
  if (this.status === 'completed' && !this.rewardsClaimed) {
    this.rewardsClaimed = true;
    this.rewardsClaimedAt = new Date();
    return await this.save();
  }
  return this;
};

/**
 * Mark as failed
 */
userChallengeProgressSchema.methods.markFailed = async function(errorMessage) {
  this.status = 'failed';
  if (errorMessage) {
    this.errors.push({
      message: errorMessage,
      code: 'CHALLENGE_FAILED',
      timestamp: new Date()
    });
  }
  return await this.save();
};

/**
 * Mark as expired
 */
userChallengeProgressSchema.methods.markExpired = async function() {
  if (this.status !== 'completed') {
    this.status = 'expired';
    this.expiredAt = new Date();
    return await this.save();
  }
  return this;
};

// Statics

/**
 * Get user's challenge for a specific date
 */
userChallengeProgressSchema.statics.getUserChallengeForDate = async function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  return await this.findOne({
    userId,
    challengeDate: startOfDay
  }).populate('challengeId').populate('selectedGame.gameId');
};

/**
 * Get user's challenge history
 */
userChallengeProgressSchema.statics.getUserHistory = async function(userId, limit = 30) {
  return await this.find({ userId })
    .sort({ challengeDate: -1 })
    .limit(limit)
    .populate('challengeId', 'title type coinReward xpReward')
    .populate('selectedGame.gameId', 'title metadata.iconUrl');
};

/**
 * Get user's completion stats
 */
userChallengeProgressSchema.statics.getUserStats = async function(userId) {
  // Be tolerant to tokens that may carry userId as string or invalid format
  const matchUserId = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId; // fallback (in case schema was string in earlier data)

  const stats = await this.aggregate([
    { $match: { userId: matchUserId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalCoins: { $sum: '$rewardsEarned.coins' },
        totalXP: { $sum: '$rewardsEarned.xp' },
        totalBonusCoins: { $sum: '$rewardsEarned.bonusCoins' },
        totalBonusXP: { $sum: '$rewardsEarned.bonusXP' }
      }
    }
  ]);
  
  return stats;
};

/**
 * Create or get user's challenge for today
 */
userChallengeProgressSchema.statics.getOrCreateTodayChallenge = async function(userId, challengeId, challengeDate) {
  const startOfDay = new Date(challengeDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  let progress = await this.findOne({
    userId,
    challengeDate: startOfDay
  });
  
  if (!progress) {
    progress = await this.create({
      userId,
      challengeId,
      challengeDate: startOfDay,
      status: 'not_started'
    });
  }
  
  return progress;
};

/**
 * Get calendar view for user
 */
userChallengeProgressSchema.statics.getCalendarView = async function(userId, year, month) {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  
  return await this.find({
    userId,
    challengeDate: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ challengeDate: 1 }).populate('challengeId', 'title type coinReward xpReward');
};

/**
 * Expire old challenges
 */
userChallengeProgressSchema.statics.expireOldChallenges = async function() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(23, 59, 59, 999);
  
  const result = await this.updateMany(
    {
      challengeDate: { $lt: yesterday },
      status: { $in: ['not_started', 'viewed', 'game_selected', 'started', 'in_progress'] }
    },
    {
      $set: {
        status: 'expired',
        expiredAt: new Date()
      }
    }
  );
  
  return result;
};

const UserChallengeProgress = mongoose.model('UserChallengeProgress', userChallengeProgressSchema);

module.exports = UserChallengeProgress;


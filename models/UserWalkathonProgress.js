const mongoose = require('mongoose');

const rewardClaimSchema = new mongoose.Schema({
  milestone: {
    type: Number,
    required: true
  },
  xpEarned: {
    type: Number,
    required: true,
    min: 0
  },
  coinEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  claimedAt: {
    type: Date,
    default: Date.now
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }
}, { _id: false });

const dailyStepSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  steps: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  syncedAt: {
    type: Date,
    default: Date.now
  },
  source: {
    type: String,
    enum: ['healthkit', 'manual', 'imported'],
    default: 'healthkit'
  }
}, { _id: false });

const userWalkathonProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  walkathonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Walkathon',
    required: true,
    index: true
  },
  weekKey: {
    type: String,
    required: true,
    index: true
  },
  
  // Participation details
  joinedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['joined', 'active', 'completed', 'expired', 'withdrawn'],
    default: 'joined',
    index: true
  },
  
  // Progress tracking
  totalStepsCompleted: {
    type: Number,
    default: 0,
    min: 0
  },
  dailySteps: [dailyStepSchema],
  milestonesReached: [{
    type: Number
  }],
  rewardsClaimed: [rewardClaimSchema],
  
  // Statistics
  totalXPClaimed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCoinsClaimed: {
    type: Number,
    default: 0,
    min: 0
  },
  lastStepSync: {
    type: Date
  },
  
  // Completion tracking
  completedAt: {
    type: Date
  },
  withdrawnAt: {
    type: Date
  },
  
  // Metadata
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'ios'
    },
    appVersion: String,
    deviceId: String
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
userWalkathonProgressSchema.index({ userId: 1, weekKey: 1 }, { unique: true });
userWalkathonProgressSchema.index({ walkathonId: 1, status: 1 });
userWalkathonProgressSchema.index({ weekKey: 1, totalStepsCompleted: -1 });

// Virtual for current rank (will be calculated dynamically)
userWalkathonProgressSchema.virtual('currentRank').get(function() {
  // This will be populated by the service layer
  return this._currentRank;
});

// Virtual for progress percentage
userWalkathonProgressSchema.virtual('progressPercentage').get(function() {
  if (!this.populated('walkathonId')) return 0;
  
  const walkathon = this.walkathonId;
  if (!walkathon || !walkathon.rewardTiers || walkathon.rewardTiers.length === 0) return 0;
  
  const maxMilestone = Math.max(...walkathon.rewardTiers.map(tier => tier.stepMilestone));
  return Math.min(100, (this.totalStepsCompleted / maxMilestone) * 100);
});

// Static methods
userWalkathonProgressSchema.statics.getUserProgress = function(userId, weekKey) {
  return this.findOne({ userId, weekKey })
    .populate('walkathonId')
    .populate('rewardsClaimed.transactionId');
};

userWalkathonProgressSchema.statics.getWeeklyLeaderboard = function(weekKey, limit = 100) {
  return this.find({ weekKey, status: { $in: ['active', 'completed'] } })
    .populate('userId', 'firstName lastName profile.avatar badges xp.current vip.level')
    .sort({ totalStepsCompleted: -1 })
    .limit(limit);
};

userWalkathonProgressSchema.statics.getUserRank = async function(userId, weekKey) {
  const userProgress = await this.findOne({ userId, weekKey });
  if (!userProgress) return null;
  
  const rank = await this.countDocuments({
    weekKey,
    status: { $in: ['active', 'completed'] },
    totalStepsCompleted: { $gt: userProgress.totalStepsCompleted }
  });
  
  const totalParticipants = await this.countDocuments({
    weekKey,
    status: { $in: ['active', 'completed'] }
  });
  
  return {
    rank: rank + 1,
    totalParticipants,
    percentile: totalParticipants > 0 ? Math.round(((totalParticipants - rank) / totalParticipants) * 100) : 0
  };
};

// Instance methods
userWalkathonProgressSchema.methods.updateSteps = function(steps, date, source = 'healthkit') {
  const stepDate = new Date(date);
  stepDate.setHours(0, 0, 0, 0);
  
  // Find existing daily step entry
  const existingEntry = this.dailySteps.find(entry => 
    entry.date.getTime() === stepDate.getTime()
  );
  
  if (existingEntry) {
    existingEntry.steps = steps;
    existingEntry.syncedAt = new Date();
    existingEntry.source = source;
  } else {
    this.dailySteps.push({
      date: stepDate,
      steps: steps,
      syncedAt: new Date(),
      source: source
    });
  }
  
  // Update total steps
  this.totalStepsCompleted = this.dailySteps.reduce((total, entry) => total + entry.steps, 0);
  this.lastStepSync = new Date();
  
  return this;
};

userWalkathonProgressSchema.methods.checkMilestones = function() {
  if (!this.populated('walkathonId')) {
    throw new Error('Walkathon must be populated to check milestones');
  }
  
  const walkathon = this.walkathonId;
  const newMilestones = [];
  
  for (const tier of walkathon.rewardTiers) {
    if (this.totalStepsCompleted >= tier.stepMilestone && 
        !this.milestonesReached.includes(tier.stepMilestone)) {
      this.milestonesReached.push(tier.stepMilestone);
      newMilestones.push(tier);
    }
  }
  
  return newMilestones;
};

userWalkathonProgressSchema.methods.claimReward = function(milestone) {
  if (!this.populated('walkathonId')) {
    throw new Error('Walkathon must be populated to claim rewards');
  }
  
  const walkathon = this.walkathonId;
  const tier = walkathon.rewardTiers.find(t => t.stepMilestone === milestone);
  
  if (!tier) {
    throw new Error('Invalid milestone');
  }
  
  if (!this.milestonesReached.includes(milestone)) {
    throw new Error('Milestone not reached');
  }
  
  // Check if already claimed
  const alreadyClaimed = this.rewardsClaimed.some(claim => claim.milestone === milestone);
  if (alreadyClaimed) {
    throw new Error('Reward already claimed for this milestone');
  }
  
  // Add to claimed rewards
  this.rewardsClaimed.push({
    milestone: milestone,
    xpEarned: tier.xpReward,
    coinEarned: tier.coinReward,
    claimedAt: new Date()
  });
  
  // Update totals
  this.totalXPClaimed += tier.xpReward;
  this.totalCoinsClaimed += tier.coinReward;
  
  return {
    milestone: milestone,
    xpEarned: tier.xpReward,
    coinEarned: tier.coinReward
  };
};

userWalkathonProgressSchema.methods.getAvailableRewards = function() {
  if (!this.populated('walkathonId')) {
    throw new Error('Walkathon must be populated to get available rewards');
  }
  
  const walkathon = this.walkathonId;
  const claimedMilestones = this.rewardsClaimed.map(claim => claim.milestone);
  
  return walkathon.rewardTiers
    .filter(tier => 
      this.milestonesReached.includes(tier.stepMilestone) && 
      !claimedMilestones.includes(tier.stepMilestone)
    );
};

userWalkathonProgressSchema.methods.getProgressData = function() {
  if (!this.populated('walkathonId')) {
    throw new Error('Walkathon must be populated to get progress data');
  }
  
  const walkathon = this.walkathonId;
  const nextMilestone = walkathon.getNextMilestone(this.totalStepsCompleted);
  const availableRewards = this.getAvailableRewards();
  
  return {
    totalSteps: this.totalStepsCompleted,
    milestonesReached: this.milestonesReached,
    rewardsClaimed: this.rewardsClaimed,
    availableRewards: availableRewards,
    nextMilestone: nextMilestone,
    progressPercentage: this.progressPercentage,
    status: this.status,
    joinedAt: this.joinedAt,
    lastStepSync: this.lastStepSync
  };
};

userWalkathonProgressSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this;
};

userWalkathonProgressSchema.methods.markExpired = function() {
  this.status = 'expired';
  return this;
};

userWalkathonProgressSchema.methods.withdraw = function() {
  this.status = 'withdrawn';
  this.withdrawnAt = new Date();
  return this;
};

const UserWalkathonProgress = mongoose.model('UserWalkathonProgress', userWalkathonProgressSchema);

module.exports = UserWalkathonProgress;



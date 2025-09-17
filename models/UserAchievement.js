const mongoose = require('mongoose');

const userAchievementSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  achievement: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Achievement',
    required: true
  },
  achievementId: {
    type: String,
    required: true
  },
  progress: {
    current: {
      type: Number,
      default: 0
    },
    target: {
      type: Number,
      required: true
    },
    percentage: {
      type: Number,
      default: 0
    }
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'claimed'],
    default: 'in_progress'
  },
  completedAt: {
    type: Date
  },
  claimedAt: {
    type: Date
  },
  rewards: {
    coins: {
      type: Number,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    },
    badge: {
      type: String
    },
    title: {
      type: String
    }
  },
  metadata: {
    source: String,
    gameId: String,
    surveyId: String,
    raceId: String
  }
}, {
  timestamps: true
});

// Indexes
userAchievementSchema.index({ user: 1, achievement: 1 }, { unique: true });
userAchievementSchema.index({ user: 1, status: 1 });
userAchievementSchema.index({ achievementId: 1 });

// Instance methods
userAchievementSchema.methods.updateProgress = function(currentValue) {
  this.progress.current = currentValue;
  this.progress.percentage = Math.min((currentValue / this.progress.target) * 100, 100);
  
  if (currentValue >= this.progress.target && this.status === 'in_progress') {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  
  return this.save();
};

userAchievementSchema.methods.claimRewards = function() {
  if (this.status === 'completed') {
    this.status = 'claimed';
    this.claimedAt = new Date();
    return this.save();
  }
  throw new Error('Achievement not completed yet');
};

// Static methods
userAchievementSchema.statics.getUserAchievements = function(userId, status = null) {
  const query = { user: userId };
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('achievement')
    .sort({ createdAt: -1 });
};

userAchievementSchema.statics.getUserProgress = function(userId, achievementId) {
  return this.findOne({ user: userId, achievementId });
};

userAchievementSchema.statics.createUserAchievement = function(userId, achievement, currentValue = 0) {
  return this.create({
    user: userId,
    achievement: achievement._id,
    achievementId: achievement.achievementId,
    progress: {
      current: currentValue,
      target: achievement.requirements.value,
      percentage: Math.min((currentValue / achievement.requirements.value) * 100, 100)
    },
    rewards: achievement.rewards,
    status: currentValue >= achievement.requirements.value ? 'completed' : 'in_progress'
  });
};

module.exports = mongoose.model('UserAchievement', userAchievementSchema);

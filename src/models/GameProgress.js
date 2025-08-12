const mongoose = require('mongoose');

const gameProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true,
  },
  currentLevel: {
    type: Number,
    default: 1,
    min: 1,
  },
  maxLevel: {
    type: Number,
    default: 1,
    min: 1,
  },
  totalScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  highScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalPlays: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalTimeSpent: {
    type: Number,
    default: 0,
    min: 0,
    comment: 'Total time spent in seconds',
  },
  averageScore: {
    type: Number,
    default: 0,
    min: 0,
  },
  achievements: [{
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    unlockedAt: {
      type: Date,
      default: Date.now,
    },
    icon: {
      type: String,
    },
  }],
  stats: {
    gamesWon: {
      type: Number,
      default: 0,
      min: 0,
    },
    gamesLost: {
      type: Number,
      default: 0,
      min: 0,
    },
    winRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    averageTimePerGame: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  rewards: {
    totalPointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCashbackEarned: {
      type: Number,
      default: 0.00,
      min: 0,
    },
    pointsEarnedToday: {
      type: Number,
      default: 0,
      min: 0,
    },
    cashbackEarnedToday: {
      type: Number,
      default: 0.00,
      min: 0,
    },
    lastRewardDate: {
      type: Date,
    },
  },
  gameData: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Game-specific progress data',
  },
  settings: {
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'expert'],
      default: 'medium',
    },
    soundEnabled: {
      type: Boolean,
      default: true,
    },
    vibrationEnabled: {
      type: Boolean,
      default: true,
    },
    autoSave: {
      type: Boolean,
      default: true,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastPlayedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Compound index for unique user-game combination
gameProgressSchema.index({ userId: 1, gameId: 1 }, { unique: true });
gameProgressSchema.index({ userId: 1, isActive: 1 });
gameProgressSchema.index({ gameId: 1, totalScore: -1 });
gameProgressSchema.index({ lastPlayedAt: -1 });

// Instance methods
gameProgressSchema.methods.updateScore = function(score, timeSpent = 0) {
  this.totalScore += score;
  this.totalPlays += 1;
  this.totalTimeSpent += timeSpent;
  this.lastPlayedAt = new Date();
  
  // Update high score
  if (score > this.highScore) {
    this.highScore = score;
  }
  
  // Update average score
  this.averageScore = Math.round(this.totalScore / this.totalPlays);
  
  // Update win rate
  if (score > 0) {
    this.stats.gamesWon += 1;
  } else {
    this.stats.gamesLost += 1;
  }
  
  const totalGames = this.stats.gamesWon + this.stats.gamesLost;
  this.stats.winRate = totalGames > 0 ? this.stats.gamesWon / totalGames : 0;
  
  // Update average time per game
  this.stats.averageTimePerGame = Math.round(this.totalTimeSpent / this.totalPlays);
  
  return this.save();
};

gameProgressSchema.methods.addReward = function(points, cashback) {
  this.rewards.totalPointsEarned += points;
  this.rewards.totalCashbackEarned += parseFloat(cashback);
  this.rewards.pointsEarnedToday += points;
  this.rewards.cashbackEarnedToday += parseFloat(cashback);
  this.rewards.lastRewardDate = new Date();
  return this.save();
};

gameProgressSchema.methods.resetDailyRewards = function() {
  this.rewards.pointsEarnedToday = 0;
  this.rewards.cashbackEarnedToday = 0.00;
  return this.save();
};

gameProgressSchema.methods.unlockAchievement = function(achievement) {
  const existingAchievement = this.achievements.find(a => a.id === achievement.id);
  if (!existingAchievement) {
    this.achievements.push({
      ...achievement,
      unlockedAt: new Date(),
    });
  }
  return this.save();
};

gameProgressSchema.methods.updateLevel = function(newLevel) {
  if (newLevel > this.currentLevel) {
    this.currentLevel = newLevel;
    this.maxLevel = Math.max(this.maxLevel, newLevel);
  }
  return this.save();
};

gameProgressSchema.methods.completeGame = function() {
  this.isCompleted = true;
  this.completedAt = new Date();
  return this.save();
};

gameProgressSchema.methods.updateStreak = function(won) {
  if (won) {
    this.stats.currentStreak += 1;
    this.stats.longestStreak = Math.max(this.stats.longestStreak, this.stats.currentStreak);
  } else {
    this.stats.currentStreak = 0;
  }
  return this.save();
};

gameProgressSchema.methods.canEarnRewards = function(game) {
  const today = new Date().toDateString();
  const lastRewardDate = this.rewards.lastRewardDate ? 
    this.rewards.lastRewardDate.toDateString() : null;
  
  // Check daily limits
  if (game.maxPointsPerDay && this.rewards.pointsEarnedToday >= game.maxPointsPerDay) {
    return false;
  }
  
  if (game.maxCashbackPerDay && this.rewards.cashbackEarnedToday >= game.maxCashbackPerDay) {
    return false;
  }
  
  return true;
};

// Static methods
gameProgressSchema.statics.findByUserAndGame = function(userId, gameId) {
  return this.findOne({ userId, gameId });
};

gameProgressSchema.statics.findByUserId = function(userId) {
  return this.find({ userId, isActive: true }).populate('gameId');
};

gameProgressSchema.statics.findByGameId = function(gameId) {
  return this.find({ gameId, isActive: true }).populate('userId');
};

gameProgressSchema.statics.getLeaderboard = function(gameId, limit = 10) {
  return this.find({ gameId, isActive: true })
    .sort({ totalScore: -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName avatar');
};

gameProgressSchema.statics.getUserRank = function(userId, gameId) {
  return this.aggregate([
    { $match: { gameId: mongoose.Types.ObjectId(gameId), isActive: true } },
    { $sort: { totalScore: -1 } },
    { $group: { _id: null, rank: { $sum: 1 } } },
    { $match: { userId: mongoose.Types.ObjectId(userId) } }
  ]);
};

gameProgressSchema.statics.getTopPlayers = function(gameId, limit = 10) {
  return this.find({ gameId, isActive: true })
    .sort({ highScore: -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName avatar');
};

gameProgressSchema.statics.resetDailyRewards = function() {
  return this.updateMany(
    {},
    {
      $set: {
        'rewards.pointsEarnedToday': 0,
        'rewards.cashbackEarnedToday': 0.00,
      }
    }
  );
};

const GameProgress = mongoose.model('GameProgress', gameProgressSchema);

module.exports = GameProgress; 
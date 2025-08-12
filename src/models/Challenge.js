const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'special'],
    default: 'daily',
  },
  category: {
    type: String,
    enum: ['spending', 'gaming', 'social', 'learning', 'fitness', 'finance'],
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert'],
    default: 'easy',
  },
  pointsReward: {
    type: Number,
    required: true,
    default: 0,
  },
  cashbackReward: {
    type: Number,
    required: true,
    default: 0.00,
  },
  requirements: {
    type: mongoose.Schema.Types.Mixed,
  },
  targetValue: {
    type: Number,
  },
  targetUnit: {
    type: String,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isRepeatable: {
    type: Boolean,
    default: false,
  },
  maxCompletions: {
    type: Number,
  },
  currentCompletions: {
    type: Number,
    default: 0,
  },
  imageUrl: {
    type: String,
  },
  iconName: {
    type: String,
  },
  backgroundColor: {
    type: String,
  },
  textColor: {
    type: String,
  },
  tags: {
    type: [String],
    default: [],
  },
  prerequisites: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Challenge',
  },
  ageRange: {
    type: String,
    enum: ['all', 'under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'],
    default: 'all',
  },
  gender: {
    type: String,
    enum: ['all', 'male', 'female', 'other'],
    default: 'all',
  },
  vipOnly: {
    type: Boolean,
    default: false,
  },
  locationRequired: {
    type: Boolean,
    default: false,
  },
  locationRadius: {
    type: Number,
  },
}, {
  timestamps: true,
});

// Indexes
challengeSchema.index({ type: 1 });
challengeSchema.index({ category: 1 });
challengeSchema.index({ difficulty: 1 });
challengeSchema.index({ isActive: 1 });
challengeSchema.index({ startDate: 1 });
challengeSchema.index({ endDate: 1 });
challengeSchema.index({ vipOnly: 1 });
challengeSchema.index({ createdAt: -1 });

// Instance methods
challengeSchema.methods.isAvailable = function() {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
};

challengeSchema.methods.isExpired = function() {
  const now = new Date();
  return now > this.endDate;
};

challengeSchema.methods.isUpcoming = function() {
  const now = new Date();
  return now < this.startDate;
};

challengeSchema.methods.canBeCompleted = function() {
  if (!this.isRepeatable) {
    return this.currentCompletions === 0;
  }
  return !this.maxCompletions || this.currentCompletions < this.maxCompletions;
};

challengeSchema.methods.getDifficultyMultiplier = function() {
  const multipliers = {
    easy: 1,
    medium: 1.5,
    hard: 2,
    expert: 3,
  };
  return multipliers[this.difficulty] || 1;
};

challengeSchema.methods.getTotalReward = function() {
  const multiplier = this.getDifficultyMultiplier();
  return {
    points: Math.floor(this.pointsReward * multiplier),
    cashback: parseFloat((this.cashbackReward * multiplier).toFixed(2)),
  };
};

// Static methods
challengeSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ createdAt: -1 });
};

challengeSchema.statics.findDaily = function() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  return this.find({
    type: 'daily',
    isActive: true,
    startDate: { $lte: endOfDay },
    endDate: { $gte: startOfDay },
  }).sort({ createdAt: -1 });
};

challengeSchema.statics.findByCategory = function(category) {
  return this.find({
    category,
    isActive: true,
  }).sort({ createdAt: -1 });
};

challengeSchema.statics.findByDifficulty = function(difficulty) {
  return this.find({
    difficulty,
    isActive: true,
  }).sort({ createdAt: -1 });
};

challengeSchema.statics.findForUser = function(user) {
  const conditions = {
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  };

  // Filter by age range
  if (user.ageRange && user.ageRange !== 'unknown') {
    conditions.ageRange = { $in: ['all', user.ageRange] };
  }

  // Filter by gender
  if (user.gender) {
    conditions.gender = { $in: ['all', user.gender] };
  }

  // Filter VIP challenges
  if (!user.isVip) {
    conditions.vipOnly = false;
  }

  return this.find(conditions).sort({ createdAt: -1 });
};

const Challenge = mongoose.model('Challenge', challengeSchema);

module.exports = Challenge; 
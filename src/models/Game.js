const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
  },
  description: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ['puzzle', 'strategy', 'action', 'arcade', 'educational', 'casino', 'trivia', 'simulation'],
    required: true,
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert'],
    default: 'easy',
  },
  gameType: {
    type: String,
    enum: ['single_player', 'multiplayer', 'tournament', 'challenge'],
    default: 'single_player',
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
  maxPointsPerDay: {
    type: Number,
    comment: 'Maximum points that can be earned per day from this game',
  },
  maxCashbackPerDay: {
    type: Number,
    comment: 'Maximum cashback that can be earned per day from this game',
  },
  gameUrl: {
    type: String,
    maxlength: 500,
    comment: 'URL to the game if it\'s external',
  },
  gameData: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Game-specific data and configuration',
  },
  rules: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Game rules and instructions',
  },
  requirements: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'Requirements to play the game',
  },
  imageUrl: {
    type: String,
    maxlength: 500,
  },
  iconName: {
    type: String,
    maxlength: 100,
  },
  backgroundColor: {
    type: String,
    maxlength: 7,
    comment: 'Hex color code for game background',
  },
  textColor: {
    type: String,
    maxlength: 7,
    comment: 'Hex color code for game text',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  isNew: {
    type: Boolean,
    default: false,
  },
  isVipOnly: {
    type: Boolean,
    default: false,
  },
  minLevel: {
    type: Number,
    default: 0,
    comment: 'Minimum user level required to play',
  },
  maxPlayers: {
    type: Number,
    default: 1,
    comment: 'Maximum number of players for multiplayer games',
  },
  estimatedDuration: {
    type: Number,
    comment: 'Estimated duration in minutes',
  },
  tags: {
    type: [String],
    default: [],
    comment: 'Array of tags for filtering games',
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
  locationRequired: {
    type: Boolean,
    default: false,
  },
  locationRadius: {
    type: Number,
    comment: 'Radius in kilometers for location-based games',
  },
  totalPlays: {
    type: Number,
    default: 0,
  },
  totalPointsAwarded: {
    type: Number,
    default: 0,
  },
  totalCashbackAwarded: {
    type: Number,
    default: 0.00,
  },
  averageRating: {
    type: Number,
    default: 0.00,
    min: 0,
    max: 5,
  },
  totalRatings: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual fields
gameSchema.virtual('totalRewardValue').get(function() {
  return this.pointsReward + (this.cashbackReward * 100); // Convert cashback to points equivalent
});

gameSchema.virtual('popularityScore').get(function() {
  return (this.totalPlays * 0.4) + (this.averageRating * 0.6);
});

gameSchema.virtual('isLocationBased').get(function() {
  return this.locationRequired && this.locationRadius > 0;
});

gameSchema.virtual('hasDailyLimits').get(function() {
  return this.maxPointsPerDay > 0 || this.maxCashbackPerDay > 0;
});

// Pre-save middleware
gameSchema.pre('save', function(next) {
  // Validate color codes if provided
  if (this.backgroundColor && !/^#[0-9A-F]{6}$/i.test(this.backgroundColor)) {
    return next(new Error('Invalid backgroundColor format. Use hex color code (e.g., #FF0000)'));
  }
  
  if (this.textColor && !/^#[0-9A-F]{6}$/i.test(this.textColor)) {
    return next(new Error('Invalid textColor format. Use hex color code (e.g., #FF0000)'));
  }

  // Validate game URL if provided
  if (this.gameUrl) {
    try {
      new URL(this.gameUrl);
    } catch (error) {
      return next(new Error('Invalid game URL format'));
    }
  }

  // Set isNew to false after 30 days
  if (this.isNew && this.createdAt) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (this.createdAt < thirtyDaysAgo) {
      this.isNew = false;
    }
  }

  next();
});

// Indexes
gameSchema.index({ category: 1 });
gameSchema.index({ difficulty: 1 });
gameSchema.index({ isActive: 1 });
gameSchema.index({ isFeatured: 1 });
gameSchema.index({ isNew: 1 });
gameSchema.index({ isVipOnly: 1 });
gameSchema.index({ ageRange: 1 });
gameSchema.index({ gender: 1 });
gameSchema.index({ totalPlays: -1 });
gameSchema.index({ averageRating: -1 });
gameSchema.index({ createdAt: -1 });
gameSchema.index({ tags: 1 });
gameSchema.index({ 'popularityScore': -1 });

// Instance methods
gameSchema.methods.isAvailableForUser = function(user) {
  // Check if game is active
  if (!this.isActive) return false;

  // Check VIP requirement
  if (this.isVipOnly && !user.isVip) return false;

  // Check age range
  if (this.ageRange !== 'all' && user.ageRange && user.ageRange !== this.ageRange) {
    return false;
  }

  // Check gender
  if (this.gender !== 'all' && user.gender && user.gender !== this.gender) {
    return false;
  }

  return true;
};

gameSchema.methods.getRewardForUser = function(user) {
  let pointsReward = this.pointsReward;
  let cashbackReward = this.cashbackReward;

  // Apply VIP multiplier
  if (user.isVip) {
    pointsReward = Math.floor(pointsReward * 1.5);
    cashbackReward = parseFloat((cashbackReward * 1.5).toFixed(2));
  }

  return {
    points: pointsReward,
    cashback: cashbackReward,
  };
};

gameSchema.methods.updateStats = function(points, cashback) {
  this.totalPlays += 1;
  this.totalPointsAwarded += points;
  this.totalCashbackAwarded += parseFloat(cashback);
  return this.save();
};

gameSchema.methods.updateRating = function(newRating) {
  if (newRating < 0 || newRating > 5) {
    throw new Error('Rating must be between 0 and 5');
  }
  
  const totalRating = this.averageRating * this.totalRatings + newRating;
  this.totalRatings += 1;
  this.averageRating = parseFloat((totalRating / this.totalRatings).toFixed(2));
  return this.save();
};

gameSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

gameSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

gameSchema.methods.toggleFeatured = function() {
  this.isFeatured = !this.isFeatured;
  return this.save();
};

gameSchema.methods.toggleActive = function() {
  this.isActive = !this.isActive;
  return this.save();
};

gameSchema.methods.getDailyLimits = function() {
  return {
    maxPoints: this.maxPointsPerDay || 0,
    maxCashback: this.maxCashbackPerDay || 0,
  };
};

// Static methods
gameSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

gameSchema.statics.findFeatured = function() {
  return this.find({ isActive: true, isFeatured: true }).sort({ createdAt: -1 });
};

gameSchema.statics.findNew = function() {
  return this.find({ isActive: true, isNew: true }).sort({ createdAt: -1 });
};

gameSchema.statics.findByCategory = function(category) {
  return this.find({ category, isActive: true }).sort({ createdAt: -1 });
};

gameSchema.statics.findByDifficulty = function(difficulty) {
  return this.find({ difficulty, isActive: true }).sort({ createdAt: -1 });
};

gameSchema.statics.findForUser = function(user) {
  const conditions = {
    isActive: true,
  };

  // Filter VIP games
  if (!user.isVip) {
    conditions.isVipOnly = false;
  }

  // Filter by age range
  if (user.ageRange && user.ageRange !== 'unknown') {
    conditions.ageRange = { $in: ['all', user.ageRange] };
  }

  // Filter by gender
  if (user.gender) {
    conditions.gender = { $in: ['all', user.gender] };
  }

  return this.find(conditions).sort({ createdAt: -1 });
};

gameSchema.statics.findPopular = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ totalPlays: -1 })
    .limit(limit);
};

gameSchema.statics.findTopRated = function(limit = 10) {
  return this.find({ 
    isActive: true, 
    totalRatings: { $gte: 5 } 
  })
    .sort({ averageRating: -1 })
    .limit(limit);
};

gameSchema.statics.findByTags = function(tags, limit = 20) {
  return this.find({
    isActive: true,
    tags: { $in: tags }
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

gameSchema.statics.findLocationBased = function() {
  return this.find({
    isActive: true,
    locationRequired: true
  }).sort({ createdAt: -1 });
};

gameSchema.statics.findVipGames = function() {
  return this.find({
    isActive: true,
    isVipOnly: true
  }).sort({ createdAt: -1 });
};

gameSchema.statics.getGameStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalGames: { $sum: 1 },
        activeGames: { $sum: { $cond: ['$isActive', 1, 0] } },
        featuredGames: { $sum: { $cond: ['$isFeatured', 1, 0] } },
        vipGames: { $sum: { $cond: ['$isVipOnly', 1, 0] } },
        totalPlays: { $sum: '$totalPlays' },
        totalPointsAwarded: { $sum: '$totalPointsAwarded' },
        totalCashbackAwarded: { $sum: '$totalCashbackAwarded' },
        averageRating: { $avg: '$averageRating' }
      }
    }
  ]);

  return stats[0] || {
    totalGames: 0,
    activeGames: 0,
    featuredGames: 0,
    vipGames: 0,
    totalPlays: 0,
    totalPointsAwarded: 0,
    totalCashbackAwarded: 0,
    averageRating: 0
  };
};

gameSchema.statics.getCategoryStats = async function() {
  return this.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalPlays: { $sum: '$totalPlays' },
        averageRating: { $avg: '$averageRating' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);
};

const Game = mongoose.model('Game', gameSchema);

module.exports = Game; 
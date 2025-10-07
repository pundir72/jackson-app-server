const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  sdkProvider: {
    type: String,
    required: true,
    enum: ['bitlabs', 'adgem', 'besitos', 'cpx', 'ayet', 'unity', 'ironsource']
  },
  countries: [{
    type: String,
    required: true
  }],
  xptrRules: {
    type: String,
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isAdSupported: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    genre: {
      type: String,
      enum: ['puzzle', 'action', 'strategy', 'simulation', 'arcade', 'sports', 'racing', 'rpg'],
      default: 'puzzle'
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'easy'
    },
    estimatedPlayTime: {
      type: Number,
      default: 10 // minutes
    },
    minAge: {
      type: Number,
      default: 13
    },
    imageUrl: String,
    iconUrl: String,
    deepLink: String,
    packageName: String,
    version: String,
    size: String, // e.g., "50MB"
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: 4.0
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    revenue: {
      type: Number,
      default: 0
    },
    rewardCost: {
      type: Number,
      default: 0
    }
  },
  tierRestrictions: {
    minTier: {
      type: String,
      enum: ['free', 'bronze', 'silver', 'gold', 'platinum'],
      default: 'free'
    },
    maxTier: {
      type: String,
      enum: ['free', 'bronze', 'silver', 'gold', 'platinum'],
      default: 'platinum'
    }
  },
  displayRules: {
    maxGamesToShow: {
      type: Number,
      default: 10
    },
    priority: {
      type: Number,
      default: 0
    },
    isFeatured: {
      type: Boolean,
      default: false
    }
  },
  analytics: {
    totalPlays: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    averagePlayTime: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    retentionRate: {
      type: Number,
      default: 0
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt field before saving
gameSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
gameSchema.index({ title: 1 });
gameSchema.index({ sdkProvider: 1, isActive: 1 });
gameSchema.index({ countries: 1 });
gameSchema.index({ tags: 1 });
gameSchema.index({ 'metadata.genre': 1 });
gameSchema.index({ 'tierRestrictions.minTier': 1, 'tierRestrictions.maxTier': 1 });
gameSchema.index({ 'displayRules.isFeatured': 1, 'displayRules.priority': -1 });
gameSchema.index({ createdAt: -1 });

// Static methods
gameSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ 'displayRules.priority': -1, createdAt: -1 });
};

gameSchema.statics.findByCountry = function(country) {
  return this.find({ 
    countries: country,
    isActive: true
  }).sort({ 'displayRules.priority': -1, createdAt: -1 });
};

gameSchema.statics.findByTier = function(tier) {
  return this.find({ 
    'tierRestrictions.minTier': { $lte: tier },
    'tierRestrictions.maxTier': { $gte: tier },
    isActive: true
  }).sort({ 'displayRules.priority': -1, createdAt: -1 });
};

gameSchema.statics.findFeatured = function() {
  return this.find({ 
    'displayRules.isFeatured': true,
    isActive: true
  }).sort({ 'displayRules.priority': -1, createdAt: -1 });
};

gameSchema.statics.findByGenre = function(genre) {
  return this.find({ 
    'metadata.genre': genre,
    isActive: true
  }).sort({ 'displayRules.priority': -1, createdAt: -1 });
};

// Instance methods
gameSchema.methods.isEligibleForTier = function(tier) {
  const tierOrder = ['free', 'bronze', 'silver', 'gold', 'platinum'];
  const userTierIndex = tierOrder.indexOf(tier);
  const minTierIndex = tierOrder.indexOf(this.tierRestrictions.minTier);
  const maxTierIndex = tierOrder.indexOf(this.tierRestrictions.maxTier);
  
  return userTierIndex >= minTierIndex && userTierIndex <= maxTierIndex;
};

gameSchema.methods.isEligibleForCountry = function(country) {
  return this.countries.includes(country);
};

gameSchema.methods.updateAnalytics = function(playTime, completed = false) {
  this.analytics.totalPlays += 1;
  
  if (completed) {
    this.analytics.totalCompletions += 1;
  }
  
  // Update average play time
  const totalTime = this.analytics.averagePlayTime * (this.analytics.totalPlays - 1) + playTime;
  this.analytics.averagePlayTime = totalTime / this.analytics.totalPlays;
  
  // Update completion rate
  this.analytics.completionRate = (this.analytics.totalCompletions / this.analytics.totalPlays) * 100;
  
  return this.save();
};

gameSchema.methods.calculateMargin = function() {
  if (this.metadata.revenue > 0 && this.metadata.rewardCost > 0) {
    return ((this.metadata.revenue - this.metadata.rewardCost) / this.metadata.revenue) * 100;
  }
  return 0;
};

const Game = mongoose.model('Game', gameSchema);

module.exports = Game;


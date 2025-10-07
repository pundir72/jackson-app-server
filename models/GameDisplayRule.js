const mongoose = require('mongoose');

const gameDisplayRuleSchema = new mongoose.Schema({
  userMilestone: {
    type: String,
    required: true,
    enum: ['first_game', 'after_1_game', 'xp_tier_100', 'xp_tier_500', 'xp_tier_1000', 'xp_tier_2000']
  },
  maxGamesToShow: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  segmentOverrides: [{
    type: {
      type: String,
      enum: ['age', 'gender', 'country'],
      required: true
    },
    value: {
      type: String,
      required: true
    },
    maxGamesToShow: {
      type: Number,
      required: true,
      min: 1,
      max: 50
    }
  }],
  isEnabled: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  metadata: {
    description: String,
    notes: String,
    priority: {
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
gameDisplayRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
gameDisplayRuleSchema.index({ userMilestone: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ order: 1 });
gameDisplayRuleSchema.index({ createdAt: -1 });

// Static methods
gameDisplayRuleSchema.statics.findActive = function() {
  return this.find({ isEnabled: true }).sort({ order: 1, createdAt: 1 });
};

gameDisplayRuleSchema.statics.findByMilestone = function(milestone) {
  return this.findOne({ 
    userMilestone: milestone,
    isEnabled: true
  });
};

// Instance methods
gameDisplayRuleSchema.methods.getMaxGamesForSegment = function(segmentType, segmentValue) {
  // Check for segment override
  const override = this.segmentOverrides.find(
    o => o.type === segmentType && o.value === segmentValue
  );
  
  return override ? override.maxGamesToShow : this.maxGamesToShow;
};

gameDisplayRuleSchema.methods.applyToUser = function(userProfile) {
  const { age, gender, country, xp, gamesPlayed } = userProfile;
  
  // Determine user milestone
  let milestone = 'first_game';
  
  if (gamesPlayed > 0) {
    milestone = 'after_1_game';
  } else if (xp >= 2000) {
    milestone = 'xp_tier_2000';
  } else if (xp >= 1000) {
    milestone = 'xp_tier_1000';
  } else if (xp >= 500) {
    milestone = 'xp_tier_500';
  } else if (xp >= 100) {
    milestone = 'xp_tier_100';
  }
  
  // Check if this rule applies to user's milestone
  if (this.userMilestone !== milestone) {
    return null;
  }
  
  // Get max games based on segments
  let maxGames = this.maxGamesToShow;
  
  // Check age override
  if (age) {
    const ageGroup = this.getAgeGroup(age);
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('age', ageGroup));
  }
  
  // Check gender override
  if (gender) {
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('gender', gender));
  }
  
  // Check country override
  if (country) {
    maxGames = Math.min(maxGames, this.getMaxGamesForSegment('country', country));
  }
  
  return {
    maxGames,
    milestone,
    appliedRules: this._id
  };
};

gameDisplayRuleSchema.methods.getAgeGroup = function(age) {
  if (age < 18) return 'under_18';
  if (age >= 18 && age <= 24) return '18_24';
  if (age >= 25 && age <= 34) return '25_34';
  if (age >= 35 && age <= 44) return '35_44';
  if (age >= 45 && age <= 54) return '45_54';
  return '55_plus';
};

const GameDisplayRule = mongoose.model('GameDisplayRule', gameDisplayRuleSchema);

module.exports = GameDisplayRule;


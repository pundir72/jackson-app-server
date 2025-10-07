const mongoose = require('mongoose');

const challengePauseRuleSchema = new mongoose.Schema({
  ruleName: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  actionOnMiss: {
    type: String,
    required: true,
    enum: ['pause_streak', 'reset_streak', 'grace_period', 'fallback_reward', 'no_action']
  },
  graceDays: {
    type: Number,
    default: 0,
    min: 0,
    max: 7
  },
  impactOnXP: {
    type: Boolean,
    default: true
  },
  resetCoins: {
    type: Boolean,
    default: false
  },
  conditions: {
    userSegments: [{
      type: String,
      enum: ['all', 'new_users', 'returning_users', 'vip_users', 'high_engagement', 'low_engagement']
    }],
    minStreak: {
      type: Number,
      default: 0
    },
    maxStreak: {
      type: Number,
      default: null
    },
    challengeTypes: [{
      type: String,
      enum: ['spin', 'game', 'survey', 'referral', 'watch_ad', 'social_share', 'app_install', 'quiz', 'custom']
    }],
    countries: [{
      type: String,
      trim: true
    }]
  },
  fallbackReward: {
    enabled: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ['coins', 'xp', 'bonus_spins', 'premium_time']
    },
    value: {
      type: Number,
      default: 0
    },
    maxUses: {
      type: Number,
      default: 1
    }
  },
  timing: {
    startTime: {
      type: String, // HH:MM format
      default: '00:00'
    },
    endTime: {
      type: String, // HH:MM format
      default: '23:59'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  analytics: {
    totalTriggers: {
      type: Number,
      default: 0
    },
    totalPauses: {
      type: Number,
      default: 0
    },
    totalResets: {
      type: Number,
      default: 0
    },
    totalFallbackRewards: {
      type: Number,
      default: 0
    },
    lastTriggered: {
      type: Date,
      default: null
    }
  },
  metadata: {
    tags: [String],
    notes: String,
    version: {
      type: Number,
      default: 1
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
challengePauseRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
challengePauseRuleSchema.index({ ruleName: 1 });
challengePauseRuleSchema.index({ isActive: 1 });
challengePauseRuleSchema.index({ priority: -1 });
challengePauseRuleSchema.index({ 'conditions.userSegments': 1 });
challengePauseRuleSchema.index({ createdAt: -1 });

// Static methods
challengePauseRuleSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: 1 });
};

challengePauseRuleSchema.statics.findByUserSegment = function(userSegment) {
  return this.find({
    isActive: true,
    $or: [
      { 'conditions.userSegments': 'all' },
      { 'conditions.userSegments': userSegment }
    ]
  }).sort({ priority: -1 });
};

challengePauseRuleSchema.statics.findApplicableRules = function(userProfile, challengeType) {
  const query = {
    isActive: true,
    $or: [
      { 'conditions.userSegments': 'all' },
      { 'conditions.userSegments': userProfile.userSegment }
    ]
  };
  
  if (challengeType) {
    query.$or = [
      ...query.$or,
      { 'conditions.challengeTypes': challengeType }
    ];
  }
  
  return this.find(query).sort({ priority: -1 });
};

// Instance methods
challengePauseRuleSchema.methods.isApplicableToUser = function(userProfile, challengeType) {
  // Check user segments
  if (this.conditions.userSegments.length > 0 && 
      !this.conditions.userSegments.includes('all') &&
      !this.conditions.userSegments.includes(userProfile.userSegment)) {
    return false;
  }
  
  // Check countries
  if (this.conditions.countries.length > 0 && 
      !this.conditions.countries.includes(userProfile.country)) {
    return false;
  }
  
  // Check streak requirements
  if (userProfile.currentStreak < this.conditions.minStreak) {
    return false;
  }
  
  if (this.conditions.maxStreak && userProfile.currentStreak > this.conditions.maxStreak) {
    return false;
  }
  
  // Check challenge type
  if (this.conditions.challengeTypes.length > 0 && 
      !this.conditions.challengeTypes.includes(challengeType)) {
    return false;
  }
  
  return true;
};

challengePauseRuleSchema.methods.applyRule = function(userProfile, challengeType, currentTime = new Date()) {
  if (!this.isApplicableToUser(userProfile, challengeType)) {
    return { applicable: false };
  }
  
  const result = {
    applicable: true,
    action: this.actionOnMiss,
    graceDays: this.graceDays,
    impactOnXP: this.impactOnXP,
    resetCoins: this.resetCoins,
    fallbackReward: null
  };
  
  // Check timing constraints
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  const currentDay = currentTime.getDay();
  
  if (currentTimeString < this.timing.startTime || currentTimeString > this.timing.endTime) {
    result.applicable = false;
    return result;
  }
  
  if (this.timing.daysOfWeek.length > 0 && !this.timing.daysOfWeek.includes(currentDay)) {
    result.applicable = false;
    return result;
  }
  
  // Add fallback reward if enabled
  if (this.fallbackReward.enabled) {
    result.fallbackReward = {
      type: this.fallbackReward.type,
      value: this.fallbackReward.value,
      maxUses: this.fallbackReward.maxUses
    };
  }
  
  // Update analytics
  this.analytics.totalTriggers += 1;
  this.analytics.lastTriggered = currentTime;
  
  switch (this.actionOnMiss) {
    case 'pause_streak':
      this.analytics.totalPauses += 1;
      break;
    case 'reset_streak':
      this.analytics.totalResets += 1;
      break;
    case 'fallback_reward':
      this.analytics.totalFallbackRewards += 1;
      break;
  }
  
  return result;
};

challengePauseRuleSchema.methods.updateAnalytics = function(action) {
  switch (action) {
    case 'triggered':
      this.analytics.totalTriggers += 1;
      break;
    case 'pause':
      this.analytics.totalPauses += 1;
      break;
    case 'reset':
      this.analytics.totalResets += 1;
      break;
    case 'fallback_reward':
      this.analytics.totalFallbackRewards += 1;
      break;
  }
  
  this.analytics.lastTriggered = new Date();
  return this.save();
};

challengePauseRuleSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    ruleName: this.ruleName,
    description: this.description,
    actionOnMiss: this.actionOnMiss,
    graceDays: this.graceDays,
    impactOnXP: this.impactOnXP,
    resetCoins: this.resetCoins,
    isActive: this.isActive,
    priority: this.priority,
    analytics: {
      totalTriggers: this.analytics.totalTriggers,
      totalPauses: this.analytics.totalPauses,
      totalResets: this.analytics.totalResets,
      lastTriggered: this.analytics.lastTriggered
    }
  };
};

const ChallengePauseRule = mongoose.model('ChallengePauseRule', challengePauseRuleSchema);

module.exports = ChallengePauseRule;


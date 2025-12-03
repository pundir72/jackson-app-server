const mongoose = require('mongoose');

const bonusLogicSchema = new mongoose.Schema({
  bonusType: {
    type: String,
    required: true,
    trim: true,
    enum: ['Login Streak', 'Referral', 'Daily Task', 'Achievement', 'Special Event', 'Weekly Bonus', 'Monthly Bonus', 'Game Completion', 'Survey Completion', 'Race Completion']
  },
  triggerCondition: {
    type: String,
    required: true,
    trim: true
  },
  triggerDetails: {
    // For streak-based bonuses
    streakLength: {
      type: Number,
      min: 1
    },
    // For task-based bonuses
    taskType: {
      type: String,
      enum: ['game', 'survey', 'challenge', 'receipt', 'race']
    },
    taskCount: {
      type: Number,
      min: 1
    },
    // For time-based bonuses
    timeFrame: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'one_time']
    },
    // For achievement-based bonuses
    achievementType: {
      type: String,
      enum: ['streak', 'xp', 'games', 'surveys', 'races', 'wallet', 'social', 'special']
    },
    achievementValue: {
      type: Number
    }
  },
  rewardValue: {
    type: String,
    required: true,
    trim: true
  },
  rewardDetails: {
    coins: {
      type: Number,
      default: 0,
      min: 0
    },
    xp: {
      type: Number,
      default: 0,
      min: 0
    },
    spins: {
      type: Number,
      default: 0,
      min: 0
    },
    giftCards: {
      type: Number,
      default: 0,
      min: 0
    },
    multiplier: {
      type: Number,
      default: 1.0,
      min: 0.1
    },
    duration: {
      type: Number, // Duration in hours for temporary bonuses
      default: 0
    }
  },
  conditions: {
    // User requirements
    minLevel: {
      type: Number,
      default: 1
    },
    vipRequired: {
      type: String,
      enum: ['free', 'bronze', 'gold', 'platinum'],
      default: 'free'
    },
    // Geographic restrictions
    allowedCountries: [{
      type: String,
      trim: true
    }],
    excludedCountries: [{
      type: String,
      trim: true
    }],
    // Time restrictions
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    // Frequency restrictions
    maxPerUser: {
      type: Number,
      default: null // null means unlimited
    },
    maxPerDay: {
      type: Number,
      default: null // null means unlimited
    },
    cooldownPeriod: {
      type: Number, // Hours between triggers
      default: 0
    }
  },
  notification: {
    enabled: {
      type: Boolean,
      default: true
    },
    title: {
      type: String,
      trim: true
    },
    message: {
      type: String,
      trim: true
    },
    sendBefore: {
      type: Number, // Hours before bonus expires
      default: 24
    }
  },
  active: {
    type: Boolean,
    default: true
  },
  status: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0 // Higher number = higher priority
  },
  order: {
    type: Number,
    default: 0
  },
  metadata: {
    description: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: ['engagement', 'retention', 'monetization', 'social', 'achievement'],
      default: 'engagement'
    },
    tags: [{
      type: String,
      trim: true
    }],
    createdBy: {
      type: String,
      trim: true
    },
    lastModifiedBy: {
      type: String,
      trim: true
    }
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
bonusLogicSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
bonusLogicSchema.index({ bonusType: 1, status: 1 });
bonusLogicSchema.index({ active: 1, status: 1 });
bonusLogicSchema.index({ priority: -1, order: 1 });
bonusLogicSchema.index({ 'conditions.startDate': 1, 'conditions.endDate': 1 });

// Method to check if bonus is currently active
bonusLogicSchema.methods.isCurrentlyActive = function() {
  if (!this.active || !this.status) return false;
  
  const now = new Date();
  
  // Check date range
  if (this.conditions.startDate && now < this.conditions.startDate) return false;
  if (this.conditions.endDate && now > this.conditions.endDate) return false;
  
  return true;
};

// Method to check if user qualifies for bonus
bonusLogicSchema.methods.userQualifies = function(user, userStats = {}) {
  if (!this.isCurrentlyActive()) return false;
  
  // Check VIP requirement
  if (this.conditions.vipRequired !== 'free') {
    const userVipLevel = user.vip?.tier || 'free';
    const vipLevels = ['free', 'bronze', 'gold', 'platinum'];
    const requiredIndex = vipLevels.indexOf(this.conditions.vipRequired);
    const userIndex = vipLevels.indexOf(userVipLevel);
    
    if (userIndex < requiredIndex) return false;
  }
  
  // Check level requirement
  if (user.level < this.conditions.minLevel) return false;
  
  // Check geographic restrictions
  if (this.conditions.allowedCountries?.length > 0) {
    if (!this.conditions.allowedCountries.includes(user.country)) return false;
  }
  
  if (this.conditions.excludedCountries?.length > 0) {
    if (this.conditions.excludedCountries.includes(user.country)) return false;
  }
  
  return true;
};

// Method to calculate reward value
bonusLogicSchema.methods.calculateReward = function(user, baseValue = 1) {
  const reward = { ...this.rewardDetails };
  
  // Apply multiplier
  if (reward.multiplier && reward.multiplier !== 1.0) {
    reward.coins = Math.round(reward.coins * reward.multiplier * baseValue);
    reward.xp = Math.round(reward.xp * reward.multiplier * baseValue);
    reward.spins = Math.round(reward.spins * reward.multiplier * baseValue);
  }
  
  // Apply VIP multiplier if applicable
  if (user.vip?.tier) {
    const vipMultipliers = {
      bronze: 1.2,
      gold: 1.5,
      platinum: 2.0
    };
    
    const vipMultiplier = vipMultipliers[user.vip.tier] || 1.0;
    reward.coins = Math.round(reward.coins * vipMultiplier);
    reward.xp = Math.round(reward.xp * vipMultiplier);
  }
  
  return reward;
};

// Static method to get active bonuses
bonusLogicSchema.statics.getActiveBonuses = function() {
  return this.find({ active: true, status: true }).sort({ priority: -1, order: 1 });
};

// Static method to get bonuses by type
bonusLogicSchema.statics.getBonusesByType = function(bonusType) {
  return this.find({ bonusType, active: true, status: true }).sort({ priority: -1, order: 1 });
};

// Static method to get bonuses for user
bonusLogicSchema.statics.getBonusesForUser = function(user, userStats = {}) {
  return this.find({ active: true, status: true })
    .sort({ priority: -1, order: 1 })
    .then(bonuses => bonuses.filter(bonus => bonus.userQualifies(user, userStats)));
};

module.exports = mongoose.model('BonusLogic', bonusLogicSchema);

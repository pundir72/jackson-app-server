const mongoose = require('mongoose');

const bonusDaySchema = new mongoose.Schema({
  dayNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 365,
    unique: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  primaryReward: {
    type: {
      type: String,
      required: true,
      enum: ['coins', 'xp', 'giftcard', 'premium_features', 'bonus_spins', 'vip_access']
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    metadata: {
      giftcardType: String, // For giftcard rewards
      premiumDuration: Number, // For premium features (in days)
      spinCount: Number, // For bonus spins
      vipDuration: Number // For VIP access (in days)
    }
  },
  alternateReward: {
    type: {
      type: String,
      enum: ['coins', 'xp', 'giftcard', 'premium_features', 'bonus_spins', 'vip_access']
    },
    value: {
      type: Number,
      min: 0
    },
    metadata: {
      giftcardType: String,
      premiumDuration: Number,
      spinCount: Number,
      vipDuration: Number
    }
  },
  resetRule: {
    onMiss: {
      type: Boolean,
      default: true
    },
    gracePeriod: {
      type: Number,
      default: 0, // Days to wait before reset
      min: 0,
      max: 7
    },
    fallbackAction: {
      type: String,
      enum: ['reset_streak', 'pause_streak', 'give_alternate', 'no_action'],
      default: 'reset_streak'
    }
  },
  conditions: {
    minStreak: {
      type: Number,
      default: 0
    },
    maxStreak: {
      type: Number,
      default: null
    },
    requiresCompletion: {
      type: Boolean,
      default: true
    },
    userSegments: [{
      type: String,
      enum: ['all', 'new_users', 'returning_users', 'vip_users', 'high_engagement', 'low_engagement']
    }],
    countries: [{
      type: String,
      trim: true
    }]
  },
  notification: {
    enabled: {
      type: Boolean,
      default: true
    },
    title: String,
    message: String,
    imageUrl: String,
    actionText: {
      type: String,
      default: 'Claim Reward'
    },
    scheduledTime: {
      type: String, // HH:MM format
      default: '09:00'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  },
  banner: {
    enabled: {
      type: Boolean,
      default: true
    },
    title: String,
    subtitle: String,
    imageUrl: String,
    backgroundColor: {
      type: String,
      default: '#FFD700' // Gold color
    },
    textColor: {
      type: String,
      default: '#000000' // Black text
    },
    position: {
      type: String,
      enum: ['top', 'bottom', 'center'],
      default: 'top'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  analytics: {
    totalEligibleUsers: {
      type: Number,
      default: 0
    },
    totalClaims: {
      type: Number,
      default: 0
    },
    totalAlternateClaims: {
      type: Number,
      default: 0
    },
    totalMissed: {
      type: Number,
      default: 0
    },
    claimRate: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  metadata: {
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
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
bonusDaySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate claim rate
  if (this.analytics.totalEligibleUsers > 0) {
    this.analytics.claimRate = (this.analytics.totalClaims / this.analytics.totalEligibleUsers) * 100;
  }
  
  next();
});

// Indexes for efficient queries
bonusDaySchema.index({ dayNumber: 1 });
bonusDaySchema.index({ isActive: 1 });
bonusDaySchema.index({ 'conditions.userSegments': 1 });
bonusDaySchema.index({ createdAt: -1 });

// Static methods
bonusDaySchema.statics.findByDayNumber = function(dayNumber) {
  return this.findOne({ dayNumber, isActive: true });
};

bonusDaySchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ dayNumber: 1 });
};

bonusDaySchema.statics.findForUser = function(userProfile) {
  const query = { isActive: true };
  
  // Check user segments
  if (userProfile.userSegment) {
    query.$or = [
      { 'conditions.userSegments': 'all' },
      { 'conditions.userSegments': userProfile.userSegment }
    ];
  }
  
  // Check countries
  if (userProfile.country && userProfile.country.length > 0) {
    query.$or = [
      { 'conditions.countries': { $exists: false } },
      { 'conditions.countries': { $size: 0 } },
      { 'conditions.countries': userProfile.country }
    ];
  }
  
  return this.find(query).sort({ dayNumber: 1 });
};

// Instance methods
bonusDaySchema.methods.isEligibleForUser = function(userProfile) {
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
  
  // CRITICAL FIX: Check requiresCompletion flag
  // If requiresCompletion is true (default), verify that all required days (1 to minStreak) are actually completed
  if (this.conditions.requiresCompletion !== false) {
    // Get completed tasks array from userProfile
    const completedTasks = userProfile.completedTasks || [];
    const completedTasksSet = new Set(completedTasks);
    
    // Calculate the date range for required days
    // We need to check if all days from day 1 to minStreak are completed
    // Since we can't know the exact dates without user's account creation date,
    // we check if the number of completed consecutive days matches minStreak
    // The streak calculation already ensures consecutive days, so we verify:
    // 1. Current streak >= minStreak (already checked above)
    // 2. All days in the consecutive streak are actually completed (checked via completedTasks)
    
    // For bonus day at day N, we need to verify that the user has completed
    // all days from (currentStreak - minStreak + 1) to currentStreak
    // But since streak is consecutive from today backwards, we just need to verify
    // that the streak count matches the number of completed tasks in the consecutive range
    
    // The safest check: Verify that today is completed (streak starts from today)
    // and that we have at least minStreak consecutive completed days
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // If today is not completed, bonus day is not eligible
    if (!completedTasksSet.has(todayStr)) {
      return false;
    }
    
    // Verify we have at least minStreak consecutive completed days ending today
    // Count backwards from today to verify consecutive completion
    let consecutiveCount = 0;
    const checkDate = new Date(today);
    for (let i = 0; i < this.conditions.minStreak; i++) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (completedTasksSet.has(dateStr)) {
        consecutiveCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // Gap found - not all required days are completed
        return false;
      }
    }
    
    // Verify we have at least minStreak consecutive days
    if (consecutiveCount < this.conditions.minStreak) {
      return false;
    }
  }
  
  return true;
};

bonusDaySchema.methods.getRewardForUser = function(userProfile, isPrimary = true) {
  const reward = isPrimary ? this.primaryReward : this.alternateReward;
  
  if (!reward || !reward.type) {
    return null;
  }
  
  const rewardData = {
    type: reward.type,
    value: reward.value,
    dayNumber: this.dayNumber,
    isPrimary: isPrimary
  };
  
  // Add metadata based on reward type
  switch (reward.type) {
    case 'giftcard':
      rewardData.giftcardType = reward.metadata?.giftcardType;
      break;
    case 'premium_features':
      rewardData.duration = reward.metadata?.premiumDuration;
      break;
    case 'bonus_spins':
      rewardData.spinCount = reward.metadata?.spinCount;
      break;
    case 'vip_access':
      rewardData.duration = reward.metadata?.vipDuration;
      break;
  }
  
  return rewardData;
};

bonusDaySchema.methods.updateAnalytics = function(eventType, userCount = 1) {
  switch (eventType) {
    case 'eligible':
      this.analytics.totalEligibleUsers += userCount;
      break;
    case 'claimed':
      this.analytics.totalClaims += userCount;
      break;
    case 'alternate_claimed':
      this.analytics.totalAlternateClaims += userCount;
      break;
    case 'missed':
      this.analytics.totalMissed += userCount;
      break;
  }
  
  this.analytics.lastUpdated = new Date();
  return this.save();
};

bonusDaySchema.methods.getPreviewData = function() {
  return {
    id: this._id,
    dayNumber: this.dayNumber,
    title: this.title,
    description: this.description,
    primaryReward: this.primaryReward,
    alternateReward: this.alternateReward,
    notification: this.notification,
    banner: this.banner,
    analytics: {
      totalEligibleUsers: this.analytics.totalEligibleUsers,
      totalClaims: this.analytics.totalClaims,
      claimRate: this.analytics.claimRate
    }
  };
};

const BonusDay = mongoose.model('BonusDay', bonusDaySchema);

module.exports = BonusDay;


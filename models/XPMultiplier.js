const mongoose = require('mongoose');

const xpMultiplierSchema = new mongoose.Schema({
  streakLength: {
    type: Number,
    required: true,
    min: 1,
    max: 365,
    unique: true
  },
  multiplier: {
    type: Number,
    required: true,
    min: 1.0,
    max: 10.0
  },
  vipBonusApplied: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  conditions: {
    userSegments: [{
      type: String,
      enum: ['all', 'new_users', 'returning_users', 'vip_users', 'high_engagement', 'low_engagement']
    }],
    countries: [{
      type: String,
      trim: true
    }],
    minXP: {
      type: Number,
      default: 0
    },
    maxXP: {
      type: Number,
      default: null
    },
    challengeTypes: [{
      type: String,
      enum: ['spin', 'game', 'survey', 'referral', 'watch_ad', 'social_share', 'app_install', 'quiz', 'custom']
    }]
  },
  scheduling: {
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    daysOfWeek: [{
      type: Number,
      min: 0,
      max: 6 // 0 = Sunday, 6 = Saturday
    }],
    timeRanges: [{
      startTime: String, // HH:MM format
      endTime: String    // HH:MM format
    }]
  },
  vipOverlay: {
    enabled: {
      type: Boolean,
      default: false
    },
    bonusMultiplier: {
      type: Number,
      default: 1.0,
      min: 1.0,
      max: 5.0
    },
    vipTiers: [{
      type: String,
      // enum: ['bronze', 'silver', 'gold', 'platinum']
    }]
  },
  analytics: {
    totalApplications: {
      type: Number,
      default: 0
    },
    totalXPBonus: {
      type: Number,
      default: 0
    },
    totalUsersAffected: {
      type: Number,
      default: 0
    },
    avgBonusPerUser: {
      type: Number,
      default: 0
    },
    lastApplied: {
      type: Date,
      default: null
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
xpMultiplierSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate average bonus per user
  if (this.analytics.totalUsersAffected > 0) {
    this.analytics.avgBonusPerUser = this.analytics.totalXPBonus / this.analytics.totalUsersAffected;
  }
  
  next();
});

// Indexes for efficient queries
xpMultiplierSchema.index({ streakLength: 1 });
xpMultiplierSchema.index({ isActive: 1 });
xpMultiplierSchema.index({ 'conditions.userSegments': 1 });
xpMultiplierSchema.index({ 'scheduling.startDate': 1, 'scheduling.endDate': 1 });
xpMultiplierSchema.index({ createdAt: -1 });

// Static methods
xpMultiplierSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    'scheduling.startDate': { $lte: now },
    $or: [
      { 'scheduling.endDate': null },
      { 'scheduling.endDate': { $gte: now } }
    ]
  }).sort({ streakLength: 1 });
};

xpMultiplierSchema.statics.findForStreak = function(streakLength, currentTime = new Date()) {
  const query = {
    streakLength: { $lte: streakLength },
    isActive: true,
    'scheduling.startDate': { $lte: currentTime },
    $or: [
      { 'scheduling.endDate': null },
      { 'scheduling.endDate': { $gte: currentTime } }
    ]
  };
  
  return this.find(query)
    .sort({ streakLength: -1 }) // Get the highest applicable multiplier
    .limit(1);
};

xpMultiplierSchema.statics.findForUser = function(userProfile, challengeType, currentTime = new Date()) {
  const query = {
    isActive: true,
    'scheduling.startDate': { $lte: currentTime },
    $or: [
      { 'scheduling.endDate': null },
      { 'scheduling.endDate': { $gte: currentTime } }
    ]
  };
  
  // Check user segments
  if (userProfile.userSegment) {
    query.$or = [
      { 'conditions.userSegments': 'all' },
      { 'conditions.userSegments': userProfile.userSegment }
    ];
  }
  
  // Check countries
  if (userProfile.country) {
    query.$or = [
      ...query.$or,
      { 'conditions.countries': { $exists: false } },
      { 'conditions.countries': { $size: 0 } },
      { 'conditions.countries': userProfile.country }
    ];
  }
  
  // Check XP requirements
  if (userProfile.xp) {
    query.$and = [
      { $or: [{ 'conditions.minXP': { $lte: userProfile.xp } }, { 'conditions.minXP': { $exists: false } }] },
      { $or: [{ 'conditions.maxXP': { $gte: userProfile.xp } }, { 'conditions.maxXP': null }] }
    ];
  }
  
  // Check challenge type
  if (challengeType) {
    query.$or = [
      ...query.$or,
      { 'conditions.challengeTypes': { $exists: false } },
      { 'conditions.challengeTypes': { $size: 0 } },
      { 'conditions.challengeTypes': challengeType }
    ];
  }
  
  return this.find(query).sort({ streakLength: -1 });
};

// Instance methods
xpMultiplierSchema.methods.isApplicableToUser = function(userProfile, challengeType, currentTime = new Date()) {
  // Check if multiplier is active and within date range
  if (!this.isActive) {
    return false;
  }
  
  if (currentTime < this.scheduling.startDate) {
    return false;
  }
  
  if (this.scheduling.endDate && currentTime > this.scheduling.endDate) {
    return false;
  }
  
  // Check time constraints
  const currentHour = currentTime.getHours();
  const currentMinute = currentTime.getMinutes();
  const currentTimeString = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  const currentDay = currentTime.getDay();
  
  if (this.scheduling.daysOfWeek.length > 0 && !this.scheduling.daysOfWeek.includes(currentDay)) {
    return false;
  }
  
  if (this.scheduling.timeRanges.length > 0) {
    const inTimeRange = this.scheduling.timeRanges.some(range => 
      currentTimeString >= range.startTime && currentTimeString <= range.endTime
    );
    if (!inTimeRange) {
      return false;
    }
  }
  
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
  
  // Check XP requirements
  if (userProfile.xp < this.conditions.minXP) {
    return false;
  }
  
  if (this.conditions.maxXP && userProfile.xp > this.conditions.maxXP) {
    return false;
  }
  
  // Check challenge type
  if (this.conditions.challengeTypes.length > 0 && 
      !this.conditions.challengeTypes.includes(challengeType)) {
    return false;
  }
  
  return true;
};

xpMultiplierSchema.methods.calculateBonus = function(baseXP, userProfile) {
  if (!this.isApplicableToUser(userProfile)) {
    return {
      applicable: false,
      bonusXP: 0,
      totalXP: baseXP,
      multiplier: 1.0
    };
  }
  
  let finalMultiplier = this.multiplier;
  let bonusXP = (baseXP * this.multiplier) - baseXP;
  
  // Apply VIP bonus if applicable
  if (this.vipBonusApplied && userProfile.isVIP) {
    if (this.vipOverlay.enabled && this.vipOverlay.vipTiers.includes(userProfile.vipTier)) {
      finalMultiplier *= this.vipOverlay.bonusMultiplier;
      bonusXP *= this.vipOverlay.bonusMultiplier;
    }
  }
  
  const totalXP = baseXP + bonusXP;
  
  // Update analytics
  this.analytics.totalApplications += 1;
  this.analytics.totalXPBonus += bonusXP;
  this.analytics.totalUsersAffected += 1;
  this.analytics.lastApplied = new Date();
  
  return {
    applicable: true,
    bonusXP: Math.round(bonusXP),
    totalXP: Math.round(totalXP),
    multiplier: finalMultiplier,
    baseMultiplier: this.multiplier,
    vipBonus: this.vipBonusApplied && userProfile.isVIP ? this.vipOverlay.bonusMultiplier : 1.0
  };
};

xpMultiplierSchema.methods.updateAnalytics = function(bonusXP, userCount = 1) {
  this.analytics.totalApplications += 1;
  this.analytics.totalXPBonus += bonusXP;
  this.analytics.totalUsersAffected += userCount;
  this.analytics.lastApplied = new Date();
  
  return this.save();
};

xpMultiplierSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    streakLength: this.streakLength,
    multiplier: this.multiplier,
    multiplierDisplay: `${this.multiplier}x`,
    vipBonusApplied: this.vipBonusApplied,
    isActive: this.isActive,
    conditions: this.conditions,
    vipOverlay: this.vipOverlay,
    analytics: {
      totalApplications: this.analytics.totalApplications,
      totalXPBonus: this.analytics.totalXPBonus,
      avgBonusPerUser: this.analytics.avgBonusPerUser,
      lastApplied: this.analytics.lastApplied
    }
  };
};

const XPMultiplier = mongoose.model('XPMultiplier', xpMultiplierSchema);

module.exports = XPMultiplier;


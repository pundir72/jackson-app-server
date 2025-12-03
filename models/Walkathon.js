const mongoose = require('mongoose');

const rewardTierSchema = new mongoose.Schema({
  stepMilestone: {
    type: Number,
    required: true,
    min: 0
  },
  xpReward: {
    type: Number,
    required: true,
    min: 0
  },
  coinReward: {
    type: Number,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    trim: true
  }
}, { _id: false });

const eligibilitySchema = new mongoose.Schema({
  countries: [{
    type: String,
    trim: true
  }],
  minXPLevel: {
    type: Number,
    default: 0,
    min: 0
  },
  maxXPLevel: {
    type: Number,
    default: 999999,
    min: 0
  },
  ageRestrictions: {
    minAge: {
      type: Number,
      default: 13,
      min: 13
    },
    maxAge: {
      type: Number,
      default: 100,
      max: 100
    }
  }
}, { _id: false });

const walkathonSchema = new mongoose.Schema({
  // Week identification
  weekKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  weekStart: {
    type: Date,
    required: true,
    index: true
  },
  weekEnd: {
    type: Date,
    required: true,
    index: true
  },
  
  // Challenge configuration
  title: {
    type: String,
    required: true,
    trim: true,
    default: 'Weekly Walkathon Challenge'
  },
  description: {
    type: String,
    trim: true
  },
  
  // Reward tiers (sorted by step milestone)
  rewardTiers: [rewardTierSchema],
  
  // Eligibility criteria
  eligibility: eligibilitySchema,
  
  // Challenge status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'cancelled'],
    default: 'upcoming',
    index: true
  },
  
  // Statistics
  totalParticipants: {
    type: Number,
    default: 0
  },
  totalSteps: {
    type: Number,
    default: 0
  },
  totalRewardsClaimed: {
    type: Number,
    default: 0
  },
  
  // Configuration
  maxParticipants: {
    type: Number,
    default: null // null means unlimited
  },
  joinDeadline: {
    type: Date // If set, users can't join after this date
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  configVersion: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
walkathonSchema.index({ weekStart: 1, weekEnd: 1 });
walkathonSchema.index({ isActive: 1, status: 1 });
walkathonSchema.index({ 'eligibility.countries': 1 });

// Virtual for current week check
walkathonSchema.virtual('isCurrentWeek').get(function() {
  const now = new Date();
  return now >= this.weekStart && now <= this.weekEnd;
});

// Virtual for joinable status
walkathonSchema.virtual('isJoinable').get(function() {
  if (!this.isActive || this.status !== 'active') return false;
  if (this.joinDeadline && new Date() > this.joinDeadline) return false;
  if (this.maxParticipants && this.totalParticipants >= this.maxParticipants) return false;
  return true;
});

// Static methods
walkathonSchema.statics.getCurrentWalkathon = function() {
  const now = new Date();
  return this.findOne({
    isActive: true,
    status: 'active',
    weekStart: { $lte: now },
    weekEnd: { $gte: now }
  }).sort({ weekStart: -1 });
};

walkathonSchema.statics.getUpcomingWalkathon = function() {
  const now = new Date();
  return this.findOne({
    isActive: true,
    status: 'upcoming',
    weekStart: { $gt: now }
  }).sort({ weekStart: 1 });
};

walkathonSchema.statics.getWalkathonByWeekKey = function(weekKey) {
  return this.findOne({ weekKey, isActive: true });
};

// Instance methods
walkathonSchema.methods.checkEligibility = function(user) {
  const eligibility = this.eligibility;
  
  // Check country eligibility
  if (eligibility.countries.length > 0 && !eligibility.countries.includes(user.location?.current?.country)) {
    return {
      isEligible: false,
      reason: 'Country not supported for this walkathon'
    };
  }
  
  // Check XP level eligibility
  const userXP = user.xp?.current || 0;
  if (userXP < eligibility.minXPLevel || userXP > eligibility.maxXPLevel) {
    return {
      isEligible: false,
      reason: 'XP level not within required range'
    };
  }
  
  // Check age eligibility
  if (user.age) {
    if (user.age < eligibility.ageRestrictions.minAge || user.age > eligibility.ageRestrictions.maxAge) {
      return {
        isEligible: false,
        reason: 'Age not within required range'
      };
    }
  }
  
  return {
    isEligible: true,
    reason: null
  };
};

walkathonSchema.methods.getRewardForSteps = function(steps) {
  // Find the highest milestone reached
  const reachedTiers = this.rewardTiers
    .filter(tier => steps >= tier.stepMilestone)
    .sort((a, b) => b.stepMilestone - a.stepMilestone);
  
  return reachedTiers.length > 0 ? reachedTiers[0] : null;
};

walkathonSchema.methods.getNextMilestone = function(steps) {
  const nextTier = this.rewardTiers
    .filter(tier => steps < tier.stepMilestone)
    .sort((a, b) => a.stepMilestone - b.stepMilestone)[0];
  
  return nextTier || null;
};

walkathonSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    weekKey: this.weekKey,
    title: this.title,
    description: this.description,
    weekStart: this.weekStart,
    weekEnd: this.weekEnd,
    rewardTiers: this.rewardTiers,
    eligibility: this.eligibility,
    isActive: this.isActive,
    status: this.status,
    isCurrentWeek: this.isCurrentWeek,
    isJoinable: this.isJoinable,
    totalParticipants: this.totalParticipants,
    totalSteps: this.totalSteps,
    maxParticipants: this.maxParticipants,
    joinDeadline: this.joinDeadline,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Pre-save middleware to sort reward tiers
walkathonSchema.pre('save', function(next) {
  if (this.rewardTiers && this.rewardTiers.length > 0) {
    this.rewardTiers.sort((a, b) => a.stepMilestone - b.stepMilestone);
  }
  next();
});

const Walkathon = mongoose.model('Walkathon', walkathonSchema);

module.exports = Walkathon;



const mongoose = require('mongoose');

const xpTierSchema = new mongoose.Schema({
  tierName: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  tierColor: {
    type: String,
    required: true,
    trim: true,
    default: '#4CAF50'
  },
  bgColor: {
    type: String,
    required: true,
    trim: true,
    default: '#f8f9fa'
  },
  borderColor: {
    type: String,
    required: true,
    trim: true,
    default: '#dee2e6'
  },
  iconSrc: {
    type: String,
    required: true,
    trim: true
  },
  xpMin: {
    type: Number,
    required: true,
    min: 0
  },
  xpMax: {
    type: Number,
    required: true,
    min: 0
  },
  xpRange: {
    type: String,
    required: true,
    trim: true
  },
  badge: {
    type: String,
    required: true,
    trim: true
  },
  badgeFile: {
    type: String,
    trim: true
  },
  accessBenefits: {
    type: String,
    required: true,
    trim: true
  },
  benefits: [{
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    order: { type: Number, default: 0 }
  }],
  multipliers: {
    coins: {
      type: Number,
      default: 1.0,
      min: 0.1
    },
    xp: {
      type: Number,
      default: 1.0,
      min: 0.1
    },
    spins: {
      type: Number,
      default: 1.0,
      min: 0.1
    }
  },
  requirements: {
    minLevel: {
      type: Number,
      default: 1
    },
    vipRequired: {
      type: String,
      enum: ['free', 'bronze', 'gold', 'platinum'],
      default: 'free'
    },
    maxPerDay: {
      type: Number,
      default: null // null means unlimited
    }
  },
  status: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
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
xpTierSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-generate XP range if not provided
  if (!this.xpRange && this.xpMin !== undefined && this.xpMax !== undefined) {
    this.xpRange = `${this.xpMin} - ${this.xpMax} XP`;
  }
  
  next();
});

// Index for efficient queries
xpTierSchema.index({ tierName: 1, status: 1 });
xpTierSchema.index({ xpMin: 1, xpMax: 1 });
xpTierSchema.index({ order: 1 });

// Virtual for formatted XP range
xpTierSchema.virtual('formattedXpRange').get(function() {
  return `${this.xpMin} - ${this.xpMax} XP`;
});

// Method to check if XP value falls within this tier's range
xpTierSchema.methods.isWithinRange = function(xp) {
  return xp >= this.xpMin && xp <= this.xpMax;
};

// Method to get tier level based on XP
xpTierSchema.methods.getTierLevel = function(xp) {
  if (xp >= this.xpMin && xp <= this.xpMax) {
    const progress = (xp - this.xpMin) / (this.xpMax - this.xpMin);
    return Math.min(Math.floor(progress * 100), 100);
  }
  return 0;
};

// Static method to find tier for a given XP value
xpTierSchema.statics.findByXpValue = function(xp) {
  return this.findOne({
    xpMin: { $lte: xp },
    xpMax: { $gte: xp },
    status: true
  });
};

// Static method to get all active tiers
xpTierSchema.statics.getActiveTiers = function() {
  return this.find({ status: true }).sort({ order: 1, xpMin: 1 });
};

// Static method to get tier progression
xpTierSchema.statics.getTierProgression = function() {
  return this.find({ status: true }).sort({ xpMin: 1 });
};

// Static method to get next tier
xpTierSchema.statics.getNextTier = function(currentXp) {
  return this.findOne({
    xpMin: { $gt: currentXp },
    status: true
  }).sort({ xpMin: 1 });
};

// Static method to get previous tier
xpTierSchema.statics.getPreviousTier = function(currentXp) {
  return this.findOne({
    xpMax: { $lt: currentXp },
    status: true
  }).sort({ xpMax: -1 });
};

module.exports = mongoose.model('XPTier', xpTierSchema);

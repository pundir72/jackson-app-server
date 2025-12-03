const mongoose = require('mongoose');

const xpDecaySettingV2Schema = new mongoose.Schema({
  // XP Tier - enum dropdown: Junior, Middle, Senior
  tier: {
    type: String,
    enum: ['Junior', 'Middle', 'Senior'],
    required: true,
    unique: true,
    index: true
  },
  // XP Range - auto-populated from XPTierV2 (read-only)
  xpRange: {
    type: String,
    required: true,
    trim: true
  },
  // XP Min and Max - auto-populated from XPTierV2 (read-only)
  xpMin: {
    type: Number,
    required: true,
    min: 0
  },
  xpMax: {
    type: Number,
    required: false,
    min: 0,
    default: null // Can be null for Senior tier (300+)
  },
  // Decay Rule Type: Fixed or Stepwise
  decayRuleType: {
    type: String,
    enum: ['Fixed', 'Stepwise'],
    required: true,
    default: 'Fixed'
  },
  // XP Deduction amount
  xpDeduction: {
    type: Number,
    required: true,
    min: 0
  },
  // Inactive Duration in days
  inactiveDuration: {
    type: Number,
    required: true,
    min: 1
  },
  // Minimum XP Limit - decay stops after hitting this XP
  minimumXpLimit: {
    type: Number,
    required: true,
    min: 0
  },
  // Active/Inactive toggle
  status: {
    type: Boolean,
    default: true,
    index: true
  },
  // Optional Send Notification toggle
  sendNotification: {
    type: Boolean,
    default: true
  },
  // Notification message (optional)
  notificationMessage: {
    type: String,
    trim: true,
    default: 'Your XP will decay due to inactivity. Stay active to maintain your tier!'
  },
  // Version tracking
  version: {
    type: Number,
    default: 2
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

// Pre-save hook
xpDecaySettingV2Schema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
xpDecaySettingV2Schema.index({ tier: 1 }, { unique: true });
xpDecaySettingV2Schema.index({ status: 1 });
xpDecaySettingV2Schema.index({ decayRuleType: 1 });

// Virtual for formatted XP range
xpDecaySettingV2Schema.virtual('formattedXpRange').get(function() {
  if (this.xpMax === null || this.xpMax === undefined || this.xpMax === Infinity) {
    return `${this.xpMin}+`;
  }
  return `${this.xpMin} - ${this.xpMax}`;
});

// Method to check if XP value falls within this tier's range
xpDecaySettingV2Schema.methods.isWithinRange = function(xp) {
  if (this.xpMax === null || this.xpMax === undefined || this.xpMax === Infinity) {
    return xp >= this.xpMin;
  }
  return xp >= this.xpMin && xp <= this.xpMax;
};

// Method to calculate decay amount (ensures it never goes below minimum XP limit)
xpDecaySettingV2Schema.methods.calculateDecay = function(currentXp) {
  // Don't decay if already at or below minimum limit
  if (currentXp <= this.minimumXpLimit) {
    return {
      canDecay: false,
      decayAmount: 0,
      newXp: currentXp,
      reason: 'Already at or below minimum XP limit'
    };
  }

  let decayAmount = 0;
  
  if (this.decayRuleType === 'Fixed') {
    // Fixed: Deduct a fixed XP amount once
    decayAmount = this.xpDeduction;
  } else if (this.decayRuleType === 'Stepwise') {
    // Stepwise: Deduct per step/day
    decayAmount = this.xpDeduction;
  }

  // Calculate new XP after decay
  const newXp = Math.max(currentXp - decayAmount, this.minimumXpLimit);
  
  // Adjust decay amount if it would go below minimum
  const actualDecay = currentXp - newXp;

  return {
    canDecay: actualDecay > 0,
    decayAmount: actualDecay,
    newXp: newXp,
    reason: actualDecay < decayAmount ? 'Limited by minimum XP limit' : null
  };
};

// Static method to find decay setting for a given tier
xpDecaySettingV2Schema.statics.findByTier = function(tier) {
  return this.findOne({ tier, status: true });
};

// Static method to find decay setting for a given XP value
xpDecaySettingV2Schema.statics.findByXpValue = function(xp) {
  return this.findOne({
    $and: [
      { xpMin: { $lte: xp } },
      {
        $or: [
          { xpMax: { $gte: xp } },
          { xpMax: null },
          { xpMax: { $exists: false } }
        ]
      },
      { status: true }
    ]
  }).sort({ xpMin: -1 }); // Sort descending to get the highest matching tier first
};

// Static method to get all active decay settings
xpDecaySettingV2Schema.statics.getActiveSettings = function() {
  return this.find({ status: true }).sort({ xpMin: 1 });
};

module.exports = mongoose.model('XPDecaySettingV2', xpDecaySettingV2Schema);


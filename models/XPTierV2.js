const mongoose = require('mongoose');

const xpTierV2Schema = new mongoose.Schema({
  // Only 3 tiers allowed: Junior, Middle, Senior
  tier: {
    type: String,
    enum: ['Junior', 'Middle', 'Senior'],
    required: true,
    unique: true,
    index: true
  },
  // Min-Max XP range
  xpMin: {
    type: Number,
    required: true,
    min: 0
  },
  xpMax: {
    type: Number,
    required: true,
    min: 0,
    // For Senior tier, xpMax can be null/Infinity to represent 300+
    default: null
  },
  // Auto-populated XP range string (read-only)
  xpRange: {
    type: String,
    required: true,
    trim: true
  },
  // Access Benefit - auto-populated from Daily Challenger Bonus → XP Multiplier
  // This is read-only and fetched from XPMultiplier model
  accessBenefit: {
    type: String,
    required: true,
    trim: true,
    default: '1.0x' // Default, will be auto-populated from XPMultiplier
  },
  // Status: Active/Inactive
  status: {
    type: Boolean,
    default: true,
    index: true
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

  // Pre-save hook to auto-generate XP range string
xpTierV2Schema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // For Senior tier, if xpMax is 0 or null/undefined, set it to null (represents 300+)
  if (this.tier === 'Senior' && (this.xpMax === 0 || this.xpMax === null || this.xpMax === undefined)) {
    this.xpMax = null;
  }
  
  // Auto-generate XP range string
  if (this.xpMax === null || this.xpMax === undefined || this.xpMax === Infinity) {
    this.xpRange = `${this.xpMin}+`;
  } else {
    this.xpRange = `${this.xpMin} - ${this.xpMax}`;
  }
  
  next();
});

// Indexes for efficient queries
xpTierV2Schema.index({ tier: 1 }, { unique: true });
xpTierV2Schema.index({ xpMin: 1, xpMax: 1 });
xpTierV2Schema.index({ status: 1 });

// Virtual for formatted XP range
xpTierV2Schema.virtual('formattedXpRange').get(function() {
  if (this.xpMax === null || this.xpMax === undefined || this.xpMax === Infinity) {
    return `${this.xpMin}+`;
  }
  return `${this.xpMin} - ${this.xpMax}`;
});

// Method to check if XP value falls within this tier's range
xpTierV2Schema.methods.isWithinRange = function(xp) {
  if (this.xpMax === null || this.xpMax === undefined || this.xpMax === Infinity) {
    return xp >= this.xpMin;
  }
  return xp >= this.xpMin && xp <= this.xpMax;
};

// Static method to find tier for a given XP value
// Returns the tier that the XP value falls within based on configured ranges
xpTierV2Schema.statics.findByXpValue = async function(xp) {
  const xpValue = Number(xp) || 0;
  
  // Get all active tiers sorted by xpMin ascending
  const allTiers = await this.find({ status: true }).sort({ xpMin: 1 }).lean();
  
  if (allTiers.length === 0) {
    return null;
  }
  
  // Find the tier where xpMin <= xpValue and (xpMax >= xpValue OR xpMax is null for Senior tier)
  // If multiple tiers match, prefer the one with the highest xpMin (most specific tier)
  let matchingTier = null;
  let highestMin = -1;
  
  for (const tier of allTiers) {
    const minMatch = tier.xpMin <= xpValue;
    const maxMatch = tier.xpMax === null || tier.xpMax === undefined || tier.xpMax >= xpValue;
    
    if (minMatch && maxMatch && tier.xpMin > highestMin) {
      matchingTier = tier;
      highestMin = tier.xpMin;
    }
  }
  
  // If no exact match found, return the highest tier (Senior) if xpValue exceeds all max values
  if (!matchingTier) {
    // Check if xpValue is higher than all max values (except null)
    const tiersWithMax = allTiers.filter(t => t.xpMax !== null && t.xpMax !== undefined);
    if (tiersWithMax.length > 0) {
      const maxMaxValue = Math.max(...tiersWithMax.map(t => t.xpMax));
      if (xpValue > maxMaxValue) {
        // Return Senior tier (the one with null xpMax or highest xpMin)
        matchingTier = allTiers.find(t => t.xpMax === null || t.xpMax === undefined) || 
                       allTiers[allTiers.length - 1];
      }
    } else {
      // All tiers have null xpMax (shouldn't happen, but handle it)
      // Return the tier with highest xpMin
      matchingTier = allTiers[allTiers.length - 1];
    }
  }
  
  return matchingTier ? this.findById(matchingTier._id) : null;
};

// Static method to get all active tiers
xpTierV2Schema.statics.getActiveTiers = function() {
  return this.find({ status: true }).sort({ xpMin: 1 });
};

// Static method to get tier by enum value
xpTierV2Schema.statics.findByTier = function(tier) {
  return this.findOne({ tier, status: true });
};

// Static method to get next tier
xpTierV2Schema.statics.getNextTier = function(currentXp) {
  return this.findOne({
    xpMin: { $gt: currentXp },
    status: true
  }).sort({ xpMin: 1 });
};

// Static method to get previous tier
xpTierV2Schema.statics.getPreviousTier = function(currentXp) {
  return this.findOne({
    $or: [
      { xpMax: { $lt: currentXp } },
      { xpMax: null, xpMin: { $lt: currentXp } }
    ],
    status: true
  }).sort({ xpMin: -1 });
};

module.exports = mongoose.model('XPTierV2', xpTierV2Schema);


const mongoose = require('mongoose');

const vipTierSchema = new mongoose.Schema({
  tierId: { 
    type: String, 
    unique: true, 
    required: true,
    enum: ['bronze', 'gold', 'platinum']
  },
  name: { 
    type: String, 
    required: true 
  },
  description: {
    type: String,
    required: true
  },
  benefits: [{
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, required: true },
    order: { type: Number, default: 0 }
  }],
  pricing: {
    monthly: { 
      type: Number, 
      required: true,
      min: 0
    },
    yearly: { 
      type: Number, 
      required: true,
      min: 0
    },
    currency: { 
      type: String, 
      default: 'USD' 
    }
  },
  features: {
    noAds: { type: Boolean, default: false },
    xpMultiplier: { type: Number, default: 1.0 },
    weeklyXpBonus: { type: Number, default: 0 },
    bonusSpins: { type: Number, default: 0 },
    prioritySupport: { type: Boolean, default: false },
    earlyAccess: { type: Boolean, default: false },
    unlimitedSpins: { type: Boolean, default: false }
  },
  order: { 
    type: Number, 
    required: true,
    unique: true
  },
  active: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update the updatedAt field before saving
vipTierSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
vipTierSchema.index({ tierId: 1, active: 1 });
vipTierSchema.index({ order: 1 });

// Static method to get all active tiers
vipTierSchema.statics.getActiveTiers = function() {
  return this.find({ active: true }).sort({ order: 1 });
};

// Static method to get tier by ID
vipTierSchema.statics.getTierById = function(tierId) {
  return this.findOne({ tierId, active: true });
};

// Instance method to get formatted pricing
vipTierSchema.methods.getFormattedPricing = function() {
  return {
    monthly: {
      amount: this.pricing.monthly,
      currency: this.pricing.currency,
      formatted: `${this.pricing.currency} ${this.pricing.monthly.toFixed(2)}`
    },
    yearly: {
      amount: this.pricing.yearly,
      currency: this.pricing.currency,
      formatted: `${this.pricing.currency} ${this.pricing.yearly.toFixed(2)}`
    }
  };
};

// Instance method to get benefits summary
vipTierSchema.methods.getBenefitsSummary = function() {
  return this.benefits.map(benefit => ({
    id: benefit.id,
    title: benefit.title,
    description: benefit.description,
    icon: benefit.icon
  }));
};

module.exports = mongoose.model('VIPTier', vipTierSchema);



const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  sdkProvider: {
    type: String,
    required: true,
    enum: ['bitlabs', 'adgem', 'besitos', 'cpx', 'ayet', 'unity', 'ironsource']
  },
  tierAccess: [{
    type: String,
    enum: ['free', 'bronze', 'silver', 'gold', 'platinum']
  }],
  countries: [{
    type: String,
    required: true
  }],
  expiryDate: {
    type: Date,
    required: true
  },
  isAdSupported: {
    type: Boolean,
    default: false
  },
  xptrRule: {
    type: String,
    required: true
  },
  reward: {
    coins: {
      type: Number,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    estimatedTimeMinutes: {
      type: Number,
      default: 5
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'easy'
    },
    category: {
      type: String,
      enum: ['survey', 'game', 'ad', 'challenge'],
      default: 'survey'
    },
    imageUrl: String,
    deepLink: String,
    trackingId: String
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
offerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
offerSchema.index({ name: 1 });
offerSchema.index({ sdkProvider: 1, isActive: 1 });
offerSchema.index({ countries: 1 });
offerSchema.index({ tierAccess: 1 });
offerSchema.index({ expiryDate: 1 });
offerSchema.index({ createdAt: -1 });

// Static methods
offerSchema.statics.findActive = function() {
  return this.find({ 
    isActive: true, 
    expiryDate: { $gt: new Date() } 
  }).sort({ createdAt: -1 });
};

offerSchema.statics.findByCountry = function(country) {
  return this.find({ 
    countries: country,
    isActive: true,
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

offerSchema.statics.findByTier = function(tier) {
  return this.find({ 
    tierAccess: { $in: [tier, 'free'] },
    isActive: true,
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

// Instance methods
offerSchema.methods.isExpired = function() {
  return new Date() > this.expiryDate;
};

offerSchema.methods.isEligibleForTier = function(tier) {
  return this.tierAccess.includes(tier) || this.tierAccess.includes('free');
};

offerSchema.methods.isEligibleForCountry = function(country) {
  return this.countries.includes(country);
};

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;


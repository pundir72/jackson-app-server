const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  offerId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
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
  },
  tierAccess: [{
    type: String,
    enum: ['free', 'bronze', 'silver', 'gold', 'platinum']
  }],
  countries: [{
    type: String,
    required: true
  }],
  cities: [{
    type: String,
    trim: true
  }],
  startDate: {
    type: Date,
    default: Date.now
  },
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
  isDefaultFallback: {
    type: Boolean,
    default: false
  },
  // Optional UI placement hint (e.g., featured_row, banner, carousel)
  uiSection: { type: String, trim: true },
  // Targeting & Segmentation
  ageGroup: {
    type: String,
    trim: true
  },
  ageGroups: [{
    type: String,
    // enum: ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
  }],
  gender: {
    type: String,
    // enum: ['male', 'female', 'all']
  },
  marketingChannel: {
    type: String,
    trim: true
  },
  campaignName: {
    type: String,
    trim: true
  },
  xpTier: {
    type: Number,
    min: 1,
    max: 10,
    default: 1
  },
  // Creative Management
  creative: {
    offerCard: {
      imageUrl: String,
      layout: {
        type: String,
        // enum: ['standard', 'compact', 'featured'],
        default: 'standard'
      },
      dimensions: {
        width: { type: Number, default: 320 },
        height: { type: Number, default: 180 }
      }
    },
    additionalAssets: [{
      type: {
        type: String,
        // enum: ['banner', 'icon', 'screenshot', 'video']
      },
      url: String,
      altText: String
    }]
  },
  metadata: {
    estimatedTimeMinutes: {
      type: Number,
      default: 5
    },
    difficulty: {
      type: String,
      // enum: ['easy', 'medium', 'hard'],
      default: 'easy'
    },
    category: {
      type: String,
      // enum: ['survey', 'game', 'ad', 'challenge', 'puzzle', 'trivia', 'casual', 'strategy'],
      default: 'survey'
    },
    imageUrl: String,
    deepLink: String,
    trackingId: String
  },
  // Linked game info snapshot for display/use
  gameDetails: {
    id: { type: String, trim: true },
    name: { type: String, trim: true },
    description: { type: String, trim: true },
    image: { type: String, trim: true },
    square_image: { type: String, trim: true },
    large_image: { type: String, trim: true },
    category: { type: String, trim: true },
    downloadUrl: { type: String, trim: true }
  },
  deviceType: {
    type: String,
    default: "android"
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
offerSchema.pre('save', function (next) {
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
// Compound unique index to allow variants per offerId by targeting
offerSchema.index(
  { offerId: 1, gender: 1, uiSection: 1, ageGroup: 1 },
  { unique: true }
);

// Static methods
offerSchema.statics.findActive = function () {
  return this.find({
    isActive: true,
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

offerSchema.statics.findByCountry = function (country) {
  return this.find({
    countries: country,
    isActive: true,
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

offerSchema.statics.findByTier = function (tier) {
  return this.find({
    tierAccess: { $in: [tier, 'free'] },
    isActive: true,
    expiryDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

// Instance methods
offerSchema.methods.isExpired = function () {
  return new Date() > this.expiryDate;
};

offerSchema.methods.isEligibleForTier = function (tier) {
  return this.tierAccess.includes(tier) || this.tierAccess.includes('free');
};

offerSchema.methods.isEligibleForCountry = function (country) {
  return this.countries.includes(country);
};

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;


const mongoose = require('mongoose');

const tremendousCampaignSchema = new mongoose.Schema({
  // Tremendous campaign details
  tremendousCampaignId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Campaign details
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  
  // Funding and products
  fundingSourceId: {
    type: String,
    required: true
  },
  products: [{
    type: String,
    required: true
  }],
  
  // Delivery settings
  delivery: {
    method: {
      type: String,
      enum: ['LINK', 'EMAIL', 'SMS'],
      default: 'LINK'
    },
    messageSubject: String,
    messageBody: String
  },
  
  // Value settings
  valueType: {
    type: String,
    enum: ['fixed', 'variable'],
    default: 'fixed'
  },
  value: {
    denomination: {
      type: Number,
      required: true
    }
  },
  currencyCode: {
    type: String,
    required: true,
    default: 'USD'
  },
  
  // Limits and settings
  redemptionLimit: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Statistics
  stats: {
    totalOrders: {
      type: Number,
      default: 0
    },
    totalValue: {
      type: Number,
      default: 0
    },
    totalRedemptions: {
      type: Number,
      default: 0
    }
  },
  
  // Metadata
  meta: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Tremendous response data
  tremendousData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Timestamps
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
tremendousCampaignSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
tremendousCampaignSchema.index({ tremendousCampaignId: 1 });
tremendousCampaignSchema.index({ isActive: 1 });
tremendousCampaignSchema.index({ createdAt: -1 });

// Static methods
tremendousCampaignSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

tremendousCampaignSchema.statics.findByTremendousId = function(tremendousCampaignId) {
  return this.findOne({ tremendousCampaignId });
};

// Instance methods
tremendousCampaignSchema.methods.incrementStats = function(orderValue) {
  this.stats.totalOrders += 1;
  this.stats.totalValue += orderValue;
  this.stats.totalRedemptions += 1;
  return this.save();
};

tremendousCampaignSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

const TremendousCampaign = mongoose.model('TremendousCampaign', tremendousCampaignSchema);

module.exports = TremendousCampaign;


const mongoose = require('mongoose');

const tremendousOrganizationSchema = new mongoose.Schema({
  // Tremendous organization details
  tremendousOrganizationId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Organization details
  name: {
    type: String,
    required: true
  },
  website: {
    type: String
  },
  
  // API settings
  withApiKey: {
    type: Boolean,
    default: true
  },
  apiKey: {
    type: String,
    select: false // Don't include in queries by default for security
  },
  
  // Copy settings
  copySettings: {
    campaigns: {
      type: Boolean,
      default: true
    },
    customFields: {
      type: Boolean,
      default: true
    },
    orderApprovals: {
      type: Boolean,
      default: true
    },
    paymentMethods: {
      type: Boolean,
      default: true
    },
    securitySettings: {
      type: Boolean,
      default: true
    },
    users: {
      type: Boolean,
      default: true
    },
    customRoles: {
      type: Boolean,
      default: true
    },
    fraudPrevention: {
      type: Boolean,
      default: true
    },
    taxManagement: {
      type: Boolean,
      default: true
    }
  },
  
  // Status
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
    totalCampaigns: {
      type: Number,
      default: 0
    }
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
tremendousOrganizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
tremendousOrganizationSchema.index({ tremendousOrganizationId: 1 });
tremendousOrganizationSchema.index({ isActive: 1 });
tremendousOrganizationSchema.index({ createdAt: -1 });

// Static methods
tremendousOrganizationSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

tremendousOrganizationSchema.statics.findByTremendousId = function(tremendousOrganizationId) {
  return this.findOne({ tremendousOrganizationId });
};

// Instance methods
tremendousOrganizationSchema.methods.updateApiKey = function(apiKey) {
  this.apiKey = apiKey;
  return this.save();
};

tremendousOrganizationSchema.methods.incrementStats = function(orderValue) {
  this.stats.totalOrders += 1;
  this.stats.totalValue += orderValue;
  return this.save();
};

tremendousOrganizationSchema.methods.incrementCampaigns = function() {
  this.stats.totalCampaigns += 1;
  return this.save();
};

const TremendousOrganization = mongoose.model('TremendousOrganization', tremendousOrganizationSchema);

module.exports = TremendousOrganization;


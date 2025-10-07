const mongoose = require('mongoose');

const surveySDKSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  apiKey: {
    type: String,
    required: true,
    trim: true
  },
  apiSecret: {
    type: String,
    trim: true
  },
  baseUrl: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  maxDailyUsers: {
    type: Number,
    default: null,
    min: 1
  },
  segmentRules: {
    age: [{
      type: String,
      enum: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+']
    }],
    gender: [{
      type: String,
      enum: ['male', 'female', 'other']
    }],
    countries: [{
      type: String,
      trim: true
    }],
    isEnabled: {
      type: Boolean,
      default: false
    }
  },
  configuration: {
    timeout: {
      type: Number,
      default: 30000, // 30 seconds
      min: 5000,
      max: 300000
    },
    retryAttempts: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    cacheDuration: {
      type: Number,
      default: 300, // 5 minutes
      min: 60,
      max: 3600
    },
    rewardMultiplier: {
      type: Number,
      default: 1.0,
      min: 0.1,
      max: 5.0
    }
  },
  analytics: {
    totalOffers: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    },
    totalStarts: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    totalCoinsIssued: {
      type: Number,
      default: 0
    },
    lastSyncAt: {
      type: Date,
      default: Date.now
    }
  },
  metadata: {
    description: String,
    category: {
      type: String,
      enum: ['surveys', 'offers', 'quizzes', 'downloads', 'subscriptions']
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    tags: [String],
    notes: String
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
surveySDKSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
surveySDKSchema.index({ name: 1 });
surveySDKSchema.index({ isActive: 1 });
surveySDKSchema.index({ 'segmentRules.isEnabled': 1 });
surveySDKSchema.index({ createdAt: -1 });

// Static methods
surveySDKSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: 1 });
};

surveySDKSchema.statics.findByName = function(name) {
  return this.findOne({ name: name.toLowerCase() });
};

surveySDKSchema.statics.findBySegment = function(segmentCriteria) {
  const query = { isActive: true, 'segmentRules.isEnabled': true };
  
  if (segmentCriteria.age) {
    query['segmentRules.age'] = { $in: segmentCriteria.age };
  }
  
  if (segmentCriteria.gender) {
    query['segmentRules.gender'] = { $in: segmentCriteria.gender };
  }
  
  if (segmentCriteria.countries) {
    query['segmentRules.countries'] = { $in: segmentCriteria.countries };
  }
  
  return this.find(query);
};

// Instance methods
surveySDKSchema.methods.matchesUserSegment = function(userProfile) {
  if (!this.segmentRules.isEnabled) {
    return true; // No segment restrictions
  }
  
  // Check age
  if (this.segmentRules.age && this.segmentRules.age.length > 0) {
    const userAgeGroup = this.getAgeGroup(userProfile.age);
    if (!this.segmentRules.age.includes(userAgeGroup)) {
      return false;
    }
  }
  
  // Check gender
  if (this.segmentRules.gender && this.segmentRules.gender.length > 0) {
    if (!this.segmentRules.gender.includes(userProfile.gender)) {
      return false;
    }
  }
  
  // Check country
  if (this.segmentRules.countries && this.segmentRules.countries.length > 0) {
    if (!this.segmentRules.countries.includes(userProfile.country)) {
      return false;
    }
  }
  
  return true;
};

surveySDKSchema.methods.getAgeGroup = function(age) {
  if (age >= 18 && age <= 24) return '18-24';
  if (age >= 25 && age <= 34) return '25-34';
  if (age >= 35 && age <= 44) return '35-44';
  if (age >= 45 && age <= 54) return '45-54';
  if (age >= 55 && age <= 64) return '55-64';
  if (age >= 65) return '65+';
  return '18-24'; // Default
};

surveySDKSchema.methods.updateAnalytics = function(metrics) {
  this.analytics.totalOffers += metrics.offers || 0;
  this.analytics.totalViews += metrics.views || 0;
  this.analytics.totalStarts += metrics.starts || 0;
  this.analytics.totalCompletions += metrics.completions || 0;
  this.analytics.totalCoinsIssued += metrics.coinsIssued || 0;
  this.analytics.lastSyncAt = Date.now();
  
  return this.save();
};

surveySDKSchema.methods.isWithinDailyLimit = function() {
  if (!this.maxDailyUsers) {
    return true;
  }
  
  // This would need to be implemented with actual usage tracking
  // For now, return true
  return true;
};

const SurveySDK = mongoose.model('SurveySDK', surveySDKSchema);

module.exports = SurveySDK;


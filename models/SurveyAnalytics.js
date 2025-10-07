const mongoose = require('mongoose');

const surveyAnalyticsSchema = new mongoose.Schema({
  sdkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurveySDK',
    required: true
  },
  offerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SurveyOffer'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  eventType: {
    type: String,
    required: true,
    enum: ['view', 'start', 'complete', 'abandon', 'reward_issued', 'error']
  },
  eventData: {
    timestamp: {
      type: Date,
      default: Date.now
    },
    sessionId: String,
    deviceInfo: {
      platform: String,
      version: String,
      model: String
    },
    location: {
      country: String,
      region: String,
      city: String
    },
    userSegment: {
      age: String,
      gender: String,
      xpTier: String
    },
    completionTime: Number, // in seconds
    coinsEarned: Number,
    errorMessage: String,
    additionalData: mongoose.Schema.Types.Mixed
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    referrer: String,
    campaignId: String,
    source: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
surveyAnalyticsSchema.index({ sdkId: 1, eventType: 1 });
surveyAnalyticsSchema.index({ offerId: 1, eventType: 1 });
surveyAnalyticsSchema.index({ userId: 1, eventType: 1 });
surveyAnalyticsSchema.index({ createdAt: -1 });
surveyAnalyticsSchema.index({ 'eventData.timestamp': -1 });

// Compound indexes for analytics queries
surveyAnalyticsSchema.index({ sdkId: 1, createdAt: -1 });
surveyAnalyticsSchema.index({ offerId: 1, createdAt: -1 });
surveyAnalyticsSchema.index({ eventType: 1, createdAt: -1 });

// Static methods
surveyAnalyticsSchema.statics.getSDKPerformance = function(sdkId, startDate, endDate) {
  const query = { sdkId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        totalCoins: { $sum: '$eventData.coinsEarned' },
        avgCompletionTime: { $avg: '$eventData.completionTime' }
      }
    }
  ]);
};

surveyAnalyticsSchema.statics.getOfferPerformance = function(offerId, startDate, endDate) {
  const query = { offerId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        totalCoins: { $sum: '$eventData.coinsEarned' },
        avgCompletionTime: { $avg: '$eventData.completionTime' }
      }
    }
  ]);
};

surveyAnalyticsSchema.statics.getUserEngagement = function(userId, startDate, endDate) {
  const query = { userId };
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  return this.find(query)
    .populate('sdkId', 'name displayName')
    .populate('offerId', 'title coinReward')
    .sort({ createdAt: -1 });
};

surveyAnalyticsSchema.statics.getConversionFunnel = function(sdkId, offerId, startDate, endDate) {
  const matchQuery = {};
  
  if (sdkId) matchQuery.sdkId = sdkId;
  if (offerId) matchQuery.offerId = offerId;
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $project: {
        eventType: '$_id',
        count: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        _id: 0
      }
    }
  ]);
};

surveyAnalyticsSchema.statics.getTopPerformers = function(limit = 10, startDate, endDate) {
  const matchQuery = { eventType: 'complete' };
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$offerId',
        completions: { $sum: 1 },
        totalCoins: { $sum: '$eventData.coinsEarned' },
        avgCompletionTime: { $avg: '$eventData.completionTime' }
      }
    },
    { $sort: { completions: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'surveyoffers',
        localField: '_id',
        foreignField: '_id',
        as: 'offer'
      }
    },
    { $unwind: '$offer' },
    {
      $project: {
        offerId: '$_id',
        title: '$offer.title',
        completions: 1,
        totalCoins: 1,
        avgCompletionTime: 1,
        conversionRate: '$offer.analytics.conversionRate'
      }
    }
  ]);
};

surveyAnalyticsSchema.statics.getSegmentedPerformance = function(segmentType, startDate, endDate) {
  const matchQuery = {};
  
  if (startDate || endDate) {
    matchQuery.createdAt = {};
    if (startDate) matchQuery.createdAt.$gte = startDate;
    if (endDate) matchQuery.createdAt.$lte = endDate;
  }
  
  const groupField = `eventData.userSegment.${segmentType}`;
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          segment: `$${groupField}`,
          eventType: '$eventType'
        },
        count: { $sum: 1 },
        totalCoins: { $sum: '$eventData.coinsEarned' }
      }
    },
    {
      $group: {
        _id: '$_id.segment',
        events: {
          $push: {
            eventType: '$_id.eventType',
            count: '$count',
            totalCoins: '$totalCoins'
          }
        }
      }
    }
  ]);
};

// Instance methods
surveyAnalyticsSchema.methods.isConversionEvent = function() {
  return ['complete', 'reward_issued'].includes(this.eventType);
};

surveyAnalyticsSchema.methods.getEventValue = function() {
  switch (this.eventType) {
    case 'view':
      return 0;
    case 'start':
      return 1;
    case 'complete':
      return 2;
    case 'abandon':
      return -1;
    case 'reward_issued':
      return this.eventData.coinsEarned || 0;
    default:
      return 0;
  }
};

const SurveyAnalytics = mongoose.model('SurveyAnalytics', surveyAnalyticsSchema);

module.exports = SurveyAnalytics;


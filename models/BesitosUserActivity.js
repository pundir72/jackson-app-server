/**
 * Besitos User Activity Model
 * Tracks user interactions with Besitos offers and surveys
 * @module models/BesitosUserActivity
 */

const mongoose = require('mongoose');

const besitosUserActivitySchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Besitos user ID
    besitosUserId: {
        type: String,
        required: true,
        index: true
    },

    // Activity type
    activityType: {
        type: String,
        enum: [
            'offer_viewed',
            'offer_clicked', 
            'offer_started',
            'offer_completed',
            'survey_viewed',
            'survey_started',
            'survey_completed',
            'survey_screened_out',
            'profiling_started',
            'profiling_completed',
            'conversion_tracked'
        ],
        required: true,
        index: true
    },

    // Offer/Survey details
    offerId: {
        type: String,
        index: true
    },

    offerName: String,

    offerType: {
        type: String,
        enum: ['game', 'survey', 'app_install', 'purchase', 'registration', 'other']
    },

    // Activity metadata
    metadata: {
        // Device info
        platform: String,
        deviceType: String,
        osVersion: String,
        appVersion: String,

        // Location
        country: String,
        city: String,
        ip: String,

        // Session info
        sessionId: String,
        duration: Number, // in seconds

        // Additional data
        additionalData: mongoose.Schema.Types.Mixed
    },

    // Rewards expected
    expectedReward: {
        coins: {
            type: Number,
            default: 0
        },
        xp: {
            type: Number,
            default: 0
        }
    },

    // Status
    status: {
        type: String,
        enum: ['initiated', 'in_progress', 'completed', 'failed', 'cancelled'],
        default: 'initiated',
        index: true
    },

    // Completion info
    completedAt: Date,

    // Error tracking
    error: {
        message: String,
        code: String,
        timestamp: Date
    },

    // Reference to conversion if exists
    conversionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BesitosConversion'
    }

}, {
    timestamps: true
});

// Indexes
besitosUserActivitySchema.index({ userId: 1, activityType: 1 });
besitosUserActivitySchema.index({ userId: 1, createdAt: -1 });
besitosUserActivitySchema.index({ offerId: 1, activityType: 1 });
besitosUserActivitySchema.index({ besitosUserId: 1, offerId: 1 });
besitosUserActivitySchema.index({ status: 1, createdAt: -1 });

// Methods

/**
 * Mark activity as completed
 */
besitosUserActivitySchema.methods.markCompleted = async function() {
    this.status = 'completed';
    this.completedAt = new Date();
    return await this.save();
};

/**
 * Mark activity as failed
 */
besitosUserActivitySchema.methods.markFailed = async function(errorMessage, errorCode) {
    this.status = 'failed';
    this.error = {
        message: errorMessage,
        code: errorCode,
        timestamp: new Date()
    };
    return await this.save();
};

/**
 * Update status
 */
besitosUserActivitySchema.methods.updateStatus = async function(newStatus) {
    this.status = newStatus;
    if (newStatus === 'completed') {
        this.completedAt = new Date();
    }
    return await this.save();
};

// Statics

/**
 * Track user activity
 */
besitosUserActivitySchema.statics.trackActivity = async function(data) {
    return await this.create(data);
};

/**
 * Get user activities
 */
besitosUserActivitySchema.statics.getUserActivities = async function(userId, activityType = null, limit = 50) {
    const query = { userId };
    if (activityType) {
        query.activityType = activityType;
    }
    return await this.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);
};

/**
 * Get activity stats for user
 */
besitosUserActivitySchema.statics.getUserStats = async function(userId, startDate = null, endDate = null) {
    const matchQuery = { userId: mongoose.Types.ObjectId(userId) };
    
    if (startDate || endDate) {
        matchQuery.createdAt = {};
        if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
        if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    return await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$activityType',
                count: { $sum: 1 },
                totalExpectedCoins: { $sum: '$expectedReward.coins' },
                totalExpectedXP: { $sum: '$expectedReward.xp' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Get offer performance
 */
besitosUserActivitySchema.statics.getOfferPerformance = async function(offerId) {
    return await this.aggregate([
        { $match: { offerId } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$count' },
                breakdown: {
                    $push: {
                        status: '$_id',
                        count: '$count'
                    }
                }
            }
        }
    ]);
};

/**
 * Get conversion funnel
 */
besitosUserActivitySchema.statics.getConversionFunnel = async function(offerId) {
    return await this.aggregate([
        { $match: { offerId } },
        {
            $group: {
                _id: '$activityType',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

/**
 * Clean old activities (data retention)
 */
besitosUserActivitySchema.statics.cleanOldActivities = async function(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const result = await this.deleteMany({
        createdAt: { $lt: cutoffDate },
        status: { $in: ['completed', 'failed', 'cancelled'] }
    });
    
    return result;
};

const BesitosUserActivity = mongoose.model('BesitosUserActivity', besitosUserActivitySchema);

module.exports = BesitosUserActivity;


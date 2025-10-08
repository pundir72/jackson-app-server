/**
 * Besitos Conversion Model
 * Tracks conversions and user activity from Besitos platform
 * @module models/BesitosConversion
 */

const mongoose = require('mongoose');

const besitosConversionSchema = new mongoose.Schema({
    // User reference
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Besitos specific IDs
    besitosUserId: {
        type: String,
        required: true,
        index: true
    },

    // Offer/Campaign details
    offerId: {
        type: String,
        required: true,
        index: true
    },

    offerName: {
        type: String,
        required: true
    },

    offerType: {
        type: String,
        enum: ['game', 'survey', 'app_install', 'purchase', 'registration', 'other'],
        default: 'other'
    },

    // Conversion details
    conversionStatus: {
        type: String,
        enum: ['pending', 'completed', 'rejected', 'reversed', 'cancelled'],
        default: 'pending',
        index: true
    },

    conversionId: {
        type: String,
        unique: true,
        sparse: true
    },

    // Rewards
    rewardAmount: {
        type: Number,
        default: 0
    },

    rewardCurrency: {
        type: String,
        default: 'coins'
    },

    // User credited amount in our system
    creditedCoins: {
        type: Number,
        default: 0
    },

    creditedXP: {
        type: Number,
        default: 0
    },

    isCredited: {
        type: Boolean,
        default: false
    },

    creditedAt: {
        type: Date
    },

    // Timestamps
    eventTimestamp: {
        type: Date,
        required: true
    },

    completedAt: {
        type: Date
    },

    // Metadata
    metadata: {
        platform: String,
        country: String,
        deviceType: String,
        ip: String,
        userAgent: String,
        additionalData: mongoose.Schema.Types.Mixed
    },

    // Revenue tracking
    revenue: {
        amount: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            default: 'USD'
        }
    },

    // Postback info
    postbackUrl: String,
    postbackSent: {
        type: Boolean,
        default: false
    },
    postbackSentAt: Date,
    postbackResponse: mongoose.Schema.Types.Mixed,

    // Error tracking
    errors: [{
        message: String,
        code: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],

    // Notes
    notes: String

}, {
    timestamps: true
});

// Indexes for performance
besitosConversionSchema.index({ userId: 1, conversionStatus: 1 });
besitosConversionSchema.index({ userId: 1, createdAt: -1 });
besitosConversionSchema.index({ offerId: 1, conversionStatus: 1 });
besitosConversionSchema.index({ eventTimestamp: -1 });
besitosConversionSchema.index({ besitosUserId: 1, offerId: 1 });

// Virtual for conversion age
besitosConversionSchema.virtual('conversionAge').get(function() {
    if (this.completedAt) {
        return this.completedAt - this.eventTimestamp;
    }
    return Date.now() - this.eventTimestamp;
});

// Methods

/**
 * Mark conversion as completed
 */
besitosConversionSchema.methods.markCompleted = async function() {
    this.conversionStatus = 'completed';
    this.completedAt = new Date();
    return await this.save();
};

/**
 * Mark conversion as rejected
 */
besitosConversionSchema.methods.markRejected = async function(reason) {
    this.conversionStatus = 'rejected';
    if (reason) {
        this.errors.push({
            message: reason,
            code: 'REJECTION',
            timestamp: new Date()
        });
    }
    return await this.save();
};

/**
 * Credit rewards to user
 */
besitosConversionSchema.methods.creditRewards = async function(coins, xp) {
    this.creditedCoins = coins || 0;
    this.creditedXP = xp || 0;
    this.isCredited = true;
    this.creditedAt = new Date();
    return await this.save();
};

/**
 * Add error log
 */
besitosConversionSchema.methods.logError = async function(message, code) {
    this.errors.push({
        message,
        code,
        timestamp: new Date()
    });
    return await this.save();
};

// Statics

/**
 * Get user conversions
 */
besitosConversionSchema.statics.getUserConversions = async function(userId, status = null) {
    const query = { userId };
    if (status) {
        query.conversionStatus = status;
    }
    return await this.find(query).sort({ createdAt: -1 });
};

/**
 * Get conversion stats
 */
besitosConversionSchema.statics.getConversionStats = async function(userId) {
    return await this.aggregate([
        { $match: { userId: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: '$conversionStatus',
                count: { $sum: 1 },
                totalCoins: { $sum: '$creditedCoins' },
                totalXP: { $sum: '$creditedXP' },
                totalRevenue: { $sum: '$revenue.amount' }
            }
        }
    ]);
};

/**
 * Get pending conversions
 */
besitosConversionSchema.statics.getPendingConversions = async function(limit = 100) {
    return await this.find({ 
        conversionStatus: 'pending',
        isCredited: false 
    })
    .sort({ eventTimestamp: 1 })
    .limit(limit);
};

const BesitosConversion = mongoose.model('BesitosConversion', besitosConversionSchema);

module.exports = BesitosConversion;


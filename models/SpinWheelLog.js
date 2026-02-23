/**
 * Spin Wheel Log Model
 * Tracks all spin wheel activities and outcomes
 * @module models/SpinWheelLog
 */

const mongoose = require('mongoose');

const spinWheelLogSchema = new mongoose.Schema({
    // User and session info
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Spin details
    spinId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Reward won
    reward: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SpinWheelReward',
        required: false, // Allow null for "no reward" outcomes
        default: null
    },
    
    rewardName: {
        type: String,
        required: true
    },
    
    rewardType: {
        type: String,
        required: true,
        enum: ['coins', 'xp', 'coupon', 'bonus_task', 'premium_feature', 'none']
    },
    
    rewardAmount: {
        type: Number,
        required: true
    },
    
    // Spin context
    spinMode: {
        type: String,
        enum: ['free', 'ad_based', 'premium'],
        required: true
    },
    
    userTier: {
        type: String,
        // enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        required: true
    },
    
    vipMultiplier: {
        type: Number,
        default: 1.0
    },
    
    // Outcome
    isWin: {
        type: Boolean,
        required: true,
        default: true
    },
    
    // Additional data
    metadata: {
        adWatched: Boolean,
        adProvider: String,
        sessionId: String,
        deviceInfo: mongoose.Schema.Types.Mixed,
        location: {
            country: String,
            city: String
        }
    },
    
    // Transaction reference
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    }
    
}, {
    timestamps: true
});

// Indexes
spinWheelLogSchema.index({ user: 1, createdAt: -1 });
spinWheelLogSchema.index({ rewardType: 1, createdAt: -1 });
spinWheelLogSchema.index({ isWin: 1, createdAt: -1 });
spinWheelLogSchema.index({ createdAt: -1 });

// Pre-save hook to generate spin ID
spinWheelLogSchema.pre('save', function(next) {
    if (!this.spinId) {
        this.spinId = `SPIN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    next();
});

// Statics

/**
 * Get user spin history
 */
spinWheelLogSchema.statics.getUserSpins = async function(userId, limit = 20) {
    return await this.find({ user: userId })
        .populate('reward', 'name type amount')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

/**
 * Get spin statistics
 */
spinWheelLogSchema.statics.getSpinStats = async function(filters = {}) {
    const matchQuery = {};
    
    if (filters.startDate || filters.endDate) {
        matchQuery.createdAt = {};
        if (filters.startDate) matchQuery.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) matchQuery.createdAt.$lte = new Date(filters.endDate);
    }
    
    if (filters.rewardType) matchQuery.rewardType = filters.rewardType;
    if (filters.userTier) matchQuery.userTier = filters.userTier;
    
    return await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$rewardType',
                totalSpins: { $sum: 1 },
                totalWins: { $sum: { $cond: ['$isWin', 1, 0] } },
                totalRewardAmount: { $sum: '$rewardAmount' },
                avgRewardAmount: { $avg: '$rewardAmount' }
            }
        },
        { $sort: { totalSpins: -1 } }
    ]);
};

/**
 * Get daily spin counts
 */
spinWheelLogSchema.statics.getDailySpinCounts = async function(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await this.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' },
                    day: { $dayOfMonth: '$createdAt' }
                },
                spinCount: { $sum: 1 },
                winCount: { $sum: { $cond: ['$isWin', 1, 0] } }
            }
        },
        {
            $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
    ]);
};

/**
 * Get most popular rewards
 */
spinWheelLogSchema.statics.getPopularRewards = async function(limit = 10) {
    return await this.aggregate([
        {
            $group: {
                _id: '$reward',
                rewardName: { $first: '$rewardName' },
                rewardType: { $first: '$rewardType' },
                totalWins: { $sum: 1 },
                totalAmount: { $sum: '$rewardAmount' }
            }
        },
        { $sort: { totalWins: -1 } },
        { $limit: limit }
    ]);
};

const SpinWheelLog = mongoose.model('SpinWheelLog', spinWheelLogSchema);

module.exports = SpinWheelLog;

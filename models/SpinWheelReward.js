/**
 * Spin Wheel Reward Model
 * Manages individual rewards in the spin wheel prize pool
 * @module models/SpinWheelReward
 */

const mongoose = require('mongoose');

const spinWheelRewardSchema = new mongoose.Schema({
    // Basic reward info
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    
    // Reward type and value
    type: {
        type: String,
        required: true,
        enum: ['coins', 'xp', 'coupon', 'bonus_task', 'premium_feature'],
        index: true
    },
    
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Probability and visibility
    probability: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        validate: {
            validator: function(v) {
                return v >= 0 && v <= 100;
            },
            message: 'Probability must be between 0 and 100'
        }
    },
    
    // Tier restrictions
    eligibleTiers: [{
        type: String,
        // enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        default: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond']
    }],
    
    // Visual elements
    icon: {
        type: String,
        default: null
    },
    
    color: {
        type: String,
        default: '#FFD700', // Gold default
        match: /^#[0-9A-Fa-f]{6}$/
    },
    
    // Status and metadata
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    
    // Additional reward data
    metadata: {
        couponCode: String,
        bonusTaskId: String,
        premiumFeature: String,
        description: String
    },
    
    // Audit fields
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Statistics
    stats: {
        totalWins: {
            type: Number,
            default: 0
        },
        lastWon: Date,
        winRate: {
            type: Number,
            default: 0
        }
    }
    
}, {
    timestamps: true
});

// Indexes
spinWheelRewardSchema.index({ isActive: 1, type: 1 });
spinWheelRewardSchema.index({ probability: -1 });
spinWheelRewardSchema.index({ 'stats.totalWins': -1 });

// Methods

/**
 * Update win statistics
 */
spinWheelRewardSchema.methods.recordWin = async function() {
    this.stats.totalWins += 1;
    this.stats.lastWon = new Date();
    return await this.save();
};

/**
 * Check if reward is eligible for user tier
 */
spinWheelRewardSchema.methods.isEligibleForTier = function(userTier) {
    return this.eligibleTiers.includes(userTier) || this.eligibleTiers.length === 0;
};

// Statics

/**
 * Get active rewards for spin wheel
 */
spinWheelRewardSchema.statics.getActiveRewards = async function() {
    return await this.find({ isActive: true })
        .sort({ probability: -1 })
        .lean();
};

/**
 * Get rewards by type
 */
spinWheelRewardSchema.statics.getRewardsByType = async function(type) {
    return await this.find({ type, isActive: true })
        .sort({ probability: -1 })
        .lean();
};

/**
 * Validate total probability per tier (BUG-063 fix)
 * Each tier should not exceed 100% and should not have duplicate probabilities
 */
spinWheelRewardSchema.statics.validateTotalProbability = async function() {
    const activeRewards = await this.find({ isActive: true });
    
    // Group rewards by tier
    const tierAnalysis = {};
    const globalTotal = activeRewards.reduce((sum, reward) => sum + reward.probability, 0);
    
    // Analyze each tier
    activeRewards.forEach(reward => {
        reward.eligibleTiers.forEach(tier => {
            if (!tierAnalysis[tier]) {
                tierAnalysis[tier] = {
                    rewards: [],
                    totalProbability: 0,
                    probabilities: [],
                    duplicates: []
                };
            }
            
            tierAnalysis[tier].rewards.push(reward);
            tierAnalysis[tier].totalProbability += reward.probability;
            tierAnalysis[tier].probabilities.push(reward.probability);
        });
    });
    
    // Check for issues in each tier
    const issues = [];
    let isValid = true;
    
    Object.keys(tierAnalysis).forEach(tier => {
        const tierData = tierAnalysis[tier];
        
        // Check for duplicates within tier
        const probCounts = {};
        tierData.probabilities.forEach(prob => {
            probCounts[prob] = (probCounts[prob] || 0) + 1;
        });
        
        const duplicates = Object.entries(probCounts)
            .filter(([prob, count]) => count > 1)
            .map(([prob, count]) => ({ probability: parseFloat(prob), count }));
        
        if (duplicates.length > 0) {
            isValid = false;
            duplicates.forEach(dup => {
                issues.push(`Tier ${tier} has ${dup.count} rewards with ${dup.probability}% probability`);
            });
        }
        
        // Check if tier exceeds 100%
        if (tierData.totalProbability > 100) {
            isValid = false;
            issues.push(`Tier ${tier} total probability (${tierData.totalProbability}%) exceeds 100%`);
        }
        
        tierAnalysis[tier].duplicates = duplicates;
    });
    
    return {
        isValid,
        globalTotalProbability: globalTotal,
        tierAnalysis,
        issues,
        message: isValid 
            ? `All tiers valid. Global total: ${globalTotal}%`
            : `Issues found: ${issues.join('; ')}`
    };
};

/**
 * Get reward statistics
 */
spinWheelRewardSchema.statics.getRewardStats = async function() {
    return await this.aggregate([
        { $match: { isActive: true } },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalProbability: { $sum: '$probability' },
                totalWins: { $sum: '$stats.totalWins' },
                avgProbability: { $avg: '$probability' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

const SpinWheelReward = mongoose.model('SpinWheelReward', spinWheelRewardSchema);

module.exports = SpinWheelReward;

const mongoose = require('mongoose');
const Game = require('./Game');

const transactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['credit', 'debit', 'reward', 'xp', 'redemption', 'spin', 'adjustment', 'refund', 'bonus', 'penalty', 'xp_decay'],
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    balanceType: {
        type: String,
        enum: ['coins', 'xp', 'cash'],
        default: 'coins'
    },
    game: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        index: true
    },
    gameId: {
        type: String,
        trim: true,
        index: true
    },
    description: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'rejected', 'processing'],
        default: 'completed',
        index: true
    },
    referenceId: {
        type: String,
        index: true
    },
    
    // Approval system for redemptions and adjustments
    approval: {
        required: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'not_required'],
            default: 'not_required'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedAt: Date,
        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rejectedAt: Date,
        rejectionReason: String
    },
    
    // Tremendous integration fields
    tremendousOrderId: {
        type: String,
        index: true
    },
    paymentProvider: {
        type: String,
        default: 'internal'
    },
    
    // Face verification for redemptions
    verification: {
        faceVerified: {
            type: Boolean,
            default: false
        },
        verifiedAt: Date,
        verificationType: String,
        verificationData: mongoose.Schema.Types.Mixed
    },
    
    // For admin adjustments
    adjustment: {
        isAdjustment: {
            type: Boolean,
            default: false
        },
        adjustmentType: {
            type: String,
            enum: ['add', 'subtract', 'correction', 'bonus', 'penalty']
        },
        reason: String,
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        previousBalance: Number,
        newBalance: Number
    },
    
    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ 'approval.status': 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ gameId: 1 });

transactionSchema.pre('save', function(next) {
    if (!this.referenceId) {
        this.referenceId = `TX-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    }
    next();
});

transactionSchema.pre('save', async function(next) {
    try {
        if (!this.gameId && this.metadata && this.metadata.gameId) {
            this.gameId = this.metadata.gameId;
        }

        if (!this.game && this.gameId) {
            const gameDoc = await Game.findOne({ gameId: this.gameId }).select('_id');
            if (gameDoc) {
                this.game = gameDoc._id;
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

// Methods

/**
 * Approve transaction (for redemptions/adjustments)
 */
transactionSchema.methods.approve = async function(adminId) {
    this.approval.status = 'approved';
    this.approval.approvedBy = adminId;
    this.approval.approvedAt = new Date();
    this.status = 'completed';
    return await this.save();
};

/**
 * Reject transaction
 */
transactionSchema.methods.reject = async function(adminId, reason) {
    this.approval.status = 'rejected';
    this.approval.rejectedBy = adminId;
    this.approval.rejectedAt = new Date();
    this.approval.rejectionReason = reason;
    this.status = 'rejected';
    return await this.save();
};

/**
 * Mark as face verified
 */
transactionSchema.methods.markFaceVerified = async function(verificationType = 'manual') {
    this.verification.faceVerified = true;
    this.verification.verifiedAt = new Date();
    this.verification.verificationType = verificationType;
    return await this.save();
};

// Statics

/**
 * Get pending redemptions
 */
transactionSchema.statics.getPendingRedemptions = async function(limit = 50) {
    return await this.find({
        type: 'redemption',
        'approval.status': 'pending',
        status: 'pending'
    })
    .populate('user', 'firstName lastName email mobile location verification')
    .sort({ createdAt: 1 })
    .limit(limit);
};

/**
 * Get transaction statistics
 */
transactionSchema.statics.getStatistics = async function(filters = {}) {
    const matchQuery = {};
    
    if (filters.type) matchQuery.type = filters.type;
    if (filters.status) matchQuery.status = filters.status;
    if (filters.startDate || filters.endDate) {
        matchQuery.createdAt = {};
        if (filters.startDate) matchQuery.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) matchQuery.createdAt.$lte = new Date(filters.endDate);
    }
    
    return await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' },
                avgAmount: { $avg: '$amount' }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;

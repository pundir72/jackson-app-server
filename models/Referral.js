const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
    // The user who is referring (existing user)
    referrer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // The user who was referred (new user)
    referee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    
    // Unique referral code for the referrer
    referralCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        index: true
    },
    
    // Status of the referral
    status: {
        type: String,
        enum: ['pending', 'completed', 'expired', 'cancelled'],
        default: 'pending',
        index: true
    },
    
    // Rewards tracking
    rewards: {
        referrerRewarded: {
            type: Boolean,
            default: false
        },
        refereeRewarded: {
            type: Boolean,
            default: false
        },
        xpAmount: {
            type: Number,
            default: 50
        },
        badgeAwarded: {
            type: Boolean,
            default: false
        }
    },
    
    // Tracking metadata
    metadata: {
        signupCompletedAt: Date,
        referralLink: String,
        source: {
            type: String,
            enum: ['facebook', 'twitter', 'linkedin', 'messenger', 'sms', 'copy_link', 'direct'],
            default: 'direct'
        },
        deviceInfo: {
            platform: String,
            deviceType: String,
            ip: String,
            userAgent: String
        }
    },
    
    // Transaction references
    transactions: {
        referrerTransaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        },
        refereeTransaction: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        }
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    completedAt: Date,
    
    expiresAt: {
        type: Date,
        // Referral link expires after 90 days if not used
        default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
}, {
    timestamps: true
});

// Indexes for performance
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referralCode: 1, status: 1 });
referralSchema.index({ createdAt: -1 });

// Static method to generate unique referral code
referralSchema.statics.generateReferralCode = async function(userId) {
    const User = mongoose.model('User');
    const user = await User.findById(userId);
    
    if (!user) {
        throw new Error('User not found');
    }
    
    // Generate code from first name + random string
    let code;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
        const firstName = user.firstName.substring(0, 4).toUpperCase();
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        code = `${firstName}${random}`;
        
        // Check if code already exists
        const existing = await this.findOne({ referralCode: code });
        if (!existing) {
            isUnique = true;
        }
        attempts++;
    }
    
    if (!isUnique) {
        // Fallback to UUID-like code
        code = 'REF' + Math.random().toString(36).substring(2, 11).toUpperCase();
    }
    
    return code;
};

// Static method to get user's referral code (create if doesn't exist)
referralSchema.statics.getUserReferralCode = async function(userId) {
    // Check if user already has a referral code
    let referral = await this.findOne({ 
        referrer: userId,
        status: 'pending' 
    }).sort({ createdAt: -1 });
    
    if (referral) {
        return referral.referralCode;
    }
    
    // Generate new referral code
    const code = await this.generateReferralCode(userId);
    
    // Create referral entry
    referral = new this({
        referrer: userId,
        referralCode: code,
        status: 'pending'
    });
    
    await referral.save();
    return code;
};

// Static method to process referral signup
referralSchema.statics.processReferralSignup = async function(referralCode, newUserId, metadata = {}) {
    const User = mongoose.model('User');
    const Transaction = mongoose.model('Transaction');
    
    // Find the referral by code
    const referral = await this.findOne({ 
        referralCode: referralCode.toUpperCase(),
        status: 'pending'
    });
    
    if (!referral) {
        throw new Error('Invalid or expired referral code');
    }
    
    // Check if referral has expired
    if (referral.expiresAt && referral.expiresAt < new Date()) {
        referral.status = 'expired';
        await referral.save();
        throw new Error('Referral code has expired');
    }
    
    // Update referral with referee
    referral.referee = newUserId;
    referral.status = 'completed';
    referral.completedAt = new Date();
    referral.metadata.signupCompletedAt = new Date();
    referral.metadata.source = metadata.source || 'direct';
    referral.metadata.deviceInfo = metadata.deviceInfo || {};
    
    // Get both users
    const [referrer, referee] = await Promise.all([
        User.findById(referral.referrer),
        User.findById(newUserId)
    ]);
    
    if (!referrer || !referee) {
        throw new Error('User not found');
    }
    
    // Award XP to both users (50 XP each)
    const xpAmount = 50;
    
    // Update referrer
    referrer.xp.current = (referrer.xp.current || 0) + xpAmount;
    referrer.xp.total = (referrer.xp.total || 0) + xpAmount;
    
    // Add Premium Badge to referrer if not already present
    const premiumBadge = {
        name: 'Premium Badge',
        description: 'Earned by referring a friend',
        icon: '🏆',
        rarity: 'premium',
        earnedAt: new Date()
    };
    
    if (!referrer.badges.some(b => b.name === 'Premium Badge')) {
        referrer.badges.push(premiumBadge);
    }
    
    // Update referee
    referee.xp.current = (referee.xp.current || 0) + xpAmount;
    referee.xp.total = (referee.xp.total || 0) + xpAmount;
    
    // Add Premium Badge to referee
    if (!referee.badges.some(b => b.name === 'Premium Badge')) {
        referee.badges.push(premiumBadge);
    }
    
    // Create transaction records
    const referrerTransaction = new Transaction({
        user: referrer._id,
        type: 'credit',
        amount: 0, // No coins, just XP
        balanceType: 'xp',
        description: `Referral reward - Friend joined via your link`,
        status: 'completed',
        metadata: {
            source: 'referral',
            referralCode: referral.referralCode,
            refereeId: referee._id,
            xpEarned: xpAmount
        }
    });
    
    const refereeTransaction = new Transaction({
        user: referee._id,
        type: 'credit',
        amount: 0, // No coins, just XP
        balanceType: 'xp',
        description: `Referral reward - Joined via ${referrer.firstName}'s link`,
        status: 'completed',
        metadata: {
            source: 'referral',
            referralCode: referral.referralCode,
            referrerId: referrer._id,
            xpEarned: xpAmount
        }
    });
    
    // Save everything
    await Promise.all([
        referrer.save(),
        referee.save(),
        referrerTransaction.save(),
        refereeTransaction.save()
    ]);
    
    // Update referral with transaction IDs
    referral.rewards.referrerRewarded = true;
    referral.rewards.refereeRewarded = true;
    referral.rewards.badgeAwarded = true;
    referral.transactions.referrerTransaction = referrerTransaction._id;
    referral.transactions.refereeTransaction = refereeTransaction._id;
    
    await referral.save();
    
    return {
        referral,
        referrer: {
            id: referrer._id,
            name: referrer.firstName,
            xpAwarded: xpAmount,
            badgeAwarded: true
        },
        referee: {
            id: referee._id,
            name: referee.firstName,
            xpAwarded: xpAmount,
            badgeAwarded: true
        }
    };
};

// Static method to get referral stats for a user
referralSchema.statics.getUserStats = async function(userId) {
    const stats = await this.aggregate([
        {
            $match: { referrer: new mongoose.Types.ObjectId(userId) }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    
    const result = {
        total: 0,
        completed: 0,
        pending: 0,
        expired: 0,
        totalXPEarned: 0,
        totalReferred: 0
    };
    
    stats.forEach(stat => {
        result.total += stat.count;
        if (stat._id === 'completed') {
            result.completed = stat.count;
            result.totalXPEarned = stat.count * 50; // 50 XP per referral
            result.totalReferred = stat.count;
        } else if (stat._id === 'pending') {
            result.pending = stat.count;
        } else if (stat._id === 'expired') {
            result.expired = stat.count;
        }
    });
    
    return result;
};

// Instance method to generate shareable link
referralSchema.methods.generateShareableLink = function(baseUrl = 'https://jackson.app') {
    return `${baseUrl}/invite?ref=${this.referralCode}`;
};

// Instance method to get share messages for different platforms
referralSchema.methods.getShareMessages = function(userName) {
    const link = this.generateShareableLink();
    
    return {
        default: `Join me on Jackson and earn rewards! Use my referral code ${this.referralCode} or click: ${link}`,
        facebook: `🎉 I'm earning rewards on Jackson! Join me and we'll both get 50 XP + a Premium Badge! 🏆\n\nUse code: ${this.referralCode}\n${link}`,
        twitter: `Join me on @JacksonApp and earn rewards! 🎁 Use code ${this.referralCode} for 50 XP + Premium Badge 🏆 ${link}`,
        linkedin: `I've been using Jackson to earn rewards. Join me and get 50 XP + a Premium Badge! Use referral code: ${this.referralCode}\n${link}`,
        messenger: `Hey! 👋 Join me on Jackson - we'll both get 50 XP and a Premium Badge! Use my code: ${this.referralCode} or click: ${link}`,
        sms: `Join me on Jackson! Get 50 XP + Premium Badge 🏆 Use code: ${this.referralCode} Download: ${link}`,
        whatsapp: `🎉 Join me on Jackson and earn rewards!\n\n✨ 50 XP Points\n🏆 Premium Badge\n\nUse my code: ${this.referralCode}\n${link}`
    };
};

module.exports = mongoose.model('Referral', referralSchema);



const mongoose = require('mongoose');

const boosterRewardSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  adId: {
    type: String,
    required: true
  },
  adProvider: {
    type: String,
    enum: ['admob', 'unity', 'ironsource', 'vungle', 'applovin'],
    required: true
  },
  adDuration: {
    type: Number, // in seconds
    required: true
  },
  reward: {
    coins: {
      type: Number,
      required: true
    },
    xp: {
      type: Number,
      required: true
    }
  },
  claimedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours
    }
  },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'expired', 'cancelled'],
    default: 'claimed'
  },
  metadata: {
    adNetwork: String,
    adUnitId: String,
    deviceInfo: {
      platform: String,
      osVersion: String,
      appVersion: String
    },
    userAgent: String,
    ipAddress: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
boosterRewardSchema.index({ user: 1, claimedAt: -1 });
boosterRewardSchema.index({ user: 1, status: 1 });
boosterRewardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for time remaining
boosterRewardSchema.virtual('timeRemaining').get(function() {
  const now = new Date();
  const nextAvailable = new Date(this.claimedAt.getTime() + 4 * 60 * 60 * 1000);
  return Math.max(0, nextAvailable.getTime() - now.getTime());
});

// Virtual for is available
boosterRewardSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  const nextAvailable = new Date(this.claimedAt.getTime() + 4 * 60 * 60 * 1000);
  return now >= nextAvailable;
});

// Static method to check if user can claim booster
boosterRewardSchema.statics.canClaimBooster = async function(userId) {
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  
  const lastBooster = await this.findOne({
    user: userId,
    claimedAt: { $gte: fourHoursAgo },
    status: 'claimed'
  }).sort({ claimedAt: -1 });
  
  return {
    canClaim: !lastBooster,
    lastClaimed: lastBooster?.claimedAt,
    nextAvailable: lastBooster ? 
      new Date(lastBooster.claimedAt.getTime() + 4 * 60 * 60 * 1000) : 
      now
  };
};

// Static method to get user's booster history
boosterRewardSchema.statics.getUserHistory = function(userId, limit = 20) {
  return this.find({ user: userId })
    .sort({ claimedAt: -1 })
    .limit(limit)
    .select('adProvider reward claimedAt status');
};

// Static method to get booster statistics
boosterRewardSchema.statics.getBoosterStats = async function(userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        claimedAt: { $gte: startDate },
        status: 'claimed'
      }
    },
    {
      $group: {
        _id: null,
        totalClaimed: { $sum: 1 },
        totalCoins: { $sum: '$reward.coins' },
        totalXP: { $sum: '$reward.xp' },
        averageCoins: { $avg: '$reward.coins' },
        averageXP: { $avg: '$reward.xp' }
      }
    }
  ]);
  
  return stats[0] || {
    totalClaimed: 0,
    totalCoins: 0,
    totalXP: 0,
    averageCoins: 0,
    averageXP: 0
  };
};

// Method to calculate reward based on ad duration and user tier
boosterRewardSchema.statics.calculateReward = function(adDuration, userTier = 'free') {
  const baseReward = { coins: 50, xp: 25 };
  
  // Duration multiplier (max 2x for 60+ second ads)
  const durationMultiplier = Math.min(adDuration / 30, 2);
  
  // Tier multiplier
  const tierMultipliers = {
    free: 1.0,
    bronze: 1.2,
    silver: 1.5,
    gold: 2.0,
    platinum: 2.5
  };
  
  const tierMultiplier = tierMultipliers[userTier] || 1.0;
  
  return {
    coins: Math.round(baseReward.coins * durationMultiplier * tierMultiplier),
    xp: Math.round(baseReward.xp * durationMultiplier * tierMultiplier)
  };
};

module.exports = mongoose.model('BoosterReward', boosterRewardSchema);


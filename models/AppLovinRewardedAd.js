/**
 * AppLovin MAX Rewarded Ad Model
 * Tracks rewarded ad views and completions from AppLovin MAX mediation platform
 * @module models/AppLovinRewardedAd
 */

const mongoose = require("mongoose");

const appLovinRewardedAdSchema = new mongoose.Schema(
  {
    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // AppLovin specific IDs
    adUnitId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // Ad network information (which network served the ad)
    adNetwork: {
      type: String,
      enum: [
        "applovin",
        "facebook",
        "google_admob",
        "digital_turbine",
        "inmobi",
        "mintegral",
        "bidmachine",
        "liftoff",
        "vungle",
        "pangle",
        "moloco",
        "google_ad_manager",
        "other",
      ],
      default: "other",
      index: true,
    },

    // Ad placement/context
    placement: {
      type: String,
      trim: true,
      default: "rewarded",
    },

    // Ad status
    status: {
      type: String,
      enum: ["loaded", "displayed", "completed", "failed", "closed"],
      default: "loaded",
      index: true,
    },

    // Rewards
    rewardAmount: {
      type: Number,
      default: 0,
    },

    rewardCurrency: {
      type: String,
      default: "coins",
    },

    // User credited amount in our system
    creditedCoins: {
      type: Number,
      default: 0,
    },

    creditedXP: {
      type: Number,
      default: 0,
    },

    isCredited: {
      type: Boolean,
      default: false,
    },

    creditedAt: {
      type: Date,
    },

    // Timestamps
    loadedAt: {
      type: Date,
      default: Date.now,
    },

    displayedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    // Metadata
    metadata: {
      platform: String, // "ios" | "android"
      country: String,
      deviceType: String,
      ip: String,
      userAgent: String,
      appVersion: String,
      sdkVersion: String,
      networkName: String, // Display name of ad network
      revenue: {
        amount: Number,
        currency: String,
      },
      additionalData: mongoose.Schema.Types.Mixed,
    },

    // Error tracking
    errors: [
      {
        message: String,
        code: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Notes
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
appLovinRewardedAdSchema.index({ userId: 1, status: 1 });
appLovinRewardedAdSchema.index({ userId: 1, createdAt: -1 });
appLovinRewardedAdSchema.index({ adUnitId: 1, status: 1 });
appLovinRewardedAdSchema.index({ adNetwork: 1, status: 1 });
appLovinRewardedAdSchema.index({ completedAt: -1 });
appLovinRewardedAdSchema.index({ isCredited: 1, status: 1 });

// Virtual for ad duration
appLovinRewardedAdSchema.virtual("adDuration").get(function () {
  if (this.displayedAt && this.completedAt) {
    return this.completedAt - this.displayedAt;
  }
  return null;
});

// Methods

/**
 * Mark ad as displayed
 */
appLovinRewardedAdSchema.methods.markDisplayed = async function () {
  this.status = "displayed";
  this.displayedAt = new Date();
  return await this.save();
};

/**
 * Mark ad as completed
 */
appLovinRewardedAdSchema.methods.markCompleted = async function (rewardData = {}) {
  this.status = "completed";
  this.completedAt = new Date();
  if (rewardData.amount) {
    this.rewardAmount = rewardData.amount;
  }
  if (rewardData.currency) {
    this.rewardCurrency = rewardData.currency;
  }
  return await this.save();
};

/**
 * Mark ad as failed
 */
appLovinRewardedAdSchema.methods.markFailed = async function (error) {
  this.status = "failed";
  if (error) {
    this.errors.push({
      message: error.message || error,
      code: error.code || "AD_FAILED",
      timestamp: new Date(),
    });
  }
  return await this.save();
};

/**
 * Credit rewards to user
 */
appLovinRewardedAdSchema.methods.creditRewards = async function (coins, xp) {
  this.creditedCoins = coins || 0;
  this.creditedXP = xp || 0;
  this.isCredited = true;
  this.creditedAt = new Date();
  return await this.save();
};

/**
 * Add error log
 */
appLovinRewardedAdSchema.methods.logError = async function (message, code) {
  this.errors.push({
    message,
    code,
    timestamp: new Date(),
  });
  return await this.save();
};

// Statics

/**
 * Get user's rewarded ad completions
 */
appLovinRewardedAdSchema.statics.getUserCompletions = async function (
  userId,
  limit = 50
) {
  return await this.find({
    userId,
    status: "completed",
  })
    .sort({ completedAt: -1 })
    .limit(limit);
};

/**
 * Get ad completion stats
 */
appLovinRewardedAdSchema.statics.getCompletionStats = async function (userId) {
  return await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalCoins: { $sum: "$creditedCoins" },
        totalXP: { $sum: "$creditedXP" },
        totalRevenue: { $sum: "$metadata.revenue.amount" },
      },
    },
  ]);
};

/**
 * Get pending rewards (completed but not credited)
 */
appLovinRewardedAdSchema.statics.getPendingRewards = async function (
  limit = 100
) {
  return await this.find({
    status: "completed",
    isCredited: false,
  })
    .sort({ completedAt: 1 })
    .limit(limit);
};

/**
 * Get ad network performance stats
 */
appLovinRewardedAdSchema.statics.getNetworkStats = async function (
  startDate,
  endDate
) {
  const matchStage = {
    status: "completed",
  };

  if (startDate || endDate) {
    matchStage.completedAt = {};
    if (startDate) matchStage.completedAt.$gte = new Date(startDate);
    if (endDate) matchStage.completedAt.$lte = new Date(endDate);
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$adNetwork",
        count: { $sum: 1 },
        totalCoins: { $sum: "$creditedCoins" },
        totalXP: { $sum: "$creditedXP" },
        totalRevenue: { $sum: "$metadata.revenue.amount" },
        avgRevenue: { $avg: "$metadata.revenue.amount" },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

const AppLovinRewardedAd = mongoose.model(
  "AppLovinRewardedAd",
  appLovinRewardedAdSchema
);

module.exports = AppLovinRewardedAd;

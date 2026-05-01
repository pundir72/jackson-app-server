/**
 * Spin Wheel Configuration Model
 * Manages global spin wheel settings and rules
 * @module models/SpinWheelConfig
 */

const mongoose = require("mongoose");

const spinWheelConfigSchema = new mongoose.Schema(
  {
    // Basic configuration
    name: {
      type: String,
      required: true,
      default: "Main Spin Wheel",
      trim: true,
    },

    // Spin mode and access
    spinMode: {
      type: String,
      enum: ["free", "ad_based", "premium"],
      default: "free",
      required: true,
    },

    // Cooldown and limits
    cooldownMinutes: {
      type: Number,
      required: true,
      min: 0,
      max: 1440, // 24 hours max
      default: 360, // 6 hours default
    },

    maxSpinsPerDay: {
      type: Number,
      min: 1,
      max: 50,
      default: 3,
    },

    // Tier restrictions
    eligibleTiers: [
      {
        type: String,
        // enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        default: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
      },
    ],

    // Time restrictions
    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // VIP benefits
    vipMultipliers: {
      free: { type: Number, default: 1.0 },
      bronze: { type: Number, default: 1.5 },
      gold: { type: Number, default: 2.0 },
      platinum: { type: Number, default: 2.5 },
    },

    // Additional spins per tier (daily)
    spinsPerTier: {
      free: { type: Number, default: 3 },
      bronze: { type: Number, default: 5 },
      gold: { type: Number, default: 10 },
      platinum: { type: Number, default: 50 },
    },

    // Status and metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Visual settings
    visualSettings: {
      wheelColors: [String],
      animationDuration: { type: Number, default: 3000 },
      soundEnabled: { type: Boolean, default: true },
    },

    // Statistics
    stats: {
      totalSpins: { type: Number, default: 0 },
      totalWins: { type: Number, default: 0 },
      lastSpin: Date,
      averageSpinsPerDay: { type: Number, default: 0 },
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
spinWheelConfigSchema.index({ isActive: 1 });
spinWheelConfigSchema.index({ startDate: 1, endDate: 1 });

// Methods

/**
 * Check if spin wheel is currently active
 */
spinWheelConfigSchema.methods.isCurrentlyActive = function () {
  const now = new Date();

  if (!this.isActive) return false;

  if (this.startDate && now < this.startDate) return false;
  if (this.endDate && now > this.endDate) return false;

  return true;
};

/**
 * Check if user is eligible for spin (case-insensitive)
 */
spinWheelConfigSchema.methods.isUserEligible = function (userTier) {
  if (!this.eligibleTiers || this.eligibleTiers.length === 0) return true;
  if (!userTier) return false;

  const normalizedUserTier = userTier.toString().trim().toLowerCase();
  return this.eligibleTiers.some(
    (tier) => tier.toString().trim().toLowerCase() === normalizedUserTier
  );
};

/**
 * Get VIP multiplier for user tier
 */
spinWheelConfigSchema.methods.getVIPMultiplier = function (userTier) {
  return this.vipMultipliers[userTier.toLowerCase()] || 1.0;
};

/**
 * Get max spins per day for user tier
 */
spinWheelConfigSchema.methods.getMaxSpinsForUser = function (userTier) {
  const additional = this.additionalSpinsPerTier[userTier.toLowerCase()] || 0;
  return this.maxSpinsPerDay + additional;
};

/**
 * Update spin statistics
 */
spinWheelConfigSchema.methods.recordSpin = async function () {
  this.stats.totalSpins += 1;
  this.stats.lastSpin = new Date();
  return await this.save();
};

// Statics

/**
 * Get active configuration
 */
spinWheelConfigSchema.statics.getActiveConfig = async function () {
  return await this.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
};

/**
 * Get configuration statistics
 */
spinWheelConfigSchema.statics.getConfigStats = async function () {
  return await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalConfigs: { $sum: 1 },
        totalSpins: { $sum: "$stats.totalSpins" },
        totalWins: { $sum: "$stats.totalWins" },
        avgSpinsPerDay: { $avg: "$stats.averageSpinsPerDay" },
      },
    },
  ]);
};

const SpinWheelConfig = mongoose.model(
  "SpinWheelConfig",
  spinWheelConfigSchema
);

module.exports = SpinWheelConfig;

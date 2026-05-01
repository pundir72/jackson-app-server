const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    sdkProvider: {
      type: String,
      required: true,
    },
    xptrRules: {
      type: String,
      required: true,
    },
    // Reward Configuration
    rewards: {
      xp: {
        type: Number,
        default: 0,
        min: 0,
      },
      coins: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    // Coins are read-only and come from 3rd-party API
    // This field is auto-populated and cannot be edited by admin
    coinsFromAPI: {
      type: Number,
      default: 0,
      min: 0,
    },
    xpTier: {
      type: Number,
      min: 1,
      max: 10,
      default: 1,
    },
    // XP Tier Rules - Multi-select (Junior, Mid, Senior)
    xpTiers: [
      {
        type: String,
        enum: ["Junior", "Mid", "Senior"],
        trim: true,
      },
    ],
    // Stepwise XP Reward Configuration
    xpRewardConfig: {
      baseXP: {
        type: Number,
        default: 0,
        min: 0,
      },
      multiplier: {
        type: Number,
        default: 1.0,
        min: 0.1,
      },
    },
    isDefaultFallback: {
      type: Boolean,
      default: false,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isAdSupported: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Optional UI placement hint (e.g., featured_row, banner, carousel)
    uiSection: { type: String, trim: true },
    // Game Tips & Tricks support
    tipsEnabled: {
      type: Boolean,
      default: true,
    },
    metadata: {
      genre: {
        type: String,
        // enum: ['puzzle', 'action', 'strategy', 'simulation', 'arcade', 'sports', 'racing', 'rpg'],
        default: "puzzle",
      },
      difficulty: {
        type: String,
        // enum: ['easy', 'medium', 'hard'],
        default: "easy",
      },
      estimatedPlayTime: {
        type: Number,
        default: 10, // minutes
      },
      minAge: {
        type: Number,
        default: 13,
      },
      // Game Thumbnail/Image Management
      imageUrl: String,
      iconUrl: String,
      thumbnail: {
        url: String,
        dimensions: {
          width: { type: Number, default: 300 },
          height: { type: Number, default: 300 },
        },
        altText: String,
      },
      deepLink: String,
      packageName: String,
      version: String,
      size: String, // e.g., "50MB"
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: 4.0,
      },
      downloadCount: {
        type: Number,
        default: 0,
      },
      revenue: {
        type: Number,
        default: 0,
      },
      rewardCost: {
        type: Number,
        default: 0,
      },
    },
    // External game metadata snapshot
    gameDetails: {
      id: { type: String, trim: true },
      name: { type: String, trim: true },
      description: { type: String, trim: true },
      image: { type: String, trim: true },
      square_image: { type: String, trim: true },
      large_image: { type: String, trim: true },
      category: { type: String, trim: true },
      downloadUrl: { type: String, trim: true },
    },
    // Store complete raw data from third-party API (Besitos, Bitlabs, etc.)
    besitosRawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    deviceType: {
      type: String,
      default: "android",
    },
    // Targeting & Segmentation
    ageGroup: {
      type: String,
      trim: true,
    },
    ageGroups: [
      {
        type: String,
        // enum: ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+']
      },
    ],
    gender: {
      type: String,
      // enum: ['male', 'female', 'all']
    },
    marketingChannel: {
      type: String,
      trim: true,
    },
    campaignName: {
      type: String,
      trim: true,
    },
    tierRestrictions: {
      minTier: {
        type: String,
        // enum: ['free', 'bronze', 'silver', 'gold', 'platinum'],
        default: "free",
      },
      maxTier: {
        type: String,
        // enum: ['free', 'bronze', 'silver', 'gold', 'platinum'],
        default: "platinum",
      },
    },
    displayRules: {
      maxGamesToShow: {
        type: Number,
        default: 10,
      },
      priority: {
        type: Number,
        default: 0,
      },
      isFeatured: {
        type: Boolean,
        default: false,
      },
    },
    // Country codes for filtering (games may be available in specific countries)
    countries: [
      {
        type: String,
        trim: true,
      },
    ],
    analytics: {
      totalPlays: {
        type: Number,
        default: 0,
      },
      totalCompletions: {
        type: Number,
        default: 0,
      },
      averagePlayTime: {
        type: Number,
        default: 0,
      },
      completionRate: {
        type: Number,
        default: 0,
      },
      retentionRate: {
        type: Number,
        default: 0,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Update the updatedAt field before saving
gameSchema.pre("save", function (next) {
  console.log("=== GAME MODEL PRE-SAVE ===");
  console.log("Game ID:", this.gameId);
  console.log("Game Title:", this.title);
  console.log("Is New:", this.isNew);
  console.log("Is Active:", this.isActive);
  console.log("Rewards:", this.rewards);
  console.log("XP Tier:", this.xpTier);
  console.log("XP Tiers:", this.xpTiers);
  console.log("XP Reward Config:", this.xpRewardConfig);
  console.log("Modified Fields:", this.modifiedPaths());
  this.updatedAt = Date.now();
  console.log("=== END PRE-SAVE ===");
  next();
});

// Post-save hook to log successful saves
gameSchema.post("save", function (doc) {
  console.log("=== GAME MODEL POST-SAVE ===");
  console.log("✅ Game saved successfully");
  console.log("Game ID:", doc.gameId);
  console.log("MongoDB _id:", doc._id);
  console.log("Title:", doc.title);
  console.log("Is Active:", doc.isActive);
  console.log("Rewards:", doc.rewards);
  console.log("XP Tier:", doc.xpTier);
  console.log("XP Tiers:", doc.xpTiers);
  console.log("XP Reward Config:", doc.xpRewardConfig);
  console.log("=== END POST-SAVE ===");
});

// Indexes for efficient queries
gameSchema.index({ title: 1 });
gameSchema.index({ sdkProvider: 1, isActive: 1 });
gameSchema.index({ tags: 1 });
gameSchema.index({ "metadata.genre": 1 });
gameSchema.index({
  "tierRestrictions.minTier": 1,
  "tierRestrictions.maxTier": 1,
});
gameSchema.index({ "displayRules.isFeatured": 1, "displayRules.priority": -1 });
gameSchema.index({ createdAt: -1 });
// Compound unique index to allow multiple variants per gameId by targeting
gameSchema.index(
  { gameId: 1, gender: 1, uiSection: 1, ageGroup: 1 },
  { unique: true }
);

// Static methods
gameSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({
    "displayRules.priority": -1,
    createdAt: -1,
  });
};

// Removed findByCountry static method - countries field removed

gameSchema.statics.findByTier = function (tier) {
  return this.find({
    "tierRestrictions.minTier": { $lte: tier },
    "tierRestrictions.maxTier": { $gte: tier },
    isActive: true,
  }).sort({ "displayRules.priority": -1, createdAt: -1 });
};

gameSchema.statics.findFeatured = function () {
  return this.find({
    "displayRules.isFeatured": true,
    isActive: true,
  }).sort({ "displayRules.priority": -1, createdAt: -1 });
};

gameSchema.statics.findByGenre = function (genre) {
  return this.find({
    "metadata.genre": genre,
    isActive: true,
  }).sort({ "displayRules.priority": -1, createdAt: -1 });
};

// Instance methods
gameSchema.methods.isEligibleForTier = function (tier) {
  if (!this.tierRestrictions) return true;
  const minTier = (this.tierRestrictions.minTier || "").toLowerCase();
  const maxTier = (this.tierRestrictions.maxTier || "").toLowerCase();
  // Segment "all" config by admin: applies to free, bronze, gold, platinum
  if (minTier === "all" || maxTier === "all") return true;

  const tierOrder = ["free", "bronze", "gold", "platinum"];
  const userTierIndex = tierOrder.indexOf(tier);
  const minTierIndex = tierOrder.indexOf(minTier);
  const maxTierIndex = tierOrder.indexOf(maxTier);

  return userTierIndex >= minTierIndex && userTierIndex <= maxTierIndex;
};

// Removed isEligibleForCountry method - countries field removed

gameSchema.methods.getTips = function () {
  const GameTip = require("./GameTip");
  return GameTip.findByGame(this.gameId);
};

gameSchema.methods.getFeaturedTips = function () {
  const GameTip = require("./GameTip");
  return GameTip.findFeatured(this.gameId);
};

gameSchema.methods.updateAnalytics = function (playTime, completed = false) {
  this.analytics.totalPlays += 1;

  if (completed) {
    this.analytics.totalCompletions += 1;
  }

  // Update average play time
  const totalTime =
    this.analytics.averagePlayTime * (this.analytics.totalPlays - 1) + playTime;
  this.analytics.averagePlayTime = totalTime / this.analytics.totalPlays;

  // Update completion rate
  this.analytics.completionRate =
    (this.analytics.totalCompletions / this.analytics.totalPlays) * 100;

  return this.save();
};

gameSchema.methods.calculateMargin = function () {
  if (this.metadata.revenue > 0 && this.metadata.rewardCost > 0) {
    return (
      ((this.metadata.revenue - this.metadata.rewardCost) /
        this.metadata.revenue) *
      100
    );
  }
  return 0;
};

const Game = mongoose.model("Game", gameSchema);

module.exports = Game;

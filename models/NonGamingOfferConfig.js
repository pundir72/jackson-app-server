const mongoose = require("mongoose");

/**
 * NonGamingOfferConfig Model
 * Stores each admin-synced non-gaming offer (cashback / shopping / magic_receipt / other).
 * One document per synced offer — NOT a singleton.
 * Collection: nongamingofferconfigs
 */
const nonGamingOfferConfigSchema = new mongoose.Schema(
  {
    // ── SDK source ────────────────────────────────────────────────────────────
    sdkName: {
      type: String,
      required: true,
      trim: true,
      // e.g. "bitlabs" | "everflow" | "affise"
    },

    // ── Offer identity ────────────────────────────────────────────────────────
    externalId: {
      type: String,
      required: true,
      trim: true,
      // SDK's native offer ID — used for dedup on re-sync
    },

    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Offer",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Offer classification ──────────────────────────────────────────────────
    offerType: {
      type: String,
      enum: ["cashback", "shopping", "magic_receipt", "other"],
      default: "other",
    },

    category: {
      type: String,
      enum: [
        "finance",
        "shopping",
        "entertainment",
        "technology",
        "health",
        "travel",
        "education",
        "other",
      ],
      default: "other",
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["live", "paused", "completed", "expired", "error"],
      default: "live",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Reward ────────────────────────────────────────────────────────────────
    coinReward: {
      type: Number,
      default: 0,
      min: 0,
    },

    userRewardCoins: {
      type: Number,
      default: 0,
    },

    userRewardXP: {
      type: Number,
      default: 0,
    },

    estimatedTime: {
      type: Number,
      default: 1,
      min: 0,
      // minutes
    },

    // ── URLs & media ──────────────────────────────────────────────────────────
    clickUrl: {
      type: String,
      trim: true,
      default: "",
    },

    thumbnail: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Target Audience ───────────────────────────────────────────────────────
    targetAudience: {
      age: [
        {
          type: String,
          enum: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
        },
      ],
      gender: [
        {
          type: String,
          enum: ["male", "female", "other"],
        },
      ],
      countries: [{ type: String, trim: true }],
      minXP: { type: Number, default: 0 },
      maxXP: { type: Number, default: null },
    },

    // ── Segment Rules (eligibility gate for users) ────────────────────────────
    segmentRules: {
      age: [
        {
          type: String,
          enum: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
        },
      ],
      gender: [
        {
          type: String,
          enum: ["male", "female", "other"],
        },
      ],
      countries: [{ type: String, trim: true }],
      isEnabled: { type: Boolean, default: false },
    },

    // ── Requirements ──────────────────────────────────────────────────────────
    requirements: {
      minAge:           { type: Number, default: 18 },
      maxAge:           { type: Number, default: null },
      deviceType:       [{ type: String, enum: ["ios", "android", "web"] }],
      locationRequired: { type: Boolean, default: false },
    },

    // ── Non-gaming specific details ───────────────────────────────────────────
    offerDetails: {
      // Cashback
      cashbackPercentage: { type: Number, default: null },
      minPurchaseAmount:  { type: Number, default: null },
      maxCashbackAmount:  { type: Number, default: null },
      // Shopping
      storeName:    { type: String, trim: true },
      discountCode: { type: String, trim: true },
      // Magic receipt
      receiptRequired:  { type: Boolean, default: false },
      minReceiptAmount: { type: Number, default: null },
    },

    // ── Publisher revenue data ────────────────────────────────────────────────
    publisherRevenue: {
      value:         { type: Number, default: 0 },
      cpi:           { type: Number, default: 0 },
      currency:      { type: String, default: "USD" },
      coinsPerDollar: { type: Number, default: 100 },
    },

    // ── Raw SDK data (full API response preserved for reference) ─────────────
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Audit ─────────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Compound unique: one doc per (sdk + externalId) — prevents duplicate syncs
nonGamingOfferConfigSchema.index({ sdkName: 1, externalId: 1 }, { unique: true });
nonGamingOfferConfigSchema.index({ sdkName: 1 });
nonGamingOfferConfigSchema.index({ offerType: 1 });
nonGamingOfferConfigSchema.index({ status: 1 });
nonGamingOfferConfigSchema.index({ isActive: 1 });
nonGamingOfferConfigSchema.index({ createdAt: -1 });

// ── Statics ───────────────────────────────────────────────────────────────────
nonGamingOfferConfigSchema.statics.findLive = function () {
  return this.find({ status: "live", isActive: true }).sort({ createdAt: -1 });
};

nonGamingOfferConfigSchema.statics.findBySDK = function (sdkName) {
  return this.find({ sdkName, isActive: true }).sort({ createdAt: -1 });
};

nonGamingOfferConfigSchema.statics.findByType = function (offerType) {
  return this.find({ offerType, status: "live" }).sort({ createdAt: -1 });
};

const NonGamingOfferConfig = mongoose.model(
  "NonGamingOfferConfig",
  nonGamingOfferConfigSchema
);
module.exports = NonGamingOfferConfig;

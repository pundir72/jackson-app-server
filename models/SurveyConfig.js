const mongoose = require("mongoose");

/**
 * SurveyConfig Model
 * Stores each admin-synced survey offer (Bitlabs or Besitos).
 * One document per synced survey — NOT a singleton.
 * Collection: surveyconfigs
 */
const surveyConfigSchema = new mongoose.Schema(
  {
    // ── SDK source ────────────────────────────────────────────────────────────
    sdkName: {
      type: String,
      required: true,
      trim: true,
      // e.g. "bitlabs" | "besitos"
    },

    // ── Offer identity ────────────────────────────────────────────────────────
    externalId: {
      type: String,
      required: true,
      trim: true,
      // SDK's native survey ID — used for dedup on re-sync
    },

    title: {
      type: String,
      required: true,
      trim: true,
      default: "Untitled Survey",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Offer classification ──────────────────────────────────────────────────
    offerType: {
      type: String,
      enum: ["survey"],
      default: "survey",
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
      default: 5,
      min: 0,
      // minutes (loi)
    },

    // ── URLs & media ──────────────────────────────────────────────────────────
    clickUrl: {
      type: String,
      trim: true,
      default: "",
    },

    surveyUrl: {
      type: String,
      trim: true,
      default: "",
    },

    thumbnail: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Survey-specific SDK data ──────────────────────────────────────────────
    cpi: {
      type: Number,
      default: 0,
      // USD publisher payout per completion
    },

    cr: {
      type: Number,
      default: 0,
      // Conversion rate (0–1)
    },

    loi: {
      type: Number,
      default: 0,
      // Length of interview in minutes
    },

    value: {
      type: Number,
      default: 0,
      // Publisher reward value
    },

    rating: {
      type: Number,
      default: 0,
    },

    country: {
      type: String,
      trim: true,
      default: null,
    },

    language: {
      type: String,
      trim: true,
      default: null,
    },

    provider: {
      type: String,
      trim: true,
      default: "bitlabs",
      // "bitlabs" | "besitos"
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

    // ── Survey content ────────────────────────────────────────────────────────
    content: {
      instructions:        { type: String, trim: true },
      completionCriteria:  { type: String, default: "complete_all_questions" },
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
surveyConfigSchema.index({ sdkName: 1, externalId: 1 }, { unique: true });
surveyConfigSchema.index({ sdkName: 1 });
surveyConfigSchema.index({ status: 1 });
surveyConfigSchema.index({ isActive: 1 });
surveyConfigSchema.index({ createdAt: -1 });

// ── Statics ───────────────────────────────────────────────────────────────────
surveyConfigSchema.statics.findLive = function () {
  return this.find({ status: "live", isActive: true }).sort({ createdAt: -1 });
};

surveyConfigSchema.statics.findBySDK = function (sdkName) {
  return this.find({ sdkName, isActive: true }).sort({ createdAt: -1 });
};

const SurveyConfig = mongoose.model("SurveyConfig", surveyConfigSchema);
module.exports = SurveyConfig;

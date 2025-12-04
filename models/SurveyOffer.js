const mongoose = require("mongoose");

const surveyOfferSchema = new mongoose.Schema(
  {
    sdkId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SurveySDK",
      required: true,
    },
    externalId: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      // Store full category object from Bitlabs API
      name: {
        type: String,
        default: "General",
      },
      name_internal: {
        type: String,
        default: "Other",
      },
      icon_name: {
        type: String,
        default: "shapes",
      },
      icon_url: {
      type: String,
        default: "",
      },
    },
    offerType: {
      type: String,
      enum: ["survey"],
      default: "survey",
      required: true,
    },
    coinReward: {
      type: Number,
      required: true,
      min: 0, // Allow 0 to show raw API values
    },
    estimatedTime: {
      type: Number, // in minutes
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ["live", "paused", "completed", "expired", "error"],
      default: "live",
    },
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
      countries: [
        {
          type: String,
          trim: true,
        },
      ],
      minXP: {
        type: Number,
        default: 0,
      },
      maxXP: {
        type: Number,
        default: null,
      },
    },
    requirements: {
      minAge: {
        type: Number,
        default: 18,
      },
      maxAge: {
        type: Number,
        default: null,
      },
      deviceType: [
        {
          type: String,
          enum: ["ios", "android", "web"],
        },
      ],
      locationRequired: {
        type: Boolean,
        default: false,
      },
    },
    content: {
      instructions: String,
      questions: [
        {
          id: String,
          text: String,
          type: {
            type: String,
            enum: ["multiple_choice", "text", "rating", "yes_no"],
          },
          options: [String],
          required: {
            type: Boolean,
            default: true,
          },
        },
      ],
      completionCriteria: {
        type: String,
        default: "complete_all_questions",
      },
    },
    analytics: {
      views: {
        type: Number,
        default: 0,
      },
      starts: {
        type: Number,
        default: 0,
      },
      completions: {
        type: Number,
        default: 0,
      },
      abandonment: {
        type: Number,
        default: 0,
      },
      avgCompletionTime: {
        type: Number,
        default: 0, // in seconds
      },
      coinsIssued: {
        type: Number,
        default: 0,
      },
      conversionRate: {
        type: Number,
        default: 0, // percentage
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    metadata: {
      externalUrl: String,
      previewUrl: String,
      thumbnail: String,
      tags: [String],
      priority: {
        type: Number,
        default: 0,
      },
      notes: String,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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
surveyOfferSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate conversion rate
  if (this.analytics.views > 0) {
    this.analytics.conversionRate =
      (this.analytics.completions / this.analytics.views) * 100;
  }

  next();
});

// Indexes for efficient queries
surveyOfferSchema.index({ sdkId: 1, externalId: 1 }, { unique: true });
surveyOfferSchema.index({ status: 1 });
surveyOfferSchema.index({ "category.name": 1 }); // Index category name for filtering
surveyOfferSchema.index({ "category.name_internal": 1 }); // Index category name_internal
surveyOfferSchema.index({ coinReward: 1 });
surveyOfferSchema.index({ createdAt: -1 });
surveyOfferSchema.index({ "analytics.lastUpdated": -1 });

// Compound indexes for filtering
surveyOfferSchema.index({ status: 1, "category.name": 1 });
surveyOfferSchema.index({ sdkId: 1, status: 1 });
surveyOfferSchema.index({ expiryDate: 1, status: 1 });

// Static methods
surveyOfferSchema.statics.findLive = function () {
  return this.find({ status: "live" })
    .populate("sdkId", "name displayName")
    .sort({ "metadata.priority": -1, createdAt: -1 });
};

surveyOfferSchema.statics.findBySDK = function (sdkId, status = null) {
  const query = { sdkId };
  if (status) {
    query.status = status;
  }

  return this.find(query)
    .populate("sdkId", "name displayName")
    .sort({ createdAt: -1 });
};

surveyOfferSchema.statics.findByCategory = function (categoryName) {
  // Support both string (for backward compatibility) and object queries
  const query = { status: "live" };
  if (typeof categoryName === "string") {
    // Query by category name or name_internal
    query.$or = [
      { "category.name": categoryName },
      { "category.name_internal": categoryName },
    ];
  } else {
    query.category = categoryName;
  }
  return this.find(query)
    .populate("sdkId", "name displayName")
    .sort({ "metadata.priority": -1, createdAt: -1 });
};

surveyOfferSchema.statics.getTopPerformers = function (limit = 10) {
  return this.find({ status: "live" })
    .populate("sdkId", "name displayName")
    .sort({ "analytics.conversionRate": -1, "analytics.completions": -1 })
    .limit(limit);
};

// Instance methods
surveyOfferSchema.methods.isEligibleForUser = function (userProfile) {
  // Check age requirements
  if (this.requirements.minAge && userProfile.age < this.requirements.minAge) {
    return false;
  }

  if (this.requirements.maxAge && userProfile.age > this.requirements.maxAge) {
    return false;
  }

  // Check XP requirements
  if (this.targetAudience.minXP && userProfile.xp < this.targetAudience.minXP) {
    return false;
  }

  if (this.targetAudience.maxXP && userProfile.xp > this.targetAudience.maxXP) {
    return false;
  }

  // Check age targeting
  if (this.targetAudience.age && this.targetAudience.age.length > 0) {
    const userAgeGroup = this.getAgeGroup(userProfile.age);
    if (!this.targetAudience.age.includes(userAgeGroup)) {
      return false;
    }
  }

  // Check gender targeting
  if (this.targetAudience.gender && this.targetAudience.gender.length > 0) {
    if (!this.targetAudience.gender.includes(userProfile.gender)) {
      return false;
    }
  }

  // Check country targeting
  if (
    this.targetAudience.countries &&
    this.targetAudience.countries.length > 0
  ) {
    if (!this.targetAudience.countries.includes(userProfile.country)) {
      return false;
    }
  }

  // Check device type
  if (this.requirements.deviceType && this.requirements.deviceType.length > 0) {
    if (!this.requirements.deviceType.includes(userProfile.deviceType)) {
      return false;
    }
  }

  return true;
};

surveyOfferSchema.methods.getAgeGroup = function (age) {
  if (age >= 18 && age <= 24) return "18-24";
  if (age >= 25 && age <= 34) return "25-34";
  if (age >= 35 && age <= 44) return "35-44";
  if (age >= 45 && age <= 54) return "45-54";
  if (age >= 55 && age <= 64) return "55-64";
  if (age >= 65) return "65+";
  return "18-24"; // Default
};

surveyOfferSchema.methods.recordView = function () {
  this.analytics.views += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

surveyOfferSchema.methods.recordStart = function () {
  this.analytics.starts += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

surveyOfferSchema.methods.recordCompletion = function (
  completionTime,
  coinsIssued
) {
  this.analytics.completions += 1;
  this.analytics.coinsIssued += coinsIssued || this.coinReward;
  this.analytics.lastUpdated = Date.now();

  // Update average completion time
  if (completionTime) {
    const totalTime =
      this.analytics.avgCompletionTime * (this.analytics.completions - 1) +
      completionTime;
    this.analytics.avgCompletionTime = totalTime / this.analytics.completions;
  }

  return this.save();
};

surveyOfferSchema.methods.recordAbandonment = function () {
  this.analytics.abandonment += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

surveyOfferSchema.methods.updateStatus = function (status) {
  this.status = status;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

surveyOfferSchema.methods.getEngagementFunnel = function () {
  return {
    views: this.analytics.views,
    starts: this.analytics.starts,
    completions: this.analytics.completions,
    abandonment: this.analytics.abandonment,
    conversionRate: this.analytics.conversionRate,
    avgCompletionTime: this.analytics.avgCompletionTime,
  };
};

const SurveyOffer = mongoose.model("SurveyOffer", surveyOfferSchema);

module.exports = SurveyOffer;


const mongoose = require("mongoose");

/**
 * Non-Game Offer Model
 * Handles cashback, magic receipts, shopping, and other non-gaming offers from BitLab
 * Note: Surveys use SurveyOffer model (different API endpoint)
 */
const nonGameOfferSchema = new mongoose.Schema(
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
    offerType: {
      type: String,
      enum: ["cashback", "shopping", "magic_receipt", "other"],
      required: true,
    },
    coinReward: {
      type: Number,
      required: true,
      min: 0, // Allow 0 to show raw API values
    },
    estimatedTime: {
      type: Number, // in minutes; 0 = no time / display as NIL (e.g. Everflow)
      required: true,
      min: 0,
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
    // Non-gaming specific fields
    offerDetails: {
      // For cashback offers
      cashbackPercentage: Number,
      minPurchaseAmount: Number,
      maxCashbackAmount: Number,
      // For shopping offers
      storeName: String,
      discountCode: String,
      // For magic receipt offers
      receiptRequired: {
        type: Boolean,
        default: false,
      },
      minReceiptAmount: Number,
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
      /** Everflow creative bundle URL (page or asset) for display/link on user side */
      creativeBundleUrl: String,
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
nonGameOfferSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate conversion rate
  if (this.analytics.views > 0) {
    this.analytics.conversionRate =
      (this.analytics.completions / this.analytics.views) * 100;
  }

  next();
});

// Indexes for efficient queries
nonGameOfferSchema.index({ sdkId: 1, externalId: 1 }, { unique: true });
nonGameOfferSchema.index({ status: 1 });
nonGameOfferSchema.index({ category: 1 });
nonGameOfferSchema.index({ offerType: 1 });
nonGameOfferSchema.index({ coinReward: 1 });
nonGameOfferSchema.index({ createdAt: -1 });
nonGameOfferSchema.index({ "analytics.lastUpdated": -1 });

// Compound indexes for filtering
nonGameOfferSchema.index({ status: 1, category: 1 });
nonGameOfferSchema.index({ sdkId: 1, status: 1 });
nonGameOfferSchema.index({ offerType: 1, status: 1 });
nonGameOfferSchema.index({ expiryDate: 1, status: 1 });

// Static methods
nonGameOfferSchema.statics.findLive = function () {
  return this.find({ status: "live" })
    .populate("sdkId", "name displayName")
    .sort({ "metadata.priority": -1, createdAt: -1 });
};

nonGameOfferSchema.statics.findBySDK = function (sdkId, status = null) {
  const query = { sdkId };
  if (status) {
    query.status = status;
  }

  return this.find(query)
    .populate("sdkId", "name displayName")
    .sort({ createdAt: -1 });
};

nonGameOfferSchema.statics.findByType = function (offerType, status = "live") {
  return this.find({ offerType, status })
    .populate("sdkId", "name displayName")
    .sort({ "metadata.priority": -1, createdAt: -1 });
};

nonGameOfferSchema.statics.findByCategory = function (category) {
  return this.find({ category, status: "live" })
    .populate("sdkId", "name displayName")
    .sort({ "metadata.priority": -1, createdAt: -1 });
};

nonGameOfferSchema.statics.getTopPerformers = function (limit = 10) {
  return this.find({ status: "live" })
    .populate("sdkId", "name displayName")
    .sort({ "analytics.conversionRate": -1, "analytics.completions": -1 })
    .limit(limit);
};

// Helper function to parse age group string to min/max ages
// e.g., "18-24" -> { min: 18, max: 24 }, "65+" -> { min: 65, max: null }
nonGameOfferSchema.methods.parseAgeGroup = function (ageGroup) {
  if (!ageGroup || typeof ageGroup !== "string") {
    return null;
  }

  // Handle "65+" format
  if (ageGroup.endsWith("+")) {
    const min = parseInt(ageGroup.replace("+", ""));
    return { min, max: null };
  }

  // Handle "18-24" format
  if (ageGroup.includes("-")) {
    const [minStr, maxStr] = ageGroup.split("-");
    const min = parseInt(minStr);
    const max = parseInt(maxStr);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }

  return null;
};

// Instance methods
nonGameOfferSchema.methods.isEligibleForUser = function (userProfile) {
  // Check age requirements (minAge/maxAge from requirements)
  if (this.requirements.minAge && userProfile.age < this.requirements.minAge) {
    console.log(`🟡 [isEligibleForUser] Age below minimum:`, {
      userAge: userProfile.age,
      minAge: this.requirements.minAge,
      offerTitle: this.title || this.merchant_name,
    });
    return false;
  }

  if (this.requirements.maxAge && userProfile.age > this.requirements.maxAge) {
    console.log(`🟡 [isEligibleForUser] Age above maximum:`, {
      userAge: userProfile.age,
      maxAge: this.requirements.maxAge,
      offerTitle: this.title || this.merchant_name,
    });
    return false;
  }

  // Check XP requirements
  if (this.targetAudience.minXP && userProfile.xp < this.targetAudience.minXP) {
    return false;
  }

  if (this.targetAudience.maxXP && userProfile.xp > this.targetAudience.maxXP) {
    return false;
  }

  // Check age targeting - NEW: Check if user's age falls within any configured age group range
  // Skip age restrictions if user has Google ID (social login) - same logic as Daily Challenges and Game Listing
  if (
    this.targetAudience.age &&
    this.targetAudience.age.length > 0 &&
    !userProfile.hasGoogleId
  ) {
    if (userProfile.age) {
      // Check if user's age falls within any of the configured age groups
      let ageMatches = false;

      for (const ageGroup of this.targetAudience.age) {
        const ageRange = this.parseAgeGroup(ageGroup);
        if (ageRange) {
          const { min, max } = ageRange;
          // Check if user's age falls within this range
          if (max === null) {
            // "65+" format - user must be >= min
            if (userProfile.age >= min) {
              ageMatches = true;
              break;
            }
          } else {
            // "18-24" format - user must be >= min and <= max
            if (userProfile.age >= min && userProfile.age <= max) {
              ageMatches = true;
              break;
            }
          }
        }
      }

      if (!ageMatches) {
        console.log(`🟡 [isEligibleForUser] Age not in any configured range:`, {
          userAge: userProfile.age,
          offerAgeGroups: this.targetAudience.age,
          offerTitle: this.title || this.merchant_name,
        });
        return false;
      }
    } else {
      // Fallback to old method if user doesn't have age
      const userAgeGroup = this.getAgeGroup(userProfile.age || 25);
      if (!this.targetAudience.age.includes(userAgeGroup)) {
        console.log(`🟡 [isEligibleForUser] Age group mismatch:`, {
          userAge: userProfile.age,
          userAgeGroup,
          offerAgeGroups: this.targetAudience.age,
          offerTitle: this.title || this.merchant_name,
        });
        return false;
      }
    }
  }

  // Check gender targeting (case-insensitive comparison)
  // Skip gender restrictions if user has Google ID (social login) - same logic as Daily Challenges
  if (
    this.targetAudience.gender &&
    this.targetAudience.gender.length > 0 &&
    !userProfile.hasGoogleId
  ) {
    const userGender = userProfile.gender
      ? String(userProfile.gender).toLowerCase()
      : null;
    const offerGenders = this.targetAudience.gender.map((g) =>
      String(g).toLowerCase()
    );
    if (!userGender || !offerGenders.includes(userGender)) {
      console.log(`🟡 [isEligibleForUser] Gender mismatch:`, {
        userGender,
        offerGenders,
        offerTitle: this.title || this.merchant_name,
      });
      return false;
    }
  }

  // Check country targeting (skip for cashback so admin-configured cashback shows globally)
  if (this.offerType !== "cashback") {
    if (
      this.targetAudience.countries &&
      this.targetAudience.countries.length > 0
    ) {
      if (!this.targetAudience.countries.includes(userProfile.country)) {
        return false;
      }
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

nonGameOfferSchema.methods.getAgeGroup = function (age) {
  if (age >= 18 && age <= 24) return "18-24";
  if (age >= 25 && age <= 34) return "25-34";
  if (age >= 35 && age <= 44) return "35-44";
  if (age >= 45 && age <= 54) return "45-54";
  if (age >= 55 && age <= 64) return "55-64";
  if (age >= 65) return "65+";
  return "18-24"; // Default
};

nonGameOfferSchema.methods.recordView = function () {
  this.analytics.views += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

nonGameOfferSchema.methods.recordStart = function () {
  this.analytics.starts += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

nonGameOfferSchema.methods.recordCompletion = function (
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

nonGameOfferSchema.methods.recordAbandonment = function () {
  this.analytics.abandonment += 1;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

nonGameOfferSchema.methods.updateStatus = function (status) {
  this.status = status;
  this.analytics.lastUpdated = Date.now();
  return this.save();
};

nonGameOfferSchema.methods.getEngagementFunnel = function () {
  return {
    views: this.analytics.views,
    starts: this.analytics.starts,
    completions: this.analytics.completions,
    abandonment: this.analytics.abandonment,
    conversionRate: this.analytics.conversionRate,
    avgCompletionTime: this.analytics.avgCompletionTime,
  };
};

const NonGameOffer = mongoose.model("NonGameOffer", nonGameOfferSchema);

module.exports = NonGameOffer;

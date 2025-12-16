const mongoose = require("mongoose");

const dailyChallengeSchema = new mongoose.Schema(
  {
    challengeDate: {
      type: Date,
      required: true,
      index: true,
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
    type: {
      type: String,
      required: true,
      enum: [
        "spin",
        "game",
        "survey",
        "referral",
        "watch_ad",
        "social_share",
        "app_install",
        "quiz",
        "custom",
      ],
    },
    coinReward: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    xpReward: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    claimType: {
      type: String,
      required: true,
      enum: ["watch_ad", "auto", "manual", "social_action"],
    },
    isVisible: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "expired", "draft"],
      default: "scheduled",
    },
    targetAudience: {
      gender: [
        {
          type: String,
          enum: ["male", "female", "other"],
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
      countries: [
        {
          type: String,
          trim: true,
        },
      ],
      ageRange: {
        min: {
          type: Number,
          default: 13,
        },
        max: {
          type: Number,
          default: 100,
        },
      },
    },
    requirements: {
      // Generic requirements
      minStreak: {
        type: Number,
        default: 0,
      },
      maxCompletions: {
        type: Number,
        default: null,
      },
      // Timer-based challenge: required time to complete, in minutes.
      // For Game daily challenges this represents the required play time.
      timeLimit: {
        type: Number, // in minutes
        default: null,
        min: 0,
      },
      prerequisites: [
        {
          challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DailyChallenge",
          },
          required: {
            type: Boolean,
            default: true,
          },
        },
      ],
    },
    content: {
      instructions: String,
      mediaUrl: String,
      externalLink: String,
      customFields: mongoose.Schema.Types.Mixed,
    },
    // Game/Task assignment
    gameId: {
      type: String,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
    sdkProvider: {
      type: String,
      trim: true,
    },
    // External game metadata snapshot (same structure as Game model)
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
    assignedGame: {
      gameId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Game",
      },
      isRequired: {
        type: Boolean,
        default: false, // If false, user can select any game
      },
    },
    // SDK Task integration (Besitos, BitLabs, etc.)
    sdkTask: {
      provider: {
        type: String,
        enum: ["besitos", "bitlabs", "none"],
        default: "none",
      },
      taskId: String,
      offerId: String,
      taskData: mongoose.Schema.Types.Mixed,
    },
    analytics: {
      totalViews: {
        type: Number,
        default: 0,
      },
      totalStarts: {
        type: Number,
        default: 0,
      },
      totalCompletions: {
        type: Number,
        default: 0,
      },
      completionRate: {
        type: Number,
        default: 0,
      },
      totalCoinsIssued: {
        type: Number,
        default: 0,
      },
      totalXPIssued: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    scheduling: {
      startTime: {
        type: Date,
        required: true,
      },
      endTime: {
        type: Date,
        required: true,
      },
      timezone: {
        type: String,
        default: "UTC",
      },
      recurring: {
        isRecurring: {
          type: Boolean,
          default: false,
        },
        pattern: {
          type: String,
          enum: ["daily", "weekly", "monthly", "custom"],
        },
        interval: {
          type: Number,
          default: 1,
        },
        daysOfWeek: [
          {
            type: Number,
            min: 0,
            max: 6, // 0 = Sunday, 6 = Saturday
          },
        ],
      },
    },
    metadata: {
      priority: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      tags: [String],
      notes: String,
      campaignId: String,
      version: {
        type: Number,
        default: 1,
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
dailyChallengeSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  // Calculate completion rate
  if (this.analytics.totalStarts > 0) {
    this.analytics.completionRate =
      (this.analytics.totalCompletions / this.analytics.totalStarts) * 100;
  }

  // Update status based on dates
  const now = new Date();
  if (this.scheduling.startTime <= now && this.scheduling.endTime >= now) {
    this.status = "live";
  } else if (this.scheduling.endTime < now) {
    this.status = "expired";
  }

  next();
});

// Indexes for efficient queries
dailyChallengeSchema.index({ challengeDate: 1, status: 1 });
dailyChallengeSchema.index({ status: 1 });
dailyChallengeSchema.index({ type: 1 });
dailyChallengeSchema.index({
  "scheduling.startTime": 1,
  "scheduling.endTime": 1,
});
dailyChallengeSchema.index({ createdAt: -1 });

// Compound indexes for filtering
dailyChallengeSchema.index({ challengeDate: 1, type: 1, status: 1 });
dailyChallengeSchema.index({ status: 1, isVisible: 1 });

// Static methods
dailyChallengeSchema.statics.findByDateRange = function (
  startDate,
  endDate,
  filters = {}
) {
  const query = {
    challengeDate: {
      $gte: startDate,
      $lte: endDate,
    },
    ...filters,
  };

  return this.find(query)
    .sort({ challengeDate: 1, "metadata.priority": -1 })
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");
};

dailyChallengeSchema.statics.findLive = function (date = new Date()) {
  return this.find({
    status: "live",
    "scheduling.startTime": { $lte: date },
    "scheduling.endTime": { $gte: date },
  }).sort({ "metadata.priority": -1, challengeDate: 1 });
};

dailyChallengeSchema.statics.findScheduled = function () {
  return this.find({
    status: "scheduled",
    "scheduling.startTime": { $gt: new Date() },
  }).sort({ "scheduling.startTime": 1 });
};

dailyChallengeSchema.statics.findByType = function (type, date = new Date()) {
  return this.find({
    type: type,
    status: "live",
    "scheduling.startTime": { $lte: date },
    "scheduling.endTime": { $gte: date },
  });
};

dailyChallengeSchema.statics.getCalendarView = function (
  year,
  month,
  filters = {}
) {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);

  return this.findByDateRange(startDate, endDate, filters);
};

// Instance methods
dailyChallengeSchema.methods.isLive = function (date = new Date()) {
  return (
    this.status === "live" &&
    this.scheduling.startTime <= date &&
    this.scheduling.endTime >= date &&
    this.isVisible
  );
};

dailyChallengeSchema.methods.canUserAccess = function (userProfile) {
  const audience = this.targetAudience || {};
  const segments = Array.isArray(audience.userSegments)
    ? audience.userSegments
    : [];
  const genders = Array.isArray(audience.gender) ? audience.gender : [];

  // Check XP requirements
  if (
    typeof audience.minXP === "number" &&
    audience.minXP > 0 &&
    userProfile.xp < audience.minXP
  ) {
    return false;
  }

  if (
    typeof audience.maxXP === "number" &&
    audience.maxXP > 0 &&
    userProfile.xp > audience.maxXP
  ) {
    return false;
  }

  // Check age requirements
  // Skip age restrictions if user has Google ID (social login)
  if (audience.ageRange && !userProfile.hasGoogleId) {
    const minAge = audience.ageRange.min || 13; // Default min age
    const maxAge = audience.ageRange.max || 100; // Default max age
    
    // If challenge has age restrictions, user MUST have age data
    if (!userProfile.age || typeof userProfile.age !== 'number') {
      return false; // Deny access if user doesn't have age data
    }
    
    const userAge = userProfile.age;
    // Check if user's age is within the allowed range (inclusive)
    if (userAge < minAge || userAge > maxAge) {
      return false;
    }
  }

  // Check country requirements
  // Only enforce country restrictions if user has a country set
  // If user doesn't have country data (e.g., Google login users before onboarding),
  // allow access to avoid blocking users with incomplete profiles
  if (
    Array.isArray(audience.countries) &&
    audience.countries.length > 0 &&
    userProfile.country && // Only check if user has country data
    !audience.countries.includes(userProfile.country)
  ) {
    return false;
  }

  // Check gender requirements
  // Skip gender restrictions if user has Google ID (social login)
  if (genders.length > 0 && !userProfile.hasGoogleId) {
    // If challenge has gender restrictions, user MUST have gender data
    if (!userProfile.gender) {
      return false; // Deny access if user doesn't have gender data
    }
    
    const normalizedGender = String(userProfile.gender).toLowerCase();
    if (!genders.includes(normalizedGender)) {
      return false;
    }
  }

  // NOTE: behavioural userSegments ('vip_users', 'high_engagement', etc.)
  // are currently enforced in higher-level logic (pause rules, analytics).
  // We intentionally keep canUserAccess focused on static targeting
  // (XP, age, country, gender) to avoid coupling to user document shape.

  return true;
};

dailyChallengeSchema.methods.updateAnalytics = function (eventType, data = {}) {
  switch (eventType) {
    case "view":
      this.analytics.totalViews += 1;
      break;
    case "start":
      this.analytics.totalStarts += 1;
      break;
    case "complete":
      this.analytics.totalCompletions += 1;
      this.analytics.totalCoinsIssued += data.coins || this.coinReward;
      this.analytics.totalXPIssued += data.xp || this.xpReward;
      break;
  }

  this.analytics.lastUpdated = new Date();
  return this.save();
};

dailyChallengeSchema.methods.getDisplayData = function () {
  return {
    id: this._id,
    title: this.title,
    description: this.description,
    type: this.type,
    coinReward: this.coinReward,
    xpReward: this.xpReward,
    claimType: this.claimType,
    status: this.status,
    isVisible: this.isVisible,
    challengeDate: this.challengeDate,
    startTime: this.scheduling.startTime,
    endTime: this.scheduling.endTime,
    gameId: this.gameId,
    sdkProvider: this.sdkProvider,
    gameDetails: this.gameDetails || {},
    analytics: {
      views: this.analytics.totalViews,
      starts: this.analytics.totalStarts,
      completions: this.analytics.totalCompletions,
      completionRate: this.analytics.completionRate,
    },
  };
};

const DailyChallenge = mongoose.model("DailyChallenge", dailyChallengeSchema);

module.exports = DailyChallenge;

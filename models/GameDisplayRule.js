const mongoose = require("mongoose");

const gameDisplayRuleSchema = new mongoose.Schema(
  {
    // Rule Name - Unique identifier
    ruleName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    // Multi-select milestones: First-time user, Returning user, XP Tier, Membership Tier
    userMilestones: [
      {
        type: String,
        required: true,
        enum: [
          "first_time_user",
          "returning_user",
          "xp_tier",
          "membership_tier",
        ],
      },
    ],
    // Conditional: XP Tier (when "XP Tier" is selected in milestones)
    xpTier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "XPTier",
      required: function () {
        return this.userMilestones && this.userMilestones.includes("xp_tier");
      },
    },
    // Conditional: Membership Tier (when "Membership Tier" is selected in milestones)
    membershipTier: {
      type: String, // References VIPTier.tierId
      required: function () {
        return (
          this.userMilestones && this.userMilestones.includes("membership_tier")
        );
      },
    },
    maxGamesToShow: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
    },
    // Game count limits based on XP Tier, Membership Tier, and New Users
    gameCountLimits: {
      // XP Tier limits
      xpTierLimits: {
        junior: {
          type: Number,
          min: 1,
          max: 50,
          default: null, // null means use maxGamesToShow
        },
        mid: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
        senior: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
      },
      // Membership/VIP Tier limits
      membershipTierLimits: {
        bronze: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
        gold: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
        platinum: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
        free: {
          type: Number,
          min: 1,
          max: 50,
          default: null,
        },
      },
      // New users limit
      newUsersLimit: {
        type: Number,
        min: 1,
        max: 50,
        default: null,
      },
    },
    segmentOverrides: [
      {
        type: {
          type: String,
          enum: ["age", "gender", "country"],
          required: true,
        },
        value: {
          type: String,
          required: true,
        },
        maxGamesToShow: {
          type: Number,
          required: true,
          min: 1,
          max: 50,
        },
      },
    ],
    isEnabled: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    targetSegment: {
      type: String,
      trim: true,
      default: "All Users",
    },
    metadata: {
      description: String,
      notes: String,
      priority: {
        type: Number,
        default: 0,
      },
      targetSegment: String, // Keep for backward compatibility
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

// Helper function to generate targetSegment from userMilestones
function generateTargetSegmentFromMilestones(
  userMilestones,
  membershipTier,
  xpTier
) {
  if (!userMilestones || userMilestones.length === 0) {
    return "All Users";
  }

  const segmentParts = [];

  userMilestones.forEach((milestone) => {
    switch (milestone) {
      case "first_time_user":
        segmentParts.push("New Users");
        break;
      case "returning_user":
        segmentParts.push("Engaged Users");
        break;
      case "xp_tier":
        segmentParts.push("XP Tier");
        break;
      case "membership_tier":
        if (membershipTier) {
          const tierName =
            membershipTier.charAt(0).toUpperCase() + membershipTier.slice(1);
          segmentParts.push(`${tierName} Tier`);
        } else {
          segmentParts.push("Membership Tier");
        }
        break;
    }
  });

  return segmentParts.length > 0 ? segmentParts.join(", ") : "All Users";
}

// Update the updatedAt field and auto-generate targetSegment before saving
gameDisplayRuleSchema.pre("save", async function (next) {
  this.updatedAt = Date.now();

  // Auto-generate targetSegment from userMilestones if not already set or if milestones changed
  // Use top-level targetSegment if provided, otherwise generate from milestones
  if (
    !this.targetSegment ||
    this.isModified("userMilestones") ||
    this.isModified("membershipTier")
  ) {
    // Note: xpTier might be populated, so we need to handle both ObjectId and populated object
    const xpTierValue = this.xpTier?._id || this.xpTier;
    this.targetSegment = generateTargetSegmentFromMilestones(
      this.userMilestones,
      this.membershipTier,
      xpTierValue
    );
  }

  // Also store in metadata for backward compatibility
  if (!this.metadata) {
    this.metadata = {};
  }
  this.metadata.targetSegment = this.targetSegment;

  next();
});

// Indexes for efficient queries
gameDisplayRuleSchema.index({ userMilestones: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ xpTier: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ membershipTier: 1, isEnabled: 1 });
gameDisplayRuleSchema.index({ order: 1 });
gameDisplayRuleSchema.index({ createdAt: -1 });
gameDisplayRuleSchema.index({ ruleName: 1 }); // Unique index already created above

// Virtual for status label
gameDisplayRuleSchema.virtual("status").get(function () {
  return this.isEnabled ? "Active" : "Inactive";
});

// Ensure virtuals are included in JSON
gameDisplayRuleSchema.set("toJSON", { virtuals: true });
gameDisplayRuleSchema.set("toObject", { virtuals: true });

// Static methods
gameDisplayRuleSchema.statics.findActive = function () {
  return this.find({ isEnabled: true }).sort({ order: 1, createdAt: 1 });
};

gameDisplayRuleSchema.statics.findByMilestone = function (milestone) {
  return this.find({
    userMilestones: milestone,
    isEnabled: true,
  });
};

// Helper function to normalize gameCountLimits for comparison
const normalizeGameCountLimits = (limits) => {
  if (!limits) return null;
  return JSON.stringify({
    newUsersLimit: limits.newUsersLimit,
    xpTierLimits: limits.xpTierLimits || {},
    membershipTierLimits: limits.membershipTierLimits || {},
  });
};

// Check for duplicate rules
gameDisplayRuleSchema.statics.findDuplicate = async function (
  ruleData,
  excludeId = null
) {
  // Build base query for milestones (must have exact same milestones)
  const query = {
    userMilestones: {
      $all: ruleData.userMilestones || [],
      $size: (ruleData.userMilestones || []).length,
    },
  };

  // Add XP tier if specified (must match exactly)
  if (ruleData.xpTier) {
    query.xpTier = ruleData.xpTier;
  } else if (
    ruleData.userMilestones &&
    ruleData.userMilestones.includes("xp_tier")
  ) {
    // If xp_tier is in milestones but xpTier is not provided, it's not a duplicate
    query.xpTier = { $exists: false };
  }

  // Add membership tier if specified (must match exactly)
  if (ruleData.membershipTier) {
    query.membershipTier = ruleData.membershipTier;
  } else if (
    ruleData.userMilestones &&
    ruleData.userMilestones.includes("membership_tier")
  ) {
    // If membership_tier is in milestones but membershipTier is not provided, it's not a duplicate
    query.membershipTier = { $exists: false };
  }

  // Add maxGamesToShow to query (must match exactly)
  if (ruleData.maxGamesToShow !== undefined) {
    query.maxGamesToShow = ruleData.maxGamesToShow;
  }

  // For segment overrides, we need to check if they match
  // Since segmentOverrides is an array of objects, we need to compare them properly
  if (ruleData.segmentOverrides && ruleData.segmentOverrides.length > 0) {
    // Find all rules matching the base query first
    const candidateRules = await this.find(query);

    // Convert input overrides to normalized string for comparison
    const normalizeOverrides = (overrides) => {
      return (overrides || [])
        .sort((a, b) => {
          const aStr = `${a.type}-${a.value}`;
          const bStr = `${b.type}-${b.value}`;
          if (aStr !== bStr) return aStr.localeCompare(bStr);
          return a.maxGamesToShow - b.maxGamesToShow;
        })
        .map((o) => `${o.type}:${o.value}:${o.maxGamesToShow}`)
        .join("|");
    };

    const inputOverrideString = normalizeOverrides(ruleData.segmentOverrides);
    const inputGameCountLimitsString = normalizeGameCountLimits(
      ruleData.gameCountLimits
    );

    // Check each candidate rule
    for (const rule of candidateRules) {
      if (excludeId && rule._id.toString() === excludeId.toString()) continue;

      const ruleOverrideString = normalizeOverrides(
        rule.segmentOverrides || []
      );
      const ruleGameCountLimitsString = normalizeGameCountLimits(
        rule.gameCountLimits
      );

      // Must match both segmentOverrides AND gameCountLimits
      if (
        inputOverrideString === ruleOverrideString &&
        inputGameCountLimitsString === ruleGameCountLimitsString
      ) {
        return rule;
      }
    }
    return null;
  } else {
    // If no segment overrides, check for rules with no segment overrides or empty array
    // We need to handle this separately to avoid $or conflicts
    const rulesWithoutOverrides = await this.find({
      ...query,
      $or: [
        { segmentOverrides: { $exists: false } },
        { segmentOverrides: { $size: 0 } },
        { segmentOverrides: null },
      ],
    });

    // Normalize gameCountLimits for comparison
    const inputGameCountLimitsString = normalizeGameCountLimits(
      ruleData.gameCountLimits
    );

    // Check each rule to see if gameCountLimits also match
    for (const rule of rulesWithoutOverrides) {
      if (excludeId && rule._id.toString() === excludeId.toString()) continue;

      const ruleGameCountLimitsString = normalizeGameCountLimits(
        rule.gameCountLimits
      );

      // Must match gameCountLimits as well
      if (inputGameCountLimitsString === ruleGameCountLimitsString) {
        return rule;
      }
    }

    return null;
  }
};

// Instance methods
gameDisplayRuleSchema.methods.getMaxGamesForSegment = function (
  segmentType,
  segmentValue
) {
  // Check for segment override
  const override = this.segmentOverrides.find(
    (o) => o.type === segmentType && o.value === segmentValue
  );

  return override ? override.maxGamesToShow : this.maxGamesToShow;
};

gameDisplayRuleSchema.methods.applyToUser = async function (userProfile) {
  console.log("=== GAME DISPLAY RULE EVALUATION START ===");
  console.log(`Rule: "${this.ruleName}" (ID: ${this._id})`);
  console.log("Rule Configuration:", {
    ruleName: this.ruleName,
    userMilestones: this.userMilestones,
    maxGamesToShow: this.maxGamesToShow,
    priority: this.metadata?.priority || 0,
    gameCountLimits: this.gameCountLimits,
    segmentOverrides: this.segmentOverrides,
  });
  console.log("User Profile:", userProfile);

  const { age, gender, country, xp, gamesPlayed, membershipTier } = userProfile;

  // Validate mutually exclusive milestones first
  // A rule cannot have both first_time_user and returning_user
  if (
    this.userMilestones.includes("first_time_user") &&
    this.userMilestones.includes("returning_user")
  ) {
    console.log(
      "❌ Invalid rule: Cannot have both first_time_user and returning_user"
    );
    return null;
  }

  // Check if rule applies based on milestones
  // ALL selected milestones must match (AND logic)
  let applies = true;
  const milestoneChecks = {};

  // Check first-time user (no games downloaded)
  if (this.userMilestones.includes("first_time_user")) {
    milestoneChecks.first_time_user = gamesPlayed === 0;
    if (gamesPlayed !== 0) {
      applies = false;
      console.log(
        `  ❌ first_time_user milestone: FAILED (gamesPlayed: ${gamesPlayed}, expected: 0)`
      );
    } else {
      console.log(
        `  ✅ first_time_user milestone: PASSED (gamesPlayed: ${gamesPlayed})`
      );
    }
  }

  // Check returning user (one or more games downloaded)
  if (this.userMilestones.includes("returning_user")) {
    milestoneChecks.returning_user = gamesPlayed > 0;
    if (gamesPlayed === 0) {
      applies = false;
      console.log(
        `  ❌ returning_user milestone: FAILED (gamesPlayed: ${gamesPlayed}, expected: > 0)`
      );
    } else {
      console.log(
        `  ✅ returning_user milestone: PASSED (gamesPlayed: ${gamesPlayed})`
      );
    }
  }

  // Check XP tier
  if (this.userMilestones.includes("xp_tier")) {
    if (!this.xpTier) {
      applies = false;
      console.log(
        `  ❌ xp_tier milestone: FAILED (no xpTier configured in rule)`
      );
    } else {
      // Use mongoose.model to avoid circular dependency
      const XPTier = mongoose.models.XPTier || mongoose.model("XPTier");
      const tier = await XPTier.findById(this.xpTier);
      if (!tier || xp < tier.xpMin || xp > tier.xpMax) {
        applies = false;
        console.log(
          `  ❌ xp_tier milestone: FAILED (xp: ${xp}, tier range: ${tier?.xpMin}-${tier?.xpMax})`
        );
      } else {
        console.log(
          `  ✅ xp_tier milestone: PASSED (xp: ${xp}, tier: ${tier?.tierName})`
        );
      }
    }
  }

  // Check membership tier
  if (this.userMilestones.includes("membership_tier")) {
    if (!this.membershipTier) {
      applies = false;
      console.log(
        `  ❌ membership_tier milestone: FAILED (no membershipTier configured in rule)`
      );
    } else if (membershipTier !== this.membershipTier) {
      applies = false;
      console.log(
        `  ❌ membership_tier milestone: FAILED (user: ${membershipTier}, rule: ${this.membershipTier})`
      );
    } else {
      console.log(
        `  ✅ membership_tier milestone: PASSED (tier: ${membershipTier})`
      );
    }
  }

  // If rule doesn't apply, return null
  if (!applies) {
    console.log(`❌ Rule "${this.ruleName}" does NOT apply to user`);
    console.log("=== GAME DISPLAY RULE EVALUATION END (NOT APPLICABLE) ===");
    return null;
  }

  console.log(`✅ Rule "${this.ruleName}" APPLIES to user`);

  // Get max games based on tiers and segments
  let maxGames = this.maxGamesToShow;
  console.log(`\n📊 MAX GAMES CALCULATION:`);
  console.log(`  Step 1 - Base maxGamesToShow: ${maxGames}`);

  // Check gameCountLimits if available
  if (this.gameCountLimits) {
    console.log(`  Step 2 - Checking gameCountLimits...`);

    // Check new users limit
    if (
      gamesPlayed === 0 &&
      this.gameCountLimits.newUsersLimit !== null &&
      this.gameCountLimits.newUsersLimit !== undefined
    ) {
      console.log(
        `    ✅ New Users Limit: ${this.gameCountLimits.newUsersLimit} (user is new)`
      );
      maxGames = this.gameCountLimits.newUsersLimit;
      console.log(`    → maxGames updated to: ${maxGames}`);
    } else {
      console.log(
        `    ⏭️  New Users Limit: SKIPPED (gamesPlayed: ${gamesPlayed}, limit: ${this.gameCountLimits.newUsersLimit})`
      );
    }

    // Check XP tier limit
    if (this.gameCountLimits.xpTierLimits && xp !== undefined && xp !== null) {
      // Determine XP tier based on XP value
      // Junior: 0-500, Mid: 501-2000, Senior: 2001+
      let xpTier = "junior";
      if (xp >= 2001) {
        xpTier = "senior";
      } else if (xp >= 501) {
        xpTier = "mid";
      }

      console.log(`    📈 User XP: ${xp} → XP Tier: ${xpTier}`);
      const tierLimit = this.gameCountLimits.xpTierLimits[xpTier];
      if (tierLimit !== null && tierLimit !== undefined) {
        console.log(`    ✅ XP Tier Limit (${xpTier}): ${tierLimit}`);
        maxGames = tierLimit;
        console.log(`    → maxGames updated to: ${maxGames}`);
      } else {
        console.log(
          `    ⏭️  XP Tier Limit (${xpTier}): NOT SET (using previous value)`
        );
      }
    } else {
      console.log(
        `    ⏭️  XP Tier Limits: SKIPPED (no xpTierLimits or xp is null)`
      );
    }

    // Check membership tier limit
    if (this.gameCountLimits.membershipTierLimits && membershipTier) {
      const membershipTierLower = membershipTier.toLowerCase();
      const tierLimit =
        this.gameCountLimits.membershipTierLimits[membershipTierLower];
      if (tierLimit !== null && tierLimit !== undefined) {
        console.log(
          `    ✅ Membership Tier Limit (${membershipTierLower}): ${tierLimit}`
        );
        maxGames = tierLimit;
        console.log(`    → maxGames updated to: ${maxGames}`);
      } else {
        console.log(
          `    ⏭️  Membership Tier Limit (${membershipTierLower}): NOT SET (using previous value)`
        );
      }
    } else {
      console.log(
        `    ⏭️  Membership Tier Limits: SKIPPED (no limits or no membershipTier)`
      );
    }
  } else {
    console.log(`  Step 2 - gameCountLimits: NOT CONFIGURED`);
  }

  // Check age override
  if (age && this.segmentOverrides && this.segmentOverrides.length > 0) {
    const ageGroup = this.getAgeGroup(age);
    const segmentLimit = this.getMaxGamesForSegment("age", ageGroup);
    console.log(
      `  Step 3 - Age Segment Override: ${segmentLimit} (age: ${age}, group: ${ageGroup})`
    );
    maxGames = Math.min(maxGames, segmentLimit);
    console.log(`    → maxGames updated to: ${maxGames} (using minimum)`);
  } else {
    console.log(
      `  Step 3 - Segment Overrides: SKIPPED (no overrides configured)`
    );
  }

  // Check gender override
  if (gender && this.segmentOverrides && this.segmentOverrides.length > 0) {
    const segmentLimit = this.getMaxGamesForSegment("gender", gender);
    console.log(
      `  Step 4 - Gender Segment Override: ${segmentLimit} (gender: ${gender})`
    );
    maxGames = Math.min(maxGames, segmentLimit);
    console.log(`    → maxGames updated to: ${maxGames} (using minimum)`);
  }

  // Check country override
  if (country && this.segmentOverrides && this.segmentOverrides.length > 0) {
    const segmentLimit = this.getMaxGamesForSegment("country", country);
    console.log(
      `  Step 5 - Country Segment Override: ${segmentLimit} (country: ${country})`
    );
    maxGames = Math.min(maxGames, segmentLimit);
    console.log(`    → maxGames updated to: ${maxGames} (using minimum)`);
  }

  console.log(`\n✅ FINAL maxGames: ${maxGames}`);
  console.log("=== GAME DISPLAY RULE EVALUATION END ===");

  return {
    maxGames,
    ruleId: this._id,
    ruleName: this.ruleName,
    appliedMilestones: this.userMilestones,
  };
};

gameDisplayRuleSchema.methods.getAgeGroup = function (age) {
  if (age < 18) return "under_18";
  if (age >= 18 && age <= 24) return "18_24";
  if (age >= 25 && age <= 34) return "25_34";
  if (age >= 35 && age <= 44) return "35_44";
  if (age >= 45 && age <= 54) return "45_54";
  return "55_plus";
};

const GameDisplayRule = mongoose.model(
  "GameDisplayRule",
  gameDisplayRuleSchema
);

module.exports = GameDisplayRule;

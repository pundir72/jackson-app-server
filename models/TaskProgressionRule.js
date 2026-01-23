const mongoose = require("mongoose");
const {
  getUserXpTier,
  getUserMembershipTier,
  meetsXpTierRequirement,
  meetsMembershipTierRequirement,
} = require("../utils/taskProgression");

/**
 * Task Progression Rule - User-based batch configuration for sequential task unlocking
 *
 * Flow:
 * 1. User completes first N tasks (firstBatchSize)
 * 2. Rewards accumulate in "My Coin Box"
 * 3. After threshold, user can transfer rewards to wallet
 * 4. After transfer, next batch of tasks unlock sequentially
 * 5. Process repeats for subsequent batches
 */
const taskProgressionRuleSchema = new mongoose.Schema(
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
    // Stored as string: "junior", "mid", "senior"
    xpTier: {
      type: String,
      enum: ["junior", "mid", "senior", null],
      required: function () {
        return this.userMilestones && this.userMilestones.includes("xp_tier");
      },
    },

    // Conditional: Membership Tier (when "Membership Tier" is selected in milestones)
    membershipTier: {
      type: String,
      enum: ["bronze", "gold", "platinum", "free", null],
      required: function () {
        return (
          this.userMilestones && this.userMilestones.includes("membership_tier")
        );
      },
    },

    // First batch size - number of tasks that unlock sequentially
    firstBatchSize: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },

    // Next batch size - number of tasks in subsequent batches
    nextBatchSize: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },

    // Maximum number of batches (null = unlimited)
    maxBatches: {
      type: Number,
      default: null,
      min: 1,
    },

    // Priority for rule matching (higher = more priority)
    priority: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
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
taskProgressionRuleSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
taskProgressionRuleSchema.index({ userMilestones: 1, isActive: 1 });
taskProgressionRuleSchema.index({ priority: -1 });
taskProgressionRuleSchema.index({ createdAt: -1 });
taskProgressionRuleSchema.index({ ruleName: 1 }); // Unique index already created above

// Static methods
/**
 * Find the best matching progression rule for a user based on their profile
 * @param {Object} userProfile - User profile object with xp, gamesPlayed, membershipTier
 * @returns {Promise<Object|null>} - Best matching rule or null
 */
taskProgressionRuleSchema.statics.findBestMatchForUser = async function (
  userProfile
) {
  console.log("=== TASK PROGRESSION RULE MATCHING START ===");
  console.log("User Profile:", userProfile);

  const { xp = 0, gamesPlayed = 0, membershipTier = "free" } = userProfile;

  // Get all active rules
  const rules = await this.find({ isActive: true })
    .sort({ priority: 1, createdAt: -1 })
    .lean();

  console.log(`Found ${rules?.length || 0} active task progression rules`);

  if (!rules || rules.length === 0) {
    console.log("❌ No active task progression rules found in database");
    console.log("=== TASK PROGRESSION RULE MATCHING END (NO RULES) ===");
    return null;
  }

  console.log(
    "Active Rules (sorted by priority):",
    rules.map((r) => ({
      ruleName: r.ruleName,
      userMilestones: r.userMilestones,
      xpTier: r.xpTier,
      membershipTier: r.membershipTier,
      priority: r.priority,
    }))
  );

  // Find the first matching rule (highest priority first)
  for (const rule of rules) {
    let matches = true;
    const matchDetails = [];

    // Check each milestone requirement
    for (const milestone of rule.userMilestones || []) {
      switch (milestone) {
        case "first_time_user":
          if (gamesPlayed === 0) {
            matchDetails.push("✅ first_time_user: PASSED");
          } else {
            matches = false;
            matchDetails.push(
              `❌ first_time_user: FAILED (gamesPlayed: ${gamesPlayed}, expected: 0)`
            );
          }
          break;

        case "returning_user":
          if (gamesPlayed >= 3) {
            matchDetails.push("✅ returning_user: PASSED");
          } else {
            matches = false;
            matchDetails.push(
              `❌ returning_user: FAILED (gamesPlayed: ${gamesPlayed}, expected: >= 3)`
            );
          }
          break;

        case "xp_tier":
          if (rule.xpTier) {
            // Get XP tier from admin configuration
            const XPTier = require("./XPTier");
            let userXpTier = null;
            let tierRange = null;

            try {
              const userXpTierDoc = await XPTier.findByXpValue(xp);
              if (userXpTierDoc) {
                // Map tier names to lowercase for matching
                const tierNameMap = {
                  Junior: "junior",
                  Middle: "mid",
                  Senior: "senior",
                };
                userXpTier =
                  tierNameMap[userXpTierDoc.tierName] ||
                  userXpTierDoc.tierName.toLowerCase();
                tierRange = {
                  min: userXpTierDoc.xpMin,
                  max: userXpTierDoc.xpMax || Infinity,
                };
              } else {
                // Fallback to old hardcoded logic
                const tierRanges = {
                  junior: { min: 0, max: 500 },
                  mid: { min: 501, max: 2000 },
                  senior: { min: 2001, max: Infinity },
                };
                if (xp >= 2001) {
                  userXpTier = "senior";
                } else if (xp >= 501) {
                  userXpTier = "mid";
                } else {
                  userXpTier = "junior";
                }
                tierRange = tierRanges[userXpTier];
              }
            } catch (error) {
              console.error("Error fetching XP tier from admin config:", error);
              // Fallback to old hardcoded logic
              const tierRanges = {
                junior: { min: 0, max: 500 },
                mid: { min: 501, max: 2000 },
                senior: { min: 2001, max: Infinity },
              };
              if (xp >= 2001) {
                userXpTier = "senior";
              } else if (xp >= 501) {
                userXpTier = "mid";
              } else {
                userXpTier = "junior";
              }
              tierRange = tierRanges[userXpTier];
            }

            // Check if user's tier matches rule's required tier
            const requiredTier = rule.xpTier.toLowerCase();
            if (userXpTier && tierRange) {
              if (userXpTier === requiredTier) {
                const maxDisplay =
                  tierRange.max === Infinity ? "∞" : tierRange.max;
                matchDetails.push(
                  `✅ xp_tier (${rule.xpTier}): PASSED (xp: ${xp}, range: ${tierRange.min}-${maxDisplay})`
                );
              } else {
                matches = false;
                matchDetails.push(
                  `❌ xp_tier (${rule.xpTier}): FAILED (xp: ${xp}, user tier: ${userXpTier}, required: ${requiredTier})`
                );
              }
            } else {
              matches = false;
              matchDetails.push(
                `❌ xp_tier: FAILED (could not determine user tier)`
              );
            }
          }
          break;

        case "membership_tier":
          if (rule.membershipTier) {
            const tierHierarchy = {
              free: 0,
              bronze: 1,
              gold: 2,
              platinum: 3,
            };
            const userTierLevel = tierHierarchy[membershipTier] || 0;
            const requiredTierLevel = tierHierarchy[rule.membershipTier] || 0;
            if (userTierLevel >= requiredTierLevel) {
              matchDetails.push(
                `✅ membership_tier (${rule.membershipTier}): PASSED (user: ${membershipTier}, level: ${userTierLevel} >= ${requiredTierLevel})`
              );
            } else {
              matches = false;
              matchDetails.push(
                `❌ membership_tier (${rule.membershipTier}): FAILED (user: ${membershipTier}, level: ${userTierLevel} < ${requiredTierLevel})`
              );
            }
          }
          break;
      }
    }

    if (matches) {
      console.log(`✅ Rule "${rule.ruleName}" MATCHES (priority: ${rule.priority}):`, matchDetails);
      console.log("=== TASK PROGRESSION RULE MATCHING END (SUCCESS) ===");
      return rule;
    } else {
      console.log(`❌ Rule "${rule.ruleName}" does NOT match:`, matchDetails);
    }
  }

  console.log("❌ No rules matched user profile");
  console.log("=== TASK PROGRESSION RULE MATCHING END (NO MATCH) ===");
  return null;
};

taskProgressionRuleSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: -1 });
};

// Instance methods
/**
 * Check if a task can be unlocked based on batch progression
 * @param {Number} completedTasksCount - Total number of tasks completed (global across all games)
 * @param {Number} taskOrder - Task order number (1-based, e.g., 1, 2, 3...)
 * @param {Boolean} rewardTransferred - Whether user has transferred rewards from coin box
 * @returns {Object} { canUnlock: Boolean, reason: String }
 */
taskProgressionRuleSchema.methods.canUnlockTask = function (
  completedTasksCount,
  taskOrder,
  rewardTransferred
) {
  if (!this.isActive) {
    return { canUnlock: false, reason: "Rule is inactive" };
  }

  // First batch: tasks 1 to firstBatchSize
  if (taskOrder <= this.firstBatchSize) {
    // Check if previous tasks in the batch are completed
    if (completedTasksCount >= taskOrder - 1) {
      return { canUnlock: true, reason: "First batch task" };
    } else {
      return {
        canUnlock: false,
        reason: `Complete previous tasks first (completed: ${completedTasksCount}, required: ${
          taskOrder - 1
        })`,
      };
    }
  }

  // Subsequent batches: require first batch completed + reward transferred
  const firstBatchCompleted = completedTasksCount >= this.firstBatchSize;

  if (!firstBatchCompleted) {
    return {
      canUnlock: false,
      reason: `Complete ${this.firstBatchSize} tasks first (current: ${completedTasksCount})`,
    };
  }

  if (!rewardTransferred) {
    return {
      canUnlock: false,
      reason: "Transfer rewards from My Coin Box first",
    };
  }

  // Calculate which batch this task belongs to
  const tasksAfterFirstBatch = taskOrder - this.firstBatchSize;
  const batchNumber = Math.ceil(tasksAfterFirstBatch / this.nextBatchSize) + 1; // Batch 2, 3, 4...

  // Check max batches limit
  if (this.maxBatches && batchNumber > this.maxBatches) {
    return {
      canUnlock: false,
      reason: `Maximum batches (${this.maxBatches}) reached`,
    };
  }

  // Calculate how many tasks should be completed to unlock this task
  // Tasks in previous batches (batch 1 + batches 2 to batchNumber-1)
  const tasksInPreviousBatches =
    this.firstBatchSize + (batchNumber - 2) * this.nextBatchSize;

  // Position of this task within its batch (1-based)
  const positionInBatch =
    ((taskOrder - this.firstBatchSize - 1) % this.nextBatchSize) + 1;

  // To unlock this task, user needs to complete all previous batches + previous tasks in current batch
  const requiredCompletedTasks = tasksInPreviousBatches + positionInBatch - 1;

  if (completedTasksCount >= requiredCompletedTasks) {
    return {
      canUnlock: true,
      reason: `Batch ${batchNumber} task`,
    };
  } else {
    return {
      canUnlock: false,
      reason: `Complete ${requiredCompletedTasks} tasks first (current: ${completedTasksCount})`,
    };
  }
};

/**
 * Validate configuration
 */
taskProgressionRuleSchema.methods.isValidConfiguration = function () {
  if (!this.firstBatchSize || this.firstBatchSize < 1) {
    return false;
  }

  if (!this.nextBatchSize || this.nextBatchSize < 1) {
    return false;
  }

  if (this.maxBatches !== null && this.maxBatches < 1) {
    return false;
  }

  if (!this.userMilestones || this.userMilestones.length === 0) {
    return false;
  }

  // Validate mutually exclusive milestones
  if (
    this.userMilestones.includes("first_time_user") &&
    this.userMilestones.includes("returning_user")
  ) {
    return false;
  }

  return true;
};

const TaskProgressionRule = mongoose.model(
  "TaskProgressionRule",
  taskProgressionRuleSchema
);

module.exports = TaskProgressionRule;

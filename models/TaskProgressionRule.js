const mongoose = require("mongoose");
const {
  getUserXpTier,
  getUserMembershipTier,
  meetsXpTierRequirement,
  meetsMembershipTierRequirement,
} = require("../utils/taskProgression");

/**
 * Task Progression Rule - User-based configuration for sequential task unlocking
 *
 * Flow:
 * 1. User completes first N tasks (minimumEventThreshold)
 * 2. Rewards accumulate in "My Coin Box"
 * 3. After threshold, user can transfer rewards to wallet
 * 4. After transfer, next tasks unlock sequentially
 * 5. Post-threshold tasks require: threshold + XP Tier + Membership Tier
 *
 * Note: Rules are applied to users based on their profile, not to specific games
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

    // User targeting criteria - Multi-select milestones
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

    // Priority for rule matching (higher priority rules are applied first)
    priority: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Batch-based progression configuration
    firstBatchSize: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },
    nextBatchSize: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },
    maxBatches: {
      type: Number,
      min: 1,
      default: null,
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
taskProgressionRuleSchema.index({ isActive: 1, priority: -1 });
taskProgressionRuleSchema.index({ createdAt: -1 });
taskProgressionRuleSchema.index({ ruleName: 1 });

// Static methods
taskProgressionRuleSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: -1 });
};

/**
 * Find progression rules that apply to a user based on their profile
 * @param {Object} userProfile - User profile object with age, gender, country, xp, gamesPlayed, membershipTier
 * @returns {Promise<Array>} Array of matching progression rules
 */
taskProgressionRuleSchema.statics.findByUser = async function (userProfile) {
  const activeRules = await this.findActive().lean();

  const matchingRules = [];

  for (const rule of activeRules) {
    const ruleModel = new this(rule);
    const result = await ruleModel.applyToUser(userProfile);
    if (result) {
      matchingRules.push(rule);
    }
  }

  // Return the highest priority rule (or first if priorities are equal)
  return matchingRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
};

/**
 * Find the best matching progression rule for a user
 * @param {Object} userProfile - User profile object
 * @returns {Promise<Object|null>} Best matching rule or null
 */
taskProgressionRuleSchema.statics.findBestMatchForUser = async function (
  userProfile
) {
  const rules = await this.findByUser(userProfile);
  return rules.length > 0 ? rules[0] : null;
};

// Instance methods
/**
 * Check if this progression rule applies to a user based on their profile
 * @param {Object} userProfile - User profile object with xp, gamesPlayed, membershipTier
 * @returns {Object|null} Rule configuration if applicable, null otherwise
 */
taskProgressionRuleSchema.methods.applyToUser = async function (userProfile) {
  const { xp, gamesPlayed, membershipTier } = userProfile;

  // Validate mutually exclusive milestones
  if (
    this.userMilestones.includes("first_time_user") &&
    this.userMilestones.includes("returning_user")
  ) {
    return null;
  }

  // Check if rule applies based on milestones (ALL must match - AND logic)
  let applies = true;

  // Check first-time user
  if (this.userMilestones.includes("first_time_user")) {
    if (gamesPlayed !== 0) {
      applies = false;
    }
  }

  // Check returning user
  if (this.userMilestones.includes("returning_user")) {
    if (gamesPlayed === 0) {
      applies = false;
    }
  }

  // Check XP tier
  if (this.userMilestones.includes("xp_tier")) {
    if (!this.xpTier) {
      applies = false;
    } else {
      // Determine user's XP tier based on XP value
      // Junior: 0-500, Mid: 501-2000, Senior: 2001+
      let userXpTier = "junior";
      if (xp >= 2001) {
        userXpTier = "senior";
      } else if (xp >= 501) {
        userXpTier = "mid";
      }

      // Check if user's XP tier matches the required tier
      const requiredTier = this.xpTier.toLowerCase();
      if (userXpTier !== requiredTier) {
        // For tier matching, check if user meets minimum requirement
        // junior < mid < senior
        const tierOrder = { junior: 1, mid: 2, senior: 3 };
        if (tierOrder[userXpTier] < tierOrder[requiredTier]) {
          applies = false;
        }
      }
    }
  }

  // Check membership tier
  if (this.userMilestones.includes("membership_tier")) {
    if (!this.membershipTier || membershipTier !== this.membershipTier) {
      applies = false;
    }
  }

  // If rule doesn't apply, return null
  if (!applies) {
    return null;
  }

  // Return rule configuration
  return {
    ruleId: this._id,
    ruleName: this.ruleName,
    firstBatchSize: this.firstBatchSize,
    nextBatchSize: this.nextBatchSize,
    maxBatches: this.maxBatches,
    priority: this.priority || 0,
  };
};

/**
 * Check if a task can be unlocked for a user based on batch progression
 * @param {Number} completedTasksCount - Total tasks completed by user (across all games)
 * @param {Number} taskOrder - Order of the task being checked (1-based)
 * @param {Boolean} rewardTransferred - Whether user has transferred rewards from coin box
 * @returns {Object} { canUnlock: Boolean, reason: String, batchNumber: Number }
 */
taskProgressionRuleSchema.methods.canUnlockTask = function (
  completedTasksCount,
  taskOrder,
  rewardTransferred
) {
  if (!this.isActive) {
    return { canUnlock: false, reason: "Rule is inactive", batchNumber: 0 };
  }

  // First batch: tasks 1 to firstBatchSize unlock sequentially
  if (taskOrder <= this.firstBatchSize) {
    // Check if previous tasks in this batch are completed
    if (completedTasksCount >= taskOrder - 1) {
      return {
        canUnlock: true,
        reason: "First batch task",
        batchNumber: 1,
      };
    } else {
      return {
        canUnlock: false,
        reason: `Complete previous tasks first (completed: ${completedTasksCount}, needed: ${
          taskOrder - 1
        })`,
        batchNumber: 1,
      };
    }
  }

  // Next batches: require threshold + transfer
  const firstBatchEnd = this.firstBatchSize;
  const batchSize = this.nextBatchSize;

  // Calculate which batch this task belongs to
  const tasksAfterFirstBatch = taskOrder - firstBatchEnd;
  const batchNumber = Math.ceil(tasksAfterFirstBatch / batchSize) + 1;
  const batchStart = firstBatchEnd + (batchNumber - 2) * batchSize + 1;
  const batchEnd = firstBatchEnd + (batchNumber - 1) * batchSize;

  // Check if max batches limit is reached
  if (this.maxBatches && batchNumber > this.maxBatches + 1) {
    return {
      canUnlock: false,
      reason: `Maximum batches (${this.maxBatches}) reached`,
      batchNumber: batchNumber,
    };
  }

  // For batches after first, need to complete first batch and transfer rewards
  if (completedTasksCount < firstBatchEnd) {
    return {
      canUnlock: false,
      reason: `Complete first ${firstBatchEnd} tasks first (current: ${completedTasksCount})`,
      batchNumber: batchNumber,
    };
  }

  if (!rewardTransferred) {
    return {
      canUnlock: false,
      reason: "Transfer rewards from My Coin Box first",
      batchNumber: batchNumber,
    };
  }

  // Check if previous tasks in this batch are completed
  if (completedTasksCount >= taskOrder - 1) {
    return {
      canUnlock: true,
      reason: `Batch ${batchNumber} task`,
      batchNumber: batchNumber,
    };
  } else {
    return {
      canUnlock: false,
      reason: `Complete previous tasks in batch ${batchNumber} first`,
      batchNumber: batchNumber,
    };
  }
};

/**
 * Validate configuration
 */
taskProgressionRuleSchema.methods.isValidConfiguration = function () {
  // Simple validation: batch sizes must be positive
  if (this.firstBatchSize < 1 || this.nextBatchSize < 1) {
    return false;
  }

  if (this.maxBatches !== null && this.maxBatches < 1) {
    return false;
  }

  return true;
};

const TaskProgressionRule = mongoose.model(
  "TaskProgressionRule",
  taskProgressionRuleSchema
);

module.exports = TaskProgressionRule;

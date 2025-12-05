const mongoose = require("mongoose");
const {
  getUserXpTier,
  getUserMembershipTier,
  meetsXpTierRequirement,
  meetsMembershipTierRequirement,
} = require("../utils/taskProgression");

/**
 * Task Progression Rule - Game-level configuration for sequential task unlocking
 *
 * Flow:
 * 1. User completes first N tasks (minimumEventThreshold)
 * 2. Rewards accumulate in "My Coin Box"
 * 3. After threshold, user can transfer rewards to wallet
 * 4. After transfer, next tasks unlock sequentially
 * 5. Post-threshold tasks require: threshold + XP Tier + Membership Tier
 */
const taskProgressionRuleSchema = new mongoose.Schema(
  {
    // Game this rule applies to
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Game",
      required: true,
      unique: true,
      index: true,
    },

    // Minimum number of tasks user must complete before transfer is allowed
    minimumEventThreshold: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },

    // Tasks that require additional conditions after threshold
    postThresholdTasks: [
      {
        taskId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "GameTask",
          required: true,
        },
        order: {
          type: Number,
          required: true,
          min: 1,
        },
        // Required XP Tier (optional - if null, no XP tier requirement)
        requiredXpTier: {
          type: String,
          enum: ["junior", "mid", "senior", null],
          default: null,
        },
        // Required Membership Tier (optional - if null, no membership tier requirement)
        requiredMembershipTier: {
          type: String,
          enum: ["bronze", "gold", "platinum", null],
          default: null,
        },
        isEnabled: {
          type: Boolean,
          default: true,
        },
      },
    ],

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
taskProgressionRuleSchema.index({ gameId: 1, isActive: 1 });
taskProgressionRuleSchema.index({ createdAt: -1 });

// Static methods
taskProgressionRuleSchema.statics.findByGame = function (gameId) {
  return this.findOne({
    gameId: gameId,
    isActive: true,
  });
};

taskProgressionRuleSchema.statics.findActive = function () {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

// Instance methods
/**
 * Check if a task can be unlocked for a user
 * @param {Object} user - User object
 * @param {String} taskId - Task ID to check
 * @param {Number} completedTasksCount - Number of tasks user has completed for this game
 * @param {Boolean} rewardTransferred - Whether user has transferred rewards from coin box
 * @returns {Object} { canUnlock: Boolean, reason: String }
 */
taskProgressionRuleSchema.methods.canUnlockTask = function (
  user,
  taskId,
  completedTasksCount,
  rewardTransferred
) {
  if (!this.isActive) {
    return { canUnlock: false, reason: "Rule is inactive" };
  }

  // Check if this is a post-threshold task
  const postThresholdTask = this.postThresholdTasks.find(
    (pt) => pt.taskId.toString() === taskId.toString() && pt.isEnabled
  );

  // If task is not in postThresholdTasks, it's a regular sequential task
  if (!postThresholdTask) {
    // Regular sequential unlock - just check if previous tasks are completed
    // This will be handled by the calling code checking task order
    return { canUnlock: true, reason: "Regular sequential task" };
  }

  // Post-threshold task - check all conditions
  // 1. Check if threshold is reached
  if (completedTasksCount < this.minimumEventThreshold) {
    return {
      canUnlock: false,
      reason: `Complete ${this.minimumEventThreshold} tasks first (current: ${completedTasksCount})`,
    };
  }

  // 2. Check if reward has been transferred
  if (!rewardTransferred) {
    return {
      canUnlock: false,
      reason: "Transfer rewards from My Coin Box first",
    };
  }

  // 3. Check XP Tier requirement
  if (postThresholdTask.requiredXpTier) {
    const userXpTier = getUserXpTier(user);
    const requiredTier = postThresholdTask.requiredXpTier.toLowerCase();

    if (!meetsXpTierRequirement(user, requiredTier)) {
      return {
        canUnlock: false,
        reason: `Requires ${requiredTier} XP tier (current: ${userXpTier})`,
      };
    }
  }

  // 4. Check Membership Tier requirement
  if (postThresholdTask.requiredMembershipTier) {
    const userMembershipTier = getUserMembershipTier(user);
    const requiredTier = postThresholdTask.requiredMembershipTier.toLowerCase();

    if (!meetsMembershipTierRequirement(user, requiredTier)) {
      const currentTierDisplay = userMembershipTier || "none";
      return {
        canUnlock: false,
        reason: `Requires ${requiredTier} membership tier (current: ${currentTierDisplay})`,
      };
    }
  }

  return { canUnlock: true, reason: "All conditions met" };
};

/**
 * Validate configuration
 */
taskProgressionRuleSchema.methods.isValidConfiguration = function () {
  // Check for duplicate task IDs
  const taskIds = this.postThresholdTasks.map((pt) => pt.taskId.toString());
  const uniqueTaskIds = [...new Set(taskIds)];

  if (taskIds.length !== uniqueTaskIds.length) {
    return false;
  }

  // Check for duplicate orders
  const orders = this.postThresholdTasks.map((pt) => pt.order);
  const uniqueOrders = [...new Set(orders)];

  if (orders.length !== uniqueOrders.length) {
    return false;
  }

  return true;
};

const TaskProgressionRule = mongoose.model(
  "TaskProgressionRule",
  taskProgressionRuleSchema
);

module.exports = TaskProgressionRule;

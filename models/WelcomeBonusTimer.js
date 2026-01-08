const mongoose = require("mongoose");

const welcomeBonusTimerSchema = new mongoose.Schema(
  {
    unlockTimeHours: {
      type: Number,
      required: true,
      min: 1,
      max: 168, // Maximum 1 week
    },
    completionDeadlineDays: {
      type: Number,
      required: true,
      min: 1,
      max: 365, // Maximum 1 year
    },
    // Maximum number of games that should have bonus tasks (per user)
    maxGamesWithBonusTasks: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
      default: 3,
    },
    // Maximum number of bonus tasks per game
    maxBonusTasksPerGame: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
      default: 3,
    },
    gameOverrides: [
      {
        gameId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Game",
          required: true,
        },
        unlockTimeHours: {
          type: Number,
          required: true,
        },
        completionDeadlineDays: {
          type: Number,
          required: true,
        },
        isEnabled: {
          type: Boolean,
          default: true,
        },
      },
    ],
    xpTierOverrides: [
      {
        minXp: {
          type: Number,
          required: true,
        },
        maxXp: {
          type: Number,
          required: true,
        },
        unlockTimeHours: {
          type: Number,
          required: true,
        },
        completionDeadlineDays: {
          type: Number,
          required: true,
        },
        isEnabled: {
          type: Boolean,
          default: true,
        },
      },
    ],
    // Game-specific bonus tasks configuration
    gameBonusTasks: [
      {
        gameId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Game",
          required: true,
        },
        minimumEventThreshold: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
        completionDeadlineHours: {
          type: Number,
          required: true,
          min: 1,
          max: 168, // Maximum 1 week
          default: 24,
        },
        bonusTasks: [
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
              // max will be validated dynamically based on maxBonusTasksPerGame
            },
            unlockCondition: {
              type: String,
              default:
                "Unlock this Bonus Task after Minimum Event Threshold is met.",
            },
            isEnabled: {
              type: Boolean,
              default: true,
            },
          },
        ],
        isEnabled: {
          type: Boolean,
          default: true,
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      description: String,
      notes: String,
      version: {
        type: String,
        default: "1.0",
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
welcomeBonusTimerSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
welcomeBonusTimerSchema.index({ isActive: 1 });
welcomeBonusTimerSchema.index({ "gameOverrides.gameId": 1 });
welcomeBonusTimerSchema.index({ "gameBonusTasks.gameId": 1 });
welcomeBonusTimerSchema.index({ createdAt: -1 });

// Static methods
welcomeBonusTimerSchema.statics.getActiveRule = function () {
  return this.findOne({ isActive: true });
};

welcomeBonusTimerSchema.statics.getRuleForGame = function (gameId) {
  return this.findOne({
    isActive: true,
    "gameOverrides.gameId": gameId,
    "gameOverrides.isEnabled": true,
  });
};

welcomeBonusTimerSchema.statics.getRuleForXpTier = function (xp) {
  return this.findOne({
    isActive: true,
    "xpTierOverrides.minXp": { $lte: xp },
    "xpTierOverrides.maxXp": { $gte: xp },
    "xpTierOverrides.isEnabled": true,
  });
};

// Instance methods
welcomeBonusTimerSchema.methods.getUnlockTimeForGame = function (gameId) {
  const gameOverride = this.gameOverrides.find(
    (override) =>
      override.gameId.toString() === gameId.toString() && override.isEnabled
  );

  return gameOverride ? gameOverride.unlockTimeHours : this.unlockTimeHours;
};

welcomeBonusTimerSchema.methods.getCompletionDeadlineForGame = function (
  gameId
) {
  const gameOverride = this.gameOverrides.find(
    (override) =>
      override.gameId.toString() === gameId.toString() && override.isEnabled
  );

  return gameOverride
    ? gameOverride.completionDeadlineDays
    : this.completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.getUnlockTimeForXpTier = function (xp) {
  const xpTierOverride = this.xpTierOverrides.find(
    (override) =>
      xp >= override.minXp && xp <= override.maxXp && override.isEnabled
  );

  return xpTierOverride ? xpTierOverride.unlockTimeHours : this.unlockTimeHours;
};

welcomeBonusTimerSchema.methods.getCompletionDeadlineForXpTier = function (xp) {
  const xpTierOverride = this.xpTierOverrides.find(
    (override) =>
      xp >= override.minXp && xp <= override.maxXp && override.isEnabled
  );

  return xpTierOverride
    ? xpTierOverride.completionDeadlineDays
    : this.completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.calculateUnlockTime = function (
  gameId,
  userXp
) {
  // Priority: Game override > XP tier override > Default
  let unlockTimeHours = this.unlockTimeHours;

  // Check game override first
  const gameOverride = this.gameOverrides.find(
    (override) =>
      override.gameId.toString() === gameId.toString() && override.isEnabled
  );

  if (gameOverride) {
    unlockTimeHours = gameOverride.unlockTimeHours;
  } else {
    // Check XP tier override
    const xpTierOverride = this.xpTierOverrides.find(
      (override) =>
        userXp >= override.minXp &&
        userXp <= override.maxXp &&
        override.isEnabled
    );

    if (xpTierOverride) {
      unlockTimeHours = xpTierOverride.unlockTimeHours;
    }
  }

  return unlockTimeHours;
};

welcomeBonusTimerSchema.methods.calculateCompletionDeadline = function (
  gameId,
  userXp
) {
  // Priority: Game override > XP tier override > Default
  let completionDeadlineDays = this.completionDeadlineDays;

  // Check game override first
  const gameOverride = this.gameOverrides.find(
    (override) =>
      override.gameId.toString() === gameId.toString() && override.isEnabled
  );

  if (gameOverride) {
    completionDeadlineDays = gameOverride.completionDeadlineDays;
  } else {
    // Check XP tier override
    const xpTierOverride = this.xpTierOverrides.find(
      (override) =>
        userXp >= override.minXp &&
        userXp <= override.maxXp &&
        override.isEnabled
    );

    if (xpTierOverride) {
      completionDeadlineDays = xpTierOverride.completionDeadlineDays;
    }
  }

  return completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.isValidConfiguration = function () {
  // Validate that unlock time is less than completion deadline
  // Convert unlockTimeHours to days for comparison
  const unlockTimeDays = this.unlockTimeHours / 24;
  if (unlockTimeDays >= this.completionDeadlineDays) {
    return false;
  }

  // Validate game overrides
  for (const gameOverride of this.gameOverrides) {
    const overrideUnlockTimeDays = gameOverride.unlockTimeHours / 24;
    if (overrideUnlockTimeDays >= gameOverride.completionDeadlineDays) {
      return false;
    }
  }

  // Validate XP tier overrides
  for (const xpTierOverride of this.xpTierOverrides) {
    const xpTierUnlockTimeDays = xpTierOverride.unlockTimeHours / 24;
    if (xpTierUnlockTimeDays >= xpTierOverride.completionDeadlineDays) {
      return false;
    }
  }

  // Validate game bonus tasks
  const maxTasks = this.maxBonusTasksPerGame || 3;
  for (const gameBonus of this.gameBonusTasks) {
    if (gameBonus.bonusTasks && gameBonus.bonusTasks.length > maxTasks) {
      return false;
    }

    // Check for duplicate orders
    if (gameBonus.bonusTasks) {
      // Convert orders to numbers and sort
      const orders = gameBonus.bonusTasks
        .map((bt) => Number(bt.order))
        .sort((a, b) => a - b);
      const uniqueOrders = [...new Set(orders)];
      if (orders.length !== uniqueOrders.length) {
        return false;
      }

      // Check for sequential order (1, 2, 3, ... up to maxTasks)
      const expectedOrders = Array.from(
        { length: orders.length },
        (_, i) => i + 1
      );
      if (
        orders.length !== expectedOrders.length ||
        orders.some((order, index) => order !== expectedOrders[index])
      ) {
        return false;
      }

      // Check that no order exceeds maxBonusTasksPerGame
      if (orders.some((order) => order > maxTasks)) {
        return false;
      }
    }
  }

  return true;
};

/**
 * Get bonus tasks for a specific game
 */
welcomeBonusTimerSchema.methods.getBonusTasksForGame = function (gameId) {
  const gameBonus = this.gameBonusTasks.find(
    (gb) => gb.gameId.toString() === gameId.toString() && gb.isEnabled
  );

  if (
    !gameBonus ||
    !gameBonus.bonusTasks ||
    gameBonus.bonusTasks.length === 0
  ) {
    return null;
  }

  return {
    gameId: gameBonus.gameId,
    minimumEventThreshold: gameBonus.minimumEventThreshold,
    bonusTasks: gameBonus.bonusTasks
      .filter((bt) => bt.isEnabled)
      .sort((a, b) => a.order - b.order)
      .map((bt) => ({
        taskId: bt.taskId,
        order: bt.order,
        unlockCondition: bt.unlockCondition,
        completionDeadlineHours: 24, // Fixed 24 hours
      })),
  };
};

welcomeBonusTimerSchema.methods.getTimerInfo = function (
  gameId,
  userXp,
  gameDownloadTime
) {
  const unlockTimeHours = this.calculateUnlockTime(gameId, userXp);
  const completionDeadlineDays = this.calculateCompletionDeadline(
    gameId,
    userXp
  );

  const unlockTime = new Date(
    gameDownloadTime.getTime() + unlockTimeHours * 60 * 60 * 1000
  );
  const completionDeadline = new Date(
    unlockTime.getTime() + completionDeadlineDays * 24 * 60 * 60 * 1000
  );

  const now = new Date();

  return {
    unlockTime,
    completionDeadline,
    isUnlocked: now >= unlockTime,
    isExpired: now > completionDeadline,
    timeUntilUnlock: Math.max(0, unlockTime.getTime() - now.getTime()),
    timeUntilExpiry: Math.max(0, completionDeadline.getTime() - now.getTime()),
    unlockTimeHours,
    completionDeadlineDays,
  };
};

welcomeBonusTimerSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret, options) {
    // If context is provided (from the controller), calculate dynamic timer info
    if (options && options.userContext) {
      const { gameId, userXp, gameDownloadTime } = options.userContext;
      if (gameDownloadTime) {
        const timerInfo = doc.getTimerInfo(gameId, userXp, gameDownloadTime);
        ret.timer = {
          startedAt: gameDownloadTime,
          ...timerInfo
        };
      }
    }
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const WelcomeBonusTimer = mongoose.model(
  "WelcomeBonusTimer",
  welcomeBonusTimerSchema
);

module.exports = WelcomeBonusTimer;

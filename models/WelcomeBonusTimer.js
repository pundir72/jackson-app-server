const mongoose = require('mongoose');

const welcomeBonusTimerSchema = new mongoose.Schema({
  unlockTimeHours: {
    type: Number,
    required: true,
    min: 1,
    max: 168 // Maximum 1 week
  },
  completionDeadlineDays: {
    type: Number,
    required: true,
    min: 1,
    max: 365 // Maximum 1 year
  },
  gameOverrides: [{
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Game',
      required: true
    },
    unlockTimeHours: {
      type: Number,
      required: true
    },
    completionDeadlineDays: {
      type: Number,
      required: true
    },
    isEnabled: {
      type: Boolean,
      default: true
    }
  }],
  xpTierOverrides: [{
    minXp: {
      type: Number,
      required: true
    },
    maxXp: {
      type: Number,
      required: true
    },
    unlockTimeHours: {
      type: Number,
      required: true
    },
    completionDeadlineDays: {
      type: Number,
      required: true
    },
    isEnabled: {
      type: Boolean,
      default: true
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    description: String,
    notes: String,
    version: {
      type: String,
      default: '1.0'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the updatedAt field before saving
welcomeBonusTimerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
welcomeBonusTimerSchema.index({ isActive: 1 });
welcomeBonusTimerSchema.index({ 'gameOverrides.gameId': 1 });
welcomeBonusTimerSchema.index({ createdAt: -1 });

// Static methods
welcomeBonusTimerSchema.statics.getActiveRule = function() {
  return this.findOne({ isActive: true });
};

welcomeBonusTimerSchema.statics.getRuleForGame = function(gameId) {
  return this.findOne({ 
    isActive: true,
    'gameOverrides.gameId': gameId,
    'gameOverrides.isEnabled': true
  });
};

welcomeBonusTimerSchema.statics.getRuleForXpTier = function(xp) {
  return this.findOne({ 
    isActive: true,
    'xpTierOverrides.minXp': { $lte: xp },
    'xpTierOverrides.maxXp': { $gte: xp },
    'xpTierOverrides.isEnabled': true
  });
};

// Instance methods
welcomeBonusTimerSchema.methods.getUnlockTimeForGame = function(gameId) {
  const gameOverride = this.gameOverrides.find(
    override => override.gameId.toString() === gameId.toString() && override.isEnabled
  );
  
  return gameOverride ? gameOverride.unlockTimeHours : this.unlockTimeHours;
};

welcomeBonusTimerSchema.methods.getCompletionDeadlineForGame = function(gameId) {
  const gameOverride = this.gameOverrides.find(
    override => override.gameId.toString() === gameId.toString() && override.isEnabled
  );
  
  return gameOverride ? gameOverride.completionDeadlineDays : this.completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.getUnlockTimeForXpTier = function(xp) {
  const xpTierOverride = this.xpTierOverrides.find(
    override => xp >= override.minXp && xp <= override.maxXp && override.isEnabled
  );
  
  return xpTierOverride ? xpTierOverride.unlockTimeHours : this.unlockTimeHours;
};

welcomeBonusTimerSchema.methods.getCompletionDeadlineForXpTier = function(xp) {
  const xpTierOverride = this.xpTierOverrides.find(
    override => xp >= override.minXp && xp <= override.maxXp && override.isEnabled
  );
  
  return xpTierOverride ? xpTierOverride.completionDeadlineDays : this.completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.calculateUnlockTime = function(gameId, userXp) {
  // Priority: Game override > XP tier override > Default
  let unlockTimeHours = this.unlockTimeHours;
  
  // Check game override first
  const gameOverride = this.gameOverrides.find(
    override => override.gameId.toString() === gameId.toString() && override.isEnabled
  );
  
  if (gameOverride) {
    unlockTimeHours = gameOverride.unlockTimeHours;
  } else {
    // Check XP tier override
    const xpTierOverride = this.xpTierOverrides.find(
      override => userXp >= override.minXp && userXp <= override.maxXp && override.isEnabled
    );
    
    if (xpTierOverride) {
      unlockTimeHours = xpTierOverride.unlockTimeHours;
    }
  }
  
  return unlockTimeHours;
};

welcomeBonusTimerSchema.methods.calculateCompletionDeadline = function(gameId, userXp) {
  // Priority: Game override > XP tier override > Default
  let completionDeadlineDays = this.completionDeadlineDays;
  
  // Check game override first
  const gameOverride = this.gameOverrides.find(
    override => override.gameId.toString() === gameId.toString() && override.isEnabled
  );
  
  if (gameOverride) {
    completionDeadlineDays = gameOverride.completionDeadlineDays;
  } else {
    // Check XP tier override
    const xpTierOverride = this.xpTierOverrides.find(
      override => userXp >= override.minXp && userXp <= override.maxXp && override.isEnabled
    );
    
    if (xpTierOverride) {
      completionDeadlineDays = xpTierOverride.completionDeadlineDays;
    }
  }
  
  return completionDeadlineDays;
};

welcomeBonusTimerSchema.methods.isValidConfiguration = function() {
  // Validate that unlock time is less than completion deadline
  if (this.unlockTimeHours * 24 >= this.completionDeadlineDays) {
    return false;
  }
  
  // Validate game overrides
  for (const gameOverride of this.gameOverrides) {
    if (gameOverride.unlockTimeHours * 24 >= gameOverride.completionDeadlineDays) {
      return false;
    }
  }
  
  // Validate XP tier overrides
  for (const xpTierOverride of this.xpTierOverrides) {
    if (xpTierOverride.unlockTimeHours * 24 >= xpTierOverride.completionDeadlineDays) {
      return false;
    }
  }
  
  return true;
};

welcomeBonusTimerSchema.methods.getTimerInfo = function(gameId, userXp, gameDownloadTime) {
  const unlockTimeHours = this.calculateUnlockTime(gameId, userXp);
  const completionDeadlineDays = this.calculateCompletionDeadline(gameId, userXp);
  
  const unlockTime = new Date(gameDownloadTime.getTime() + (unlockTimeHours * 60 * 60 * 1000));
  const completionDeadline = new Date(unlockTime.getTime() + (completionDeadlineDays * 24 * 60 * 60 * 1000));
  
  const now = new Date();
  
  return {
    unlockTime,
    completionDeadline,
    isUnlocked: now >= unlockTime,
    isExpired: now > completionDeadline,
    timeUntilUnlock: Math.max(0, unlockTime.getTime() - now.getTime()),
    timeUntilExpiry: Math.max(0, completionDeadline.getTime() - now.getTime()),
    unlockTimeHours,
    completionDeadlineDays
  };
};

const WelcomeBonusTimer = mongoose.model('WelcomeBonusTimer', welcomeBonusTimerSchema);

module.exports = WelcomeBonusTimer;



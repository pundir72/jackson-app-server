const mongoose = require('mongoose');

const gameTaskSchema = new mongoose.Schema({
  gameId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  completionRule: {
    type: String,
    required: true,
    trim: true
  },
  // True when this task was mirrored from a provider's goal list rather than
  // curated by an admin. A game can carry 20+ provider goals against a handful
  // of curated tasks, so these are HIDDEN by default from the player-facing
  // task list and the admin pickers, and shown only in the classification
  // editor that exists to work through them.
  isProviderSynced: {
    type: Boolean,
    default: false,
    index: true
  },
  // The provider's own id for this task - BitLabs events[].id, Besitos
  // goals[].goal_id. Webhooks identify a completed goal by this, so without it
  // there is no reliable way to match a callback to a task. The Besitos webhook
  // already tried to query `besitosGoalId`, a field this strict schema never
  // defined, so that lookup could never match.
  externalTaskId: {
    type: String,
    trim: true,
    default: null
  },
  // BitLabs type_id, kept for traceability and so a re-sync can re-derive the
  // classification. Null for Besitos, which exposes no semantic type.
  providerTypeId: {
    type: Number,
    default: null
  },
  // What kind of action this task represents. Multi-valued because real tasks
  // are composite - "Reach Area 11 and Make 1 purchase" is both a milestone and
  // a purchase, and collapsing that to one value loses a challenge match.
  eventTypes: {
    type: [String],
    enum: ['install', 'purchase', 'milestone', 'playtime'],
    default: []
  },
  // Where the classification came from. Only 'provider' and 'admin' may satisfy
  // a purchase/milestone challenge; 'inferred' is a keyword suggestion awaiting
  // human confirmation and must never pay a reward on its own.
  classificationSource: {
    type: String,
    enum: ['provider', 'admin', 'inferred', null],
    default: null
  },
  rewardType: {
    type: String,
    enum: ['xp', 'coins'],
    required: true
  },
  rewardValue: {
    type: Number,
    required: true,
    min: 0
  },
  tierRestriction: {
    type: String,
    // enum: ['free', 'bronze', 'silver', 'gold', 'platinum'],
    default: 'free'
  },
  isOverride: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    estimatedTimeMinutes: {
      type: Number,
      default: 5
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'easy'
    },
    category: {
      type: String,
      enum: ['earning', 'engagement', 'retention', 'social'],
      default: 'earning'
    },
    requirements: {
      minLevel: {
        type: Number,
        default: 1
      },
      vipRequired: {
        type: String,
        // enum: ['free', 'bronze', 'gold', 'platinum'],
        default: 'free'
      },
      maxPerDay: {
        type: Number,
        default: null // null means unlimited
      }
    },
    conditions: {
      minPlayTime: Number, // minutes
      minScore: Number,
      minLevel: Number,
      consecutiveDays: Number,
      totalPlays: Number
    }
  },
  progression: {
    unlockCondition: String,
    lockType: {
      type: String,
      enum: ['sequential', 'timed', 'manual'],
      default: 'sequential'
    },
    dependencies: [{
      taskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GameTask'
      },
      required: {
        type: Boolean,
        default: true
      }
    }],
    unlockThreshold: {
      minEvents: Number,
      minTime: Number, // minutes
      minScore: Number
    }
  },
  analytics: {
    totalAttempts: {
      type: Number,
      default: 0
    },
    totalCompletions: {
      type: Number,
      default: 0
    },
    averageCompletionTime: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    rewardIssued: {
      type: Number,
      default: 0
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
gameTaskSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
// Webhooks look a task up by game + provider task id on every goal completion,
// so this is the hot path for challenge counting.
gameTaskSchema.index({ gameId: 1, externalTaskId: 1 });
gameTaskSchema.index({ eventTypes: 1, classificationSource: 1 });
gameTaskSchema.index({ gameId: 1, order: 1 });
gameTaskSchema.index({ gameId: 1, isActive: 1 });
gameTaskSchema.index({ rewardType: 1 });
gameTaskSchema.index({ tierRestriction: 1 });
gameTaskSchema.index({ isOverride: 1 });
gameTaskSchema.index({ createdAt: -1 });

// Static methods
gameTaskSchema.statics.findByGame = function(gameId) {
  return this.find({ 
    gameId: gameId,
    isActive: true
  }).sort({ order: 1, createdAt: 1 });
};

gameTaskSchema.statics.findByTier = function(tier) {
  return this.find({ 
    tierRestriction: { $in: [tier, 'free'] },
    isActive: true
  }).sort({ order: 1, createdAt: 1 });
};

gameTaskSchema.statics.findOverrides = function() {
  return this.find({ 
    isOverride: true,
    isActive: true
  }).sort({ createdAt: -1 });
};

gameTaskSchema.statics.findByRewardType = function(rewardType) {
  return this.find({ 
    rewardType: rewardType,
    isActive: true
  }).sort({ order: 1, createdAt: 1 });
};

// Instance methods
gameTaskSchema.methods.isEligibleForTier = function(tier) {
  return this.tierRestriction === tier || this.tierRestriction === 'free';
};

gameTaskSchema.methods.updateAnalytics = function(completionTime, completed = false) {
  this.analytics.totalAttempts += 1;
  
  if (completed) {
    this.analytics.totalCompletions += 1;
    
    // Update average completion time
    const totalTime = this.analytics.averageCompletionTime * (this.analytics.totalCompletions - 1) + completionTime;
    this.analytics.averageCompletionTime = totalTime / this.analytics.totalCompletions;
    
    // Update completion rate
    this.analytics.completionRate = (this.analytics.totalCompletions / this.analytics.totalAttempts) * 100;
    
    // Update reward issued
    this.analytics.rewardIssued += this.rewardValue;
  }
  
  return this.save();
};

gameTaskSchema.methods.canUnlock = function(userProgress) {
  if (!this.progression.unlockCondition) {
    return true;
  }
  
  // Check dependencies
  for (const dependency of this.progression.dependencies) {
    if (dependency.required && !userProgress.completedTasks.includes(dependency.taskId)) {
      return false;
    }
  }
  
  // Check unlock threshold
  if (this.progression.unlockThreshold) {
    const { minEvents, minTime, minScore } = this.progression.unlockThreshold;
    
    if (minEvents && userProgress.totalEvents < minEvents) {
      return false;
    }
    
    if (minTime && userProgress.totalPlayTime < minTime) {
      return false;
    }
    
    if (minScore && userProgress.bestScore < minScore) {
      return false;
    }
  }
  
  return true;
};

gameTaskSchema.methods.getRewardAmount = function(userTier = 'free') {
  let multiplier = 1;
  
  // Apply tier-based multipliers
  switch (userTier) {
    case 'bronze':
      multiplier = 1.1;
      break;
    case 'silver':
      multiplier = 1.2;
      break;
    case 'gold':
      multiplier = 1.5;
      break;
    case 'platinum':
      multiplier = 2.0;
      break;
  }
  
  return Math.round(this.rewardValue * multiplier);
};

const GameTask = mongoose.model('GameTask', gameTaskSchema);

module.exports = GameTask;


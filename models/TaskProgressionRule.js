const mongoose = require('mongoose');

const taskProgressionRuleSchema = new mongoose.Schema({
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GameTask',
    required: true
  },
  unlockCondition: {
    type: String,
    required: true,
    enum: ['previous_task_complete', 'xp_threshold', 'time_based', 'manual']
  },
  lockType: {
    type: String,
    required: true,
    enum: ['sequential', 'timed', 'manual']
  },
  eventThresholds: [{
    event: {
      type: String,
      required: true,
      enum: ['game_complete', 'score_achieved', 'time_elapsed', 'xp_earned']
    },
    value: {
      type: Number,
      required: true
    },
    condition: String // e.g., "complete", "score_above_100"
  }],
  rewardTriggerRule: {
    type: String,
    required: true,
    enum: ['immediate', 'on_completion', 'milestone_based', 'conditional']
  },
  dependencies: [{
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameTask'
    },
    condition: {
      type: String,
      enum: ['must_complete', 'must_fail', 'optional']
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    description: String,
    notes: String,
    priority: {
      type: Number,
      default: 0
    },
    tags: [String]
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
taskProgressionRuleSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
taskProgressionRuleSchema.index({ taskId: 1 });
taskProgressionRuleSchema.index({ lockType: 1, isActive: 1 });
taskProgressionRuleSchema.index({ unlockCondition: 1 });
taskProgressionRuleSchema.index({ createdAt: -1 });

// Static methods
taskProgressionRuleSchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ createdAt: -1 });
};

taskProgressionRuleSchema.statics.findByTask = function(taskId) {
  return this.findOne({ 
    taskId: taskId,
    isActive: true
  });
};

taskProgressionRuleSchema.statics.findByUnlockCondition = function(condition) {
  return this.find({ 
    unlockCondition: condition,
    isActive: true
  });
};

// Instance methods
taskProgressionRuleSchema.methods.canUnlock = function(userProgress) {
  if (!this.isActive) {
    return { canUnlock: false, reason: 'Rule is inactive' };
  }

  // Check dependencies
  for (const dep of this.dependencies) {
    const taskProgress = userProgress.tasks.find(t => t.taskId.equals(dep.taskId));
    
    if (!taskProgress) {
      return { canUnlock: false, reason: 'Dependency task not found' };
    }

    switch (dep.condition) {
      case 'must_complete':
        if (!taskProgress.isCompleted) {
          return { canUnlock: false, reason: 'Required dependency not completed' };
        }
        break;
      case 'must_fail':
        if (taskProgress.isCompleted) {
          return { canUnlock: false, reason: 'Dependency must fail but was completed' };
        }
        break;
      case 'optional':
        // Optional dependencies don't block unlocking
        break;
    }
  }

  // Check event thresholds
  for (const threshold of this.eventThresholds) {
    const userEventValue = userProgress.events[threshold.event] || 0;
    
    if (userEventValue < threshold.value) {
      return { 
        canUnlock: false, 
        reason: `${threshold.event} threshold not met (${userEventValue}/${threshold.value})` 
      };
    }
  }

  return { canUnlock: true, reason: 'All conditions met' };
};

taskProgressionRuleSchema.methods.shouldTriggerReward = function(taskProgress) {
  switch (this.rewardTriggerRule) {
    case 'immediate':
      return taskProgress.isCompleted;
    case 'on_completion':
      return taskProgress.isCompleted && !taskProgress.rewardClaimed;
    case 'milestone_based':
      // Check if user has reached milestone
      return taskProgress.isCompleted && this.checkMilestoneReached(taskProgress);
    case 'conditional':
      return this.checkConditionalReward(taskProgress);
    default:
      return false;
  }
};

taskProgressionRuleSchema.methods.checkMilestoneReached = function(taskProgress) {
  // Implementation for milestone-based rewards
  // This would check against user's overall progress
  return true; // Placeholder
};

taskProgressionRuleSchema.methods.checkConditionalReward = function(taskProgress) {
  // Implementation for conditional rewards
  // This would check specific conditions defined in metadata
  return true; // Placeholder
};

const TaskProgressionRule = mongoose.model('TaskProgressionRule', taskProgressionRuleSchema);

module.exports = TaskProgressionRule;


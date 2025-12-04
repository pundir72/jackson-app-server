const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['coins', 'xp']
  },
  value: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const milestoneSchema = new mongoose.Schema({
  day: {
    type: Number,
    required: true,
    enum: [7, 14, 21, 30]
  },
  active: {
    type: Boolean,
    default: true
  },
  rewards: {
    type: [rewardSchema],
    required: true,
    validate: {
      validator: function(rewards) {
        // At least one reward is required, maximum 2 rewards allowed (coins and xp)
        return Array.isArray(rewards) && rewards.length > 0 && rewards.length <= 2;
      },
      message: 'At least one reward is required, maximum 2 rewards allowed per milestone (Coins and XP)'
    }
  },
  claimMode: {
    type: String,
    required: true,
    enum: ['auto', 'watch_ad'],
    default: 'auto'
  }
}, { _id: false });

const streakBonusConfigSchema = new mongoose.Schema({
  milestones: {
    type: [milestoneSchema],
    required: true,
    validate: {
      validator: function(milestones) {
        // Ensure exactly 4 milestones for Day 7, 14, 21, 30
        if (milestones.length !== 4) return false;
        const days = milestones.map(m => m.day).sort((a, b) => a - b);
        return JSON.stringify(days) === JSON.stringify([7, 14, 21, 30]);
      },
      message: 'Must have exactly 4 milestones for Day 7, 14, 21, and 30'
    }
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Ensure only one configuration document exists
streakBonusConfigSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  
  // If no config exists, create default one
  if (!config) {
    config = new this({
      milestones: [
        { day: 7, active: true, rewards: [{ type: 'coins', value: 50 }], claimMode: 'auto' },
        { day: 14, active: true, rewards: [{ type: 'coins', value: 150 }], claimMode: 'auto' },
        { day: 21, active: true, rewards: [{ type: 'coins', value: 300 }], claimMode: 'auto' },
        { day: 30, active: true, rewards: [{ type: 'coins', value: 500 }], claimMode: 'auto' }
      ],
      updatedBy: new mongoose.Types.ObjectId() // Temporary, will be updated on first save
    });
    await config.save();
  } else {
    // Migrate old format to new format if needed
    let needsMigration = false;
    const migratedMilestones = config.milestones.map(milestone => {
      // Check if this milestone uses old format (rewardType/rewardValue)
      if (milestone.rewardType && milestone.rewardValue !== undefined && (!milestone.rewards || !Array.isArray(milestone.rewards))) {
        needsMigration = true;
        return {
          day: milestone.day,
          active: milestone.active !== undefined ? milestone.active : true,
          rewards: [{ type: milestone.rewardType, value: milestone.rewardValue }],
          claimMode: milestone.claimMode || 'auto'
        };
      }
      // Ensure rewards array exists and is valid
      if (!milestone.rewards || !Array.isArray(milestone.rewards) || milestone.rewards.length === 0) {
        needsMigration = true;
        return {
          day: milestone.day,
          active: milestone.active !== undefined ? milestone.active : true,
          rewards: [{ type: 'coins', value: 0 }],
          claimMode: milestone.claimMode || 'auto'
        };
      }
      return milestone;
    });
    
    if (needsMigration) {
      config.milestones = migratedMilestones;
      await config.save();
    }
  }
  
  return config;
};

// Get active milestones only
streakBonusConfigSchema.methods.getActiveMilestones = function() {
  return this.milestones.filter(m => m.active);
};

// Get milestone by day
streakBonusConfigSchema.methods.getMilestoneByDay = function(day) {
  return this.milestones.find(m => m.day === day);
};

// Check if milestone is active
streakBonusConfigSchema.methods.isMilestoneActive = function(day) {
  const milestone = this.getMilestoneByDay(day);
  return milestone ? milestone.active : false;
};

const StreakBonusConfig = mongoose.model('StreakBonusConfig', streakBonusConfigSchema);

module.exports = StreakBonusConfig;


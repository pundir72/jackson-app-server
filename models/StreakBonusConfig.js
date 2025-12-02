const mongoose = require('mongoose');

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
  rewardType: {
    type: String,
    required: true,
    enum: ['coins', 'xp']
  },
  rewardValue: {
    type: Number,
    required: true,
    min: 0
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
        { day: 7, active: true, rewardType: 'coins', rewardValue: 50, claimMode: 'auto' },
        { day: 14, active: true, rewardType: 'coins', rewardValue: 150, claimMode: 'auto' },
        { day: 21, active: true, rewardType: 'coins', rewardValue: 300, claimMode: 'auto' },
        { day: 30, active: true, rewardType: 'coins', rewardValue: 500, claimMode: 'auto' }
      ],
      updatedBy: new mongoose.Types.ObjectId() // Temporary, will be updated on first save
    });
    await config.save();
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


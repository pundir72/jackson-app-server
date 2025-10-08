const mongoose = require('mongoose');

const dailyRewardConfigSchema = new mongoose.Schema({
  // Versioning support to allow multiple configs
  version: { type: Number, default: 1, index: true },
  // Per-day base rewards for 1..7 (coins/xp)
  days: [{
    dayNumber: { type: Number, min: 1, max: 7, required: true },
    coins: { type: Number, default: 10 },
    xp: { type: Number, default: 5 }
  }],
  // Big reward for perfect week
  bigReward: {
    coins: { type: Number, default: 200 },
    xp: { type: Number, default: 100 },
    awardBadge: { type: Boolean, default: false },
    badgeName: { type: String }
  },
  // Normal reward that replaces big reward if missed
  fallbackReward: {
    coins: { type: Number, default: 50 },
    xp: { type: Number, default: 25 }
  },
  // Enable/disable module
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Ensures exactly 7 day entries
dailyRewardConfigSchema.pre('save', function(next) {
  if (!this.days || this.days.length !== 7) {
    return next(new Error('DailyRewardConfig.days must contain exactly 7 entries'));
  }
  next();
});

const DailyRewardConfig = mongoose.model('DailyRewardConfig', dailyRewardConfigSchema);
module.exports = DailyRewardConfig;


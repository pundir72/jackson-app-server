const mongoose = require('mongoose');

// V2 schema for Daily Reward configuration with extended fields
const dailyRewardConfigV2Schema = new mongoose.Schema({
  // Versioning support to allow multiple configs
  version: { type: Number, default: 1, index: true },
  
  // Per-day base rewards for 1..7 (coins/xp)
  days: [{
    dayNumber: { type: Number, min: 1, max: 7, required: true },
    active: { type: Boolean, default: true }, // Enable/disable reward for that day
    rewardType: { 
      type: String, 
      enum: ['Coins', 'XP', 'Both'], 
      default: 'Both',
      required: true
    },
    coinValue: { 
      type: Number, 
      default: 10,
      min: 0
    },
    xpValue: { 
      type: Number, 
      default: 5,
      min: 0
    },
    // Legacy-like fields to keep payloads simple if needed
    coins: { type: Number, default: 10 },
    xp: { type: Number, default: 5 },
    claimButtonLabel: { type: String, default: 'CLAIM NOW' },
    claimableOnLoginOnly: { type: Boolean, default: false },
    timerLabel: { type: String, default: 'Next reward in' }
  }],
  
  // Big reward for perfect week
  bigReward: {
    enabled: { type: Boolean, default: true },
    rewardType: { 
      type: String, 
      enum: ['Coins', 'XP', 'Both'], 
      default: 'Both'
    },
    coinValue: { 
      type: Number, 
      default: 200,
      min: 0
    },
    xpValue: { 
      type: Number, 
      default: 100,
      min: 0
    },
    coins: { type: Number, default: 200 },
    xp: { type: Number, default: 100 },
    awardBadge: { type: Boolean, default: false },
    badgeName: { type: String },
    downgradeOnMiss: { type: Boolean, default: true } // If ON → any missed day resets Day-7 to normal reward
  },
  
  // Normal reward that replaces big reward if missed
  fallbackReward: {
    coins: { type: Number, default: 50 },
    xp: { type: Number, default: 25 }
  },
  
  // Weekly Multiplier Configuration (Gradual)
  weeklyMultiplier: {
    enabled: { type: Boolean, default: false },
    week2: { type: Number, default: 1.0, min: 1.0 },
    week3: { type: Number, default: null, min: 1.0 },
    week4: { type: Number, default: null, min: 1.0 },
    additionalWeeks: [{
      weekNumber: { type: Number, min: 5 },
      multiplier: { type: Number, min: 1.0 }
    }],
    roundingRule: { 
      type: String, 
      enum: ['Round Nearest', 'Round Down'], 
      default: 'Round Nearest'
    }
  },
  
  // Enable/disable module
  isActive: { type: Boolean, default: true },
  
  // Admin tracking
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: false
  }
}, { timestamps: true });

// Ensures exactly 7 day entries and keeps fields consistent
dailyRewardConfigV2Schema.pre('save', function(next) {
  if (!this.days || this.days.length !== 7) {
    return next(new Error('DailyRewardConfigV2.days must contain exactly 7 entries'));
  }
  
  this.days.forEach(day => {
    if (day.coinValue !== undefined) {
      day.coins = day.coinValue;
    } else if (day.coins !== undefined) {
      day.coinValue = day.coins;
    }

    if (day.xpValue !== undefined) {
      day.xp = day.xpValue;
    } else if (day.xp !== undefined) {
      day.xpValue = day.xp;
    }

    if (!day.rewardType) {
      day.rewardType = 'Both';
    }
  });

  if (this.bigReward) {
    if (this.bigReward.coinValue !== undefined) {
      this.bigReward.coins = this.bigReward.coinValue;
    } else if (this.bigReward.coins !== undefined) {
      this.bigReward.coinValue = this.bigReward.coins;
    }

    if (this.bigReward.xpValue !== undefined) {
      this.bigReward.xp = this.bigReward.xpValue;
    } else if (this.bigReward.xp !== undefined) {
      this.bigReward.xpValue = this.bigReward.xp;
    }

    if (!this.bigReward.rewardType) {
      this.bigReward.rewardType = 'Both';
    }
  }

  next();
});

const DailyRewardConfigV2 = mongoose.model('DailyRewardConfigV2', dailyRewardConfigV2Schema);
module.exports = DailyRewardConfigV2;



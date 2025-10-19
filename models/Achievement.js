const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  achievementId: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['streak', 'xp', 'games', 'surveys', 'races', 'wallet', 'social', 'special', 'daily_activity'],
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  rarity: {
    type: String,
    enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  requirements: {
    type: {
      type: String,
      enum: ['streak', 'xp', 'games_played', 'games_completed', 'surveys_completed', 'races_completed', 'wallet_balance', 'consecutive_days', 'total_earnings', 'total_active_days', 'longest_streak', 'daily_rewards_claimed', 'custom'],
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    timeframe: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'all_time'],
      default: 'all_time'
    }
  },
  rewards: {
    coins: {
      type: Number,
      default: 0
    },
    xp: {
      type: Number,
      default: 0
    },
    badge: {
      type: String
    },
    title: {
      type: String
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
achievementSchema.index({ achievementId: 1 });
achievementSchema.index({ category: 1, isActive: 1 });
achievementSchema.index({ rarity: 1 });

// Static methods
achievementSchema.statics.getActiveAchievements = function() {
  return this.find({ isActive: true }).sort({ order: 1, createdAt: 1 });
};

achievementSchema.statics.getAchievementsByCategory = function(category) {
  return this.find({ category, isActive: true }).sort({ order: 1 });
};

achievementSchema.statics.getAchievementById = function(achievementId) {
  return this.findOne({ achievementId, isActive: true });
};

module.exports = mongoose.model('Achievement', achievementSchema);

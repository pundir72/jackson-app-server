const mongoose = require('mongoose');

const milestoneRewardSchema = new mongoose.Schema({
  coins: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0, min: 0 }
}, { _id: false });

const milestoneConfigSchema = new mongoose.Schema({
  target: { type: Number, default: 5, min: 1 },
  reward: { type: milestoneRewardSchema, default: () => ({}) }
}, { _id: false });

const accountOverviewConfigSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },

  milestones: {
    gamesPlayed: { type: milestoneConfigSchema, default: () => ({
      target: 5,
      reward: { coins: 1000, xp: 500 }
    })},
    coinsEarned: { type: milestoneConfigSchema, default: () => ({
      target: 900,
      reward: { coins: 100, xp: 50 }
    })},
    challengesCompleted: { type: milestoneConfigSchema, default: () => ({
      target: 3,
      reward: { coins: 10, xp: 25 }
    })}
  },

  threeTaskReward: {
    coins: { type: Number, default: 1200, min: 0 },
    xp: { type: Number, default: 600, min: 0 }
  },

  isActive: { type: Boolean, default: true },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

accountOverviewConfigSchema.statics.getActiveConfig = async function () {
  let config = await this.findOne({ isActive: true }).sort({ createdAt: -1 });
  if (!config) {
    config = await this.create({
      milestones: {
        gamesPlayed: { target: 5, reward: { coins: 1000, xp: 500 } },
        coinsEarned: { target: 900, reward: { coins: 100, xp: 50 } },
        challengesCompleted: { target: 3, reward: { coins: 10, xp: 25 } }
      },
      threeTaskReward: { coins: 1200, xp: 600 },
      isActive: true
    });
  }
  return config;
};

module.exports = mongoose.model('AccountOverviewConfig', accountOverviewConfigSchema);

const mongoose = require('mongoose');

const dailyRewardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD
  points: { type: Number, default: 0 },
  cashback: { type: Number, default: 0 },
  claimedAt: { type: Date, default: Date.now },
}, { timestamps: true });

dailyRewardSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyReward = mongoose.model('DailyReward', dailyRewardSchema);

module.exports = DailyReward;
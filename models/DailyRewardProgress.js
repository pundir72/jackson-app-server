const mongoose = require('mongoose');

const daySchema = new mongoose.Schema({
  dayNumber: { type: Number, min: 1, max: 7, required: true },
  status: { type: String, enum: ['locked', 'claimable', 'claimed', 'missed'], default: 'locked' },
  claimedAt: { type: Date },
  coins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 }
}, { _id: false });

const dailyRewardProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  // ISO week key like 2025-W41 for quick lookup
  weekKey: { type: String, index: true, required: true },
  // Week start (Monday 00:00 UTC) and end (Sunday 23:59:59 UTC)
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  // Per-day state
  days: [daySchema],
  // Whether big reward was eligible and/or granted
  bigRewardEligible: { type: Boolean, default: false },
  bigRewardGranted: { type: Boolean, default: false },
  // Config reference
  configVersion: { type: Number, default: 1 },
  // Audit
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure one progress record per user per week
dailyRewardProgressSchema.index({ userId: 1, weekKey: 1 }, { unique: true });

const DailyRewardProgress = mongoose.model('DailyRewardProgress', dailyRewardProgressSchema);
module.exports = DailyRewardProgress;


const mongoose = require('mongoose');

const levelSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  title: { type: String, required: true },
  description: { type: String },
  requiredAction: { type: String },
  timeLimitSeconds: { type: Number, default: 0 },
  reward: {
    coins: { type: Number, default: 0 },
    xp: { type: Number, default: 0 }
  },
  tierRequired: { type: String, enum: ['junior', 'mid', 'senior', 'expert'], default: 'junior' }
}, { _id: false });

const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  speed: { type: Number, default: 1.0 },
  avatar: { type: String, default: '🤖' },
  minDelayMs: { type: Number, default: 2000 },
  maxDelayMs: { type: Number, default: 8000 }
}, { _id: false });

const raceConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true }, // e.g., 'beginner-race'
  name: { type: String, required: true },
  description: { type: String },
  requiredTier: { type: String, enum: ['junior', 'mid', 'senior', 'expert'], default: 'junior' },
  maxLevels: { type: Number, default: 10 },
  durationMs: { type: Number, default: 6 * 60 * 60 * 1000 },
  levels: { type: [levelSchema], default: [] },
  bots: { type: [botSchema], default: [] },
  bonusRewards: {
    firstPlace: { coins: { type: Number, default: 100 }, xp: { type: Number, default: 50 } },
    secondPlace: { coins: { type: Number, default: 75 }, xp: { type: Number, default: 40 } },
    thirdPlace: { coins: { type: Number, default: 50 }, xp: { type: Number, default: 30 } }
  },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

raceConfigSchema.statics.getByKey = async function(key) {
  const cfg = await this.findOne({ key, isActive: true }).lean();
  return cfg || null;
};

raceConfigSchema.statics.listActive = function() {
  return this.find({ isActive: true }).select('key name requiredTier maxLevels').lean();
};

module.exports = mongoose.model('RaceConfig', raceConfigSchema);

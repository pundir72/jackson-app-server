const mongoose = require('mongoose');

const xpDecaySettingSchema = new mongoose.Schema({
  tierName: {
    type: String,
    required: true,
    trim: true
  },
  xpRange: {
    type: String,
    required: true,
    trim: true
  },
  xpMin: {
    type: Number,
    required: true,
    min: 0
  },
  xpMax: {
    type: Number,
    required: true,
    min: 0
  },
  decayRuleType: {
    type: String,
    required: true,
    enum: ['Fixed', 'Stepwise', 'Gradual'],
    default: 'Fixed'
  },
  inactivityDuration: {
    type: String,
    required: true,
    trim: true
  },
  inactivityDurationDays: {
    type: Number,
    required: true,
    min: 1
  },
  minimumXpLimit: {
    type: Number,
    required: true,
    min: 0
  },
  decayPercentage: {
    type: String,
    required: true,
    trim: true
  },
  decayPercentageValue: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  sendNotification: {
    type: Boolean,
    default: true
  },
  notificationMessage: {
    type: String,
    trim: true,
    default: 'Your XP will decay due to inactivity. Stay active to maintain your tier!'
  },
  status: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
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
xpDecaySettingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
xpDecaySettingSchema.index({ tierName: 1, status: 1 });
xpDecaySettingSchema.index({ xpMin: 1, xpMax: 1 });

// Virtual for formatted XP range
xpDecaySettingSchema.virtual('formattedXpRange').get(function() {
  return `${this.xpMin} - ${this.xpMax} XP`;
});

// Method to check if XP value falls within this tier's range
xpDecaySettingSchema.methods.isWithinRange = function(xp) {
  return xp >= this.xpMin && xp <= this.xpMax;
};

// Static method to find decay setting for a given XP value
xpDecaySettingSchema.statics.findByXpValue = function(xp) {
  return this.findOne({
    xpMin: { $lte: xp },
    xpMax: { $gte: xp },
    status: true
  });
};

// Static method to get all active decay settings
xpDecaySettingSchema.statics.getActiveSettings = function() {
  return this.find({ status: true }).sort({ order: 1, xpMin: 1 });
};

module.exports = mongoose.model('XPDecaySetting', xpDecaySettingSchema);

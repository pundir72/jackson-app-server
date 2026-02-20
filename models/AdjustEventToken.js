/**
 * Adjust Event Token Model
 * Stores Adjust event tokens and their metadata
 * @module models/AdjustEventToken
 */

const mongoose = require('mongoose');

const adjustEventTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  unique: {
    type: Boolean,
    default: false
  },
  category: {
    type: String,
    enum: [
      'survey',
      'game_download',
      'game_complete',
      'non_gaming_offer',
      'app_lifecycle',
      'daily_challenge',
      'daily_streak',
      'race',
      'cash_withdrawal',
      'purchase',
      'play_time',
      'xp_level',
      'registration',
      'spinner',
      'cash_coach',
      'welcome_bonus',
      'other'
    ],
    default: 'other',
    index: true
  },
  isS2S: {
    type: Boolean,
    default: false,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Adjust S2S: environment for event submission (sandbox | production)
  environment: {
    type: String,
    enum: ['sandbox', 'production'],
    default: 'production',
    index: true
  },
  // Adjust S2S: revenue events (revenue + currency params)
  isRevenueEvent: {
    type: Boolean,
    default: false,
    index: true
  },
  description: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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

// Auto-detect if event is S2S based on name
adjustEventTokenSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-detect S2S events
  if (this.name && this.name.toLowerCase().startsWith('s2s_')) {
    this.isS2S = true;
  }
  
  // Auto-categorize based on name
  if (!this.category || this.category === 'other') {
    const nameLower = this.name.toLowerCase();
    
    if (nameLower.includes('survey')) {
      this.category = 'survey';
    } else if (nameLower.includes('game download') || nameLower.includes('game downloaded')) {
      this.category = 'game_download';
    } else if (nameLower.includes('game completed') || nameLower.includes('game complete')) {
      this.category = 'game_complete';
    } else if (nameLower.includes('non gaming offer') || nameLower.includes('non-gaming offer')) {
      this.category = 'non_gaming_offer';
    } else if (nameLower.includes('app open') || nameLower.includes('app install') || nameLower.includes('app session')) {
      this.category = 'app_lifecycle';
    } else if (nameLower.includes('daily challenge')) {
      this.category = 'daily_challenge';
    } else if (nameLower.includes('daily streak') || nameLower.includes('days daily streak')) {
      this.category = 'daily_streak';
    } else if (nameLower.includes('game in race') || nameLower.includes('race')) {
      this.category = 'race';
    } else if (nameLower.includes('withdrawal') || nameLower.includes('cash withdrawal')) {
      this.category = 'cash_withdrawal';
    } else if (nameLower.includes('purchase')) {
      this.category = 'purchase';
    } else if (nameLower.includes('play') && nameLower.includes('minute')) {
      this.category = 'play_time';
    } else if (nameLower.includes('xp level')) {
      this.category = 'xp_level';
    } else if (nameLower.includes('registration')) {
      this.category = 'registration';
    } else if (nameLower.includes('spinner')) {
      this.category = 'spinner';
    } else if (nameLower.includes('cash coach')) {
      this.category = 'cash_coach';
    } else if (nameLower.includes('welcome bonus')) {
      this.category = 'welcome_bonus';
    }
  }
  
  next();
});

// Indexes for efficient queries
adjustEventTokenSchema.index({ token: 1, isActive: 1 });
adjustEventTokenSchema.index({ name: 1, isActive: 1 });
adjustEventTokenSchema.index({ category: 1, isActive: 1 });
adjustEventTokenSchema.index({ isS2S: 1, isActive: 1 });
adjustEventTokenSchema.index({ environment: 1, isActive: 1 });
adjustEventTokenSchema.index({ isRevenueEvent: 1, isActive: 1 });

// Static methods
adjustEventTokenSchema.statics.findByToken = function(token) {
  return this.findOne({ token, isActive: true });
};

adjustEventTokenSchema.statics.findByName = function(name) {
  return this.findOne({ name, isActive: true });
};

adjustEventTokenSchema.statics.findS2SEvents = function() {
  return this.find({ isS2S: true, isActive: true });
};

adjustEventTokenSchema.statics.findByCategory = function(category) {
  return this.find({ category, isActive: true });
};

const AdjustEventToken = mongoose.model('AdjustEventToken', adjustEventTokenSchema);

module.exports = AdjustEventToken;


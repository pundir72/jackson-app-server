const mongoose = require('mongoose');

const masterDataSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: [
      'age_ranges',
      'genders',
      'primary_goals',
      'improvement_areas',
      'game_preferences',
      'game_styles',
      'player_types',
      'daily_earning_goals',
      'difficulty_levels',
      'game_types',
      'gaming_times',
      'content_filters',
      'themes',
      'languages',
      'currencies',
      'profile_visibility',
      'notification_types'
    ],
    unique: true
  },
  data: [{
    value: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    description: String,
    icon: String,
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    metadata: mongoose.Schema.Types.Mixed
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
masterDataSchema.index({ category: 1, isActive: 1 });
masterDataSchema.index({ 'data.value': 1 });

// Static methods
masterDataSchema.statics.findByCategory = function(category) {
  return this.findOne({ category, isActive: true });
};

masterDataSchema.statics.getAllActive = function() {
  return this.find({ isActive: true });
};

masterDataSchema.statics.updateCategory = function(category, data) {
  return this.findOneAndUpdate(
    { category },
    { 
      data,
      lastUpdated: new Date(),
      version: this.incrementVersion()
    },
    { 
      new: true, 
      upsert: true 
    }
  );
};

// Instance methods
masterDataSchema.methods.getActiveData = function() {
  return this.data.filter(item => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
};

masterDataSchema.methods.findByValue = function(value) {
  return this.data.find(item => item.value === value && item.isActive);
};

const MasterData = mongoose.model('MasterData', masterDataSchema);

module.exports = MasterData; 
const mongoose = require('mongoose');

const masterDataSchema = new mongoose.Schema({
  screen: {
    type: String,
    required: true,
    enum: [
      'primary_goal',
      'gender',
      'age_range',
      'game_preferences',
      'game_style',
      'improvement_area',
      'daily_goal',
      'dealy_game'
    ]
  },
  options: [{
    id: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: false
    },
    order: {
      type: Number,
      required: true
    }
  }],
  maxSelection: {
    type: Number,
    required: false
  },
  active: {
    type: Boolean,
    default: true
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

// Ensure unique screen
masterDataSchema.index({ screen: 1 }, { unique: true });

module.exports = mongoose.model('MasterData', masterDataSchema);

const mongoose = require('mongoose');

const taskStepTemplateSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['game', 'survey', 'challenge', 'milestone', 'receipt']
  },
  reward: {
    coins: {
      type: Number,
      required: true,
      default: 0
    },
    xp: {
      type: Number,
      required: true,
      default: 0
    }
  },
  order: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  requirements: {
    minLevel: {
      type: Number,
      default: 1
    },
    vipRequired: {
      type: String,
      enum: ['free', 'bronze', 'gold', 'platinum'],
      default: 'free'
    },
    maxPerDay: {
      type: Number,
      default: null // null means unlimited
    }
  },
  metadata: {
    estimatedTimeMinutes: {
      type: Number,
      default: 5
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'easy'
    },
    category: {
      type: String,
      enum: ['earning', 'engagement', 'retention', 'social'],
      default: 'earning'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
taskStepTemplateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
taskStepTemplateSchema.index({ type: 1, isActive: 1 });
taskStepTemplateSchema.index({ order: 1 });

// Static method to get active step templates
taskStepTemplateSchema.statics.getActiveTemplates = function() {
  return this.find({ isActive: true }).sort({ order: 1 });
};

// Static method to get templates by type
taskStepTemplateSchema.statics.getTemplatesByType = function(type) {
  return this.find({ type, isActive: true }).sort({ order: 1 });
};

// Static method to get templates for user level
taskStepTemplateSchema.statics.getTemplatesForUser = function(userLevel, vipLevel = 'free') {
  return this.find({
    isActive: true,
    'requirements.minLevel': { $lte: userLevel },
    'requirements.vipRequired': { $in: ['free', vipLevel] }
  }).sort({ order: 1 });
};

module.exports = mongoose.model('TaskStepTemplate', taskStepTemplateSchema);

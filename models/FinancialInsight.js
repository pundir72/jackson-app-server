const mongoose = require('mongoose');

const financialInsightSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['tip', 'warning', 'motivation', 'achievement', 'reminder']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  conditions: {
    minSalary: {
      type: Number,
      default: 0
    },
    maxSalary: {
      type: Number,
      default: null
    },
    minRentRatio: {
      type: Number,
      default: 0
    },
    maxRentRatio: {
      type: Number,
      default: 1
    },
    minSavingsRatio: {
      type: Number,
      default: 0
    },
    maxSavingsRatio: {
      type: Number,
      default: 1
    },
    minRevenueGoal: {
      type: Number,
      default: 0
    },
    maxRevenueGoal: {
      type: Number,
      default: null
    },
    vipLevel: {
      type: String,
      enum: ['free', 'bronze', 'gold', 'platinum'],
      default: 'free'
    }
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    category: {
      type: String,
      enum: ['budgeting', 'saving', 'earning', 'spending', 'goal_setting'],
      default: 'budgeting'
    },
    actionUrl: String,
    icon: String,
    color: String
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
financialInsightSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
financialInsightSchema.index({ isActive: 1, priority: -1 });
financialInsightSchema.index({ type: 1, isActive: 1 });

// Static method to get active insights
financialInsightSchema.statics.getActiveInsights = function() {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: -1 });
};

// Static method to get insights for user profile
financialInsightSchema.statics.getInsightsForUser = function(userProfile) {
  const { salary, rent, food, savings, revenueGoal, vipLevel = 'free' } = userProfile;
  
  const totalExpenses = rent + food;
  const rentRatio = salary > 0 ? rent / salary : 0;
  const savingsRatio = salary > 0 ? savings / salary : 0;
  
  return this.find({
    isActive: true,
    'conditions.minSalary': { $lte: salary },
    'conditions.maxSalary': { $gte: salary },
    'conditions.minRentRatio': { $lte: rentRatio },
    'conditions.maxRentRatio': { $gte: rentRatio },
    'conditions.minSavingsRatio': { $lte: savingsRatio },
    'conditions.maxSavingsRatio': { $gte: savingsRatio },
    'conditions.minRevenueGoal': { $lte: revenueGoal },
    'conditions.maxRevenueGoal': { $gte: revenueGoal },
    $or: [
      { 'conditions.vipLevel': 'free' },
      { 'conditions.vipLevel': vipLevel }
    ]
  }).sort({ priority: -1, createdAt: -1 });
};

// Instance method to check if insight applies to user
financialInsightSchema.methods.appliesToUser = function(userProfile) {
  const { salary, rent, food, savings, revenueGoal, vipLevel = 'free' } = userProfile;
  
  const totalExpenses = rent + food;
  const rentRatio = salary > 0 ? rent / salary : 0;
  const savingsRatio = salary > 0 ? savings / salary : 0;
  
  const conditions = this.conditions;
  
  // Check salary range
  if (salary < conditions.minSalary || (conditions.maxSalary && salary > conditions.maxSalary)) {
    return false;
  }
  
  // Check rent ratio
  if (rentRatio < conditions.minRentRatio || rentRatio > conditions.maxRentRatio) {
    return false;
  }
  
  // Check savings ratio
  if (savingsRatio < conditions.minSavingsRatio || savingsRatio > conditions.maxSavingsRatio) {
    return false;
  }
  
  // Check revenue goal
  if (revenueGoal < conditions.minRevenueGoal || (conditions.maxRevenueGoal && revenueGoal > conditions.maxRevenueGoal)) {
    return false;
  }
  
  // Check VIP level
  if (conditions.vipLevel !== 'free' && conditions.vipLevel !== vipLevel) {
    return false;
  }
  
  return true;
};

module.exports = mongoose.model('FinancialInsight', financialInsightSchema);

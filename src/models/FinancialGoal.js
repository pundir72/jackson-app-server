const mongoose = require('mongoose');

const financialGoalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  category: {
    type: String,
    enum: [
      'emergency_fund',
      'vacation',
      'home_improvement',
      'education',
      'retirement',
      'debt_payoff',
      'investment',
      'wedding',
      'car',
      'business',
      'other'
    ],
    required: true,
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
  },
  deadline: {
    type: Date,
    required: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'cancelled'],
    default: 'active',
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  milestones: [{
    title: {
      type: String,
      required: true,
    },
    targetAmount: {
      type: Number,
      required: true,
    },
    achievedAt: {
      type: Date,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  }],
  contributions: [{
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      enum: ['manual', 'automatic', 'cashback', 'rewards', 'gift'],
      default: 'manual',
    },
    description: {
      type: String,
      maxlength: 200,
    },
    contributedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  savingsPlan: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      min: 0,
    },
    autoTransfer: {
      type: Boolean,
      default: false,
    },
    sourceAccount: {
      type: String,
      enum: ['wallet', 'bank', 'paypal'],
    },
  },
  reminders: {
    enabled: {
      type: Boolean,
      default: true,
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
    },
    nextReminder: {
      type: Date,
    },
  },
  insights: {
    estimatedCompletionDate: {
      type: Date,
    },
    monthlyRequired: {
      type: Number,
      min: 0,
    },
    onTrack: {
      type: Boolean,
      default: true,
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  tags: {
    type: [String],
    default: [],
  },
  isPublic: {
    type: Boolean,
    default: false,
  },
  sharedWith: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    permission: {
      type: String,
      enum: ['view', 'edit', 'admin'],
      default: 'view',
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  notes: [{
    content: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

// Indexes
financialGoalSchema.index({ userId: 1 });
financialGoalSchema.index({ status: 1 });
financialGoalSchema.index({ category: 1 });
financialGoalSchema.index({ deadline: 1 });
financialGoalSchema.index({ priority: 1 });
financialGoalSchema.index({ createdAt: -1 });

// Instance methods
financialGoalSchema.methods.updateProgress = function() {
  this.progress = Math.round((this.currentAmount / this.targetAmount) * 100);
  return this.save();
};

financialGoalSchema.methods.addContribution = function(amount, source = 'manual', description = '') {
  this.currentAmount += parseFloat(amount);
  this.contributions.push({
    amount: parseFloat(amount),
    source,
    description,
  });
  
  // Update progress
  this.updateProgress();
  
  // Check milestones
  this.checkMilestones();
  
  // Update insights
  this.updateInsights();
  
  return this.save();
};

financialGoalSchema.methods.checkMilestones = function() {
  this.milestones.forEach(milestone => {
    if (!milestone.isCompleted && this.currentAmount >= milestone.targetAmount) {
      milestone.isCompleted = true;
      milestone.achievedAt = new Date();
    }
  });
};

financialGoalSchema.methods.updateInsights = function() {
  const now = new Date();
  const timeRemaining = this.deadline - now;
  const amountRemaining = this.targetAmount - this.currentAmount;
  
  if (timeRemaining > 0 && amountRemaining > 0) {
    const monthsRemaining = timeRemaining / (1000 * 60 * 60 * 24 * 30);
    this.insights.monthlyRequired = Math.ceil(amountRemaining / monthsRemaining);
    
    // Calculate estimated completion date
    const monthlyContribution = this.savingsPlan.amount || this.insights.monthlyRequired;
    if (monthlyContribution > 0) {
      const monthsToComplete = amountRemaining / monthlyContribution;
      this.insights.estimatedCompletionDate = new Date(now.getTime() + (monthsToComplete * 30 * 24 * 60 * 60 * 1000));
    }
  }
  
  // Check if on track
  this.insights.onTrack = this.currentAmount >= this.getExpectedAmount();
  
  // Update risk level
  this.updateRiskLevel();
};

financialGoalSchema.methods.updateRiskLevel = function() {
  const progress = this.progress;
  const timeRemaining = this.deadline - new Date();
  const daysRemaining = timeRemaining / (1000 * 60 * 60 * 24);
  
  if (progress >= 80 || daysRemaining > 365) {
    this.insights.riskLevel = 'low';
  } else if (progress >= 50 && daysRemaining > 180) {
    this.insights.riskLevel = 'medium';
  } else {
    this.insights.riskLevel = 'high';
  }
};

financialGoalSchema.methods.getExpectedAmount = function() {
  const now = new Date();
  const totalTime = this.deadline - this.createdAt;
  const elapsedTime = now - this.createdAt;
  const progressRatio = elapsedTime / totalTime;
  
  return this.targetAmount * progressRatio;
};

financialGoalSchema.methods.isCompleted = function() {
  return this.currentAmount >= this.targetAmount;
};

financialGoalSchema.methods.isOverdue = function() {
  return new Date() > this.deadline && !this.isCompleted();
};

financialGoalSchema.methods.getDaysRemaining = function() {
  const now = new Date();
  const diffTime = this.deadline - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

financialGoalSchema.methods.addMilestone = function(title, targetAmount) {
  this.milestones.push({
    title,
    targetAmount,
    isCompleted: false,
  });
  return this.save();
};

financialGoalSchema.methods.addNote = function(content) {
  this.notes.push({ content });
  return this.save();
};

financialGoalSchema.methods.shareWithUser = function(userId, permission = 'view') {
  const existingShare = this.sharedWith.find(share => share.userId.toString() === userId.toString());
  
  if (existingShare) {
    existingShare.permission = permission;
    existingShare.sharedAt = new Date();
  } else {
    this.sharedWith.push({
      userId,
      permission,
    });
  }
  
  return this.save();
};

financialGoalSchema.methods.removeShare = function(userId) {
  this.sharedWith = this.sharedWith.filter(share => share.userId.toString() !== userId.toString());
  return this.save();
};

// Static methods
financialGoalSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

financialGoalSchema.statics.findActive = function(userId) {
  return this.find({ userId, status: 'active' }).sort({ deadline: 1 });
};

financialGoalSchema.statics.findOverdue = function(userId) {
  const now = new Date();
  return this.find({
    userId,
    status: 'active',
    deadline: { $lt: now },
  }).sort({ deadline: 1 });
};

financialGoalSchema.statics.findByCategory = function(userId, category) {
  return this.find({ userId, category, status: 'active' }).sort({ deadline: 1 });
};

financialGoalSchema.statics.getStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalGoals: { $sum: 1 },
        activeGoals: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        completedGoals: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        totalTargetAmount: { $sum: '$targetAmount' },
        totalCurrentAmount: { $sum: '$currentAmount' },
        averageProgress: { $avg: '$progress' },
      },
    },
  ]);
};

financialGoalSchema.statics.getCategoryStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalTargetAmount: { $sum: '$targetAmount' },
        totalCurrentAmount: { $sum: '$currentAmount' },
        averageProgress: { $avg: '$progress' },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

const FinancialGoal = mongoose.model('FinancialGoal', financialGoalSchema);

module.exports = FinancialGoal; 
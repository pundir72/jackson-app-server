const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  answer: mongoose.Schema.Types.Mixed, // Can be string, number, array, etc.
  answeredAt: { type: Date, default: Date.now }
}, { _id: false });

const userSurveyProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalSurvey', required: true, index: true },
  status: { 
    type: String, 
    enum: ['started', 'in_progress', 'completed', 'abandoned', 'expired'],
    default: 'started',
    index: true
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  lastActivityAt: { type: Date, default: Date.now },
  answers: [answerSchema],
  progress: {
    currentQuestion: { type: Number, default: 0 },
    totalQuestions: { type: Number, required: true },
    completionPercentage: { type: Number, default: 0 }
  },
  reward: {
    coins: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
    claimedAt: { type: Date }
  },
  sessionData: {
    sessionId: { type: String, required: true, unique: true },
    deviceInfo: mongoose.Schema.Types.Mixed,
    userAgent: String,
    ipAddress: String
  },
  analytics: {
    timeSpent: { type: Number, default: 0 }, // in seconds
    questionsSkipped: { type: Number, default: 0 },
    answersChanged: { type: Number, default: 0 }
  },
  metadata: {
    completionSource: { type: String, enum: ['web', 'mobile', 'api'], default: 'web' },
    userProfile: mongoose.Schema.Types.Mixed,
    surveyVersion: { type: String, default: '1.0' }
  }
}, { timestamps: true });

// Compound index for efficient queries
userSurveyProgressSchema.index({ userId: 1, surveyId: 1 }, { unique: true });
userSurveyProgressSchema.index({ status: 1, startedAt: -1 });
userSurveyProgressSchema.index({ 'sessionData.sessionId': 1 });

// Virtual for completion status
userSurveyProgressSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed';
});

userSurveyProgressSchema.virtual('isExpired').get(function() {
  const now = new Date();
  const survey = this.populated('surveyId') || this.surveyId;
  return survey && survey.endDate < now;
});

// Static methods
userSurveyProgressSchema.statics.getUserProgress = function(userId, surveyId) {
  return this.findOne({ userId, surveyId })
    .populate('surveyId')
    .populate('userId', 'firstName lastName email');
};

userSurveyProgressSchema.statics.getUserSurveys = function(userId, status = null) {
  const query = { userId };
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('surveyId', 'title description category difficulty estimatedTime reward')
    .sort({ startedAt: -1 });
};

userSurveyProgressSchema.statics.getSurveyStats = function(surveyId) {
  return this.aggregate([
    { $match: { surveyId: new mongoose.Types.ObjectId(surveyId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgTimeSpent: { $avg: '$analytics.timeSpent' }
      }
    }
  ]);
};

userSurveyProgressSchema.statics.getCompletedSurveys = function(userId) {
  return this.find({ userId, status: 'completed' })
    .populate('surveyId', 'title category reward')
    .sort({ completedAt: -1 });
};

// Instance methods
userSurveyProgressSchema.methods.updateProgress = function(questionId, answer) {
  // Update or add answer
  const existingAnswerIndex = this.answers.findIndex(a => a.questionId === questionId);
  
  if (existingAnswerIndex >= 0) {
    this.answers[existingAnswerIndex].answer = answer;
    this.answers[existingAnswerIndex].answeredAt = new Date();
    this.analytics.answersChanged += 1;
  } else {
    this.answers.push({ questionId, answer });
  }

  // Update progress
  this.progress.currentQuestion = this.answers.length;
  this.progress.completionPercentage = (this.answers.length / this.progress.totalQuestions) * 100;
  this.lastActivityAt = new Date();

  return this;
};

userSurveyProgressSchema.methods.completeSurvey = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  this.progress.completionPercentage = 100;
  this.lastActivityAt = new Date();

  // Calculate time spent
  const timeSpent = Math.floor((this.completedAt - this.startedAt) / 1000);
  this.analytics.timeSpent = timeSpent;

  return this;
};

userSurveyProgressSchema.methods.abandonSurvey = function() {
  this.status = 'abandoned';
  this.lastActivityAt = new Date();
  return this;
};

userSurveyProgressSchema.methods.setReward = function(coins, xp) {
  this.reward.coins = coins;
  this.reward.xp = xp;
  return this;
};

userSurveyProgressSchema.methods.claimReward = function() {
  if (this.status !== 'completed') {
    throw new Error('Survey must be completed to claim reward');
  }
  
  if (this.reward.claimed) {
    throw new Error('Reward already claimed');
  }

  this.reward.claimed = true;
  this.reward.claimedAt = new Date();
  return this;
};

userSurveyProgressSchema.methods.getProgressData = function() {
  return {
    id: this._id,
    surveyId: this.surveyId,
    status: this.status,
    startedAt: this.startedAt,
    completedAt: this.completedAt,
    lastActivityAt: this.lastActivityAt,
    progress: this.progress,
    reward: this.reward,
    answers: this.answers,
    analytics: this.analytics,
    isCompleted: this.isCompleted,
    isExpired: this.isExpired
  };
};

// Pre-save middleware
userSurveyProgressSchema.pre('save', function(next) {
  // Update last activity
  this.lastActivityAt = new Date();

  // Check if survey is expired
  if (this.surveyId && this.surveyId.endDate && this.surveyId.endDate < new Date()) {
    this.status = 'expired';
  }

  next();
});

const UserSurveyProgress = mongoose.model('UserSurveyProgress', userSurveyProgressSchema);
module.exports = UserSurveyProgress;



const mongoose = require('mongoose');

const surveyQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['multiple_choice', 'text', 'rating', 'yes_no', 'multiple_select'],
    required: true 
  },
  options: [{ type: String }],
  required: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { _id: false });

const eligibilitySchema = new mongoose.Schema({
  countries: [{ type: String }],
  minAge: { type: Number, default: 18 },
  maxAge: { type: Number, default: 100 },
  minXPLevel: { type: Number, default: 0 },
  maxXPLevel: { type: Number, default: 999999 },
  gender: [{ type: String, enum: ['male', 'female', 'other'] }],
  interests: [{ type: String }],
  deviceTypes: [{ type: String, enum: ['ios', 'android', 'web'] }]
}, { _id: false });

const rewardSchema = new mongoose.Schema({
  coins: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  description: { type: String }
}, { _id: false });

const internalSurveySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category: { 
    type: String, 
    enum: ['finance', 'shopping', 'entertainment', 'technology', 'health', 'travel', 'education', 'gaming', 'lifestyle', 'other'],
    default: 'other' 
  },
  difficulty: { 
    type: String, 
    enum: ['easy', 'medium', 'hard'],
    default: 'easy' 
  },
  estimatedTime: { type: Number, required: true }, // in minutes
  questions: [surveyQuestionSchema],
  eligibility: eligibilitySchema,
  reward: rewardSchema,
  status: { 
    type: String, 
    enum: ['draft', 'active', 'paused', 'completed', 'expired'],
    default: 'draft',
    index: true
  },
  isActive: { type: Boolean, default: true, index: true },
  maxParticipants: { type: Number, default: 0 }, // 0 for unlimited
  currentParticipants: { type: Number, default: 0 },
  completionCount: { type: Number, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  displaySettings: {
    showProgress: { type: Boolean, default: true },
    allowPartialCompletion: { type: Boolean, default: false },
    requireAllQuestions: { type: Boolean, default: true },
    showRewardPreview: { type: Boolean, default: true }
  },
  analytics: {
    views: { type: Number, default: 0 },
    starts: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    abandonment: { type: Number, default: 0 },
    avgCompletionTime: { type: Number, default: 0 }, // in seconds
    conversionRate: { type: Number, default: 0 }, // percentage
    totalRewardsGiven: { type: Number, default: 0 }
  },
  metadata: {
    tags: [{ type: String }],
    priority: { type: Number, default: 0 },
    thumbnail: { type: String },
    instructions: { type: String },
    completionMessage: { type: String, default: 'Thank you for completing the survey!' }
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Indexes for efficient queries
internalSurveySchema.index({ status: 1, isActive: 1, startDate: 1, endDate: 1 });
internalSurveySchema.index({ category: 1, difficulty: 1 });
internalSurveySchema.index({ 'eligibility.countries': 1 });
internalSurveySchema.index({ createdBy: 1 });

// Virtual for active surveys
internalSurveySchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.isActive && 
         this.status === 'active' && 
         this.startDate <= now && 
         this.endDate >= now;
});

// Static methods
internalSurveySchema.statics.getActiveSurveys = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ priority: -1, createdAt: -1 });
};

internalSurveySchema.statics.getSurveysForUser = function(userProfile) {
  const now = new Date();
  const query = {
    isActive: true,
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now }
  };

  // Add eligibility filters
  if (userProfile.country) {
    query.$or = [
      { 'eligibility.countries': { $size: 0 } },
      { 'eligibility.countries': userProfile.country }
    ];
  }

  if (userProfile.age) {
    query['eligibility.minAge'] = { $lte: userProfile.age };
    query['eligibility.maxAge'] = { $gte: userProfile.age };
  }

  if (userProfile.xpLevel) {
    query['eligibility.minXPLevel'] = { $lte: userProfile.xpLevel };
    query['eligibility.maxXPLevel'] = { $gte: userProfile.xpLevel };
  }

  return this.find(query).sort({ priority: -1, createdAt: -1 });
};

// Instance methods
internalSurveySchema.methods.incrementView = function() {
  this.analytics.views += 1;
  return this.save();
};

internalSurveySchema.methods.incrementStart = function() {
  this.analytics.starts += 1;
  this.currentParticipants += 1;
  return this.save();
};

internalSurveySchema.methods.incrementCompletion = function() {
  this.analytics.completions += 1;
  this.completionCount += 1;
  this.currentParticipants = Math.max(0, this.currentParticipants - 1);
  
  // Update conversion rate
  if (this.analytics.starts > 0) {
    this.analytics.conversionRate = (this.analytics.completions / this.analytics.starts) * 100;
  }
  
  return this.save();
};

internalSurveySchema.methods.incrementAbandonment = function() {
  this.analytics.abandonment += 1;
  this.currentParticipants = Math.max(0, this.currentParticipants - 1);
  return this.save();
};

internalSurveySchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    title: this.title,
    description: this.description,
    category: this.category,
    difficulty: this.difficulty,
    estimatedTime: this.estimatedTime,
    reward: this.reward,
    eligibility: this.eligibility,
    status: this.status,
    isActive: this.isActive,
    startDate: this.startDate,
    endDate: this.endDate,
    displaySettings: this.displaySettings,
    metadata: this.metadata,
    analytics: this.analytics,
    isCurrentlyActive: this.isCurrentlyActive
  };
};

internalSurveySchema.methods.checkUserEligibility = function(userProfile) {
  const eligibility = this.eligibility;
  
  // Check country
  // if (eligibility.countries && eligibility.countries.length > 0) {
  //   if (!userProfile.country || !eligibility.countries.includes(userProfile.country)) {
  //     return { eligible: false, reason: 'Country not supported' };
  //   }
  // }

  // Check age
  if (userProfile.age) {
    if (userProfile.age < eligibility.minAge || userProfile.age > eligibility.maxAge) {
      return { eligible: false, reason: 'Age requirement not met' };
    }
  }

  // Check XP level
  if (userProfile.xpLevel) {
    if (userProfile.xpLevel < eligibility.minXPLevel || userProfile.xpLevel > eligibility.maxXPLevel) {
      return { eligible: false, reason: 'XP level requirement not met' };
    }
  }

  // Check gender
  if (eligibility.gender && eligibility.gender.length > 0) {
    if (!userProfile.gender || !eligibility.gender.includes(userProfile.gender)) {
      return { eligible: false, reason: 'Gender requirement not met' };
    }
  }

  // Check device type
  if (eligibility.deviceTypes && eligibility.deviceTypes.length > 0) {
    if (!userProfile.deviceType || !eligibility.deviceTypes.includes(userProfile.deviceType)) {
      return { eligible: false, reason: 'Device type not supported' };
    }
  }

  return { eligible: true, reason: null };
};

// Pre-save middleware
internalSurveySchema.pre('save', function(next) {
  // Update analytics
  if (this.analytics.starts > 0) {
    this.analytics.conversionRate = (this.analytics.completions / this.analytics.starts) * 100;
  }

  // Auto-expire surveys
  if (this.endDate < new Date() && this.status === 'active') {
    this.status = 'expired';
  }

  next();
});

const InternalSurvey = mongoose.model('InternalSurvey', internalSurveySchema);
module.exports = InternalSurvey;



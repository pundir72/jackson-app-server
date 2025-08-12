const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String for temporary users
    ref: 'User',
    required: true,
    unique: true,
  },
  // Onboarding preferences
  onboarding: {
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedSteps: [{
      step: {
        type: String,
        enum: [
          'welcome',
          'age_selection',
          'gender_selection',
          'primary_goal',
          'improvement_areas',
          'daily_earning_goal',
          'game_preferences',
          'game_style',
          'player_type',
          'location_permission',
          'face_id_setup',
          'disclosure_accepted'
        ],
      },
      completedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    currentStep: {
      type: String,
      enum: [
        'welcome',
        'age_selection',
        'gender_selection',
        'primary_goal',
        'improvement_areas',
        'daily_earning_goal',
        'game_preferences',
        'game_style',
        'player_type',
        'location_permission',
        'face_id_setup',
        'disclosure_accepted'
      ],
      default: 'welcome',
    },
  },
  // Personal preferences
  personal: {
    ageRange: {
      type: String,
      enum: ['Under 18', '18-24', '25-34', '35-44', '45-54', '55+'],
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    },
    primaryGoal: {
      type: String,
      enum: [
        'save_money',
        'earn_cashback',
        'play_games',
        'learn_finance',
        'social_connection',
        'entertainment',
        'other'
      ],
    },
    improvementAreas: [{
      type: String,
      enum: [
        'budgeting',
        'saving',
        'investing',
        'debt_management',
        'credit_score',
        'financial_literacy',
        'spending_habits',
        'goal_setting'
      ],
    }],
    dailyEarningGoal: {
      type: Number,
      min: 0,
      default: 0.00,
    },
    weeklyEarningGoal: {
      type: Number,
      min: 0,
      default: 0.00,
    },
    monthlyEarningGoal: {
      type: Number,
      min: 0,
      default: 0.00,
    },
  },
  // Game preferences
  gaming: {
    gamePreferences: [{
      type: String,
      enum: [
        'puzzle_brain',
        'strategy_thinking',
        'action_fast',
        'arcade_classic',
        'educational_learning',
        'casino_gambling',
        'trivia_knowledge',
        'simulation_realistic',
        'card_games',
        'word_games',
        'math_games',
        'memory_games'
      ],
    }],
    gameStyle: {
      type: String,
      enum: ['short_sessions', 'medium_sessions', 'long_sessions', 'anytime_play'],
    },
    gameHabit: {
      type: String,
      enum: [
        'evening_reward_gamer',
        'casual_break_gamer',
        'night_reward_fail_gamer',
        'fun_anytime_gamer',
        'daily_high_reward_gamer'
      ],
    },
    preferredDifficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'expert'],
      default: 'medium',
    },
    preferredGameType: {
      type: String,
      enum: ['single_player', 'multiplayer', 'tournament', 'challenge'],
      default: 'single_player',
    },
    gamingTime: {
      type: String,
      enum: ['short', 'medium', 'long'],
      default: 'medium',
    },
    maxDailyGamingTime: {
      type: Number,
      default: 60,
      comment: 'Maximum gaming time in minutes per day',
    },
  },
  // Notification preferences
  notifications: {
    pushNotifications: {
      type: Boolean,
      default: true,
    },
    emailNotifications: {
      type: Boolean,
      default: true,
    },
    smsNotifications: {
      type: Boolean,
      default: true,
    },
    inAppNotifications: {
      type: Boolean,
      default: true,
    },
    notificationTypes: {
      challenges: {
        type: Boolean,
        default: true,
      },
      rewards: {
        type: Boolean,
        default: true,
      },
      games: {
        type: Boolean,
        default: true,
      },
      deals: {
        type: Boolean,
        default: true,
      },
      vip: {
        type: Boolean,
        default: true,
      },
      location: {
        type: Boolean,
        default: true,
      },
      reminders: {
        type: Boolean,
        default: true,
      },
      weeklySummary: {
        type: Boolean,
        default: true,
      },
    },
    quietHours: {
      enabled: {
        type: Boolean,
        default: false,
      },
      startTime: {
        type: String,
        default: '22:00',
      },
      endTime: {
        type: String,
        default: '08:00',
      },
    },
  },
  // Privacy and security
  privacy: {
    profileVisibility: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public',
    },
    showEarnings: {
      type: Boolean,
      default: true,
    },
    showGameProgress: {
      type: Boolean,
      default: true,
    },
    showChallenges: {
      type: Boolean,
      default: true,
    },
    allowFriendRequests: {
      type: Boolean,
      default: true,
    },
    allowMessages: {
      type: Boolean,
      default: true,
    },
    dataSharing: {
      analytics: {
        type: Boolean,
        default: true,
      },
      marketing: {
        type: Boolean,
        default: false,
      },
      thirdParty: {
        type: Boolean,
        default: false,
      },
    },
  },
  // App preferences
  app: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto',
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'],
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'KRW'],
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    autoSave: {
      type: Boolean,
      default: true,
    },
    soundEnabled: {
      type: Boolean,
      default: true,
    },
    vibrationEnabled: {
      type: Boolean,
      default: true,
    },
    hapticFeedback: {
      type: Boolean,
      default: true,
    },
  },
  // Location preferences
  location: {
    locationEnabled: {
      type: Boolean,
      default: false,
    },
    locationSharing: {
      type: Boolean,
      default: false,
    },
    locationBasedRewards: {
      type: Boolean,
      default: true,
    },
    locationBasedChallenges: {
      type: Boolean,
      default: true,
    },
    locationBasedDeals: {
      type: Boolean,
      default: true,
    },
    locationRadius: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
      comment: 'Radius in kilometers for location-based features',
    },
  },
  // Security preferences
  security: {
    faceIdEnabled: {
      type: Boolean,
      default: false,
    },
    touchIdEnabled: {
      type: Boolean,
      default: false,
    },
    biometricEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    sessionTimeout: {
      type: Number,
      default: 30,
      min: 5,
      max: 1440,
      comment: 'Session timeout in minutes',
    },
    loginNotifications: {
      type: Boolean,
      default: true,
    },
    suspiciousActivityAlerts: {
      type: Boolean,
      default: true,
    },
  },
  // Content preferences
  content: {
    contentFilter: {
      type: String,
      enum: ['none', 'mild', 'moderate', 'strict'],
      default: 'none',
    },
    showAds: {
      type: Boolean,
      default: true,
    },
    personalizedContent: {
      type: Boolean,
      default: true,
    },
    recommendations: {
      type: Boolean,
      default: true,
    },
    educationalContent: {
      type: Boolean,
      default: true,
    },
  },
  // Accessibility
  accessibility: {
    fontSize: {
      type: String,
      enum: ['small', 'medium', 'large', 'extra_large'],
      default: 'medium',
    },
    highContrast: {
      type: Boolean,
      default: false,
    },
    reduceMotion: {
      type: Boolean,
      default: false,
    },
    screenReader: {
      type: Boolean,
      default: false,
    },
    voiceOver: {
      type: Boolean,
      default: false,
    },
  },
}, {
  timestamps: true,
});

// Additional indexes (unique indexes are already defined in schema)
userPreferenceSchema.index({ 'onboarding.isCompleted': 1 });
userPreferenceSchema.index({ 'personal.ageRange': 1 });
userPreferenceSchema.index({ 'personal.gender': 1 });
userPreferenceSchema.index({ 'gaming.gamePreferences': 1 });

// Instance methods
userPreferenceSchema.methods.completeOnboardingStep = function(step) {
  // Check if step is already completed
  const existingStep = this.onboarding.completedSteps.find(s => s.step === step);
  if (!existingStep) {
    this.onboarding.completedSteps.push({
      step,
      completedAt: new Date(),
    });
  }

  // Update current step
  this.onboarding.currentStep = step;

  // Check if onboarding is complete
  const requiredSteps = [
    'welcome',
    'age_selection',
    'gender_selection',
    'primary_goal',
    'improvement_areas',
    'daily_earning_goal',
    'game_preferences',
    'game_style',
    'location_permission',
    'face_id_setup',
    'disclosure_accepted'
  ];

  const completedSteps = this.onboarding.completedSteps.map(s => s.step);
  const allStepsCompleted = requiredSteps.every(step => completedSteps.includes(step));

  if (allStepsCompleted) {
    this.onboarding.isCompleted = true;
  }

  return this.save();
};

userPreferenceSchema.methods.updatePersonalPreferences = function(preferences) {
  Object.assign(this.personal, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateGamingPreferences = function(preferences) {
  Object.assign(this.gaming, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateNotificationPreferences = function(preferences) {
  Object.assign(this.notifications, preferences);
  return this.save();
};

userPreferenceSchema.methods.updatePrivacyPreferences = function(preferences) {
  Object.assign(this.privacy, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateAppPreferences = function(preferences) {
  Object.assign(this.app, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateLocationPreferences = function(preferences) {
  Object.assign(this.location, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateSecurityPreferences = function(preferences) {
  Object.assign(this.security, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateContentPreferences = function(preferences) {
  Object.assign(this.content, preferences);
  return this.save();
};

userPreferenceSchema.methods.updateAccessibilityPreferences = function(preferences) {
  Object.assign(this.accessibility, preferences);
  return this.save();
};

userPreferenceSchema.methods.getOnboardingProgress = function() {
  const requiredSteps = [
    'welcome',
    'age_selection',
    'gender_selection',
    'primary_goal',
    'improvement_areas',
    'daily_earning_goal',
    'game_preferences',
    'game_style',
    'location_permission',
    'face_id_setup',
    'disclosure_accepted'
  ];

  const completedSteps = this.onboarding.completedSteps.map(s => s.step);
  const progress = (completedSteps.length / requiredSteps.length) * 100;

  return {
    progress: Math.round(progress),
    completedSteps: completedSteps.length,
    totalSteps: requiredSteps.length,
    currentStep: this.onboarding.currentStep,
    isCompleted: this.onboarding.isCompleted,
  };
};

userPreferenceSchema.methods.getNextOnboardingStep = function() {
  const requiredSteps = [
    'welcome',
    'age_selection',
    'gender_selection',
    'primary_goal',
    'improvement_areas',
    'daily_earning_goal',
    'game_preferences',
    'game_style',
    'location_permission',
    'face_id_setup',
    'disclosure_accepted'
  ];

  const completedSteps = this.onboarding.completedSteps.map(s => s.step);
  const nextStep = requiredSteps.find(step => !completedSteps.includes(step));

  return nextStep || null;
};

// Static methods
userPreferenceSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

userPreferenceSchema.statics.findIncompleteOnboarding = function() {
  return this.find({ 'onboarding.isCompleted': false });
};

userPreferenceSchema.statics.findByAgeRange = function(ageRange) {
  return this.find({ 'personal.ageRange': ageRange });
};

userPreferenceSchema.statics.findByGamePreference = function(gamePreference) {
  return this.find({ 'gaming.gamePreferences': gamePreference });
};

const UserPreference = mongoose.model('UserPreference', userPreferenceSchema);

module.exports = UserPreference; 
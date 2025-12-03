const mongoose = require('mongoose');

const stepDataSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  steps: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  source: {
    type: String,
    enum: ['healthkit', 'manual', 'imported', 'estimated'],
    default: 'healthkit',
    required: true
  },
  syncedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Additional metadata
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'ios'
    },
    appVersion: String,
    deviceId: String,
    osVersion: String
  },
  
  // HealthKit specific data (if applicable)
  healthKitData: {
    isAuthorized: {
      type: Boolean,
      default: false
    },
    lastSyncDate: Date,
    syncError: String,
    dataQuality: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'high'
    }
  },
  
  // Validation and quality checks
  isValidated: {
    type: Boolean,
    default: true
  },
  validationNotes: String,
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
stepDataSchema.index({ userId: 1, date: 1 }, { unique: true });
stepDataSchema.index({ date: 1, steps: -1 });
stepDataSchema.index({ userId: 1, syncedAt: -1 });

// Virtual for date string (YYYY-MM-DD format)
stepDataSchema.virtual('dateString').get(function() {
  return this.date.toISOString().split('T')[0];
});

// Static methods
stepDataSchema.statics.getUserStepsForDate = function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.findOne({
    userId,
    date: { $gte: startOfDay, $lte: endOfDay }
  });
};

stepDataSchema.statics.getUserStepsForWeek = function(userId, weekStart, weekEnd) {
  return this.find({
    userId,
    date: { $gte: weekStart, $lte: weekEnd }
  }).sort({ date: 1 });
};

stepDataSchema.statics.getUserStepsForMonth = function(userId, year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  
  return this.find({
    userId,
    date: { $gte: startOfMonth, $lte: endOfMonth }
  }).sort({ date: 1 });
};

stepDataSchema.statics.getTotalStepsForPeriod = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        date: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: null,
        totalSteps: { $sum: '$steps' },
        daysCount: { $sum: 1 },
        avgSteps: { $avg: '$steps' }
      }
    }
  ]);
};

stepDataSchema.statics.getWeeklyLeaderboard = function(weekStart, weekEnd, limit = 100) {
  return this.aggregate([
    {
      $match: {
        date: { $gte: weekStart, $lte: weekEnd }
      }
    },
    {
      $group: {
        _id: '$userId',
        totalSteps: { $sum: '$steps' },
        daysActive: { $sum: 1 },
        avgStepsPerDay: { $avg: '$steps' },
        lastSync: { $max: '$syncedAt' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        userId: '$_id',
        totalSteps: 1,
        daysActive: 1,
        avgStepsPerDay: 1,
        lastSync: 1,
        firstName: '$user.firstName',
        lastName: '$user.lastName',
        avatar: '$user.profile.avatar',
        xpLevel: '$user.xp.current',
        vipLevel: '$user.vip.level'
      }
    },
    {
      $sort: { totalSteps: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

stepDataSchema.statics.getUserRank = async function(userId, weekStart, weekEnd) {
  const userTotal = await this.getTotalStepsForPeriod(userId, weekStart, weekEnd);
  if (!userTotal || userTotal.length === 0) return null;
  
  const userSteps = userTotal[0].totalSteps;
  
  const rank = await this.countDocuments({
    date: { $gte: weekStart, $lte: weekEnd },
    steps: { $gt: userSteps }
  });
  
  const totalUsers = await this.distinct('userId', {
    date: { $gte: weekStart, $lte: weekEnd }
  });
  
  return {
    rank: rank + 1,
    totalUsers: totalUsers.length,
    percentile: totalUsers.length > 0 ? Math.round(((totalUsers.length - rank) / totalUsers.length) * 100) : 0,
    totalSteps: userSteps
  };
};

stepDataSchema.statics.bulkUpsertSteps = function(stepDataArray) {
  const bulkOps = stepDataArray.map(data => ({
    updateOne: {
      filter: { userId: data.userId, date: data.date },
      update: {
        $set: {
          steps: data.steps,
          source: data.source || 'healthkit',
          syncedAt: new Date(),
          deviceInfo: data.deviceInfo || {},
          healthKitData: data.healthKitData || {},
          isValidated: data.isValidated !== false,
          validationNotes: data.validationNotes,
          metadata: data.metadata || {}
        }
      },
      upsert: true
    }
  }));
  
  return this.bulkWrite(bulkOps);
};

// Instance methods
stepDataSchema.methods.validateSteps = function() {
  // Basic validation rules
  if (this.steps < 0) {
    this.isValidated = false;
    this.validationNotes = 'Steps cannot be negative';
    return false;
  }
  
  if (this.steps > 100000) {
    this.isValidated = false;
    this.validationNotes = 'Steps count seems unusually high';
    return false;
  }
  
  // Check if date is not in the future
  if (this.date > new Date()) {
    this.isValidated = false;
    this.validationNotes = 'Date cannot be in the future';
    return false;
  }
  
  this.isValidated = true;
  this.validationNotes = 'Validated successfully';
  return true;
};

stepDataSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    userId: this.userId,
    date: this.date,
    dateString: this.dateString,
    steps: this.steps,
    source: this.source,
    syncedAt: this.syncedAt,
    deviceInfo: this.deviceInfo,
    healthKitData: this.healthKitData,
    isValidated: this.isValidated,
    validationNotes: this.validationNotes,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Pre-save middleware
stepDataSchema.pre('save', function(next) {
  // Normalize date to start of day
  if (this.date) {
    this.date.setHours(0, 0, 0, 0);
  }
  
  // Validate steps
  this.validateSteps();
  
  next();
});

const StepData = mongoose.model('StepData', stepDataSchema);

module.exports = StepData;



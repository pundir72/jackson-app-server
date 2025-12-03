/**
 * Creative Model
 * Marketing assets (banners, images) for app placements
 * @module models/Creative
 */

const mongoose = require('mongoose');

const creativeSchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s]+$/.test(v);
      },
      message: 'Title must be alphanumeric only'
    },
    minlength: [3, 'Title must be at least 3 characters'],
    maxlength: [50, 'Title must be less than 50 characters']
  },

  // Image/Asset
  imageUrl: {
    type: String,
    required: true
  },
  
  originalFileName: {
    type: String
  },

  fileSize: {
    type: Number // in bytes
  },

  mimeType: {
    type: String
  },

  // Placement
  placement: {
    type: String,
    required: true
  },

  // Campaign Attribution
  campaignPID: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9_]+$/.test(v);
      },
      message: 'PID must contain only alphanumeric characters and underscores'
    }
  },

  // Target Segments (comma-separated)
  segment: {
    type: String,
    required: true,
    default: 'All Users'
  },

  // Status
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true
  },

  // Analytics
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    ctr: {
      type: Number,
      default: 0 // Calculated percentage
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },

  // Audit Log
  auditLog: [{
    action: {
      type: String,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    adminEmail: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    changes: mongoose.Schema.Types.Mixed
  }],

  // Soft Delete
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Metadata
  metadata: {
    dimensions: {
      width: Number,
      height: Number
    },
    aspectRatio: String,
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    startDate: Date,
    endDate: Date,
    notes: String
  },

  // Creator info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }

}, {
  timestamps: true
});

// Indexes for performance
creativeSchema.index({ placement: 1, status: 1 });
creativeSchema.index({ campaignPID: 1 });
creativeSchema.index({ status: 1, isDeleted: 1 });
creativeSchema.index({ createdAt: -1 });
creativeSchema.index({ 'analytics.ctr': -1 });

// Pre-save hook to calculate CTR
creativeSchema.pre('save', function(next) {
  if (this.analytics.views > 0) {
    this.analytics.ctr = (this.analytics.clicks / this.analytics.views) * 100;
  } else {
    this.analytics.ctr = 0;
  }
  this.analytics.lastUpdated = new Date();
  next();
});

// Methods

/**
 * Increment view count
 */
creativeSchema.methods.recordView = async function() {
  this.analytics.views += 1;
  return await this.save();
};

/**
 * Increment click count
 */
creativeSchema.methods.recordClick = async function() {
  this.analytics.clicks += 1;
  return await this.save();
};

/**
 * Toggle status
 */
creativeSchema.methods.toggleStatus = async function(adminId) {
  this.status = this.status === 'Active' ? 'Inactive' : 'Active';
  this.updatedBy = adminId;
  
  this.auditLog.push({
    action: 'TOGGLE_STATUS',
    adminId: adminId,
    timestamp: new Date(),
    changes: { status: this.status }
  });
  
  return await this.save();
};

/**
 * Soft delete
 */
creativeSchema.methods.softDelete = async function(adminId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = adminId;
  this.status = 'Inactive';
  
  this.auditLog.push({
    action: 'DELETE',
    adminId: adminId,
    timestamp: new Date()
  });
  
  return await this.save();
};

/**
 * Add audit log entry
 */
creativeSchema.methods.addAuditLog = async function(action, adminId, changes = {}) {
  this.auditLog.push({
    action,
    adminId,
    timestamp: new Date(),
    changes
  });
  
  return await this.save();
};

// Statics

/**
 * Get active creatives by placement
 */
creativeSchema.statics.getByPlacement = async function(placement) {
  return await this.find({
    placement,
    status: 'Active',
    isDeleted: false
  }).sort({ 'metadata.priority': -1, createdAt: -1 });
};

/**
 * Get creatives by campaign PID
 */
creativeSchema.statics.getByCampaignPID = async function(campaignPID) {
  return await this.find({
    campaignPID,
    isDeleted: false
  }).sort({ createdAt: -1 });
};

/**
 * Get creatives by segment
 */
creativeSchema.statics.getBySegment = async function(segment) {
  return await this.find({
    segment: new RegExp(segment, 'i'),
    status: 'Active',
    isDeleted: false
  }).sort({ 'metadata.priority': -1 });
};

/**
 * Get top performing creatives
 */
creativeSchema.statics.getTopPerformers = async function(limit = 10) {
  return await this.find({
    status: 'Active',
    isDeleted: false,
    'analytics.views': { $gt: 0 }
  })
  .sort({ 'analytics.ctr': -1 })
  .limit(limit);
};

/**
 * Get performance statistics
 */
creativeSchema.statics.getPerformanceStats = async function(filters = {}) {
  const matchQuery = {
    isDeleted: false
  };
  
  if (filters.placement) matchQuery.placement = filters.placement;
  if (filters.campaignPID) matchQuery.campaignPID = filters.campaignPID;
  if (filters.status) matchQuery.status = filters.status;
  if (filters.startDate || filters.endDate) {
    matchQuery.createdAt = {};
    if (filters.startDate) matchQuery.createdAt.$gte = new Date(filters.startDate);
    if (filters.endDate) matchQuery.createdAt.$lte = new Date(filters.endDate);
  }
  
  return await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCreatives: { $sum: 1 },
        activeCreatives: {
          $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
        },
        totalViews: { $sum: '$analytics.views' },
        totalClicks: { $sum: '$analytics.clicks' },
        avgCTR: { $avg: '$analytics.ctr' }
      }
    }
  ]);
};

const Creative = mongoose.model('Creative', creativeSchema);

module.exports = Creative;


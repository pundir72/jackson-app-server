const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Request status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Payment details
  payment: {
    fundingSourceId: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      required: true,
      default: 'USD'
    },
    subtotal: Number,
    total: Number,
    fees: Number,
    channel: String
  },
  
  // Reward details
  reward: {
    value: {
      denomination: {
        type: Number,
        required: true
      },
      currency_code: {
        type: String,
        required: true
      }
    },
    delivery: {
      method: {
        type: String,
        default: 'LINK'
      }
    },
    recipient: {
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true
      },
      phone: String
    },
    products: [{
      type: String,
      required: true
    }],
    custom_fields: [{
      id: String,
      value: String
    }]
  },
  
  // Coins deducted (held, not yet processed)
  coinsDeducted: {
    type: Number,
    required: true
  },
  
  // Admin actions (optional, only set when admin approves/rejects)
  adminAction: {
    action: {
      type: String,
      enum: ['approved', 'rejected'],
      required: false
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },
    adminName: {
      type: String,
      required: false
    },
    actionDate: {
      type: Date,
      required: false
    },
    rejectionReason: {
      type: String,
      required: false
    }
  },
  
  // Tremendous order (created after approval)
  tremendousOrderId: {
    type: String,
    default: null,
    index: true
  },
  
  // Metadata
  metadata: {
    source: {
      type: String,
      default: 'app'
    },
    campaignId: String,
    invoiceId: String,
    externalId: String,
    userAgent: String,
    ipAddress: String
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: Date,
  rejectedAt: Date,
  processedAt: Date
});

// Update the updatedAt field before saving
payoutRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
payoutRequestSchema.index({ userId: 1, status: 1 });
payoutRequestSchema.index({ status: 1, createdAt: -1 });
payoutRequestSchema.index({ createdAt: -1 });

// Static methods
payoutRequestSchema.statics.findPending = function() {
  return this.find({ status: 'pending' })
    .populate('userId', 'firstName lastName email profile')
    .sort({ createdAt: -1 });
};

payoutRequestSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  if (options.status) {
    query.status = options.status;
  }
  return this.find(query).sort({ createdAt: -1 });
};

payoutRequestSchema.statics.findByTremendousOrderId = function(tremendousOrderId) {
  return this.findOne({ tremendousOrderId });
};

// Instance methods
payoutRequestSchema.methods.approve = function(adminId, adminName) {
  this.status = 'approved';
  this.adminAction = {
    action: 'approved',
    adminId,
    adminName,
    actionDate: new Date()
  };
  this.approvedAt = new Date();
  return this.save();
};

payoutRequestSchema.methods.reject = function(adminId, adminName, reason) {
  if (!reason || reason.trim() === '') {
    throw new Error('Rejection reason is required');
  }
  this.status = 'rejected';
  this.adminAction = {
    action: 'rejected',
    adminId,
    adminName,
    actionDate: new Date(),
    rejectionReason: reason
  };
  this.rejectedAt = new Date();
  return this.save();
};

payoutRequestSchema.methods.markProcessing = function() {
  this.status = 'processing';
  this.processedAt = new Date();
  return this.save();
};

payoutRequestSchema.methods.markCompleted = function(tremendousOrderId) {
  this.status = 'completed';
  this.tremendousOrderId = tremendousOrderId;
  return this.save();
};

payoutRequestSchema.methods.markFailed = function() {
  this.status = 'failed';
  return this.save();
};

const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);

module.exports = PayoutRequest;


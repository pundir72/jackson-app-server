const mongoose = require('mongoose');

const tremendousOrderSchema = new mongoose.Schema({
  // Tremendous order details
  tremendousOrderId: {
    type: String,
    required: true,
  },
  externalId: {
    type: String,
    required: true,
    index: true
  },
  
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Order details
  status: {
    type: String,
    default: 'PENDING',
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
    subtotal: {
      type: Number
    },
    total: {
      type: Number
    },
    fees: {
      type: Number
    },
    channel: {
      type: String
    },
    refund: {
      total: {
        type: Number
      }
    }
  },
  
  // Reward details
  reward: {
    id: {
      type: String
    },
    order_id: {
      type: String
    },
    created_at: {
      type: Date
    },
    campaign_id: {
      type: String
    },
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
      },
      status: {
        type: String,
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
      phone: {
        type: String
      }
    },
    products: [{
      type: String,
      required: true
    }],
    custom_fields: [{
      id: {
        type: String,
        required: true
      },
      value: {
        type: String,
        required: true
      }
    }]
  },
  
  // Tremendous response data
  tremendousData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Tracking
  trackingUrl: {
    type: String
  },
  deliveredAt: {
    type: Date
  },
  claimedAt: {
    type: Date
  },
  expiredAt: {
    type: Date
  },
  
  // Metadata
  metadata: {
    source: {
      type: String,
      default: 'app'
    },
    campaign: String,
    referrer: String,
    userAgent: String,
    ipAddress: String,
    campaignId: String,
    invoiceId: String,
    rewardId: String,
    orderId: String,
    createdAt: Date
  },
  
  // Timestamps
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
tremendousOrderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
tremendousOrderSchema.index({ userId: 1, status: 1 });
tremendousOrderSchema.index({ tremendousOrderId: 1 });
tremendousOrderSchema.index({ externalId: 1 });
tremendousOrderSchema.index({ createdAt: -1 });

// Static methods
tremendousOrderSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  if (options.status) {
    query.status = options.status;
  }
  return this.find(query).sort({ createdAt: -1 });
};

tremendousOrderSchema.statics.findByTremendousOrderId = function(tremendousOrderId) {
  return this.findOne({ tremendousOrderId });
};

tremendousOrderSchema.statics.findByExternalId = function(externalId) {
  return this.findOne({ externalId });
};

// Instance methods
tremendousOrderSchema.methods.updateStatus = function(status, additionalData = {}) {
  this.status = status;
  this.updatedAt = new Date();
  
  if (status === 'DELIVERED') {
    this.deliveredAt = new Date();
  } else if (status === 'CLAIMED') {
    this.claimedAt = new Date();
  } else if (status === 'EXPIRED') {
    this.expiredAt = new Date();
  }
  
  // Update additional data
  Object.assign(this.tremendousData, additionalData);
  
  return this.save();
};

const TremendousOrder = mongoose.model('TremendousOrder', tremendousOrderSchema);

module.exports = TremendousOrder;


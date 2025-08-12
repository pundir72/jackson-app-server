const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  storeName: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
  },
  purchaseDate: {
    type: Date,
    required: true,
  },
  items: [{
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    category: {
      type: String,
      enum: ['groceries', 'electronics', 'clothing', 'home', 'entertainment', 'food', 'other'],
    },
  }],
  cashbackAmount: {
    type: Number,
    default: 0.00,
    min: 0,
  },
  pointsEarned: {
    type: Number,
    default: 0,
    min: 0,
  },
  cashbackRate: {
    type: Number,
    default: 0.05, // 5% default cashback rate
    min: 0,
    max: 1,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'processing'],
    default: 'pending',
  },
  imageUrl: {
    type: String,
    required: true,
  },
  ocrData: {
    type: mongoose.Schema.Types.Mixed,
    comment: 'OCR processed data from receipt image',
  },
  location: {
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
    address: {
      type: String,
    },
  },
  verificationData: {
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: {
      type: Date,
    },
    verificationMethod: {
      type: String,
      enum: ['manual', 'ai', 'admin'],
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      comment: 'AI confidence score for OCR',
    },
  },
  rejectionReason: {
    type: String,
    maxlength: 500,
  },
  tags: {
    type: [String],
    default: [],
  },
  isVipEligible: {
    type: Boolean,
    default: false,
  },
  processingTime: {
    type: Number,
    comment: 'Processing time in milliseconds',
  },
}, {
  timestamps: true,
});

// Indexes
receiptSchema.index({ userId: 1 });
receiptSchema.index({ status: 1 });
receiptSchema.index({ storeName: 1 });
receiptSchema.index({ purchaseDate: -1 });
receiptSchema.index({ createdAt: -1 });
receiptSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

// Instance methods
receiptSchema.methods.calculateCashback = function() {
  const baseCashback = this.amount * this.cashbackRate;
  const vipMultiplier = this.isVipEligible ? 1.5 : 1;
  return parseFloat((baseCashback * vipMultiplier).toFixed(2));
};

receiptSchema.methods.calculatePoints = function() {
  const basePoints = Math.floor(this.amount);
  const vipMultiplier = this.isVipEligible ? 1.5 : 1;
  return Math.floor(basePoints * vipMultiplier);
};

receiptSchema.methods.approve = function(verifiedBy, method = 'manual') {
  this.status = 'approved';
  this.verificationData = {
    verifiedBy,
    verifiedAt: new Date(),
    verificationMethod: method,
  };
  this.cashbackAmount = this.calculateCashback();
  this.pointsEarned = this.calculatePoints();
  return this.save();
};

receiptSchema.methods.reject = function(reason) {
  this.status = 'rejected';
  this.rejectionReason = reason;
  return this.save();
};

receiptSchema.methods.processOCR = function(ocrData, confidence) {
  this.ocrData = ocrData;
  this.verificationData.confidence = confidence;
  this.processingTime = Date.now() - this.createdAt.getTime();
  
  // Auto-approve if confidence is high
  if (confidence > 0.8) {
    this.status = 'approved';
    this.cashbackAmount = this.calculateCashback();
    this.pointsEarned = this.calculatePoints();
  }
  
  return this.save();
};

receiptSchema.methods.isEligibleForVip = function() {
  return this.amount >= 50; // Minimum $50 for VIP eligibility
};

// Static methods
receiptSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.storeName) {
    query.storeName = new RegExp(options.storeName, 'i');
  }
  
  if (options.startDate && options.endDate) {
    query.purchaseDate = {
      $gte: new Date(options.startDate),
      $lte: new Date(options.endDate),
    };
  }
  
  return this.find(query).sort({ createdAt: -1 });
};

receiptSchema.statics.findPending = function() {
  return this.find({ status: 'pending' }).sort({ createdAt: 1 });
};

receiptSchema.statics.findByStore = function(storeName) {
  return this.find({ 
    storeName: new RegExp(storeName, 'i'),
    status: 'approved'
  }).sort({ purchaseDate: -1 });
};

receiptSchema.statics.getTotalCashback = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$cashbackAmount' } } }
  ]);
};

receiptSchema.statics.getTotalPoints = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$pointsEarned' } } }
  ]);
};

const Receipt = mongoose.model('Receipt', receiptSchema);

module.exports = Receipt; 
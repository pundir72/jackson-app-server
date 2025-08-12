const mongoose = require('mongoose');

const vipMembershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  plan: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly'],
    required: true,
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending', 'suspended'],
    default: 'pending',
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true,
  },
  autoRenew: {
    type: Boolean,
    default: true,
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay'],
    required: true,
  },
  paymentDetails: {
    lastFourDigits: {
      type: String,
      maxlength: 4,
    },
    cardType: {
      type: String,
      enum: ['visa', 'mastercard', 'amex', 'discover'],
    },
    expiryMonth: {
      type: String,
      maxlength: 2,
    },
    expiryYear: {
      type: String,
      maxlength: 4,
    },
  },
  billingAddress: {
    street: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    zipCode: {
      type: String,
    },
    country: {
      type: String,
    },
  },
  pricing: {
    originalPrice: {
      type: Number,
      required: true,
    },
    discountedPrice: {
      type: Number,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
    },
  },
  benefits: {
    cashbackMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
    },
    pointsMultiplier: {
      type: Number,
      default: 1.5,
      min: 1,
    },
    exclusiveChallenges: {
      type: Boolean,
      default: true,
    },
    prioritySupport: {
      type: Boolean,
      default: true,
    },
    earlyAccess: {
      type: Boolean,
      default: true,
    },
    vipGames: {
      type: Boolean,
      default: true,
    },
    noAds: {
      type: Boolean,
      default: true,
    },
  },
  usage: {
    totalCashbackEarned: {
      type: Number,
      default: 0.00,
      min: 0,
    },
    totalPointsEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    challengesCompleted: {
      type: Number,
      default: 0,
      min: 0,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    receiptsScanned: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  cancellation: {
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: {
      type: String,
      maxlength: 500,
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    refundProcessed: {
      type: Boolean,
      default: false,
    },
  },
  notifications: {
    renewalReminder: {
      type: Boolean,
      default: true,
    },
    paymentFailed: {
      type: Boolean,
      default: true,
    },
    benefitsUpdates: {
      type: Boolean,
      default: true,
    },
    exclusiveOffers: {
      type: Boolean,
      default: true,
    },
  },
  lastPaymentDate: {
    type: Date,
  },
  nextPaymentDate: {
    type: Date,
  },
  paymentHistory: [{
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    transactionId: {
      type: String,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'pending', 'refunded'],
      required: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

// Indexes
vipMembershipSchema.index({ userId: 1 });
vipMembershipSchema.index({ status: 1 });
vipMembershipSchema.index({ endDate: 1 });
vipMembershipSchema.index({ autoRenew: 1 });
vipMembershipSchema.index({ createdAt: -1 });

// Instance methods
vipMembershipSchema.methods.isActive = function() {
  const now = new Date();
  return this.status === 'active' && now >= this.startDate && now <= this.endDate;
};

vipMembershipSchema.methods.isExpired = function() {
  const now = new Date();
  return now > this.endDate;
};

vipMembershipSchema.methods.daysUntilExpiry = function() {
  const now = new Date();
  const diffTime = this.endDate - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

vipMembershipSchema.methods.renew = function(newEndDate) {
  this.endDate = newEndDate;
  this.status = 'active';
  return this.save();
};

vipMembershipSchema.methods.cancel = function(reason, cancelledBy) {
  this.status = 'cancelled';
  this.autoRenew = false;
  this.cancellation = {
    cancelledAt: new Date(),
    cancelledBy,
    reason,
  };
  return this.save();
};

vipMembershipSchema.methods.suspend = function() {
  this.status = 'suspended';
  return this.save();
};

vipMembershipSchema.methods.activate = function() {
  this.status = 'active';
  return this.save();
};

vipMembershipSchema.methods.addPayment = function(paymentData) {
  this.paymentHistory.push(paymentData);
  this.lastPaymentDate = new Date();
  
  // Calculate next payment date based on plan
  const nextPayment = new Date(this.lastPaymentDate);
  switch (this.plan) {
    case 'monthly':
      nextPayment.setMonth(nextPayment.getMonth() + 1);
      break;
    case 'quarterly':
      nextPayment.setMonth(nextPayment.getMonth() + 3);
      break;
    case 'yearly':
      nextPayment.setFullYear(nextPayment.getFullYear() + 1);
      break;
  }
  this.nextPaymentDate = nextPayment;
  
  return this.save();
};

vipMembershipSchema.methods.updateUsage = function(cashback = 0, points = 0, challenges = 0, games = 0, receipts = 0) {
  this.usage.totalCashbackEarned += parseFloat(cashback);
  this.usage.totalPointsEarned += points;
  this.usage.challengesCompleted += challenges;
  this.usage.gamesPlayed += games;
  this.usage.receiptsScanned += receipts;
  return this.save();
};

vipMembershipSchema.methods.getSavings = function() {
  const originalCost = this.pricing.originalPrice;
  const actualCost = this.pricing.discountedPrice || this.pricing.originalPrice;
  return originalCost - actualCost;
};

vipMembershipSchema.methods.getROI = function() {
  const totalCost = this.pricing.discountedPrice || this.pricing.originalPrice;
  const totalEarnings = this.usage.totalCashbackEarned;
  return totalEarnings > 0 ? ((totalEarnings - totalCost) / totalCost) * 100 : 0;
};

// Static methods
vipMembershipSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    status: 'active',
    startDate: { $lte: now },
    endDate: { $gte: now },
  });
};

vipMembershipSchema.statics.findExpiringSoon = function(days = 7) {
  const now = new Date();
  const expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  return this.find({
    status: 'active',
    endDate: { $gte: now, $lte: expiryDate },
  });
};

vipMembershipSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

vipMembershipSchema.statics.getStats = function() {
  return this.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: null,
        totalMembers: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.discountedPrice' },
        averageUsage: {
          $avg: {
            $add: [
              '$usage.totalCashbackEarned',
              '$usage.totalPointsEarned',
            ],
          },
        },
      },
    },
  ]);
};

vipMembershipSchema.statics.getTopEarners = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ 'usage.totalCashbackEarned': -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName email');
};

const VIPMembership = mongoose.model('VIPMembership', vipMembershipSchema);

module.exports = VIPMembership; 
const mongoose = require('mongoose');

const vipSubscriptionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  tier: { 
    type: String, 
    required: true,
    // enum: ['bronze', 'gold', 'platinum']
  },
  plan: { 
    type: String, 
    required: true,
    enum: ['weekly', 'monthly', 'yearly']
  },
  status: { 
    type: String, 
    required: true,
    enum: ['active', 'cancelled', 'expired', 'pending', 'failed'],
    default: 'pending'
  },
  paymentIntentId: { 
    type: String
  },
  paymentClientSecret: {
    type: String
  },
  stripeSubscriptionId: { 
    type: String 
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  currency: { 
    type: String, 
    default: 'USD' 
  },
  startDate: { 
    type: Date, 
    required: true 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  nextBillingDate: { 
    type: Date 
  },
  autoRenew: { 
    type: Boolean, 
    default: true 
  },
  cancellationDate: { 
    type: Date 
  },
  cancellationReason: { 
    type: String 
  },
  trialEndDate: { 
    type: Date 
  },
  isTrial: { 
    type: Boolean, 
    default: false 
  },
  metadata: {
    region: { type: String, default: 'US' },
    source: { type: String, default: 'app' }, // app, web, admin
    campaign: String,
    referrer: String,
    transactionId: String,
    originalTransactionId: String,
    productId: String,
    appStoreEnvironment: String,
    verificationMethod: String, // 'receipt' | 'jws'
    sessionId: String,
    // Set on the OLD subscription when a verified purchase replaces it
    // (tier/plan change, e.g. Gold -> Platinum)
    replacedByTransactionId: String,
    replacedAt: Date,
    replacementReason: String
  },
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
vipSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for efficient queries
vipSubscriptionSchema.index({ userId: 1, status: 1 });
vipSubscriptionSchema.index({ paymentIntentId: 1 });
vipSubscriptionSchema.index({ stripeSubscriptionId: 1 });
vipSubscriptionSchema.index({ stripeCustomerId: 1 }); // Added index for stripeCustomerId
vipSubscriptionSchema.index({ endDate: 1, status: 1 });
vipSubscriptionSchema.index({ createdAt: -1 });
vipSubscriptionSchema.index({ 'metadata.transactionId': 1 }, { unique: true, sparse: true });

// Static method to get active subscription for user
vipSubscriptionSchema.statics.getActiveSubscription = function(userId) {
  return this.findOne({ 
    userId, 
    status: 'active',
    endDate: { $gt: new Date() }
  }).populate('userId', 'firstName lastName email');
};

// Static method to get subscription history for user
vipSubscriptionSchema.statics.getUserSubscriptions = function(userId, limit = 10) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'firstName lastName email');
};

// Static method to get expiring subscriptions
vipSubscriptionSchema.statics.getExpiringSubscriptions = function(days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.find({
    status: 'active',
    endDate: { $lte: futureDate, $gt: new Date() },
    autoRenew: true
  }).populate('userId', 'firstName lastName email');
};

// Instance method to check if subscription is active
vipSubscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && this.endDate > new Date();
};

// Instance method to check if subscription is expiring soon
vipSubscriptionSchema.methods.isExpiringSoon = function(days = 7) {
  if (!this.isActive()) return false;
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return this.endDate <= futureDate;
};

// Instance method to cancel subscription
vipSubscriptionSchema.methods.cancel = function(reason = 'User requested') {
  this.status = 'cancelled';
  this.cancellationDate = new Date();
  this.cancellationReason = reason;
  this.autoRenew = false;
  return this.save();
};

// Instance method to extend subscription
vipSubscriptionSchema.methods.extend = function(months = 1) {
  const currentEndDate = this.endDate;
  const newEndDate = new Date(currentEndDate);
  newEndDate.setMonth(newEndDate.getMonth() + months);
  
  this.endDate = newEndDate;
  this.nextBillingDate = newEndDate;
  return this.save();
};

// Instance method to get subscription summary
vipSubscriptionSchema.methods.getSummary = function() {
  return {
    id: this._id,
    tier: this.tier,
    plan: this.plan,
    status: this.status,
    amount: this.amount,
    currency: this.currency,
    startDate: this.startDate,
    endDate: this.endDate,
    isActive: this.isActive(),
    isExpiringSoon: this.isExpiringSoon(),
    autoRenew: this.autoRenew,
    isTrial: this.isTrial
  };
};

module.exports = mongoose.model('VIPSubscription', vipSubscriptionSchema);

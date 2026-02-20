const mongoose = require('mongoose');

/**
 * Google Play Purchase Model
 * Stores Google Play in-app purchase and subscription data
 */
const googlePlayPurchaseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Purchase identification
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  packageName: {
    type: String,
    required: true
  },
  
  productId: {
    type: String,
    required: true,
    index: true
  },
  
  purchaseToken: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Purchase type
  purchaseType: {
    type: String,
    enum: ['subscription', 'one_time'],
    required: true
  },
  
  // Purchase details
  purchaseTime: {
    type: Date,
    required: true
  },
  
  purchaseState: {
    type: Number,
    enum: [0, 1, 2], // 0: Purchased, 1: Canceled, 2: Pending
    default: 0
  },
  
  // Subscription specific fields
  subscriptionId: {
    type: String,
    index: true
  },
  
  expiryTime: {
    type: Date
  },
  
  autoRenewing: {
    type: Boolean,
    default: false
  },
  
  // Verification status
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed', 'refunded', 'expired'],
    default: 'pending',
    index: true
  },
  
  verifiedAt: {
    type: Date
  },
  
  // Google Play API response
  googlePlayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Acknowledgement status
  acknowledged: {
    type: Boolean,
    default: false
  },
  
  acknowledgedAt: {
    type: Date
  },
  
  // Linked VIP subscription (if applicable)
  vipSubscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VIPSubscription'
  },
  
  // Payment details
  amount: {
    type: Number,
    required: true
  },
  
  currency: {
    type: String,
    default: 'USD'
  },
  
  // Refund/cancellation
  refundedAt: {
    type: Date
  },
  
  refundReason: {
    type: String
  },
  
  canceledAt: {
    type: Date
  },
  
  cancelReason: {
    type: String
  },
  
  // Metadata
  metadata: {
    deviceInfo: String,
    appVersion: String,
    platform: String,
    region: String
  },
  
  // Webhook notifications
  webhookNotifications: [{
    notificationType: Number,
    receivedAt: Date,
    data: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true
});

// Indexes for efficient queries
googlePlayPurchaseSchema.index({ userId: 1, verificationStatus: 1 });
googlePlayPurchaseSchema.index({ userId: 1, purchaseType: 1 });
googlePlayPurchaseSchema.index({ expiryTime: 1, verificationStatus: 1 });
googlePlayPurchaseSchema.index({ createdAt: -1 });

// Static method to get active subscription for user
googlePlayPurchaseSchema.statics.getActiveSubscription = function(userId, productId) {
  return this.findOne({
    userId,
    productId,
    purchaseType: 'subscription',
    verificationStatus: 'verified',
    expiryTime: { $gt: new Date() },
    purchaseState: 0
  });
};

// Static method to get user purchase history
googlePlayPurchaseSchema.statics.getUserPurchases = function(userId, limit = 20) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('vipSubscriptionId');
};

// Static method to get expiring subscriptions
googlePlayPurchaseSchema.statics.getExpiringSubscriptions = function(hours = 24) {
  const futureDate = new Date();
  futureDate.setHours(futureDate.getHours() + hours);
  
  return this.find({
    purchaseType: 'subscription',
    verificationStatus: 'verified',
    expiryTime: { $lte: futureDate, $gt: new Date() },
    autoRenewing: true
  }).populate('userId', 'firstName lastName email mobile');
};

// Instance method to check if subscription is active
googlePlayPurchaseSchema.methods.isActive = function() {
  return (
    this.purchaseType === 'subscription' &&
    this.verificationStatus === 'verified' &&
    this.purchaseState === 0 &&
    this.expiryTime > new Date()
  );
};

// Instance method to mark as verified
googlePlayPurchaseSchema.methods.markAsVerified = function(googlePlayResponse) {
  this.verificationStatus = 'verified';
  this.verifiedAt = new Date();
  this.googlePlayResponse = googlePlayResponse;
  return this.save();
};

// Instance method to mark as acknowledged
googlePlayPurchaseSchema.methods.acknowledge = function() {
  this.acknowledged = true;
  this.acknowledgedAt = new Date();
  return this.save();
};

// Instance method to add webhook notification
googlePlayPurchaseSchema.methods.addWebhookNotification = function(notificationType, data) {
  this.webhookNotifications.push({
    notificationType,
    receivedAt: new Date(),
    data
  });
  return this.save();
};

module.exports = mongoose.model('GooglePlayPurchase', googlePlayPurchaseSchema);

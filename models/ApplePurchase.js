const mongoose = require('mongoose')

const ApplePurchaseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      description: 'Unique transaction ID from Apple',
    },
    originalTransactionId: {
      type: String,
      required: true,
      index: true,
      description: 'Original transaction ID for subscription renewals',
    },
    productId: {
      type: String,
      required: true,
      index: true,
      description: 'App Store product ID (e.g., bronze_monthly)',
    },
    subscriptionId: {
      type: String,
      required: true,
      description: 'Backend subscription ID (e.g., bronze_monthly)',
    },
    purchaseDate: {
      type: Date,
      required: true,
      description: 'Date of purchase from Apple',
    },
    expiresDate: {
      type: Date,
      required: true,
      index: true,
      description: 'Subscription expiration date',
    },
    verificationStatus: {
      type: String,
      enum: [
        'pending',
        'verified',
        'failed',
        'expired',
        'refunded',
        'cancelled',
      ],
      default: 'pending',
      index: true,
      description: 'Verification status of the purchase',
    },
    verifiedAt: {
      type: Date,
      description: 'Timestamp when purchase was verified',
    },
    appleResponse: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Raw response from Apple receipt verification',
    },
    isTrialPeriod: {
      type: Boolean,
      default: false,
      description: 'Whether this is a trial period subscription',
    },
    autoRenewStatus: {
      type: Boolean,
      default: true,
      description: 'Whether auto-renewal is enabled',
    },
    canceledAt: {
      type: Date,
      description: 'Timestamp when subscription was cancelled',
    },
    refundedAt: {
      type: Date,
      description: 'Timestamp when purchase was refunded',
    },
    webhookNotifications: [
      {
        type: {
          type: String,
          description: 'Notification type from Apple',
        },
        receivedAt: {
          type: Date,
          default: Date.now,
        },
        data: {
          type: mongoose.Schema.Types.Mixed,
          description: 'Notification payload',
        },
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      description: 'Additional metadata (region, device info, etc.)',
    },
  },
  {
    timestamps: true,
    description: 'Apple In-App Purchase records',
  },
)

ApplePurchaseSchema.methods.isActive = function () {
  return (
    this.verificationStatus === 'verified' &&
    this.expiresDate > new Date() &&
    !this.canceledAt &&
    !this.refundedAt
  )
}

ApplePurchaseSchema.methods.addWebhookNotification = function (
  notificationType,
  data,
) {
  this.webhookNotifications.push({
    type: notificationType,
    data,
  })
  return this.save()
}

ApplePurchaseSchema.methods.markAsVerified = function (appleResponse) {
  this.verificationStatus = 'verified'
  this.verifiedAt = new Date()
  this.appleResponse = appleResponse
  return this.save()
}

ApplePurchaseSchema.methods.cancel = function () {
  this.verificationStatus = 'cancelled'
  this.canceledAt = new Date()
  this.autoRenewStatus = false
  return this.save()
}

ApplePurchaseSchema.methods.refund = function () {
  this.verificationStatus = 'refunded'
  this.refundedAt = new Date()
  return this.save()
}

ApplePurchaseSchema.statics.getActiveSubscription = async function (userId) {
  return this.findOne({
    userId,
    verificationStatus: 'verified',
    expiresDate: { $gt: new Date() },
    canceledAt: null,
    refundedAt: null,
  }).sort({ expiresDate: -1 })
}

ApplePurchaseSchema.statics.getUserPurchases = async function (
  userId,
  limit = 20,
) {
  return this.find({ userId }).sort({ createdAt: -1 }).limit(limit)
}

ApplePurchaseSchema.statics.hasVerifiedPurchase = async function (userId) {
  const count = await this.countDocuments({
    userId,
    verificationStatus: 'verified',
  })
  return count > 0
}

ApplePurchaseSchema.index({ userId: 1, verificationStatus: 1 })
ApplePurchaseSchema.index({ userId: 1, expiresDate: -1 })
ApplePurchaseSchema.index({ originalTransactionId: 1 })
ApplePurchaseSchema.index({ createdAt: -1 })

module.exports = mongoose.model('ApplePurchase', ApplePurchaseSchema)

/**
 * Adjust Callback Model
 * Stores raw data received from Adjust callbacks/webhooks
 * Documentation: https://help.adjust.com/en/article/raw-data-exports
 */

const mongoose = require('mongoose');

const adjustCallbackSchema = new mongoose.Schema({
  // Activity Type
  activityKind: {
    type: String,
    required: true,
    enum: [
      'impression',
      'click',
      'install',
      'session',
      'event',
      'reattribution',
      'att_status_update',
      'skadnetwork_install',
      'skadnetwork_event',
      'skadnetwork_qualifier',
      'skadnetwork_direct_install',
      'skadnetwork_cv_update',
      'updated_attribution',
      'ad_spend',
      'erased_user',
      'san_click',
      'san_impression',
      'ad_revenue',
      'subscription',
      'uninstall',
      'reinstall',
      'reattribution_reinstall',
      'rejected_install',
      'rejected_reattribution'
    ],
    index: true
  },

  // Adjust Identifiers
  appToken: {
    type: String,
    required: true,
    index: true
  },
  trackerToken: String,
  trackerName: String,
  network: String,
  campaign: String,
  adgroup: String,
  creative: String,
  clickLabel: String,

  // Device Identifiers
  idfa: String,
  idfv: String,
  gpsAdid: String,
  fireAdid: String,
  oaid: String,
  webUuid: String,
  androidId: String,

  // User Information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  adjustUserId: String,

  // Event Information (for in-app events)
  eventToken: String,
  eventName: String,
  revenue: Number,
  currency: String,
  callbackParams: mongoose.Schema.Types.Mixed,
  partnerParams: mongoose.Schema.Types.Mixed,

  // Timestamps
  clickTime: Date,
  installTime: Date,
  installedAt: Date,
  eventTime: Date,
  impressionTime: Date,
  uninstallTime: Date,
  createdAt: Date,
  createdAtAdjust: Date,

  // Attribution Information
  attributionType: String,
  attributionWindow: String,
  isOrganic: Boolean,
  isReattribution: Boolean,
  matchType: String,

  // Location Information
  country: String,
  region: String,
  city: String,
  ipAddress: String,
  userAgent: String,

  // Platform Information
  platform: String,
  osName: String,
  osVersion: String,
  appVersion: String,
  deviceType: String,
  deviceName: String,
  deviceManufacturer: String,
  store: String,

  // iOS ATT (App Tracking Transparency)
  attStatus: Number,

  // SKAdNetwork Information (iOS)
  skadnetworkConversionValue: Number,
  skadnetworkCoarseValue: String,
  skadnetworkLockWindow: Boolean,
  skadnetworkPostbackSequenceIndex: Number,
  skPayload: String,
  skVersion: String,
  skNetworkId: String,
  skCampaignId: String,
  skFidelityType: Number,
  nonce: String,

  // Reporting Revenue (dashboard revenue)
  reportingRevenue: Number,

  // Publisher Parameter (all callback params as string)
  publisherParameter: String,

  // Subscription Information
  subscriptionPeriod: String,
  subscriptionState: String,
  subscriptionProductId: String,

  // Cost/Ad Spend Data (from Adjust callbacks)
  costAmount: Number,
  costCurrency: String,
  costType: String,

  // Raw callback data (store full payload for reference)
  rawData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Processing status
  processed: {
    type: Boolean,
    default: false
  },
  processedAt: Date,
  processingError: String,

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
adjustCallbackSchema.index({ activityKind: 1, createdAt: -1 });
adjustCallbackSchema.index({ appToken: 1, createdAt: -1 });
adjustCallbackSchema.index({ userId: 1, activityKind: 1 });
adjustCallbackSchema.index({ eventToken: 1, createdAt: -1 });
adjustCallbackSchema.index({ processed: 1, createdAt: -1 });

// Static method to find by Adjust user ID
adjustCallbackSchema.statics.findByAdjustUserId = function(adjustUserId) {
  return this.find({ adjustUserId: adjustUserId }).sort({ createdAt: -1 });
};

// Static method to find unprocessed callbacks
adjustCallbackSchema.statics.findUnprocessed = function(limit = 100) {
  return this.find({ processed: false }).limit(limit).sort({ createdAt: 1 });
};

module.exports = mongoose.model('AdjustCallback', adjustCallbackSchema);


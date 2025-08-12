const mongoose = require('mongoose');

const locationServiceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  locationEnabled: {
    type: Boolean,
    default: false,
  },
  currentLocation: {
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
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    country: {
      type: String,
    },
    zipCode: {
      type: String,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  locationHistory: [{
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    address: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    accuracy: {
      type: Number,
      comment: 'GPS accuracy in meters',
    },
    source: {
      type: String,
      enum: ['gps', 'network', 'manual'],
      default: 'gps',
    },
  }],
  preferences: {
    locationSharing: {
      type: Boolean,
      default: false,
    },
    locationBasedRewards: {
      type: Boolean,
      default: true,
    },
    locationBasedChallenges: {
      type: Boolean,
      default: true,
    },
    locationBasedDeals: {
      type: Boolean,
      default: true,
    },
    locationNotifications: {
      type: Boolean,
      default: true,
    },
    locationRadius: {
      type: Number,
      default: 10,
      min: 1,
      max: 100,
      comment: 'Radius in kilometers for location-based features',
    },
  },
  nearbyStores: [{
    storeName: {
      type: String,
      required: true,
    },
    storeId: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    distance: {
      type: Number,
      comment: 'Distance in kilometers from user location',
    },
    category: {
      type: String,
      enum: ['retail', 'food', 'entertainment', 'travel', 'health', 'beauty', 'electronics', 'home', 'fashion', 'other'],
    },
    cashbackRate: {
      type: Number,
      min: 0,
      max: 1,
    },
    isPartner: {
      type: Boolean,
      default: false,
    },
    lastVisited: {
      type: Date,
    },
    visitCount: {
      type: Number,
      default: 0,
    },
  }],
  locationBasedRewards: [{
    type: {
      type: String,
      enum: ['check_in', 'purchase', 'visit', 'discovery'],
    },
    storeName: {
      type: String,
      required: true,
    },
    storeAddress: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    pointsEarned: {
      type: Number,
      min: 0,
    },
    cashbackEarned: {
      type: Number,
      min: 0,
    },
    earnedAt: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
    },
  }],
  locationBasedChallenges: [{
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Challenge',
    },
    challengeTitle: {
      type: String,
      required: true,
    },
    storeName: {
      type: String,
      required: true,
    },
    storeAddress: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    distance: {
      type: Number,
      comment: 'Distance in kilometers from user location',
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
    pointsReward: {
      type: Number,
      min: 0,
    },
    cashbackReward: {
      type: Number,
      min: 0,
    },
  }],
  locationBasedDeals: [{
    dealId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deal',
    },
    dealTitle: {
      type: String,
      required: true,
    },
    storeName: {
      type: String,
      required: true,
    },
    storeAddress: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    distance: {
      type: Number,
      comment: 'Distance in kilometers from user location',
    },
    dealType: {
      type: String,
      enum: ['cashback', 'discount', 'bonus_points', 'free_shipping', 'buy_one_get_one', 'percentage_off'],
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    cashbackRate: {
      type: Number,
      min: 0,
      max: 1,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedAt: {
      type: Date,
    },
  }],
  locationNotifications: [{
    type: {
      type: String,
      enum: ['nearby_store', 'location_challenge', 'location_deal', 'location_reward'],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    storeName: {
      type: String,
    },
    storeAddress: {
      type: String,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    distance: {
      type: Number,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  privacySettings: {
    shareLocationWithApp: {
      type: Boolean,
      default: true,
    },
    shareLocationWithPartners: {
      type: Boolean,
      default: false,
    },
    locationHistoryRetention: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
      comment: 'Days to retain location history',
    },
    locationDataUsage: {
      type: String,
      enum: ['minimal', 'standard', 'enhanced'],
      default: 'standard',
    },
  },
}, {
  timestamps: true,
});

// Indexes
locationServiceSchema.index({ userId: 1 });
locationServiceSchema.index({ 'currentLocation.latitude': 1, 'currentLocation.longitude': 1 });
locationServiceSchema.index({ locationEnabled: 1 });
locationServiceSchema.index({ 'locationHistory.timestamp': -1 });

// Instance methods
locationServiceSchema.methods.updateLocation = function(latitude, longitude, address = null, accuracy = null, source = 'gps') {
  this.currentLocation = {
    latitude,
    longitude,
    address,
    lastUpdated: new Date(),
  };

  // Add to history
  this.locationHistory.push({
    latitude,
    longitude,
    address,
    accuracy,
    source,
  });

  // Keep only last 100 location records
  if (this.locationHistory.length > 100) {
    this.locationHistory = this.locationHistory.slice(-100);
  }

  return this.save();
};

locationServiceSchema.methods.enableLocation = function() {
  this.locationEnabled = true;
  return this.save();
};

locationServiceSchema.methods.disableLocation = function() {
  this.locationEnabled = false;
  return this.save();
};

locationServiceSchema.methods.getNearbyStores = function(radius = null) {
  if (!this.currentLocation.latitude || !this.currentLocation.longitude) {
    return [];
  }

  const searchRadius = radius || this.preferences.locationRadius;
  
  return this.nearbyStores.filter(store => {
    const distance = this.calculateDistance(
      this.currentLocation.latitude,
      this.currentLocation.longitude,
      store.latitude,
      store.longitude
    );
    return distance <= searchRadius;
  }).sort((a, b) => a.distance - b.distance);
};

locationServiceSchema.methods.addNearbyStore = function(storeData) {
  const distance = this.calculateDistance(
    this.currentLocation.latitude,
    this.currentLocation.longitude,
    storeData.latitude,
    storeData.longitude
  );

  const store = {
    ...storeData,
    distance,
  };

  // Check if store already exists
  const existingStoreIndex = this.nearbyStores.findIndex(
    s => s.storeName === storeData.storeName && s.address === storeData.address
  );

  if (existingStoreIndex >= 0) {
    this.nearbyStores[existingStoreIndex] = store;
  } else {
    this.nearbyStores.push(store);
  }

  return this.save();
};

locationServiceSchema.methods.recordLocationReward = function(rewardData) {
  this.locationBasedRewards.push(rewardData);
  return this.save();
};

locationServiceSchema.methods.recordLocationChallenge = function(challengeData) {
  this.locationBasedChallenges.push(challengeData);
  return this.save();
};

locationServiceSchema.methods.recordLocationDeal = function(dealData) {
  this.locationBasedDeals.push(dealData);
  return this.save();
};

locationServiceSchema.methods.addLocationNotification = function(notificationData) {
  this.locationNotifications.push(notificationData);
  return this.save();
};

locationServiceSchema.methods.calculateDistance = function(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = this.deg2rad(lat2 - lat1);
  const dLng = this.deg2rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

locationServiceSchema.methods.deg2rad = function(deg) {
  return deg * (Math.PI / 180);
};

locationServiceSchema.methods.isLocationEnabled = function() {
  return this.locationEnabled && this.currentLocation.latitude && this.currentLocation.longitude;
};

locationServiceSchema.methods.getLocationStats = function() {
  const stats = {
    totalVisits: this.nearbyStores.reduce((sum, store) => sum + store.visitCount, 0),
    totalRewards: this.locationBasedRewards.length,
    totalChallenges: this.locationBasedChallenges.filter(c => c.isCompleted).length,
    totalDeals: this.locationBasedDeals.filter(d => d.isUsed).length,
    totalPointsEarned: this.locationBasedRewards.reduce((sum, reward) => sum + reward.pointsEarned, 0),
    totalCashbackEarned: this.locationBasedRewards.reduce((sum, reward) => sum + reward.cashbackEarned, 0),
    favoriteStore: this.getFavoriteStore(),
  };

  return stats;
};

locationServiceSchema.methods.getFavoriteStore = function() {
  if (this.nearbyStores.length === 0) return null;

  return this.nearbyStores.reduce((favorite, store) => {
    return store.visitCount > favorite.visitCount ? store : favorite;
  });
};

// Static methods
locationServiceSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

locationServiceSchema.statics.findEnabledUsers = function() {
  return this.find({ locationEnabled: true });
};

const LocationService = mongoose.model('LocationService', locationServiceSchema);

module.exports = LocationService; 
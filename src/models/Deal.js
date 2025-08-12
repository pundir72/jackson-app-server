const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  type: {
    type: String,
    enum: ['cashback', 'discount', 'bonus_points', 'free_shipping', 'buy_one_get_one', 'percentage_off'],
    required: true,
  },
  category: {
    type: String,
    enum: ['retail', 'food', 'entertainment', 'travel', 'health', 'beauty', 'electronics', 'home', 'fashion', 'other'],
    required: true,
  },
  storeName: {
    type: String,
    required: true,
    trim: true,
  },
  storeLogo: {
    type: String,
  },
  originalPrice: {
    type: Number,
    min: 0,
  },
  discountedPrice: {
    type: Number,
    min: 0,
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
  bonusPoints: {
    type: Number,
    min: 0,
  },
  minimumPurchase: {
    type: Number,
    min: 0,
  },
  maximumCashback: {
    type: Number,
    min: 0,
  },
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  isVipOnly: {
    type: Boolean,
    default: false,
  },
  locationRequired: {
    type: Boolean,
    default: false,
  },
  locations: [{
    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
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
    distance: {
      type: Number,
      comment: 'Distance in kilometers from user location',
    },
  }],
  terms: {
    type: [String],
    default: [],
  },
  exclusions: {
    type: [String],
    default: [],
  },
  imageUrl: {
    type: String,
  },
  bannerColor: {
    type: String,
    maxlength: 7,
    comment: 'Hex color code for deal banner',
  },
  textColor: {
    type: String,
    maxlength: 7,
    comment: 'Hex color code for deal text',
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  maxUsage: {
    type: Number,
    comment: 'Maximum number of times this deal can be used',
  },
  userUsage: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
    purchaseAmount: {
      type: Number,
      min: 0,
    },
    cashbackEarned: {
      type: Number,
      min: 0,
    },
    pointsEarned: {
      type: Number,
      min: 0,
    },
  }],
  tags: {
    type: [String],
    default: [],
  },
  priority: {
    type: Number,
    default: 0,
    comment: 'Higher number = higher priority in listings',
  },
  ageRange: {
    type: String,
    enum: ['all', 'under_18', '18_24', '25_34', '35_44', '45_54', '55_plus'],
    default: 'all',
  },
  gender: {
    type: String,
    enum: ['all', 'male', 'female', 'other'],
    default: 'all',
  },
}, {
  timestamps: true,
});

// Indexes
dealSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
dealSchema.index({ category: 1 });
dealSchema.index({ storeName: 1 });
dealSchema.index({ isFeatured: 1 });
dealSchema.index({ isVipOnly: 1 });
dealSchema.index({ locationRequired: 1 });
dealSchema.index({ createdAt: -1 });

// Instance methods
dealSchema.methods.isAvailable = function() {
  const now = new Date();
  return this.isActive && now >= this.startDate && now <= this.endDate;
};

dealSchema.methods.isExpired = function() {
  const now = new Date();
  return now > this.endDate;
};

dealSchema.methods.isUpcoming = function() {
  const now = new Date();
  return now < this.startDate;
};

dealSchema.methods.canBeUsedByUser = function(user) {
  // Check if deal is available
  if (!this.isAvailable()) return false;

  // Check VIP requirement
  if (this.isVipOnly && !user.isVip) return false;

  // Check age range
  if (this.ageRange !== 'all' && user.ageRange && user.ageRange !== this.ageRange) {
    return false;
  }

  // Check gender
  if (this.gender !== 'all' && user.gender && user.gender !== this.gender) {
    return false;
  }

  // Check usage limit
  if (this.maxUsage && this.usageCount >= this.maxUsage) return false;

  // Check if user has already used this deal
  const userUsage = this.userUsage.find(usage => usage.userId.toString() === user._id.toString());
  if (userUsage) return false;

  return true;
};

dealSchema.methods.calculateRewards = function(purchaseAmount, user) {
  let cashback = 0;
  let points = 0;

  switch (this.type) {
    case 'cashback':
      cashback = purchaseAmount * this.cashbackRate;
      if (this.maximumCashback) {
        cashback = Math.min(cashback, this.maximumCashback);
      }
      break;
    case 'bonus_points':
      points = this.bonusPoints;
      break;
    case 'discount':
      if (this.discountPercentage) {
        cashback = purchaseAmount * (this.discountPercentage / 100);
      }
      break;
  }

  // Apply VIP multiplier
  if (user.isVip) {
    cashback *= 1.5;
    points = Math.floor(points * 1.5);
  }

  return {
    cashback: parseFloat(cashback.toFixed(2)),
    points: Math.floor(points),
  };
};

dealSchema.methods.recordUsage = function(userId, purchaseAmount, rewards) {
  this.usageCount += 1;
  this.userUsage.push({
    userId,
    purchaseAmount,
    cashbackEarned: rewards.cashback,
    pointsEarned: rewards.points,
  });
  return this.save();
};

dealSchema.methods.getDistanceFromUser = function(userLat, userLng) {
  if (!this.locations || this.locations.length === 0) return null;

  let minDistance = Infinity;
  let nearestLocation = null;

  this.locations.forEach(location => {
    if (location.latitude && location.longitude) {
      const distance = this.calculateDistance(
        userLat, userLng,
        location.latitude, location.longitude
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestLocation = location;
      }
    }
  });

  return {
    distance: minDistance,
    location: nearestLocation,
  };
};

dealSchema.methods.calculateDistance = function(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = this.deg2rad(lat2 - lat1);
  const dLng = this.deg2rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

dealSchema.methods.deg2rad = function(deg) {
  return deg * (Math.PI / 180);
};

// Static methods
dealSchema.statics.findActive = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1, createdAt: -1 });
};

dealSchema.statics.findFeatured = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    isFeatured: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1, createdAt: -1 });
};

dealSchema.statics.findByCategory = function(category) {
  const now = new Date();
  return this.find({
    category,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1, createdAt: -1 });
};

dealSchema.statics.findByStore = function(storeName) {
  const now = new Date();
  return this.find({
    storeName: new RegExp(storeName, 'i'),
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1, createdAt: -1 });
};

dealSchema.statics.findNearby = function(latitude, longitude, radius = 10) {
  const now = new Date();
  return this.find({
    locationRequired: true,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ priority: -1, createdAt: -1 });
};

dealSchema.statics.findForUser = function(user, options = {}) {
  const now = new Date();
  const query = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };

  // Filter by VIP requirement
  if (!user.isVip) {
    query.isVipOnly = false;
  }

  // Filter by age range
  if (user.ageRange && user.ageRange !== 'unknown') {
    query.ageRange = { $in: ['all', user.ageRange] };
  }

  // Filter by gender
  if (user.gender) {
    query.gender = { $in: ['all', user.gender] };
  }

  // Add category filter if provided
  if (options.category) {
    query.category = options.category;
  }

  // Add store filter if provided
  if (options.storeName) {
    query.storeName = new RegExp(options.storeName, 'i');
  }

  return this.find(query).sort({ priority: -1, createdAt: -1 });
};

const Deal = mongoose.model('Deal', dealSchema);

module.exports = Deal; 
const mongoose = require('mongoose');

const payoutMethodSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  enabled: {
    type: Boolean,
    default: true
  },
  minAmount: {
    type: Number,
    required: true,
    default: 0
  },
  maxAmount: {
    type: Number,
    default: null // null means no limit
  },
  processingTime: {
    type: String,
    enum: ['instant', '1-3 days', '3-5 days', '5-7 days'],
    default: '1-3 days'
  },
  fees: {
    fixed: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    }
  },
  regions: [{
    type: String,
    enum: ['US', 'EU', 'UK', 'IN', 'CA', 'AU', 'GLOBAL']
  }],
  currencies: [{
    type: String,
    enum: ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD']
  }],
  requirements: {
    verificationRequired: {
      type: Boolean,
      default: false
    },
    minAge: {
      type: Number,
      default: 18
    },
    documents: [{
      type: String,
      enum: ['id', 'passport', 'utility_bill', 'bank_statement']
    }]
  },
  metadata: {
    description: String,
    instructions: String,
    supportUrl: String,
    apiEndpoint: String
  },
  isActive: {
    type: Boolean,
    default: true
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
payoutMethodSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
payoutMethodSchema.index({ isActive: 1, enabled: 1 });
payoutMethodSchema.index({ regions: 1 });
payoutMethodSchema.index({ currencies: 1 });

// Static method to get active payout methods
payoutMethodSchema.statics.getActiveMethods = function() {
  return this.find({ isActive: true, enabled: true }).sort({ name: 1 });
};

// Static method to get methods for region
payoutMethodSchema.statics.getMethodsForRegion = function(region) {
  return this.find({
    isActive: true,
    enabled: true,
    $or: [
      { regions: 'GLOBAL' },
      { regions: region }
    ]
  }).sort({ name: 1 });
};

// Instance method to calculate fees
payoutMethodSchema.methods.calculateFees = function(amount) {
  const fixedFee = this.fees.fixed || 0;
  const percentageFee = (this.fees.percentage || 0) / 100 * amount;
  return fixedFee + percentageFee;
};

// Instance method to check if amount is valid
payoutMethodSchema.methods.isAmountValid = function(amount) {
  if (amount < this.minAmount) return false;
  if (this.maxAmount && amount > this.maxAmount) return false;
  return true;
};

module.exports = mongoose.model('PayoutMethod', payoutMethodSchema);

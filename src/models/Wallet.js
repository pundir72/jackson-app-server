const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  balance: {
    type: Number,
    default: 0.00,
    min: 0,
  },
  pendingBalance: {
    type: Number,
    default: 0.00,
    min: 0,
  },
  totalEarned: {
    type: Number,
    default: 0.00,
    min: 0,
  },
  totalWithdrawn: {
    type: Number,
    default: 0.00,
    min: 0,
  },
  currency: {
    type: String,
    default: 'USD',
    enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastTransactionAt: {
    type: Date,
  },
  withdrawalSettings: {
    minimumWithdrawal: {
      type: Number,
      default: 10.00,
      min: 1,
    },
    preferredPaymentMethod: {
      type: String,
      enum: ['paypal', 'bank_transfer', 'stripe', 'apple_pay', 'google_pay'],
      default: 'paypal',
    },
    autoWithdraw: {
      type: Boolean,
      default: false,
    },
    autoWithdrawThreshold: {
      type: Number,
      default: 50.00,
      min: 10,
    },
  },
  securitySettings: {
    requireVerification: {
      type: Boolean,
      default: true,
    },
    maxDailyWithdrawal: {
      type: Number,
      default: 1000.00,
      min: 10,
    },
    requireTwoFactor: {
      type: Boolean,
      default: false,
    },
  },
}, {
  timestamps: true,
});

// Indexes
walletSchema.index({ userId: 1 });
walletSchema.index({ isActive: 1 });
walletSchema.index({ lastTransactionAt: -1 });

// Instance methods
walletSchema.methods.addFunds = function(amount, type = 'cashback') {
  this.balance += parseFloat(amount);
  this.totalEarned += parseFloat(amount);
  this.lastTransactionAt = new Date();
  return this.save();
};

walletSchema.methods.deductFunds = function(amount) {
  if (this.balance < amount) {
    throw new Error('Insufficient funds');
  }
  this.balance -= parseFloat(amount);
  this.lastTransactionAt = new Date();
  return this.save();
};

walletSchema.methods.addPendingFunds = function(amount) {
  this.pendingBalance += parseFloat(amount);
  this.lastTransactionAt = new Date();
  return this.save();
};

walletSchema.methods.approvePendingFunds = function(amount) {
  if (this.pendingBalance < amount) {
    throw new Error('Insufficient pending funds');
  }
  this.pendingBalance -= parseFloat(amount);
  this.balance += parseFloat(amount);
  this.totalEarned += parseFloat(amount);
  this.lastTransactionAt = new Date();
  return this.save();
};

walletSchema.methods.withdrawFunds = function(amount) {
  if (this.balance < amount) {
    throw new Error('Insufficient funds');
  }
  if (amount < this.withdrawalSettings.minimumWithdrawal) {
    throw new Error(`Minimum withdrawal amount is $${this.withdrawalSettings.minimumWithdrawal}`);
  }
  this.balance -= parseFloat(amount);
  this.totalWithdrawn += parseFloat(amount);
  this.lastTransactionAt = new Date();
  return this.save();
};

walletSchema.methods.getAvailableBalance = function() {
  return this.balance - this.pendingBalance;
};

walletSchema.methods.canWithdraw = function(amount) {
  return this.balance >= amount && amount >= this.withdrawalSettings.minimumWithdrawal;
};

// Static methods
walletSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

walletSchema.statics.createForUser = function(userId) {
  return this.create({ userId });
};

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet; 
const mongoose = require('mongoose');

const batchClaimSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  gameId: {
    type: String,
    required: true,
    index: true
  },
  batchNumber: {
    type: Number,
    required: true,
    min: 1
  },
  coins: {
    type: Number,
    required: true,
    default: 0
  },
  xp: {
    type: Number,
    required: true,
    default: 0
  },
  gameTitle: {
    type: String,
    default: null
  },
  claimedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate claims
batchClaimSchema.index({ userId: 1, gameId: 1, batchNumber: 1 }, { unique: true });

const BatchClaim = mongoose.model('BatchClaim', batchClaimSchema);

module.exports = BatchClaim;

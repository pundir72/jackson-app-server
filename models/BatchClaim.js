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
  },
  taskIds: [{
    type: String
  }],
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate batch claims
batchClaimSchema.index({ userId: 1, gameId: 1, batchNumber: 1 }, { unique: true });

// Index to prevent per-task double-claim across batches
batchClaimSchema.index({ userId: 1, gameId: 1, taskIds: 1 });

const BatchClaim = mongoose.model('BatchClaim', batchClaimSchema);

module.exports = BatchClaim;

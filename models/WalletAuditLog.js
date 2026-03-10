/**
 * Wallet Audit Log Model
 * Tracks all admin actions on user wallets and transactions
 * @module models/WalletAuditLog
 */

const mongoose = require("mongoose");

const walletAuditLogSchema = new mongoose.Schema(
  {
    // Admin who performed the action
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Target user affected
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Action type
    action: {
      type: String,
      required: true,
      enum: [
        "APPROVE_REDEMPTION",
        "REJECT_REDEMPTION",
        "ADD_COINS",
        "SUBTRACT_COINS",
        "ADD_XP",
        "SUBTRACT_XP",
        "ADJUST_BALANCE",
        "FREEZE_WALLET",
        "UNFREEZE_WALLET",
        "VIEW_TRANSACTION",
        "VIEW_USER_WALLET",
        "EXPORT_DATA",
        "WALLET_SETTLEMENT",
      ],
      index: true,
    },

    // Details of the action
    details: {
      balanceType: {
        type: String,
        enum: ["coins", "xp", "cash"],
      },
      adjustmentType: {
        type: String,
        enum: ["add", "subtract"],
      },
      amount: Number,
      previousBalance: Number,
      newBalance: Number,
      reason: String,
      transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Transaction",
      },
    },

    // Metadata
    metadata: {
      ip: String,
      userAgent: String,
      location: String,
      additionalData: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
walletAuditLogSchema.index({ adminId: 1, createdAt: -1 });
walletAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
walletAuditLogSchema.index({ action: 1, createdAt: -1 });
walletAuditLogSchema.index({ createdAt: -1 });

// Statics

/**
 * Get audit logs for a user
 */
walletAuditLogSchema.statics.getUserAuditLogs = async function (
  userId,
  limit = 50,
) {
  return await this.find({ targetUserId: userId })
    .populate("adminId", "firstName lastName email")
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Get audit logs by admin
 */
walletAuditLogSchema.statics.getAdminActions = async function (
  adminId,
  limit = 100,
) {
  return await this.find({ adminId })
    .populate("targetUserId", "firstName lastName email")
    .sort({ createdAt: -1 })
    .limit(limit);
};

/**
 * Log admin action
 */
walletAuditLogSchema.statics.logAction = async function (data) {
  return await this.create(data);
};

const WalletAuditLog = mongoose.model("WalletAuditLog", walletAuditLogSchema);

module.exports = WalletAuditLog;

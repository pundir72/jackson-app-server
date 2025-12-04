/**
 * Admin Transaction & Wallet Manager Routes
 * Manages transactions, redemptions, wallet adjustments, conversions, and audit trails
 * @module routes/admin-transactions
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { body, query, validationResult } = require("express-validator");
const { adminAuth } = require("../middleware/adminAuth");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const WalletAuditLog = require("../models/WalletAuditLog");
const XPTier = require("../models/XPTier");
const ConversionSettings = require("../models/ConversionSettings");

// ==================== SCREEN 1: TRANSACTION LOG ====================

/**
 * @route   GET /api/admin/transactions
 * @desc    Get all transactions with filters and search
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} search - Search by transaction ID or user ID
 * @query   {string} type - Filter by type
 * @query   {string} status - Filter by status
 * @query   {string} startDate - Filter start date
 * @query   {string} endDate - Filter end date
 * @query   {string} approvalStatus - Filter by approval status
 * @access  Admin
 */
router.get(
  "/",
  adminAuth,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be positive"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be 1-100"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        page = 1,
        limit = 10,
        search,
        type,
        status,
        startDate,
        endDate,
        approvalStatus,
      } = req.query;

      // Build query
      const query = {};

      // Search by transaction ID or user ID
      if (search) {
        const searchRegex = new RegExp(search, "i");
        // Try to match ObjectId format for user search
        if (mongoose.Types.ObjectId.isValid(search)) {
          query.$or = [{ referenceId: searchRegex }, { user: search }];
        } else {
          query.referenceId = searchRegex;
        }
      }

      // Filters
      if (type) query.type = type;
      if (status) query.status = status;
      if (approvalStatus) query["approval.status"] = approvalStatus;

      // Date range (SW-33)
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          const start = new Date(startDate);
          // Set to start of day
          start.setHours(0, 0, 0, 0);
          query.createdAt.$gte = start;
        }
        if (endDate) {
          const end = new Date(endDate);
          // Set to end of day
          end.setHours(23, 59, 59, 999);
          query.createdAt.$lte = end;
        }
      }

      // SW-36: Filter out processing transactions for adjustments and payouts
      // Only show completed transactions for these types
      if (!status) {
        // If no status filter is applied, exclude processing transactions
        query.status = { $ne: "processing" };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .populate("user", "firstName lastName email mobile wallet xp")
          .populate("approval.approvedBy", "firstName lastName email")
          .populate("approval.rejectedBy", "firstName lastName email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Transaction.countDocuments(query),
      ]);

      // Format for frontend
      const formattedTransactions = transactions.map((tx) => ({
        ...tx,
        transactionId: tx.referenceId,
        userId: tx.user?._id || tx.user,
        userName: tx.user
          ? `${tx.user.firstName} ${tx.user.lastName}`
          : "Unknown",
        userEmail: tx.user?.email,
        approvalStatus: tx.approval?.status || "not_required",
        isApproved: tx.approval?.status === "approved",
        createdOn: tx.createdAt,
        approvedOn: tx.approval?.approvedAt,
      }));

      res.json({
        success: true,
        data: {
          transactions: formattedTransactions,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Error getting transactions:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get transactions",
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/transactions/:id
 * @desc    Get single transaction details
 * @access  Admin
 */
router.get("/:id", adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("user")
      .populate("approval.approvedBy", "firstName lastName email")
      .populate("approval.rejectedBy", "firstName lastName email")
      .populate("adjustment.adminId", "firstName lastName email");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found",
      });
    }

    // Log view action
    await WalletAuditLog.logAction({
      adminId: req.user.userId,
      targetUserId: transaction.user._id,
      action: "VIEW_TRANSACTION",
      details: {
        transactionId: transaction._id,
      },
    });

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error("Error getting transaction:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get transaction details",
    });
  }
});

/**
 * @route   GET /api/admin/transactions/stats/overview
 * @desc    Get transaction statistics overview
 * @access  Admin
 */
router.get("/stats/overview", adminAuth, async (req, res) => {
  try {
    const { type, status, startDate, endDate } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const stats = await Transaction.getStatistics(filters);

    // Get totals
    const totalTransactions = stats.reduce((sum, s) => sum + s.count, 0);
    const totalAmount = stats.reduce((sum, s) => sum + s.totalAmount, 0);

    // Get pending count
    const pendingCount = await Transaction.countDocuments({
      status: "pending",
    });

    res.json({
      success: true,
      data: {
        overall: {
          totalTransactions,
          totalAmount,
          pendingCount,
        },
        byType: stats,
      },
    });
  } catch (error) {
    console.error("Error getting transaction stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get statistics",
    });
  }
});

// ==================== SCREEN 2: REDEMPTION QUEUE ====================

/**
 * @route   GET /api/admin/transactions/redemptions/pending
 * @desc    Get pending redemption queue
 * @query   {number} limit - Number of items
 * @access  Admin
 */
router.get("/redemptions/pending", adminAuth, async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const redemptions = await Transaction.getPendingRedemptions(
      parseInt(limit)
    );

    // Format with additional data
    const formattedRedemptions = redemptions.map((redemption) => ({
      ...redemption.toObject(),
      redemptionId: redemption.referenceId,
      userId: redemption.user._id,
      userName: `${redemption.user.firstName} ${redemption.user.lastName}`,
      userEmail: redemption.user.email,
      userMobile: redemption.user.mobile,
      faceVerified: redemption.verification?.faceVerified || false,
      offerCompletion: redemption.metadata?.offerCompletion || null,
      userLocation: redemption.user.location?.current,
      userVerification: redemption.user.verification,
    }));

    res.json({
      success: true,
      data: {
        redemptions: formattedRedemptions,
        total: redemptions.length,
      },
    });
  } catch (error) {
    console.error("Error getting redemption queue:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get redemption queue",
    });
  }
});

/**
 * @route   POST /api/admin/transactions/redemptions/:id/approve
 * @desc    Approve a redemption
 * @access  Admin
 */
router.post("/redemptions/:id/approve", adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Redemption not found",
      });
    }

    if (transaction.type !== "redemption") {
      return res.status(400).json({
        success: false,
        error: "This is not a redemption transaction",
      });
    }

    if (transaction.approval.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "Redemption already processed",
      });
    }

    // Approve the transaction
    await transaction.approve(req.user.userId);

    // Update user redemption tracking
    const user = await User.findById(transaction.user);
    if (user) {
      if (!user.redemption) {
        user.redemption = {
          preference: transaction.metadata?.redemptionMethod || "none",
          count: 0,
          totalCoinsRedeemed: 0,
        };
      }
      user.redemption.count = (user.redemption.count || 0) + 1;
      user.redemption.totalCoinsRedeemed =
        (user.redemption.totalCoinsRedeemed || 0) + (transaction.amount || 0);
      user.redemption.lastRedeemedAt = new Date();
      if (transaction.metadata?.redemptionMethod) {
        user.redemption.preference = transaction.metadata.redemptionMethod;
      }
      await user.save();
    }

    // Log to audit trail
    await WalletAuditLog.logAction({
      adminId: req.user.userId,
      targetUserId: transaction.user,
      action: "APPROVE_REDEMPTION",
      details: {
        transactionId: transaction._id,
        amount: transaction.amount,
        balanceType: transaction.balanceType,
      },
    });

    res.json({
      success: true,
      message: "Redemption approved successfully",
      data: {
        transactionId: transaction._id,
        status: transaction.status,
        approvalStatus: transaction.approval.status,
      },
    });
  } catch (error) {
    console.error("Error approving redemption:", error);
    res.status(500).json({
      success: false,
      error: "Failed to approve redemption",
    });
  }
});

/**
 * @route   POST /api/admin/transactions/redemptions/:id/reject
 * @desc    Reject a redemption
 * @body    {string} reason - Rejection reason
 * @access  Admin
 */
router.post(
  "/redemptions/:id/reject",
  adminAuth,
  [body("reason").notEmpty().withMessage("Rejection reason is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { reason } = req.body;
      const transaction = await Transaction.findById(req.params.id);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: "Redemption not found",
        });
      }

      if (transaction.type !== "redemption") {
        return res.status(400).json({
          success: false,
          error: "This is not a redemption transaction",
        });
      }

      if (transaction.approval.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: "Redemption already processed",
        });
      }

      // Reject the transaction
      await transaction.reject(req.user.userId, reason);

      // If rejected, refund the amount to user wallet
      const user = await User.findById(transaction.user);
      if (user && transaction.balanceType === "coins") {
        user.wallet.balance = (user.wallet.balance || 0) + transaction.amount;
        await user.save();
      }

      // Log to audit trail
      await WalletAuditLog.logAction({
        adminId: req.user.userId,
        targetUserId: transaction.user,
        action: "REJECT_REDEMPTION",
        details: {
          transactionId: transaction._id,
          amount: transaction.amount,
          reason,
        },
      });

      res.json({
        success: true,
        message: "Redemption rejected successfully",
        data: {
          transactionId: transaction._id,
          status: transaction.status,
          approvalStatus: transaction.approval.status,
          reason,
        },
      });
    } catch (error) {
      console.error("Error rejecting redemption:", error);
      res.status(500).json({
        success: false,
        error: "Failed to reject redemption",
      });
    }
  }
);

/**
 * @route   GET /api/admin/transactions/users/:userId/sneak-peek
 * @desc    Get user activity summary for sneak peek
 * @access  Admin
 */
router.get("/users/:userId/sneak-peek", adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "firstName lastName email mobile wallet xp location verification badges streak"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get recent transactions
    const recentTransactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get last activity
    const lastActivity = await Transaction.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    // Get offer/game completion data (if available)
    const offerCompletions = recentTransactions
      .filter((tx) => tx.metadata?.offerCompletion)
      .map((tx) => tx.metadata.offerCompletion);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          mobile: user.mobile,
          wallet: user.wallet,
          xp: user.xp,
          location: user.location?.current,
          verification: user.verification,
          badges: user.badges || [],
          streak: user.streak,
        },
        recentActivity: {
          transactions: recentTransactions.slice(0, 5),
          lastActivity: lastActivity
            ? {
                type: lastActivity.type,
                amount: lastActivity.amount,
                description: lastActivity.description,
                timestamp: lastActivity.createdAt,
              }
            : null,
          offerCompletions: offerCompletions.slice(0, 3),
        },
        statistics: {
          totalTransactions: recentTransactions.length,
          totalEarned: recentTransactions
            .filter((tx) => tx.type === "credit" || tx.type === "reward")
            .reduce((sum, tx) => sum + tx.amount, 0),
          totalSpent: recentTransactions
            .filter((tx) => tx.type === "debit" || tx.type === "redemption")
            .reduce((sum, tx) => sum + tx.amount, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error getting sneak peek:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user activity",
    });
  }
});

// ==================== SCREEN 3: WALLET ADJUSTMENTS ====================

/**
 * @route   POST /api/admin/transactions/wallet/adjust
 * @desc    Manually adjust user wallet (add/subtract coins or XP)
 * @body    {string} userId - User ID
 * @body    {string} balanceType - coins or xp
 * @body    {string} adjustmentType - add or subtract
 * @body    {number} amount - Amount to adjust
 * @body    {string} reason - Reason for adjustment
 * @access  Admin
 */
router.post(
  "/wallet/adjust",
  adminAuth,
  [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("balanceType")
      .isIn(["coins", "xp"])
      .withMessage("Balance type must be coins or xp"),
    body("adjustmentType")
      .isIn(["add", "subtract"])
      .withMessage("Adjustment type must be add or subtract"),
    body("amount")
      .isInt({ min: 1 })
      .withMessage("Amount must be a positive integer"),
    body("reason").notEmpty().withMessage("Reason is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { userId, balanceType, adjustmentType, amount, reason } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Get current balance
      let previousBalance, newBalance;

      if (balanceType === "coins") {
        previousBalance = user.wallet.balance || 0;
        newBalance =
          adjustmentType === "add"
            ? previousBalance + amount
            : previousBalance - amount;

        // Debug logging
        // console.log("Wallet Adjustment Debug:", {
        //   userId,
        //   balanceType,
        //   adjustmentType,
        //   amount,
        //   previousBalance,
        //   newBalance,
        //   userWalletBalance: user.wallet.balance,
        // });

        if (newBalance < 0) {
          return res.status(400).json({
            success: false,
            error: "Insufficient balance for subtraction",
            debug: {
              previousBalance,
              amount,
              newBalance,
              userWalletBalance: user.wallet.balance,
            },
          });
        }

        user.wallet.balance = newBalance;
        user.wallet.lastUpdated = new Date();
      } else {
        // xp
        previousBalance = user.xp.current || 0;
        newBalance =
          adjustmentType === "add"
            ? previousBalance + amount
            : previousBalance - amount;

        if (newBalance < 0) {
          return res.status(400).json({
            success: false,
            error: "Insufficient XP for subtraction",
          });
        }

        user.xp.current = newBalance;
        if (adjustmentType === "add") {
          user.xp.total = (user.xp.total || 0) + amount;
        }
      }

      await user.save();

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        type: "adjustment",
        amount: amount,
        balanceType: balanceType,
        description: `Admin ${adjustmentType}: ${reason}`,
        status: "completed",
        adjustment: {
          isAdjustment: true,
          adjustmentType,
          reason,
          adminId: req.user.userId,
          previousBalance,
          newBalance,
        },
        metadata: {
          adminAction: true,
          adminReason: reason,
        },
      });

      await transaction.save();

      // Log to audit trail
      const action =
        balanceType === "coins"
          ? adjustmentType === "add"
            ? "ADD_COINS"
            : "SUBTRACT_COINS"
          : adjustmentType === "add"
          ? "ADD_XP"
          : "SUBTRACT_XP";

      await WalletAuditLog.logAction({
        adminId: req.user.userId,
        targetUserId: userId,
        action,
        details: {
          balanceType,
          adjustmentType,
          amount,
          previousBalance,
          newBalance,
          reason,
          transactionId: transaction._id,
        },
      });

      res.json({
        success: true,
        message: "Wallet adjusted successfully",
        data: {
          transactionId: transaction._id,
          balanceType,
          adjustmentType,
          amount,
          previousBalance,
          newBalance,
          currentBalance:
            balanceType === "coins" ? user.wallet.balance : user.xp.current,
        },
      });
    } catch (error) {
      console.error("Error adjusting wallet:", error);
      res.status(500).json({
        success: false,
        error: "Failed to adjust wallet",
        message: error.message,
      });
    }
  }
);

/**
 * @route   GET /api/admin/transactions/wallet/:userId
 * @desc    Get user wallet details
 * @access  Admin
 */
router.get("/wallet/:userId", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select(
      "firstName lastName email mobile wallet xp"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get recent wallet transactions
    const recentTransactions = await Transaction.find({
      user: req.params.userId,
      type: { $in: ["adjustment", "credit", "debit", "redemption"] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Log view action
    await WalletAuditLog.logAction({
      adminId: req.user.userId,
      targetUserId: user._id,
      action: "VIEW_USER_WALLET",
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          mobile: user.mobile,
        },
        wallet: {
          balance: user.wallet.balance || 0,
          currency: user.wallet.currency || "coins",
          lastUpdated: user.wallet.lastUpdated,
        },
        xp: {
          current: user.xp.current || 0,
          total: user.xp.total || 0,
          tier: user.xp.tier || 1,
        },
        recentTransactions,
      },
    });
  } catch (error) {
    console.error("Error getting wallet:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get wallet details",
    });
  }
});

// ==================== SCREEN 4: CONVERSION SETTINGS ====================

/**
 * @route   GET /api/admin/transactions/conversion/settings
 * @desc    Get Coin to currency conversion settings
 * @access  Admin
 */
router.get("/conversion/settings", adminAuth, async (req, res) => {
  try {
    // Get conversion settings from database
    const settings = await ConversionSettings.getActiveSettings("USD");

    // Calculate conversion rate
    const conversionRate =
      settings.coinsPerDollar > 0 ? 1 / settings.coinsPerDollar : 0.01;

    const coinConversionRates = {
      USD: conversionRate,
    };

    // Format conversion rules - USD only
    const conversionRules = [
      {
        currency: settings.currency,
        currencySymbol: "$",
        conversionRule: `${settings.coinsPerUnit} Coins = $${settings.currencyAmount}`,
        coinsPerDollar: settings.coinsPerDollar,
        coinsPerUnit: settings.coinsPerUnit,
        currencyAmount: settings.currencyAmount,
        method: settings.paymentMethods || [
          "UPI",
          "Paytm",
          "Gift Card",
          "Bank Transfer",
          "PayPal",
        ],
        ruleSource: "System Configuration",
      },
    ];

    res.json({
      success: true,
      data: {
        conversionRules,
        defaultRule: {
          coinsPerDollar: settings.coinsPerDollar,
          minRedemption: settings.minRedemption,
          maxRedemption: settings.maxRedemption,
          defaultCurrency: settings.currency,
          conversionRates: coinConversionRates,
        },
      },
    });
  } catch (error) {
    console.error("Error getting conversion settings:", error);
    res.status(500).json({
      success: true, // Return success with defaults
      data: {
        conversionRules: [
          {
            currency: "USD",
            currencySymbol: "$",
            conversionRule: "500 Coins = $5",
            coinsPerDollar: 100,
            coinsPerUnit: 500,
            currencyAmount: 5,
            method: ["UPI", "Paytm", "Gift Card", "Bank Transfer", "PayPal"],
            ruleSource: "System Configuration",
          },
        ],
        defaultRule: {
          coinsPerDollar: 100,
          minRedemption: 100,
          maxRedemption: 10000,
          defaultCurrency: "USD",
        },
      },
    });
  }
});

/**
 * @route   PUT /api/admin/transactions/conversion/settings
 * @desc    Update Coin to currency conversion settings
 * @body    {string} currency - Currency code (USD)
 * @body    {number} coinsPerDollar - Coins per dollar
 * @body    {number} coinsPerUnit - Coins per unit
 * @body    {number} currencyAmount - Currency amount per unit
 * @access  Admin
 */
router.put(
  "/conversion/settings",
  adminAuth,
  [
    body("currency").notEmpty().withMessage("Currency is required"),
    body("coinsPerDollar")
      .isFloat({ min: 0.01 })
      .withMessage("Coins per dollar must be a positive number"),
    body("coinsPerUnit")
      .isInt({ min: 1 })
      .withMessage("Coins per unit must be a positive integer"),
    body("currencyAmount")
      .isFloat({ min: 0.01 })
      .withMessage("Currency amount must be a positive number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { currency, coinsPerDollar, coinsPerUnit, currencyAmount } =
        req.body;

      // Validate currency
      if (currency !== "USD") {
        return res.status(400).json({
          success: false,
          message: "Only USD currency is supported",
        });
      }

      // Get previous settings for logging
      const previousSettings = await ConversionSettings.findOne({
        currency: currency.toUpperCase(),
      });

      // Update conversion settings in database
      const updatedSettings = await ConversionSettings.updateSettings(
        currency,
        {
          coinsPerDollar: parseFloat(coinsPerDollar),
          coinsPerUnit: parseInt(coinsPerUnit),
          currencyAmount: parseFloat(currencyAmount),
        },
        req.user.userId
      );

      // Calculate conversion rate
      const conversionRate = coinsPerDollar > 0 ? 1 / coinsPerDollar : 0.01;

      // Format updated conversion rules
      const updatedConversionRules = [
        {
          currency: updatedSettings.currency,
          currencySymbol: "$",
          conversionRule: `${updatedSettings.coinsPerUnit} Coins = $${updatedSettings.currencyAmount}`,
          coinsPerDollar: updatedSettings.coinsPerDollar,
          coinsPerUnit: updatedSettings.coinsPerUnit,
          currencyAmount: updatedSettings.currencyAmount,
          method: updatedSettings.paymentMethods || [
            "UPI",
            "Paytm",
            "Gift Card",
            "Bank Transfer",
            "PayPal",
          ],
          ruleSource: "System Configuration",
        },
      ];

      const updatedDefaultRule = {
        coinsPerDollar: updatedSettings.coinsPerDollar,
        minRedemption: updatedSettings.minRedemption,
        maxRedemption: updatedSettings.maxRedemption,
        defaultCurrency: updatedSettings.currency,
        conversionRates: {
          USD: conversionRate,
        },
      };

      // Log the update action
      // Note: Conversion settings are system-wide, not user-specific
      // Since WalletAuditLog requires a targetUserId, we'll skip audit logging for system settings
      // In a production system, you might want a separate SystemAuditLog for system-wide changes
      // console.log(`Conversion settings updated by admin ${req.user.userId}:`, {
      //   currency,
      //   coinsPerDollar: updatedSettings.coinsPerDollar,
      //   coinsPerUnit: updatedSettings.coinsPerUnit,
      //   currencyAmount: updatedSettings.currencyAmount,
      //   previousRate: previousSettings
      //     ? previousSettings.coinsPerDollar > 0
      //       ? 1 / previousSettings.coinsPerDollar
      //       : 0.01
      //     : 0.01,
      //   newRate: conversionRate,
      // });

      res.json({
        success: true,
        message: "Conversion settings updated successfully",
        data: {
          conversionRules: updatedConversionRules,
          defaultRule: updatedDefaultRule,
        },
      });
    } catch (error) {
      console.error("Error updating conversion settings:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update conversion settings",
        message: error.message,
      });
    }
  }
);

// ==================== SCREEN 5: AUDIT TRAILS ====================

/**
 * @route   GET /api/admin/transactions/audit/logs
 * @desc    Get wallet audit trails
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} adminId - Filter by admin
 * @query   {string} userId - Filter by target user
 * @query   {string} action - Filter by action type
 * @query   {string} startDate - Start date
 * @query   {string} endDate - End date
 * @access  Admin
 */
router.get(
  "/audit/logs",
  adminAuth,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        page = 1,
        limit = 10,
        adminId,
        userId,
        action,
        startDate,
        endDate,
        search,
      } = req.query;

      // Build query
      const query = {};

      if (adminId) query.adminId = new mongoose.Types.ObjectId(adminId);
      if (userId) query.targetUserId = new mongoose.Types.ObjectId(userId);
      if (action) query.action = action;

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      // Search functionality - search in admin name, user name, or action
      if (search) {
        const searchRegex = new RegExp(search, "i");
        const adminUsers = await User.find({
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
          ],
        })
          .select("_id")
          .lean();

        const adminIds = adminUsers.map((u) => u._id);

        query.$or = [
          { action: searchRegex },
          { adminId: { $in: adminIds } },
          { targetUserId: { $in: adminIds } },
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [logs, total] = await Promise.all([
        WalletAuditLog.find(query)
          .populate("adminId", "firstName lastName email")
          .populate("targetUserId", "firstName lastName email")
          .populate("details.transactionId")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        WalletAuditLog.countDocuments(query),
      ]);

      // Format for frontend
      const formattedLogs = logs.map((log) => ({
        entryId: log._id,
        adminId: log.adminId?._id,
        adminName: log.adminId
          ? `${log.adminId.firstName} ${log.adminId.lastName}`
          : "Unknown",
        adminEmail: log.adminId?.email,
        action: log.action,
        targetUserId: log.targetUserId?._id,
        targetUserName: log.targetUserId
          ? `${log.targetUserId.firstName} ${log.targetUserId.lastName}`
          : "Unknown",
        targetUserEmail: log.targetUserId?.email,
        timestamp: log.createdAt,
        details: log.details,
      }));

      res.json({
        success: true,
        data: {
          logs: formattedLogs,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Error getting audit logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get audit logs",
      });
    }
  }
);

/**
 * @route   GET /api/admin/transactions/audit/actions
 * @desc    Get available action types for filtering
 * @access  Admin
 */
router.get("/audit/actions", adminAuth, async (req, res) => {
  try {
    const actions = [
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
    ];

    res.json({
      success: true,
      data: actions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get action types",
    });
  }
});

/**
 * @route   GET /api/admin/transactions/audit/filter-options
 * @desc    Get all unique admins and users for filter dropdowns
 * @access  Admin
 */
router.get("/audit/filter-options", adminAuth, async (req, res) => {
  try {
    // Get all unique admin IDs from audit logs
    const adminIds = await WalletAuditLog.distinct("adminId", {
      adminId: { $ne: null },
    });
    const admins = await User.find({ _id: { $in: adminIds } })
      .select("_id firstName lastName email")
      .lean();

    // Get all unique user IDs from audit logs
    const userIds = await WalletAuditLog.distinct("targetUserId", {
      targetUserId: { $ne: null },
    });
    const users = await User.find({ _id: { $in: userIds } })
      .select("_id firstName lastName email")
      .lean();

    res.json({
      success: true,
      data: {
        admins: admins.map((admin) => ({
          id: admin._id,
          name:
            `${admin.firstName || ""} ${admin.lastName || ""}`.trim() ||
            "Unknown",
          email: admin.email,
        })),
        users: users.map((user) => ({
          id: user._id,
          name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            "Unknown",
          email: user.email,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting filter options:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get filter options",
    });
  }
});

// ==================== ADDITIONAL UTILITIES ====================

/**
 * @route   GET /api/admin/transactions/types
 * @desc    Get transaction types for filtering
 * @access  Admin
 */
router.get("/meta/types", adminAuth, async (req, res) => {
  try {
    const types = [
      "credit",
      "debit",
      "reward",
      "xp",
      "redemption",
      "spin",
      "adjustment",
      "refund",
      "bonus",
      "penalty",
    ];

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get transaction types",
    });
  }
});

/**
 * @route   GET /api/admin/transactions/meta/statuses
 * @desc    Get transaction statuses for filtering
 * @access  Admin
 */
router.get("/meta/statuses", adminAuth, async (req, res) => {
  try {
    const statuses = [
      "pending",
      "completed",
      "failed",
      "rejected",
      "processing",
    ];

    res.json({
      success: true,
      data: statuses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get statuses",
    });
  }
});

module.exports = router;

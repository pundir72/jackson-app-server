const express = require("express");
const router = express.Router();
const { adminAuth } = require("../middleware/adminAuth");
const PayoutRequest = require("../models/PayoutRequest");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const TremendousOrder = require("../models/TremendousOrder");
const WalletAuditLog = require("../models/WalletAuditLog");
const tremendous = require("../utils/tremendous");
const {
  sendPayoutApprovedEmail,
  sendPayoutRejectedEmail,
} = require("../utils/email");

/**
 * Get all pending payout requests
 * GET /api/admin/payouts/pending
 */
router.get("/pending", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNum - 1) * pageSize;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const pendingRequests = await PayoutRequest.find({ status: "pending" })
      .populate("userId", "firstName lastName email profile")
      .sort(sortOptions)
      .skip(skip)
      .limit(pageSize)
      .lean();

    const total = await PayoutRequest.countDocuments({ status: "pending" });

    // Enrich with user details
    const enrichedRequests = await Promise.all(
      pendingRequests.map(async (request) => {
        const user = await User.findById(request.userId)
          .select("email firstName lastName profile")
          .lean();
        return {
          ...request,
          user: {
            id: user?._id,
            email: user?.email,
            firstName: user?.firstName || user?.profile?.firstName,
            lastName: user?.lastName || user?.profile?.lastName,
            name: `${user?.firstName || user?.profile?.firstName || ""} ${
              user?.lastName || user?.profile?.lastName || ""
            }`.trim(),
          },
        };
      })
    );

    res.json({
      success: true,
      data: {
        requests: enrichedRequests,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Error getting pending payout requests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get pending payout requests",
      error: error.message,
    });
  }
});

/**
 * Get all payout requests with filters
 * GET /api/admin/payouts
 */
router.get("/", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      userId,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNum - 1) * pageSize;

    const filter = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const requests = await PayoutRequest.find(filter)
      .populate("userId", "firstName lastName email profile")
      .populate("adminAction.adminId", "firstName lastName email")
      .sort(sortOptions)
      .skip(skip)
      .limit(pageSize)
      .lean();

    const total = await PayoutRequest.countDocuments(filter);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Error getting payout requests:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payout requests",
      error: error.message,
    });
  }
});

/**
 * Get single payout request by ID
 * GET /api/admin/payouts/:requestId
 */
router.get("/:requestId", adminAuth, async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await PayoutRequest.findById(requestId)
      .populate("userId", "firstName lastName email profile wallet")
      .populate("adminAction.adminId", "firstName lastName email")
      .lean();

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Payout request not found",
      });
    }

    res.json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Error getting payout request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get payout request",
      error: error.message,
    });
  }
});

/**
 * Approve payout request
 * POST /api/admin/payouts/:requestId/approve
 */
router.post("/:requestId/approve", adminAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const adminId = req.user.userId;
    const adminUser = await User.findById(adminId)
      .select("firstName lastName email")
      .lean();
    const adminName =
      `${adminUser?.firstName || ""} ${adminUser?.lastName || ""}`.trim() ||
      "Admin";

    const payoutRequest = await PayoutRequest.findById(requestId).populate(
      "userId",
      "firstName lastName email profile"
    );

    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Payout request not found",
      });
    }

    if (payoutRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot approve payout request. Current status: ${payoutRequest.status}`,
      });
    }

    // Mark as processing
    await payoutRequest.markProcessing();

    // Build Tremendous order payload
    const userId = payoutRequest.userId._id || payoutRequest.userId;
    const tremendousOrderPayload = {
      external_id: payoutRequest.metadata.externalId || userId.toString(),
      funding_source_id: payoutRequest.payment.fundingSourceId,
      reward: {
        value: {
          denomination: payoutRequest.reward.value.denomination,
          currency_code: payoutRequest.reward.value.currency_code,
        },
        delivery: {
          method: payoutRequest.reward.delivery.method,
        },
        recipient: {
          name: payoutRequest.reward.recipient.name,
          email: payoutRequest.reward.recipient.email,
        },
        products: payoutRequest.reward.products,
      },
    };

    if (payoutRequest.reward.recipient.phone) {
      tremendousOrderPayload.reward.recipient.phone =
        payoutRequest.reward.recipient.phone;
    }

    if (
      payoutRequest.reward.custom_fields &&
      payoutRequest.reward.custom_fields.length > 0
    ) {
      tremendousOrderPayload.reward.custom_fields =
        payoutRequest.reward.custom_fields;
    }

    if (payoutRequest.metadata.campaignId) {
      tremendousOrderPayload.campaign_id = payoutRequest.metadata.campaignId;
    }

    if (payoutRequest.metadata.invoiceId) {
      tremendousOrderPayload.invoice_id = payoutRequest.metadata.invoiceId;
    }

    // Add payment details if available
    if (
      payoutRequest.payment.subtotal !== undefined ||
      payoutRequest.payment.total !== undefined ||
      payoutRequest.payment.fees !== undefined ||
      payoutRequest.payment.channel
    ) {
      tremendousOrderPayload.payment = {};

      if (payoutRequest.payment.subtotal !== undefined) {
        tremendousOrderPayload.payment.subtotal =
          payoutRequest.payment.subtotal;
      }
      if (payoutRequest.payment.total !== undefined) {
        tremendousOrderPayload.payment.total = payoutRequest.payment.total;
      }
      if (payoutRequest.payment.fees !== undefined) {
        tremendousOrderPayload.payment.fees = payoutRequest.payment.fees;
      }
      if (payoutRequest.payment.channel) {
        tremendousOrderPayload.payment.channel = payoutRequest.payment.channel;
      }
    }

    // Create order with Tremendous
    const orderResult = await tremendous.createOrder(tremendousOrderPayload);

    if (!orderResult.success) {
      // Mark as failed and refund coins
      await payoutRequest.markFailed();
      const userIdForRefund = payoutRequest.userId._id || payoutRequest.userId;
      const user = await User.findById(userIdForRefund);
      if (user) {
        user.wallet.balance =
          (user.wallet.balance || 0) + payoutRequest.coinsDeducted;
        user.wallet.lastUpdated = new Date();
        await user.save();
      }

      return res.status(400).json({
        success: false,
        message: "Failed to create Tremendous order",
        error: orderResult.error || "Unknown error",
      });
    }

    const tremendousOrderId = orderResult.data.order.id;

    // Mark request as approved and completed
    await payoutRequest.approve(adminId, adminName);
    await payoutRequest.markCompleted(tremendousOrderId);

    // Create Tremendous order record
    const tremendousOrder = new TremendousOrder({
      tremendousOrderId: tremendousOrderId,
      externalId: payoutRequest.metadata.externalId || userId.toString(),
      userId: userId,
      status: orderResult.data.order.status || "PENDING",
      payment: {
        fundingSourceId: payoutRequest.payment.fundingSourceId,
        amount: payoutRequest.payment.amount,
        currency: payoutRequest.payment.currency,
        subtotal: payoutRequest.payment.subtotal,
        total: payoutRequest.payment.total,
        fees: payoutRequest.payment.fees,
        channel: payoutRequest.payment.channel,
      },
      reward: {
        value: {
          denomination: payoutRequest.reward.value.denomination,
          currency_code: payoutRequest.reward.value.currency_code,
        },
        delivery: {
          method: payoutRequest.reward.delivery.method,
          status: null,
        },
        recipient: {
          name: payoutRequest.reward.recipient.name,
          email: payoutRequest.reward.recipient.email,
          phone: payoutRequest.reward.recipient.phone,
        },
        products: payoutRequest.reward.products,
        custom_fields: payoutRequest.reward.custom_fields,
      },
      tremendousData: orderResult.data,
      metadata: {
        source: "app",
        campaignId: payoutRequest.metadata.campaignId,
        invoiceId: payoutRequest.metadata.invoiceId,
        payoutRequestId: payoutRequest._id.toString(),
      },
    });

    // Update transaction status
    await Transaction.findOneAndUpdate(
      { referenceId: payoutRequest._id.toString() },
      {
        status: "approved",
        referenceId: tremendousOrderId,
        tremendousOrderId: tremendousOrderId,
      }
    );

    await tremendousOrder.save();

    // Update user redemption tracking
    const user = await User.findById(userId);
    if (user) {
      if (!user.redemption) {
        user.redemption = {
          preference: payoutRequest.reward.delivery.method || "none",
          count: 0,
          totalCoinsRedeemed: 0,
        };
      }
      user.redemption.count = (user.redemption.count || 0) + 1;
      user.redemption.totalCoinsRedeemed =
        (user.redemption.totalCoinsRedeemed || 0) +
        (payoutRequest.coinsDeducted || 0);
      user.redemption.lastRedeemedAt = new Date();
      if (payoutRequest.reward.delivery.method) {
        user.redemption.preference = payoutRequest.reward.delivery.method;
      }
      await user.save();
    }

    // Log to audit trail
    try {
      await WalletAuditLog.logAction({
        adminId: adminId,
        targetUserId: userId,
        action: "APPROVE_REDEMPTION",
        details: {
          transactionId: payoutRequest._id,
          amount: payoutRequest.reward.value.denomination,
          balanceType: "cash",
          reason: `Payout approved via Tremendous. Order ID: ${tremendousOrderId}`,
        },
        metadata: {
          additionalData: {
            payoutRequestId: payoutRequest._id,
            tremendousOrderId,
            deliveryMethod: payoutRequest.reward.delivery.method,
          },
        },
      });
    } catch (auditError) {
      console.error("Error logging audit trail for approve:", auditError);
    }

    // Send approval email to user
    try {
      const user = await User.findById(userId)
        .select("email firstName profile")
        .lean();
      const userName = user?.firstName || user?.profile?.firstName || "User";
      const userEmail = user?.email || payoutRequest.reward.recipient.email;

      await sendPayoutApprovedEmail(
        userEmail,
        userName,
        payoutRequest.reward.value.denomination,
        payoutRequest.reward.value.currency_code,
        tremendousOrderId
      );
    } catch (emailError) {
      console.error("Error sending approval email:", emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      message: "Payout request approved and processed successfully",
      data: {
        requestId: payoutRequest._id,
        tremendousOrderId: tremendousOrderId,
        status: "completed",
        order: orderResult.data,
      },
    });
  } catch (error) {
    console.error("Error approving payout request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve payout request",
      error: error.message,
    });
  }
});

/**
 * Reject payout request
 * POST /api/admin/payouts/:requestId/reject
 */
router.post("/:requestId/reject", adminAuth, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;
    const adminId = req.user.userId;
    const adminUser = await User.findById(adminId)
      .select("firstName lastName email")
      .lean();
    const adminName =
      `${adminUser?.firstName || ""} ${adminUser?.lastName || ""}`.trim() ||
      "Admin";

    if (!reason || reason.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const payoutRequest = await PayoutRequest.findById(requestId).populate(
      "userId",
      "firstName lastName email profile"
    );

    if (!payoutRequest) {
      return res.status(404).json({
        success: false,
        message: "Payout request not found",
      });
    }

    if (payoutRequest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot reject payout request. Current status: ${payoutRequest.status}`,
      });
    }

    // Reject the request
    await payoutRequest.reject(adminId, adminName, reason.trim());

    // Refund coins to user
    const userId = payoutRequest.userId._id || payoutRequest.userId;
    const user = await User.findById(userId).select("wallet email firstName profile");
    if (user) {
      user.wallet.balance =
        (user.wallet.balance || 0) + payoutRequest.coinsDeducted;
      user.wallet.lastUpdated = new Date();
      await user.save();
    }

    // Update transaction status
    await Transaction.findOneAndUpdate(
      { referenceId: payoutRequest._id.toString() },
      {
        status: "rejected",
        description: `Payout request rejected - ${reason.trim()}`,
      }
    );

    // Log to audit trail
    try {
      await WalletAuditLog.logAction({
        adminId: adminId,
        targetUserId: userId,
        action: "REJECT_REDEMPTION",
        details: {
          transactionId: payoutRequest._id,
          amount: payoutRequest.reward.value.denomination,
          balanceType: "cash",
          reason: reason.trim(),
        },
        metadata: {
          additionalData: {
            payoutRequestId: payoutRequest._id,
            coinsRefunded: payoutRequest.coinsDeducted,
            deliveryMethod: payoutRequest.reward.delivery.method,
          },
        },
      });
    } catch (auditError) {
      console.error("Error logging audit trail for reject:", auditError);
    }

    // Send rejection email to recipient email (the email user provided in payout request)
    try {
      // Priority: Use recipient email from payout request (the email user provided)
      const recipientEmail = payoutRequest.reward?.recipient?.email;
      
      // Get recipient name from payout request
      const recipientName = 
        payoutRequest.reward?.recipient?.name ||
        user?.firstName || 
        user?.profile?.firstName || 
        payoutRequest.userId?.firstName ||
        "User";

      if (recipientEmail) {
        await sendPayoutRejectedEmail(
          recipientEmail, // Send to recipient email that user provided
          recipientName,
          payoutRequest.reward.value.denomination,
          payoutRequest.reward.value.currency_code,
          reason.trim() // Admin's rejection message
        );
        console.log(`✅ Rejection email sent to recipient ${recipientEmail} for payout request ${requestId}`);
      } else {
        // Fallback to user email if recipient email not found
        const fallbackEmail = user?.email || payoutRequest.userId?.email;
        if (fallbackEmail) {
          await sendPayoutRejectedEmail(
            fallbackEmail,
            recipientName,
            payoutRequest.reward.value.denomination,
            payoutRequest.reward.value.currency_code,
            reason.trim()
          );
          console.log(`✅ Rejection email sent to fallback email ${fallbackEmail} for payout request ${requestId}`);
        } else {
          console.warn(`⚠️ Could not send rejection email: No recipient email found for payout request ${requestId}`);
        }
      }
    } catch (emailError) {
      console.error("Error sending rejection email:", emailError);
      // Don't fail the request if email fails, but log the error
    }

    res.json({
      success: true,
      message: "Payout request rejected successfully",
      data: {
        requestId: payoutRequest._id,
        status: "rejected",
        reason: reason.trim(),
        coinsRefunded: payoutRequest.coinsDeducted,
      },
    });
  } catch (error) {
    console.error("Error rejecting payout request:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject payout request",
      error: error.message,
    });
  }
});

module.exports = router;

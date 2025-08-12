const Receipt = require('../models/Receipt');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { processReceiptOCR } = require('../services/receiptService');
const { sendNotification } = require('../services/notificationService');

// Scan receipt
const scanReceipt = async (req, res) => {
  try {
    const userId = req.user.id;
    const { storeName, amount, date, location } = req.body;
    const receiptImage = req.file;

    if (!receiptImage) {
      return res.status(400).json({
        success: false,
        message: 'Receipt image is required',
        statusCode: 400,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Process OCR
    const ocrData = await processReceiptOCR(receiptImage.path);
    const confidence = ocrData.confidence || 0.8;

    // Create receipt record
    const receipt = new Receipt({
      userId,
      storeName: storeName || ocrData.storeName,
      amount: parseFloat(amount) || ocrData.amount,
      currency: 'USD',
      purchaseDate: date ? new Date(date) : new Date(),
      items: ocrData.items || [],
      imageUrl: receiptImage.path,
      ocrData,
      location,
      isVipEligible: user.isVipActive(),
    });

    // Process OCR results
    await receipt.processOCR(ocrData, confidence);

    // If auto-approved, add to wallet
    if (receipt.status === 'approved') {
      const user = await User.findById(userId);
      await user.addPoints(receipt.pointsEarned);
      await user.addCashback(receipt.cashbackAmount);

      let wallet = await Wallet.findByUserId(userId);
      if (!wallet) {
        wallet = await Wallet.createForUser(userId);
      }
      await wallet.addFunds(receipt.cashbackAmount, 'receipt');

      // Send notification
      await sendNotification(userId, {
        type: 'receipt_approved',
        title: 'Receipt Approved!',
        message: `You earned ${receipt.pointsEarned} points and $${receipt.cashbackAmount} cashback!`,
        data: {
          receiptId: receipt._id,
          storeName: receipt.storeName,
          amount: receipt.amount,
          rewards: {
            points: receipt.pointsEarned,
            cashback: receipt.cashbackAmount,
          },
        },
      });
    }

    await receipt.save();

    res.status(200).json({
      success: true,
      message: 'Receipt scanned successfully',
      data: {
        receipt: {
          id: receipt._id,
          storeName: receipt.storeName,
          amount: receipt.amount,
          cashback: receipt.cashbackAmount,
          points: receipt.pointsEarned,
          status: receipt.status,
          imageUrl: receipt.imageUrl,
          createdAt: receipt.createdAt,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error scanning receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scan receipt',
      statusCode: 500,
    });
  }
};

// Get receipt history
const getReceiptHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, storeName, startDate, endDate } = req.query;
    const userId = req.user.id;
    const skip = (page - 1) * limit;

    const options = {};
    if (status) options.status = status;
    if (storeName) options.storeName = storeName;
    if (startDate && endDate) {
      options.startDate = startDate;
      options.endDate = endDate;
    }

    const receipts = await Receipt.findByUserId(userId, options)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Receipt.countDocuments({ userId, ...options });

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Receipt history retrieved successfully',
      data: {
        receipts,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting receipt history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve receipt history',
      statusCode: 500,
    });
  }
};

// Verify receipt
const verifyReceipt = async (req, res) => {
  try {
    const { receiptId } = req.params;
    const { action, reason } = req.body;
    const userId = req.user.id;

    const receipt = await Receipt.findById(receiptId);
    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found',
        statusCode: 404,
      });
    }

    if (action === 'approve') {
      await receipt.approve(userId, 'manual');
      
      // Add rewards to user
      const user = await User.findById(userId);
      await user.addPoints(receipt.pointsEarned);
      await user.addCashback(receipt.cashbackAmount);

      // Add to wallet
      let wallet = await Wallet.findByUserId(userId);
      if (!wallet) {
        wallet = await Wallet.createForUser(userId);
      }
      await wallet.addFunds(receipt.cashbackAmount, 'receipt');

      // Send notification
      await sendNotification(userId, {
        type: 'receipt_approved',
        title: 'Receipt Approved!',
        message: `You earned ${receipt.pointsEarned} points and $${receipt.cashbackAmount} cashback!`,
        data: {
          receiptId: receipt._id,
          storeName: receipt.storeName,
          amount: receipt.amount,
          rewards: {
            points: receipt.pointsEarned,
            cashback: receipt.cashbackAmount,
          },
        },
      });
    } else if (action === 'reject') {
      await receipt.reject(reason);
    }

    res.status(200).json({
      success: true,
      message: `Receipt ${action}d successfully`,
      data: {
        receipt: {
          id: receipt._id,
          status: receipt.status,
          cashback: receipt.cashbackAmount,
          points: receipt.pointsEarned,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error verifying receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify receipt',
      statusCode: 500,
    });
  }
};

// Get receipt statistics
const getReceiptStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [totalCashback, totalPoints] = await Promise.all([
      Receipt.getTotalCashback(userId),
      Receipt.getTotalPoints(userId),
    ]);

    const stats = {
      totalReceipts: await Receipt.countDocuments({ userId }),
      approvedReceipts: await Receipt.countDocuments({ userId, status: 'approved' }),
      pendingReceipts: await Receipt.countDocuments({ userId, status: 'pending' }),
      rejectedReceipts: await Receipt.countDocuments({ userId, status: 'rejected' }),
      totalCashback: totalCashback[0]?.total || 0,
      totalPoints: totalPoints[0]?.total || 0,
      averageReceiptAmount: await Receipt.aggregate([
        { $match: { userId: require('mongoose').Types.ObjectId(userId) } },
        { $group: { _id: null, average: { $avg: '$amount' } } }
      ]).then(result => result[0]?.average || 0),
    };

    res.status(200).json({
      success: true,
      message: 'Receipt statistics retrieved successfully',
      data: { stats },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting receipt statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve receipt statistics',
      statusCode: 500,
    });
  }
};

// Get receipt by ID
const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found',
        statusCode: 404,
      });
    }

    if (receipt.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        statusCode: 403,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Receipt retrieved successfully',
      data: { receipt },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting receipt by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve receipt',
      statusCode: 500,
    });
  }
};

// Delete receipt
const deleteReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const receipt = await Receipt.findById(id);
    if (!receipt) {
      return res.status(404).json({
        success: false,
        message: 'Receipt not found',
        statusCode: 404,
      });
    }

    if (receipt.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        statusCode: 403,
      });
    }

    await Receipt.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Receipt deleted successfully',
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error deleting receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete receipt',
      statusCode: 500,
    });
  }
};

module.exports = {
  scanReceipt,
  getReceiptHistory,
  verifyReceipt,
  getReceiptStats,
  getReceiptById,
  deleteReceipt,
}; 
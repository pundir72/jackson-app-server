const Wallet = require('../models/Wallet');
const User = require('../models/User');
const logger = require('../utils/logger');
const { sendNotification } = require('../services/notificationService');

// Get wallet balance
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }

    const user = await User.findById(userId);
    const pointsValue = user.totalPoints * 0.01; // 1 point = $0.01

    const balance = {
      totalCashback: wallet.balance,
      pendingCashback: wallet.pendingBalance,
      availableForWithdrawal: wallet.getAvailableBalance(),
      totalPoints: user.totalPoints,
      pointsValue: parseFloat(pointsValue.toFixed(2)),
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
    };

    res.status(200).json({
      success: true,
      message: 'Balance retrieved successfully',
      data: { balance },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting wallet balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet balance',
      statusCode: 500,
    });
  }
};

// Get wallet transactions
const getWalletTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status, startDate, endDate } = req.query;
    const userId = req.user.id;
    const skip = (page - 1) * limit;

    // This would typically come from a separate transactions collection
    // For now, we'll return a mock response
    const transactions = [
      {
        id: 1,
        type: 'cashback',
        description: 'Challenge completion reward',
        amount: 2.50,
        status: 'completed',
        createdAt: new Date(),
      },
    ];

    const pagination = {
      currentPage: parseInt(page),
      totalPages: 1,
      totalItems: transactions.length,
      itemsPerPage: parseInt(limit),
      hasNextPage: false,
      hasPrevPage: false,
    };

    res.status(200).json({
      success: true,
      message: 'Transactions retrieved successfully',
      data: {
        transactions,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting wallet transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet transactions',
      statusCode: 500,
    });
  }
};

// Withdraw funds
const withdrawFunds = async (req, res) => {
  try {
    const { amount, paymentMethod, accountDetails } = req.body;
    const userId = req.user.id;

    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }

    // Validate withdrawal amount
    if (!wallet.canWithdraw(amount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal amount is $${wallet.withdrawalSettings.minimumWithdrawal}`,
        statusCode: 400,
      });
    }

    // Process withdrawal
    await wallet.withdrawFunds(amount);

    // Send notification
    await sendNotification(userId, {
      type: 'withdrawal_requested',
      title: 'Withdrawal Request Submitted',
      message: `Your withdrawal request for $${amount} has been submitted.`,
      data: {
        amount,
        paymentMethod,
        status: 'pending',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      data: {
        amount,
        paymentMethod,
        newBalance: wallet.balance,
        status: 'pending',
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error withdrawing funds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process withdrawal',
      statusCode: 500,
    });
  }
};

// Add funds
const addFunds = async (req, res) => {
  try {
    const { amount, source } = req.body;
    const userId = req.user.id;

    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }

    await wallet.addFunds(amount, source);

    res.status(200).json({
      success: true,
      message: 'Funds added successfully',
      data: {
        amount,
        source,
        newBalance: wallet.balance,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error adding funds:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add funds',
      statusCode: 500,
    });
  }
};

// Update wallet settings
const updateWalletSettings = async (req, res) => {
  try {
    const { withdrawalSettings, securitySettings } = req.body;
    const userId = req.user.id;

    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }

    if (withdrawalSettings) {
      wallet.withdrawalSettings = { ...wallet.withdrawalSettings, ...withdrawalSettings };
    }

    if (securitySettings) {
      wallet.securitySettings = { ...wallet.securitySettings, ...securitySettings };
    }

    await wallet.save();

    res.status(200).json({
      success: true,
      message: 'Wallet settings updated successfully',
      data: { wallet },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error updating wallet settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update wallet settings',
      statusCode: 500,
    });
  }
};

// Get wallet statistics
const getWalletStats = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }

    const stats = {
      totalEarned: wallet.totalEarned,
      totalWithdrawn: wallet.totalWithdrawn,
      currentBalance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      availableForWithdrawal: wallet.getAvailableBalance(),
      averageMonthlyEarnings: wallet.totalEarned / Math.max(1, Math.floor((Date.now() - wallet.createdAt) / (1000 * 60 * 60 * 24 * 30))),
      withdrawalCount: wallet.paymentHistory?.length || 0,
    };

    res.status(200).json({
      success: true,
      message: 'Wallet statistics retrieved successfully',
      data: { stats },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting wallet statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve wallet statistics',
      statusCode: 500,
    });
  }
};

module.exports = {
  getWalletBalance,
  getWalletTransactions,
  withdrawFunds,
  addFunds,
  updateWalletSettings,
  getWalletStats,
}; 
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Withdrawal configuration
const WITHDRAWAL_CONFIG = {
  minAmount: 20, // $20 minimum
  maxAmount: 1000, // $1000 maximum
  supportedMethods: ['paypal', 'gpay', 'upi', 'bank_transfer', 'card'],
  processingFees: {
    paypal: 0.02, // 2%
    gpay: 0.015, // 1.5%
    upi: 0.01, // 1%
    bank_transfer: 0.005, // 0.5%
    card: 0.03 // 3%
  },
  conversionRate: 0.01 // 1 coin = $0.01
};

// Get withdrawal methods
router.get('/methods', protect, async (req, res) => {
  try {
    const methods = WITHDRAWAL_CONFIG.supportedMethods.map(method => ({
      id: method,
      name: getMethodName(method),
      icon: getMethodIcon(method),
      processingFee: WITHDRAWAL_CONFIG.processingFees[method],
      minAmount: WITHDRAWAL_CONFIG.minAmount,
      maxAmount: WITHDRAWAL_CONFIG.maxAmount,
      available: true
    }));

    res.json({
      success: true,
      data: {
        methods,
        minAmount: WITHDRAWAL_CONFIG.minAmount,
        maxAmount: WITHDRAWAL_CONFIG.maxAmount,
        conversionRate: WITHDRAWAL_CONFIG.conversionRate
      }
    });
  } catch (error) {
    console.error('Error getting withdrawal methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get withdrawal methods'
    });
  }
});

// Check withdrawal eligibility
router.get('/eligibility', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('wallet');
    
    const coinBalance = user.wallet.balance || 0;
    const usdBalance = coinBalance * WITHDRAWAL_CONFIG.conversionRate;
    
    const isEligible = usdBalance >= WITHDRAWAL_CONFIG.minAmount;
    
    res.json({
      success: true,
      data: {
        isEligible,
        coinBalance,
        usdBalance: usdBalance.toFixed(2),
        minRequired: WITHDRAWAL_CONFIG.minAmount,
        shortfall: isEligible ? 0 : (WITHDRAWAL_CONFIG.minAmount - usdBalance).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error checking withdrawal eligibility:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check withdrawal eligibility'
    });
  }
});

// Create withdrawal request
router.post('/request', protect, async (req, res) => {
  try {
    const { method, amount, paymentDetails } = req.body;
    
    if (!method || !amount || !paymentDetails) {
      return res.status(400).json({
        success: false,
        error: 'Method, amount, and payment details are required'
      });
    }

    if (!WITHDRAWAL_CONFIG.supportedMethods.includes(method)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported withdrawal method'
      });
    }

    const user = await User.findById(req.user.userId).select('wallet');
    const coinBalance = user.wallet.balance || 0;
    const usdBalance = coinBalance * WITHDRAWAL_CONFIG.conversionRate;
    
    if (usdBalance < WITHDRAWAL_CONFIG.minAmount) {
      return res.status(400).json({
        success: false,
        error: `Minimum withdrawal amount is $${WITHDRAWAL_CONFIG.minAmount}`,
        data: {
          currentBalance: usdBalance.toFixed(2),
          minRequired: WITHDRAWAL_CONFIG.minAmount,
          shortfall: (WITHDRAWAL_CONFIG.minAmount - usdBalance).toFixed(2)
        }
      });
    }

    if (amount < WITHDRAWAL_CONFIG.minAmount || amount > WITHDRAWAL_CONFIG.maxAmount) {
      return res.status(400).json({
        success: false,
        error: `Amount must be between $${WITHDRAWAL_CONFIG.minAmount} and $${WITHDRAWAL_CONFIG.maxAmount}`
      });
    }

    // Calculate required coins
    const requiredCoins = Math.ceil(amount / WITHDRAWAL_CONFIG.conversionRate);
    
    if (coinBalance < requiredCoins) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient coin balance'
      });
    }

    // Calculate processing fee
    const processingFee = amount * WITHDRAWAL_CONFIG.processingFees[method];
    const netAmount = amount - processingFee;

    // Create withdrawal request
    const withdrawalId = `WD-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    
    const withdrawal = {
      id: withdrawalId,
      method,
      amount,
      netAmount,
      processingFee,
      requiredCoins,
      paymentDetails: sanitizePaymentDetails(paymentDetails),
      status: 'pending',
      createdAt: new Date()
    };

    // Store withdrawal in user's data
    if (!user.withdrawals) {
      user.withdrawals = [];
    }
    
    user.withdrawals.push(withdrawal);

    // Create transaction record
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'debit',
      amount: requiredCoins,
      description: `Withdrawal request - $${amount} via ${method}`,
      status: 'pending',
      referenceId: withdrawalId
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        withdrawalId,
        method,
        amount,
        netAmount,
        processingFee,
        requiredCoins,
        status: 'pending',
        message: 'Withdrawal request submitted successfully!'
      }
    });
  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create withdrawal request'
    });
  }
});

// Process withdrawal (admin function)
router.post('/process', protect, async (req, res) => {
  try {
    const { withdrawalId, action } = req.body; // action: 'approve' or 'reject'
    
    if (!withdrawalId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal ID and action are required'
      });
    }

    // Find user with withdrawal
    const user = await User.findOne({
      'withdrawals.id': withdrawalId
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    const withdrawal = user.withdrawals.find(w => w.id === withdrawalId);
    
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal already processed'
      });
    }

    if (action === 'approve') {
      // Deduct coins from wallet
      user.wallet.balance -= withdrawal.requiredCoins;
      user.wallet.lastUpdated = new Date();
      
      // Update redemption tracking
      if (!user.redemption) {
        user.redemption = {
          preference: withdrawal.method || 'none',
          count: 0,
          totalCoinsRedeemed: 0
        };
      }
      user.redemption.count = (user.redemption.count || 0) + 1;
      user.redemption.totalCoinsRedeemed = (user.redemption.totalCoinsRedeemed || 0) + withdrawal.requiredCoins;
      user.redemption.lastRedeemedAt = new Date();
      user.redemption.preference = withdrawal.method || user.redemption.preference || 'none';
      
      // Update withdrawal status
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
      
      // Update transaction status
      await Transaction.findOneAndUpdate(
        { referenceId: withdrawalId },
        { status: 'completed' }
      );

      await user.save();

      res.json({
        success: true,
        data: {
          withdrawalId,
          status: 'approved',
          message: 'Withdrawal approved and processed successfully!'
        }
      });
    } else if (action === 'reject') {
      // Update withdrawal status
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();
      
      // Update transaction status
      await Transaction.findOneAndUpdate(
        { referenceId: withdrawalId },
        { status: 'failed' }
      );

      await user.save();

      res.json({
        success: true,
        data: {
          withdrawalId,
          status: 'rejected',
          message: 'Withdrawal rejected'
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid action. Use "approve" or "reject"'
      });
    }
  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process withdrawal'
    });
  }
});

// Get withdrawal history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const user = await User.findById(req.user.userId).select('withdrawals');
    
    if (!user.withdrawals) {
      return res.json({
        success: true,
        data: {
          withdrawals: [],
          pagination: {
            page: 1,
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        }
      });
    }

    const withdrawals = user.withdrawals
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);

    const total = user.withdrawals.length;

    res.json({
      success: true,
      data: {
        withdrawals: withdrawals.map(w => ({
          id: w.id,
          method: w.method,
          amount: w.amount,
          netAmount: w.netAmount,
          processingFee: w.processingFee,
          status: w.status,
          createdAt: w.createdAt,
          processedAt: w.processedAt
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting withdrawal history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get withdrawal history'
    });
  }
});

// Helper functions
function getMethodName(method) {
  const names = {
    paypal: 'PayPal',
    gpay: 'Google Pay',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
    card: 'Credit/Debit Card'
  };
  return names[method] || method;
}

function getMethodIcon(method) {
  const icons = {
    paypal: '💳',
    gpay: '📱',
    upi: '🏦',
    bank_transfer: '🏛️',
    card: '💳'
  };
  return icons[method] || '💰';
}

function sanitizePaymentDetails(details) {
  // Remove sensitive information and keep only necessary fields
  const sanitized = { ...details };
  
  // Remove sensitive fields
  delete sanitized.cvv;
  delete sanitized.cvc;
  delete sanitized.securityCode;
  
  // Mask card numbers
  if (sanitized.cardNumber) {
    sanitized.cardNumber = sanitized.cardNumber.replace(/\d(?=\d{4})/g, '*');
  }
  
  return sanitized;
}

module.exports = router;



const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const validateTransaction = require('../middleware/transaction');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

// Middleware to get user wallet
const getUserWallet = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId).select('wallet');
        req.userWallet = user.wallet;
        next();
    } catch (error) {
        next(error);
    }
};

// Get wallet balance
router.get('/balance', [protect, getUserWallet], (req, res, next) => {
    try {
        res.json({ balance: req.userWallet.balance });
    } catch (error) {
        next(error);
    }
});

// Get wallet transactions
router.get('/transactions', [protect], async (req, res, next) => {
    try {
        const transactions = await Transaction.find({
            user: req.user.userId
        }).sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        next(error);
    }
});

// Add funds to wallet
router.post('/add-funds', [protect, validateTransaction], async (req, res, next) => {
    try {
        const { amount } = req.body;
        
        // Create transaction
        const transaction = new Transaction({
            user: req.user.userId,
            type: 'credit',
            amount,
            description: 'Added funds to wallet'
        });
        
        // Update user wallet
        const user = await User.findById(req.user.userId);
        user.wallet.balance += amount;
        user.wallet.lastUpdated = new Date();
        
        await Promise.all([
            transaction.save(),
            user.save()
        ]);
        
        res.json({
            message: 'Funds added successfully',
            balance: user.wallet.balance,
            transaction
        });
    } catch (error) {
        next(error);
    }
});

// Withdraw funds from wallet
router.post('/withdraw', [protect, validateTransaction], async (req, res, next) => {
    try {
        const { amount } = req.body;
        const user = await User.findById(req.user.userId);
        
        if (user.wallet.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Create transaction
        const transaction = new Transaction({
            user: req.user.userId,
            type: 'debit',
            amount,
            description: 'Withdrawal from wallet'
        });
        
        // Update user wallet
        user.wallet.balance -= amount;
        user.wallet.lastUpdated = new Date();
        
        await Promise.all([
            transaction.save(),
            user.save()
        ]);
        
        res.json({
            message: 'Withdrawal successful',
            balance: user.wallet.balance,
            transaction
        });
    } catch (error) {
        next(error);
    }
});

// Transfer funds to another user
router.post('/transfer', [protect, validateTransaction], async (req, res, next) => {
    try {
        const { amount, recipientId } = req.body;
        
        // Validate recipient
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(400).json({ message: 'Recipient not found' });
        }
        
        // Validate sender balance
        const sender = await User.findById(req.user.userId);
        if (sender.wallet.balance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }
        
        // Create transactions
        const senderTransaction = new Transaction({
            user: req.user.userId,
            type: 'debit',
            amount,
            description: `Transfer to ${recipient.firstName}`
        });
        
        const recipientTransaction = new Transaction({
            user: recipientId,
            type: 'credit',
            amount,
            description: `Transfer from ${sender.firstName}`
        });
        
        // Update wallets
        sender.wallet.balance -= amount;
        recipient.wallet.balance += amount;
        
        sender.wallet.lastUpdated = new Date();
        recipient.wallet.lastUpdated = new Date();
        
        await Promise.all([
            senderTransaction.save(),
            recipientTransaction.save(),
            sender.save(),
            recipient.save()
        ]);
        
        res.json({
            message: 'Transfer successful',
            senderTransaction,
            recipientTransaction
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;

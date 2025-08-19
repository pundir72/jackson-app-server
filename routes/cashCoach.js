const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

// Get cash coach dashboard
router.get('/dashboard', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('cashCoach wallet');
        res.json({
            goals: user.cashCoach.goals,
            receipts: user.cashCoach.receipts,
            revenueGoal: user.cashCoach.revenueGoal,
            currentBalance: user.wallet.balance
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create new goal
router.post('/goals', protect, async (req, res) => {
    try {
        const { amount, startDate, endDate } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        // Add new goal
        user.cashCoach.goals.push({
            id: Date.now().toString(),
            amount,
            status: 'active',
            startDate,
            endDate
        });
        
        await user.save();
        
        res.json({
            message: 'Goal created successfully',
            goal: user.cashCoach.goals[user.cashCoach.goals.length - 1]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update goal status
router.put('/goals/:id', protect, async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;
        
        const user = await User.findById(req.user.userId);
        
        // Find and update goal
        const goalIndex = user.cashCoach.goals.findIndex(g => g.id === id);
        if (goalIndex === -1) {
            return res.status(404).json({ message: 'Goal not found' });
        }
        
        user.cashCoach.goals[goalIndex].status = status;
        await user.save();
        
        res.json({
            message: 'Goal updated successfully',
            goal: user.cashCoach.goals[goalIndex]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Upload receipt
router.post('/receipts', protect, async (req, res) => {
    try {
        const { amount } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        // Add new receipt
        user.cashCoach.receipts.push({
            id: Date.now().toString(),
            amount,
            status: 'processing',
            date: new Date()
        });
        
        await user.save();
        
        res.json({
            message: 'Receipt uploaded successfully',
            receipt: user.cashCoach.receipts[user.cashCoach.receipts.length - 1]
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update revenue goal
router.put('/revenue-goal', protect, async (req, res) => {
    try {
        const { amount } = req.body;
        
        const user = await User.findById(req.user.userId);
        user.cashCoach.revenueGoal = amount;
        await user.save();
        
        res.json({
            message: 'Revenue goal updated successfully',
            revenueGoal: user.cashCoach.revenueGoal
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

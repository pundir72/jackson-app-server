const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

// Get VIP status
router.get('/status', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('vip');
        res.json(user.vip);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Upgrade VIP tier
router.post('/upgrade', protect, async (req, res) => {
    try {
        const { tier } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        // Validate tier
        const validTiers = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'];
        if (!validTiers.includes(tier)) {
            return res.status(400).json({ message: 'Invalid VIP tier' });
        }
        
        // Update VIP status
        user.vip.level = tier;
        user.vip.expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
        
        await user.save();
        
        res.json({
            message: 'VIP tier upgraded successfully',
            vip: user.vip
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get VIP benefits
router.get('/benefits', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('vip');
        res.json(user.vip.benefits);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

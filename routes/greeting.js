const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

// Get greeting and wallet balance for homepage header
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('firstName profile wallet');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Generate personalized greeting
        const greeting = generateGreeting(user.firstName);
        
        // Get wallet balance
        const walletBalance = user.wallet?.balance || 0;
        const currency = user.wallet?.currency || 'coins';
        
        // Get avatar
        const avatarUrl = user.profile?.avatar || 'default-avatar.png';

        res.json({
            success: true,
            data: {
                greeting: {
                    text: greeting,
                    subtext: 'Welcome Back'
                },
                user: {
                    first_name: user.firstName || 'there',
                    avatar_url: avatarUrl
                },
                wallet: {
                    balance: walletBalance,
                    currency: currency,
                    display_text: `${walletBalance} ${currency === 'coins' ? '🪙' : currency}`
                }
            }
        });
    } catch (error) {
        console.error('Greeting fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch greeting data',
            message: 'Please try again later.'
        });
    }
});

// Get just the greeting text
router.get('/text', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('firstName');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const greeting = generateGreeting(user.firstName);

        res.json({
            success: true,
            data: {
                greeting: greeting,
                first_name: user.firstName || 'there'
            }
        });
    } catch (error) {
        console.error('Greeting text fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch greeting text'
        });
    }
});

// Get just the wallet balance
router.get('/wallet', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('wallet');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const walletBalance = user.wallet?.balance || 0;
        const currency = user.wallet?.currency || 'coins';

        res.json({
            success: true,
            data: {
                balance: walletBalance,
                currency: currency,
                display_text: `${walletBalance} ${currency === 'coins' ? '🪙' : currency}`
            }
        });
    } catch (error) {
        console.error('Wallet balance fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch wallet balance'
        });
    }
});

// Helper function to generate personalized greeting
function generateGreeting(firstName) {
    const now = new Date();
    const hour = now.getHours();
    
    const name = firstName || 'there';
    
    if (hour >= 5 && hour < 12) {
        return `Good morning, ${name}! 👋`;
    } else if (hour >= 12 && hour < 18) {
        return `Good afternoon, ${name}! 👋`;
    } else if (hour >= 18 && hour < 22) {
        return `Good evening, ${name}! 👋`;
    } else {
        return `Hi ${name}! 👋`;
    }
}

module.exports = router;


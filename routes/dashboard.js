const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

// Get dashboard data
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('firstName lastName profile vip wallet xp games surveys races onboarding');

        // Calculate dashboard stats
        const stats = {
            // Wallet stats
            balance: user.wallet?.balance || 0,
            currency: user.wallet?.currency || 'coins',

            // XP stats
            currentXP: user.xp?.current || 0,
            tier: user.xp?.tier || 1,
            streak: user.xp?.streak || 0,

            // VIP status
            vipLevel: user.vip?.level || 'BRONZE',
            vipExpires: user.vip?.expires,

            // Progress stats
            onboardingCompleted: user.onboarding?.completed || false,
            gamesPlayed: user.games?.filter(g => g.completed).length || 0,
            surveysCompleted: user.surveys?.filter(s => s.completed).length || 0,
            racesCompleted: user.races?.filter(r => r.completed).length || 0
        };

        res.json({
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                avatar: user.profile?.avatar,
                status: user.profile?.status,
                theme: user.profile?.theme
            },
            stats,
            vip: {
                level: user.vip?.level,
                expires: user.vip?.expires,
                benefits: user.vip?.benefits
            }
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

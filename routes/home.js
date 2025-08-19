const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Deals = require('../models/Deals');
const { Reward, DailyReward } = require('../models/Rewards');
const analytics = require('../utils/analytics');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const auth = async (req, res, next) => {
    try {
        // Try to get token from x-auth-token header first
        let token = req.header('x-auth-token');
        
        // If not found, try Authorization header (Bearer token)
        if (!token) {
            token = req.header('Authorization');
            if (token && token.startsWith('Bearer ')) {
                token = token.replace('Bearer ', '');
            }
        }
        
        // Also try to get token from query params or body as fallback
        if (!token) {
            token = req.query.token || req.body.token;
        }
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Authentication required',
                details: 'No token provided' 
            });
        }

        // Verify token
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (!decoded.userId) {
                return res.status(401).json({ 
                    error: 'Invalid authentication',
                    details: 'Invalid token format' 
                });
            }

            // Find user
            const user = await User.findById(decoded.userId);
            if (!user) {
                return res.status(401).json({ 
                    error: 'Invalid authentication',
                    details: 'User not found' 
                });
            }

            req.user = user;
            next();
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return res.status(401).json({ 
                error: 'Invalid authentication',
                details: 'Invalid or expired token' 
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
};

// Get homepage data
router.get('/', auth, async (req, res) => {
    try {
        const user = req.user;
        
        // Update last login streak
        await updateStreak(user);
        
        // Get most played games
        const mostPlayedGames = await getMostPlayedGames(user);
        
        // Get active tasks
        const activeTasks = await getActiveTasks(user);
        
        // Get active surveys
        const activeSurveys = await getActiveSurveys(user);
        
        // Get active races
        const activeRaces = await getActiveRaces(user);
        
        // Get VIP status and benefits
        const vipStatus = await getVIPStatus(user);
        
        res.status(200).json({
            greeting: getGreeting(user),
            wallet: {
                balance: user.wallet.balance,
                lastUpdated: user.wallet.lastUpdated
            },
            xp: {
                current: user.xp.current,
                total: user.xp.total,
                level: user.xp.level,
                tier: user.xp.tier,
                streak: user.xp.streak
            },
            mostPlayedGames,
            activeTasks,
            activeSurveys,
            activeRaces,
            vip: vipStatus,
            preferences: user.preferences
        });
    } catch (error) {
        console.error('Error fetching homepage data:', error);
        await analytics.log('homepage_error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch homepage data' });
    }
});

// Helper functions

// Update streak
const updateStreak = async (user) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    if (!user.xp.streak.lastUpdated || user.xp.streak.lastUpdated < yesterday) {
        if (user.xp.streak.current > 0) {
            await User.findByIdAndUpdate(user._id, {
                $inc: { 'xp.streak.current': 1 },
                $set: {
                    'xp.streak.lastUpdated': today
                }
            });
        } else {
            await User.findByIdAndUpdate(user._id, {
                $set: {
                    'xp.streak.current': 1,
                    'xp.streak.lastUpdated': today
                }
            });
        }
    }
};

// Get most played games
const getMostPlayedGames = async (user) => {
    return user.games
        .sort((a, b) => b.playCount - a.playCount)
        .slice(0, 5)
        .map(game => ({
            gameId: game.gameId,
            name: game.name,
            icon: game.icon,
            playCount: game.playCount,
            totalEarnings: game.totalEarnings
        }));
};

// Get active tasks
const getActiveTasks = async (user) => {
    return user.tasks
        .filter(task => task.status !== 'completed' && 
                 (!task.expiresAt || task.expiresAt > new Date()))
        .map(task => ({
            id: task.id,
            type: task.type,
            status: task.status,
            reward: task.reward,
            expiresAt: task.expiresAt
        }));
};

// Get active surveys
const getActiveSurveys = async (user) => {
    return user.surveys
        .filter(survey => survey.status === 'available' && 
                 (!survey.lastCompleted || 
                  new Date() - survey.lastCompleted > 24 * 60 * 60 * 1000))
        .map(survey => ({
            provider: survey.provider,
            status: survey.status,
            reward: survey.reward
        }));
};

// Get active races
const getActiveRaces = async (user) => {
    return user.races
        .filter(race => race.status === 'active' && 
                 race.startTime < new Date() && 
                 race.endTime > new Date())
        .map(race => ({
            id: race.id,
            status: race.status,
            startTime: race.startTime,
            endTime: race.endTime,
            position: race.position,
            rewards: race.rewards
        }));
};

// Get VIP status
const getVIPStatus = async (user) => {
    const now = new Date();
    const isActive = user.vip.status && (!user.vip.expiresAt || user.vip.expiresAt > now);
    
    return {
        status: isActive,
        tier: user.vip.tier,
        expiresAt: user.vip.expiresAt,
        benefits: user.vip.benefits
    };
};

// Get greeting
const getGreeting = (user) => {
    const now = new Date();
    const hour = now.getHours();
    
    if (hour >= 5 && hour < 12) return `Good morning, ${user.firstName}!`;
    if (hour >= 12 && hour < 18) return `Good afternoon, ${user.firstName}!`;
    if (hour >= 18 && hour < 22) return `Good evening, ${user.firstName}!`;
    return `Hi ${user.firstName}!`;
};

// Get daily challenges
router.get('/daily-challenges', auth, async (req, res) => {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of day

        // Get completed challenges
        const completedChallenges = user.challenges?.filter(challenge => {
            const challengeDate = new Date(challenge.date);
            return challengeDate.getTime() === today.getTime() && challenge.completed;
        }) || [];

        // Get available challenges for today
        const availableChallenges = await getAvailableChallenges(today);

        // Calculate streak
        const streak = await calculateStreak(user);

        res.status(200).json({
            completed: completedChallenges,
            available: availableChallenges,
            streak,
            rewards: {
                coins: calculateRewardCoins(completedChallenges.length),
                xp: calculateRewardXP(completedChallenges.length)
            }
        });
    } catch (error) {
        console.error('Error fetching daily challenges:', error);
        await analytics.log('daily_challenges_error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch daily challenges' });
    }
});

// Helper functions for daily challenges

async function getAvailableChallenges(date) {
    // This would typically fetch from a challenges collection or master data
    // For now, returning sample challenges
    return [
        {
            id: 'challenge1',
            title: 'Play 3 games',
            description: 'Complete 3 games today',
            type: 'game',
            target: 3,
            reward: {
                coins: 50,
                xp: 100
            }
        },
        {
            id: 'challenge2',
            title: 'Complete survey',
            description: 'Complete any survey today',
            type: 'survey',
            target: 1,
            reward: {
                coins: 100,
                xp: 200
            }
        },
        {
            id: 'challenge3',
            title: 'Daily login',
            description: 'Login to the app',
            type: 'login',
            target: 1,
            reward: {
                coins: 20,
                xp: 50
            }
        }
    ];
}

function calculateStreak(user) {
    if (!user.challenges?.length) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let streak = 0;
    let currentDay = today;
    
    while (streak < user.challenges.length) {
        const challengesForDay = user.challenges.filter(challenge => {
            const challengeDate = new Date(challenge.date);
            return challengeDate.getTime() === currentDay.getTime();
        });
        
        if (challengesForDay.some(challenge => challenge.completed)) {
            streak++;
        } else {
            break;
        }
        
        currentDay.setDate(currentDay.getDate() - 1);
    }
    
    return streak;
}

function calculateRewardCoins(completedCount) {
    // Simple reward calculation - can be made more complex
    return completedCount * 50;
}

function calculateRewardXP(completedCount) {
    // Simple reward calculation - can be made more complex
    return completedCount * 100;
}

// Get deals
router.get('/deals', auth, async (req, res) => {
    try {
        const user = req.user;
        const today = new Date();
        
        // Get all active deals
        const deals = await Deals.find({
            active: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        }).sort({ createdAt: -1 });

        // Filter deals based on user's VIP status
        const filteredDeals = deals.filter(deal => {
            if (!deal.vipOnly) return true;
            return user.vip?.level && user.vip.level !== 'BRONZE';
        });

        res.status(200).json({
            deals: filteredDeals.map(deal => ({
                id: deal._id,
                title: deal.title,
                description: deal.description,
                type: deal.type,
                imageUrl: deal.imageUrl,
                reward: deal.reward,
                requirements: deal.requirements,
                vipOnly: deal.vipOnly,
                active: deal.active,
                startDate: deal.startDate,
                endDate: deal.endDate
            })),
            total: filteredDeals.length
        });
    } catch (error) {
        console.error('Error fetching deals:', error);
        await analytics.log('deals_error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

// Get daily rewards
router.get('/daily-rewards', auth, async (req, res) => {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of day

        // Check if today's reward has been claimed
        const dailyReward = await DailyReward.findOne({
            userId: user._id,
            date: today
        });

        // Get active daily rewards
        const rewards = await Reward.find({
            type: 'daily',
            active: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        }).sort({ createdAt: -1 });

        // Filter rewards based on VIP status
        const filteredRewards = rewards.filter(reward => {
            if (!reward.vipOnly) return true;
            return user.vip?.level && user.vip.level !== 'BRONZE';
        });

        res.status(200).json({
            rewards: filteredRewards.map(reward => ({
                id: reward._id,
                title: reward.title,
                description: reward.description,
                imageUrl: reward.imageUrl,
                reward: reward.reward,
                requirements: reward.requirements,
                vipOnly: reward.vipOnly,
                active: reward.active,
                startDate: reward.startDate,
                endDate: reward.endDate
            })),
            claimed: dailyReward?.claimed || false,
            total: filteredRewards.length
        });
    } catch (error) {
        console.error('Error fetching daily rewards:', error);
        await analytics.log('daily_rewards_error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to fetch daily rewards' });
    }
});

// Claim daily reward
router.post('/daily-rewards/claim', auth, async (req, res) => {
    try {
        const user = req.user;
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of day

        // Check if reward has already been claimed
        const existingReward = await DailyReward.findOne({
            userId: user._id,
            date: today
        });

        if (existingReward?.claimed) {
            return res.status(400).json({
                error: 'Daily reward already claimed'
            });
        }

        // Get active daily rewards
        const rewards = await Reward.find({
            type: 'daily',
            active: true,
            startDate: { $lte: today },
            endDate: { $gte: today }
        });

        if (!rewards.length) {
            return res.status(404).json({
                error: 'No active daily rewards available'
            });
        }

        // Get the first available reward (can be modified to select based on criteria)
        const reward = rewards[0];

        // Update user's wallet and XP
        await User.findByIdAndUpdate(
            user._id,
            {
                $inc: {
                    'wallet.balance': reward.reward.coins,
                    'xp.current': reward.reward.xp
                }
            },
            { new: true }
        );

        // Create or update daily reward record
        const dailyReward = await DailyReward.findOneAndUpdate(
            { userId: user._id, date: today },
            {
                $set: {
                    claimed: true,
                    reward: reward.reward
                }
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            message: 'Daily reward claimed successfully',
            reward: {
                coins: reward.reward.coins,
                xp: reward.reward.xp,
                benefits: reward.reward.benefits
            }
        });
    } catch (error) {
        console.error('Error claiming daily reward:', error);
        await analytics.log('daily_reward_claim_error', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: 'Failed to claim daily reward' });
    }
});

module.exports = router;

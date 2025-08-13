const express = require('express');
const router = express.Router();
const User = require('../models/User');
const analytics = require('../utils/analytics');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.userId);
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid authentication' });
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

module.exports = router;

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const config = require('../config/config');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/avatars');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage });

// Get user profile
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('firstName lastName profile');
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Update profile
router.put('/', protect, async (req, res) => {
    try {
        const { firstName, lastName, status } = req.body;
        
        const user = await User.findById(req.user.userId);
        
        // Update profile fields
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (status) user.profile.status = status;
        
        await user.save();
        
        res.json({
            message: 'Profile updated successfully',
            profile: user.profile
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Upload profile avatar
router.post('/avatar', [protect, upload.single('avatar')], async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        
        // Update avatar with full URL
        const avatarPath = req.file.path;
        user.profile.avatar = `${config.IMAGE_BASE_URL}/${avatarPath}`;
        await user.save();
        
        res.json({
            message: 'Avatar uploaded successfully',
            avatar: `${config.IMAGE_BASE_URL}/${avatarPath}`
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user stats
router.get('/stats', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('xp wallet games surveys races');
        
        const stats = {
            xp: user.xp.current,
            balance: user.wallet.balance,
            gamesPlayed: user.games.length,
            surveysCompleted: user.surveys.filter(s => s.completed).length,
            racesCompleted: user.races.filter(r => r.completed).length
        };
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;

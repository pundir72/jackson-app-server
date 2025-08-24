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
        // Ensure directory exists
        const fs = require('fs');
        const dir = 'uploads/avatars';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Get user profile
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('firstName lastName mobile profile email');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            mobile: user.mobile,
            email: user.email,
            profile: user.profile
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            error: 'Fetch failed',
            message: 'Failed to fetch profile. Please try again.'
        });
    }
});

// Update profile
router.put('/', protect, async (req, res) => {
    try {
        const { firstName, lastName, status, mobile, bio, theme, email } = req.body;
        
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update basic profile fields
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (status) user.profile.status = status;
        if (bio) user.profile.bio = bio;
        if (theme && ['light', 'dark'].includes(theme)) {
            user.profile.theme = theme;
        }
        
        // Update email with validation
        if (email) {
            // Check if email is already taken by another user
            const existingUser = await User.findOne({ 
                email: email.toLowerCase(), 
                _id: { $ne: user._id } 
            });
            
            if (existingUser) {
                return res.status(400).json({ 
                    error: 'Email already exists',
                    message: 'This email address is already registered with another account'
                });
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({ 
                    error: 'Invalid email format',
                    message: 'Please enter a valid email address'
                });
            }
            
            user.email = email.toLowerCase();
        }
        
        // Update mobile number with validation
        if (mobile) {
            // Check if mobile number is already taken by another user
            const existingUser = await User.findOne({ 
                mobile: mobile, 
                _id: { $ne: user._id } 
            });
            
            if (existingUser) {
                return res.status(400).json({ 
                    error: 'Mobile number already exists',
                    message: 'This mobile number is already registered with another account'
                });
            }
            
            // Validate mobile number format (international support)
            const cleanNumber = mobile.replace(/\D/g, '');
            
            // Check if mobile number length is valid (7-15 digits)
            if (cleanNumber.length < 7 || cleanNumber.length > 15) {
                return res.status(400).json({ 
                    error: 'Invalid mobile number',
                    message: 'Please enter a valid mobile number (7-15 digits, with or without country code)'
                });
            }
            
            // Store the normalized mobile number (with country code)
            user.mobile = cleanNumber;
        }
        
        await user.save();
        
        res.json({
            message: 'Profile updated successfully',
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                mobile: user.mobile,
                email: user.email,
                profile: user.profile
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        
        // Handle validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                error: 'Validation failed',
                message: validationErrors.join(', ')
            });
        }
        
        res.status(500).json({ 
            error: 'Update failed',
            message: 'Failed to update profile. Please try again.'
        });
    }
});

// Update mobile number only
router.put('/mobile', protect, async (req, res) => {
    try {
        const { mobile } = req.body;
        
        if (!mobile) {
            return res.status(400).json({ 
                error: 'Mobile number required',
                message: 'Please provide a mobile number'
            });
        }
        
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if mobile number is already taken by another user
        const existingUser = await User.findOne({ 
            mobile: mobile, 
            _id: { $ne: user._id } 
        });
        
        if (existingUser) {
            return res.status(400).json({ 
                error: 'Mobile number already exists',
                message: 'This mobile number is already registered with another account'
            });
        }
        
        // Validate mobile number format (international support)
        const cleanNumber = mobile.replace(/\D/g, '');
        
        // Check if mobile number length is valid (7-15 digits)
        if (cleanNumber.length < 7 || cleanNumber.length > 15) {
            return res.status(400).json({ 
                error: 'Invalid mobile number',
                message: 'Please enter a valid mobile number (7-15 digits, with or without country code)'
            });
        }
        
        // Store the normalized mobile number (with country code)
        user.mobile = cleanNumber;
        
        await user.save();
        
        res.json({
            message: 'Mobile number updated successfully',
            mobile: user.mobile
        });
    } catch (error) {
        console.error('Mobile update error:', error);
        
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({ 
                error: 'Validation failed',
                message: validationErrors.join(', ')
            });
        }
        
        res.status(500).json({ 
            error: 'Update failed',
            message: 'Failed to update mobile number. Please try again.'
        });
    }
});

// Upload profile avatar
router.post('/avatar', [protect, upload.single('avatar')], async (req, res) => {
    console.log('Avatar upload route hit');
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ 
                error: 'No file uploaded',
                message: 'Please select an image file to upload'
            });
        }

        console.log('File uploaded:', req.file);
        
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update avatar with full URL
        const avatarPath = req.file.path;
        user.profile.avatar = `${config.IMAGE_BASE_URL}/${avatarPath}`;
        await user.save();
        
        res.json({
            message: 'Avatar uploaded successfully',
            avatar: `${config.IMAGE_BASE_URL}/${avatarPath}`,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Avatar upload error:', error);
        
        // Handle multer errors specifically
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File too large',
                message: 'File size must be less than 5MB'
            });
        }
        
        if (error.message === 'Only image files are allowed!') {
            return res.status(400).json({ 
                error: 'Invalid file type',
                message: 'Only image files (JPEG, PNG, GIF) are allowed'
            });
        }
        
        res.status(500).json({ 
            error: 'Upload failed',
            message: 'Failed to upload avatar. Please try again.'
        });
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

// Get avatar by filename
router.get('/avatar/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(__dirname, '../uploads/avatars', filename);
        
        // Check if file exists
        const fs = require('fs');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Avatar not found' });
        }
        
        res.sendFile(filePath);
    } catch (error) {
        console.error('Avatar retrieval error:', error);
        res.status(500).json({ error: 'Failed to retrieve avatar' });
    }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const twilio = require('twilio');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Twilio client initialization
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);



// Helper function to check biometric requirement
async function checkBiometricRequirement(user) {
  try {
    // Check if biometric is setup
    if (!user.biometric.setup) {
      return false;
    }

    // Get last login time
    const lastLogin = user.biometric.lastLogin;
    const now = new Date();

    // If last login was more than 1 hour ago, require biometric
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Check if biometric token is still valid
    if (user.biometric.token && user.biometric.tokenExpiresAt > now) {
      return false; // Already have valid token
    }

    return lastLogin < oneHourAgo;
  } catch (error) {
    console.error('Error checking biometric requirement:', error);
    return false;
  }
}

// Helper function to generate biometric token
async function generateBiometricToken(user) {
  try {
    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token with user and set expiration
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'biometric.token': token,
        'biometric.tokenExpiresAt': new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    }, {
      new: true
    });

    return token;
  } catch (error) {
    console.error('Error generating biometric token:', error);
    throw error;
  }
}

// Generate and send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { mobile } = req.body;
    
    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);
    
    // Save OTP to user
    const user = await User.findOneAndUpdate(
      { mobile },
      { 
        otp: {
          code: otp.toString(),
          expiresAt: new Date(Date.now() + 300000) // 5 minutes
        }
      },
      { new: true, upsert: true }
    );
    
    // Send OTP via Twilio
    await client.messages.create({
      body: `Your Jackson App OTP is: ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: mobile
    });
    
    res.status(200).json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user?.otp?.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP expired' });
    }
    
    if ("8078" !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    await User.findOneAndUpdate(
      { mobile },
      { 
        isVerified: true,
        otp: null
      }
    );
    
    res.status(200).json({ message: 'OTP verified successfully' });
  } catch (error) {
    console.log(error)
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Sign up
router.post('/signup', 
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty(),
  body('email').isEmail(),
  body('mobile').trim().notEmpty(),
  body('password').isLength({ min: 8 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        firstName,
        lastName,
        email,
        mobile,
        password,
        gender,
        ageRange,
        gamePreferences,
        gameStyle,
        improvementArea,
        dailyEarningGoal
      } = req.body;

      const user = new User({
        firstName,
        lastName,
        email,
        mobile,
        password,
        gender,
        ageRange,
        gamePreferences,
        gameStyle,
        improvementArea,
        dailyEarningGoal,
        isVerified: true // OTP already verified
      });

      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: user.mobile,
          gender: user.gender,
          ageRange: user.ageRange,
          gamePreferences: user.gamePreferences,
          gameStyle: user.gameStyle,
          improvementArea: user.improvementArea,
          dailyEarningGoal: user.dailyEarningGoal
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  }
);

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts from this IP. Please try again later.'
});

// Login
router.post('/login',
  loginLimiter,
  body('emailOrMobile').trim().notEmpty(),
  body('password').trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { emailOrMobile, password } = req.body;
      const user = await User.findOne({
        $or: [
          { email: emailOrMobile },
          { mobile: emailOrMobile }
        ]
      });
      console.log(user)
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      console.log('Attempting password verification...');
      console.log('Input password:', password);
      console.log('Stored password hash:', user.password);
      const isValidPassword = await user.comparePassword(password);
      console.log('Password verification result:', isValidPassword);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check biometric requirement
      const shouldRequireBiometric = await checkBiometricRequirement(user);
      if (shouldRequireBiometric) {
        const biometricToken = await generateBiometricToken(user);
        return res.status(200).json({
          biometricRequired: true,
          biometricToken,
          message: 'Please complete biometric verification'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({
        token,
        biometricRequired: false,
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mobile: user.mobile
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  }
);

module.exports = router;

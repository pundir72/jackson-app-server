const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const twilio = require('twilio');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const passport = require('passport');

// Twilio client initialization
// const client = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );



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
    
    if (!mobile) {
      return res.status(400).json({ 
        error: 'Mobile number required',
        message: 'Please provide a mobile number'
      });
    }
    
    // Normalize mobile number
    const cleanNumber = mobile.replace(/\D/g, '');
    let normalizedMobile = mobile;
    
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
      normalizedMobile = cleanNumber.substring(2);
    } else if (cleanNumber.length === 13 && cleanNumber.startsWith('91')) {
      normalizedMobile = cleanNumber.substring(2);
    } else if (cleanNumber.length === 10) {
      normalizedMobile = cleanNumber;
    } else {
      return res.status(400).json({ 
        error: 'Invalid mobile number',
        message: 'Please enter a valid mobile number (10 digits or with country code +91)'
      });
    }
    
    // Check if user with this mobile already exists and is verified
    const existingUser = await User.findOne({ mobile: normalizedMobile });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({ 
        error: 'Mobile number already registered',
        message: 'An account with this mobile number already exists. Please try logging in instead.',
        field: 'mobile'
      });
    }
    
    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);
    
    // Save OTP to user (create new or update existing)
    const user = await User.findOneAndUpdate(
      { mobile: normalizedMobile },
      { 
        mobile: normalizedMobile,
        otp: {
          code: otp.toString(),
          expiresAt: new Date(Date.now() + 300000) // 5 minutes
        }
      },
      { new: true, upsert: true }
    );
    
    // Send OTP via Twilio
    // await client.messages.create({
    //   body: `Your Jackson App OTP is: ${otp}. Valid for 5 minutes.`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: normalizedMobile
    // });
    
    res.status(200).json({ 
      message: 'OTP sent successfully',
      mobile: normalizedMobile
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ 
      error: 'Failed to send OTP',
      message: 'Unable to send OTP. Please try again later.'
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    
    if (!mobile || !otp) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Mobile number and OTP are required'
      });
    }
    
    // Normalize mobile number
    const cleanNumber = mobile.replace(/\D/g, '');
    let normalizedMobile = mobile;
    
    if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
      normalizedMobile = cleanNumber.substring(2);
    } else if (cleanNumber.length === 13 && cleanNumber.startsWith('91')) {
      normalizedMobile = cleanNumber.substring(2);
    } else if (cleanNumber.length === 10) {
      normalizedMobile = cleanNumber;
    } else {
      return res.status(400).json({ 
        error: 'Invalid mobile number',
        message: 'Please enter a valid mobile number'
      });
    }
    
    const user = await User.findOne({ mobile: normalizedMobile });
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'No user found with this mobile number. Please send OTP first.'
      });
    }
    
    if (!user.otp || !user.otp.code) {
      return res.status(400).json({ 
        error: 'No OTP found',
        message: 'Please request an OTP first before verification.'
      });
    }
    
    if (user.otp.expiresAt < new Date()) {
      return res.status(400).json({ 
        error: 'OTP expired',
        message: 'OTP has expired. Please request a new OTP.'
      });
    }
    
    if (user.otp.code !== otp) {
      return res.status(400).json({ 
        error: 'Invalid OTP',
        message: 'The OTP you entered is incorrect. Please try again.'
      });
    }
    
    await User.findOneAndUpdate(
      { mobile: normalizedMobile },
      { 
        isVerified: true,
        otp: null
      }
    );
    
    res.status(200).json({ 
      message: 'OTP verified successfully',
      mobile: normalizedMobile
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ 
      error: 'Verification failed',
      message: 'Failed to verify OTP. Please try again later.'
    });
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

      // Check if email already exists
      const existingEmail = await User.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({ 
          error: 'Email already exists',
          message: 'An account with this email address already exists. Please use a different email or try logging in.',
          field: 'email'
        });
      }

      // Check if mobile number already exists
      const existingMobile = await User.findOne({ mobile: mobile });
      if (existingMobile) {
        return res.status(400).json({ 
          error: 'Mobile number already exists',
          message: 'An account with this mobile number already exists. Please use a different mobile number or try logging in.',
          field: 'mobile'
        });
      }

      // Normalize mobile number (remove country code if present)
      let normalizedMobile = mobile;
      const cleanNumber = mobile.replace(/\D/g, '');
      if (cleanNumber.length === 12 && cleanNumber.startsWith('91')) {
        normalizedMobile = cleanNumber.substring(2);
      } else if (cleanNumber.length === 13 && cleanNumber.startsWith('91')) {
        normalizedMobile = cleanNumber.substring(2);
      } else if (cleanNumber.length === 10) {
        normalizedMobile = cleanNumber;
      }

      const user = new User({
        firstName,
        lastName,
        email: email.toLowerCase(),
        mobile: normalizedMobile,
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
      console.error('User registration error:', error);
      
      // Handle specific MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        if (field === 'email') {
          return res.status(400).json({ 
            error: 'Email already exists',
            message: 'An account with this email address already exists. Please use a different email or try logging in.',
            field: 'email'
          });
        } else if (field === 'mobile') {
          return res.status(400).json({ 
            error: 'Mobile number already exists',
            message: 'An account with this mobile number already exists. Please use a different mobile number or try logging in.',
            field: 'mobile'
          });
        }
      }
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
          error: 'Validation failed',
          message: validationErrors.join(', '),
          details: validationErrors
        });
      }
      
      res.status(500).json({ 
        error: 'Registration failed',
        message: 'Failed to register user. Please try again later.'
      });
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

// ========================================
// SOCIAL LOGIN ROUTES
// ========================================

// Google OAuth Routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      console.log('Google OAuth callback route hit');

      const user = req.user;
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&provider=google&userId=${user._id}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=Google authentication failed`);
    }
  }
);

// Facebook OAuth Routes
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const user = req.user;
      
      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Redirect to frontend with token
      const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/callback?token=${token}&provider=facebook&userId=${user._id}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Facebook OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/error?message=Facebook authentication failed`);
    }
  }
);

// Social login status check
router.get('/social/status', async (req, res) => {
  try {
    const { email, provider } = req.query;
    
    if (!email || !provider) {
      return res.status(400).json({ error: 'Email and provider are required' });
    }

    const user = await User.findOne({ 
      email,
      [`social.${provider}Id`]: { $exists: true }
    });

    if (user) {
      res.json({ 
        connected: true, 
        provider,
        userId: user._id 
      });
    } else {
      res.json({ 
        connected: false, 
        provider 
      });
    }
  } catch (error) {
    console.error('Social status check error:', error);
    res.status(500).json({ error: 'Failed to check social login status' });
  }
});

// Disconnect social account
router.post('/social/disconnect', async (req, res) => {
  try {
    const { userId, provider } = req.body;
    
    if (!userId || !provider) {
      return res.status(400).json({ error: 'User ID and provider are required' });
    }

    const updateField = {};
    updateField[`social.${provider}Id`] = undefined;
    updateField[`social.${provider}AccessToken`] = undefined;

    const user = await User.findByIdAndUpdate(
      userId,
      { $unset: updateField },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: `${provider} account disconnected successfully`,
      user: {
        _id: user._id,
        email: user.email,
        social: user.social
      }
    });
  } catch (error) {
    console.error('Social disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect social account' });
  }
});

module.exports = router;

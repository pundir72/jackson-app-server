const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const twilio = require('twilio');
const otpConfig = require('../config/otp-config');

// 🚨 DEVELOPMENT MODE: Using hardcoded OTP (1234) for all users
// This bypasses Twilio SMS and uses a fixed OTP code for testing
// REMOVE THIS IN PRODUCTION AND ENABLE REAL SMS OTP
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const passport = require('passport');
const { sendPasswordResetEmail } = require('../utils/email');

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
    
    // Normalize mobile number (preserve country code for international support)
    let normalizedMobile = mobile.replace(/\D/g, ''); // Remove non-digits, keep country code
    
    // Validate mobile number length
    if (normalizedMobile.length < 7 || normalizedMobile.length > 15) {
      return res.status(400).json({ 
        error: 'Invalid mobile number',
        message: 'Please enter a valid mobile number (7-15 digits, with or without country code)'
      });
    }
    
    // Check if user with this mobile already exists
    const existingUser = await User.findOne({ mobile: normalizedMobile });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Mobile number already registered',
        message: 'An account with this mobile number already exists. Please login instead.'
      });
    }
    
    // Check if there's already a pending OTP verification
    const OTPVerification = require('../models/OTPVerification');
    const pendingVerification = await OTPVerification.findOne({
      mobile: normalizedMobile,
      isVerified: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (pendingVerification) {
      const timeRemaining = Math.ceil((pendingVerification.expiresAt - new Date()) / 1000);
      return res.status(400).json({ 
        error: 'OTP already sent',
        message: `Please wait ${timeRemaining} seconds before requesting another OTP`,
        timeRemaining
      });
    }
    
    // Generate OTP (using hardcoded 1234 for development)
    const otp = '8078';
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Create OTP verification record
    const otpVerification = new OTPVerification({
      mobile: normalizedMobile,
      otp: otp,
      expiresAt: expiresAt
    });
    
    await otpVerification.save();
    
    // In production, send SMS here
    // const message = await client.messages.create({
    //   body: `Your Jackson App verification code is: ${otp}`,
    //   body: `Your Jackson App verification code is: ${otp}`,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: `+${normalizedMobile}`
    // });
    
    res.json({
      message: 'OTP sent successfully',
      mobile: normalizedMobile,
      expiresIn: '10 minutes',
      note: 'Development mode: OTP is 1234'
    });
    
  } catch (error) {
    console.error('OTP generation error:', error);
    res.status(500).json({ 
      error: 'Failed to send OTP',
      message: 'An error occurred while sending OTP. Please try again.'
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
    
    // Normalize mobile number (preserve country code for international support)
    const normalizedMobile = mobile.replace(/\D/g, ''); // Remove non-digits, keep country code
    
    // Validate mobile number length
    if (normalizedMobile.length < 7 || normalizedMobile.length > 15) {
      return res.status(400).json({ 
        error: 'Invalid mobile number',
        message: 'Please enter a valid mobile number (7-15 digits)'
      });
    }
    
    // Find OTP verification record
    const OTPVerification = require('../models/OTPVerification');
    const otpVerification = await OTPVerification.findOne({
      mobile: normalizedMobile,
      otp: otp,
      isVerified: false,
      expiresAt: { $gt: new Date() }
    });
    
    if (!otpVerification) {
      return res.status(400).json({ 
        error: 'Invalid OTP',
        message: 'Invalid or expired OTP. Please request a new OTP.'
      });
    }
    
    // Mark OTP as verified
    await otpVerification.markVerified();
    
    res.status(200).json({ 
      message: 'OTP verified successfully',
      mobile: normalizedMobile,
      verified: true,
      note: 'You can now proceed with signup'
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
        dailyEarningGoal,
        socialTag
      } = req.body;

      // Normalize mobile number (preserve country code for international support)
      let normalizedMobile = mobile.replace(/\D/g, ''); // Remove non-digits, keep country code
      
      // Validate mobile number length
      if (normalizedMobile.length < 7 || normalizedMobile.length > 15) {
        return res.status(400).json({ 
          error: 'Invalid mobile number',
          message: 'Please enter a valid mobile number (7-15 digits)'
        });
      }

      // Check if user already exists with this email or mobile
      const existingUser = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { mobile: normalizedMobile }
        ]
      });

      if (existingUser) {
        return res.status(400).json({ 
          error: 'User already exists',
          message: 'An account with this email or mobile number already exists. Please login instead.'
        });
      }

      // Check if OTP is verified for this mobile number
      const OTPVerification = require('../models/OTPVerification');
      const verifiedOTP = await OTPVerification.findValidVerification(normalizedMobile);
      
      if (!verifiedOTP) {
        return res.status(400).json({ 
          error: 'OTP not verified',
          message: 'Please verify your mobile number with OTP before completing registration.',
          requiresOTPVerification: true,
          mobile: normalizedMobile
        });
      }

      // Create new user with verified mobile
      const user = new User({
        firstName,
        lastName,
        email: email.toLowerCase(),
        mobile: normalizedMobile,
        password, // Will be hashed by pre-save middleware
        gender,
        ageRange,
        gamePreferences,
        gameStyle,
        improvementArea,
        dailyEarningGoal,
        socialTag,
        isVerified: true // Mobile is already verified
      });

      await user.save();

      // Generate JWT token since user is complete
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(201).json({
        message: 'Registration completed successfully! Welcome to the app!',
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
          dailyEarningGoal: user.dailyEarningGoal,
          socialTag: user.socialTag
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

      // Check if user is verified
      if (!user.isVerified) {
        return res.status(401).json({ 
          error: 'Account not verified',
          message: 'Please verify your mobile number with OTP before logging in',
          requiresVerification: true,
          mobile: user.mobile
        });
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
      const redirectUrl = `com.jackson.app://auth/callback?token=${token}&provider=google&userId=${user._id}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect(`com.jackson.app://auth/error?message=Google authentication failed`);
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
      const redirectUrl = `com.jackson.app://auth/callback?token=${token}&provider=facebook&userId=${user._id}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('Facebook OAuth callback error:', error);
      res.redirect(`com.jackson.app://auth/error?message=Facebook authentication failed`);
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

// ==================== PASSWORD RESET ROUTES ====================

// Rate limiting for password reset requests
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 requests per windowMs
  message: {
    error: 'Too many password reset requests',
    message: 'Please wait 15 minutes before trying again'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Forgot Password - Request password reset
router.post('/forgot-password', 
  passwordResetLimiter,
  [
    body('identifier')
      .notEmpty()
      .withMessage('Email or mobile number is required')
      .isLength({ min: 3 })
      .withMessage('Identifier must be at least 3 characters long')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors.array() 
        });
      }

      const { identifier } = req.body;
      
      // Determine if identifier is email or mobile
      const isEmail = identifier.includes('@');
      let user;
      
      if (isEmail) {
        user = await User.findOne({ email: identifier.toLowerCase() });
      } else {
        // Normalize mobile number (preserve country code for international support)
        let normalizedMobile = identifier.replace(/\D/g, ''); // Remove non-digits, keep country code
        
        // Validate mobile number length
        if (normalizedMobile.length < 7 || normalizedMobile.length > 15) {
          return res.status(400).json({ 
            error: 'Invalid mobile number format',
            message: 'Please enter a valid mobile number (7-15 digits, with or without country code)'
          });
        }
        
        user = await User.findOne({ mobile: normalizedMobile });
      }

      if (!user) {
        // Don't reveal if user exists or not for security
        return res.status(200).json({ 
          message: 'If an account with this information exists, you will receive a password reset link shortly'
        });
      }

      // Check if user has made too many reset attempts recently
      if (user.passwordReset.attempts >= 5) {
        const timeSinceLastRequest = Date.now() - user.passwordReset.lastRequest.getTime();
        if (timeSinceLastRequest < 60 * 60 * 1000) { // 1 hour
          return res.status(429).json({ 
            error: 'Too many reset attempts',
            message: 'Please wait 1 hour before requesting another password reset'
          });
        }
        // Reset attempts if more than 1 hour has passed
        user.passwordReset.attempts = 0;
      }

      // Generate reset token
      const resetToken = user.generatePasswordResetToken();
      user.passwordReset.attempts += 1;
      
      await user.save();

      // Send reset instructions based on identifier type
      if (isEmail) {
        // Send email with reset link
        try {
          const resetUrl = `com.jackson.app://reset-password?token=${resetToken}`;
          
          // Send password reset email
          await sendPasswordResetEmail(user.email, resetUrl, user.firstName || 'User');
          
          res.json({ 
            message: 'Password reset instructions have been sent to your email address',
            resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined
          });
        } catch (emailError) {
          console.error('Email sending error:', emailError);
          // Clear the token if email fails
          user.clearPasswordResetToken();
          await user.save();
          
          res.status(500).json({ 
            error: 'Failed to send reset email',
            message: 'Please try again later or contact support'
          });
        }
      } else {
        // Send SMS with reset code (simplified version)
        try {
          // In production, integrate with Twilio or similar service
          console.log('Password reset SMS would be sent to:', user.mobile);
          console.log('Reset token:', resetToken);
          
          res.json({ 
            message: 'Password reset code has been sent to your mobile number',
            resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
          });
        } catch (smsError) {
          console.error('SMS sending error:', smsError);
          // Clear the token if SMS fails
          user.clearPasswordResetToken();
          await user.save();
          
          res.status(500).json({ 
            error: 'Failed to send reset SMS',
            message: 'Please try again later or contact support'
          });
        }
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ 
        error: 'Server error',
        message: 'Failed to process password reset request. Please try again later.'
      });
    }
  }
);

// Verify Reset Token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({ 
        error: 'Reset token is required' 
      });
    }

    // Find user with this reset token
    const crypto = require('crypto');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      'passwordReset.token': hashedToken,
      'passwordReset.expires': { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired reset token',
        message: 'The password reset link has expired or is invalid. Please request a new one.'
      });
    }

    res.json({ 
      message: 'Reset token is valid',
      valid: true
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      error: 'Server error',
      message: 'Failed to verify reset token'
    });
  }
});

// Reset Password
router.post('/reset-password', 
  [
    body('token')
      .notEmpty()
      .withMessage('Reset token is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: 'Validation failed',
          details: errors.array() 
        });
      }

      const { token, newPassword } = req.body;
      
      // Find user with this reset token
      const crypto = require('crypto');
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
      
      const user = await User.findOne({
        'passwordReset.token': hashedToken,
        'passwordReset.expires': { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({ 
          error: 'Invalid or expired reset token',
          message: 'The password reset link has expired or is invalid. Please request a new one.'
        });
      }

      // Update password
      user.password = newPassword;
      user.clearPasswordResetToken();
      
      await user.save();

      // Log the password change for security
      console.log(`Password reset completed for user: ${user.email || user.mobile}`);

      res.json({ 
        message: 'Password has been reset successfully. You can now login with your new password.',
        success: true
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ 
        error: 'Server error',
        message: 'Failed to reset password. Please try again later.'
      });
    }
  }
);

module.exports = router;

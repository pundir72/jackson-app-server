const express = require('express');
const router = express.Router();
const User = require('../models/User');
const crypto = require('crypto');

// Test biometric verification
router.post('/test/biometric', async (req, res) => {
  try {
    const { mobile, token } = req.body;

    if (!mobile || !token) {
      return res.status(400).json({ error: 'Mobile and token are required' });
    }

    // Simulate biometric verification
    const isValidBiometric = true; // In production, this would be replaced with actual biometric check

    if (isValidBiometric) {
      // Update user's last login time
      await User.findOneAndUpdate(
        { mobile },
        { 'biometric.lastLogin': new Date() }
      );

      res.status(200).json({
        success: true,
        message: 'Biometric verification successful'
      });
    } else {
      res.status(400).json({
        error: 'Biometric verification failed'
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify biometric' });
  }
});

// Test CAPTCHA
router.post('/test/captcha', async (req, res) => {
  try {
    const { captcha } = req.body;

    if (!captcha) {
      return res.status(400).json({ error: 'Captcha is required' });
    }

    // Simulate CAPTCHA verification
    const isValidCaptcha = true; // In production, this would be replaced with actual CAPTCHA validation

    if (isValidCaptcha) {
      res.status(200).json({
        success: true,
        message: 'CAPTCHA verification successful'
      });
    } else {
      res.status(400).json({
        error: 'CAPTCHA verification failed'
      });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to verify CAPTCHA' });
  }
});

// Test login flow
router.post('/test/login-flow', async (req, res) => {
  try {
    const { mobile, password, captcha } = req.body;

    if (!mobile || !password || !captcha) {
      return res.status(400).json({ error: 'Mobile, password, and captcha are required' });
    }

    // Simulate login
    const user = {
      _id: 'test-user-id',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      mobile: mobile,
      biometric: {
        setup: true,
        lastLogin: new Date(Date.now() - 7200000) // 2 hours ago
      }
    };

    // Simulate CAPTCHA verification
    const isValidCaptcha = true;
    if (!isValidCaptcha) {
      return res.status(400).json({ error: 'Invalid CAPTCHA' });
    }

    // Check if biometric is required
    const now = new Date();
    const lastLogin = new Date(user.biometric.lastLogin);
    const oneHourAgo = new Date(now.getTime() - 3600000);

    if (lastLogin < oneHourAgo) {
      // Generate biometric token
      const biometricToken = crypto.randomBytes(32).toString('hex');
      
      return res.status(200).json({
        biometricRequired: true,
        biometricToken,
        message: 'Please complete biometric verification'
      });
    }

    // Generate JWT token
    const token = 'test-jwt-token'; // In production, this would be a real JWT

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
    res.status(500).json({ error: 'Failed to test login flow' });
  }
});

module.exports = router;

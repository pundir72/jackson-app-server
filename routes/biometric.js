const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const analytics = require('../utils/analytics');

// Constants
const MAX_VERIFICATION_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const LIVENESS_THRESHOLD = 0.8; // 80% confidence for liveness
const FACE_VERIFICATION_THRESHOLD = 0.7; // 70% confidence for face match

// Verify biometric
router.post('/verify', async (req, res) => {
  try {
    const { token, verificationData, deviceId, scanType } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Find user with matching token
    const user = await User.findOne({
      'biometric.token': token,
      'biometric.tokenExpiresAt': { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    // Check if user is locked out due to too many attempts
    if (user.biometric.lockedUntil && user.biometric.lockedUntil > new Date()) {
      return res.status(403).json({
        error: 'Account locked. Please try again later',
        unlockTime: user.biometric.lockedUntil
      });
    }

    // Log verification attempt
    await analytics.log('face_verification_started', {
      userId: user._id,
      deviceId: deviceId,
      scanType: scanType || 'os_face_id'
    });

    // Handle verification data (for third-party liveness checks)
    if (verificationData) {
      // TODO: Implement third-party liveness check verification
      const livenessScore = verificationData.livenessScore || 0;
      const faceMatchScore = verificationData.faceMatchScore || 0;

      if (livenessScore < LIVENESS_THRESHOLD) {
        return res.status(400).json({
          error: 'Liveness check failed',
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD
        });
      }

      if (faceMatchScore < FACE_VERIFICATION_THRESHOLD) {
        return res.status(400).json({
          error: 'Face verification failed',
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD
        });
      }
    }

    // Increment attempt counter
    const attempts = user.biometric.attempts + 1;

    // If too many attempts, lock the account
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION);

      await User.findByIdAndUpdate(user._id, {
        'biometric.attempts': 0,
        'biometric.lockedUntil': lockUntil
      });

      return res.status(403).json({
        error: 'Too many failed attempts. Account locked for 30 minutes',
        unlockTime: lockUntil
      });
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Update user's biometric status
    const update = {
      'biometric.attempts': attempts,
      'biometric.lastVerification': new Date(),
      'biometric.lastLogin': new Date(),
      token: null,
      tokenExpiresAt: null
    };

    // Update face verification status if applicable
    if (verificationData) {
      update['biometric.faceVerification.verified'] = true;
      update['biometric.faceVerification.confidenceScore'] = verificationData.faceMatchScore;
      update['biometric.faceVerification.lastVerified'] = new Date();
      update['biometric.livenessCheck.lastChecked'] = new Date();
      update['biometric.livenessCheck.lastScore'] = verificationData.livenessScore;
      update['biometric.livenessCheck.lastDeviceId'] = deviceId;
      update['biometric.livenessCheck.lastScanType'] = scanType || 'os_face_id';
    }

    await User.findByIdAndUpdate(user._id, update);

    // Log successful verification
    await analytics.log('face_verified', {
      userId: user._id,
      deviceId: deviceId,
      scanType: scanType || 'os_face_id',
      confidenceScore: verificationData?.faceMatchScore,
      livenessScore: verificationData?.livenessScore
    });

    res.status(200).json({
      token: jwtToken,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        biometricType: user.biometric.type,
        faceVerified: verificationData ? true : false,
        confidenceScore: verificationData?.faceMatchScore
      }
    });

  } catch (error) {
    console.error('Biometric verification error:', error);
    await analytics.log('face_verification_failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to verify biometric' });
  }
});

// Setup biometric
router.post('/setup', async (req, res) => {
  try {
    const { mobile, type, verificationData, deviceId } = req.body;

    if (!mobile || !['face_id', 'fingerprint'].includes(type)) {
      return res.status(400).json({ error: 'Invalid request parameters' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log verification attempt
    await analytics.log('face_verification_started', {
      userId: user._id,
      deviceId: deviceId,
      scanType: type
    });

    // Handle verification data (for third-party liveness checks)
    if (verificationData) {
      const livenessScore = verificationData.livenessScore || 0;
      const faceMatchScore = verificationData.faceMatchScore || 0;

      if (livenessScore < LIVENESS_THRESHOLD) {
        await analytics.log('face_verification_failed', {
          userId: user._id,
          error: 'Liveness check failed',
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD
        });
        return res.status(400).json({
          error: 'Liveness check failed',
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD
        });
      }

      if (faceMatchScore < FACE_VERIFICATION_THRESHOLD) {
        await analytics.log('face_verification_failed', {
          userId: user._id,
          error: 'Face verification failed',
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD
        });
        return res.status(400).json({
          error: 'Face verification failed',
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD
        });
      }
    }

    // Update biometric setup
    const update = {
      'biometric.setup': true,
      'biometric.type': type,
      'biometric.lastSetupAt': new Date(),
      'biometric.attempts': 0,
      'biometric.lockedUntil': null
    };

    if (verificationData) {
      update['biometric.faceVerification.verified'] = true;
      update['biometric.faceVerification.confidenceScore'] = verificationData.faceMatchScore;
      update['biometric.faceVerification.lastVerified'] = new Date();
      update['biometric.livenessCheck.lastChecked'] = new Date();
      update['biometric.livenessCheck.lastScore'] = verificationData.livenessScore;
      update['biometric.livenessCheck.lastDeviceId'] = deviceId;
      update['biometric.livenessCheck.lastScanType'] = type;
    }

    await User.findByIdAndUpdate(user._id, update);

    // Log successful setup
    await analytics.log('face_verification_success', {
      userId: user._id,
      deviceId: deviceId,
      scanType: type,
      confidenceScore: verificationData?.faceMatchScore,
      livenessScore: verificationData?.livenessScore
    });

    res.status(200).json({
      message: 'Biometric setup successful',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        biometricType: type,
        faceVerified: verificationData ? true : false,
        confidenceScore: verificationData?.faceMatchScore
      }
    });

  } catch (error) {
    console.error('Biometric setup error:', error);
    await analytics.log('face_verification_failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to setup biometric' });
  }
});

// Reset biometric
router.post('/reset', async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile is required' });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reset biometric settings
    await User.findByIdAndUpdate(user._id, {
      'biometric.setup': false,
      'biometric.type': 'none',
      'biometric.lastSetupAt': null,
      'biometric.lastVerification': null,
      'biometric.attempts': 0,
      'biometric.lockedUntil': null,
      'biometric.token': null,
      'biometric.tokenExpiresAt': null,
      'biometric.faceVerification': {
        verified: false,
        faceVector: null,
        lastVerified: null,
        confidenceScore: null,
        verificationAttempts: 0,
        lastFailedAttempt: null
      },
      'biometric.livenessCheck': {
        lastChecked: null,
        lastScore: null,
        lastDeviceId: null,
        lastScanType: 'os_face_id'
      }
    });

    res.status(200).json({
      message: 'Biometric settings reset successfully'
    });

  } catch (error) {
    console.error('Biometric reset error:', error);
    res.status(500).json({ error: 'Failed to reset biometric' });
  }
});

module.exports = router;

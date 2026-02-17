const express = require('express');
const router = express.Router();
const googlePlayIntegrity = require('../utils/googlePlayIntegrity');
const protect = require('../middleware/auth');
const { standardIntegrityVerification } = require('../middleware/integrityVerification');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * @route POST /api/integrity/verify
 * @desc Verify Google Play Integrity token
 * @access Private
 */
router.post('/verify', protect, async (req, res) => {
  try {
    const { integrityToken } = req.body;

    if (!integrityToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_INTEGRITY_TOKEN',
          message: 'Integrity token is required'
        }
      });
    }

    // Verify the integrity token
    const packageName = config.ANDROID_PACKAGE_NAME;
    const verificationResult = await googlePlayIntegrity.verifyIntegrityToken(
      integrityToken,
      packageName
    );

    // Validate for rewards app
    const validation = googlePlayIntegrity.validateForRewardsApp(verificationResult);

    // Log verification
    logger.info('Manual integrity verification:', {
      userId: req.user.id,
      passed: validation.passed,
      checks: validation.checks
    });

    res.json({
      success: true,
      data: {
        verified: validation.passed,
        checks: validation.checks,
        reason: validation.reason,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Integrity verification endpoint error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: 'Failed to verify integrity token'
      }
    });
  }
});

/**
 * @route GET /api/integrity/status
 * @desc Get integrity verification status for current session
 * @access Private
 */
router.get('/status', protect, standardIntegrityVerification, (req, res) => {
  const integrityStatus = req.integrityVerification || { verified: false };

  res.json({
    success: true,
    data: {
      integrityVerified: integrityStatus.verified,
      lastVerification: integrityStatus.result?.timestamp,
      deviceTrusted: integrityStatus.validation?.checks?.deviceTrusted || false,
      appRecognized: integrityStatus.validation?.checks?.appRecognized || false
    }
  });
});

/**
 * @route POST /api/integrity/challenge
 * @desc Generate integrity challenge for client
 * @access Private
 */
router.post('/challenge', protect, (req, res) => {
  try {
    // Generate a unique nonce for this challenge
    const nonce = Buffer.from(`${req.user.id}-${Date.now()}-${Math.random()}`).toString('base64');
    
    // Store nonce temporarily (you might want to use Redis for this)
    // For now, we'll include it in the response and validate it later
    
    res.json({
      success: true,
      data: {
        nonce,
        packageName: config.ANDROID_PACKAGE_NAME,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    logger.error('Integrity challenge generation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CHALLENGE_GENERATION_FAILED',
        message: 'Failed to generate integrity challenge'
      }
    });
  }
});

module.exports = router;
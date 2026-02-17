const googlePlayIntegrity = require('../utils/googlePlayIntegrity');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Middleware to verify Google Play Integrity for sensitive operations
 * @param {Object} options - Configuration options
 * @param {boolean} options.required - Whether integrity verification is required
 * @param {Array} options.skipForEnvironments - Environments to skip verification
 * @param {boolean} options.strictMode - Enable strict validation for rewards operations
 */
const verifyIntegrity = (options = {}) => {
  const {
    required = true,
    skipForEnvironments = ['development', 'test'],
    strictMode = false
  } = options;

  return async (req, res, next) => {
    try {
      // Skip verification in specified environments
      if (skipForEnvironments.includes(config.NODE_ENV)) {
        logger.info('Skipping integrity verification in environment:', config.NODE_ENV);
        return next();
      }

      // Skip if not required and no token provided
      const integrityToken = req.headers['x-integrity-token'] || req.body.integrityToken;
      if (!required && !integrityToken) {
        return next();
      }

      // Require token if verification is mandatory
      if (required && !integrityToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INTEGRITY_TOKEN_REQUIRED',
            message: 'Integrity verification token is required'
          }
        });
      }

      // Verify the integrity token
      const packageName = config.ANDROID_PACKAGE_NAME;
      const verificationResult = await googlePlayIntegrity.verifyIntegrityToken(
        integrityToken,
        packageName
      );

      // Validate for rewards app specific requirements
      const validation = googlePlayIntegrity.validateForRewardsApp(verificationResult);

      // Log verification attempt
      logger.info('Integrity verification attempt:', {
        userId: req.user?.id,
        endpoint: req.originalUrl,
        passed: validation.passed,
        checks: validation.checks,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });

      // Handle strict mode
      if (strictMode && !validation.passed) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INTEGRITY_VERIFICATION_FAILED',
            message: 'Device integrity verification failed',
            details: validation.reason,
            checks: validation.checks
          }
        });
      }

      // Handle non-strict mode - log but allow
      if (!validation.passed) {
        logger.warn('Integrity verification failed but allowing request:', {
          userId: req.user?.id,
          reason: validation.reason,
          checks: validation.checks
        });
      }

      // Attach verification result to request
      req.integrityVerification = {
        verified: validation.passed,
        result: verificationResult,
        validation: validation
      };

      next();

    } catch (error) {
      logger.error('Integrity verification error:', error);

      // In production, fail closed for security
      if (config.NODE_ENV === 'production' && required) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTEGRITY_VERIFICATION_ERROR',
            message: 'Unable to verify device integrity'
          }
        });
      }

      // In development, log error but continue
      logger.warn('Continuing without integrity verification due to error');
      req.integrityVerification = {
        verified: false,
        error: error.message
      };
      
      next();
    }
  };
};

/**
 * Middleware for high-value operations (withdrawals, large rewards)
 */
const strictIntegrityVerification = verifyIntegrity({
  required: true,
  strictMode: true,
  skipForEnvironments: ['development']
});

/**
 * Middleware for standard operations (game completion, daily rewards)
 */
const standardIntegrityVerification = verifyIntegrity({
  required: false,
  strictMode: false,
  skipForEnvironments: ['development', 'test']
});

/**
 * Middleware for optional integrity checking (analytics, non-sensitive operations)
 */
const optionalIntegrityVerification = verifyIntegrity({
  required: false,
  strictMode: false,
  skipForEnvironments: ['development', 'test', 'staging']
});

module.exports = {
  verifyIntegrity,
  strictIntegrityVerification,
  standardIntegrityVerification,
  optionalIntegrityVerification
};
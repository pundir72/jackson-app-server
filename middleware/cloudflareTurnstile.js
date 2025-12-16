/**
 * Cloudflare Turnstile Verification Middleware
 * Validates Turnstile tokens from frontend before processing requests
 * @module middleware/cloudflareTurnstile
 */

const { verifyTurnstileToken, getClientIP } = require('../utils/cloudflareTurnstile');

/**
 * Verify Turnstile token (required)
 * Rejects requests without valid Turnstile token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const verifyTurnstile = async (req, res, next) => {
  try {
    // Get Turnstile token from request body or header
    const token = req.body?.turnstileToken || req.body?.cfTurnstileToken || req.headers['x-turnstile-token'];
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Turnstile token is required',
        code: 'TURNSTILE_TOKEN_MISSING',
        message: 'Please complete the captcha verification'
      });
    }

    // Get client IP for verification
    const clientIP = getClientIP(req);

    // Verify token with Cloudflare
    const verification = await verifyTurnstileToken(token, clientIP);

    if (!verification.success) {
      return res.status(400).json({
        success: false,
        error: verification.error || 'Turnstile verification failed',
        code: 'TURNSTILE_VERIFICATION_FAILED',
        message: 'Captcha verification failed. Please try again.'
      });
    }

    // Attach verification result to request for logging/audit
    req.turnstileVerification = verification;

    next();
  } catch (error) {
    console.error('Turnstile middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify captcha',
      code: 'TURNSTILE_ERROR'
    });
  }
};

/**
 * Optional Turnstile verification (doesn't fail if token is missing)
 * Useful for endpoints that should work with or without Turnstile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const optionalTurnstile = async (req, res, next) => {
  try {
    // Get Turnstile token from request body or header
    const token = req.body?.turnstileToken || req.body?.cfTurnstileToken || req.headers['x-turnstile-token'];
    
    if (token) {
      // Get client IP for verification
      const clientIP = getClientIP(req);

      // Verify token with Cloudflare
      const verification = await verifyTurnstileToken(token, clientIP);

      if (verification.success) {
        req.turnstileVerification = verification;
      } else {
        // Log warning but don't fail the request
        console.warn('Optional Turnstile verification failed:', verification.error);
      }
    }

    next();
  } catch (error) {
    // Log error but don't fail the request
    console.error('Optional Turnstile middleware error:', error);
    next();
  }
};

module.exports = {
  verifyTurnstile,
  optionalTurnstile
};


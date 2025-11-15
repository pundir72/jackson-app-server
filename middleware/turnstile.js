const { verifyTurnstileToken, getClientIP } = require('../utils/turnstile');

/**
 * Middleware to verify Cloudflare Turnstile token
 * Use this middleware on routes that require bot protection
 * 
 * Usage:
 * router.post('/login', turnstileVerify, async (req, res) => { ... });
 */
const turnstileVerify = async (req, res, next) => {
  try {
    // Get token from request body or header
    const token = req.body.turnstileToken || req.body.cfTurnstileToken || req.headers['x-turnstile-token'];
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Turnstile token is required',
        message: 'Please complete the security verification'
      });
    }

    // Get client IP for additional verification
    const clientIP = getClientIP(req);

    // Verify token with Cloudflare
    const verification = await verifyTurnstileToken(token, clientIP);

    if (!verification.success) {
      return res.status(400).json({
        success: false,
        error: verification.error || 'Verification failed',
        message: 'Security verification failed. Please try again.',
        'error-codes': verification['error-codes'] || []
      });
    }

    // Attach verification result to request for logging/analytics
    req.turnstileVerification = verification;
    
    // Continue to next middleware/route handler
    next();
  } catch (error) {
    console.error('Turnstile middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during verification',
      message: 'Please try again later'
    });
  }
};

/**
 * Optional middleware - only verifies if token is provided
 * Useful for routes where Turnstile is optional
 */
const turnstileVerifyOptional = async (req, res, next) => {
  try {
    const token = req.body.turnstileToken || req.body.cfTurnstileToken || req.headers['x-turnstile-token'];
    
    // If no token provided, skip verification
    if (!token) {
      return next();
    }

    // If token is provided, verify it
    const clientIP = getClientIP(req);
    const verification = await verifyTurnstileToken(token, clientIP);

    if (!verification.success) {
      return res.status(400).json({
        success: false,
        error: verification.error || 'Verification failed',
        message: 'Invalid security verification token',
        'error-codes': verification['error-codes'] || []
      });
    }

    req.turnstileVerification = verification;
    next();
  } catch (error) {
    console.error('Turnstile optional middleware error:', error);
    // For optional verification, continue even on error
    next();
  }
};

module.exports = {
  turnstileVerify,
  turnstileVerifyOptional
};


/**
 * Cloudflare Turnstile Verification Utility
 * Verifies Turnstile tokens from frontend
 * Documentation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const axios = require('axios');
const config = require('../config/config');

/**
 * Verify Cloudflare Turnstile token
 * @param {string} token - The Turnstile token from frontend
 * @param {string} remoteip - Optional: User's IP address
 * @returns {Promise<{success: boolean, error?: string, challenge_ts?: string, hostname?: string}>}
 */
async function verifyTurnstileToken(token, remoteip = null) {
  try {
    if (!token) {
      return {
        success: false,
        error: 'Turnstile token is required'
      };
    }

    // Check if Turnstile is configured
    if (!config.CLOUDFLARE_TURNSTILE_SECRET_KEY) {
      console.warn('⚠️ Cloudflare Turnstile secret key not configured. Skipping verification.');
      // In development, allow requests without verification if not configured
      if (process.env.NODE_ENV === 'development') {
        return {
          success: true,
          error: 'Turnstile not configured (development mode)'
        };
      }
      return {
        success: false,
        error: 'Turnstile verification not configured'
      };
    }

    // Verify token with Cloudflare API
    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({
        secret: config.CLOUDFLARE_TURNSTILE_SECRET_KEY,
        response: token,
        ...(remoteip && { remoteip })
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    const result = response.data;

    if (result.success) {
      return {
        success: true,
        challenge_ts: result['challenge_ts'],
        hostname: result.hostname,
        action: result.action,
        cdata: result.cdata
      };
    } else {
      // Handle error codes
      const errorCodes = result['error-codes'] || [];
      let errorMessage = 'Turnstile verification failed';
      
      if (errorCodes.includes('missing-input-secret')) {
        errorMessage = 'Missing Turnstile secret key';
      } else if (errorCodes.includes('invalid-input-secret')) {
        errorMessage = 'Invalid Turnstile secret key';
      } else if (errorCodes.includes('missing-input-response')) {
        errorMessage = 'Missing Turnstile token';
      } else if (errorCodes.includes('invalid-input-response')) {
        errorMessage = 'Invalid or expired Turnstile token';
      } else if (errorCodes.includes('bad-request')) {
        errorMessage = 'Bad request to Turnstile API';
      } else if (errorCodes.includes('timeout-or-duplicate')) {
        errorMessage = 'Turnstile token has expired or been used';
      } else if (errorCodes.length > 0) {
        errorMessage = `Turnstile error: ${errorCodes.join(', ')}`;
      }

      return {
        success: false,
        error: errorMessage,
        errorCodes
      };
    }
  } catch (error) {
    console.error('Error verifying Turnstile token:', error.message);
    
    // In development, allow requests if API call fails
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Turnstile API error in development mode. Allowing request.');
      return {
        success: true,
        error: 'Turnstile API error (development mode)'
      };
    }

    return {
      success: false,
      error: 'Failed to verify Turnstile token',
      details: error.message
    };
  }
}

/**
 * Get user's IP address from request
 * @param {Object} req - Express request object
 * @returns {string}
 */
function getClientIP(req) {
  // Check various headers for real IP (useful behind proxies/load balancers)
  const ipCandidates = [
    req.headers['cf-connecting-ip'], // Cloudflare
    req.headers['x-real-ip'],
    Array.isArray(req.headers['x-forwarded-for']) 
      ? req.headers['x-forwarded-for'][0] 
      : (req.headers['x-forwarded-for'] 
          ? req.headers['x-forwarded-for'].split(',')[0].trim() 
          : null),
    req.ip,
    req.connection?.remoteAddress
  ].filter(Boolean);

  let ip = ipCandidates[0] || '127.0.0.1';
  
  // Handle IPv6-mapped IPv4 addresses
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }
  if (ip === '::1') {
    ip = '127.0.0.1';
  }

  return ip;
}

module.exports = {
  verifyTurnstileToken,
  getClientIP
};


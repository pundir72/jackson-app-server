const axios = require('axios');

/**
 * Cloudflare Turnstile Verification Utility
 * Verifies Turnstile tokens with Cloudflare's API
 * 
 * Free Plan Features:
 * - Up to 20 widgets
 * - Unlimited challenges
 * - All widget types (managed, invisible, interactive)
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile token with Cloudflare
 * @param {string} token - The Turnstile token from the frontend
 * @param {string} remoteip - Optional: The user's IP address
 * @returns {Promise<Object>} Verification result
 */
async function verifyTurnstileToken(token, remoteip = null) {
  try {
    if (!token) {
      return {
        success: false,
        error: 'Turnstile token is required'
      };
    }

    const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    
    if (!secretKey) {
      console.error('CLOUDFLARE_TURNSTILE_SECRET_KEY is not set in environment variables');
      return {
        success: false,
        error: 'Turnstile secret key not configured'
      };
    }

    // Prepare form data for Cloudflare API
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteip) {
      formData.append('remoteip', remoteip);
    }

    // Verify token with Cloudflare
    const response = await axios.post(TURNSTILE_VERIFY_URL, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000 // 10 second timeout
    });

    const result = response.data;

    // Cloudflare returns success: true/false and optional error codes
    if (result.success) {
      return {
        success: true,
        challenge_ts: result['challenge_ts'], // Timestamp of the challenge
        hostname: result.hostname, // Hostname where the challenge was solved
        'error-codes': result['error-codes'] || []
      };
    } else {
      // Handle error codes
      const errorCodes = result['error-codes'] || [];
      let errorMessage = 'Turnstile verification failed';
      
      // Map common error codes to user-friendly messages
      const errorMessages = {
        'missing-input-secret': 'The secret parameter is missing',
        'invalid-input-secret': 'The secret parameter is invalid or malformed',
        'missing-input-response': 'The response parameter is missing',
        'invalid-input-response': 'The response parameter is invalid or malformed',
        'bad-request': 'The request is invalid or malformed',
        'timeout-or-duplicate': 'The response is no longer valid: either is too old or has been used previously',
        'internal-error': 'An internal error happened while validating the response'
      };

      if (errorCodes.length > 0) {
        errorMessage = errorMessages[errorCodes[0]] || errorMessage;
      }

      return {
        success: false,
        error: errorMessage,
        'error-codes': errorCodes
      };
    }
  } catch (error) {
    console.error('Turnstile verification error:', error.message);
    
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Turnstile verification timeout. Please try again.'
      };
    }
    
    if (error.response) {
      // Cloudflare API returned an error
      return {
        success: false,
        error: 'Failed to verify Turnstile token',
        'error-codes': ['api-error']
      };
    }
    
    return {
      success: false,
      error: 'Failed to verify Turnstile token. Please try again.'
    };
  }
}

/**
 * Middleware helper to extract IP address from request
 * @param {Object} req - Express request object
 * @returns {string|null} IP address
 */
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    null
  );
}

module.exports = {
  verifyTurnstileToken,
  getClientIP
};


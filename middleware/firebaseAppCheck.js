/**
 * Firebase App Check Verification Middleware
 * Verifies X-Firebase-AppCheck header token
 * Protects backend from traffic that doesn't originate from genuine app
 * @module middleware/firebaseAppCheck
 */

const { getFirebaseAdmin, isFirebaseInitialized } = require('../utils/firebaseAdmin');

/**
 * Verify Firebase App Check token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const verifyAppCheck = async (req, res, next) => {
  // Check if Firebase is initialized
  if (!isFirebaseInitialized()) {
    // In development, allow requests without App Check if Firebase is not configured
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Firebase App Check disabled in development mode');
      return next();
    }
    
    return res.status(503).json({
      success: false,
      error: 'App Check verification unavailable. Firebase Admin SDK not configured.',
      code: 'APP_CHECK_UNAVAILABLE'
    });
  }

  const appCheckToken = req.headers['x-firebase-appcheck'];
  
  if (!appCheckToken) {
    return res.status(401).json({
      success: false,
      error: 'App Check token required. Include X-Firebase-AppCheck header.',
      code: 'APP_CHECK_TOKEN_MISSING'
    });
  }
  
  try {
    const admin = getFirebaseAdmin();
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
    
    // Attach App Check claims to request for logging/audit
    req.appCheckClaims = appCheckClaims;
    
    next();
  } catch (error) {
    console.error('App Check verification failed:', error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired App Check token',
      code: 'APP_CHECK_TOKEN_INVALID',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Optional App Check verification (doesn't fail if token is missing)
 * Useful for endpoints that should work with or without App Check
 */
const optionalAppCheck = async (req, res, next) => {
  if (!isFirebaseInitialized()) {
    return next();
  }

  const appCheckToken = req.headers['x-firebase-appcheck'];
  
  if (!appCheckToken) {
    // No token provided, continue without verification
    return next();
  }
  
  try {
    const admin = getFirebaseAdmin();
    const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
    req.appCheckClaims = appCheckClaims;
    next();
  } catch (error) {
    // Token provided but invalid, continue anyway (optional)
    console.warn('Optional App Check verification failed:', error.message);
    next();
  }
};

module.exports = {
  verifyAppCheck,
  optionalAppCheck
};


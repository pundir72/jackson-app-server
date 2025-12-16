/**
 * Firebase Authentication Middleware
 * Verifies Firebase ID tokens from Authorization header
 * @module middleware/firebaseAuth
 */

const { getFirebaseAdmin, isFirebaseInitialized } = require('../utils/firebaseAdmin');
const User = require('../models/User');

/**
 * Verify Firebase ID token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const verifyFirebaseIdToken = async (req, res, next) => {
  // Check if Firebase is initialized
  if (!isFirebaseInitialized()) {
    return res.status(503).json({
      success: false,
      error: 'Firebase Auth verification unavailable. Firebase Admin SDK not configured.',
      code: 'FIREBASE_AUTH_UNAVAILABLE'
    });
  }

  // Extract ID token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Firebase ID token required. Include Authorization: Bearer <token> header.',
      code: 'ID_TOKEN_MISSING'
    });
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  if (!idToken) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Authorization header format',
      code: 'ID_TOKEN_INVALID_FORMAT'
    });
  }

  try {
    const admin = getFirebaseAdmin();
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Attach decoded token to request
    req.firebaseUser = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified || false,
      phoneNumber: decodedToken.phone_number,
      name: decodedToken.name,
      picture: decodedToken.picture,
      firebase_uid: decodedToken.uid
    };

    // Try to find or create user in database
    // Look for user by Firebase UID in metadata or email
    let user = await User.findOne({
      $or: [
        { 'metadata.firebaseUid': decodedToken.uid },
        { email: decodedToken.email }
      ]
    });

    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        email: decodedToken.email || `firebase_${decodedToken.uid}@firebase.local`,
        mobile: decodedToken.phone_number || null,
        role: 'USER',
        isVerified: decodedToken.email_verified || false,
        metadata: {
          firebaseUid: decodedToken.uid,
          firebaseAuth: true
        },
        profile: {
          name: decodedToken.name || 'Firebase User',
          avatar: decodedToken.picture || null
        }
      });
      await user.save();
    } else {
      // Update Firebase UID in metadata if not present
      if (!user.metadata) {
        user.metadata = {};
      }
      if (!user.metadata.firebaseUid) {
        user.metadata.firebaseUid = decodedToken.uid;
        await user.save();
      }
    }

    // Attach user to request
    req.user = {
      userId: user._id.toString(),
      firebaseUid: decodedToken.uid,
      email: user.email,
      role: user.role
    };

    next();
  } catch (error) {
    console.error('Firebase ID token verification failed:', error.message);
    
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Firebase ID token',
      code: 'ID_TOKEN_INVALID',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  verifyFirebaseIdToken
};


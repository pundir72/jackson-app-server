/**
 * Firebase Token Generator Utility
 * Generates Firebase custom tokens for existing users
 * Allows existing auth system to work with Firebase Auth
 * @module utils/firebaseTokenGenerator
 */

const { getFirebaseAdmin, isFirebaseInitialized } = require('./firebaseAdmin');
const User = require('../models/User');

/**
 * Generate Firebase custom token for user
 * This allows existing users to authenticate with Firebase
 * @param {string} userId - MongoDB user ID
 * @returns {Promise<string>} Firebase custom token
 */
async function generateFirebaseToken(userId) {
  if (!isFirebaseInitialized()) {
    throw new Error('Firebase Admin SDK not initialized');
  }

  try {
    // Get user from database
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const admin = getFirebaseAdmin();
    
    // Get or create Firebase UID
    let firebaseUid = user.metadata?.firebaseUid;
    
    if (!firebaseUid) {
      // Create Firebase UID from MongoDB ID
      // Format: mongodb_<userId>
      firebaseUid = `mongodb_${user._id.toString()}`;
      
      // Try to get existing Firebase user or create new one
      try {
        await admin.auth().getUser(firebaseUid);
        // User exists in Firebase
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          // Create Firebase user
          const firebaseUser = await admin.auth().createUser({
            uid: firebaseUid,
            email: user.email || undefined,
            phoneNumber: user.mobile || undefined,
            displayName: user.profile?.name || user.email || 'User',
            emailVerified: user.isVerified || false,
            disabled: false
          });
          
          // Update user metadata
          if (!user.metadata) {
            user.metadata = {};
          }
          user.metadata.firebaseUid = firebaseUid;
          await user.save();
        } else {
          throw error;
        }
      }
    }

    // Generate custom token
    const customToken = await admin.auth().createCustomToken(firebaseUid, {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    });

    return customToken;
  } catch (error) {
    console.error('Error generating Firebase token:', error);
    throw error;
  }
}

/**
 * Get Firebase ID token from custom token
 * This is a helper for server-side token exchange
 * Note: Usually done client-side, but can be done server-side for testing
 * @param {string} customToken - Firebase custom token
 * @returns {Promise<string>} Firebase ID token
 */
async function getIdTokenFromCustomToken(customToken) {
  // This typically requires Firebase client SDK
  // For server-side, we'll return the custom token
  // Client should exchange it for ID token
  return customToken;
}

/**
 * Generate Firebase tokens for user after login
 * Returns both custom token and instructions for client
 * @param {string} userId - MongoDB user ID
 * @returns {Promise<Object>} Token data
 */
async function generateFirebaseTokensForUser(userId) {
  try {
    const customToken = await generateFirebaseToken(userId);
    
    return {
      customToken: customToken,
      instructions: {
        clientSide: true,
        message: 'Exchange custom token for ID token using Firebase Auth SDK',
        steps: [
          '1. Import Firebase Auth SDK',
          '2. Call: signInWithCustomToken(auth, customToken)',
          '3. Get ID token: await user.getIdToken()',
          '4. Use ID token in Authorization header'
        ]
      }
    };
  } catch (error) {
    console.error('Error generating Firebase tokens:', error);
    throw error;
  }
}

module.exports = {
  generateFirebaseToken,
  getIdTokenFromCustomToken,
  generateFirebaseTokensForUser
};


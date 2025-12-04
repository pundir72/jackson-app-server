/**
 * Firebase Admin SDK Initialization
 * Initializes Firebase Admin SDK for App Check and Auth verification
 * @module utils/firebaseAdmin
 */

const admin = require('firebase-admin');
const config = require('../config/config');

let initialized = false;

/**
 * Initialize Firebase Admin SDK
 * Should be called once at application startup
 */
function initializeFirebaseAdmin() {
  if (initialized) {
    return admin;
  }

  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      initialized = true;
      return admin;
    }

    // Check if Firebase config is available
    if (!config.FIREBASE_CONFIG.projectId || !config.FIREBASE_CONFIG.clientEmail || !config.FIREBASE_CONFIG.privateKey) {
      console.warn('⚠️ Firebase Admin SDK not configured. App Check and Firebase Auth verification will be disabled.');
      console.warn('   Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in environment variables.');
      initialized = false;
      return null;
    }

    // Initialize Firebase Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_CONFIG.projectId,
        clientEmail: config.FIREBASE_CONFIG.clientEmail,
        privateKey: config.FIREBASE_CONFIG.privateKey
      })
    });

    initialized = true;
    console.log('✅ Firebase Admin SDK initialized successfully');
    return admin;
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error.message);
    initialized = false;
    return null;
  }
}

/**
 * Get Firebase Admin instance
 * @returns {admin.app.App|null}
 */
function getFirebaseAdmin() {
  if (!initialized) {
    return initializeFirebaseAdmin();
  }
  return admin;
}

/**
 * Check if Firebase Admin is initialized
 * @returns {boolean}
 */
function isFirebaseInitialized() {
  return initialized && admin.apps.length > 0;
}

module.exports = {
  initializeFirebaseAdmin,
  getFirebaseAdmin,
  isFirebaseInitialized,
  admin
};


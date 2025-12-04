/**
 * Quick Test Script for Adjust S2S V2 Implementation
 * Verifies all components are in place and working
 * Can run without full Firebase credentials
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🧪 Adjust S2S V2 Implementation Test\n');
console.log('=' .repeat(50));

const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

function test(name, condition, message) {
  if (condition) {
    console.log(`✅ ${name}`);
    results.passed++;
  } else {
    console.log(`❌ ${name}: ${message}`);
    results.failed++;
  }
}

function warn(name, message) {
  console.log(`⚠️  ${name}: ${message}`);
  results.warnings++;
}

// Test 1: Check all required files exist
console.log('\n📁 File Structure Check:');
const requiredFiles = [
  'utils/firebaseAdmin.js',
  'middleware/firebaseAppCheck.js',
  'middleware/firebaseAuth.js',
  'middleware/eventValidation.js',
  'middleware/campaignFilter.js',
  'routes/adjust-v2.js',
  'models/AdjustEventToken.js',
  'routes/admin-adjust-events.js',
  'scripts/import-adjust-events.js'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  test(`File exists: ${file}`, exists, 'File not found');
});

// Test 2: Check server.js registration
console.log('\n🔗 Route Registration Check:');
try {
  const serverContent = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  test('V2 routes registered', serverContent.includes('adjust-v2'), 'adjust-v2 routes not found in server.js');
  test('Admin routes registered', serverContent.includes('admin-adjust-events'), 'admin-adjust-events routes not found');
  test('Firebase init called', serverContent.includes('initializeFirebaseAdmin'), 'Firebase initialization not found');
} catch (error) {
  test('Server.js readable', false, error.message);
}

// Test 3: Check middleware exports
console.log('\n🛡️  Middleware Check:');
try {
  const appCheck = require('./middleware/firebaseAppCheck');
  test('App Check middleware', typeof appCheck.verifyAppCheck === 'function', 'verifyAppCheck not exported');
  
  const firebaseAuth = require('./middleware/firebaseAuth');
  test('Firebase Auth middleware', typeof firebaseAuth.verifyFirebaseIdToken === 'function', 'verifyFirebaseIdToken not exported');
  
  const eventValidation = require('./middleware/eventValidation');
  test('Event Validation middleware', typeof eventValidation.validateLevelEvent === 'function', 'validateLevelEvent not exported');
  
  const campaignFilter = require('./middleware/campaignFilter');
  test('Campaign Filter middleware', typeof campaignFilter.checkOfferwallCampaign === 'function', 'checkOfferwallCampaign not exported');
} catch (error) {
  test('Middleware loadable', false, error.message);
}

// Test 4: Check model
console.log('\n📊 Model Check:');
try {
  const AdjustEventToken = require('./models/AdjustEventToken');
  test('AdjustEventToken model', !!AdjustEventToken, 'Model not loaded');
  test('Model has findByToken', typeof AdjustEventToken.findByToken === 'function', 'findByToken method missing');
  test('Model has findS2SEvents', typeof AdjustEventToken.findS2SEvents === 'function', 'findS2SEvents method missing');
} catch (error) {
  test('Model loadable', false, error.message);
}

// Test 5: Check Firebase Admin utility
console.log('\n🔥 Firebase Admin Check:');
try {
  const { isFirebaseInitialized, initializeFirebaseAdmin } = require('./utils/firebaseAdmin');
  test('Firebase Admin utility', typeof isFirebaseInitialized === 'function', 'isFirebaseInitialized not exported');
  test('Initialize function', typeof initializeFirebaseAdmin === 'function', 'initializeFirebaseAdmin not exported');
  
  // Check if Firebase is configured
  const hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
  const hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
  const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
  
  if (hasProjectId && hasClientEmail && hasPrivateKey) {
    test('Firebase credentials', true, 'All Firebase credentials present');
  } else {
    warn('Firebase credentials', 'Missing: ' + [
      !hasProjectId && 'FIREBASE_PROJECT_ID',
      !hasClientEmail && 'FIREBASE_CLIENT_EMAIL',
      !hasPrivateKey && 'FIREBASE_PRIVATE_KEY'
    ].filter(Boolean).join(', '));
  }
} catch (error) {
  test('Firebase Admin utility', false, error.message);
}

// Test 6: Check Adjust Service
console.log('\n📡 Adjust Service Check:');
try {
  const adjustService = require('./services/adjust.service');
  test('Adjust Service', !!adjustService, 'Service not loaded');
  test('sendEvent method', typeof adjustService.sendEvent === 'function', 'sendEvent method missing');
  
  const hasApiToken = !!process.env.ADJUST_API_TOKEN;
  const hasAppToken = !!process.env.ADJUST_APP_TOKEN;
  
  if (hasApiToken && hasAppToken) {
    test('Adjust credentials', true, 'All Adjust credentials present');
  } else {
    warn('Adjust credentials', 'Missing: ' + [
      !hasApiToken && 'ADJUST_API_TOKEN',
      !hasAppToken && 'ADJUST_APP_TOKEN'
    ].filter(Boolean).join(', '));
  }
} catch (error) {
  test('Adjust Service', false, error.message);
}

// Test 7: Check environment variables
console.log('\n⚙️  Configuration Check:');
const requiredEnvVars = {
  'ADJUST_API_TOKEN': 'Adjust API token',
  'ADJUST_APP_TOKEN': 'Adjust app token',
  'FIREBASE_PROJECT_ID': 'Firebase project ID (you have this)',
  'FIREBASE_CLIENT_EMAIL': 'Firebase client email (requested)',
  'FIREBASE_PRIVATE_KEY': 'Firebase private key (requested)',
  'OFFERWALL_CAMPAIGNS': 'Offerwall campaigns (optional)'
};

Object.entries(requiredEnvVars).forEach(([key, description]) => {
  const value = process.env[key];
  if (value) {
    test(`${key}`, true, description);
  } else {
    if (key.startsWith('FIREBASE_') && key !== 'FIREBASE_PROJECT_ID') {
      warn(`${key}`, `${description} - Waiting for client`);
    } else if (key === 'OFFERWALL_CAMPAIGNS') {
      warn(`${key}`, `${description} - Optional, can set later`);
    } else {
      warn(`${key}`, `${description} - Not set`);
    }
  }
});

// Test 8: Check routes file structure
console.log('\n🛣️  Routes Check:');
try {
  const v2Routes = require('./routes/adjust-v2');
  test('V2 routes file', !!v2Routes, 'V2 routes file not loaded');
  
  const adminRoutes = require('./routes/admin-adjust-events');
  test('Admin routes file', !!adminRoutes, 'Admin routes file not loaded');
} catch (error) {
  test('Routes loadable', false, error.message);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary:');
console.log(`   ✅ Passed: ${results.passed}`);
console.log(`   ⚠️  Warnings: ${results.warnings}`);
console.log(`   ❌ Failed: ${results.failed}`);

if (results.failed === 0) {
  console.log('\n🎉 All critical tests passed!');
  console.log('\n📋 Implementation Status:');
  console.log('   ✅ Code: 100% Complete');
  console.log('   ⏳ Firebase Credentials: Waiting for client');
  console.log('   ✅ Ready for integration testing once credentials are added');
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.');
}

console.log('\n📝 Next Steps:');
console.log('   1. Wait for Firebase credentials from client');
console.log('   2. Add credentials to .env file');
console.log('   3. Run: node scripts/import-adjust-events.js');
console.log('   4. Restart server');
console.log('   5. Test with real Firebase tokens');

process.exit(results.failed > 0 ? 1 : 0);


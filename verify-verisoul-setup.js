/**
 * Verify Verisoul Setup and Configuration
 * Run with: node verify-verisoul-setup.js
 */

require('dotenv').config();

console.log('='.repeat(60));
console.log('Verisoul Configuration Verification');
console.log('='.repeat(60));

// Check environment variables
const apiKey = process.env.VERISOUL_API_KEY;
const baseURL = process.env.VERISOUL_BASE_URL;

console.log('\n📋 Environment Variables:');
console.log(`   VERISOUL_API_KEY: ${apiKey ? (apiKey.length > 10 ? apiKey.substring(0, 10) + '...' : apiKey) : '❌ NOT SET'}`);
console.log(`   VERISOUL_BASE_URL: ${baseURL || '❌ NOT SET'}`);

if (!apiKey || !baseURL) {
  console.log('\n❌ ERROR: Missing required environment variables!');
  console.log('   Please set VERISOUL_API_KEY and VERISOUL_BASE_URL in your .env file');
  process.exit(1);
}

// Check if using sandbox or production
const isSandbox = baseURL.includes('sandbox');
console.log(`\n🌍 Environment: ${isSandbox ? 'SANDBOX (Testing)' : 'PRODUCTION'}`);

// Verify SDK can be initialized
try {
  const VerisoulSDK = require('./utils/verisoul');
  const verisoul = new VerisoulSDK(apiKey, baseURL);
  
  console.log('\n✅ Verisoul SDK initialized successfully');
  console.log(`   Base URL: ${verisoul.baseURL}`);
  console.log(`   API Key: ${verisoul.apiKey ? 'Set' : 'Missing'}`);
  
  // Test session ID generation
  const testSessionId = verisoul.generateSessionId();
  console.log(`\n🔧 Test Session ID Generation: ${testSessionId}`);
  console.log(`   Format: ${/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(testSessionId) ? '✅ Valid UUID v4' : '❌ Invalid format'}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Configuration looks good!');
  console.log('='.repeat(60));
  console.log('\n📝 Next Steps:');
  console.log('1. Make sure your server is running: npm start');
  console.log('2. Test the endpoint: node test-verisoul.js [session_id]');
  console.log('3. Check server logs for [Verisoul] messages');
  console.log('4. Verify frontend SDK is sending session_id (not sessionId)');
  
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
}

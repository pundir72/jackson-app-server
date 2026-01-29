/**
 * Test script for Verisoul integration
 * Run with: node test-verisoul.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:4001/api/fraud-prevention';
// Replace with actual session_id from your Verisoul SDK
const TEST_SESSION_ID = process.argv[2] || '2a5a6b8d-bf12-4901-a429-74297e38a563';

// Test data
const testData = {
  accountId: '6929d5504169c1c775597818',
  email: 'gst@gmail.com',
  group: 'regular_users',
  metadata: {
    deviceId: 'web_test_device',
    appVersion: '1.0.0',
    deviceModel: 'Linux; Android 14; SM-S921B',
    language: 'en-US',
    loginTime: new Date().toISOString(),
    osVersion: '14',
    platform: 'web',
    timezone: 'Asia/Calcutta',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36'
  },
  session_id: TEST_SESSION_ID // Using snake_case as SDK sends
};

async function testSessionAuthenticate() {
  console.log('\n🧪 Testing Verisoul Session Authentication...\n');
  console.log('Request Data:', JSON.stringify(testData, null, 2));
  console.log('\n---\n');

  try {
    // Test endpoint (no auth required)
    const response = await axios.post(
      `${BASE_URL}/test/session/authenticate`,
      testData,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Response Status:', response.status);
    console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));

    // Check if we got real Verisoul data or fallback
    if (response.data.data?.warning) {
      console.log('\n⚠️  WARNING: Got fallback response (SDK session not recognized)');
      console.log('   This means Verisoul API returned "Session ID not found"');
      console.log('   Check server logs for detailed error messages');
    } else if (response.data.data?.risk_score !== undefined) {
      console.log('\n✅ SUCCESS: Got real Verisoul risk assessment!');
      console.log(`   Risk Score: ${response.data.data.risk_score}`);
      console.log(`   Decision: ${response.data.data.decision}`);
      console.log(`   Flags: ${response.data.data.flags?.join(', ') || 'none'}`);
    }

    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function testGetSession() {
  console.log('\n🧪 Testing Get Session...\n');

  try {
    const response = await axios.get(
      `${BASE_URL}/test/session/${TEST_SESSION_ID}`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Response Status:', response.status);
    console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('Verisoul Integration Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Session ID: ${TEST_SESSION_ID}`);
  console.log(`Usage: node test-verisoul.js [session_id]`);
  console.log('='.repeat(60));
  
  if (!TEST_SESSION_ID || TEST_SESSION_ID.length < 10) {
    console.log('\n⚠️  WARNING: Using placeholder session ID');
    console.log('   For accurate testing, use a real session_id from your SDK');
    console.log('   Example: node test-verisoul.js "your-session-id-here"\n');
  }

  try {
    // Test 1: Session Authentication
    await testSessionAuthenticate();

    // Wait a bit before next test
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Get Session (if endpoint exists)
    // await testGetSession();

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests completed!');
    console.log('='.repeat(60));
    console.log('\n📋 Next Steps:');
    console.log('1. Check server console logs for detailed Verisoul API responses');
    console.log('2. Look for [Verisoul] log messages');
    console.log('3. If you see "Session ID not found", check:');
    console.log('   - Is the session_id from the SDK?');
    console.log('   - Did you wait a moment after SDK created the session?');
    console.log('   - Is the Verisoul API key correct?');
    console.log('   - Is the base URL correct (sandbox vs production)?');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testSessionAuthenticate, testGetSession };

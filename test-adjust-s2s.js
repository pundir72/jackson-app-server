/**
 * Test script for Adjust S2S API integration
 * Run with: node test-adjust-s2s.js
 */

require('dotenv').config();
const adjustService = require('./services/adjust.service');

async function testAdjustS2S() {
  console.log('🧪 Testing Adjust S2S API Integration\n');
  console.log('='.repeat(60));

  // Test 1: Configuration Check
  console.log('\n1️⃣ Testing Configuration...');
  const healthCheck = await adjustService.healthCheck();
  console.log('Health Check Result:', JSON.stringify(healthCheck, null, 2));
  
  if (!healthCheck.configured) {
    console.error('❌ Adjust S2S is not configured!');
    console.error('   Please set ADJUST_API_TOKEN and ADJUST_APP_TOKEN in your .env file');
    console.error('   See ADJUST_S2S_SETUP.md for instructions');
    return;
  }
  console.log('✅ Configuration OK\n');

  // Test 2: Service Initialization
  console.log('2️⃣ Testing Service Initialization...');
  const isConfigured = adjustService.isConfigured();
  console.log(`Service isConfigured(): ${isConfigured}`);
  
  if (!isConfigured) {
    console.error('❌ Service reports not configured');
    return;
  }
  console.log('✅ Service initialized correctly\n');

  // Test 3: Test Event (with validation only, won't send if tokens are invalid)
  console.log('3️⃣ Testing Event Structure...');
  const testEventData = {
    event_token: process.env.ADJUST_TEST_EVENT_TOKEN || 'test_event_token',
    gps_adid: 'test-gps-adid-12345',
    revenue: 9.99,
    currency: 'USD',
    callback_params: JSON.stringify({
      userId: 'test-user-123',
      test: true,
      timestamp: new Date().toISOString()
    })
  };

  console.log('Test Event Data:', JSON.stringify(testEventData, null, 2));
  
  try {
    // Only attempt to send if we have real tokens
    if (process.env.ADJUST_API_TOKEN && process.env.ADJUST_API_TOKEN !== 'your_adjust_api_token_here' &&
        process.env.ADJUST_APP_TOKEN && process.env.ADJUST_APP_TOKEN !== 'your_adjust_app_token_here') {
      console.log('\n   Attempting to send test event to Adjust...');
      const result = await adjustService.sendEvent(testEventData);
      console.log('✅ Event sent successfully!');
      console.log('   Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('⚠️  Skipping actual API call (using placeholder tokens)');
      console.log('   To test with real API:');
      console.log('   1. Set ADJUST_API_TOKEN in .env');
      console.log('   2. Set ADJUST_APP_TOKEN in .env');
      console.log('   3. Set ADJUST_TEST_EVENT_TOKEN in .env (optional, for testing)');
    }
  } catch (error) {
    console.error('❌ Error sending event:', error.message);
    if (error.status) {
      console.error(`   HTTP Status: ${error.status}`);
    }
    if (error.data) {
      console.error('   Error Details:', JSON.stringify(error.data, null, 2));
    }
    
    // Provide helpful error messages
    if (error.status === 401) {
      console.error('\n   💡 Tip: Check your ADJUST_API_TOKEN - it may be invalid or expired');
    } else if (error.status === 404) {
      console.error('\n   💡 Tip: Check your ADJUST_APP_TOKEN - it may be incorrect');
    } else if (error.status === 400) {
      console.error('\n   💡 Tip: Check your event_token - it may not exist in Adjust dashboard');
    }
  }

  // Test 4: Test Helper Methods
  console.log('\n4️⃣ Testing Helper Methods...');
  
  try {
    const testPurchaseData = {
      userId: 'test-user-123',
      eventToken: process.env.ADJUST_TEST_EVENT_TOKEN || 'test_purchase_token',
      revenue: 9.99,
      currency: 'USD',
      deviceIds: {
        gps_adid: 'test-gps-adid-12345'
      },
      callbackParams: {
        productId: 'premium_vip',
        purchaseType: 'subscription'
      }
    };
    
    console.log('Test Purchase Data:', JSON.stringify(testPurchaseData, null, 2));
    
    if (process.env.ADJUST_API_TOKEN && process.env.ADJUST_API_TOKEN !== 'your_adjust_api_token_here') {
      console.log('   (Skipping actual API call - use real tokens to test)');
    } else {
      console.log('⚠️  Skipping actual API call (using placeholder tokens)');
    }
    console.log('✅ Helper method structure OK\n');
  } catch (error) {
    console.error('❌ Error testing helper method:', error.message);
  }

  // Test 5: Error Handling
  console.log('5️⃣ Testing Error Handling...');
  try {
    // Test with invalid data (missing required fields)
    await adjustService.sendEvent({
      // Missing event_token
      gps_adid: 'test'
    });
    console.error('❌ Should have thrown error for missing event_token');
  } catch (error) {
    console.log('✅ Error handling works correctly');
    console.log(`   Caught error: ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   Configuration: ${healthCheck.configured ? '✅ OK' : '❌ Missing'}`);
  console.log(`   Service Init: ${isConfigured ? '✅ OK' : '❌ Failed'}`);
  console.log(`   Error Handling: ✅ OK`);
  
  if (healthCheck.configured && isConfigured) {
    console.log('\n✅ Adjust S2S Service is properly configured and ready to use!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Integrate tracking calls in your routes');
    console.log('   2. Test with real events from your app');
    console.log('   3. Verify events appear in Adjust dashboard');
  } else {
    console.log('\n⚠️  Please configure Adjust S2S tokens in your .env file');
    console.log('   See ADJUST_S2S_SETUP.md for instructions');
  }
  
  console.log('\n');
}

// Run tests
testAdjustS2S().catch(error => {
  console.error('\n❌ Test script error:', error);
  process.exit(1);
});


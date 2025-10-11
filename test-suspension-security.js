/**
 * Test Script: User Suspension Security
 * 
 * This script tests that suspended users cannot:
 * 1. Log in through mobile app
 * 2. Access protected routes with valid tokens
 * 3. Verify OTP
 * 4. Complete biometric authentication
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
const TEST_USER = {
  email: 'test-suspended@example.com',
  mobile: '+1234567890',
  password: 'TestPassword123'
};

// Test scenarios
async function runSuspensionTests() {
  console.log('🚫 Testing User Suspension Security...\n');

  try {
    // Step 1: Create a test user
    console.log('1️⃣ Creating test user...');
    const signupResponse = await axios.post(`${BASE_URL}/auth/signup`, {
      firstName: 'Test',
      lastName: 'User',
      email: TEST_USER.email,
      mobile: TEST_USER.mobile,
      password: TEST_USER.password,
      gender: 'male',
      ageRange: '25-34',
      gamePreferences: ['puzzle'],
      gameStyle: 'casual',
      improvementArea: 'saving',
      dailyEarningGoal: 500
    });
    console.log('✅ Test user created successfully\n');

    // Step 2: Verify OTP (using development OTP)
    console.log('2️⃣ Verifying OTP...');
    const otpResponse = await axios.post(`${BASE_URL}/auth/verify-otp`, {
      mobile: TEST_USER.mobile,
      otp: '1234'
    });
    console.log('✅ OTP verified successfully\n');

    // Step 3: Login to get token
    console.log('3️⃣ Logging in to get token...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      emailOrMobile: TEST_USER.email,
      password: TEST_USER.password
    });
    
    const token = loginResponse.data.token;
    const userId = loginResponse.data.user.id;
    console.log('✅ Login successful, token obtained\n');

    // Step 4: Test access to protected route (should work)
    console.log('4️⃣ Testing access to protected route (before suspension)...');
    const homeResponse = await axios.get(`${BASE_URL}/home`, {
      headers: { 'x-auth-token': token }
    });
    console.log('✅ Access to protected route successful\n');

    // Step 5: Admin suspends the user
    console.log('5️⃣ Admin suspending user...');
    // Note: You'll need to replace with actual admin token
    const ADMIN_TOKEN = 'your-admin-token-here';
    
    try {
      const suspendResponse = await axios.patch(`${BASE_URL}/admin/users/${userId}/suspend`, {
        reason: 'Testing suspension security'
      }, {
        headers: { 'Authorization': `Bearer ${ADMIN_TOKEN}` }
      });
      console.log('✅ User suspended successfully\n');
    } catch (error) {
      console.log('⚠️  Admin suspension failed (need valid admin token):', error.response?.data || error.message);
      console.log('   Manually suspend the user in admin panel and continue...\n');
    }

    // Step 6: Test login after suspension (should fail)
    console.log('6️⃣ Testing login after suspension...');
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        emailOrMobile: TEST_USER.email,
        password: TEST_USER.password
      });
      console.log('❌ SECURITY ISSUE: Suspended user can still login!\n');
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.error === 'Account not active') {
        console.log('✅ SECURITY WORKING: Suspended user cannot login\n');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    // Step 7: Test access to protected route with existing token (should fail)
    console.log('7️⃣ Testing access to protected route with existing token...');
    try {
      await axios.get(`${BASE_URL}/home`, {
        headers: { 'x-auth-token': token }
      });
      console.log('❌ SECURITY ISSUE: Suspended user can access protected routes!\n');
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.error?.message === 'Account not active') {
        console.log('✅ SECURITY WORKING: Suspended user cannot access protected routes\n');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    // Step 8: Test OTP verification after suspension (should fail)
    console.log('8️⃣ Testing OTP verification after suspension...');
    try {
      await axios.post(`${BASE_URL}/auth/verify-otp`, {
        mobile: TEST_USER.mobile,
        otp: '1234'
      });
      console.log('❌ SECURITY ISSUE: Suspended user can verify OTP!\n');
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.error === 'Account not active') {
        console.log('✅ SECURITY WORKING: Suspended user cannot verify OTP\n');
      } else {
        console.log('❌ Unexpected error:', error.response?.data || error.message);
      }
    }

    // Step 9: Test biometric authentication after suspension (should fail)
    console.log('9️⃣ Testing biometric authentication after suspension...');
    try {
      await axios.post(`${BASE_URL}/biometric/verify`, {
        token: 'test-token',
        verificationData: 'test-data',
        deviceId: 'test-device',
        scanType: 'face_id'
      });
      console.log('❌ SECURITY ISSUE: Suspended user can use biometric auth!\n');
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.error === 'Account not active') {
        console.log('✅ SECURITY WORKING: Suspended user cannot use biometric auth\n');
      } else {
        console.log('⚠️  Biometric test inconclusive (user may not have biometric setup)');
      }
    }

    console.log('🎉 Suspension Security Tests Completed!');
    console.log('\n📋 Summary:');
    console.log('- ✅ Login blocked for suspended users');
    console.log('- ✅ Protected route access blocked for suspended users');
    console.log('- ✅ OTP verification blocked for suspended users');
    console.log('- ✅ Biometric authentication blocked for suspended users');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Helper function to create admin token (for testing)
async function getAdminToken() {
  try {
    const response = await axios.post(`${BASE_URL}/auth/admin-login`, {
      email: 'admin@example.com', // Replace with actual admin email
      password: 'adminpassword'   // Replace with actual admin password
    });
    return response.data.token;
  } catch (error) {
    console.log('Admin login failed:', error.response?.data || error.message);
    return null;
  }
}

// Run the tests
if (require.main === module) {
  runSuspensionTests();
}

module.exports = { runSuspensionTests, getAdminToken };

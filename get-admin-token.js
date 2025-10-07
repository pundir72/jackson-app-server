const jwt = require('jsonwebtoken');
const config = require('./config/config');

/**
 * Script to generate a test admin JWT token
 * This is for testing purposes only
 */

// Test admin user data
const testAdminUser = {
  userId: '507f1f77bcf86cd799439011', // Replace with actual admin user ID
  role: 'ADMIN'
};

// Generate JWT token
const token = jwt.sign(
  { userId: testAdminUser.userId },
  config.JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('🔑 Admin JWT Token Generated:');
console.log('=====================================');
console.log(token);
console.log('=====================================');
console.log('');
console.log('📋 How to use this token:');
console.log('1. Copy the token above');
console.log('2. Use it in your API requests:');
console.log('   Authorization: Bearer ' + token);
console.log('');
console.log('⚠️  Note: This token will expire in 24 hours');
console.log('⚠️  Note: Make sure the user ID exists in your database with role: "ADMIN"');
console.log('');
console.log('🧪 Test the token with:');
console.log('curl -X GET "http://localhost:4001/api/admin/daily-challenges/challenges" \\');
console.log('  -H "Authorization: Bearer ' + token + '"');

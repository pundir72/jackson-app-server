/**
 * Script to verify an admin token and check user role
 * Usage: node verify-admin-token.js <token>
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const config = require('./config/config');
const jwt = require('jsonwebtoken');

async function verifyAdminToken(tokenString) {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Remove "Bearer " prefix if present
    let token = tokenString;
    if (token.startsWith('Bearer ')) {
      token = token.replace('Bearer ', '');
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET);
      console.log('✅ Token is valid');
    } catch (err) {
      console.log('❌ Token is invalid:', err.message);
      process.exit(1);
    }

    // console.log('\n📋 Token Info:');
    // console.log('=====================================');
    // console.log('User ID:', decoded.userId);
    // console.log('Expires:', decoded.exp ? new Date(decoded.exp * 1000) : 'N/A');
    // console.log('=====================================\n');

    // Check user role
    const user = await User.findById(decoded.userId).select('role email mobile firstName lastName');
    
    if (!user) {
      console.log('❌ User not found in database');
      process.exit(1);
    }

    // console.log('👤 User Info:');
    // console.log('=====================================');
    // console.log('ID:', user._id);
    // console.log('Name:', user.firstName, user.lastName);
    // console.log('Email:', user.email);
    // console.log('Mobile:', user.mobile);
    // console.log('Role:', user.role);
    // console.log('=====================================\n');

    // if (user.role === 'ADMIN') {
    //   console.log('✅ User has ADMIN role - Token should work for admin endpoints');
    // } else {
    //   console.log('❌ User does NOT have ADMIN role');
    //   console.log('Current role:', user.role);
    //   console.log('\nTo fix:');
    //   console.log('1. Run: node check-admin-role.js', user.email);
    //   console.log('2. Or update user in database: role = "ADMIN"');
    //   console.log('3. Then login again to get a new token');
    // }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get token from command line
const token = process.argv[2];

if (!token) {
  console.log('Usage: node verify-admin-token.js <token>');
  console.log('Example: node verify-admin-token.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  process.exit(1);
}

verifyAdminToken(token);



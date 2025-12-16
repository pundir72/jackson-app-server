/**
 * Script to check and update user role to ADMIN
 * Usage: node check-admin-role.js <email_or_userId>
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const config = require('./config/config');
const jwt = require('jsonwebtoken');

async function checkAndUpdateAdminRole(identifier) {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find user by email or ID
    let user;
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier);
    } else {
      user = await User.findOne({ 
        $or: [
          { email: identifier },
          { mobile: identifier }
        ]
      });
    }

    if (!user) {
      console.log('❌ User not found');
      process.exit(1);
    }

    // console.log('\n📋 Current User Info:');
    // console.log('=====================================');
    // console.log('ID:', user._id);
    // console.log('Email:', user.email);
    // console.log('Mobile:', user.mobile);
    // console.log('Role:', user.role);
    // console.log('Verified:', user.isVerified);
    // console.log('=====================================\n');

    // if (user.role === 'ADMIN') {
    //   console.log('✅ User already has ADMIN role');
    // } else {
    //   console.log('⚠️  User does NOT have ADMIN role');
    //   console.log('Updating role to ADMIN...');
      
    //   user.role = 'ADMIN';
    //   await user.save();
      
    //   console.log('✅ User role updated to ADMIN');
    // }

    // Test token verification
    // console.log('\n🔑 Testing Token Verification:');
    // console.log('=====================================');
    // console.log('To test, use this token (if you have one):');
    // console.log('Or login again at: POST /api/auth/admin-login');
    // console.log('With email:', user.email);
    // console.log('=====================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get identifier from command line
const identifier = process.argv[2];

if (!identifier) {
  console.log('Usage: node check-admin-role.js <email_or_userId>');
  console.log('Example: node check-admin-role.js admin@example.com');
  process.exit(1);
}

checkAndUpdateAdminRole(identifier);



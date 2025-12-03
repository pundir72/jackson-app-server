const mongoose = require('mongoose');
const User = require('./models/User');
const config = require('./config/config');
const bcrypt = require('bcryptjs');

/**
 * Script to create or update an admin user in the database
 * Run this script to set up an admin user for testing
 */

async function setupAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Admin user details
    const adminEmail = 'admin@example.com';
    const adminPassword = 'Admin123!';
    const adminMobile = '+1234567890';

    // Check if admin user already exists
    let adminUser = await User.findOne({ 
      $or: [
        { email: adminEmail },
        { mobile: adminMobile }
      ]
    });

    if (adminUser) {
      // Update existing user to admin role
      adminUser.role = 'ADMIN';
      adminUser.isVerified = true;
      await adminUser.save();
      console.log('✅ Updated existing user to admin role:', adminUser.email);
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      adminUser = new User({
        firstName: 'Admin',
        lastName: 'User',
        email: adminEmail,
        mobile: adminMobile,
        password: hashedPassword,
        role: 'ADMIN',
        isVerified: true,
        wallet: {
          balance: 0,
          totalEarned: 0,
          totalSpent: 0
        }
      });

      await adminUser.save();
      console.log('✅ Created new admin user:', adminUser.email);
    }

    console.log('');
    console.log('🔑 Admin User Details:');
    console.log('=====================================');
    console.log('Email:', adminUser.email);
    console.log('Mobile:', adminUser.mobile);
    console.log('Password:', adminPassword);
    console.log('Role:', adminUser.role);
    console.log('Verified:', adminUser.isVerified);
    console.log('=====================================');
    console.log('');
    console.log('🧪 Test admin login with:');
    console.log('curl -X POST "http://localhost:4001/api/auth/admin-login" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"email":"' + adminEmail + '","password":"' + adminPassword + '"}\'');
    console.log('');
    console.log('✅ Admin user setup complete!');

  } catch (error) {
    console.error('❌ Error setting up admin user:', error.message);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('📡 Database connection closed');
  }
}

// Run the setup
setupAdminUser();

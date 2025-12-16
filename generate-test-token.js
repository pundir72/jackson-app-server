const jwt = require('jsonwebtoken');
const config = require('./config/config');
const mongoose = require('mongoose');
const User = require('./models/User');

async function generateTestToken() {
  try {
    // Connect to database
    await mongoose.connect(config.MONGODB_URI);
    
    // Find admin user
    const adminUser = await User.findOne({ role: 'ADMIN' });
    
    if (!adminUser) {
      console.log('❌ No admin user found. Please run setup-admin-user.js first');
      return;
    }
    
    console.log('✅ Found admin user:', adminUser.email);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: adminUser._id.toString() },
      config.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // console.log('\n🔑 REAL JWT TOKEN:');
    // console.log('=====================================');
    // console.log(token);
    // console.log('=====================================');
    // console.log('\n📋 Copy this token and use it in your API requests:');
    // console.log('Authorization: Bearer ' + token);
    // console.log('\n🧪 Test command:');
    // console.log(`curl -X GET "http://localhost:4001/api/admin/daily-challenges/challenges" \\`);
    // console.log(`  -H "Authorization: Bearer ${token}"`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

generateTestToken();

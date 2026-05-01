const mongoose = require('mongoose');
const AdjustCallback = require('./models/AdjustCallback');

const MONGODB_URI = "mongodb://jacksonuat:HJKHYUHBE67HDNB@82.25.105.119:27017/jackson-uat?authSource=admin";

async function checkData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const callbacks = await AdjustCallback.find().sort({ createdAt: -1 }).limit(3);
    console.log('Latest AdjustCallbacks:', JSON.stringify(callbacks, null, 2));
    
    const count = await AdjustCallback.countDocuments();
    console.log('Total AdjustCallbacks:', count);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkData();

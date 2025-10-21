const mongoose = require('mongoose');

const securitySettingsSchema = new mongoose.Schema({
  // Basic Settings
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Biometric Authentication Settings
  verificationMethod: {
    type: String,
    // enum: ['native', 'third_party', 'hybrid', 'disabled'],
    default: 'native',
    required: true
  },
  
  // Retry Logic Configuration
  retryType: {
    type: String,
    // enum: ['otp', 'password', 'pin', 'biometric', 'hybrid'],
    default: 'otp',
    required: true
  },
  retryLimit: {
    type: Number,
    required: true,
    min: 1,
    max: 10,
    default: 3
  },
  lockDuration: {
    type: Number,
    required: true,
    min: 1,
    max: 1440, // 24 hours in minutes
    default: 10
  },
  
  // User Role Configuration
  userRole: {
    type: String,
    // enum: ['player', 'admin', 'moderator', 'vip', 'all'],
    default: 'player',
    required: true
  },
  
  // Status
  status: {
    type: String,
    // enum: ['active', 'inactive'],
    default: 'active'
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Instance methods
securitySettingsSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    name: this.name,
    verificationMethod: this.verificationMethod,
    retryType: this.retryType,
    retryLimit: this.retryLimit,
    lockDuration: this.lockDuration,
    userRole: this.userRole,
    status: this.status,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const SecuritySettings = mongoose.model('SecuritySettings', securitySettingsSchema);

module.exports = SecuritySettings;

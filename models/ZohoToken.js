const mongoose = require('mongoose');

const zohoTokenSchema = new mongoose.Schema({
  // Token Information
  access_token: {
    type: String,
    required: true,
    trim: true
  },
  
  refresh_token: {
    type: String,
    required: true,
    trim: true
  },
  
  token_type: {
    type: String,
    default: 'Bearer',
    trim: true
  },
  
  expires_in: {
    type: Number,
    required: true
  },
  
  scope: {
    type: String,
    trim: true
  },
  
  api_domain: {
    type: String,
    trim: true
  },
  
  // Client Configuration
  client_id: {
    type: String,
    required: true,
    trim: true
  },
  
  client_secret: {
    type: String,
    required: true,
    trim: true
  },
  
  // Token Management
  expires_at: {
    type: Date,
    required: false
  },
  
  is_active: {
    type: Boolean,
    default: true
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  last_refreshed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
zohoTokenSchema.index({ is_active: 1, expires_at: 1 });
zohoTokenSchema.index({ client_id: 1 });

// Instance methods
zohoTokenSchema.methods.isExpired = function() {
  return new Date() >= this.expires_at;
};

zohoTokenSchema.methods.isExpiringSoon = function(minutes = 5) {
  const now = new Date();
  const expirationTime = new Date(this.expires_at.getTime() - (minutes * 60 * 1000));
  return now >= expirationTime;
};

zohoTokenSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    token_type: this.token_type,
    expires_in: this.expires_in,
    scope: this.scope,
    api_domain: this.api_domain,
    expires_at: this.expires_at,
    is_active: this.is_active,
    is_expired: this.isExpired(),
    is_expiring_soon: this.isExpiringSoon(),
    last_refreshed: this.last_refreshed,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

zohoTokenSchema.methods.getTokenForAPI = function() {
  return {
    access_token: this.access_token,
    refresh_token: this.refresh_token,
    token_type: this.token_type,
    expires_in: this.expires_in,
    scope: this.scope,
    api_domain: this.api_domain
  };
};

// Static methods
zohoTokenSchema.statics.findActiveToken = function(clientId) {
  return this.findOne({ 
    client_id: clientId, 
    is_active: true 
  }).sort({ createdAt: -1 });
};

zohoTokenSchema.statics.deactivateAllTokens = function(clientId) {
  return this.updateMany(
    { client_id: clientId, is_active: true },
    { is_active: false }
  );
};

// Pre-save middleware to calculate expiration time
zohoTokenSchema.pre('save', function(next) {
  // Always calculate expires_at if expires_in is available
  if (this.expires_in && (!this.expires_at || this.isModified('expires_in'))) {
    this.expires_at = new Date(Date.now() + (this.expires_in * 1000));
  }
  next();
});

const ZohoToken = mongoose.model('ZohoToken', zohoTokenSchema);

module.exports = ZohoToken;

// OTP Configuration
// This file controls how OTP is handled in the application

module.exports = {
  // 🚨 DEVELOPMENT MODE SETTINGS
  development: {
    // Set to true to use hardcoded OTP (bypasses Twilio)
    useHardcodedOTP: true,
    
    // Hardcoded OTP code for all users
    hardcodedOTP: '8078',
    
    // Whether to return OTP in API response (for testing)
    returnOTPInResponse: true,
    
    // OTP expiration time in milliseconds (5 minutes)
    otpExpiryMs: 5 * 60 * 1000,
    
  },
  
  // 🚀 PRODUCTION MODE SETTINGS
  production: {
    // Set to false to use real SMS OTP
    useHardcodedOTP: false,
    
    // OTP expiration time in milliseconds (5 minutes)
    otpExpiryMs: 5 * 60 * 1000,
    
    // Whether to return OTP in API response (should be false in production)
    returnOTPInResponse: false
  },
  
  // Get current configuration based on environment
  getCurrentConfig: function() {
    const isDevelopment = process.env.ENVIRONMENT === 'development' || !process.env.ENVIRONMENT;
    return isDevelopment ? this.development : this.production;
  },
  
  // Helper function to check if hardcoded OTP is enabled
  isHardcodedOTPEnabled: function() {
    return this.getCurrentConfig().useHardcodedOTP;
  },
  
  // Helper function to get OTP code
  getOTPCode: function() {
    const config = this.getCurrentConfig();
    if (config.useHardcodedOTP) {
      return config.hardcodedOTP;
    }
    // Generate random OTP for production
    return Math.floor(1000 + Math.random() * 9000).toString();
  },
  
  // Helper function to get OTP expiry time
  getOTPExpiry: function() {
    const config = this.getCurrentConfig();
    return new Date(Date.now() + config.otpExpiryMs);
  },
  
  // Helper function to check if OTP should be returned in response
  shouldReturnOTPInResponse: function() {
    return this.getCurrentConfig().returnOTPInResponse;
  }
};

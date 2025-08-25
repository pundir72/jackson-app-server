const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema({
    mobile: {
        type: String,
        required: true,
        trim: true
    },
    otp: {
        type: String,
        required: true,
        length: 4
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0
    },
    maxAttempts: {
        type: Number,
        default: 5
    },
    expiresAt: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    verifiedAt: {
        type: Date
    },
    // Store partial user data during OTP verification
    userData: {
        firstName: String,
        lastName: String,
        email: String,
        gender: String,
        ageRange: String,
        gamePreferences: [String],
        gameStyle: String,
        improvementArea: String,
        dailyEarningGoal: String,
        socialTag: String
    }
}, {
    timestamps: true
});

// Index for mobile number and OTP lookup
otpVerificationSchema.index({ mobile: 1, otp: 1 });
otpVerificationSchema.index({ mobile: 1, isVerified: 1 });
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Method to check if OTP is expired
otpVerificationSchema.methods.isExpired = function() {
    return new Date() > this.expiresAt;
};

// Method to check if max attempts exceeded
otpVerificationSchema.methods.maxAttemptsExceeded = function() {
    return this.attempts >= this.maxAttempts;
};

// Method to increment attempts
otpVerificationSchema.methods.incrementAttempts = function() {
    this.attempts += 1;
    return this.save();
};

// Method to mark as verified
otpVerificationSchema.methods.markVerified = function() {
    this.isVerified = true;
    this.verifiedAt = new Date();
    return this.save();
};

// Static method to find valid OTP verification
otpVerificationSchema.statics.findValidVerification = function(mobile) {
    return this.findOne({
        mobile: mobile,
        isVerified: true,
        expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });
};

// Static method to cleanup expired verifications
otpVerificationSchema.statics.cleanupExpired = function() {
    return this.deleteMany({
        expiresAt: { $lt: new Date() }
    });
};

const OTPVerification = mongoose.model('OTPVerification', otpVerificationSchema);

module.exports = OTPVerification;

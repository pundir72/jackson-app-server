const User = require('../models/User');
const UserPreference = require('../models/UserPreference');
const { 
  generateToken, 
  verifyPassword, 
  generateOTP, 
  generateReferralCode,
  sanitizePhone,
  successResponse,
  errorResponse 
} = require('../utils/helpers');
const { sendEmail } = require('../services/emailService');
const { sendSMS } = require('../services/smsService');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

// Register new user
const register = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      dateOfBirth,
      gender,
      ageRange,
      referralCode,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json(errorResponse('User with this email already exists', 400));
    }

    // Check if phone is already registered
    if (phone) {
      const existingPhone = await User.findByPhone(sanitizePhone(phone));
      if (existingPhone) {
        return res.status(400).json(errorResponse('Phone number already registered', 400));
      }
    }

    // Check referral code if provided
    let referredBy = null;
    if (referralCode) {
      const referrer = await User.findByReferralCode(referralCode);
      if (!referrer) {
        return res.status(400).json(errorResponse('Invalid referral code', 400));
      }
      referredBy = referrer.id;
    }

    // Create user
    const user = await User.create({
      email,
      password,
      firstName,
      lastName,
      phone: phone ? sanitizePhone(phone) : null,
      dateOfBirth,
      gender,
      ageRange,
      referredBy,
      referralCode: generateReferralCode(Date.now()),
    });

    // Create user preferences
    await UserPreference.create({
      userId: user.id,
    });

    // Generate OTP for email verification
    const otp = generateOTP();
    await cache.set(`email_otp_${user.id}`, otp, 300); // 5 minutes

    // Send verification email
    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email - Jackson App',
      template: 'emailVerification',
      data: {
        name: user.firstName,
        otp,
        appName: 'Jackson App',
      },
    });

    // Generate tokens
    const accessToken = generateToken({ userId: user.id, email: user.email });
    const refreshToken = generateToken({ userId: user.id, type: 'refresh' }, '30d');

    logger.info(`New user registered: ${user.email}`);

    res.status(201).json(successResponse({
      user: user.toJSON(),
      accessToken,
      refreshToken,
      message: 'Registration successful. Please verify your email.',
    }, 'Registration successful', 201));

  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json(errorResponse('Registration failed', 500));
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json(errorResponse('Invalid credentials', 401));
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json(errorResponse('Account is deactivated', 401));
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json(errorResponse('Invalid credentials', 401));
    }

    // Update login info
    user.lastLoginAt = new Date();
    user.loginCount += 1;
    await user.save();

    // Generate tokens
    const accessToken = generateToken({ userId: user.id, email: user.email });
    const refreshToken = generateToken({ userId: user.id, type: 'refresh' }, '30d');

    logger.info(`User logged in: ${user.email}`);

    res.json(successResponse({
      user: user.toJSON(),
      accessToken,
      refreshToken,
    }, 'Login successful'));

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json(errorResponse('Login failed', 500));
  }
};

// Verify email with OTP
const verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Check if already verified
    if (user.isEmailVerified) {
      return res.status(400).json(errorResponse('Email already verified', 400));
    }

    // Verify OTP
    const storedOTP = await cache.get(`email_otp_${user.id}`);
    if (!storedOTP || storedOTP !== otp) {
      return res.status(400).json(errorResponse('Invalid or expired OTP', 400));
    }

    // Mark email as verified
    user.isEmailVerified = true;
    await user.save();

    // Clear OTP from cache
    await cache.del(`email_otp_${user.id}`);

    logger.info(`Email verified: ${user.email}`);

    res.json(successResponse({
      user: user.toJSON(),
    }, 'Email verified successfully'));

  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json(errorResponse('Email verification failed', 500));
  }
};

// Verify phone with OTP
const verifyPhone = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const sanitizedPhone = sanitizePhone(phone);

    // Find user by phone
    const user = await User.findByPhone(sanitizedPhone);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Check if already verified
    if (user.isPhoneVerified) {
      return res.status(400).json(errorResponse('Phone already verified', 400));
    }

    // Verify OTP
    const storedOTP = await cache.get(`phone_otp_${user.id}`);
    if (!storedOTP || storedOTP !== otp) {
      return res.status(400).json(errorResponse('Invalid or expired OTP', 400));
    }

    // Mark phone as verified
    user.isPhoneVerified = true;
    await user.save();

    // Clear OTP from cache
    await cache.del(`phone_otp_${user.id}`);

    logger.info(`Phone verified: ${user.phone}`);

    res.json(successResponse({
      user: user.toJSON(),
    }, 'Phone verified successfully'));

  } catch (error) {
    logger.error('Phone verification error:', error);
    res.status(500).json(errorResponse('Phone verification failed', 500));
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Generate new OTP
    const otp = generateOTP();
    await cache.set(`email_otp_${user.id}`, otp, 300); // 5 minutes

    // Send verification email
    await sendEmail({
      to: user.email,
      subject: 'Verify Your Email - Jackson App',
      template: 'emailVerification',
      data: {
        name: user.firstName,
        otp,
        appName: 'Jackson App',
      },
    });

    logger.info(`OTP resent to: ${user.email}`);

    res.json(successResponse({}, 'OTP sent successfully'));

  } catch (error) {
    logger.error('Resend OTP error:', error);
    res.status(500).json(errorResponse('Failed to send OTP', 500));
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Generate reset token
    const resetToken = generateToken({ userId: user.id, type: 'reset' }, '1h');
    await cache.set(`reset_token_${user.id}`, resetToken, 3600); // 1 hour

    // Send reset email
    await sendEmail({
      to: user.email,
      subject: 'Reset Your Password - Jackson App',
      template: 'passwordReset',
      data: {
        name: user.firstName,
        resetToken,
        appName: 'Jackson App',
      },
    });

    logger.info(`Password reset requested for: ${user.email}`);

    res.json(successResponse({}, 'Password reset email sent'));

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json(errorResponse('Failed to send reset email', 500));
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    // Verify token
    const decoded = generateToken(token);
    const userId = decoded.userId;

    // Check if token exists in cache
    const storedToken = await cache.get(`reset_token_${userId}`);
    if (!storedToken || storedToken !== token) {
      return res.status(400).json(errorResponse('Invalid or expired reset token', 400));
    }

    // Find user
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Update password
    user.password = password;
    await user.save();

    // Clear reset token from cache
    await cache.del(`reset_token_${userId}`);

    logger.info(`Password reset for: ${user.email}`);

    res.json(successResponse({}, 'Password reset successfully'));

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json(errorResponse('Password reset failed', 500));
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = generateToken(refreshToken);
    if (decoded.type !== 'refresh') {
      return res.status(401).json(errorResponse('Invalid refresh token', 401));
    }

    // Find user
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json(errorResponse('User not found or inactive', 401));
    }

    // Generate new tokens
    const newAccessToken = generateToken({ userId: user.id, email: user.email });
    const newRefreshToken = generateToken({ userId: user.id, type: 'refresh' }, '30d');

    res.json(successResponse({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }, 'Token refreshed successfully'));

  } catch (error) {
    logger.error('Refresh token error:', error);
    res.status(500).json(errorResponse('Token refresh failed', 500));
  }
};

// Logout
const logout = async (req, res) => {
  try {
    // In a real application, you might want to blacklist the token
    // For now, we'll just return a success response
    res.json(successResponse({}, 'Logged out successfully'));
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json(errorResponse('Logout failed', 500));
  }
};

module.exports = {
  register,
  login,
  verifyEmail,
  verifyPhone,
  resendOTP,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
}; 
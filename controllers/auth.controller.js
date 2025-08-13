const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../utils/email');
const { generateError } = require('../utils/error');
const { config } = require('../config/config');

// Register new user
const register = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
    if (existingUser) {
      throw generateError('User already exists', 400);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, config.passwordSaltRounds);

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      mobile,
      password: hashedPassword,
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    throw error;
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      throw generateError('Invalid credentials', 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw generateError('Invalid credentials', 401);
    }

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    throw error;
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      throw generateError('User not found', 404);
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Send reset email
    await sendEmail(
      user.email,
      'Password Reset Request',
      `You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n
      Please click on the following link, or paste this into your browser to complete the process:\n\n
      ${config.clientUrl}/reset-password/${resetToken}\n\n
      If you did not request this, please ignore this email and your password will remain unchanged.\n`
    );

    res.json({
      success: true,
      message: 'Password reset email sent',
    });
  } catch (error) {
    throw error;
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw generateError('Invalid or expired token', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, config.passwordSaltRounds);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful',
    });
  } catch (error) {
    throw error;
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      throw generateError('User not found', 404);
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    throw error;
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = ['firstName', 'lastName', 'email', 'mobile', 'socialTag'];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      throw generateError('Invalid updates', 400);
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      throw generateError('User not found', 404);
    }

    updates.forEach(update => user[update] = req.body[update]);
    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user,
    });
  } catch (error) {
    throw error;
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      throw generateError('User not found', 404);
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw generateError('Current password is incorrect', 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, config.passwordSaltRounds);
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    throw error;
  }
};

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
};

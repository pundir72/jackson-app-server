const User = require('../models/User');
const UserPreference = require('../models/UserPreference');
const { successResponse, errorResponse, generateReferralCode } = require('../utils/helpers');
const logger = require('../utils/logger');

// Get user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Get user preferences separately since Mongoose doesn't have include
    const preferences = await UserPreference.findOne({ userId: req.userId });

    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    res.json(successResponse({
      user: user.toJSON(),
      preferences: preferences ? preferences.toJSON() : null,
    }, 'Profile retrieved successfully'));

  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json(errorResponse('Failed to get profile', 500));
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      gender,
      ageRange,
      timezone,
      language,
      currency,
    } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Update user fields
    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone) updateData.phone = phone;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (gender) updateData.gender = gender;
    if (ageRange) updateData.ageRange = ageRange;
    if (timezone) updateData.timezone = timezone;
    if (language) updateData.language = language;
    if (currency) updateData.currency = currency;

    await user.updateOne(updateData);

    logger.info(`Profile updated for user: ${user.email}`);

    res.json(successResponse({
      user: user.toJSON(),
    }, 'Profile updated successfully'));

  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json(errorResponse('Failed to update profile', 500));
  }
};

// Upload avatar
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No file uploaded', 400));
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Update avatar path
    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    await user.updateOne({ avatar: avatarPath });

    logger.info(`Avatar uploaded for user: ${user.email}`);

    res.json(successResponse({
      avatar: avatarPath,
    }, 'Avatar uploaded successfully'));

  } catch (error) {
    logger.error('Upload avatar error:', error);
    res.status(500).json(errorResponse('Failed to upload avatar', 500));
  }
};

// Get user preferences
const getPreferences = async (req, res) => {
  try {
    const preferences = await UserPreference.findByUserId(req.userId);
    
    if (!preferences) {
      return res.status(404).json(errorResponse('Preferences not found', 404));
    }

    res.json(successResponse({
      preferences: preferences.toJSON(),
    }, 'Preferences retrieved successfully'));

  } catch (error) {
    logger.error('Get preferences error:', error);
    res.status(500).json(errorResponse('Failed to get preferences', 500));
  }
};

// Update user preferences
const updatePreferences = async (req, res) => {
  try {
    const preferences = await UserPreference.findByUserId(req.userId);
    
    if (!preferences) {
      return res.status(404).json(errorResponse('Preferences not found', 404));
    }

    // Update preferences
    await preferences.update(req.body);

    logger.info(`Preferences updated for user: ${req.userId}`);

    res.json(successResponse({
      preferences: preferences.toJSON(),
    }, 'Preferences updated successfully'));

  } catch (error) {
    logger.error('Update preferences error:', error);
    res.status(500).json(errorResponse('Failed to update preferences', 500));
  }
};

// Update location
const updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, locationEnabled } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    await user.updateOne({
      latitude,
      longitude,
      locationEnabled,
    });

    logger.info(`Location updated for user: ${user.email}`);

    res.json(successResponse({
      location: {
        latitude,
        longitude,
        locationEnabled,
      },
    }, 'Location updated successfully'));

  } catch (error) {
    logger.error('Update location error:', error);
    res.status(500).json(errorResponse('Failed to update location', 500));
  }
};

// Update notifications
const updateNotifications = async (req, res) => {
  try {
    const { pushNotifications, emailNotifications, smsNotifications } = req.body;

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    await user.updateOne({
      pushNotifications,
      emailNotifications,
      smsNotifications,
    });

    logger.info(`Notifications updated for user: ${user.email}`);

    res.json(successResponse({
      notifications: {
        pushNotifications,
        emailNotifications,
        smsNotifications,
      },
    }, 'Notifications updated successfully'));

  } catch (error) {
    logger.error('Update notifications error:', error);
    res.status(500).json(errorResponse('Failed to update notifications', 500));
  }
};

// Get user stats
const getStats = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Calculate additional stats
    const stats = {
      totalPoints: user.totalPoints,
      totalCashback: user.totalCashback,
      totalEarnings: user.totalEarnings,
      streakDays: user.streakDays,
      loginCount: user.loginCount,
      daysSinceRegistration: Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24)),
      averageDailyEarnings: user.totalEarnings / Math.max(1, Math.floor((new Date() - new Date(user.createdAt)) / (1000 * 60 * 60 * 24))),
      vipStatus: user.isVip,
      vipExpiry: user.vipExpiresAt,
    };

    res.json(successResponse({
      stats,
    }, 'Stats retrieved successfully'));

  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json(errorResponse('Failed to get stats', 500));
  }
};

// Get user achievements
const getAchievements = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Mock achievements - in a real app, these would come from a database
    const achievements = [
      {
        id: 1,
        title: 'First Steps',
        description: 'Complete your first challenge',
        icon: '🎯',
        unlocked: user.loginCount > 0,
        unlockedAt: user.createdAt,
      },
      {
        id: 2,
        title: 'Point Collector',
        description: 'Earn 100 points',
        icon: '💰',
        unlocked: user.totalPoints >= 100,
        unlockedAt: user.totalPoints >= 100 ? new Date() : null,
      },
      {
        id: 3,
        title: 'Cashback King',
        description: 'Earn $10 in cashback',
        icon: '👑',
        unlocked: user.totalCashback >= 10,
        unlockedAt: user.totalCashback >= 10 ? new Date() : null,
      },
      {
        id: 4,
        title: 'Streak Master',
        description: 'Maintain a 7-day streak',
        icon: '🔥',
        unlocked: user.streakDays >= 7,
        unlockedAt: user.streakDays >= 7 ? new Date() : null,
      },
      {
        id: 5,
        title: 'VIP Member',
        description: 'Upgrade to VIP membership',
        icon: '⭐',
        unlocked: user.isVip,
        unlockedAt: user.isVip ? new Date() : null,
      },
    ];

    res.json(successResponse({
      achievements,
    }, 'Achievements retrieved successfully'));

  } catch (error) {
    logger.error('Get achievements error:', error);
    res.status(500).json(errorResponse('Failed to get achievements', 500));
  }
};

// Get user referrals
const getReferrals = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Get users referred by this user
    const referrals = await User.find({ referredBy: req.userId })
      .select('firstName lastName email createdAt');

    // Get referrer info
    let referrer = null;
    if (user.referredBy) {
      referrer = await User.findById(user.referredBy)
        .select('firstName lastName email');
    }

    res.json(successResponse({
      referrals: referrals.map(r => r.toJSON()),
      referrer: referrer ? referrer.toJSON() : null,
      referralCode: user.referralCode,
    }, 'Referrals retrieved successfully'));

  } catch (error) {
    logger.error('Get referrals error:', error);
    res.status(500).json(errorResponse('Failed to get referrals', 500));
  }
};

// Generate new referral code
const generateNewReferralCode = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Use the imported helper function
    const newReferralCode = generateReferralCode(user.id);
    await user.updateOne({ referralCode: newReferralCode });

    logger.info(`New referral code generated for user: ${user.email}`);

    res.json(successResponse({
      referralCode: newReferralCode,
    }, 'Referral code generated successfully'));

  } catch (error) {
    logger.error('Generate referral code error:', error);
    res.status(500).json(errorResponse('Failed to generate referral code', 500));
  }
};

// Delete account
const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json(errorResponse('User not found', 404));
    }

    // Soft delete - mark as inactive
    await user.updateOne({ isActive: false });

    logger.info(`Account deactivated for user: ${user.email}`);

    res.json(successResponse({}, 'Account deleted successfully'));

  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json(errorResponse('Failed to delete account', 500));
  }
};

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  getPreferences,
  updatePreferences,
  updateLocation,
  updateNotifications,
  getStats,
  getAchievements,
  getReferrals,
  generateReferralCode: generateNewReferralCode,
  deleteAccount,
}; 
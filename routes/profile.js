const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const config = require("../config/config");

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure directory exists
    const fs = require("fs");
    const dir = "uploads/avatars";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter to only allow images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Get user profile (optimized)
router.get("/", protect, async (req, res) => {
  try {
    const { getOptimizedProfile } = require("../utils/optimizedProfile");

    const profileData = await getOptimizedProfile(req.user.userId);

    if (!profileData) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(profileData);
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({
      error: "Fetch failed",
      message: "Failed to fetch profile. Please try again.",
    });
  }
});

// Update profile
router.put("/", protect, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      status,
      mobile,
      bio,
      theme,
      email,
      socialTag,
      username,
    } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update basic profile fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (status) user.profile.status = status;
    if (bio) user.profile.bio = bio;
    if (theme && ["light", "dark"].includes(theme)) {
      user.profile.theme = theme;
    }
    if (socialTag !== undefined) user.socialTag = socialTag;
    // Update username with validation & uniqueness
    if (username !== undefined) {
      if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
        return res.status(400).json({
          error: "Invalid username",
          message:
            "Username must be 3-20 chars, letters/numbers/underscores only",
        });
      }
      if (username) {
        const existingUsername = await User.findOne({
          username: username,
          _id: { $ne: user._id },
        });
        if (existingUsername) {
          return res.status(400).json({
            error: "Username already exists",
            message: "Please choose a different username",
          });
        }
      }
      user.username = username || undefined;
    }

    // Update email with validation
    if (email) {
      // Check if email is already taken by another user
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: user._id },
      });

      if (existingUser) {
        return res.status(400).json({
          error: "Email already exists",
          message:
            "This email address is already registered with another account",
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: "Invalid email format",
          message: "Please enter a valid email address",
        });
      }

      user.email = email.toLowerCase();
    }

    // Update mobile number with validation
    if (mobile) {
      // Check if mobile number is already taken by another user
      const existingUser = await User.findOne({
        mobile: mobile,
        _id: { $ne: user._id },
      });

      if (existingUser) {
        return res.status(400).json({
          error: "Mobile number already exists",
          message:
            "This mobile number is already registered with another account",
        });
      }

      // Validate mobile number format (international support)
      const cleanNumber = mobile.replace(/\D/g, "");

      // Check if mobile number length is valid (7-15 digits)
      if (cleanNumber.length < 7 || cleanNumber.length > 15) {
        return res.status(400).json({
          error: "Invalid mobile number",
          message:
            "Please enter a valid mobile number (7-15 digits, with or without country code)",
        });
      }

      // Store the normalized mobile number (with country code)
      user.mobile = cleanNumber;
    }

    await user.save();

    // Invalidate user caches
    const { invalidateUserCaches } = require("../utils/optimizedProfile");
    invalidateUserCaches(req.user.userId);

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        mobile: user.mobile,
        email: user.email,
        profile: user.profile,
        socialTag: user.socialTag,
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        error: "Validation failed",
        message: validationErrors.join(", "),
      });
    }

    res.status(500).json({
      error: "Update failed",
      message: "Failed to update profile. Please try again.",
    });
  }
});

// Update mobile number only
router.put("/mobile", protect, async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        error: "Mobile number required",
        message: "Please provide a mobile number",
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if mobile number is already taken by another user
    const existingUser = await User.findOne({
      mobile: mobile,
      _id: { $ne: user._id },
    });

    if (existingUser) {
      return res.status(400).json({
        error: "Mobile number already exists",
        message:
          "This mobile number is already registered with another account",
      });
    }

    // Validate mobile number format (international support)
    const cleanNumber = mobile.replace(/\D/g, "");

    // Check if mobile number length is valid (7-15 digits)
    if (cleanNumber.length < 7 || cleanNumber.length > 15) {
      return res.status(400).json({
        error: "Invalid mobile number",
        message:
          "Please enter a valid mobile number (7-15 digits, with or without country code)",
      });
    }

    // Store the normalized mobile number (with country code)
    user.mobile = cleanNumber;

    await user.save();

    res.json({
      message: "Mobile number updated successfully",
      mobile: user.mobile,
    });
  } catch (error) {
    console.error("Mobile update error:", error);

    if (error.name === "ValidationError") {
      const validationErrors = Object.values(error.errors).map(
        (err) => err.message
      );
      return res.status(400).json({
        error: "Validation failed",
        message: validationErrors.join(", "),
      });
    }

    res.status(500).json({
      error: "Update failed",
      message: "Failed to update mobile number. Please try again.",
    });
  }
});

// Upload profile avatar
router.post("/avatar", [protect, upload.single("avatar")], async (req, res) => {
  console.log("Avatar upload route hit");
  console.log("Request headers:", req.headers);
  console.log("Request body:", req.body);
  console.log("Request file:", req.file);
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
        message: "Please select an image file to upload",
      });
    }

    console.log("File uploaded:", req.file);

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update avatar with full URL
    const avatarPath = req.file.path;
    user.profile.avatar = `${config.IMAGE_BASE_URL}/${avatarPath}`;
    await user.save();

    res.json({
      message: "Avatar uploaded successfully",
      avatar: `${config.IMAGE_BASE_URL}/${avatarPath}`,
      filename: req.file.filename,
    });
  } catch (error) {
    console.error("Avatar upload error:", error);

    // Handle multer errors specifically
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large",
        message: "File size must be less than 5MB",
      });
    }

    if (error.message === "Only image files are allowed!") {
      return res.status(400).json({
        error: "Invalid file type",
        message: "Only image files (JPEG, PNG, GIF) are allowed",
      });
    }

    res.status(500).json({
      error: "Upload failed",
      message: "Failed to upload avatar. Please try again.",
    });
  }
});

// Get user stats (optimized)
router.get("/stats", protect, async (req, res) => {
  try {
    const { getOptimizedStats } = require("../utils/optimizedProfile");

    const stats = await getOptimizedStats(req.user.userId);

    if (!stats) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(stats);
  } catch (error) {
    console.error("Error getting user stats:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get avatar by filename
router.get("/avatar/:filename", (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../uploads/avatars", filename);

    // Check if file exists
    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Avatar not found" });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error("Avatar retrieval error:", error);
    res.status(500).json({ error: "Failed to retrieve avatar" });
  }
});

// Get user achievements (optimized with pagination)
router.get("/achievements", protect, async (req, res) => {
  try {
    const { category, status, page = 1, limit = 10 } = req.query;
    const { getOptimizedAchievements } = require("../utils/optimizedProfile");

    const options = {
      category: category || null,
      status: status || null,
      page: parseInt(page),
      limit: parseInt(limit),
    };

    const result = await getOptimizedAchievements(req.user.userId, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error getting user achievements:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get achievements",
    });
  }
});

// Get user leadership data (optimized)
router.get("/leadership", protect, async (req, res) => {
  try {
    const { getCachedUserRanks } = require("../utils/optimizedProfile");

    const ranks = await getCachedUserRanks(req.user.userId);

    res.json({
      success: true,
      data: {
        ranks,
      },
    });
  } catch (error) {
    console.error("Error getting leadership data:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get leadership data",
    });
  }
});

// Get unread notifications
router.get("/notifications", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("notifications");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get only unread and not dismissed notifications
    const unreadNotifications = (user.notifications || []).filter(
      (notif) => !notif.read && !notif.dismissed
    );

    // Sort by sentAt descending (newest first)
    unreadNotifications.sort((a, b) => {
      const dateA = new Date(a.sentAt || 0);
      const dateB = new Date(b.sentAt || 0);
      return dateB - dateA;
    });

    res.json({
      success: true,
      data: unreadNotifications,
    });
  } catch (error) {
    console.error("Error getting notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get notifications",
      message: error.message,
    });
  }
});

// Dismiss notification (mark as dismissed permanently)
router.post("/notifications/:notificationId/dismiss", protect, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Find and update the notification
    if (!user.notifications || user.notifications.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    const notification = user.notifications.id(notificationId);
    if (!notification) {
      return res.status(404).json({
        success: false,
        error: "Notification not found",
      });
    }

    // Mark as dismissed (permanently hide)
    notification.dismissed = true;
    notification.read = true;
    await user.save();

    res.json({
      success: true,
      message: "Notification dismissed successfully",
      data: {
        notificationId: notification._id,
        dismissed: true,
      },
    });
  } catch (error) {
    console.error("Error dismissing notification:", error);
    res.status(500).json({
      success: false,
      error: "Failed to dismiss notification",
      message: error.message,
    });
  }
});

// Get user dashboard (optimized) - Complete mobile app dashboard
router.get("/dashboard", protect, async (req, res) => {
  try {
    const {
      getOptimizedProfile,
      getOptimizedStats,
    } = require("../utils/optimizedProfile");

    const [profileData, stats] = await Promise.all([
      getOptimizedProfile(req.user.userId),
      getOptimizedStats(req.user.userId),
    ]);

    if (!profileData || !stats) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentXP = profileData.xp?.current || 0;
    const totalXP = profileData.xp?.total || 0;
    const tier = getTierFromXP(currentXP);

    res.json({
      success: true,
      data: {
        // Complete user profile
        user: {
          id: profileData._id,
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          username: profileData.username || null,
          email: profileData.email || null,
          mobile: profileData.mobile,
          socialTag: profileData.socialTag || null,
          avatar: profileData.profile?.avatar || null,
          status: profileData.profile?.status || null,
          bio: profileData.profile?.bio || null,
          theme: profileData.profile?.theme || "light",
          tier: tier,
          vipLevel: profileData.vip?.level || "free",
          vipActive: profileData.vip?.isActive || false,
          vipExpires: profileData.vip?.expires || null,
        },
        // Wallet & XP details
        wallet: {
          balance: profileData.wallet?.balance || 0,
          lastUpdated: profileData.wallet?.lastUpdated || null,
        },
        xp: {
          current: currentXP,
          total: totalXP,
          nextLevelTarget: stats.nextLevelTarget,
          xpToNext: stats.xpToNext,
          progressPercentage:
            stats.nextLevelTarget > 0
              ? Math.round((currentXP / stats.nextLevelTarget) * 100)
              : 100,
        },
        // Progress stats
        progress: {
          gamesPlayed: stats.gamesPlayed,
          surveysCompleted: stats.surveysCompleted,
          racesCompleted: stats.racesCompleted,
          currentStreak: stats.streak,
          totalXP: currentXP,
          nextLevelTarget: stats.nextLevelTarget,
          xpToNext: stats.xpToNext,
          walletBalance: stats.balance,
          badgesEarned: stats.badges,
          titlesEarned: stats.titles,
        },
        // Achievements
        achievements: {
          recent: profileData.achievements?.recent || [],
          total: profileData.achievements?.total || 0,
          stats: stats.achievements || {
            total: 0,
            completed: 0,
            claimed: 0,
            inProgress: 0,
          },
        },
        // Leadership rankings
        leadership: {
          overallRank: profileData.leadership?.overallRank || null,
          percentile: profileData.leadership?.percentile || null,
          rankings: stats.rankings || {},
        },
        // Badges & Titles
        badges: profileData.badges || [],
        titles: profileData.titles || [],
        // VIP details
        vip: {
          level: profileData.vip?.level || "free",
          isActive: profileData.vip?.isActive || false,
          expires: profileData.vip?.expires || null,
          benefits: profileData.vip?.benefits || [],
        },
        // Location
        location: profileData.location || null,
        // Last IP
        lastIp: profileData.lastIp || null,
      },
    });
  } catch (error) {
    console.error("Error getting user dashboard:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get dashboard data",
    });
  }
});

// Helper function to get tier from XP
function getTierFromXP(xp) {
  if (xp >= 10000) return "expert";
  if (xp >= 5000) return "senior";
  if (xp >= 1000) return "mid";
  return "junior";
}

module.exports = router;

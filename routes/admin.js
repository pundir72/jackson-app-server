const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { body, validationResult, query } = require("express-validator");
const protect = require("../middleware/auth");
const VIPTier = require("../models/VIPTier");
const VIPSubscription = require("../models/VIPSubscription");
const User = require("../models/User");
const DailyChallenge = require("../models/DailyChallenge");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const BonusDay = require("../models/BonusDay");
const XPMultiplier = require("../models/XPMultiplier");
const Transaction = require("../models/Transaction");
const Game = require("../models/Game");
const Referral = require("../models/Referral");
const { getVIPPricing } = require("../utils/pricing");
const {
  calculateRetention,
  getRetentionTrend,
} = require("../utils/retentionCalculator");

// Admin authentication middleware
const { adminAuth } = require("../middleware/adminAuth");

// ==================== VIP TIERS MANAGEMENT ====================

// Get all VIP tiers (admin view)
router.get("/vip-tiers", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "all" } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { tierId: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status !== "all") {
      query.active = status === "active";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tiers = await VIPTier.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VIPTier.countDocuments(query);

    res.json({
      success: true,
      data: {
        tiers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting VIP tiers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get VIP tiers",
      error: error.message,
    });
  }
});

// Get single VIP tier by ID
router.get("/vip-tiers/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const tier = await VIPTier.findById(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: "VIP tier not found",
      });
    }

    res.json({
      success: true,
      data: tier,
    });
  } catch (error) {
    console.error("Error getting VIP tier:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get VIP tier",
      error: error.message,
    });
  }
});

// Create new VIP tier
router.post(
  "/vip-tiers",
  adminAuth,
  [
    body("tierId")
      .isIn(["bronze", "gold", "platinum"])
      .withMessage("Invalid tier ID"),
    body("name").notEmpty().withMessage("Name is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("pricing.monthly")
      .isNumeric()
      .withMessage("Monthly price must be a number"),
    body("pricing.yearly")
      .isNumeric()
      .withMessage("Yearly price must be a number"),
    body("benefits").isArray().withMessage("Benefits must be an array"),
    body("order").isNumeric().withMessage("Order must be a number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const tierData = req.body;

      // Check if tier ID already exists
      const existingTier = await VIPTier.findOne({ tierId: tierData.tierId });
      if (existingTier) {
        return res.status(400).json({
          success: false,
          message: "VIP tier with this ID already exists",
        });
      }

      const tier = new VIPTier(tierData);
      await tier.save();

      res.status(201).json({
        success: true,
        message: "VIP tier created successfully",
        data: tier,
      });
    } catch (error) {
      console.error("Error creating VIP tier:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create VIP tier",
        error: error.message,
      });
    }
  }
);

// Update VIP tier
router.put(
  "/vip-tiers/:id",
  adminAuth,
  [
    body("name").optional().notEmpty().withMessage("Name cannot be empty"),
    body("description")
      .optional()
      .notEmpty()
      .withMessage("Description cannot be empty"),
    body("pricing.monthly")
      .optional()
      .isNumeric()
      .withMessage("Monthly price must be a number"),
    body("pricing.yearly")
      .optional()
      .isNumeric()
      .withMessage("Yearly price must be a number"),
    body("benefits")
      .optional()
      .isArray()
      .withMessage("Benefits must be an array"),
    body("order").optional().isNumeric().withMessage("Order must be a number"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      const tier = await VIPTier.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!tier) {
        return res.status(404).json({
          success: false,
          message: "VIP tier not found",
        });
      }

      res.json({
        success: true,
        message: "VIP tier updated successfully",
        data: tier,
      });
    } catch (error) {
      console.error("Error updating VIP tier:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update VIP tier",
        error: error.message,
      });
    }
  }
);

// Delete VIP tier
router.delete("/vip-tiers/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if tier is being used by any subscriptions
    const activeSubscriptions = await VIPSubscription.find({
      tier: tier.tierId,
      status: "active",
    });
    if (activeSubscriptions.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete tier with active subscriptions",
      });
    }

    const tier = await VIPTier.findByIdAndDelete(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: "VIP tier not found",
      });
    }

    res.json({
      success: true,
      message: "VIP tier deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting VIP tier:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete VIP tier",
      error: error.message,
    });
  }
});

// Toggle VIP tier status (active/inactive)
router.patch("/vip-tiers/:id/toggle", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const tier = await VIPTier.findById(id);
    if (!tier) {
      return res.status(404).json({
        success: false,
        message: "VIP tier not found",
      });
    }

    tier.active = !tier.active;
    await tier.save();

    res.json({
      success: true,
      message: `VIP tier ${
        tier.active ? "activated" : "deactivated"
      } successfully`,
      data: tier,
    });
  } catch (error) {
    console.error("Error toggling VIP tier status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle VIP tier status",
      error: error.message,
    });
  }
});

// ==================== SUBSCRIPTIONS MANAGEMENT ====================

// Get all subscriptions (admin view)
router.get("/subscriptions", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = "all",
      tier = "all",
      search = "",
      startDate,
      endDate,
    } = req.query;

    let query = {};

    // Status filter
    if (status !== "all") {
      query.status = status;
    }

    // Tier filter
    if (tier !== "all") {
      query.tier = tier;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Search functionality
    if (search) {
      query.$or = [
        { paymentIntentId: { $regex: search, $options: "i" } },
        { stripeSubscriptionId: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const subscriptions = await VIPSubscription.find(query)
      .populate("userId", "firstName lastName email mobile")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VIPSubscription.countDocuments(query);

    res.json({
      success: true,
      data: {
        subscriptions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting subscriptions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get subscriptions",
      error: error.message,
    });
  }
});

// Get subscription statistics
router.get("/subscriptions/stats", adminAuth, async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    let dateFilter = {};
    const now = new Date();

    switch (period) {
      case "7d":
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          },
        };
        break;
      case "30d":
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        };
        break;
      case "90d":
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          },
        };
        break;
      case "1y":
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          },
        };
        break;
    }

    const stats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSubscriptions: { $sum: 1 },
          totalRevenue: { $sum: "$amount" },
          activeSubscriptions: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          cancelledSubscriptions: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          averageRevenue: { $avg: "$amount" },
        },
      },
    ]);

    const tierStats = await VIPSubscription.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$tier",
          count: { $sum: 1 },
          revenue: { $sum: "$amount" },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        period,
        overview: stats[0] || {
          totalSubscriptions: 0,
          totalRevenue: 0,
          activeSubscriptions: 0,
          cancelledSubscriptions: 0,
          averageRevenue: 0,
        },
        tierBreakdown: tierStats,
      },
    });
  } catch (error) {
    console.error("Error getting subscription stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get subscription statistics",
      error: error.message,
    });
  }
});

// Cancel subscription (admin)
router.post(
  "/subscriptions/:id/cancel",
  adminAuth,
  [body("reason").notEmpty().withMessage("Cancellation reason is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { reason } = req.body;

      const subscription = await VIPSubscription.findById(id);
      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Subscription not found",
        });
      }

      await subscription.cancel(reason);

      // Update user's VIP status
      await User.findByIdAndUpdate(subscription.userId, {
        $set: {
          "vip.level": "free",
          "vip.isActive": false,
          "vip.expires": null,
        },
      });

      res.json({
        success: true,
        message: "Subscription cancelled successfully",
        data: subscription.getSummary(),
      });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({
        success: false,
        message: "Failed to cancel subscription",
        error: error.message,
      });
    }
  }
);

// ==================== USERS MANAGEMENT ====================

// Get all users with filters and pagination
router.get("/users", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      tier = "all",
      status = "all",
      location = "all",
      memberSince = "all",
      gender = "all",
      ageRange = "all",
      search = "",
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
      ];
    }

    // Tier filter
    if (tier !== "all") {
      query["vip.level"] = tier;
    }

    // Status filter
    if (status !== "all") {
      if (status === "Active") {
        query["profile.status"] = "active";
      } else if (status === "Inactive") {
        query["profile.status"] = "inactive";
      } else if (status === "Paused") {
        query["profile.status"] = "paused";
      } else if (status === "Suspended") {
        query["profile.status"] = "suspended";
      }
    }

    // Gender filter
    if (gender !== "all") {
      query["onboarding.gender"] = gender.toLowerCase();
    }

    // Age range filter
    if (ageRange !== "all") {
      query["onboarding.ageRange"] = ageRange.replace("–", "-");
    }

    // Location filter (based on current location)
    if (location !== "all") {
      query["location.current.city"] = {
        $regex: location.split(",")[0],
        $options: "i",
      };
    }

    // Member since filter
    if (memberSince !== "all") {
      const now = new Date();
      let dateFilter = {};

      switch (memberSince) {
        case "Last 30 days":
          dateFilter = {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          };
          break;
        case "Last 3 months":
          dateFilter = {
            $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          };
          break;
        case "Last 6 months":
          dateFilter = {
            $gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
          };
          break;
        case "Last year":
          dateFilter = {
            $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          };
          break;
        case "More than a year":
          dateFilter = {
            $lt: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
          };
          break;
      }

      if (Object.keys(dateFilter).length > 0) {
        query.createdAt = dateFilter;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select(
        "firstName lastName email mobile vip profile onboarding location createdAt lastActive"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Transform users to match frontend format
    const transformedUsers = users.map((user) => {
      const vip = user.vip || { level: "free" };
      const profile = user.profile || { status: "active", avatar: "" };
      const onboarding = user.onboarding || {};
      const locCurrent =
        user.location && user.location.current ? user.location.current : {};
      const firstName = user.firstName || "";
      const lastName = user.lastName || "";
      const fullName = `${firstName} ${lastName}`.trim() || "N/A";
      const tierLevel = vip.level || "free";
      const tier = tierLevel.charAt(0).toUpperCase() + tierLevel.slice(1);
      const statusVal = profile.status || "active";
      const status = statusVal.charAt(0).toUpperCase() + statusVal.slice(1);
      const gender = onboarding.gender
        ? onboarding.gender.charAt(0).toUpperCase() + onboarding.gender.slice(1)
        : "N/A";
      const ageRange = onboarding.ageRange || "N/A";

      // Determine location - check multiple sources
      let location = "N/A";
      if (
        locCurrent.city &&
        locCurrent.country &&
        locCurrent.city.trim() &&
        locCurrent.country.trim()
      ) {
        location = `${locCurrent.city}, ${locCurrent.country}`;
      } else if (
        user.signup &&
        user.signup.city &&
        user.signup.country &&
        user.signup.city.trim() &&
        user.signup.country.trim()
      ) {
        // Fallback to signup location if current location is not available
        location = `${user.signup.city}, ${user.signup.country}`;
      } else if (locCurrent.country && locCurrent.country.trim()) {
        // If only country is available
        location = locCurrent.country;
      } else if (
        user.signup &&
        user.signup.country &&
        user.signup.country.trim()
      ) {
        // Fallback to signup country
        location = user.signup.country;
      } else if (locCurrent.latitude && locCurrent.longitude) {
        // If GPS coordinates are available but no city/country
        location = `${locCurrent.latitude.toFixed(
          2
        )}, ${locCurrent.longitude.toFixed(2)}`;
      }

      // Generate user ID from MongoDB ObjectId
      const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`;

      return {
        id: user._id,
        userId,
        name: fullName,
        tier,
        tierIcon: getTierIcon(tier),
        tierBg: getTierBg(tier),
        tierBorder: getTierBorder(tier),
        tierColor: getTierColor(tier),
        email: user.email || "N/A",
        phone: user.mobile || "N/A",
        gender,
        age: ageRange,
        location,
        status,
        statusBg: getStatusBg(status),
        statusColor: getStatusColor(status),
        avatar:
          profile.avatar || "https://c.animaapp.com/t66hdvJZ/img/avatar.svg",
        createdAt: user.createdAt,
        lastActive: user.lastActive || user.createdAt,
      };
    });

    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
      error: error.message,
    });
  }
});

// Get VIP users (must come before /users/:id route)
router.get("/users/vip", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, tier = "all" } = req.query;

    let query = { "vip.isActive": true };

    if (tier !== "all") {
      query["vip.level"] = tier;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select("firstName lastName email mobile vip createdAt")
      .sort({ "vip.expires": -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting VIP users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get VIP users",
      error: error.message,
    });
  }
});

// Export users data (must come before /users/:id route)
router.get("/users/export", adminAuth, async (req, res) => {
  try {
    const { format = "csv" } = req.query;

    const users = await User.find({})
      .select(
        "firstName lastName email mobile vip profile onboarding location createdAt"
      )
      .sort({ createdAt: -1 });

    if (format === "csv") {
      // Generate CSV data
      const csvHeaders =
        "User ID,Name,Email,Phone,Gender,Age Range,Location,Tier,Status,Member Since\n";
      const csvData = users
        .map((user) => {
          const userId = `ID${user._id.toString().slice(-6).toUpperCase()}`;
          const fullName = `${user.firstName} ${user.lastName}`;
          const tier =
            user.vip.level.charAt(0).toUpperCase() + user.vip.level.slice(1);
          const status =
            user.profile.status.charAt(0).toUpperCase() +
            user.profile.status.slice(1);
          const gender = user.onboarding.gender
            ? user.onboarding.gender.charAt(0).toUpperCase() +
              user.onboarding.gender.slice(1)
            : "N/A";
          const ageRange = user.onboarding.ageRange || "N/A";
          const location =
            user.location.current.city && user.location.current.country
              ? `${user.location.current.city}, ${user.location.current.country}`
              : "N/A";
          const memberSince = user.createdAt.toISOString().split("T")[0];

          return `${userId},"${fullName}",${user.email || "N/A"},${
            user.mobile || "N/A"
          },${gender},${ageRange},"${location}",${tier},${status},${memberSince}`;
        })
        .join("\n");

      const csvContent = csvHeaders + csvData;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=users-export-${
          new Date().toISOString().split("T")[0]
        }.csv`
      );
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: users,
        exportedAt: new Date(),
        totalUsers: users.length,
      });
    }
  } catch (error) {
    console.error("Error exporting users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export users",
      error: error.message,
    });
  }
});

// Get single user details
router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate("wallet.transactions")
      .populate("games")
      .populate("tasks")
      .populate("surveys");

    // Get challenge-related data
    const [
      challengeProgress,
      completedChallenges,
      streakData,
      bonusDaysClaimed,
    ] = await Promise.all([
      // Get user's challenge progress
      UserChallengeProgress.find({ userId: id })
        .populate("challengeId", "title type coinReward xpReward challengeDate")
        .sort({ challengeDate: -1 })
        .limit(50),

      // Get completed challenges count
      UserChallengeProgress.countDocuments({ userId: id, status: "completed" }),

      // Get current streak info from user
      Promise.resolve({
        current: user.xp?.streak || user.streak?.current || 0,
        lastUpdated: user.streak?.lastUpdated || null,
        completedTasks: user.streak?.completedTasks || [],
      }),

      // Get bonus days claimed (if tracked)
      Promise.resolve(0), // TODO: Implement bonus day tracking if needed
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Transform user data to match frontend format
    const safeVip = user.vip || { level: "free" };
    const safeProfile = user.profile || {
      status: "active",
      avatar: "",
      notifications: true,
    };
    // Ensure notifications is properly read from user.profile (default to true if not set)
    if (user.profile) {
      safeProfile.notifications = user.profile.notifications !== undefined 
        ? user.profile.notifications 
        : true;
    }
    const safeOnboarding = user.onboarding || {};
    const safeWallet = user.wallet || { balance: 0 };
    const safeXp = user.xp || { current: 0, tier: 1, total: 0 };
    const safeLocation =
      user.location && user.location.current ? user.location.current : {};
    const safeGames = Array.isArray(user.games) ? user.games : [];
    const safeTasks = Array.isArray(user.tasks) ? user.tasks : [];
    const safeSurveys = Array.isArray(user.surveys) ? user.surveys : [];
    const safeDevice = user.device || {
      type: "Unknown",
      model: "Unknown",
      os: "Unknown",
    };
    const safeRedemption = user.redemption || { preference: "none", count: 0 };
    const safeAnalytics = user.analytics || {};
    
    const fullName =
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || "N/A";
    const tierText = safeVip.level || "free";
    const statusText = safeProfile.status || "active";

    // Compute derived fields
    const mostPlayedGame =
      safeGames.length > 0
        ? safeGames.reduce(
            (max, g) => ((g.playCount || 0) > (max.playCount || 0) ? g : max),
            safeGames[0]
          )
        : null;
    const lastGamePlayed =
      safeGames.length > 0
        ? safeGames.reduce((latest, g) => {
            if (!g.lastPlayed) return latest;
            if (!latest || !latest.lastPlayed) return g;
            return new Date(g.lastPlayed) > new Date(latest.lastPlayed)
              ? g
              : latest;
          }, null)
        : null;
    const lastTaskCompleted =
      safeTasks.length > 0
        ? safeTasks
            .filter((t) => t.completed)
            .reduce((latest, t) => {
              if (!t.date) return latest;
              if (!latest || !latest.date) return t;
              return new Date(t.date) > new Date(latest.date) ? t : latest;
            }, null)
        : null;

    // Compute preferred game category from onboarding
    const preferredCategory =
      safeOnboarding.gamePreferences &&
      safeOnboarding.gamePreferences.length > 0
        ? safeOnboarding.gamePreferences[0]
        : "N/A";

    // Compute challenge-related fields
    const lastChallengeCompleted = challengeProgress.find(
      (cp) => cp.status === "completed"
    );
    const challengesInProgress = challengeProgress.filter(
      (cp) => cp.status === "in_progress"
    ).length;
    const totalChallengesCompleted = completedChallenges;
    const currentStreak = streakData.current;
    const streakLastUpdated = streakData.lastUpdated;

    // Calculate challenge success rate
    const totalChallengeAttempts = challengeProgress.length;
    const challengeSuccessRate =
      totalChallengeAttempts > 0
        ? Math.round((totalChallengesCompleted / totalChallengeAttempts) * 100)
        : 0;

    // Calculate age from dateOfBirth if available, otherwise use ageRange
    let ageValue = "N/A";

    if (user.dateOfBirth) {
      try {
        const today = new Date();
        const birthDate = new Date(user.dateOfBirth);

        if (!isNaN(birthDate.getTime())) {
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--;
          }

          // Convert to age range format
          if (age >= 13 && age <= 17) ageValue = "13-17";
          else if (age >= 18 && age <= 24) ageValue = "18-24";
          else if (age >= 25 && age <= 34) ageValue = "25-34";
          else if (age >= 35 && age <= 44) ageValue = "35-44";
          else if (age >= 45 && age <= 54) ageValue = "45-54";
          else if (age >= 55 && age <= 64) ageValue = "55-64";
          else if (age >= 65) ageValue = "65+";
          else ageValue = "N/A";
        }
      } catch (error) {
        console.error(
          "Error calculating age from dateOfBirth:",
          error
        );
      }
    }

    // Fallback to ageRange from onboarding if dateOfBirth not available or calculation failed
    if (
      ageValue === "N/A" &&
      safeOnboarding.ageRange &&
      safeOnboarding.ageRange !== "N/A"
    ) {
      ageValue = safeOnboarding.ageRange;
    }

    // Fetch redemption history from PayoutRequest
    let redemptionHistory = [];
    try {
      const PayoutRequest = require('../models/PayoutRequest');
      const payouts = await PayoutRequest.find({
        userId: user._id,
        status: { $in: ['completed', 'approved'] }
      })
      .select('coinsDeducted createdAt approvedAt payment reward status tremendousOrderId metadata')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
      
      redemptionHistory = payouts.map(payout => ({
        id: payout._id.toString(),
        redemptionId: payout.metadata?.externalId || payout._id.toString().slice(-8),
        amount: payout.payment?.amount || payout.reward?.value?.denomination || 0,
        currency: payout.payment?.currency || payout.reward?.value?.currency_code || 'USD',
        coinsDeducted: payout.coinsDeducted || 0,
        method: payout.reward?.delivery?.method || 'N/A',
        status: payout.status,
        createdAt: payout.createdAt,
        approvedAt: payout.approvedAt,
        tremendousOrderId: payout.tremendousOrderId || null
      }));
    } catch (error) {
      console.error('Error fetching redemption history:', error);
    }

    // Calculate spin count - use user.spinCount if available, otherwise count from SpinWheelLog
    let spinCount = typeof user.spinCount === "number" ? user.spinCount : 0;
    let lastSpinAt = user.lastSpinAt || null;
    
    // If spinCount is 0 or not set, try to get from SpinWheelLog
    if (spinCount === 0 || !user.spinCount) {
      try {
        const SpinWheelLog = require('../models/SpinWheelLog');
        const actualSpinCount = await SpinWheelLog.countDocuments({ user: user._id });
        if (actualSpinCount > 0) {
          spinCount = actualSpinCount;
          // Update user.spinCount for future queries (async, don't wait)
          User.findByIdAndUpdate(user._id, { 
            $set: { spinCount: actualSpinCount } 
          }).catch(err => console.error('Error updating user spinCount:', err));
        }
        
        // Get last spin time if not set
        if (!lastSpinAt) {
          const lastSpin = await SpinWheelLog.findOne({ user: user._id })
            .sort({ createdAt: -1 })
            .select('createdAt')
            .lean();
          if (lastSpin) {
            lastSpinAt = lastSpin.createdAt;
            // Update user.lastSpinAt for future queries (async, don't wait)
            User.findByIdAndUpdate(user._id, { 
              $set: { lastSpinAt: lastSpin.createdAt } 
            }).catch(err => console.error('Error updating user lastSpinAt:', err));
          }
        }
      } catch (error) {
        console.error('Error calculating spin count from logs:', error);
      }
    }

    // Calculate redemption count - use user.redemption.count if available, otherwise count from PayoutRequest
    let redemptionCount = typeof safeRedemption.count === "number" ? safeRedemption.count : 0;
    let totalCoinsRedeemed = typeof safeRedemption.totalCoinsRedeemed === "number" ? safeRedemption.totalCoinsRedeemed : 0;
    let lastRedeemedAt = safeRedemption.lastRedeemedAt || null;
    
    // If redemption count is 0, try to get from PayoutRequest collection (where Tremendous payouts are stored)
    if (redemptionCount === 0 || !safeRedemption.count) {
      try {
        const PayoutRequest = require('../models/PayoutRequest');
        // Count completed payout requests (approved redemptions)
        const completedPayouts = await PayoutRequest.find({
          userId: user._id,
          status: { $in: ['completed', 'approved'] }
        }).select('coinsDeducted createdAt approvedAt').lean();
        
        if (completedPayouts.length > 0) {
          redemptionCount = completedPayouts.length;
          totalCoinsRedeemed = completedPayouts.reduce((sum, payout) => sum + (payout.coinsDeducted || 0), 0);
          
          // Get last redemption date (use approvedAt if available, otherwise createdAt)
          const lastRedemption = completedPayouts.sort((a, b) => {
            const dateA = a.approvedAt || a.createdAt;
            const dateB = b.approvedAt || b.createdAt;
            return new Date(dateB) - new Date(dateA);
          })[0];
          if (lastRedemption) {
            lastRedeemedAt = lastRedemption.approvedAt || lastRedemption.createdAt;
          }
          
          // Update user.redemption for future queries (async, don't wait)
          User.findByIdAndUpdate(user._id, { 
            $set: { 
              'redemption.count': redemptionCount,
              'redemption.totalCoinsRedeemed': totalCoinsRedeemed,
              'redemption.lastRedeemedAt': lastRedeemedAt
            } 
          }).catch(err => console.error('Error updating user redemption count:', err));
        }
      } catch (error) {
        console.error('Error calculating redemption count from PayoutRequest:', error);
      }
    }

    const transformedUser = {
      // === Profile Tab ===
      id: user._id,
      userId: `ID${user._id.toString().slice(-6).toUpperCase()}`,
      name: fullName,
      tier: tierText.charAt(0).toUpperCase() + tierText.slice(1),
      email: user.email || "N/A",
      phone: user.mobile || "N/A",
      gender: safeOnboarding.gender
        ? safeOnboarding.gender.charAt(0).toUpperCase() +
          safeOnboarding.gender.slice(1)
        : "N/A",
      age: ageValue,
      registrationDate: user.createdAt,
      country:
        safeLocation.country && safeLocation.country.trim()
          ? safeLocation.country
          : user.signup && user.signup.country && user.signup.country.trim()
          ? user.signup.country
          : "N/A",
      signupCountry:
        user.signup && user.signup.country && user.signup.country.trim()
          ? user.signup.country
          : "N/A",
      appVersion: user.appVersion || "N/A",
      accountStatus: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      faceVerification: (user.biometric?.faceVerification?.verified === true) ? "Verified" : "Not Verified",
      deviceType:
        `${safeDevice.type} - ${safeDevice.model}` !== "Unknown - Unknown"
          ? `${safeDevice.type} - ${safeDevice.model}`
          : "N/A",
      deviceOS: safeDevice.os || "N/A",
      lastActive: user.lastActive || user.createdAt,
      ipAddress: safeLocation.ip || (user.signup && user.signup.ip) || "N/A",
      location: (() => {
        // Determine location - check multiple sources with trimming
        if (
          safeLocation.city &&
          safeLocation.country &&
          safeLocation.city.trim() &&
          safeLocation.country.trim()
        ) {
          return `${safeLocation.city}, ${safeLocation.country}`;
        } else if (
          user.signup &&
          user.signup.city &&
          user.signup.country &&
          user.signup.city.trim() &&
          user.signup.country.trim()
        ) {
          return `${user.signup.city}, ${user.signup.country}`;
        } else if (safeLocation.country && safeLocation.country.trim()) {
          return safeLocation.country;
        } else if (
          user.signup &&
          user.signup.country &&
          user.signup.country.trim()
        ) {
          return user.signup.country;
        } else if (safeLocation.latitude && safeLocation.longitude) {
          return `${safeLocation.latitude.toFixed(
            2
          )}, ${safeLocation.longitude.toFixed(2)}`;
        }
        return "N/A";
      })(),

      // === Balance & Tier Tab ===
      xp: typeof safeXp.current === "number" ? safeXp.current : 0,
      coinBalance:
        typeof safeWallet.balance === "number" ? safeWallet.balance : 0,
      xpTier: typeof safeXp.tier === "number" ? safeXp.tier : 1,
      redemptionPreference: (safeRedemption.preference || "none").toUpperCase(),
      mostPlayedGame: mostPlayedGame ? mostPlayedGame.gameId || "N/A" : "N/A",
      lastGamePlayed: lastGamePlayed ? lastGamePlayed.gameId || "N/A" : "N/A",
      totalGamesDownloaded: safeGames.length || 0,
      avgSessionDuration:
        typeof safeAnalytics.avgSessionDuration === "number"
          ? `${safeAnalytics.avgSessionDuration} min`
          : "N/A",
      primaryEarningSource: safeAnalytics.primaryEarningSource || "N/A",
      preferredGameCategory: preferredCategory,
      onboardingGoal:
        safeOnboarding.primaryGoal || safeOnboarding.improvementArea || "N/A",
      notificationSettings: safeProfile.notifications ? "Enabled" : "Disabled",

      // === Activity Summary Tab ===
      lastLoginAt: user.lastLoginAt || null,
      loginCount: typeof user.loginCount === "number" ? user.loginCount : 0,
      lastTaskCompleted: lastTaskCompleted
        ? lastTaskCompleted.taskId || "N/A"
        : "N/A",
      lastTaskCompletedDate: lastTaskCompleted ? lastTaskCompleted.date : null,
      offersRedeemed:
        typeof safeAnalytics.totalOffersRedeemed === "number"
          ? safeAnalytics.totalOffersRedeemed
          : 0,
      lastOfferClaimed: safeAnalytics.lastOfferClaimedAt || null,
      totalCoinsEarned:
        typeof safeAnalytics.totalCoinsEarned === "number"
          ? safeAnalytics.totalCoinsEarned
          : 0,
      totalXPEarned: typeof safeXp.total === "number" ? safeXp.total : 0,
      redemptionsMade: redemptionCount,
      redemptionBreakdown: {
        count: redemptionCount,
        totalCoins: totalCoinsRedeemed,
        lastRedeemed: lastRedeemedAt,
      },
      challengeProgress: {
        currentStreak: currentStreak,
        streakLastUpdated: streakLastUpdated,
        totalChallengesCompleted: totalChallengesCompleted,
        challengesInProgress: challengesInProgress,
        challengeSuccessRate: challengeSuccessRate,
        lastChallengeCompleted: lastChallengeCompleted
          ? {
              title: lastChallengeCompleted.challengeId?.title || "N/A",
              type: lastChallengeCompleted.challengeId?.type || "N/A",
              completedAt: lastChallengeCompleted.completedAt,
              coinsEarned: lastChallengeCompleted.rewardsEarned?.coins || 0,
              xpEarned: lastChallengeCompleted.rewardsEarned?.xp || 0,
            }
          : null,
        recentChallenges: challengeProgress.slice(0, 5).map((cp) => ({
          title: cp.challengeId?.title || "N/A",
          type: cp.challengeId?.type || "N/A",
          status: cp.status,
          challengeDate: cp.challengeDate,
          progress: cp.progress?.percentage || 0,
        })),
      },
      spinUsage: spinCount,
      lastSpinAt: lastSpinAt,

      // Redemption history/map
      redemptionHistory: redemptionHistory,

      // === Legacy & Full Objects ===
      status: statusText.charAt(0).toUpperCase() + statusText.slice(1),
      avatar:
        safeProfile.avatar || "https://c.animaapp.com/t66hdvJZ/img/avatar.svg",
      memberSince: user.createdAt,
      gamesPlayed: safeGames.length || 0,
      tasksCompleted:
        safeTasks.filter((task) => task && task.completed).length || 0,
      surveysCompleted:
        safeSurveys.filter((survey) => survey && survey.completed).length || 0,
      vip: safeVip,
      wallet: safeWallet,
      onboarding: safeOnboarding,
      profile: safeProfile,
    };

    res.json({
      success: true,
      data: transformedUser,
    });
  } catch (error) {
    console.error("Error getting user details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user details",
      error: error.message,
    });
  }
});

// Update user
router.put(
  "/users/:id",
  adminAuth,
  [
    body("firstName")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("First name cannot be empty"),
    body("lastName")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Last name cannot be empty"),
    body("email")
      .optional()
      .trim()
      .isEmail()
      .withMessage("Invalid email format"),
    body("mobile")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Mobile number cannot be empty"),
    body("username")
      .optional()
      .trim()
      .matches(/^[a-zA-Z0-9_]{3,20}$/)
      .withMessage(
        "Username must be 3-20 characters (letters, numbers, underscore only)"
      ),
    body("socialTag").optional().trim(),
    body("gender")
      .optional()
      .isIn(["male", "female", "Male", "Female", "other", "N/A"])
      .withMessage("Invalid gender"),
    body("ageRange").optional().trim(),
    body("age").optional().trim(), // Alias for ageRange
    body("status")
      .optional()
      .trim()
      .isIn([
        "active",
        "inactive",
        "paused",
        "suspended",
        "Active",
        "Inactive",
        "Paused",
        "Suspended",
      ])
      .withMessage("Invalid status"),
    body("tier")
      .optional()
      .trim()
      .isIn([
        "free",
        "bronze",
        "silver",
        "gold",
        "platinum",
        "Free",
        "Bronze",
        "Silver",
        "Gold",
        "Platinum",
      ])
      .withMessage("Invalid tier"),
    body("country").optional().trim(),
    body("city").optional().trim(),
    body("phone").optional().trim(), // Alias for mobile
    body("dateOfBirth")
      .optional()
      .isISO8601()
      .withMessage("Invalid date format"),
    body("dob").optional().isISO8601().withMessage("Invalid date format"), // Alias for dateOfBirth
    body("location").optional().trim(), // Can be country or city,country format
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array().map((err) => ({
            field: err.path || err.param || err.location,
            message: err.msg,
            value: err.value,
          })),
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      // Find user first to check uniqueness
      const existingUser = await User.findById(id);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check email uniqueness if being updated
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await User.findOne({
          email: updateData.email.toLowerCase(),
          _id: { $ne: id },
        });
        if (emailExists) {
          return res.status(400).json({
            success: false,
            message: "Email already exists",
            errors: [
              { field: "email", message: "This email is already registered" },
            ],
          });
        }
      }

      // Check username uniqueness if being updated
      if (
        updateData.username &&
        updateData.username !== existingUser.username
      ) {
        const usernameExists = await User.findOne({
          username: updateData.username,
          _id: { $ne: id },
        });
        if (usernameExists) {
          return res.status(400).json({
            success: false,
            message: "Username already exists",
            errors: [
              { field: "username", message: "This username is already taken" },
            ],
          });
        }
      }

      // Check mobile uniqueness if being updated
      const mobileField = updateData.mobile || updateData.phone;
      if (mobileField && mobileField !== existingUser.mobile) {
        const mobileExists = await User.findOne({
          mobile: mobileField,
          _id: { $ne: id },
        });
        if (mobileExists) {
          return res.status(400).json({
            success: false,
            message: "Mobile number already exists",
            errors: [
              {
                field: "mobile",
                message: "This mobile number is already registered",
              },
            ],
          });
        }
      }

      // Build update object - use 'in' operator to handle all fields including empty strings
      const updateFields = {};

      // Basic fields
      if ("firstName" in updateData)
        updateFields.firstName = updateData.firstName;
      if ("lastName" in updateData) updateFields.lastName = updateData.lastName;
      if ("email" in updateData)
        updateFields.email = updateData.email.toLowerCase();
      if ("mobile" in updateData || "phone" in updateData)
        updateFields.mobile = mobileField;
      if ("username" in updateData)
        updateFields.username = updateData.username || undefined;
      if ("socialTag" in updateData)
        updateFields.socialTag = updateData.socialTag;

      // Date of birth - store as dateOfBirth field (will be added to model if needed)
      if ("dateOfBirth" in updateData || "dob" in updateData) {
        const dobValue = updateData.dateOfBirth || updateData.dob;
        if (dobValue && dobValue !== "dd/mm/yyyy") {
          try {
            const dobDate = new Date(dobValue);
            if (!isNaN(dobDate.getTime())) {
              updateFields.dateOfBirth = dobDate;

              // Also calculate and update ageRange if possible
              const today = new Date();
              const age = today.getFullYear() - dobDate.getFullYear();
              const monthDiff = today.getMonth() - dobDate.getMonth();

              if (
                monthDiff < 0 ||
                (monthDiff === 0 && today.getDate() < dobDate.getDate())
              ) {
                age--;
              }

              let ageRange = "N/A";
              if (age >= 13 && age <= 17) ageRange = "13-17";
              else if (age >= 18 && age <= 24) ageRange = "18-24";
              else if (age >= 25 && age <= 34) ageRange = "25-34";
              else if (age >= 35 && age <= 44) ageRange = "35-44";
              else if (age >= 45 && age <= 54) ageRange = "45-54";
              else if (age >= 55 && age <= 64) ageRange = "55-64";
              else if (age >= 65) ageRange = "65+";

              updateFields["onboarding.ageRange"] = ageRange;
            }
          } catch (error) {
            console.warn("Invalid date of birth format:", dobValue);
          }
        }
      }

      // Nested onboarding fields
      if ("gender" in updateData) {
        const genderValue =
          updateData.gender === "N/A"
            ? undefined
            : updateData.gender.toLowerCase();
        updateFields["onboarding.gender"] = genderValue;
      }
      if ("ageRange" in updateData || "age" in updateData) {
        const ageValue = updateData.ageRange || updateData.age;
        updateFields["onboarding.ageRange"] =
          ageValue === "N/A" ? undefined : ageValue;
      }

      // Profile fields
      if ("status" in updateData) {
        const statusValue = updateData.status.toLowerCase();
        updateFields["profile.status"] = statusValue;
      }

      // VIP tier
      if ("tier" in updateData) {
        const tierValue = updateData.tier.toLowerCase();
        updateFields["vip.level"] = tierValue;
      }

      // Location fields
      if ("country" in updateData) {
        updateFields["location.current.country"] = updateData.country;
      }
      if ("city" in updateData) {
        updateFields["location.current.city"] = updateData.city;
      }

      // Handle location field (can be "country" or "city, country" format)
      if ("location" in updateData) {
        const locationValue = updateData.location;
        if (locationValue && locationValue !== "Select location") {
          // Check if it contains a comma (city, country format)
          if (locationValue.includes(",")) {
            const [city, country] = locationValue
              .split(",")
              .map((s) => s.trim());
            updateFields["location.current.city"] = city;
            updateFields["location.current.country"] = country;
          } else {
            // Just country
            updateFields["location.current.country"] = locationValue;
          }
        }
      }

      // Update timestamp
      updateFields.updatedAt = new Date();

      const user = await User.findByIdAndUpdate(
        id,
        { $set: updateFields },
        { new: true, runValidators: false } // Disable validators to allow flexible updates
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User updated successfully",
        data: user,
      });
    } catch (error) {
      console.error("Error updating user:", error);

      // Handle MongoDB duplicate key errors
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `${
            field.charAt(0).toUpperCase() + field.slice(1)
          } already exists`,
          errors: [{ field, message: `This ${field} is already registered` }],
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update user",
        error: error.message,
      });
    }
  }
);

// Update user status (suspend/activate)
router.patch(
  "/users/:id/status",
  adminAuth,
  [
    body("status")
      .isIn(["active", "inactive", "paused", "suspended"])
      .withMessage("Invalid status"),
    body("reason").optional().isString().withMessage("Reason must be a string"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { status, reason } = req.body;

      const user = await User.findByIdAndUpdate(
        id,
        {
          "profile.status": status,
          "profile.statusReason": reason,
          "profile.statusUpdatedAt": new Date(),
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const statusText = status.charAt(0).toUpperCase() + status.slice(1);

      res.json({
        success: true,
        message: `User ${statusText.toLowerCase()}d successfully`,
        data: {
          id: user._id,
          status: statusText,
          reason,
        },
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update user status",
        error: error.message,
      });
    }
  }
);

// Suspend user (dedicated endpoint)
router.patch(
  "/users/:id/suspend",
  adminAuth,
  [body("reason").optional().isString().withMessage("Reason must be a string")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { reason } = req.body;

      const user = await User.findByIdAndUpdate(
        id,
        {
          "profile.status": "suspended",
          "profile.statusReason": reason || "Suspended by admin",
          "profile.statusUpdatedAt": new Date(),
        },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "User suspended successfully",
        data: {
          id: user._id,
          status: "Suspended",
          reason: reason || "Suspended by admin",
        },
      });
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({
        success: false,
        message: "Failed to suspend user",
        error: error.message,
      });
    }
  }
);

// Unsuspend user (dedicated endpoint)
router.patch("/users/:id/unsuspend", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      {
        "profile.status": "active",
        "profile.statusReason": "Unsuspended by admin",
        "profile.statusUpdatedAt": new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User unsuspended successfully",
      data: {
        id: user._id,
        status: "Active",
        reason: "Unsuspended by admin",
      },
    });
  } catch (error) {
    console.error("Error unsuspending user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unsuspend user",
      error: error.message,
    });
  }
});

// Send notification to user
router.post(
  "/users/:id/notifications",
  adminAuth,
  [
    body("message").notEmpty().withMessage("Message is required"),
    body("type")
      .optional()
      .isIn(["info", "warning", "success", "error"])
      .withMessage("Invalid notification type"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { id } = req.params;
      const { message, type = "info" } = req.body;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Store notification in user document
      const notification = {
        _id: new mongoose.Types.ObjectId(),
        message,
        type,
        sentAt: new Date(),
        read: false,
        dismissed: false,
      };

      // Initialize notifications array if it doesn't exist
      if (!user.notifications) {
        user.notifications = [];
      }

      // Add notification to user's notifications array
      user.notifications.push(notification);
      await user.save();

      console.log(
        `Sending ${type} notification to user ${user.firstName} ${user.lastName}: ${message}`
      );

      res.json({
        success: true,
        message: "Notification sent successfully",
        data: {
          userId: id,
          notificationId: notification._id,
          message,
          type,
          sentAt: notification.sentAt,
        },
      });
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send notification",
        error: error.message,
      });
    }
  }
);

// ==================== DASHBOARD STATS ====================

/**
 * Build user filter query from request parameters
 * Note: Source filter is based on User.social.provider field
 */
async function buildUserFilter(filters) {
  const conditions = [];

  // Source filter - based on social.provider field
  if (filters.source) {
    if (filters.source === "direct") {
      // Direct users: all users who are NOT google AND NOT facebook
      // Simplest approach: use $nin which handles 'local', null, undefined, missing field
      conditions.push({
        "social.provider": { $nin: ["google", "facebook"] },
      });
    } else if (filters.source === "google" || filters.source === "facebook") {
      // Filter by social.provider
      conditions.push({ "social.provider": filters.source });
    } else {
      // For other sources, check if they match social.provider
      conditions.push({ "social.provider": filters.source });
    }
  }

  if (filters.gender) {
    // Gender is stored in onboarding.gender based on User schema
    conditions.push({ "onboarding.gender": filters.gender.toLowerCase() });
  }

  if (filters.age) {
    // Age range is stored in onboarding.ageRange based on User schema
    conditions.push({ "onboarding.ageRange": filters.age });
  }

  if (filters.gameId) {
    // Filter users who have installed/played this game
    conditions.push({ "games.gameId": filters.gameId });
  }

  if (filters.startDate || filters.endDate) {
    const dateCondition = {};
    if (filters.startDate) {
      dateCondition.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      dateCondition.$lte = new Date(filters.endDate);
    }
    conditions.push({ createdAt: dateCondition });
  }

  // If we have conditions, use $and, otherwise return empty query (matches all)
  if (conditions.length > 0) {
    return { $and: conditions };
  }

  return {};
}

/**
 * Build transaction filter query
 */
function buildTransactionFilter(filters) {
  const query = {};

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate);
    }
  }

  if (filters.gameId) {
    // Filter transactions related to this game
    query.$or = [
      { "metadata.gameId": filters.gameId },
      { referenceId: new RegExp(filters.gameId, "i") },
      { description: new RegExp(filters.gameId, "i") },
    ];
  }

  return query;
}

/**
 * Get admin dashboard statistics - Comprehensive V2.0 Dashboard
 * @route   GET /api/admin/dashboard
 * @query   {string} startDate - Start date (ISO format)
 * @query   {string} endDate - End date (ISO format)
 * @query   {string} gameId - Filter by game ID
 * @query   {string} source - Filter by acquisition source
 * @query   {string} age - Filter by age group
 * @query   {string} gender - Filter by gender
 * @query   {string} search - Search users or games
 * @access  Admin
 */
router.get(
  "/dashboard",
  adminAuth,
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid start date format"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid end date format"),
    query("gameId").optional().isString(),
    query("source").optional().isString(),
    query("age").optional().isString(),
    query("gender").optional().isIn(["male", "female", "other"]),
    query("search").optional().isString(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { startDate, endDate, gameId, source, age, gender, search } =
        req.query;

      // Default to last 30 days if no date range provided
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const filters = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        gameId,
        source,
        age,
        gender,
      };

      const userFilter = await buildUserFilter(filters);

      // Get filtered user IDs to apply to transaction queries
      let filteredUserIds = [];
      if (Object.keys(userFilter).length > 0) {
        const filteredUsers = await User.find(userFilter).select("_id").lean();
        filteredUserIds = filteredUsers.map((u) => u._id);
      }

      // Build transaction filter with user IDs if source/gender/age filters are applied
      const transactionFilter = buildTransactionFilter(filters);
      if (filteredUserIds.length > 0) {
        transactionFilter.user = { $in: filteredUserIds };
      } else if (filters.source || filters.gender || filters.age) {
        // If filters are applied but no users match, set empty array to return 0
        transactionFilter.user = { $in: [] };
      }

      // ==================== A. GLOBAL KPI CARDS ====================

      // Total Registered Users
      const totalUsers = await User.countDocuments(userFilter);

      // Active Users Today (last 24 hours)
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      const activeUsersToday = await User.countDocuments({
        ...userFilter,
        "dailyActivity.lastActiveDate": { $gte: yesterday },
      });

      // Total Rewards Issued (Coins) - only from filtered users
      const rewardsIssued = await Transaction.aggregate([
        {
          $match: {
            ...transactionFilter,
            type: { $in: ["credit", "reward", "spin", "bonus"] },
            balanceType: "coins",
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);
      const totalRewardsIssued = rewardsIssued[0]?.total || 0;

      // Total Redemptions (Currency) - only from filtered users
      const redemptions = await Transaction.aggregate([
        {
          $match: {
            ...transactionFilter,
            type: "redemption",
            status: "completed",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);
      const totalRedemptions = redemptions[0]?.total || 0;

      // Avg. XP/User
      const xpStats = await User.aggregate([
        { $match: userFilter },
        {
          $group: {
            _id: null,
            avgXP: { $avg: "$xp.current" },
            totalXP: { $sum: "$xp.current" },
          },
        },
      ]);
      const avgXPPerUser = xpStats[0]?.avgXP || 0;

      // ==================== RETENTION METRICS ====================
      const retention = await calculateRetention(filters);
      const retentionTrend = await getRetentionTrend(filters);

      // ==================== TOP PLAYED GAME ====================
      let topPlayedGame = null;
      const topGames = await Game.aggregate([
        { $match: { isActive: true } },
        { $sort: { "analytics.totalPlays": -1 } },
        { $limit: 1 },
        {
          $project: {
            gameId: 1,
            title: 1,
            bannerImage: 1,
            analytics: 1,
          },
        },
      ]);

      if (topGames.length > 0) {
        const game = topGames[0];

        // If bannerImage is missing, try to get it from the full game document
        let gameBannerImage = game.bannerImage;
        if (
          !gameBannerImage ||
          (!gameBannerImage.url && typeof gameBannerImage !== "string")
        ) {
          const fullGame = await Game.findOne({ gameId: game.gameId })
            .select("bannerImage gameDetails metadata")
            .lean();
          if (fullGame) {
            // Try bannerImage first, then gameDetails images, then metadata images
            gameBannerImage =
              fullGame.bannerImage ||
              fullGame.gameDetails?.large_image ||
              fullGame.gameDetails?.image ||
              fullGame.metadata?.images?.banner ||
              null;
          }
        }

        // Apply user filter to top game users
        const gameUserQuery = {
          "games.gameId": game.gameId,
          "games.status": { $in: ["installed", "completed"] },
          ...userFilter,
        };
        const gameUsers = await User.find(gameUserQuery)
          .select("xp gender age location vip _id")
          .lean();

        // Calculate demographics
        const ageGroups = {};
        const genders = {};
        const regions = {};
        const tiers = {};
        let totalXP = 0;

        // Get user IDs for reward check
        const gameUserIds = gameUsers.map((u) => u._id);

        // Check how many users received rewards for this game
        const usersWithRewards = await Transaction.countDocuments({
          user: { $in: gameUserIds },
          $or: [
            { "metadata.gameId": game.gameId },
            { referenceId: new RegExp(game.gameId, "i") },
            { description: new RegExp(game.gameId, "i") },
          ],
          type: { $in: ["credit", "reward"] },
          status: "completed",
        });

        gameUsers.forEach((user) => {
          // Age (would need DOB or age field)
          // Gender - stored in onboarding.gender
          const userGender = user.onboarding?.gender;
          if (userGender) {
            genders[userGender] = (genders[userGender] || 0) + 1;
          }
          // Region
          if (user.location?.current?.country) {
            const country = user.location.current.country;
            regions[country] = (regions[country] || 0) + 1;
          }
          // VIP Tier
          const tier = user.vip?.level || "free";
          tiers[tier] = (tiers[tier] || 0) + 1;

          // XP
          totalXP += user.xp?.current || 0;
        });

        const avgXP = gameUsers.length > 0 ? totalXP / gameUsers.length : 0;
        const rewardConversion =
          gameUsers.length > 0
            ? ((usersWithRewards / gameUsers.length) * 100).toFixed(2)
            : 0;

        // Ensure bannerImage is properly formatted
        let bannerImageUrl = null;
        const bannerToUse = gameBannerImage || game.bannerImage;

        if (bannerToUse) {
          if (typeof bannerToUse === "string") {
            bannerImageUrl = bannerToUse;
          } else if (bannerToUse.url) {
            bannerImageUrl = bannerToUse.url;
          } else {
            bannerImageUrl = bannerToUse;
          }
        }

        topPlayedGame = {
          gameId: game.gameId,
          title: game.title,
          banner: bannerImageUrl, // Use 'banner' for frontend compatibility
          bannerImage: game.bannerImage || null, // Keep original structure
          analytics: {
            totalPlays: game.analytics?.totalPlays || 0,
            totalCompletions: game.analytics?.totalCompletions || 0,
            averageXP: avgXP,
            rewardConversion: parseFloat(rewardConversion),
          },
          demographics: {
            age: ageGroups,
            gender: genders,
            region: regions,
            tier: tiers,
          },
        };
      }

      // ==================== REVENUE VS REWARD COST BY GAME ====================
      const gamesWithRevenue = await Game.find({ isActive: true })
        .select("gameId title metadata analytics")
        .lean();

      const revenueTable = await Promise.all(
        gamesWithRevenue.map(async (game) => {
          // Build game-specific transaction filter (without gameId filter to avoid conflict)
          const gameTransactionFilter = { ...transactionFilter };
          if (gameTransactionFilter.$or) {
            delete gameTransactionFilter.$or;
          }
          gameTransactionFilter.$or = [
            { "metadata.gameId": game.gameId },
            { referenceId: new RegExp(game.gameId, "i") },
            { description: new RegExp(game.gameId, "i") },
          ];

          // Get revenue from transactions (offer completions, etc.)
          const revenueData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: { $in: ["credit", "reward"] },
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: "$amount" },
              },
            },
          ]);

          // Get reward cost from transactions
          const rewardCostData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: "reward",
                balanceType: "coins",
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                cost: { $sum: "$amount" },
              },
            },
          ]);

          const revenue =
            revenueData[0]?.revenue || game.metadata?.revenue || 0;
          const rewardCost =
            rewardCostData[0]?.cost || game.metadata?.rewardCost || 0;
          const margin = revenue - rewardCost;
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0;

          // Calculate D7 retention for this game (apply user filter)
          const gameUsersForRetention = await User.find({
            "games.gameId": game.gameId,
            "games.installedAt": { $exists: true },
            ...userFilter,
          })
            .select("dailyActivity createdAt")
            .lean();

          let d7Retention = 0;
          if (gameUsersForRetention.length > 0) {
            const retained = gameUsersForRetention.filter((user) => {
              if (!user.dailyActivity?.activeDates) return false;
              const userCreatedAt = new Date(user.createdAt);
              const d7Date = new Date(userCreatedAt);
              d7Date.setDate(d7Date.getDate() + 7);
              const d7DateStr = `${d7Date.getFullYear()}-${String(
                d7Date.getMonth() + 1
              ).padStart(2, "0")}-${String(d7Date.getDate()).padStart(2, "0")}`;
              return user.dailyActivity.activeDates.includes(d7DateStr);
            }).length;
            d7Retention = (
              (retained / gameUsersForRetention.length) *
              100
            ).toFixed(2);
          }

          return {
            gameId: game.gameId,
            title: game.title,
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
            d7Retention: parseFloat(d7Retention),
            performance:
              parseFloat(marginPercent) > 0 ? "positive" : "negative",
          };
        })
      );

      // Sort by revenue descending
      revenueTable.sort((a, b) => b.revenue - a.revenue);

      // ==================== ATTRIBUTION PERFORMANCE ====================
      // Get all users and calculate sources properly - MUST use same date filters as userFilter
      // Build base query with date filters (same as userFilter but without source/gender/age)
      const baseDateQuery = {};
      if (filters.startDate || filters.endDate) {
        baseDateQuery.createdAt = {};
        if (filters.startDate) {
          baseDateQuery.createdAt.$gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          baseDateQuery.createdAt.$lte = new Date(filters.endDate);
        }
      }

      // Get counts for google and facebook WITH date filters
      const googleQuery = { "social.provider": "google", ...baseDateQuery };
      const facebookQuery = { "social.provider": "facebook", ...baseDateQuery };
      const googleCount = await User.countDocuments(googleQuery);
      const facebookCount = await User.countDocuments(facebookQuery);

      // Direct users query: all users who are NOT google AND NOT facebook
      // This should match: 'local' (default), null, undefined, missing field, or any other value
      // Simplest approach: use $nin which handles all cases
      const directQueryBase = {
        "social.provider": { $nin: ["google", "facebook"] },
      };

      // Combine with date filter
      const directQuery =
        Object.keys(baseDateQuery).length > 0
          ? { $and: [directQueryBase, baseDateQuery] }
          : directQueryBase;

      const directCount = await User.countDocuments(directQuery);

      // Total users WITH date filters (same as totalRegisteredUsers)
      const totalUsersCount = await User.countDocuments(baseDateQuery);

      // Build sources list: always include google, facebook, and direct
      const allSources = [];
      if (googleCount > 0) allSources.push("google");
      if (facebookCount > 0) allSources.push("facebook");
      if (directCount > 0) allSources.push("direct");

      const attributionData = await Promise.all(
        allSources.map(async (source) => {
          // Build query for this source
          let sourceQuery = {};
          if (source === "direct") {
            // Direct users: all users who are NOT google AND NOT facebook
            // Simplest approach: use $nin which handles 'local', null, undefined, missing field
            const directQueryBase = {
              "social.provider": { $nin: ["google", "facebook"] },
            };

            // Add date filter if provided
            if (filters.startDate || filters.endDate) {
              const dateFilter = {};
              dateFilter.createdAt = {};
              if (filters.startDate) {
                dateFilter.createdAt.$gte = new Date(filters.startDate);
              }
              if (filters.endDate) {
                dateFilter.createdAt.$lte = new Date(filters.endDate);
              }
              sourceQuery = { $and: [directQueryBase, dateFilter] };
            } else {
              sourceQuery = directQueryBase;
            }
          } else {
            // OAuth users: filter by social.provider
            sourceQuery = { "social.provider": source };

            // Add date filter if provided
            if (filters.startDate || filters.endDate) {
              sourceQuery.createdAt = {};
              if (filters.startDate) {
                sourceQuery.createdAt.$gte = new Date(filters.startDate);
              }
              if (filters.endDate) {
                sourceQuery.createdAt.$lte = new Date(filters.endDate);
              }
            }
          }

          const sourceUsers = await User.find(sourceQuery)
            .select("_id createdAt dailyActivity")
            .lean();

          const installs = sourceUsers.length;

          // Calculate D1 retention
          let d1Retention = 0;
          if (sourceUsers.length > 0) {
            const retained = sourceUsers.filter((user) => {
              if (!user.dailyActivity?.activeDates || !user.createdAt)
                return false;
              const userCreatedAt = new Date(user.createdAt);
              const d1Date = new Date(userCreatedAt);
              d1Date.setDate(d1Date.getDate() + 1);
              const d1DateStr = `${d1Date.getFullYear()}-${String(
                d1Date.getMonth() + 1
              ).padStart(2, "0")}-${String(d1Date.getDate()).padStart(2, "0")}`;
              return user.dailyActivity.activeDates.includes(d1DateStr);
            }).length;
            d1Retention = ((retained / sourceUsers.length) * 100).toFixed(2);
          }

          // Get revenue from source users (use IDs from filtered sourceUsers)
          const filteredSourceUserIds = sourceUsers.map((u) => u._id);
          const revenueData = await Transaction.aggregate([
            {
              $match: {
                ...transactionFilter,
                user: { $in: filteredSourceUserIds },
                type: { $in: ["credit", "reward"] },
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: "$amount" },
              },
            },
          ]);

          // Get reward cost
          const costData = await Transaction.aggregate([
            {
              $match: {
                ...transactionFilter,
                user: { $in: filteredSourceUserIds },
                type: "reward",
                balanceType: "coins",
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                cost: { $sum: "$amount" },
              },
            },
          ]);

          const revenue = revenueData[0]?.revenue || 0;
          const rewardCost = costData[0]?.cost || 0;
          const margin = revenue - rewardCost;
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0;

          return {
            source: source || "direct",
            installs: installs,
            d1Retention: parseFloat(d1Retention),
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
          };
        })
      );

      // ==================== ALERTS ====================
      const pendingRedemptions = await Transaction.countDocuments({
        type: "redemption",
        "approval.status": "pending",
        status: "pending",
      });

      const alerts = [];
      if (pendingRedemptions > 0) {
        alerts.push({
          type: "pending_redemption",
          severity: "medium",
          message: `${pendingRedemptions} pending redemptions require approval`,
          count: pendingRedemptions,
          timestamp: new Date(),
          actionUrl: "/admin/transactions/redemptions/pending",
        });
      }

      // Check for SDK failures (would need SDK error tracking)
      // Check for fraud alerts (would need fraud detection system)

      // ==================== SEARCH FUNCTIONALITY ====================
      let searchResults = null;
      if (search) {
        const searchRegex = new RegExp(search, "i");
        const [usersResults, gamesResults] = await Promise.all([
          User.find({
            $or: [
              { firstName: searchRegex },
              { lastName: searchRegex },
              { email: searchRegex },
              { mobile: searchRegex },
            ],
          })
            .select("firstName lastName email mobile _id")
            .limit(10)
            .lean(),
          Game.find({
            $or: [
              { title: searchRegex },
              { gameId: searchRegex },
              { description: searchRegex },
            ],
          })
            .select("gameId title bannerImage")
            .limit(10)
            .lean(),
        ]);

        searchResults = {
          users: usersResults,
          games: gamesResults,
          total: usersResults.length + gamesResults.length,
        };
      }

      // ==================== LEGACY VIP DATA ====================
      const [vipUsers, totalSubscriptions, activeSubscriptions, totalTiers] =
        await Promise.all([
          User.countDocuments({ ...userFilter, "vip.isActive": true }),
          VIPSubscription.countDocuments(),
          VIPSubscription.countDocuments({ status: "active" }),
          VIPTier.countDocuments({ active: true }),
        ]);

      // ==================== RESPONSE ====================
      res.json({
        success: true,
        data: {
          // A. Global KPI Cards
          kpis: {
            totalRegisteredUsers: totalUsers,
            activeUsersToday: activeUsersToday,
            totalRewardsIssued: totalRewardsIssued,
            totalRedemptions: totalRedemptions,
            avgXPPerUser: Math.round(avgXPPerUser),
          },

          // C. Retention Trend Graph
          retention: {
            current: {
              d1: parseFloat(retention.d1),
              d7: parseFloat(retention.d7),
              d14: parseFloat(retention.d14),
              d30: parseFloat(retention.d30),
            },
            trend: retentionTrend,
            totalCohort: retention.totalCohort,
          },

          // D. Top Played Game Snapshot
          topPlayedGame: topPlayedGame,

          // E. Revenue vs Reward Cost by Game Table
          revenueByGame: revenueTable,

          // F. Attribution Performance Table
          attribution: attributionData,

          // G. Alerts & Notification Panel
          alerts: alerts,

          // Search results (if search query provided)
          search: searchResults,

          // Filters applied
          filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            gameId: filters.gameId || null,
            source: filters.source || null,
            age: filters.age || null,
            gender: filters.gender || null,
            search: search || null,
          },

          // Legacy VIP data (for backward compatibility)
          overview: {
            totalUsers,
            vipUsers,
            totalSubscriptions,
            activeSubscriptions,
            totalTiers,
          },
        },
      });
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get dashboard statistics",
        error: error.message,
      });
    }
  }
);

// Helper functions for user styling
function getTierIcon(tier) {
  switch (tier.toLowerCase()) {
    case "bronze":
      return "https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png";
    case "gold":
      return "https://c.animaapp.com/t66hdvJZ/img/---icon--star--9@2x.png";
    case "platinum":
      return "https://c.animaapp.com/t66hdvJZ/img/---icon--star--10@2x.png";
    default:
      return "https://c.animaapp.com/t66hdvJZ/img/---icon--star--3@2x.png";
  }
}

function getTierBg(tier) {
  switch (tier.toLowerCase()) {
    case "bronze":
      return "#ffefda";
    case "gold":
      return "#fffddf";
    case "platinum":
      return "#f4f4f4";
    default:
      return "#ffefda";
  }
}

function getTierBorder(tier) {
  switch (tier.toLowerCase()) {
    case "bronze":
      return "#c77023";
    case "gold":
      return "#f0c92e";
    case "platinum":
      return "#9aa7b8";
    default:
      return "#c77023";
  }
}

function getTierColor(tier) {
  switch (tier.toLowerCase()) {
    case "bronze":
      return "#f68d2b";
    case "gold":
      return "#c7a20f";
    case "platinum":
      return "#6f85a4";
    default:
      return "#f68d2b";
  }
}

function getStatusBg(status) {
  switch (status.toLowerCase()) {
    case "active":
      return "#d3f8d2";
    case "inactive":
      return "#ffdbd4";
    case "paused":
      return "#fff2ab";
    default:
      return "#d3f8d2";
  }
}

function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case "active":
      return "#066657";
    case "inactive":
      return "#f40202";
    case "paused":
      return "#6f631b";
    default:
      return "#066657";
  }
}

/**
 * Get revenue by game - Separate endpoint for revenue data only
 * @route   GET /api/admin/revenue-by-game
 * @query   {string} startDate - Start date (ISO format)
 * @query   {string} endDate - End date (ISO format)
 * @query   {string} gameId - Filter by game ID
 * @query   {string} source - Filter by acquisition source
 * @query   {string} age - Filter by age group
 * @query   {string} gender - Filter by gender
 * @access  Admin
 */
router.get(
  "/revenue-by-game",
  adminAuth,
  [
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid start date format"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("Invalid end date format"),
    query("gameId").optional().isString(),
    query("source").optional().isString(),
    query("age").optional().isString(),
    query("gender").optional().isIn(["male", "female", "other"]),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { startDate, endDate, gameId, source, age, gender } = req.query;

      // Default to last 30 days if no date range provided
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const filters = {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        gameId,
        source,
        age,
        gender,
      };

      const userFilter = await buildUserFilter(filters);

      // Get filtered user IDs to apply to transaction queries
      let filteredUserIds = [];
      if (Object.keys(userFilter).length > 0) {
        const filteredUsers = await User.find(userFilter).select("_id").lean();
        filteredUserIds = filteredUsers.map((u) => u._id);
      }

      // Build transaction filter with user IDs if source/gender/age filters are applied
      const transactionFilter = buildTransactionFilter(filters);
      if (filteredUserIds.length > 0) {
        transactionFilter.user = { $in: filteredUserIds };
      } else if (filters.source || filters.gender || filters.age) {
        // If filters are applied but no users match, set empty array to return 0
        transactionFilter.user = { $in: [] };
      }

      // ==================== REVENUE VS REWARD COST BY GAME ====================
      const gamesWithRevenue = await Game.find({ isActive: true })
        .select("gameId title metadata analytics")
        .lean();

      const revenueTable = await Promise.all(
        gamesWithRevenue.map(async (game) => {
          // Build game-specific transaction filter (without gameId filter to avoid conflict)
          const gameTransactionFilter = { ...transactionFilter };
          if (gameTransactionFilter.$or) {
            delete gameTransactionFilter.$or;
          }
          gameTransactionFilter.$or = [
            { "metadata.gameId": game.gameId },
            { referenceId: new RegExp(game.gameId, "i") },
            { description: new RegExp(game.gameId, "i") },
          ];

          // Get revenue from transactions (offer completions, etc.)
          const revenueData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: { $in: ["credit", "reward"] },
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                revenue: { $sum: "$amount" },
              },
            },
          ]);

          // Get reward cost from transactions
          const rewardCostData = await Transaction.aggregate([
            {
              $match: {
                ...gameTransactionFilter,
                type: "reward",
                balanceType: "coins",
                status: "completed",
              },
            },
            {
              $group: {
                _id: null,
                cost: { $sum: "$amount" },
              },
            },
          ]);

          const revenue =
            revenueData[0]?.revenue || game.metadata?.revenue || 0;
          const rewardCost =
            rewardCostData[0]?.cost || game.metadata?.rewardCost || 0;
          const margin = revenue - rewardCost;
          const marginPercent =
            revenue > 0 ? ((margin / revenue) * 100).toFixed(2) : 0;

          // Calculate D7 retention for this game (apply user filter)
          const gameUsersForRetention = await User.find({
            "games.gameId": game.gameId,
            "games.installedAt": { $exists: true },
            ...userFilter,
          })
            .select("dailyActivity createdAt")
            .lean();

          let d7Retention = 0;
          if (gameUsersForRetention.length > 0) {
            const retained = gameUsersForRetention.filter((user) => {
              if (!user.dailyActivity?.activeDates) return false;
              const userCreatedAt = new Date(user.createdAt);
              const d7Date = new Date(userCreatedAt);
              d7Date.setDate(d7Date.getDate() + 7);
              const d7DateStr = `${d7Date.getFullYear()}-${String(
                d7Date.getMonth() + 1
              ).padStart(2, "0")}-${String(d7Date.getDate()).padStart(2, "0")}`;
              return user.dailyActivity.activeDates.includes(d7DateStr);
            }).length;
            d7Retention = (
              (retained / gameUsersForRetention.length) *
              100
            ).toFixed(2);
          }

          return {
            gameId: game.gameId,
            title: game.title,
            revenue: revenue,
            rewardCost: rewardCost,
            margin: margin,
            marginPercent: parseFloat(marginPercent),
            d7Retention: parseFloat(d7Retention),
            performance:
              parseFloat(marginPercent) > 0 ? "positive" : "negative",
          };
        })
      );

      // Sort by revenue descending
      revenueTable.sort((a, b) => b.revenue - a.revenue);

      // Calculate totals
      const totalRevenue = revenueTable.reduce(
        (sum, game) => sum + (game.revenue || 0),
        0
      );
      const totalRewardCost = revenueTable.reduce(
        (sum, game) => sum + (game.rewardCost || 0),
        0
      );
      const totalMargin = totalRevenue - totalRewardCost;
      const totalMarginPercent =
        totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(2) : 0;

      res.json({
        success: true,
        data: {
          revenueByGame: revenueTable,
          totals: {
            totalRevenue,
            totalRewardCost,
            totalMargin,
            totalMarginPercent: parseFloat(totalMarginPercent),
          },
          filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            gameId: filters.gameId || null,
            source: filters.source || null,
            age: filters.age || null,
            gender: filters.gender || null,
          },
        },
      });
    } catch (error) {
      console.error("Error getting revenue by game:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get revenue by game",
        error: error.message,
      });
    }
  }
);

module.exports = router;

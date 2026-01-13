/**
 * Everflow Controller
 * Handles business logic for Everflow API integration (non-gaming offers)
 * @module controllers/everflow
 */

const everflowService = require("../services/everflow.service");
const User = require("../models/User");
const EverflowConversion = require("../models/EverflowConversion");
const winston = require("winston");

// Create logger instance
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

/**
 * Get available offers
 * @route GET /api/everflow/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} type - Offer type (survey, shopping, cashback, magic_receipt, etc.)
 * @query {string} category - Category filter
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
  try {
    const queryParams = req.query;
    const userId = req.user?.userId || req.user?.id;

    // Get user for country/age filtering if available
    let user = null;
    if (userId) {
      user = await User.findById(userId).select("location country onboarding").lean();
    }

    // Add user-specific parameters
    if (user) {
      // Add country from user profile if not provided
      if (!queryParams.country && user.location?.current?.country) {
        queryParams.country = user.location.current.country;
      } else if (!queryParams.country && user.country) {
        queryParams.country = user.country;
      }

      // Add userId for user-specific click URLs (Everflow uses sub_id1 for tracking)
      queryParams.userId = userId;
    }

    logger.info("Fetching Everflow offers", {
      userId: userId,
      queryParams,
    });

    const result = await everflowService.getOffers(queryParams);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: {
          message: result.error || "Failed to fetch Everflow offers",
          code: "EVERFLOW_OFFERS_ERROR",
        },
        data: [],
        total: 0,
      });
    }

    res.json({
      success: true,
      data: result.data || [],
      total: result.total || 0,
      timestamp: result.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Everflow offers", {
      error: error.message,
      userId: req.user?.userId || req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch offers",
        code: "EVERFLOW_OFFERS_ERROR",
      },
      data: [],
      total: 0,
    });
  }
};

/**
 * Get conversions data (Admin only)
 * @route GET /api/everflow/conversions
 * @query {string} from - Start date (YYYY-MM-DD)
 * @query {string} to - End date (YYYY-MM-DD)
 * @query {string} status - Conversion status filter
 * @query {string} userId - User ID filter
 * @access Private (Admin only)
 */
exports.getConversions = async (req, res) => {
  try {
    // Admin-only check
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          message: "Admin access required",
          code: "ADMIN_ONLY",
        },
      });
    }

    const queryParams = req.query;

    logger.info("Fetching Everflow conversions", {
      adminId: req.user?.userId || req.user?.id,
      queryParams,
    });

    // Build MongoDB query for conversions
    const conversionQuery = {};

    // Filter by user if provided
    if (queryParams.userId) {
      conversionQuery.userId = queryParams.userId;
    }

    // Filter by status if provided
    if (queryParams.status) {
      conversionQuery.conversionStatus = queryParams.status;
    }

    // Filter by date range if provided
    if (queryParams.from || queryParams.to) {
      conversionQuery.eventTimestamp = {};
      if (queryParams.from) {
        conversionQuery.eventTimestamp.$gte = new Date(queryParams.from);
      }
      if (queryParams.to) {
        const toDate = new Date(queryParams.to);
        toDate.setHours(23, 59, 59, 999); // End of day
        conversionQuery.eventTimestamp.$lte = toDate;
      }
    }

    // Fetch conversions from database
    const conversions = await EverflowConversion.find(conversionQuery)
      .populate("userId", "firstName lastName email username")
      .sort({ eventTimestamp: -1 })
      .limit(parseInt(queryParams.limit) || 100)
      .skip(parseInt(queryParams.skip) || 0)
      .lean();

    // Get total count for pagination
    const total = await EverflowConversion.countDocuments(conversionQuery);

    // Calculate statistics
    const stats = await EverflowConversion.aggregate([
      { $match: conversionQuery },
      {
        $group: {
          _id: "$conversionStatus",
          count: { $sum: 1 },
          totalCoins: { $sum: "$creditedCoins" },
          totalXP: { $sum: "$creditedXP" },
          totalRevenue: { $sum: "$revenue.amount" },
        },
      },
    ]);

    res.json({
      success: true,
      data: conversions,
      total: total,
      stats: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Everflow conversions", {
      error: error.message,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch conversions",
        code: "EVERFLOW_CONVERSIONS_ERROR",
      },
    });
  }
};

/**
 * Get user conversions
 * @route GET /api/everflow/user-conversions/:userId
 * @param {string} userId - User ID
 * @query {string} status - Conversion status filter
 * @access Private (user can only access their own conversions)
 */
exports.getUserConversions = async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterId = req.user?.userId || req.user?.id;

    // Validate that user can only access their own conversions (unless admin)
    if (requesterId !== userId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          message: "Unauthorized to access this user's conversions",
          code: "FORBIDDEN",
        },
      });
    }

    const queryParams = req.query;
    const status = queryParams.status || null;

    logger.info("Fetching Everflow user conversions", {
      requesterId: requesterId,
      targetUserId: userId,
      status,
    });

    const conversions = await EverflowConversion.getUserConversions(userId, status);

    res.json({
      success: true,
      data: conversions,
      total: conversions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Everflow user conversions", {
      error: error.message,
      userId: req.params.userId,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch user conversions",
        code: "EVERFLOW_USER_CONVERSIONS_ERROR",
      },
    });
  }
};

/**
 * Health check
 * @route GET /api/everflow/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
  try {
    const health = await everflowService.healthCheck();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Everflow health check error", {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: {
        message: "Health check failed",
        code: "HEALTH_CHECK_ERROR",
      },
    });
  }
};

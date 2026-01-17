/**
 * Affise Controller
 * Handles business logic for Affise API integration
 * @module controllers/affise
 */

const affiseService = require("../services/affise.service");
const winston = require("winston");

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
 * @route GET /api/affise/offers
 * @query {string} country - Country code filter
 * @query {string} os - OS filter
 * @query {string} device_type - Device type filter
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Affise offers", {
      userId: req.user?.userId || req.user?.id,
      queryParams,
    });

    const result = await affiseService.getOffers(queryParams);

    res.json({
      success: true,
      data: result?.data || [],
      total: result?.total || 0,
      timestamp: result?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Affise offers", {
      error: error.message,
      userId: req.user?.userId || req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch offers",
        code: "AFFISE_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Get custom statistics (Admin only)
 * @route GET /api/affise/stats/custom
 * @query {string} date_from - Start date (YYYY-MM-DD)
 * @query {string} date_to - End date (YYYY-MM-DD)
 * @access Private (Admin only)
 */
exports.getStatsCustom = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Affise custom stats", {
      adminId: req.user?.userId || req.user?.id,
      queryParams,
    });

    const result = await affiseService.getStatsCustom(queryParams);

    res.json({
      success: true,
      data: result?.data || [],
      timestamp: result?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Affise custom stats", {
      error: error.message,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch custom stats",
        code: "AFFISE_STATS_CUSTOM_ERROR",
      },
    });
  }
};

/**
 * Get conversions (Admin only)
 * @route GET /api/affise/stats/conversions
 * @query {string} date_from - Start date (YYYY-MM-DD)
 * @query {string} date_to - End date (YYYY-MM-DD)
 * @access Private (Admin only)
 */
exports.getConversions = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Affise conversions", {
      adminId: req.user?.userId || req.user?.id,
      queryParams,
    });

    const result = await affiseService.getConversions(queryParams);

    res.json({
      success: true,
      data: result?.data || [],
      timestamp: result?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Affise conversions", {
      error: error.message,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch conversions",
        code: "AFFISE_CONVERSIONS_ERROR",
      },
    });
  }
};

/**
 * Get clicks (Admin only)
 * @route GET /api/affise/stats/clicks
 * @query {string} date_from - Start date (YYYY-MM-DD)
 * @query {string} date_to - End date (YYYY-MM-DD)
 * @access Private (Admin only)
 */
exports.getClicks = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Affise clicks", {
      adminId: req.user?.userId || req.user?.id,
      queryParams,
    });

    const result = await affiseService.getClicks(queryParams);

    res.json({
      success: true,
      data: result?.data || [],
      timestamp: result?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Affise clicks", {
      error: error.message,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch clicks",
        code: "AFFISE_CLICKS_ERROR",
      },
    });
  }
};

/**
 * Health check
 * @route GET /api/affise/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
  try {
    const health = await affiseService.healthCheck();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Affise health check error", {
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

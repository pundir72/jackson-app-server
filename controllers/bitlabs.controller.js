/**
 * Bitlabs Controller
 * Handles business logic for Bitlabs API integration
 * @module controllers/bitlabs
 */

const bitlabsService = require("../services/bitlabs.service");
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
 * @route GET /api/bitlabs/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} category - Category filter
 * @query {string} type - Offer type (game, survey, etc.)
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    // If called from admin endpoint for games, filter for games only
    // The admin endpoint /games/by-sdk/bitlabs expects game offers
    const isGameRequest =
      req.path?.includes("by-sdk") || queryParams.is_game === "true";

    logger.info("Fetching Bitlabs offers", {
      userId: req.user?.id,
      queryParams,
      isGameRequest,
    });

    // Use getGameOffers if this is a game request, otherwise use getOffers
    const data = isGameRequest
      ? await bitlabsService.getGameOffers(queryParams)
      : await bitlabsService.getOffers(queryParams);

    // Transform BitLabs game offers to match frontend expectations (similar to Besitos format)
    let transformedData = data?.data || [];
    if (isGameRequest && Array.isArray(transformedData)) {
      transformedData = transformedData.map((offer) => {
        // Calculate total payout from events (sum of all payable event payouts)
        let totalPayout = 0;
        if (Array.isArray(offer.events)) {
          totalPayout = offer.events
            .filter((event) => event.payable === true)
            .reduce((sum, event) => {
              const payout = parseFloat(event.payout) || 0;
              return sum + payout;
            }, 0);
        }

        // Use total_points if available, otherwise calculate from events
        const totalPoints = parseFloat(offer.total_points) || 0;

        // Calculate amount in USD (use total payout from events, or estimate from points)
        // If we have payout from events, use that; otherwise estimate from points
        const amount =
          totalPayout > 0
            ? totalPayout
            : totalPoints > 0
            ? totalPoints / 1000 // Rough estimate: 1000 points ≈ $1
            : 0;

        // Extract device info from categories (BitLabs uses categories like "iPhone", "iPad", "Android")
        const categories = offer.categories || [];
        const devices = [];
        let devicePlatform = null;

        if (categories.includes("iPhone") || categories.includes("iPad")) {
          devices.push("iphone", "ipad");
          devicePlatform = "ios";
        }
        if (categories.includes("Android") || categories.includes("CPE")) {
          devices.push("android");
          if (!devicePlatform) devicePlatform = "android";
        }

        // If no devices found in categories, use query params or default to all
        if (devices.length === 0) {
          if (queryParams.device_platform) {
            const platform = queryParams.device_platform.toLowerCase();
            if (platform === "ios" || platform === "iphone") {
              devices.push("iphone");
              devicePlatform = "ios";
            } else if (platform === "android") {
              devices.push("android");
              devicePlatform = "android";
            }
          } else {
            // Default to both if no info available
            devices.push("android", "iphone");
          }
        }

        return {
          ...offer,
          // Map anchor to title for frontend compatibility
          title:
            offer.anchor ||
            offer.title ||
            offer.product_name ||
            "Untitled Game",
          // Add amount field for frontend (in USD)
          amount: amount,
          // Ensure id is a string for frontend compatibility
          id: offer.id?.toString() || offer.offerId?.toString() || "",
          // Add description if missing
          description: offer.description || "",
          // Add device/platform info for filtering
          devices: devices,
          device_platform:
            devicePlatform || queryParams.device_platform || null,
        };
      });
    }

    res.json({
      success: true,
      data: transformedData,
      total: transformedData.length,
      timestamp: data?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Bitlabs offers", {
      error: error.message,
      userId: req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch offers",
        code: "BITLABS_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Get game offers specifically
 * @route GET /api/bitlabs/game-offers
 * @query {string} platform - Platform filter
 * @query {string} country - Country code filter
 * @access Private (requires authentication)
 */
exports.getGameOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Bitlabs game offers", {
      userId: req.user?.id,
      queryParams,
    });

    const data = await bitlabsService.getGameOffers(queryParams);

    res.json({
      success: true,
      data: data?.data || [],
      total: data?.total || 0,
      timestamp: data?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Bitlabs game offers", {
      error: error.message,
      userId: req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch game offers",
        code: "BITLABS_GAME_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Health check
 * @route GET /api/bitlabs/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
  try {
    const health = await bitlabsService.healthCheck();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Health check failed",
        code: "HEALTH_CHECK_ERROR",
      },
    });
  }
};

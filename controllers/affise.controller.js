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
 * Get offers for admin configuration (uses Admin API endpoint)
 * @route GET /api/affise/admin/offers
 * @query {string} type       - Filter by type (all, survey, cashback, shopping, magic_receipt)
 * @query {string} country    - Country code filter
 * @query {number} page       - Page number (default 1)
 * @query {number} limit      - Items per page (default 20, max 100)
 * @access Private (Admin only)
 */
exports.getAdminOffers = async (req, res) => {
  try {
    const { type = "all", country, page = 1, limit = 20 } = req.query;

    const queryParams = { "status[]": "active" };
    if (country) queryParams.country = country;

    logger.info("Fetching Affise admin offers", {
      adminId: req.user?.userId || req.user?.id,
      queryParams,
    });

    const result = await affiseService.getOffers(queryParams, { admin: true });

    console.log("🔵 [AFFISE RAW] Direct response from Affise:");
    console.log("🔵 [AFFISE RAW] - raw keys:", Object.keys(result.raw || {}));
    console.log("🔵 [AFFISE RAW] - full raw:", JSON.stringify(result.raw, null, 2));

    if (!result.data?.length) {
      console.warn("⚠️ [AFFISE ADMIN OFFERS] No offers returned from Affise admin API");
    }

    // Strip HTML tags from Affise rich-text fields
    const stripHtml = (str) => (str ? str.replace(/<[^>]*>/g, "").trim() : null);

    // Map raw Affise offer → clean shape for the client
    const mapOffer = (raw) => {
      // Admin price: what the platform earns per conversion (USD)
      const cpi = parseFloat(raw.payments?.[0]?.revenue ?? 0) || 0;
      // User reward: 50% of CPI as coins
      const userRewardCoins = Math.round(cpi * 0.5);
      const userRewardXP    = Math.round(userRewardCoins * 0.5);

      return {
        id:                  raw.id,
        offer_id:            raw.offer_id,
        title:               raw.title,
        description:         stripHtml(raw.description_lang?.en) || "",
        logo:                raw.logo || raw.logo_source || null,
        preview_url:         raw.preview_url || null,
        click_url:           raw.link || raw.links?.[0]?.url || null,
        // --- pricing ---
        // Admin sees: full platform revenue per conversion (USD)
        cpi,
        currency:            raw.payments?.[0]?.currency ?? null,
        payout_type:         raw.payments?.[0]?.type ?? null,
        payment_goal:        raw.payments?.[0]?.goal ?? null,
        payment_countries:   raw.payments?.[0]?.countries ?? [],
        // User sees: coins + XP earned on completion (20% of CPI → coins, 50% of coins → XP)
        userRewardCoins,
        userRewardXP,
        reward: { coins: userRewardCoins, xp: userRewardXP, currency: "points" },
        // ---------------
        epc:                 raw.epc,
        affiliate_epc:       raw.affiliate_epc,
        // targeting
        allowed_countries:   raw.targeting?.[0]?.country?.allow ?? [],
        strictly_country:    raw.strictly_country,
        allowed_os:          raw.targeting?.[0]?.os?.allow ?? [],
        device_types:        raw.targeting?.[0]?.device_type ?? [],
        // caps
        daily_cap:           raw.caps?.[0]?.value ?? null,
        cap_period:          raw.caps?.[0]?.period ?? null,
        cap_type:            raw.caps?.[0]?.type ?? null,
        cap_current:         raw.caps?.[0]?.current_value ?? null,
        caps_status:         raw.caps_status ?? [],
        // meta
        categories:          raw.categories ?? [],
        required_approval:   raw.required_approval,
        is_cpi:              raw.is_cpi,
        kpi:                 stripHtml(raw.kpi?.en) || null,
        click_session:       raw.click_session,
        stop_at:             raw.stop_at || null,
      };
    };

    console.log("🟣 [AFFISE ADMIN OFFERS] Sample mapped offer:", JSON.stringify(
      result.data?.length ? mapOffer(result.data[0]) : null,
      null, 2
    ));

    let offers = (result.data || []).map(mapOffer);
    if (type && type !== "all") {
      offers = offers.filter((o) => (o.offerType || o.type || "other") === type);
    }

    const total = offers.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;
    const data = offers.slice(skip, skip + limitNum);

    res.json({
      success: true,
      data,
      total,
      timestamp: result.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Affise admin offers", {
      error: error.message,
      adminId: req.user?.userId || req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch Affise admin offers",
        code: "AFFISE_OFFERS_ERROR",
      },
      data: [],
      total: 0,
      timestamp: new Date().toISOString(),
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

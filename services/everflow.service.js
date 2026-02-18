/**
 * Everflow API Service
 * Handles all API calls to Everflow platform for non-gaming offers
 * Documentation: https://developers.everflow.io/docs/affiliate/postbacks/
 * @module services/everflow
 */

const axios = require("axios");
const config = require("../config/config");

class EverflowService {
  constructor() {
    // Try multiple possible base URLs
    this.possibleBaseURLs = [config.EVERFLOW_BASE_URL].filter(Boolean); // Remove undefined/null values

    this.baseURL = this.possibleBaseURLs[0];
    this.apiKey = config.EVERFLOW_API_KEY;

    // Create axios instance with default config
    // Try multiple authentication methods
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 seconds timeout
    });

    // Add request interceptor for authentication
    // Everflow API uses X-Eflow-API-Key header only
    this.client.interceptors.request.use(
      (config) => {
        // console.log("\n🟡 ========== EVERFLOW REQUEST INTERCEPTOR ==========");
        // console.log("🟡 [INTERCEPTOR] Request method:", config.method);
        // console.log("🟡 [INTERCEPTOR] Request URL:", config.url);
        // console.log("🟡 [INTERCEPTOR] Full URL:", `${config.baseURL}${config.url}`);
        // console.log("🟡 [INTERCEPTOR] Request params:", JSON.stringify(config.params, null, 2));
        // console.log("🟡 [INTERCEPTOR] Request headers:", JSON.stringify(config.headers, null, 2));

        if (this.apiKey) {
          config.headers["X-Eflow-API-Key"] = this.apiKey;
          // console.log("🟡 [INTERCEPTOR] API Key added to headers");
        } else {
          // console.warn("⚠️ [INTERCEPTOR] No API key available!");
        }
        // console.log("🟡 ===========================================\n");
        return config;
      },
      (error) => {
        // console.error("❌ [INTERCEPTOR] Request interceptor error:", error);
        return Promise.reject(error);
      },
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        // RAW RESPONSE FROM EVERFLOW API - Show only first 2 offers
        console.log("\n🟢 ========== RAW EVERFLOW API RESPONSE ==========");

        // Show response structure
        console.log("🟢 [RAW RESPONSE] Response structure:", {
          hasOffers: !!response.data?.offers,
          offersCount: response.data?.offers?.length || 0,
          hasPaging: !!response.data?.paging,
        });

        // Show only first 2 offers
        if (response.data?.offers && Array.isArray(response.data.offers)) {
          const firstTwoOffers = response.data.offers.slice(0, 2);
          console.log(
            "🟢 [RAW RESPONSE] First 2 offers:",
            JSON.stringify(firstTwoOffers, null, 2),
          );
        } else if (Array.isArray(response.data) && response.data.length > 0) {
          const firstTwoOffers = response.data.slice(0, 2);
          console.log(
            "🟢 [RAW RESPONSE] First 2 offers:",
            JSON.stringify(firstTwoOffers, null, 2),
          );
        } else {
          console.log(
            "🟢 [RAW RESPONSE] Full response data:",
            JSON.stringify(response.data, null, 2),
          );
        }

        console.log("🟢 ===========================================\n");

        // console.log("\n🟢 ========== EVERFLOW RESPONSE INTERCEPTOR ==========");
        // console.log("🟢 [INTERCEPTOR] Response status:", response.status);
        // console.log("🟢 [INTERCEPTOR] Response status text:", response.statusText);
        // console.log("🟢 [INTERCEPTOR] Response headers:", JSON.stringify(response.headers, null, 2));
        // console.log("🟢 [INTERCEPTOR] Response data keys:", Object.keys(response.data || {}));
        // console.log("🟢 ===========================================\n");
        return response;
      },
      (error) => {
        // console.error("\n❌ ========== EVERFLOW RESPONSE ERROR INTERCEPTOR ==========");
        // console.error("❌ [INTERCEPTOR] Error occurred in response interceptor");

        if (error.response) {
          // console.error("❌ [INTERCEPTOR] Error response status:", error.response.status);
          // console.error("❌ [INTERCEPTOR] Error response data:", JSON.stringify(error.response.data, null, 2));
          // console.error("❌ [INTERCEPTOR] Error response headers:", JSON.stringify(error.response.headers, null, 2));
          // Server responded with error status
          const errorData = {
            status: error.response.status,
            message: error.response.data?.message || error.message,
            data: error.response.data,
          };
          throw errorData;
        } else if (error.request) {
          // console.error("❌ [INTERCEPTOR] No response received from server");
          // console.error("❌ [INTERCEPTOR] Request config:", {
          //   url: error.config?.url,
          //   method: error.config?.method,
          //   baseURL: error.config?.baseURL
          // });
          // Request made but no response
          throw {
            status: 503,
            message: "Everflow API is not responding",
            data: null,
          };
        } else {
          // console.error("❌ [INTERCEPTOR] Request setup error:", error.message);
          // Error in request setup
          throw {
            status: 500,
            message: error.message,
            data: null,
          };
        }
      },
    );
  }

  /**
   * Validate service configuration
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.baseURL && this.apiKey);
  }

  /**
   * Get all postbacks/offers (legacy method name - delegates to getOffers)
   * Endpoint: GET /v1/affiliates/offersrunnable
   * Documentation: https://developers.everflow.io/docs/affiliate/
   * @param {Object} queryParams - Query parameters (network_id, offer_id, status, etc.)
   * @returns {Promise<Object>} Offers data
   */
  async getPostbacks(queryParams = {}) {
    // Use the correct getOffers method
    return this.getOffers(queryParams);
  }

  /**
   * Get offer by ID
   * Endpoint: GET /v1/affiliates/offers/:offerId (Find By ID - returns full details including payouts)
   * @param {string} offerId - Offer ID (network_offer_id)
   * @returns {Promise<Object>} Offer data
   */
  async getOfferById(offerId) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Everflow API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = `/v1/affiliates/offers/${encodeURIComponent(offerId)}`;
      const response = await this.client.get(endpoint);

      const offer = response.data;
      if (!offer) {
        throw {
          status: 404,
          message: `Offer with ID ${offerId} not found`,
          data: null,
        };
      }

      return {
        success: true,
        data: this.normalizeOffer(offer),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Everflow getOfferById error:", error);
      throw error;
    }
  }

  /**
   * Get postback by ID (legacy method name - delegates to getOfferById)
   * @param {string} postbackId - Postback/Offer ID
   * @returns {Promise<Object>} Postback data
   */
  async getPostbackById(postbackId) {
    return this.getOfferById(postbackId);
  }

  /**
   * Get offers - Uses runnable offers endpoint (includes payouts, ruleset, creatives)
   * Endpoint: GET /v1/affiliates/offersrunnable
   * @param {Object} queryParams - Query parameters (can include userId for user-specific URLs)
   * @returns {Promise<Object>} Offers data
   */
  async getOffers(queryParams = {}) {
    if (!this.isConfigured()) {
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const endpoint = "/v1/affiliates/offersrunnable";

      // Extract userId if provided (for user-specific tracking)
      const { userId, ...apiParams } = queryParams;

      // console.log("\n🟢 ========== EVERFLOW API REQUEST ==========");
      // console.log("🟢 [EVERFLOW SERVICE] Request URL:", `${this.baseURL}${endpoint}`);
      // console.log("🟢 [EVERFLOW SERVICE] Request params:", JSON.stringify(apiParams, null, 2));
      // console.log("🟢 [EVERFLOW SERVICE] Full URL:", `${this.baseURL}${endpoint}?${new URLSearchParams(apiParams).toString()}`);

      // If userId is provided, we'll add it to click URLs later
      // Everflow uses sub_id1, sub_id2, etc. for user tracking in postbacks
      const response = await this.client.get(endpoint, { params: apiParams });

      // console.log("🟢 [EVERFLOW SERVICE] Raw API Response received:");
      // console.log("🟢 [EVERFLOW SERVICE] - Status:", response.status);
      // console.log("🟢 [EVERFLOW SERVICE] - Status text:", response.statusText);
      // console.log("🟢 [EVERFLOW SERVICE] - Response headers:", JSON.stringify(response.headers, null, 2));
      // console.log("🟢 [EVERFLOW SERVICE] - Response data keys:", Object.keys(response.data || {}));
      // console.log("🟢 [EVERFLOW SERVICE] - Full response data:", JSON.stringify(response.data, null, 2));
      // console.log("🟢 [EVERFLOW SERVICE] - Has offers array:", !!response.data?.offers);
      // console.log("🟢 [EVERFLOW SERVICE] - Offers count:", response.data?.offers?.length || 0);
      // console.log("🟢 [EVERFLOW SERVICE] - Paging info:", JSON.stringify(response.data?.paging, null, 2));

      // if (response.data?.offers && response.data.offers.length > 0) {
      //   console.log("🟢 [EVERFLOW SERVICE] - First offer sample:", JSON.stringify(response.data.offers[0], null, 2));
      // }

      // Everflow returns: { "offers": [...], "paging": {...} }
      let offers = [];
      if (response.data?.offers && Array.isArray(response.data.offers)) {
        offers = response.data.offers;
        // console.log("🟢 [EVERFLOW SERVICE] - Extracted offers from response.data.offers:", offers.length);
      } else if (Array.isArray(response.data)) {
        offers = response.data;
        // console.log("🟢 [EVERFLOW SERVICE] - Extracted offers from response.data (direct array):", offers.length);
      } else {
        // console.warn("⚠️ [EVERFLOW SERVICE] - No offers found in response structure!");
        // console.warn("⚠️ [EVERFLOW SERVICE] - Response structure:", {
        //   hasOffers: !!response.data?.offers,
        //   isDataArray: Array.isArray(response.data),
        //   dataType: typeof response.data,
        //   dataKeys: Object.keys(response.data || {})
        // });
      }
      // console.log("🟢 ===========================================\n");

      // console.log("🟢 [EVERFLOW SERVICE] Normalizing offers...");
      // console.log("🟢 [EVERFLOW SERVICE] - Total offers to normalize:", offers.length);

      // Normalize offers and add user-specific tracking if userId provided
      const normalizedOffers = offers.map((offer, index) => {
        // console.log(`🟢 [EVERFLOW SERVICE] Normalizing offer ${index + 1}/${offers.length}:`, {
        //   network_offer_id: offer.network_offer_id,
        //   name: offer.name,
        //   offer_status: offer.offer_status,
        //   preview_url: offer.preview_url,
        //   tracking_url: offer.tracking_url,
        //   network_category_id: offer.network_category_id,
        // });

        const normalized = this.normalizeOffer(offer);

        // console.log(`🟢 [EVERFLOW SERVICE] Normalized offer ${index + 1}:`, {
        //   offerId: normalized.offerId,
        //   title: normalized.title,
        //   clickUrl: normalized.clickUrl,
        //   deepLink: normalized.deepLink,
        //   offerType: normalized.offerType,
        //   coinReward: normalized.coinReward,
        // });

        // If userId provided, add it to click URL for tracking
        // Everflow uses sub_id1 parameter for user tracking in postbacks
        if (queryParams.userId && normalized.clickUrl) {
          try {
            const url = new URL(normalized.clickUrl);
            url.searchParams.set("sub_id1", queryParams.userId);
            normalized.clickUrl = url.toString();
            normalized.deepLink = url.toString();
            // console.log(`🟢 [EVERFLOW SERVICE] Added userId to clickUrl for offer ${index + 1}`);
          } catch (e) {
            // If URL parsing fails, append as query param
            const separator = normalized.clickUrl.includes("?") ? "&" : "?";
            normalized.clickUrl = `${normalized.clickUrl}${separator}sub_id1=${queryParams.userId}`;
            normalized.deepLink = normalized.clickUrl;
            // console.log(`🟢 [EVERFLOW SERVICE] Added userId to clickUrl (fallback method) for offer ${index + 1}`);
          }
        }

        return normalized;
      });

      // console.log("🟢 [EVERFLOW SERVICE] Final normalized offers count:", normalizedOffers.length);
      // if (normalizedOffers.length > 0) {
      //   console.log("🟢 [EVERFLOW SERVICE] First normalized offer sample:", JSON.stringify(normalizedOffers[0], null, 2));
      // }

      return {
        success: true,
        data: normalizedOffers,
        total: normalizedOffers.length,
        paging: response.data?.paging || null,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Everflow getOffers error:", error);
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message || "Failed to fetch Everflow offers",
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Normalize Everflow offer to match our system format
   * Maps all important fields from offersrunnable response:
   * network_offer_id, name, tracking_url, relationship.payouts, relationship.category, relationship.ruleset, relationship.meta, etc.
   * @param {Object} offer - Raw offer from Everflow API (offersrunnable or Find By ID)
   * @returns {Object} Normalized offer
   */
  normalizeOffer(offer) {
    const rel = offer.relationship || {};
    const firstPayout = rel.payouts?.entries?.[0];
    const ruleset = rel.ruleset || {};
    const meta = rel.meta || {};
    const firstCreative = rel.creatives?.entries?.[0];

    // User-facing URL: preview_url (e.g. store link) > tracking_url > redirect_tracking_url
    const clickUrl =
      offer.preview_url ||
      offer.tracking_url ||
      offer.redirect_tracking_url ||
      "";
    // Tracking link for postbacks (redirect_tracking_url is the click tracking URL)
    const trackingUrl =
      offer.redirect_tracking_url || offer.tracking_url || clickUrl;

    return {
      ...offer, // Preserve all original Everflow fields
      // --- IDs ---
      offerId:
        offer.network_offer_id?.toString() ||
        offer.offer_id?.toString() ||
        offer.id?.toString() ||
        "",
      externalId:
        offer.network_offer_id?.toString() ||
        offer.offer_id?.toString() ||
        offer.id?.toString() ||
        "",
      // --- Display ---
      title: offer.name || offer.title || "Unknown Offer",
      description:
        offer.html_description || offer.description || offer.desc || "",
      termsAndConditions:
        offer.terms_and_conditions || offer.terms_and_conditions_plain || "",
      // --- URLs ---
      clickUrl,
      deepLink: clickUrl,
      trackingUrl,
      impressionTrackingUrl: offer.impression_tracking_url || "",
      previewUrl: offer.preview_url || "",
      storeUrl: meta.store_url || offer.preview_url || "",
      creativeBundleUrl: rel.creative_bundle?.url || "",
      // --- Category & type ---
      category:
        offer.category ||
        offer.category_name ||
        rel.category?.name ||
        offer.network_category_id?.toString() ||
        "other",
      offerType: this.determineOfferType(offer),
      provider: "everflow",
      sdkProvider: "everflow",
      // --- Rewards: fixed 30 coins and 10 XP for Everflow (card display); payout kept for admin reference ---
      coinReward: 30,
      userRewardCoins: 30,
      userRewardXP: 10,
      payoutAmount:
        offer.payout ||
        offer.revenue ||
        offer.reward_amount ||
        firstPayout?.payout_amount ||
        0,
      payoutType: firstPayout?.payout_type || offer.payout_type || "",
      currency: offer.currency_id || offer.currency || "USD",
      // --- Status ---
      status:
        offer.offer_status === "active" ? "live" : offer.offer_status || "live",
      isAvailable: offer.offer_status === "active",
      offerAffiliateStatus:
        rel.offer_affiliate_status || offer.visibility || "public",
      visibility: offer.visibility || "public",
      // --- Media ---
      thumbnailUrl: offer.thumbnail_url || firstCreative?.resource_url || "",
      creatives: rel.creatives?.entries || [],
      // --- Network / advertiser ---
      networkId:
        offer.network_id?.toString() || offer.networkId?.toString() || "",
      advertiserId:
        offer.advertiser_id?.toString() || offer.advertiserId?.toString() || "",
      // --- App (relationship.meta) ---
      app_identifier:
        offer.app_identifier || meta.bundle_id || meta.app_id || "",
      bundleId: meta.bundle_id || offer.app_identifier || "",
      appId: meta.app_id || "",
      // --- Requirements (from relationship.ruleset) ---
      requirements: {
        minAge: offer.min_age || offer.minAge || 18,
        countries:
          ruleset.countries?.length > 0
            ? ruleset.countries
            : offer.countries || offer.target_countries || [],
        regions: ruleset.regions || [],
        platforms: ruleset.platforms || [],
        deviceTypes: ruleset.device_types || [],
        languages: ruleset.languages || [],
      },
      // --- Caps (relationship.remaining_caps) ---
      remainingCaps: rel.remaining_caps || null,
      // --- Timestamps (Everflow uses Unix seconds) ---
      createdAt: offer.time_created
        ? new Date(offer.time_created * 1000).toISOString()
        : offer.date_live_until || offer.created_at || offer.createdAt,
      updatedAt: offer.time_saved
        ? new Date(offer.time_saved * 1000).toISOString()
        : offer.updated_at || offer.updatedAt,
      dateLiveUntil: offer.date_live_until || "",
      estimatedTime: offer.estimated_time || offer.duration || offer.loi || 5,
      // --- Preserve full relationship ---
      relationship: rel,
    };
  }

  /**
   * Determine offer type from Everflow offer data (name, category, relationship.category.name)
   * @param {Object} offer - Offer data (raw Everflow response)
   * @returns {string} Offer type
   */
  determineOfferType(offer) {
    if (offer.type) {
      return offer.type.toLowerCase();
    }

    const categoryName =
      offer.relationship?.category?.name ||
      offer.category ||
      offer.category_name ||
      "";
    const category = String(categoryName).toLowerCase();
    if (category.includes("survey")) return "survey";
    if (category.includes("shopping") || category.includes("retail"))
      return "shopping";
    if (category.includes("receipt") || category.includes("magic"))
      return "magic_receipt";
    if (category.includes("cashback")) return "cashback";
    if (category.includes("game")) return "game";

    const name = (offer.name || offer.title || "").toLowerCase();
    const desc = (
      offer.html_description ||
      offer.description ||
      ""
    ).toLowerCase();
    if (name.includes("survey") || desc.includes("survey")) return "survey";
    if (name.includes("shop") || desc.includes("shop")) return "shopping";
    if (name.includes("receipt") || desc.includes("receipt"))
      return "magic_receipt";
    if (name.includes("cashback") || desc.includes("cashback"))
      return "cashback";

    return "other";
  }

  /**
   * Get conversions
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Conversions data
   */
  async getConversions(queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Everflow API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = "/affiliate/conversions";
      const response = await this.client.get(endpoint, { params: queryParams });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Everflow getConversions error:", error);
      throw error;
    }
  }

  /**
   * Health check for Everflow API
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing Everflow config (BASE_URL or API_KEY)",
      };
    }

    try {
      // Try to fetch postbacks with limit=1 as health check
      const response = await this.getPostbacks({ limit: 1 });
      return {
        status: "ok",
        configured: true,
        data: {
          reachable: true,
          sampleCount: response.total || 0,
        },
      };
    } catch (error) {
      console.error("Everflow health check error:", error);
      const status = error.status || error?.response?.status;
      if (status === 401 || status === 403) {
        return {
          status: "unauthorized",
          configured: true,
          error: "Invalid or unauthorized Everflow API key",
          httpStatus: status,
        };
      }
      if (status >= 500) {
        return {
          status: "upstream_error",
          configured: true,
          error: "Everflow API server error",
          httpStatus: status,
        };
      }
      return {
        status: "error",
        configured: true,
        error: error.message || "Health probe failed",
      };
    }
  }
}

// class EverflowService {
//   constructor() {
//     // Try multiple possible base URLs
//     this.possibleBaseURLs = [config.EVERFLOW_BASE_URL].filter(Boolean); // Remove undefined/null values

//     this.baseURL = this.possibleBaseURLs[0];
//     this.apiKey = config.EVERFLOW_API_KEY;

//     // Create axios instance with default config
//     // Try multiple authentication methods
//     this.client = axios.create({
//       baseURL: this.baseURL,
//       headers: {
//         Accept: "application/json",
//         "Content-Type": "application/json",
//       },
//       timeout: 30000, // 30 seconds timeout
//     });

//     // Add request interceptor for authentication
//     // Everflow API uses X-Eflow-API-Key header only
//     this.client.interceptors.request.use(
//       (config) => {
//         if (this.apiKey) {
//           config.headers["X-Eflow-API-Key"] = this.apiKey;
//         }
//         return config;
//       },
//       (error) => {
//         return Promise.reject(error);
//       },
//     );

//     // Add response interceptor for error handling
//     this.client.interceptors.response.use(
//       (response) => response,
//       (error) => {
//         if (error.response) {
//           // Server responded with error status
//           const errorData = {
//             status: error.response.status,
//             message: error.response.data?.message || error.message,
//             data: error.response.data,
//           };
//           throw errorData;
//         } else if (error.request) {
//           // Request made but no response
//           throw {
//             status: 503,
//             message: "Everflow API is not responding",
//             data: null,
//           };
//         } else {
//           // Error in request setup
//           throw {
//             status: 500,
//             message: error.message,
//             data: null,
//           };
//         }
//       },
//     );
//   }

//   /**
//    * Validate service configuration
//    * @returns {boolean}
//    */
//   isConfigured() {
//     return !!(this.baseURL && this.apiKey);
//   }

//   /**
//    * Get all postbacks/offers (legacy method name - delegates to getOffers)
//    * Endpoint: GET /v1/affiliates/alloffers
//    * Documentation: https://developers.everflow.io/docs/affiliate/
//    * @param {Object} queryParams - Query parameters (network_id, offer_id, status, etc.)
//    * @returns {Promise<Object>} Offers data
//    */
//   async getPostbacks(queryParams = {}) {
//     // Use the correct getOffers method
//     return this.getOffers(queryParams);
//   }

//   /**
//    * Get offer by ID
//    * Endpoint: GET /v1/affiliates/alloffers (with network_offer_id filter)
//    * @param {string} offerId - Offer ID (network_offer_id)
//    * @returns {Promise<Object>} Offer data
//    */
//   async getOfferById(offerId) {
//     if (!this.isConfigured()) {
//       throw {
//         status: 500,
//         message: "Everflow API is not properly configured",
//         data: null,
//       };
//     }

//     try {
//       // Everflow API uses query parameters, not path parameters
//       // Filter by network_offer_id
//       const endpoint = `/v1/affiliates/alloffers`;
//       const response = await this.client.get(endpoint, {
//         params: {
//           network_offer_id: offerId,
//         },
//       });

//       // Everflow returns an array of offers, find the matching one
//       let offers = [];
//       if (response.data?.offers && Array.isArray(response.data.offers)) {
//         offers = response.data.offers;
//       } else if (Array.isArray(response.data)) {
//         offers = response.data;
//       }

//       // Find the offer with matching network_offer_id
//       const offer = offers.find(
//         (o) =>
//           o.network_offer_id?.toString() === offerId.toString() ||
//           o.offer_id?.toString() === offerId.toString() ||
//           o.id?.toString() === offerId.toString(),
//       );

//       if (!offer) {
//         throw {
//           status: 404,
//           message: `Offer with ID ${offerId} not found`,
//           data: null,
//         };
//       }

//       return {
//         success: true,
//         data: this.normalizeOffer(offer),
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       console.error("Everflow getOfferById error:", error);
//       throw error;
//     }
//   }

//   /**
//    * Get postback by ID (legacy method name - delegates to getOfferById)
//    * @param {string} postbackId - Postback/Offer ID
//    * @returns {Promise<Object>} Postback data
//    */
//   async getPostbackById(postbackId) {
//     return this.getOfferById(postbackId);
//   }

//   /**
//    * Get offers - Uses the correct Everflow endpoint
//    * Endpoint: GET /v1/affiliates/alloffers
//    * @param {Object} queryParams - Query parameters (can include userId for user-specific URLs)
//    * @returns {Promise<Object>} Offers data
//    */
//   async getOffers(queryParams = {}) {
//     if (!this.isConfigured()) {
//       return {
//         success: true,
//         data: [],
//         total: 0,
//         timestamp: new Date().toISOString(),
//       };
//     }

//     try {
//       const endpoint = "/v1/affiliates/alloffers";

//       // Extract userId if provided (for user-specific tracking)
//       const { userId, ...apiParams } = queryParams;

//       // If userId is provided, we'll add it to click URLs later
//       // Everflow uses sub_id1, sub_id2, etc. for user tracking in postbacks
//       const response = await this.client.get(endpoint, { params: apiParams });

//       // Everflow returns: { "offers": [...], "paging": {...} }
//       let offers = [];
//       if (response.data?.offers && Array.isArray(response.data.offers)) {
//         offers = response.data.offers;
//       } else if (Array.isArray(response.data)) {
//         offers = response.data;
//       }

//       // Normalize offers and add user-specific tracking if userId provided
//       const normalizedOffers = offers.map((offer) => {
//         const normalized = this.normalizeOffer(offer);

//         // If userId provided, add it to click URL for tracking
//         // Everflow uses sub_id1 parameter for user tracking in postbacks
//         if (queryParams.userId && normalized.clickUrl) {
//           try {
//             const url = new URL(normalized.clickUrl);
//             url.searchParams.set("sub_id1", queryParams.userId);
//             normalized.clickUrl = url.toString();
//             normalized.deepLink = url.toString();
//           } catch (e) {
//             // If URL parsing fails, append as query param
//             const separator = normalized.clickUrl.includes("?") ? "&" : "?";
//             normalized.clickUrl = `${normalized.clickUrl}${separator}sub_id1=${queryParams.userId}`;
//             normalized.deepLink = normalized.clickUrl;
//           }
//         }

//         return normalized;
//       });

//       return {
//         success: true,
//         data: normalizedOffers,
//         total: normalizedOffers.length,
//         paging: response.data?.paging || null,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       console.error("Everflow getOffers error:", error);
//       return {
//         success: false,
//         data: [],
//         total: 0,
//         error: error.message || "Failed to fetch Everflow offers",
//         timestamp: new Date().toISOString(),
//       };
//     }
//   }

//   /**
//    * Normalize Everflow offer to match our system format
//    * Everflow API returns: { network_offer_id, network_id, name, offer_status, network_category_id, ... }
//    * @param {Object} offer - Raw offer from Everflow API
//    * @returns {Object} Normalized offer
//    */
//   normalizeOffer(offer) {
//     return {
//       ...offer, // Preserve all original Everflow fields
//       // Map to our standardized fields
//       offerId:
//         offer.network_offer_id?.toString() ||
//         offer.offer_id?.toString() ||
//         offer.id?.toString() ||
//         "",
//       externalId:
//         offer.network_offer_id?.toString() ||
//         offer.offer_id?.toString() ||
//         offer.id?.toString() ||
//         "",
//       title: offer.name || offer.title || "Unknown Offer",
//       description:
//         offer.html_description || offer.description || offer.desc || "",
//       clickUrl:
//         offer.preview_url || offer.tracking_link || offer.click_url || "",
//       deepLink:
//         offer.preview_url || offer.tracking_link || offer.deep_link || "",
//       category:
//         offer.network_category_id?.toString() ||
//         offer.category ||
//         offer.category_name ||
//         "other",
//       offerType: this.determineOfferType(offer),
//       provider: "everflow",
//       sdkProvider: "everflow",
//       // Rewards - Everflow may have payout/revenue fields in separate endpoints
//       coinReward: offer.payout || offer.revenue || offer.reward_amount || 0,
//       estimatedTime: offer.estimated_time || offer.duration || offer.loi || 5,
//       // Status mapping
//       status:
//         offer.offer_status === "active" ? "live" : offer.offer_status || "live",
//       isAvailable: offer.offer_status === "active",
//       // Metadata
//       networkId:
//         offer.network_id?.toString() || offer.networkId?.toString() || "",
//       advertiserId:
//         offer.advertiser_id?.toString() || offer.advertiserId?.toString() || "",
//       // Additional Everflow-specific fields
//       currency: offer.currency_id || offer.currency || "USD",
//       thumbnailUrl: offer.thumbnail_url || "",
//       visibility: offer.visibility || "public",
//       // Requirements
//       requirements: {
//         minAge: offer.min_age || offer.minAge || 18,
//         countries: offer.countries || offer.target_countries || [],
//       },
//       // Timestamps
//       createdAt: offer.date_live_until || offer.created_at || offer.createdAt,
//       updatedAt: offer.updated_at || offer.updatedAt,
//     };
//   }

//   /**
//    * Determine offer type from Everflow offer data
//    * @param {Object} offer - Offer data
//    * @returns {string} Offer type
//    */
//   determineOfferType(offer) {
//     // Check explicit type field
//     if (offer.type) {
//       return offer.type.toLowerCase();
//     }

//     // Check category
//     const category = (
//       offer.category ||
//       offer.category_name ||
//       ""
//     ).toLowerCase();
//     if (category.includes("survey")) return "survey";
//     if (category.includes("shopping") || category.includes("retail"))
//       return "shopping";
//     if (category.includes("receipt") || category.includes("magic"))
//       return "magic_receipt";
//     if (category.includes("cashback")) return "cashback";
//     if (category.includes("game")) return "game";

//     // Check name/description
//     const name = (offer.name || offer.title || "").toLowerCase();
//     const desc = (offer.description || "").toLowerCase();

//     if (name.includes("survey") || desc.includes("survey")) return "survey";
//     if (name.includes("shop") || desc.includes("shop")) return "shopping";
//     if (name.includes("receipt") || desc.includes("receipt"))
//       return "magic_receipt";
//     if (name.includes("cashback") || desc.includes("cashback"))
//       return "cashback";

//     return "other";
//   }

//   /**
//    * Get conversions
//    * @param {Object} queryParams - Query parameters
//    * @returns {Promise<Object>} Conversions data
//    */
//   async getConversions(queryParams = {}) {
//     if (!this.isConfigured()) {
//       throw {
//         status: 500,
//         message: "Everflow API is not properly configured",
//         data: null,
//       };
//     }

//     try {
//       const endpoint = "/affiliate/conversions";
//       const response = await this.client.get(endpoint, { params: queryParams });

//       return {
//         success: true,
//         data: response.data,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error) {
//       console.error("Everflow getConversions error:", error);
//       throw error;
//     }
//   }

//   /**
//    * Health check for Everflow API
//    * @returns {Promise<Object>} Health status
//    */
//   async healthCheck() {
//     const configured = this.isConfigured();
//     if (!configured) {
//       return {
//         status: "misconfigured",
//         configured: false,
//         error: "Missing Everflow config (BASE_URL or API_KEY)",
//       };
//     }

//     try {
//       // Try to fetch postbacks with limit=1 as health check
//       const response = await this.getPostbacks({ limit: 1 });
//       return {
//         status: "ok",
//         configured: true,
//         data: {
//           reachable: true,
//           sampleCount: response.total || 0,
//         },
//       };
//     } catch (error) {
//       console.error("Everflow health check error:", error);
//       const status = error.status || error?.response?.status;
//       if (status === 401 || status === 403) {
//         return {
//           status: "unauthorized",
//           configured: true,
//           error: "Invalid or unauthorized Everflow API key",
//           httpStatus: status,
//         };
//       }
//       if (status >= 500) {
//         return {
//           status: "upstream_error",
//           configured: true,
//           error: "Everflow API server error",
//           httpStatus: status,
//         };
//       }
//       return {
//         status: "error",
//         configured: true,
//         error: error.message || "Health probe failed",
//       };
//     }
//   }
// }

// Export singleton instance
module.exports = new EverflowService();

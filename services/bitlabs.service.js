/**
 * Bitlabs API Service
 * Handles all API calls to Bitlabs platform for game offers
 * @module services/bitlabs
 */

const axios = require("axios");
const config = require("../config/config");

class BitlabsService {
  constructor() {
    // Bitlabs API base URL - should be https://api.bitlabs.ai (without /v1 or /v2)
    // The version will be added to the endpoint path (e.g., /v2/client/offers)
    this.baseURL = config.BITLABS_BASE_URL || "https://api.bitlabs.ai";
    // Remove /v1 or /v2 from baseURL if it's there, we'll add it to the endpoint
    if (this.baseURL.endsWith("/v1") || this.baseURL.endsWith("/v2")) {
      this.baseURL = this.baseURL.replace(/\/v[12]$/, "");
    }
    this.apiToken = config.BITLABS_API_TOKEN;
    this.secretKey = config.BITLABS_SECRET_KEY;
    this.serverToServerKey = config.BITLABS_SERVER_TO_SERVER_KEY;

    // Create axios instance with default config
    // Note: We'll set auth headers per request since Bitlabs may use different methods
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 seconds timeout
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          // Server responded with error status
          const errorData = {
            status: error.response.status,
            message: error.response.data?.message || error.message,
            data: error.response.data,
          };
          throw errorData;
        } else if (error.request) {
          // Request made but no response
          throw {
            status: 503,
            message: "Bitlabs API is not responding",
            data: null,
          };
        } else {
          // Error in request setup
          throw {
            status: 500,
            message: error.message,
            data: null,
          };
        }
      }
    );
  }

  /**
   * Validate service configuration
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.baseURL && this.apiToken);
  }

  /**
   * Get available offers inventory (static API)
   * Endpoint: GET https://api.bitlabs.ai/v2/client/offers
   * Required Headers:
   *   - X-Api-Token: API token
   *   - X-User-Id: User ID (can be a placeholder for static inventory)
   * @param {Object} queryParams - Query parameters (platform, country, category, etc.)
   * @param {string} userId - Optional user ID (if not provided, uses a default)
   * @returns {Promise<Object>} Offers data
   */
  async getOffers(queryParams = {}, userId = null) {
    if (!this.isConfigured()) {
      // Return empty result instead of throwing error
      console.warn(
        "Bitlabs API is not properly configured. Returning empty offers."
      );
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Bitlabs API endpoint: GET https://api.bitlabs.ai/v2/client/offers
      // Required headers: X-Api-Token and X-User-Id
      const endpoint = "/v2/client/offers";
      const fullURL = `${this.baseURL}${endpoint}`;

      // Use provided userId or a default placeholder for static inventory
      const userIdentifier = userId || queryParams.userId || "static-inventory";
      
      // Detect if this is an admin request (no real userId provided)
      const isAdminRequest = !userId && !queryParams.userId;

      // Remove userId from queryParams if present (it goes in header, not query)
      // Also normalize parameter names to match Bitlabs API
      const {
        userId: _,
        platform,
        country,
        type,
        category,
        sdk,
        ...restParams
      } = queryParams;

      // Convert platform to devices array (Bitlabs uses 'devices' not 'platform')
      const normalizedParams = { ...restParams };

      // Add SDK parameter (recommended by BitLabs, replaces deprecated platform/os)
      // Valid values: CUSTOM, IFRAME, TAB, NATIVE, UNITY, REACT, FLUTTER
      if (sdk) {
        normalizedParams.sdk = sdk;
      } else {
        // Default to CUSTOM for backend API integration
        normalizedParams.sdk = "CUSTOM";
      }

      // Add country parameter if provided (CRITICAL: offers are often country-specific)
      if (country) {
        normalizedParams.country = country;
      }

      if (platform) {
        // Convert platform to devices array
        if (platform === "ios" || platform === "iphone") {
          normalizedParams.devices = ["iphone"];
        } else if (platform === "ipad") {
          normalizedParams.devices = ["ipad"];
        } else if (platform === "android") {
          normalizedParams.devices = ["android"];
        } else if (platform === "mobile") {
          normalizedParams.devices = ["iphone", "android"];
        }
      }

      // Convert type/category to is_game if needed
      if (type === "game" || category === "gaming") {
        normalizedParams.is_game = true;
      }

      // CRITICAL: Convert is_game from string "true"/"false" to boolean if present
      if (queryParams.is_game !== undefined) {
        if (queryParams.is_game === "true" || queryParams.is_game === true) {
          normalizedParams.is_game = true;
        } else if (queryParams.is_game === "false" || queryParams.is_game === false) {
          normalizedParams.is_game = false;
        }
        // If it's already a boolean, keep it as is
      }

      // CRITICAL: Explicitly pass client_ip to avoid VPN detection
      // Similar to Besitos user_ip, we pass the whitelisted IP explicitly
      // If BITLABS_WHITELISTED_IP is set in config, use it; otherwise use 127.0.0.1
      const whitelistedIp = config.BITLABS_WHITELISTED_IP || "127.0.0.1";
      normalizedParams.client_ip = whitelistedIp;

      // Note: Bitlabs API accepts these query parameters:
      // - devices: array of strings ('iphone', 'ipad', 'android')
      // - is_game: boolean | null (true = only games, false = only non-games, null = all)
      // - in_app: boolean | null (App Store/Play Store guidelines)
      // - client_user_agent: string
      // - client_ip: string
      // - tags: string (key-value pairs)

      // Bitlabs requires these headers:
      // - X-Api-Token: Your API token
      // - X-User-Id: User identifier (can be placeholder for static inventory)
      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      // Make the request with required headers
      // Bitlabs API query parameters:
      // - devices: array (e.g., ['android', 'iphone']) - axios will serialize as devices[]=android&devices[]=iphone
      // - is_game: boolean (true for games only, false for non-games, null/undefined for all)
      // - in_app: boolean (App Store/Play Store guidelines)
      // - client_user_agent: string
      // - client_ip: string
      // - tags: string (key=value&key2=value2)

      // Configure axios params serializer for arrays
      const paramsSerializer = {
        indexes: null, // Serialize arrays as devices[]=android&devices[]=iphone
      };

      // Log request details for debugging
      // console.log("\n🔵 [BITLABS SERVICE] ========== GET OFFERS REQUEST ==========");
      // // console.log("🔵 Endpoint:", endpoint);
      // // console.log("🔵 Full URL:", fullURL);
      // // console.log("🔵 Headers:", {
      //   "X-Api-Token": this.apiToken ? "***SET***" : "MISSING",
      //   "X-User-Id": userIdentifier,
      // });
      // // console.log("🔵 Query Params:", JSON.stringify(normalizedParams, null, 2));
      // // console.log("🔵 is_game value:", normalizedParams.is_game, "type:", typeof normalizedParams.is_game);
      // // console.log("🔵 ==================================================\n");

      const response = await this.client.get(endpoint, {
        headers: headers,
        params: normalizedParams,
        paramsSerializer: paramsSerializer,
      });

      // Log raw response structure
      // console.log("\n🔵 [BITLABS SERVICE] ========== RAW API RESPONSE ==========");
      // // console.log("🔵 Response Status:", response.status);
      // // console.log("🔵 Response Data Type:", typeof response.data);
      // // console.log("🔵 Response Data Keys:", response.data ? Object.keys(response.data) : "NO DATA");
      // if (response.data) {
      //   // console.log("🔵 Response Data Structure:", JSON.stringify(response.data, null, 2).substring(0, 2000));
      // }
      // // console.log("🔵 ==================================================\n");

      // Log raw Bitlabs API response for shopping and magic receipts
      // Extract raw offers first to check their types
      let tempRawOffers = [];
      if (Array.isArray(response.data)) {
        tempRawOffers = response.data;
      } else if (
        response.data?.data?.offers &&
        Array.isArray(response.data.data.offers)
      ) {
        tempRawOffers = response.data.data.offers;
      } else if (response.data?.offers && Array.isArray(response.data.offers)) {
        tempRawOffers = response.data.offers;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        tempRawOffers = response.data.data;
      }

      // Filter for shopping and magic receipts from raw response
      if (tempRawOffers.length > 0 && normalizedParams.is_game === false) {
        // Use same detection logic as getOfferType function
        const shoppingOffers = tempRawOffers.filter((offer) => {
          const anchor = (
            offer.anchor ||
            offer.product_name ||
            offer.name ||
            ""
          ).toLowerCase();
          const description = (offer.description || "").toLowerCase();
          const category = offer.category || offer.categories?.[0] || "";
          const categoryStr =
            typeof category === "object"
              ? (category.name || category.name_internal || "").toLowerCase()
              : (category || "").toLowerCase();

          return (
            anchor.includes("shop") ||
            anchor.includes("store") ||
            anchor.includes("retail") ||
            description.includes("shopping") ||
            description.includes("purchase") ||
            categoryStr.includes("shopping") ||
            categoryStr.includes("retail")
          );
        });

        const magicReceiptOffers = tempRawOffers.filter((offer) => {
          const anchor = (
            offer.anchor ||
            offer.product_name ||
            offer.name ||
            ""
          ).toLowerCase();
          const description = (offer.description || "").toLowerCase();
          const category = offer.category || offer.categories?.[0] || "";
          const categoryStr =
            typeof category === "object"
              ? (category.name || category.name_internal || "").toLowerCase()
              : (category || "").toLowerCase();

          return (
            anchor.includes("magic receipt") ||
            anchor.includes("receipt") ||
            description.includes("receipt") ||
            description.includes("upload receipt") ||
            categoryStr.includes("receipt") ||
            categoryStr.includes("magic receipt")
          );
        });
      }

      // Check for restriction_reason (CRITICAL: tells us why offers might be empty)
      const restrictionReason =
        response.data?.data?.restriction_reason ||
        response.data?.restriction_reason ||
        null;

      if (restrictionReason) {
        if (restrictionReason.not_verified) {
          console.error(`❌ Publisher account is NOT VERIFIED`);
        }
        if (restrictionReason.using_vpn) {
          console.error(`❌ User is using VPN`);
        }
        if (restrictionReason.unsupported_country) {
          console.error(`❌ User's country is NOT SUPPORTED`);
          console.error(
            `   This is likely why you're getting empty results from India!`
          );
        }
        if (restrictionReason.banned) {
          console.error(`❌ User is PERMANENTLY BANNED`);
        }
        if (restrictionReason.review) {
          console.error(`❌ User is UNDER REVIEW`);
        }
        if (restrictionReason.on_hold) {
          console.error(`❌ User's account is ON HOLD`);
        }
      }

      // Normalize response to match expected format
      // Bitlabs API response structure: { data: { offers: [], offerwall_code: "...", started_offers: [] }, status: "success" }
      let rawOffers = [];
      let startedOffers = [];

      // console.log("\n🔵 [BITLABS SERVICE] ========== PARSING RESPONSE ==========");
      // // console.log("🔵 Checking response.data structure...");

      // Check if response.data is directly an array
      if (Array.isArray(response.data)) {
        rawOffers = response.data;
        // console.log("🔵 ✅ Found offers as direct array:", rawOffers.length);
      }
      // Check nested data structure (Bitlabs format: response.data.data.offers)
      else if (response.data?.data) {
        // Get available offers
        if (response.data.data.offers && Array.isArray(response.data.data.offers)) {
          rawOffers = response.data.data.offers;
          // console.log("🔵 ✅ Found offers in response.data.data.offers:", rawOffers.length);
        }
        // Check other nested structures
        else if (Array.isArray(response.data.data)) {
          rawOffers = response.data.data;
          // console.log("🔵 ✅ Found offers in response.data.data:", rawOffers.length);
        }
      }
      // Check if offers are directly in response.data.offers (MOST COMMON)
      else if (response.data?.offers && Array.isArray(response.data.offers)) {
        rawOffers = response.data.offers;
        // console.log("🔵 ✅ Found offers in response.data.offers:", rawOffers.length);
      }
      // Check other common structures
      else if (response.data?.items && Array.isArray(response.data.items)) {
        rawOffers = response.data.items;
        // console.log("🔵 ✅ Found offers in response.data.items:", rawOffers.length);
      } else if (
        response.data?.results &&
        Array.isArray(response.data.results)
      ) {
        rawOffers = response.data.results;
        // console.log("🔵 ✅ Found offers in response.data.results:", rawOffers.length);
      } else if (response.data?.list && Array.isArray(response.data.list)) {
        rawOffers = response.data.list;
        // console.log("🔵 ✅ Found offers in response.data.list:", rawOffers.length);
      } else {
        // console.log("🔵 ❌ No offers array found in response!");
        // console.log("🔵 Response.data type:", typeof response.data);
        // console.log("🔵 Response.data keys:", response.data ? Object.keys(response.data) : "NO DATA");
        if (response.data && typeof response.data === 'object') {
          // console.log("🔵 Full response.data:", JSON.stringify(response.data, null, 2).substring(0, 1000));
        }
      }

      // CRITICAL: Only include started_offers for admin requests (when no real userId)
      // For user-facing endpoints, started_offers are games the user already has, so we shouldn't include them
      // For admin endpoints, we want to show ALL games (both available and started) for inventory purposes
      if (isAdminRequest) {
        if (response.data?.data?.started_offers && Array.isArray(response.data.data.started_offers)) {
          startedOffers = response.data.data.started_offers;
          // console.log("🔵 ✅ [ADMIN] Found started_offers in response.data.data.started_offers:", startedOffers.length);
        } else if (response.data?.started_offers && Array.isArray(response.data.started_offers)) {
          startedOffers = response.data.started_offers;
          // console.log("🔵 ✅ [ADMIN] Found started_offers in response.data.started_offers:", startedOffers.length);
        }

        // CRITICAL: Combine available offers and started offers for admin endpoints only
        if (startedOffers.length > 0) {
          // console.log("🔵 [ADMIN] Combining available offers with started offers...");
          // Mark started offers and ensure they're recognized as games if they have game categories
          const markedStartedOffers = startedOffers.map(offer => {
            // Check if this is a game based on categories or app_metadata
            const isGame = 
              offer.is_game === true || 
              offer.is_game === "true" ||
              offer.type === "game" ||
              (offer.app_metadata?.categories && 
               offer.app_metadata.categories.some(cat => 
                 typeof cat === 'string' && cat.toUpperCase().includes('GAME')
               ));
            
            return {
              ...offer,
              isStarted: true, // Mark as started for reference
              is_game: isGame ? true : (offer.is_game !== undefined ? offer.is_game : true), // Ensure is_game is set for games
            };
          });
          rawOffers = [...rawOffers, ...markedStartedOffers];
          // console.log("🔵 ✅ [ADMIN] Total offers after combining:", rawOffers.length);
          // console.log("🔵 [ADMIN] Games in combined offers:", markedStartedOffers.filter(o => o.is_game === true).length);
        }
      } else {
        // For user-facing endpoints, log that we're NOT including started_offers
        if (response.data?.data?.started_offers && response.data.data.started_offers.length > 0) {
          // console.log("🔵 ℹ️ [USER] Found started_offers but NOT including them (user already has these games)");
        }
      }

      // console.log("🔵 ==================================================\n");

      // Helper function to determine offer type (only used if type not present)
      function getOfferType(offer) {
        if (offer.type) return offer.type;
        if (offer.is_game) return "game";
        // Check category or other indicators
        if (
          offer.category?.name_internal === "Shopping" ||
          offer.category?.name === "Shopping"
        )
          return "shopping";
        if (
          offer.category?.name_internal === "Magic Receipt" ||
          offer.category?.name === "Magic Receipt"
        )
          return "magic_receipt";
        return "other";
      }

      // Log raw Bitlabs API response structure for SHOPPING and MAGIC RECEIPTS
      if (rawOffers.length > 0 && normalizedParams.is_game === false) {
        // Filter for shopping offers
        const shoppingOffers = rawOffers.filter((offer) => {
          const anchor = (
            offer.anchor ||
            offer.product_name ||
            offer.name ||
            ""
          ).toLowerCase();
          const description = (offer.description || "").toLowerCase();
          const category = offer.category || offer.categories?.[0] || "";
          const categoryStr =
            typeof category === "object"
              ? (category.name || category.name_internal || "").toLowerCase()
              : (category || "").toLowerCase();

          return (
            anchor.includes("shop") ||
            anchor.includes("store") ||
            anchor.includes("retail") ||
            description.includes("shopping") ||
            description.includes("purchase") ||
            categoryStr.includes("shopping") ||
            categoryStr.includes("retail")
          );
        });

        // Filter for magic receipt offers
        const magicReceiptOffers = rawOffers.filter((offer) => {
          const anchor = (
            offer.anchor ||
            offer.product_name ||
            offer.name ||
            ""
          ).toLowerCase();
          const description = (offer.description || "").toLowerCase();
          const category = offer.category || offer.categories?.[0] || "";
          const categoryStr =
            typeof category === "object"
              ? (category.name || category.name_internal || "").toLowerCase()
              : (category || "").toLowerCase();

          return (
            anchor.includes("magic receipt") ||
            anchor.includes("receipt") ||
            description.includes("receipt") ||
            description.includes("upload receipt") ||
            categoryStr.includes("receipt") ||
            categoryStr.includes("magic receipt")
          );
        });



        // Log MAGIC RECEIPTS structure - show actual values inside objects and arrays
        if (magicReceiptOffers.length > 0) {
          // console.log(
          //   `\n========== MAGIC RECEIPTS - RAW BITLABS API RESPONSE ==========`
          // );
          // console.log(
          //   `Total Magic Receipt Offers: ${magicReceiptOffers.length}`
          // );
          // console.log(
          //   `First Magic Receipt Offer (from Bitlabs API - with full object/array values):`
          // );
          // const firstMagicReceipt = magicReceiptOffers[0];
          // // Show the complete object with actual values in objects and arrays
          // console.log(JSON.stringify(firstMagicReceipt, null, 2));
          // console.log(
          //   `========================================================\n`
          // );
        }
      }

      // Helper function to detect if an offer is a game
      const isGameOffer = (offer) => {
        // Check explicit is_game field
        if (offer.is_game === true || offer.is_game === "true") return true;
        if (offer.type === "game") return true;
        
        // Check app_metadata categories (e.g., "GAME_CASINO", "GAME_CASUAL")
        if (offer.app_metadata?.categories && Array.isArray(offer.app_metadata.categories)) {
          const hasGameCategory = offer.app_metadata.categories.some(cat => {
            const catStr = typeof cat === 'string' ? cat.toUpperCase() : '';
            return catStr.includes('GAME') || catStr === 'GAMING';
          });
          if (hasGameCategory) return true;
        }
        
        // Check category field
        if (offer.category) {
          const catName = typeof offer.category === 'string' 
            ? offer.category 
            : offer.category.name || offer.category.name_internal || '';
          if (catName.toUpperCase().includes('GAME') || catName.toUpperCase() === 'GAMING') {
            return true;
          }
        }
        
        return false;
      };

      // Filter offers by is_game if is_game parameter was set
      let filteredOffers = rawOffers;
      if (normalizedParams.is_game === true) {
        // Filter for games only
        filteredOffers = rawOffers.filter((offer) => {
          return isGameOffer(offer);
        });

      } else if (normalizedParams.is_game === false) {
        // Filter for non-games only
        filteredOffers = rawOffers.filter((offer) => {
          return !isGameOffer(offer);
        });

      }

      // Return raw Bitlabs offers format - preserve original structure
      // Only add minimal metadata fields (type, provider) for categorization
      const offersWithMetadata = filteredOffers.map((offer) => {
        // Preserve all original Bitlabs fields and structure
        // Only add minimal fields needed for our system
        return {
          ...offer, // Preserve all original Bitlabs fields
          // Add minimal metadata for categorization (don't override existing fields)
          type: offer.type || (offer.is_game ? "game" : getOfferType(offer)),
          provider: offer.provider || "bitlabs",
          sdkProvider: offer.sdkProvider || "bitlabs",
          // Ensure these fields exist (use original if present, otherwise add camelCase versions)
          offerId:
            offer.offerId || offer.id?.toString() || offer.offer_id?.toString(),
          // Preserve original field names but also add camelCase aliases for compatibility
          clickUrl: offer.clickUrl || offer.click_url || "",
          deepLink: offer.deepLink || offer.deep_link || offer.click_url || "",
          supportUrl: offer.supportUrl || offer.support_url || "",
          estimatedTime:
            offer.estimatedTime || offer.estimated_time || offer.duration || 0,
          confirmationTime:
            offer.confirmationTime || offer.confirmation_time || "",
          pendingTime: offer.pendingTime || offer.pending_time || 0,
          offerExpiresAt:
            offer.offerExpiresAt || offer.offer_expires_at || null,
          sessionHours: offer.sessionHours || offer.session_hours || 0,
          isSticky:
            offer.isSticky !== undefined
              ? offer.isSticky
              : offer.is_sticky || false,
          isAvailable:
            offer.isAvailable !== undefined
              ? offer.isAvailable
              : offer.is_available !== false,
          mobileVerificationRequired:
            offer.mobileVerificationRequired !== undefined
              ? offer.mobileVerificationRequired
              : offer.mobile_verification_required || false,
          webToMobile:
            offer.webToMobile !== undefined
              ? offer.webToMobile
              : offer.web_to_mobile || false,
          webToMobileDevices:
            offer.webToMobileDevices || offer.web_to_mobile_devices || [],
          thingsToKnow: offer.thingsToKnow || offer.things_to_know || [],
        };
      });

      if (offersWithMetadata.length === 0) {
        console.warn(`⚠️ No offers found in Bitlabs API response.`);
        console.warn(`Request params:`, JSON.stringify(normalizedParams, null, 2));
        console.warn(`Request headers:`, {
          "X-Api-Token": this.apiToken ? "***SET***" : "MISSING",
          "X-User-Id": userIdentifier,
        });
        // console.warn(
        //   `Response structure:`,
        //   JSON.stringify(response.data, null, 2)
        // );
        
        // Log restriction reason if present
        if (restrictionReason) {
          console.error(`❌ Bitlabs API restriction reason:`, restrictionReason);
        }
      } else {

      }

      return {
        success: true,
        data: offersWithMetadata,
        total: offersWithMetadata.length,
        timestamp: new Date().toISOString(),
        offerwallCode:
          response.data?.data?.offerwall_code || response.data?.offerwall_code,
        restrictionReason: restrictionReason || null, // Include restriction reason in response
      };
    } catch (error) {
      const errorDetails = {
        status: error.status || error.response?.status,
        message: error.message,
        url: error.config?.url,
        baseURL: this.baseURL,
        fullURL: `${this.baseURL}/v2/client/offers`,
        responseData: error.response?.data,
        requestConfig: {
          method: error.config?.method,
          url: error.config?.url,
          params: error.config?.params,
          headers: error.config?.headers
            ? Object.keys(error.config.headers)
            : [],
        },
      };

      console.error(
        "Bitlabs getOffers error:",
        JSON.stringify(errorDetails, null, 2)
      );

      // If we have response data, include it in the error
      if (error.response?.data) {
        error.details = error.response.data;
      }

      throw error;
    }
  }

  /**
   * Get offers by devices
   * @param {string|string[]} devices - Device types: 'iphone', 'ipad', 'android'
   * @param {Object} queryParams - Additional query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Offers data
   */
  async getOffersByDevices(devices, queryParams = {}, userId = null) {
    const devicesArray = Array.isArray(devices) ? devices : [devices];
    return this.getOffers(
      {
        ...queryParams,
        devices: devicesArray,
      },
      userId
    );
  }

  /**
   * Get game offers specifically
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Game offers data
   */
  async getGameOffers(queryParams = {}, userId = null) {
    return this.getOffers(
      {
        ...queryParams,
        is_game: true, // Bitlabs uses is_game parameter
      },
      userId
    );
  }

  /**
   * Get a single offer by ID for deep-link resolution. Looks in both `offers` and `started_offers`
   * from the Bitlabs API so we can resolve a link even when the user has 0 in "offers".
   * @param {string} offerId - Bitlabs offer ID (e.g. "1672629")
   * @param {string} userId - User ID for X-User-Id (use "static-inventory" for catalog)
   * @param {Object} queryParams - Optional query params (country, devices, etc.)
   * @returns {Promise<Object|null>} The offer object (with continue_url, click_url, etc.) or null
   */
  async getOfferByIdForDeepLink(offerId, userId, queryParams = {}) {
    if (!this.isConfigured() || !offerId) return null;
    const idStr = offerId.toString();
    try {
      const endpoint = "/v2/client/offers";
      const userIdentifier = userId || "static-inventory";
      const params = {
        sdk: "CUSTOM",
        is_game: true,
        country: queryParams.country || "US",
        devices: queryParams.devices || ["android", "iphone"],
        client_ip: config.BITLABS_WHITELISTED_IP || "127.0.0.1",
        ...queryParams,
      };
      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        "X-S2S-Token": this.serverToServerKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      const response = await this.client.get(endpoint, {
        headers,
        params,
        paramsSerializer: { indexes: null },
      });
      const data = response.data?.data || response.data;
      const offers = Array.isArray(data?.offers) ? data.offers : [];
      const started = Array.isArray(data?.started_offers) ? data.started_offers : [];
      const all = [...offers, ...started];
      const offer = all.find(
        (o) =>
          (o.id && o.id.toString() === idStr) ||
          (o.offerId && o.offerId.toString() === idStr)
      );
      return offer || null;
    } catch (err) {
      console.warn("Bitlabs getOfferByIdForDeepLink error:", err.message);
      return null;
    }
  }

  /**
   * Get non-game offers
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Non-game offers data
   */
  async getNonGameOffers(queryParams = {}, userId = null) {
    return this.getOffers(
      {
        ...queryParams,
        is_game: false,
      },
      userId
    );
  }

  /**
   * Get surveys
   * Endpoint: GET https://api.bitlabs.ai/v2/client/surveys
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Surveys data
   */
  async getSurveys(queryParams = {}, userId = null) {
    if (!this.isConfigured()) {
      // Return empty result instead of throwing error
      console.warn(
        "Bitlabs API is not properly configured. Returning empty surveys."
      );
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Use client surveys endpoint - returns actual surveys, not gaming offers
      // Official docs: https://developer.bitlabs.ai/reference/getsurveysv2
      const endpoint = "/v2/client/surveys";
      const fullURL = `${this.baseURL}${endpoint}`;
      // console.log("🔵 [BITLABS SURVEYS] Endpoint:", endpoint);
      // console.log("🔵 [BITLABS SURVEYS] Full URL:", fullURL);
      // console.log("🔵 [BITLABS SURVEYS] User ID:", userIdentifier);
      // console.log("🔵 [BITLABS SURVEYS] Is Admin Request:", isAdminRequest);

      // Normalize parameters
      const { userId: _, platform, sdk, country, countries, devices, ...restParams } = queryParams;
      const normalizedParams = { ...restParams };

      // Detect if this is an admin request (no real userId provided)
      const isAdminRequest = !userId && !queryParams.userId;

      // Define user identifier for API headers
      const userIdentifier = userId || queryParams.userId || "static-inventory";

      // Add SDK parameter (recommended by BitLabs, replaces deprecated platform/os)
      // Valid values: CUSTOM, IFRAME, TAB, NATIVE, UNITY, REACT, FLUTTER
      if (sdk) {
        normalizedParams.sdk = sdk;
      } else {
        // Default to CUSTOM for backend API integration
        normalizedParams.sdk = "CUSTOM";
      }

      // Note: /v2/client/surveys does NOT support 'countries' or 'devices' parameters
      // Those parameters are only for /v2/publishers/offers endpoint
      // Country filtering is handled per-user based on their profile in BitLabs

      // CRITICAL: client_xx parameters for backend survey API calls
      // Bitlabs has enabled "Allow Backend Survey API Calls" which requires client_xx parameters
      // These parameters are required for backend servers to call the survey API
      if (isAdminRequest || !userId) {
        // For backend/admin calls, include client_ip and client_useragent
        // Use configured IP or default to 127.0.0.1 for backend calls
        normalizedParams.client_ip = config.BITLABS_WHITELISTED_IP || "127.0.0.1";
        // Add a default user agent for backend calls if not provided
        if (!normalizedParams.client_useragent) {
          normalizedParams.client_useragent = "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36";
        }
      } else if (queryParams.client_ip) {
        // For user-facing calls, use provided client_ip if available
        normalizedParams.client_ip = queryParams.client_ip;
      }
      if (queryParams.client_useragent) {
        normalizedParams.client_useragent = queryParams.client_useragent;
      }

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
      };

      // Note: /v2/client/surveys uses standard query params (not comma-separated like publisher API)
      // console.log("🔵 [BITLABS SURVEYS] Query Params:", JSON.stringify(normalizedParams, null, 2));
      // console.log("🔵 [BITLABS SURVEYS] Headers:", {
      //   "X-Api-Token": this.apiToken ? "***SET***" : "MISSING",
      //   "X-User-Id": userIdentifier,
      // });
      // console.log("🔵 [BITLABS SURVEYS] ==================================================\n");

      let response;
      try {
        response = await this.client.get(endpoint, {
          headers: headers,
          params: normalizedParams,
        });

        // Log raw response from Bitlabs

      } catch (error) {
        // 🔴 ENHANCED ERROR LOGGING: Log full error details for debugging
        const errorStatus = error.response?.status || error.status;
        const errorData = error.response?.data || error.data;
        
        console.error(
          "\n🔴 [BITLABS SURVEYS] ========== SURVEY API ERROR =========="
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Error Status:",
          errorStatus
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Error Message:",
          error.message
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Error Response Data:",
          JSON.stringify(errorData, null, 2)
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Error Details:",
          errorData?.error || error.error
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Trace ID:",
          errorData?.trace_id
        );
        console.error("🔴 [BITLABS SURVEYS] ❌ Request URL:", `${this.baseURL}${endpoint}`);
        console.error("🔴 [BITLABS SURVEYS] ❌ Request Headers:", headers);
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Request Params:",
          JSON.stringify(normalizedParams, null, 2)
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Environment:",
          process.env.NODE_ENV || "unknown"
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ Base URL:",
          this.baseURL
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ❌ API Token Configured:",
          !!this.apiToken
        );
        console.error(
          "🔴 [BITLABS SURVEYS] ==================================================\n"
        );
        
        // For 403 errors, return empty result instead of throwing
        // This allows the endpoint to return success with empty data
        if (errorStatus === 403) {
          console.warn(
            "⚠️ [BITLABS SURVEYS] 403 Forbidden - Returning empty surveys. This might be due to:"
          );
          console.warn(
            "   1. IP blocking by Bitlabs"
          );
          console.warn(
            "   2. Missing API token permissions"
          );
          console.warn(
            "   3. Account restrictions"
          );
          return {
            success: true,
            data: [],
            total: 0,
            timestamp: new Date().toISOString(),
            error: errorData?.error?.details?.msg || "403 Forbidden",
          };
        }
        
        throw error; // Re-throw other errors to be handled by outer catch
      }

      // Normalize response - Bitlabs surveys API structure
      // Official response: { data: { surveys: [...] }, status: "success", trace_id: "..." }
      let rawSurveys = [];

      if (Array.isArray(response.data)) {
        rawSurveys = response.data;
      } else if (
        response.data?.data?.surveys &&
        Array.isArray(response.data.data.surveys)
      ) {
        // BitLabs surveys API: { data: { surveys: [...] }, status: "success" }
        rawSurveys = response.data.data.surveys;
      } else if (
        response.data?.surveys &&
        Array.isArray(response.data.surveys)
      ) {
        // Alternative structure: { surveys: [...] }
        rawSurveys = response.data.surveys;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        rawSurveys = response.data.data;
      } else if (response.data?.items && Array.isArray(response.data.items)) {
        rawSurveys = response.data.items;
      } else {
        console.warn(`⚠️ No matching response structure found for surveys`);
        console.warn(`Response structure analysis:`, {
          isArray: Array.isArray(response.data),
          keys: response.data ? Object.keys(response.data) : [],
          hasData: !!response.data?.data,
          hasSurveys: !!response.data?.surveys,
          fullResponse: JSON.stringify(response.data, null, 2).substring(
            0,
            1000
          ),
        });
      }


      // Check for restriction_reason (CRITICAL: tells us why surveys might be empty)
      // For /v2/client/surveys, restriction_reason is at the top level or inside data
      const restrictionReason =
        response.data?.restriction_reason ||
        response.data?.data?.restriction_reason ||
        null;

      if (restrictionReason) {
        if (restrictionReason.not_verified) {
          console.error(`❌ Publisher account is NOT VERIFIED`);
        }
        if (restrictionReason.using_vpn) {
          console.error(`❌ User is using VPN`);
        }
        if (restrictionReason.unsupported_country) {
          console.error(`❌ User's country is NOT SUPPORTED`);
          console.error(
            `   This is likely why you're getting empty results from India!`
          );
        }
        if (restrictionReason.banned) {
          console.error(`❌ User is PERMANENTLY BANNED`);
        }
        if (restrictionReason.review) {
          console.error(`❌ User is UNDER REVIEW`);
        }
        if (restrictionReason.on_hold) {
          console.error(`❌ User's account is ON HOLD`);
        }
      }

      // Return raw Bitlabs surveys format - preserve original structure
      // Only add minimal metadata fields (type, provider) for categorization
      const surveysWithMetadata = rawSurveys.map((survey, index) => {


        // Preserve all original Bitlabs fields and structure
        // Only add minimal fields needed for our system
        return {
          ...survey, // Preserve all original Bitlabs fields
          // Add minimal metadata for categorization (don't override existing fields)
          type: survey.type || "survey",
          provider: survey.provider || "bitlabs",
          sdkProvider: survey.sdkProvider || "bitlabs",
          // Ensure these fields exist (use original if present, otherwise add camelCase versions)
          offerId:
            survey.offerId ||
            survey.id?.toString() ||
            survey.survey_id?.toString(),
          surveyId:
            survey.surveyId ||
            survey.id?.toString() ||
            survey.survey_id?.toString(),
          // Preserve original field names but also add camelCase aliases for compatibility
          clickUrl: survey.clickUrl || survey.click_url || "",
          surveyUrl:
            survey.surveyUrl || survey.survey_url || survey.click_url || "",
          deepLink: survey.deepLink || survey.deep_link || "",
          supportUrl: survey.supportUrl || survey.support_url || "",
          estimatedTime:
            survey.estimatedTime ||
            survey.estimated_time ||
            survey.loi_minutes ||
            survey.duration ||
            0,
          confirmationTime:
            survey.confirmationTime || survey.confirmation_time || "",
          pendingTime: survey.pendingTime || survey.pending_time || 0,
          offerExpiresAt:
            survey.offerExpiresAt || survey.offer_expires_at || null,
          sessionHours: survey.sessionHours || survey.session_hours || 0,
          isSticky:
            survey.isSticky !== undefined
              ? survey.isSticky
              : survey.is_sticky || false,
          isAvailable:
            survey.isAvailable !== undefined
              ? survey.isAvailable
              : survey.is_available !== false,
          mobileVerificationRequired:
            survey.mobileVerificationRequired !== undefined
              ? survey.mobileVerificationRequired
              : survey.mobile_verification_required || false,
          webToMobile:
            survey.webToMobile !== undefined
              ? survey.webToMobile
              : survey.web_to_mobile || false,
          webToMobileDevices:
            survey.webToMobileDevices || survey.web_to_mobile_devices || [],
          thingsToKnow: survey.thingsToKnow || survey.things_to_know || [],
        };
      });



      // Return response with restriction reason if present
      return {
        success: true,
        data: surveysWithMetadata,
        total: surveysWithMetadata.length,
        timestamp: new Date().toISOString(),
        restrictionReason: restrictionReason || null, // Include restriction reason in response
      };
    } catch (error) {
      // 🔴 ENHANCED ERROR LOGGING: Log full error details
      console.error(
        "\n🔴 [BITLABS API SERVICE] ========== getSurveys() ERROR =========="
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Error Type:",
        error.constructor.name
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Error Message:",
        error.message
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Error Status:",
        error.response?.status || error.status || "N/A"
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Error Status Text:",
        error.response?.statusText || "N/A"
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Full Error Response:",
        JSON.stringify(error.response?.data || error.data || {}, null, 2)
      );
      if (error.response?.data?.error) {
        console.error(
          "🔴 [BITLABS API SERVICE] ❌ Error Details Object:",
          JSON.stringify(error.response.data.error, null, 2)
        );
        if (error.response.data.error.details) {
          console.error(
            "🔴 [BITLABS API SERVICE] ❌ Error Details Array:",
            JSON.stringify(error.response.data.error.details, null, 2)
          );
        }
      }
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Trace ID:",
        error.response?.data?.trace_id || error.data?.trace_id || "N/A"
      );
      console.error(
        "🔴 [BITLABS API SERVICE] ❌ Request URL:",
        `${this.baseURL}${endpoint}`
      );
      console.error(
        "🔴 [BITLABS SURVEYS] ❌ User ID Used:",
        userId || queryParams.userId || "static-inventory"
      );
      console.error(
        "🔴 [BITLABS SURVEYS] ❌ Environment:",
        process.env.NODE_ENV || "unknown"
      );
      console.error(
        "🔴 [BITLABS SURVEYS] ❌ API Token Configured:",
        !!this.apiToken
      );
      console.error(
        "🔴 [BITLABS SURVEYS] ❌ Base URL:",
        this.baseURL
      );
      console.error(
        "🔴 [BITLABS SURVEYS] ==================================================\n"
      );
      
      // Return empty result instead of throwing error
      // This allows the endpoint to return success with empty data
      // This is critical for live server - don't crash the API
      const errorData = error.response?.data || error.data;
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
        error: errorData?.error?.details?.msg || error.message || "Unknown error",
      };
    }
  }

  /**
   * Get cashback offers
   * Endpoint: GET https://api.bitlabs.ai/v1/client/cashback/offers
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Cashback offers data
   */
  async getCashbackOffers(queryParams = {}, userId = null) {
    if (!this.isConfigured()) {
      // Return empty result instead of throwing error
      console.warn(
        "Bitlabs API is not properly configured. Returning empty cashback offers."
      );
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // Define variables outside try block so they're accessible in catch
    const endpoint = "/v1/client/cashback/offers";
    const fullURL = `${this.baseURL}${endpoint}`;
    const userIdentifier = userId || queryParams.userId || "static-inventory";

    // Normalize parameters (outside try so accessible in catch)
    const { userId: _, platform, country, ...restParams } = queryParams;
    let normalizedParams = { ...restParams };

    // Add country parameter if provided (CRITICAL: offers are often country-specific)
    // If you're testing from India but offers are targeted to US, you'll get empty results
    if (country) {
      normalizedParams.country = country;
    }

    // Convert platform to devices array
    // Note: Cashback endpoint (/v1) might not support 'devices' parameter
    // Only add devices if platform is explicitly provided
    if (platform) {
      if (platform === "ios" || platform === "iphone") {
        normalizedParams.devices = ["iphone"];
      } else if (platform === "ipad") {
        normalizedParams.devices = ["ipad"];
      } else if (platform === "android") {
        normalizedParams.devices = ["android"];
      } else if (platform === "mobile") {
        normalizedParams.devices = ["iphone", "android"];
      }
    }
    // Don't add default devices for cashback - let BitLabs return all available offers
    // If offers are still empty, they might be filtered by country, user demographics, etc.

    // CRITICAL: Explicitly pass client_ip to avoid VPN detection
    // Similar to Besitos user_ip, we pass the whitelisted IP explicitly
    const whitelistedIp = config.BITLABS_WHITELISTED_IP || "127.0.0.1";
    normalizedParams.client_ip = whitelistedIp;

    try {
      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const paramsSerializer = {
        indexes: null,
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
        params: normalizedParams,
        paramsSerializer: paramsSerializer,
      });

      // Check for restriction_reason (CRITICAL: tells us why offers might be empty)
      const restrictionReason =
        response.data?.data?.restriction_reason ||
        response.data?.restriction_reason ||
        null;

      if (restrictionReason) {
        if (restrictionReason.not_verified) {
          console.error(`❌ Publisher account is NOT VERIFIED`);
        }
        if (restrictionReason.using_vpn) {
          console.error(`❌ User is using VPN`);
        }
        if (restrictionReason.unsupported_country) {
          console.error(`❌ User's country is NOT SUPPORTED`);
          console.error(
            `   This is likely why you're getting empty results from India!`
          );
        }
        if (restrictionReason.banned) {
          console.error(`❌ User is PERMANENTLY BANNED`);
        }
        if (restrictionReason.review) {
          console.error(`❌ User is UNDER REVIEW`);
        }
        if (restrictionReason.on_hold) {
          console.error(`❌ User's account is ON HOLD`);
        }
      }

      // Normalize response
      // BitLabs cashback API response structure: { data: { offers: [] }, status: "success" }
      let rawCashback = [];

      // Check response.data.data.offers first (most common structure for cashback)
      if (
        response.data?.data?.offers &&
        Array.isArray(response.data.data.offers)
      ) {
        rawCashback = response.data.data.offers;
      } else if (Array.isArray(response.data)) {
        rawCashback = response.data;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        rawCashback = response.data.data;
      } else if (
        response.data?.cashback &&
        Array.isArray(response.data.cashback)
      ) {
        rawCashback = response.data.cashback;
      } else if (response.data?.offers && Array.isArray(response.data.offers)) {
        rawCashback = response.data.offers;
      } else if (response.data?.items && Array.isArray(response.data.items)) {
        rawCashback = response.data.items;
      } else {
        console.warn(
          `⚠️ No matching response structure found for cashback offers`
        );
        console.warn(`Response structure analysis:`, {
          isArray: Array.isArray(response.data),
          isNull: response.data === null,
          isUndefined: response.data === undefined,
          keys: response.data ? Object.keys(response.data) : [],
          hasData: !!response.data?.data,
          dataKeys: response.data?.data ? Object.keys(response.data.data) : [],
          hasDataOffers: !!response.data?.data?.offers,
          hasCashback: !!response.data?.cashback,
          hasOffers: !!response.data?.offers,
          hasItems: !!response.data?.items,
          fullResponse: JSON.stringify(response.data, null, 2).substring(
            0,
            1000
          ),
        });
      }



      // Return raw Bitlabs cashback format - preserve original structure
      // Only add minimal metadata fields (type, provider) for categorization
      const cashbackWithMetadata = rawCashback.map((offer) => {
        // Preserve all original Bitlabs fields and structure
        // Only add minimal fields needed for our system
        return {
          ...offer, // Preserve all original Bitlabs fields
          // Add minimal metadata for categorization (don't override existing fields)
          type: offer.type || "cashback",
          provider: offer.provider || "bitlabs",
          sdkProvider: offer.sdkProvider || "bitlabs",
          // Ensure these fields exist (use original if present, otherwise add camelCase versions)
          offerId:
            offer.offerId || offer.id?.toString() || offer.offer_id?.toString(),
          // Preserve original field names but also add camelCase aliases for compatibility
          clickUrl: offer.clickUrl || offer.click_url || "",
          deepLink: offer.deepLink || offer.deep_link || offer.click_url || "",
          supportUrl: offer.supportUrl || offer.support_url || "",
          estimatedTime:
            offer.estimatedTime || offer.estimated_time || offer.duration || 0,
          confirmationTime:
            offer.confirmationTime || offer.confirmation_time || "",
          pendingTime: offer.pendingTime || offer.pending_time || 0,
          offerExpiresAt:
            offer.offerExpiresAt || offer.offer_expires_at || null,
          sessionHours: offer.sessionHours || offer.session_hours || 0,
          isSticky:
            offer.isSticky !== undefined
              ? offer.isSticky
              : offer.is_sticky || false,
          isAvailable:
            offer.isAvailable !== undefined
              ? offer.isAvailable
              : offer.is_available !== false,
          mobileVerificationRequired:
            offer.mobileVerificationRequired !== undefined
              ? offer.mobileVerificationRequired
              : offer.mobile_verification_required || false,
          webToMobile:
            offer.webToMobile !== undefined
              ? offer.webToMobile
              : offer.web_to_mobile || false,
          webToMobileDevices:
            offer.webToMobileDevices || offer.web_to_mobile_devices || [],
          thingsToKnow: offer.thingsToKnow || offer.things_to_know || [],
        };
      });

      return {
        success: true,
        data: cashbackWithMetadata,
        total: cashbackWithMetadata.length,
        timestamp: new Date().toISOString(),
        restrictionReason: restrictionReason || null, // Include restriction reason in response
      };
    } catch (error) {
      // console.error(`\n========== CASHBACK OFFERS ERROR ==========`);
      // console.error(`Error message:`, error.message);
      // console.error(`Error status:`, error.status || error.response?.status);

      // Log full error response data from BitLabs
      if (error.data) {
        console.error(
          `Error response data from BitLabs:`,
          JSON.stringify(error.data, null, 2)
        );
        if (error.data.error) {
          console.error(
            `Error details:`,
            JSON.stringify(error.data.error, null, 2)
          );
          if (error.data.error.details) {
            console.error(
              `Error details object:`,
              JSON.stringify(error.data.error.details, null, 2)
            );
          }
        }
        if (error.data.trace_id) {
          console.error(`Trace ID:`, error.data.trace_id);
        }
      }

      if (error.response?.data) {
        console.error(
          `Error response.data:`,
          JSON.stringify(error.response.data, null, 2)
        );
      }

      console.error(`Error config:`, {
        url: error.config?.url || fullURL,
        method: error.config?.method || "GET",
        headers: error.config?.headers ? Object.keys(error.config.headers) : [],
        params: error.config?.params || normalizedParams,
      });

      console.error(
        `Full error object:`,
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
      );

      // HTTP 428 means "Precondition Required" - usually means feature not enabled
      if (error.status === 428 || error.response?.status === 428) {
        console.error(`\n⚠️  HTTP 428 Error - This usually means:`);
        console.error(
          `   1. Cashback feature is not enabled in BitLabs Dashboard`
        );
        console.error(`   2. Your API token doesn't have cashback permissions`);
        console.error(
          `   3. Cashback requires additional setup in BitLabs Publisher Dashboard`
        );
        console.error(
          `\n   Please check: https://developer.bitlabs.ai/docs/cash-back`
        );
      }

      console.error(`===========================================\n`);
      throw error;
    }
  }

  /**
   * Get clicks
   * Endpoint: GET https://api.bitlabs.ai/v2/client/clicks
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Clicks data
   */
  async getClicks(queryParams = {}, userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = "/v2/client/clicks";
      const userIdentifier = userId || queryParams.userId || "static-inventory";

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
        params: queryParams,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs getClicks error:", error);
      throw error;
    }
  }

  /**
   * Create click
   * Endpoint: POST https://api.bitlabs.ai/v2/client/clicks
   * @param {Object} clickData - Click data
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Created click data
   */
  async createClick(clickData = {}, userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = "/v2/client/clicks";
      const userIdentifier = userId || clickData.userId || "static-inventory";

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.post(endpoint, clickData, {
        headers: headers,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs createClick error:", error);
      throw error;
    }
  }

  /**
   * Get click by ID
   * Endpoint: GET https://api.bitlabs.ai/v2/client/clicks/{clickId}
   * @param {string} clickId - Click ID
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Click data
   */
  async getClickById(clickId, userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = `/v2/client/clicks/${clickId}`;
      const userIdentifier = userId || "static-inventory";

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs getClickById error:", error);
      throw error;
    }
  }

  /**
   * Update click
   * Endpoint: PUT https://api.bitlabs.ai/v2/client/clicks/{clickId}
   * @param {string} clickId - Click ID
   * @param {Object} updateData - Update data
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Updated click data
   */
  async updateClick(clickId, updateData = {}, userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = `/v2/client/clicks/${clickId}`;
      const userIdentifier = userId || updateData.userId || "static-inventory";

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.put(endpoint, updateData, {
        headers: headers,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs updateClick error:", error);
      throw error;
    }
  }

  /**
   * Get survey reconciliation count
   * Endpoint: GET https://api.bitlabs.ai/v1/client/surveys/reconciliation-count
   * @param {Object} queryParams - Query parameters
   * @param {string} userId - Optional user ID
   * @returns {Promise<Object>} Reconciliation count data
   */
  async getSurveyReconciliationCount(queryParams = {}, userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = "/v1/client/surveys/reconciliation-count";
      const userIdentifier = userId || queryParams.userId || "static-inventory";

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
        params: queryParams,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs getSurveyReconciliationCount error:", error);
      throw error;
    }
  }

  /**
   * Get user magic receipt history
   * Endpoint: GET https://api.bitlabs.ai/v1/client/user/history/magic-receipts/{receiptOfferId}
   * @param {string} userId - User ID
   * @param {string} receiptOfferId - Receipt offer ID (optional)
   * @returns {Promise<Object>} Magic receipt history data
   */
  async getUserMagicReceiptHistory(userId, receiptOfferId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      let endpoint = "/v1/client/user/history/magic-receipts";
      if (receiptOfferId) {
        endpoint += `/${receiptOfferId}`;
      }

      const headers = {
        "X-Api-Token": this.apiToken,
        "X-User-Id": userIdentifier,
        "X-S2S-Token": this.serverToServerKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
      });

      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Bitlabs getUserMagicReceiptHistory error:", error);
      throw error;
    }
  }

  /**
   * Get user offer history
   * Endpoint: GET https://api.bitlabs.ai/v1/client/user/history/offers/{offerId}
   * @param {string} userId - User ID
   * @param {string} offerId - Offer ID (optional)
   * @returns {Promise<Object>} User offer history
   */
  /**
   * Get all downloaded games with full event details (two-step)
   * Step 1: GET /v1/client/user/history?filter=offers  → list of offer_ids user interacted with
   * Step 2: GET /v1/client/user/history/offers/{offerId} for each → full event details
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of detailed offer objects
   */
  async getUserDownloadedGamesWithDetails(userId) {
    if (!this.isConfigured()) {
      throw { status: 500, message: "Bitlabs API is not properly configured", data: null };
    }

    const headers = {
      "X-Api-Token": this.apiToken,
      "X-User-Id": userId,
      Accept: "application/json",
    };

    // Step 1: Get list of all offers user has interacted with
    const listResponse = await this.client.get("/v1/client/user/history", {
      headers,
      params: { filter: "offers" },
    });

    const historyList = listResponse.data?.data || listResponse.data || [];
    const offerList = Array.isArray(historyList) ? historyList : [];
    if (offerList.length === 0) return [];

    // Step 2: Fetch full details for each offer in parallel
    const detailResults = await Promise.allSettled(
      offerList.map(async (item) => {
        const offerId = item.offer_id || item.id;
        if (!offerId) return null;
        try {
          const detailResponse = await this.client.get(
            `/v1/client/user/history/offers/${offerId}`,
            { headers, params: {} }
          );
          const detail = detailResponse.data?.data || detailResponse.data;
          // Merge list-level fields into detail object
          return { ...item, ...detail, offer_id: offerId, id: offerId };
        } catch (err) {
          console.warn(`[BITLABS] Step 2 — failed to fetch details for offerId=${offerId}:`, err.message);
          // Fall back to list-level data if detail fetch fails
          return { ...item, offer_id: offerId, id: offerId };
        }
      })
    );

    const details = detailResults
      .filter(r => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);

    return details;
  }

  async getUserOfferHistory(userId, offerId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      let endpoint;
      let params = {};

      if (offerId) {
        // Single offer details — /v1/client/user/history/offers/{offerId}
        endpoint = `/v1/client/user/history/offers/${offerId}`;
      } else {
        // User's interacted offers list — /v1/client/user/history?filter=offers
        // This only returns offers the user has ACTUALLY interacted with (not all offers)
        endpoint = "/v1/client/user/history";
        params = { filter: "offers" };
      }

      const response = await this.client.get(endpoint, {
        headers: {
          "X-Api-Token": this.apiToken,
          "X-User-Id": userId || "static-inventory",
          Accept: "application/json",
        },
        params,
      });

      // Return full Bitlabs response structure (data, status, trace_id) for frontend compatibility
      return response.data;
    } catch (error) {
      console.error("Bitlabs getUserOfferHistory error:", error);
      throw error;
    }
  }

  /**
   * Get user maid
   * Endpoint: GET https://api.bitlabs.ai/v1/client/user/maid
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User maid data
   */
  async getUserMaid(userId) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Bitlabs API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = "/v1/client/user/maid";

      const response = await this.client.get(endpoint, {
        headers: {
          "X-Api-Token": this.apiToken,
          "X-User-Id": userId || "static-inventory",
          Accept: "application/json",
        },
        params: {},
      });

      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      console.error("Bitlabs getUserMaid error:", error);
      throw error;
    }
  }

  /**
   * Verify callback/webhook signature
   * @param {Object} callbackData - Callback data from Bitlabs
   * @param {string} signature - Signature to verify
   * @returns {boolean} Whether signature is valid
   */
  verifyCallbackSignature(callbackData, signature) {
    // Implement signature verification using secret key
    // This is a placeholder - adjust based on Bitlabs actual signature method
    const crypto = require("crypto");
    const dataString = JSON.stringify(callbackData);
    const expectedSignature = crypto
      .createHmac("sha256", this.secretKey)
      .update(dataString)
      .digest("hex");

    return expectedSignature === signature;
  }

  /**
   * Health check for Bitlabs API
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing Bitlabs config (BASE_URL or API_TOKEN)",
      };
    }

    try {
      // Try health check endpoint - use the correct v2 endpoint with required headers
      const response = await this.client.get("/v2/client/offers", {
        params: {
          limit: 1,
        },
        headers: {
          "X-Api-Token": this.apiToken,
          "X-User-Id": "health-check", // Placeholder for health check
        },
      });

      return {
        status: "ok",
        configured: true,
        data: {
          reachable: true,
          sampleCount: Array.isArray(response.data)
            ? response.data.length
            : response.data?.offers?.length || response.data?.data?.length || 1,
        },
      };
    } catch (error) {
      console.error("Bitlabs health check error:", error);
      const status = error.status || error?.response?.status;
      if (status === 401 || status === 403) {
        return {
          status: "unauthorized",
          configured: true,
          error: "Invalid or unauthorized Bitlabs API token",
          httpStatus: status,
        };
      }
      if (status >= 500) {
        return {
          status: "upstream_error",
          configured: true,
          error: "Bitlabs API server error",
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

  /**
   * Get offers from Publisher Offers API (for admin/preview purposes)
   * This endpoint is recommended by Bitlabs for browsing/previewing full non-game offer inventory
   * Documentation: https://developer.bitlabs.ai/reference/getpublisheroffersv2
   * Endpoint: GET https://api.bitlabs.ai/v2/publishers/offers
   * Note: Returns offers available for all users (not customized for any user)
   * @param {Object} queryParams - Query parameters (country, devices, type, etc.)
   * @returns {Promise<Object>} Publisher offers data
   */
  async getPublisherOffers(queryParams = {}) {
    if (!this.isConfigured()) {
      console.warn(
        "Bitlabs API is not properly configured. Returning empty publisher offers."
      );
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const endpoint = "/v2/publishers/offers";

      // Normalize parameters
      const { type, is_game, countries, country, ...restParams } = queryParams;
      let normalizedParams = { ...restParams };

      // Remove ANY country param completely to avoid duplicate
      delete normalizedParams.country;
      delete normalizedParams.countries; // Will set fresh below

      // Handle countries - use provided or default
      if (countries && (Array.isArray(countries) ? countries.length > 0 : countries)) {
        normalizedParams.countries = Array.isArray(countries) ? countries : [countries];
      } else if (country) {
        normalizedParams.countries = [country];
      } else {
        normalizedParams.countries = ["US"];
      }

      // Add is_game to request if Publisher API supports it (true = games only, false = non-games only)
      if (is_game === true || is_game === "true") {
        normalizedParams.is_game = true;
      } else if (is_game === false || is_game === "false") {
        normalizedParams.is_game = false;
      }

      // Add SDK parameter if not provided
      if (!normalizedParams.sdk) {
        normalizedParams.sdk = "CUSTOM";
      }

      // Ensure devices array is properly formatted
      if (normalizedParams.devices && !Array.isArray(normalizedParams.devices)) {
        normalizedParams.devices = [normalizedParams.devices];
      }

      // Default country if not provided
      if (!normalizedParams.country) {
        normalizedParams.country = "US";
      }
      
      // Store type for filtering after response (game when is_game is set)
      const filterType = type || (is_game === true || is_game === "true" ? "game" : undefined);

      // Publisher API requires X-S2S-Token header (Server-to-Server token)
      // Documentation: https://developer.bitlabs.ai/reference/getpublisheroffersv2
      const headers = {
        "X-S2S-Token": this.serverToServerKey || this.apiToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      // Publisher API expects comma-separated: countries=US,IN
      const paramsSerializer = (params) => {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            searchParams.append(key, value.join(','));
          } else {
            searchParams.append(key, value);
          }
        });
        return searchParams.toString();
      };

      const response = await this.client.get(endpoint, {
        headers: headers,
        params: normalizedParams,
        paramsSerializer: paramsSerializer,
      });



      // Parse response - Publisher API may have different structure
      let offers = [];
      if (Array.isArray(response.data)) {
        offers = response.data;
      } else if (response.data?.offers && Array.isArray(response.data.offers)) {
        offers = response.data.offers;
      } else if (response.data?.data?.offers && Array.isArray(response.data.data.offers)) {
        offers = response.data.data.offers;
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        offers = response.data.data;
      }

      // Filter by type if specified (since Publisher API may not support type parameter)
      let filteredOffers = offers;
      if (filterType && filterType !== "all") {
        filteredOffers = offers.filter((offer) => {
          const offerType = (offer.type || "").toLowerCase();
          const anchor = (offer.anchor || offer.name || offer.merchant_name || "").toLowerCase();
          const description = (offer.description || "").toLowerCase();
          const category = offer.category || offer.categories?.[0] || offer.primary_category || "";
          const categoryStr = typeof category === "object" 
            ? (category.name || category.name_internal || "").toLowerCase()
            : (category || "").toLowerCase();
          
          // Check if offer has cashback field (indicates it's a cashback offer)
          const hasCashbackField = offer.cashback !== undefined || offer.original_cashback !== undefined;
          
          if (filterType === "survey" || filterType === "surveys") {
            return offerType === "survey" || 
                   anchor.includes("survey") || 
                   description.includes("survey") ||
                   categoryStr.includes("survey");
          } else if (filterType === "cashback") {
            return offerType === "cashback" || 
                   anchor.includes("cashback") || 
                   anchor.includes("cash back") ||
                   description.includes("cashback") ||
                   description.includes("cash back") ||
                   categoryStr.includes("cashback") ||
                   hasCashbackField ||
                   offer.merchant_name; // Cashback offers usually have merchant_name
          } else if (filterType === "shopping") {
            return offerType === "shopping" || 
                   anchor.includes("shop") || 
                   anchor.includes("store") || 
                   anchor.includes("retail") ||
                   description.includes("shopping") ||
                   description.includes("purchase") ||
                   categoryStr.includes("shopping") ||
                   categoryStr.includes("retail");
          } else if (filterType === "magic_receipt" || filterType === "magic-receipts" || filterType === "magicReceipts") {
            return offerType === "magic_receipt" || 
                   anchor.includes("receipt") || 
                   anchor.includes("magic receipt") ||
                   description.includes("receipt") ||
                   description.includes("upload receipt") ||
                   categoryStr.includes("receipt") ||
                   categoryStr.includes("magic receipt");
          } else if (filterType === "game" || filterType === "games") {
            return offerType === "game" ||
                   offer.is_game === true ||
                   offer.is_game === "true" ||
                   (offer.app_metadata?.categories &&
                    offer.app_metadata.categories.some((cat) =>
                      typeof cat === "string" && cat.toUpperCase().includes("GAME")
                    ));
          }
          return true;
        });
        // console.log("🔵 [BITLABS PUBLISHER] Filtered offers by type '" + filterType + "':", filteredOffers.length);
        if (filteredOffers.length === 0 && offers.length > 0) {
          console.warn("⚠️ [BITLABS PUBLISHER] No offers matched filter type. Sample offer structure:", JSON.stringify(offers[0], null, 2).substring(0, 500));
        }
      }

      return {
        success: true,
        data: filteredOffers,
        total: filteredOffers.length,
        timestamp: new Date().toISOString(),
        rawResponse: response.data, // Include raw response for debugging
      };
    } catch (error) {
      const errorStatus = error.response?.status || error.status;
      const errorData = error.response?.data || error.data;

      console.error("\n🔴 [BITLABS PUBLISHER] ========== PUBLISHER API ERROR ==========");
      console.error("🔴 [BITLABS PUBLISHER] ❌ Error Status:", errorStatus);
      console.error("🔴 [BITLABS PUBLISHER] ❌ Error Message:", error.message);
      console.error("🔴 [BITLABS PUBLISHER] ❌ Error Response Data:", JSON.stringify(errorData, null, 2));
      console.error("🔴 [BITLABS PUBLISHER] ==================================================\n");

      // For 403/401 errors, return empty result instead of throwing
      if (errorStatus === 403 || errorStatus === 401) {
        console.warn("⚠️ [BITLABS PUBLISHER] 403/401 Forbidden - Returning empty offers.");
        return {
          success: true,
          data: [],
          total: 0,
          timestamp: new Date().toISOString(),
          error: errorData?.error?.details?.msg || "403/401 Forbidden",
        };
      }

      throw error;
    }
  }
}

// Export singleton instance
module.exports = new BitlabsService();

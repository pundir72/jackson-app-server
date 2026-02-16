/**
 * Adjust S2S API Service
 * Handles server-to-server API calls to Adjust for event tracking
 * Documentation: https://dev.adjust.com/en/api/s2s-api
 * @module services/adjust
 */

const axios = require("axios");
const config = require("../config/config");

class AdjustService {
  constructor() {
    this.baseURL = "https://s2s.adjust.com";
    // Change to Report Service API base URL
    this.analyticsBaseURL = "https://automate.adjust.com/reports-service";
    this.apiToken = config.ADJUST_API_TOKEN;
    this.appToken = config.ADJUST_APP_TOKEN;

    // Create axios instance with default config for S2S API
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Add Authorization header only if API token is available
    if (this.apiToken) {
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: headers,
      timeout: 30000, // 30 seconds timeout
    });

    // Create separate axios instance for Analytics API
    this.analyticsClient = axios.create({
      baseURL: this.analyticsBaseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(this.apiToken && { Authorization: `Bearer ${this.apiToken}` }),
      },
      timeout: 30000,
    });

    // Add response interceptor for analytics client
    this.analyticsClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const errorData = {
            status: error.response.status,
            message: error.response.data?.error || error.message,
            data: error.response.data,
          };
          throw errorData;
        } else if (error.request) {
          throw {
            status: 503,
            message: "Adjust Analytics API is not responding",
            data: null,
          };
        } else {
          throw {
            status: 500,
            message: error.message,
            data: null,
          };
        }
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const errorData = {
            status: error.response.status,
            message: error.response.data?.error || error.message,
            data: error.response.data,
          };
          throw errorData;
        } else if (error.request) {
          throw {
            status: 503,
            message: "Adjust API is not responding",
            data: null,
          };
        } else {
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
    return !!(this.apiToken && this.appToken);
  }

  /**
   * Send event to Adjust S2S API
   * Endpoint: POST https://s2s.adjust.com/event
   * @param {Object} eventData - Event data
   * @param {string} eventData.app_token - App token (required)
   * @param {string} eventData.event_token - Event token (required)
   * @param {string} eventData.idfa - iOS IDFA (preferred identifier)
   * @param {string} eventData.gps_adid - Google Play Services advertising ID (preferred identifier)
   * @param {string} eventData.fire_adid - Amazon Fire advertising ID (preferred identifier)
   * @param {string} eventData.oaid - Open Advertising ID (Huawei, preferred identifier)
   * @param {string} eventData.web_uuid - Web ID from Adjust Web SDK (preferred identifier)
   * @param {string} eventData.idfv - iOS IDFV (backup identifier)
   * @param {string} eventData.android_id - Android ID (backup identifier)
   * @param {number} eventData.revenue - Revenue amount (optional)
   * @param {string} eventData.currency - Currency code (optional, default: USD)
   * @param {string} eventData.callback_params - Callback parameters (optional, JSON string)
   * @param {string} eventData.partner_params - Partner parameters (optional, JSON string)
   * @param {string} eventData.created_at - Event timestamp (optional, ISO 8601 format)
   * @param {string} eventData.s2s - Must be "1" to indicate S2S request
   * @returns {Promise<Object>} Response data
   */
  async sendEvent(eventData) {
    console.log("\n🔍 [Adjust Service] sendEvent() called");
    console.log(
      "📥 [Adjust Service] Input eventData:",
      JSON.stringify(eventData, null, 2)
    );

    // Check configuration
    console.log("⚙️ [Adjust Service] Checking configuration...");
    console.log("   - API Token exists:", !!this.apiToken);
    console.log(
      "   - API Token length:",
      this.apiToken ? this.apiToken.length : 0
    );
    console.log(
      "   - API Token preview:",
      this.apiToken ? `${this.apiToken.substring(0, 10)}...` : "NOT SET"
    );
    console.log("   - App Token exists:", !!this.appToken);
    console.log("   - App Token value:", this.appToken || "NOT SET");
    console.log("   - Base URL:", this.baseURL);
    console.log("   - isConfigured():", this.isConfigured());

    if (!this.isConfigured()) {
      console.error("❌ [Adjust Service] Configuration check FAILED");
      throw {
        status: 500,
        message:
          "Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.",
        data: null,
      };
    }
    console.log("✅ [Adjust Service] Configuration check PASSED");

    // Validate required fields
    console.log("🔍 [Adjust Service] Validating event_token...");
    console.log("   - event_token exists:", !!eventData.event_token);
    console.log("   - event_token value:", eventData.event_token || "NOT SET");

    if (!eventData.event_token) {
      console.error("❌ [Adjust Service] event_token validation FAILED");
      throw {
        status: 400,
        message: "event_token is required for Adjust events",
        data: null,
      };
    }
    console.log("✅ [Adjust Service] event_token validation PASSED");

    try {
      // Build payload
      console.log("\n📦 [Adjust Service] Building payload...");
      const payload = {
        app_token: eventData.app_token || this.appToken,
        event_token: eventData.event_token,
        s2s: "1", // Required to indicate S2S request
        ...eventData,
      };

      console.log(
        "   - Payload before cleanup:",
        JSON.stringify(payload, null, 2)
      );
      console.log("   - Payload keys before cleanup:", Object.keys(payload));

      // Remove undefined values
      const keysBeforeCleanup = Object.keys(payload);
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) {
          console.log(`   - Removing undefined key: ${key}`);
          delete payload[key];
        }
      });
      const keysAfterCleanup = Object.keys(payload);
      console.log("   - Payload keys after cleanup:", keysAfterCleanup);
      console.log(
        "   - Removed keys:",
        keysBeforeCleanup.filter((k) => !keysAfterCleanup.includes(k))
      );

      // Log final payload details
      console.log("\n📤 [Adjust Service] Final Payload Details:");
      console.log("   - app_token:", payload.app_token || "MISSING");
      console.log("   - event_token:", payload.event_token || "MISSING");
      console.log("   - s2s:", payload.s2s || "MISSING");
      console.log(
        "   - Device IDs:",
        Object.keys(payload).filter(
          (k) =>
            k.includes("_adid") ||
            k.includes("idfa") ||
            k.includes("idfv") ||
            k.includes("android_id") ||
            k.includes("web_uuid")
        )
      );
      console.log("   - Has revenue:", !!payload.revenue);
      console.log("   - Revenue value:", payload.revenue || "N/A");
      console.log("   - Currency:", payload.currency || "N/A");
      console.log("   - Has callback_params:", !!payload.callback_params);
      console.log(
        "   - callback_params preview:",
        payload.callback_params
          ? typeof payload.callback_params === "string"
            ? payload.callback_params.substring(0, 100) + "..."
            : JSON.stringify(payload.callback_params).substring(0, 100) + "..."
          : "N/A"
      );
      console.log("   - Full payload:", JSON.stringify(payload, null, 2));

      // Log request configuration
      console.log("\n🌐 [Adjust Service] Request Configuration:");
      console.log("   - URL:", `${this.baseURL}/event`);
      console.log("   - Method: POST");
      console.log("   - Headers:", {
        Authorization: this.apiToken
          ? `Bearer ${this.apiToken.substring(0, 15)}...`
          : "NOT SET",
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      console.log("   - Timeout:", this.client.defaults.timeout);

      // Make the request
      console.log("\n🚀 [Adjust Service] Sending request to Adjust...");
      const requestStartTime = Date.now();

      const response = await this.client.post("/event", payload);

      const requestDuration = Date.now() - requestStartTime;
      console.log(
        `⏱️ [Adjust Service] Request completed in ${requestDuration}ms`
      );

      // Log full response
      console.log("\n📥 [Adjust Service] Response Received:");
      console.log("   - Status:", response.status);
      console.log("   - Status Text:", response.statusText);
      console.log(
        "   - Response Headers:",
        JSON.stringify(response.headers, null, 2)
      );
      console.log("   - Response Data Type:", typeof response.data);
      console.log(
        "   - Response Data:",
        JSON.stringify(response.data, null, 2)
      );
      console.log("   - Response Data is null?", response.data === null);
      console.log(
        "   - Response Data is undefined?",
        response.data === undefined
      );
      console.log(
        "   - Response Data is empty object?",
        response.data &&
          typeof response.data === "object" &&
          Object.keys(response.data).length === 0
      );
      console.log(
        "   - Response Data keys:",
        response.data ? Object.keys(response.data) : "N/A"
      );
      console.log("   - Full Response Object Keys:", Object.keys(response));
      console.log(
        "   - Response Config:",
        JSON.stringify(
          {
            url: response.config?.url,
            method: response.config?.method,
            baseURL: response.config?.baseURL,
            headers: response.config?.headers
              ? Object.keys(response.config.headers)
              : "N/A",
          },
          null,
          2
        )
      );

      // Note about empty response
      if (
        response.status === 200 &&
        (!response.data ||
          (typeof response.data === "object" &&
            Object.keys(response.data).length === 0))
      ) {
        console.log(
          "\n✅ [Adjust Service] NOTE: Empty response is NORMAL for Adjust S2S API"
        );
        console.log(
          "   - Adjust S2S API returns 200 OK with empty body {} when event is successfully accepted"
        );
        console.log(
          "   - This is expected behavior according to Adjust documentation"
        );
        console.log("   - The event is processed asynchronously by Adjust");
      }

      const result = {
        success: true,
        data: response.data,
        status: response.status,
      };

      console.log("\n📊 [Adjust Service] Returning result:");
      console.log("   - Result:", JSON.stringify(result, null, 2));
      console.log("   - Result.success:", result.success);
      console.log("   - Result.status:", result.status);
      console.log("   - Result.data:", result.data);
      console.log("   - Result.data type:", typeof result.data);
      console.log(
        "   - Result.data is empty?",
        !result.data ||
          (typeof result.data === "object" &&
            Object.keys(result.data).length === 0)
      );

      return result;
    } catch (error) {
      console.error("\n❌ [Adjust Service] Error occurred:");
      console.error("   - Error Type:", error.constructor.name);
      console.error("   - Error Message:", error.message);
      console.error("   - Error Stack:", error.stack);

      if (error.response) {
        console.error("   - Response Status:", error.response.status);
        console.error("   - Response Status Text:", error.response.statusText);
        console.error(
          "   - Response Data:",
          JSON.stringify(error.response.data, null, 2)
        );
        console.error(
          "   - Response Headers:",
          JSON.stringify(error.response.headers, null, 2)
        );
        console.error("   - Request URL:", error.config?.url);
        console.error("   - Request Method:", error.config?.method);
        console.error(
          "   - Request Payload:",
          JSON.stringify(error.config?.data, null, 2)
        );
      } else if (error.request) {
        console.error("   - Request was made but no response received");
        console.error(
          "   - Request Config:",
          JSON.stringify(
            {
              url: error.config?.url,
              method: error.config?.method,
              baseURL: error.config?.baseURL,
              timeout: error.config?.timeout,
            },
            null,
            2
          )
        );
        console.error(
          "   - Request Headers:",
          JSON.stringify(error.config?.headers, null, 2)
        );
      } else {
        console.error("   - Error setting up request:", error.message);
      }

      console.error("Adjust sendEvent error:", error);
      throw error;
    }
  }

  /**
   * Send ad revenue data to Adjust S2S API
   * Endpoint: POST https://s2s.adjust.com/ad_revenue
   * @param {Object} revenueData - Ad revenue data
   * @param {string} revenueData.app_token - App token (required)
   * @param {string} revenueData.idfa - iOS IDFA
   * @param {string} revenueData.gps_adid - Google Play Services advertising ID
   * @param {string} revenueData.fire_adid - Amazon Fire advertising ID
   * @param {string} revenueData.oaid - Open Advertising ID (Huawei)
   * @param {string} revenueData.web_uuid - Web ID from Adjust Web SDK
   * @param {string} revenueData.idfv - iOS IDFV (backup)
   * @param {string} revenueData.android_id - Android ID (backup)
   * @param {number} revenueData.revenue - Revenue amount (required)
   * @param {string} revenueData.currency - Currency code (required)
   * @param {string} revenueData.ad_revenue_network - Ad network name (required)
   * @param {string} revenueData.ad_revenue_placement - Ad placement ID (optional)
   * @param {string} revenueData.ad_revenue_unit - Ad unit type (optional)
   * @param {string} revenueData.created_at - Event timestamp (optional, ISO 8601 format)
   * @returns {Promise<Object>} Response data
   */
  async sendAdRevenue(revenueData) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message:
          "Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.",
        data: null,
      };
    }

    // Validate required fields
    if (revenueData.revenue === undefined || revenueData.revenue === null) {
      throw {
        status: 400,
        message: "revenue is required for ad revenue tracking",
        data: null,
      };
    }
    if (!revenueData.currency) {
      throw {
        status: 400,
        message: "currency is required for ad revenue tracking",
        data: null,
      };
    }
    if (!revenueData.ad_revenue_network) {
      throw {
        status: 400,
        message: "ad_revenue_network is required for ad revenue tracking",
        data: null,
      };
    }

    try {
      const payload = {
        app_token: revenueData.app_token || this.appToken,
        ...revenueData,
      };

      // Remove undefined values
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const response = await this.client.post("/ad_revenue", payload);

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      console.error("Adjust sendAdRevenue error:", error);
      throw error;
    }
  }

  /**
   * Send session data to Adjust S2S API
   * Endpoint: POST https://s2s.adjust.com/session
   * @param {Object} sessionData - Session data
   * @param {string} sessionData.app_token - App token (required)
   * @param {string} sessionData.idfa - iOS IDFA
   * @param {string} sessionData.gps_adid - Google Play Services advertising ID
   * @param {string} sessionData.fire_adid - Amazon Fire advertising ID
   * @param {string} sessionData.oaid - Open Advertising ID (Huawei)
   * @param {string} sessionData.web_uuid - Web ID from Adjust Web SDK
   * @param {string} sessionData.idfv - iOS IDFV (backup)
   * @param {string} sessionData.android_id - Android ID (backup)
   * @param {string} sessionData.created_at - Session timestamp (optional, ISO 8601 format)
   * @returns {Promise<Object>} Response data
   */
  async sendSession(sessionData) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message:
          "Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.",
        data: null,
      };
    }

    try {
      const payload = {
        app_token: sessionData.app_token || this.appToken,
        ...sessionData,
      };

      // Remove undefined values
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const response = await this.client.post("/session", payload);

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      console.error("Adjust sendSession error:", error);
      throw error;
    }
  }

  /**
   * Helper: Track in-app purchase event
   * @param {Object} params - Purchase parameters
   * @param {string} params.userId - User ID
   * @param {string} params.eventToken - Adjust event token
   * @param {number} params.revenue - Revenue amount
   * @param {string} params.currency - Currency code
   * @param {Object} params.deviceIds - Device identifiers
   * @param {Object} params.callbackParams - Callback parameters
   * @returns {Promise<Object>} Response
   */
  async trackPurchase(params) {
    const {
      userId,
      eventToken,
      revenue,
      currency = "USD",
      deviceIds = {},
      callbackParams = {},
    } = params;

    return this.sendEvent({
      event_token: eventToken,
      revenue: revenue,
      currency: currency,
      ...deviceIds,
      callback_params:
        typeof callbackParams === "string"
          ? callbackParams
          : JSON.stringify(callbackParams),
    });
  }

  /**
   * Helper: Track game completion event
   * @param {Object} params - Game completion parameters
   * @param {string} params.userId - User ID
   * @param {string} params.eventToken - Adjust event token
   * @param {Object} params.deviceIds - Device identifiers
   * @param {Object} params.callbackParams - Callback parameters
   * @returns {Promise<Object>} Response
   */
  async trackGameCompletion(params) {
    const { userId, eventToken, deviceIds = {}, callbackParams = {} } = params;

    return this.sendEvent({
      event_token: eventToken,
      ...deviceIds,
      callback_params:
        typeof callbackParams === "string"
          ? callbackParams
          : JSON.stringify(callbackParams),
    });
  }

  /**
   * Health check for Adjust API
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing Adjust config (API_TOKEN or APP_TOKEN)",
        appToken: this.appToken,
        apiToken: this.apiToken ? 'configured' : 'NOT SET',
        baseURL: this.baseURL,
        analyticsBaseURL: this.analyticsBaseURL
      };
    }

    // Adjust doesn't have a health check endpoint, so we'll just verify config
    return {
      status: "ok",
      configured: true,
      message: "Adjust S2S API is configured",
      appToken: this.appToken,
      apiToken: this.apiToken ? 'configured' : 'NOT SET',
      baseURL: this.baseURL,
      analyticsBaseURL: this.analyticsBaseURL
    };
  }

  /**
   * Get analytics data for a specific event token
   * Uses Adjust KPIs API to fetch comprehensive analytics
   * @param {Object} params - Analytics parameters
   * @param {string} params.eventToken - Event token (required)
   * @param {string} params.startDate - Start date (YYYY-MM-DD) (optional, defaults to 30 days ago)
   * @param {string} params.endDate - End date (YYYY-MM-DD) (optional, defaults to today)
   * @param {string} params.grouping - Grouping dimension (optional: 'day', 'week', 'month')
   * @returns {Promise<Object>} Analytics data
   */
  async getEventAnalytics(params) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message:
          "Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.",
        data: null,
      };
    }

    const { eventToken, startDate, endDate, grouping = "day" } = params;

    if (!eventToken) {
      throw {
        status: 400,
        message: "eventToken is required for analytics",
        data: null,
      };
    }

    try {
      const end = endDate || new Date().toISOString().split("T")[0];
      const start =
        startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      // Use Report Service API - remove app_token from params, use filters instead
      const response = await this.analyticsClient.get("/report", {
        params: {
          dimensions: "app,day",
          metrics: "events,revenue,installs,clicks,impressions",
          date_period: `${start}:${end}`,
          // Remove app_token from query params - API token determines the app
          // Use filters if you need to filter by app_token or event_token
          filters: JSON.stringify({
            app_token: [this.appToken],
            event_token: [eventToken]
          })
        },
      });

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      console.error("Adjust getEventAnalytics error:", error);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
        console.error(
          "Request URL:",
          error.config?.baseURL + error.config?.url
        );
        console.error("Request params:", error.config?.params);
      }
      throw error;
    }
  }

  /**
   * Get installs by source (network/campaign) for an event token
   * @param {Object} params - Parameters
   * @param {string} params.eventToken - Event token (required)
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Installs by source data
   */
  async getInstallsBySource(params) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Adjust API is not properly configured.",
        data: null,
      };
    }

    const { eventToken, startDate, endDate } = params;

    if (!eventToken) {
      throw {
        status: 400,
        message: "eventToken is required",
        data: null,
      };
    }

    try {
      const end = endDate || new Date().toISOString().split("T")[0];
      const start =
        startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      const response = await this.analyticsClient.get("/report", {
        params: {
          dimensions: "app,network",
          metrics: "installs,events,revenue",
          date_period: `${start}:${end}`,
          filters: JSON.stringify({
            app_token: [this.appToken],
            event_token: [eventToken]
          })
        },
      });

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      console.error("Adjust getInstallsBySource error:", error);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
        console.error(
          "Request URL:",
          error.config?.baseURL + error.config?.url
        );
      }
      throw error;
    }
  }

  /**
   * Get revenue data for an event token
   * @param {Object} params - Parameters
   * @param {string} params.eventToken - Event token (required)
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Revenue data
   */
  async getRevenueData(params) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Adjust API is not properly configured.",
        data: null,
      };
    }

    const { eventToken, startDate, endDate } = params;

    if (!eventToken) {
      throw {
        status: 400,
        message: "eventToken is required",
        data: null,
      };
    }

    try {
      const end = endDate || new Date().toISOString().split("T")[0];
      const start =
        startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      const response = await this.analyticsClient.get("/report", {
        params: {
          dimensions: "app,day",
          metrics: "revenue,events",
          date_period: `${start}:${end}`,
          filters: JSON.stringify({
            app_token: [this.appToken],
            event_token: [eventToken]
          })
        },
      });

      return {
        success: true,
        data: response.data,
        status: response.status,
      };
    } catch (error) {
      console.error("Adjust getRevenueData error:", error);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      throw error;
    }
  }

  /**
   * Get device and location details for an event token
   * @param {Object} params - Parameters
   * @param {string} params.eventToken - Event token (required)
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Device and location data
   */
  async getDeviceLocationData(params) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Adjust API is not properly configured.",
        data: null,
      };
    }

    const { eventToken, startDate, endDate } = params;

    if (!eventToken) {
      throw {
        status: 400,
        message: "eventToken is required",
        data: null,
      };
    }

    try {
      const end = endDate || new Date().toISOString().split("T")[0];
      const start =
        startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      // Get device data grouped by platform
      const deviceResponse = await this.analyticsClient.get("/report", {
        params: {
          dimensions: "app,os_name",
          metrics: "events,installs",
          date_period: `${start}:${end}`,
          filters: JSON.stringify({
            app_token: [this.appToken],
            event_token: [eventToken]
          })
        },
      });

      // Get location data grouped by country
      const locationResponse = await this.analyticsClient.get("/report", {
        params: {
          dimensions: "app,country",
          metrics: "events,installs,revenue",
          date_period: `${start}:${end}`,
          filters: JSON.stringify({
            app_token: [this.appToken],
            event_token: [eventToken]
          })
        },
      });

      return {
        success: true,
        data: {
          devices: deviceResponse.data,
          locations: locationResponse.data,
        },
        status: 200,
      };
    } catch (error) {
      console.error("Adjust getDeviceLocationData error:", error);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      throw error;
    }
  }

  /**
   * Get comprehensive analytics for an event token (all data combined)
   * @param {Object} params - Parameters
   * @param {string} params.eventToken - Event token (required)
   * @param {string} params.startDate - Start date (YYYY-MM-DD)
   * @param {string} params.endDate - End date (YYYY-MM-DD)
   * @returns {Promise<Object>} Complete analytics data
   */
  async getCompleteAnalytics(params) {
    const { eventToken, startDate, endDate } = params;

    try {
      // Fetch all analytics in parallel
      const [
        eventAnalytics,
        installsBySource,
        revenueData,
        deviceLocationData,
      ] = await Promise.all([
        this.getEventAnalytics({ eventToken, startDate, endDate }).catch(
          (err) => ({ error: err.message })
        ),
        this.getInstallsBySource({ eventToken, startDate, endDate }).catch(
          (err) => ({ error: err.message })
        ),
        this.getRevenueData({ eventToken, startDate, endDate }).catch(
          (err) => ({ error: err.message })
        ),
        this.getDeviceLocationData({ eventToken, startDate, endDate }).catch(
          (err) => ({ error: err.message })
        ),
      ]);

      return {
        success: true,
        data: {
          eventAnalytics: eventAnalytics.data || eventAnalytics,
          installsBySource: installsBySource.data || installsBySource,
          revenueData: revenueData.data || revenueData,
          deviceLocationData: deviceLocationData.data || deviceLocationData,
          eventToken,
          dateRange: {
            start:
              startDate ||
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
            end: endDate || new Date().toISOString().split("T")[0],
          },
        },
        status: 200,
      };
    } catch (error) {
      console.error("Adjust getCompleteAnalytics error:", error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new AdjustService();

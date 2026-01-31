/**
 * Besitos API Service
 * Handles all API calls to Besitos platform for game offers and surveys
 * @module services/besitos
 */

const axios = require("axios");
const config = require("../config/config");

class BesitosService {
  constructor() {
    this.baseURL = config.BESITOS_BASE_URL;
    this.partnerId = config.BESITOS_PARTNER_ID;
    this.token = config.BESITOS_API_TOKEN;
    // Create axios instance with default config
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
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
            message: "Besitos API is not responding",
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
    return !!(this.baseURL && this.partnerId && this.token);
  }

  /**
   * Get available offers for partner
   * @param {Object} queryParams - Query parameters (platform, country, etc.)
   * @returns {Promise<Object>} Offers data
   */
  async getOffers(queryParams = {}) {
    if (!this.isConfigured()) {
      console.error("🟢 [BESITOS SERVICE] Service not configured!");
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = `/data/partner/offers/${this.partnerId}`;

      const response = await this.client.get(endpoint, { params: queryParams });

      return response.data;
    } catch (error) {
      console.error("🟢 [BESITOS SERVICE] getOffers error:", {
        message: error.message,
        status: error.status || error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: error.config
          ? {
              url: error.config.url,
              method: error.config.method,
              params: error.config.params,
            }
          : "N/A",
        fullError: error,
      });
      throw error;
    }
  }

  /**
   * Get surveys for partner
   * Endpoint: GET /data/surveys/wall/{partnerId}/{partnerUserId}
   * @param {Object} queryParams - Query parameters (device, user_ip, etc.)
   * @param {string} partnerUserId - Partner user ID (optional, can use static value for admin)
   * @returns {Promise<Object>} Surveys data
   */
  async getSurveys(queryParams = {}, partnerUserId = "admin-preview") {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    try {
      const endpoint = `/data/surveys/wall/${this.partnerId}/${partnerUserId}`;
      const response = await this.client.get(endpoint, { params: queryParams });
      return response.data;
    } catch (error) {
      console.error("Besitos getSurveys error:", error);
      throw error;
    }
  }

  /**
   * Get user data and activity
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User data
   */
  async getUserData(userId) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    if (!userId) {
      throw {
        status: 400,
        message: "User ID is required",
        data: null,
      };
    }

    try {
      const response = await this.client.get(
        `/data/${this.partnerId}/${userId}`
      );
      return response.data;
    } catch (error) {
      console.error("Besitos getUserData error:", error);
      throw error;
    }
  }

  /**
   * Get conversions data
   * @param {Object} queryParams - Query parameters (from, to, status, etc.)
   * @returns {Promise<Object>} Conversions data
   */
  async getConversions(queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    try {
      const response = await this.client.get(`/data/partner/conversions`, {
        params: queryParams,
      });
      return response.data;
    } catch (error) {
      console.error("Besitos getConversions error:", error);
      throw error;
    }
  }

  /**
   * Get surveys wall for user
   * @param {string} userId - User ID
   * @param {Object} queryParams - Query parameters
   * @returns {Promise<Object>} Surveys data
   */
  async getSurveysWall(userId, queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    if (!userId) {
      throw {
        status: 400,
        message: "User ID is required",
        data: null,
      };
    }

    try {
      const response = await this.client.get(
        `/data/surveys/wall/${this.partnerId}/${userId}`,
        { params: queryParams }
      );
      return response.data;
    } catch (error) {
      console.error("Besitos getSurveysWall error:", error);
      throw error;
    }
  }

  /**
   * Get user profiling questions
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Profiling data
   */
  async getUserProfiling(userId) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    if (!userId) {
      throw {
        status: 400,
        message: "User ID is required",
        data: null,
      };
    }

    try {
      const response = await this.client.get(
        `/data/surveys/profiling/${this.partnerId}/${userId}`
      );
      return response.data;
    } catch (error) {
      console.error("Besitos getUserProfiling error:", error);
      throw error;
    }
  }

  /**
   * Get messenger/upcoming goals
   * @param {string} userId - User ID (optional for upcoming goals)
   * @returns {Promise<Object>} Messenger data
   */
  async getMessenger(userId = null) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    try {
      const response = await this.client.get(
        `/data/messages/${this.partnerId}/upcoming-goals`
      );
      return response.data;
    } catch (error) {
      console.error("Besitos getMessenger error:", error);
      throw error;
    }
  }

  /**
   * Submit conversion/postback
   * @param {Object} conversionData - Conversion data
   * @returns {Promise<Object>} Response
   */
  async submitConversion(conversionData) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Besitos API is not properly configured",
        data: null,
      };
    }

    try {
      const response = await this.client.post(`/postback`, conversionData);
      return response.data;
    } catch (error) {
      console.error("Besitos submitConversion error:", error);
      throw error;
    }
  }

  /**
   * Health check for Besitos API
   * - Uses an authenticated, lightweight offers request (limit=1)
   * - Maps HTTP errors to clearer statuses
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing BESITOS config (BASE_URL, PARTNER_ID, or API_TOKEN)",
      };
    }

    try {
      const response = await this.client.get(
        `/data/partner/offers/${this.partnerId}`,
        {
          params: { limit: 1 },
        }
      );
      console.log("Besitos health check response:", response.data);
      return {
        status: "ok",
        configured: true,
        data: {
          reachable: true,
          sampleCount: Array.isArray(response.data) ? response.data.length : 1,
        },
      };
    } catch (error) {
      console.error("Besitos health check error:", error);
      // Normalize common failure modes
      const status = error.status || error?.response?.status;
      if (status === 401 || status === 403) {
        return {
          status: "unauthorized",
          configured: true,
          error: "Invalid or unauthorized Besitos API token",
          httpStatus: status,
        };
      }
      if (status >= 500) {
        return {
          status: "upstream_error",
          configured: true,
          error: "Besitos API server error",
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

// Export singleton instance
module.exports = new BesitosService();

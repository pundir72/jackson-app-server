/**
 * Affise API Service
 * Handles all API calls to Affise platform (API v3.x)
 * Documentation: https://api-wdigital.affise.com/docs3.1/
 * @module services/affise
 */

const axios = require("axios");
const config = require("../config/config");

class AffiseService {
  constructor() {
    this.baseURL = config.AFFISE_BASE_URL || "https://api-wdigital.affise.com";
    this.baseURL = this.baseURL.replace(/\/+$/, "");
    this.baseURL = this.baseURL.replace(/\/(3\.0|3\.1)$/, "");
    this.apiVersion = config.AFFISE_API_VERSION || "3.0";
    this.apiKey = config.AFFISE_API_KEY;

    console.log("Affise base URL:", config.AFFISE_API_KEY);
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 30000,
    });

    this.client.interceptors.request.use(
      (requestConfig) => {
        if (this.apiKey) {
          requestConfig.headers["api-key"] = this.apiKey;
          requestConfig.headers["API-Key"] = this.apiKey;
          if (!requestConfig.params) {
            requestConfig.params = {};
          }
          if (!requestConfig.params["api-key"]) {
            requestConfig.params["api-key"] = this.apiKey;
          }
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          throw {
            status: error.response.status,
            message: error.response.data?.message || error.message,
            data: error.response.data,
          };
        }
        if (error.request) {
          throw {
            status: 503,
            message: "Affise API is not responding",
            data: null,
          };
        }
        throw {
          status: 500,
          message: error.message,
          data: null,
        };
      }
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
   * Get offers (Affiliate API by default)
   * Endpoint: GET /{version}/partner/offers
   * @param {Object} queryParams
   * @param {Object} options
   * @param {boolean} options.admin - Use admin offers endpoint when true
   * @returns {Promise<Object>}
   */
  async getOffers(queryParams = {}, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const endpoint = options.admin
      ? `/${this.apiVersion}/offers`
      : `/${this.apiVersion}/partner/offers`;

    const response = await this.client.get(endpoint, { params: queryParams });
    const offers =
      response.data?.offers ||
      response.data?.data ||
      response.data?.results ||
      [];

    return {
      success: true,
      data: offers,
      total: response.data?.count || response.data?.total || offers.length,
      raw: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get custom statistics
   * Endpoint: GET /{version}/stats/custom
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getStatsCustom(queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/custom`;
    const response = await this.client.get(endpoint, { params: queryParams });

    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get conversions
   * Endpoint: GET /{version}/stats/conversions
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getConversions(queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/conversions`;
    const response = await this.client.get(endpoint, { params: queryParams });

    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get clicks
   * Endpoint: GET /{version}/stats/clicks
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getClicks(queryParams = {}) {
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/clicks`;
    const response = await this.client.get(endpoint, { params: queryParams });

    return {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Health check for Affise API
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    const configured = this.isConfigured();
    if (!configured) {
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing Affise config (BASE_URL or API_KEY)",
      };
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const response = await this.client.get(
        `/${this.apiVersion}/stats/conversions`,
        {
          params: {
            date_from: today,
            date_to: today,
            limit: 1,
          },
        }
      );

      return {
        status: "ok",
        configured: true,
        data: {
          reachable: true,
          sampleCount:
            response.data?.count ||
            response.data?.total ||
            response.data?.rows?.length ||
            0,
        },
      };
    } catch (error) {
      console.error("Affise health check error:", error);
      const status = error.status || error?.response?.status;
      if (status === 401 || status === 403) {
        return {
          status: "unauthorized",
          configured: true,
          error: "Invalid or unauthorized Affise API key",
          httpStatus: status,
        };
      }
      if (status >= 500) {
        return {
          status: "upstream_error",
          configured: true,
          error: "Affise API server error",
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

module.exports = new AffiseService();

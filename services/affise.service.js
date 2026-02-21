/**
 * Affise API Service
 * Handles all API calls to Affise platform (API v3.x)
 * Documentation: https://api-wdigital.affise.com/docs3.1/
 * @module services/affise
 */

const axios = require("axios");
const config = require("../config/config");

/** Mask API key for safe console debug (first 4 + ... + last 4) */
function maskKey(key) {
  if (!key || typeof key !== "string") return "(none)";
  if (key.length <= 12) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

/** Build full URL with query string for debug */
function buildFullUrl(baseURL, path, params) {
  const base = (baseURL || "").replace(/\/+$/, "");
  const pathPart = (path || "").startsWith("/") ? path : "/" + (path || "");
  if (!params || Object.keys(params).length === 0) return base + pathPart;
  const search = new URLSearchParams(params).toString();
  return base + pathPart + "?" + search;
}

class AffiseService {
  constructor() {
    this.baseURL = config.AFFISE_BASE_URL || "https://api-wdigital.affise.com";
    this.baseURL = this.baseURL.replace(/\/+$/, "");
    this.baseURL = this.baseURL.replace(/\/(3\.0|3\.1)$/, "");
    this.apiVersion = config.AFFISE_API_VERSION || "3.0";
    this.apiKey = config.AFFISE_API_KEY;
    this.debug =
      process.env.AFFISE_DEBUG !== "0" && process.env.AFFISE_DEBUG !== "false";

    console.log("🔵 [AFFISE SERVICE] Initialization:");
    console.log("🔵 [AFFISE SERVICE] - Base URL:", this.baseURL);
    console.log("🔵 [AFFISE SERVICE] - API Version:", this.apiVersion);
    console.log("🔵 [AFFISE SERVICE] - API Key configured:", !!this.apiKey);
    console.log(
      "🔵 [AFFISE SERVICE] - API Key (masked):",
      maskKey(this.apiKey),
    );
    console.log(
      "🔵 [AFFISE SERVICE] - Debug logging:",
      this.debug ? "ON" : "OFF",
    );
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
        console.log("\n🟡 ========== AFFISE REQUEST INTERCEPTOR ==========");
        console.log("🟡 [DEBUG] Method:", requestConfig.method?.toUpperCase());
        console.log("🟡 [DEBUG] Path:", requestConfig.url);
        console.log(
          "🟡 [DEBUG] Params (before API-Key):",
          JSON.stringify(requestConfig.params, null, 2),
        );
        console.log(
          "🟡 [DEBUG] Headers (before API-Key):",
          JSON.stringify(requestConfig.headers, null, 2),
        );

        if (this.apiKey) {
          requestConfig.headers["API-Key"] = this.apiKey;
          if (!requestConfig.params) {
            requestConfig.params = {};
          }
          if (!requestConfig.params["API-Key"]) {
            requestConfig.params["API-Key"] = this.apiKey;
          }
          console.log(
            "🟡 [DEBUG] API-Key added (masked):",
            maskKey(this.apiKey),
          );
        } else {
          console.warn("⚠️ [DEBUG] No API key available!");
        }

        const finalParams = requestConfig.params || {};
        const fullUrl = buildFullUrl(
          requestConfig.baseURL,
          requestConfig.url,
          finalParams,
        );
        console.log("🟡 [DEBUG] Final params keys:", Object.keys(finalParams));
        console.log(
          "🟡 [DEBUG] Has API-Key in params:",
          "API-Key" in finalParams,
        );
        console.log(
          "🟡 [DEBUG] Has API-Key in headers:",
          "API-Key" in (requestConfig.headers || {}),
        );
        console.log("🟡 [DEBUG] Full request URL (with query):", fullUrl);
        if (this.debug) {
          console.log(
            "🟡 [DEBUG] Full params:",
            JSON.stringify(finalParams, null, 2),
          );
          console.log(
            "🟡 [DEBUG] Full headers:",
            JSON.stringify(requestConfig.headers, null, 2),
          );
        }
        console.log("🟡 ===========================================\n");
        return requestConfig;
      },
      (error) => {
        console.error("❌ [INTERCEPTOR] Request interceptor error:", error);
        return Promise.reject(error);
      },
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log("\n🟢 ========== AFFISE RESPONSE INTERCEPTOR ==========");
        console.log("🟢 [DEBUG] Status:", response.status, response.statusText);
        console.log("🟢 [DEBUG] Response URL:", response.config?.url);
        console.log("🟢 [DEBUG] Data keys:", Object.keys(response.data || {}));
        console.log(
          "🟢 [DEBUG] Data preview:",
          JSON.stringify(response.data, null, 2).substring(0, 800),
        );
        if (this.debug) {
          console.log(
            "🟢 [DEBUG] Full response data:",
            JSON.stringify(response.data, null, 2),
          );
        }
        console.log("🟢 ===========================================\n");
        return response;
      },
      (error) => {
        console.error(
          "\n❌ ========== AFFISE RESPONSE ERROR INTERCEPTOR ==========",
        );
        const cfg = error.config || {};
        const fullFailedUrl = buildFullUrl(cfg.baseURL, cfg.url, cfg.params);
        console.error("❌ [DEBUG] Request that failed:");
        console.error("❌ [DEBUG]   Full URL:", fullFailedUrl);
        console.error("❌ [DEBUG]   Method:", cfg.method);
        console.error(
          "❌ [DEBUG]   Params:",
          JSON.stringify(cfg.params, null, 2),
        );
        console.error(
          "❌ [DEBUG]   Header API-Key present:",
          !!(
            cfg.headers &&
            ("API-Key" in cfg.headers || "api-key" in cfg.headers)
          ),
        );

        if (error.response) {
          const status = error.response.status;
          const body = error.response.data;
          console.error("❌ [DEBUG] Response status:", status);
          console.error(
            "❌ [DEBUG] Response data:",
            JSON.stringify(body, null, 2),
          );
          console.error(
            "❌ [DEBUG] Response headers:",
            JSON.stringify(error.response.headers, null, 2),
          );

          if (status === 401 || status === 403) {
            console.error("\n🔴 ========== AFFISE TOKEN REJECTED ==========");
            console.error("🔴 [TOKEN] HTTP status:", status);
            console.error(
              "🔴 [TOKEN] Affise error message:",
              body?.error || body?.message || "(none)",
            );
            console.error(
              "🔴 [TOKEN] Affise response body:",
              JSON.stringify(body, null, 2),
            );
            console.error(
              "🔴 [TOKEN] Endpoint called:",
              cfg.url || "(unknown)",
            );
            console.error(
              "🔴 [TOKEN] API-Key used (masked):",
              maskKey(this.apiKey),
            );
            if ((cfg.url || "").includes("/partner/")) {
              console.error(
                "🔴 [TOKEN] This is a PARTNER endpoint. Possible reasons for rejection:",
              );
              console.error(
                "🔴 [TOKEN]   - You are using an ADMIN API key; partner endpoints require a PARTNER (affiliate) API key.",
              );
              console.error(
                "🔴 [TOKEN]   - Get the partner key from the affiliate profile in Affise dashboard.",
              );
            } else {
              console.error(
                "🔴 [TOKEN] This is an ADMIN-style endpoint. Possible reasons:",
              );
              console.error("🔴 [TOKEN]   - Invalid or expired API key.");
              console.error(
                "🔴 [TOKEN]   - Key may not have permission for this endpoint.",
              );
            }
            console.error("🔴 ===========================================\n");
          }

          throw {
            status,
            message: body?.message || body?.error || error.message,
            data: body,
          };
        }
        if (error.request) {
          console.error(
            "❌ [DEBUG] No response from server (timeout or network)",
          );
          console.error("❌ [DEBUG] Request was:", fullFailedUrl);
          throw {
            status: 503,
            message: "Affise API is not responding",
            data: null,
          };
        }
        console.error("❌ [DEBUG] Request setup error:", error.message);
        throw {
          status: 500,
          message: error.message,
          data: null,
        };
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
   * Get offers (Affiliate API by default)
   * Endpoint: GET /{version}/partner/offers
   * @param {Object} queryParams
   * @param {Object} options
   * @param {boolean} options.admin - Use admin offers endpoint when true
   * @returns {Promise<Object>}
   */
  async getOffers(queryParams = {}, options = {}) {
    console.log("\n🟢 ========== AFFISE SERVICE getOffers ==========");
    console.log("🟢 [SERVICE] Method called at:", new Date().toISOString());
    console.log("🟢 [SERVICE] Configuration check:");
    console.log("🟢 [SERVICE] - Base URL:", this.baseURL);
    console.log("🟢 [SERVICE] - API Version:", this.apiVersion);
    console.log("🟢 [SERVICE] - API Key present:", !!this.apiKey);
    console.log("🟢 [SERVICE] - API Key length:", this.apiKey?.length || 0);
    console.log("🟢 [SERVICE] - Is configured:", this.isConfigured());

    if (!this.isConfigured()) {
      console.warn("⚠️ [SERVICE] Affise service is NOT configured!");
      console.warn("⚠️ [SERVICE] Missing:", {
        baseURL: !this.baseURL,
        apiKey: !this.apiKey,
      });
      console.log(
        "🟢 [SERVICE] Returning empty result due to misconfiguration",
      );
      console.log("🟢 ===========================================\n");
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

    console.log("🟢 [SERVICE] Request details:");
    console.log("🟢 [SERVICE] - Endpoint:", endpoint);
    console.log("🟢 [SERVICE] - Full URL:", `${this.baseURL}${endpoint}`);
    console.log(
      "🟢 [SERVICE] - Query params:",
      JSON.stringify(queryParams, null, 2),
    );
    console.log("🟢 [SERVICE] - Options:", JSON.stringify(options, null, 2));
    console.log("🟢 [SERVICE] - Using admin endpoint:", options.admin || false);

    try {
      const response = await this.client.get(endpoint, { params: queryParams });

      console.log("🟢 [SERVICE] Response received:");
      console.log("🟢 [SERVICE] - Status:", response.status);
      console.log("🟢 [SERVICE] - Status text:", response.statusText);
      console.log(
        "🟢 [SERVICE] - Response headers:",
        JSON.stringify(response.headers, null, 2),
      );
      console.log(
        "🟢 [SERVICE] - Response data keys:",
        Object.keys(response.data || {}),
      );
      console.log(
        "🟢 [SERVICE] - Full response data:",
        JSON.stringify(response.data, null, 2).substring(0, 1000),
      );

      const offers =
        response.data?.offers ||
        response.data?.data ||
        response.data?.results ||
        [];

      console.log("🟢 [SERVICE] Extracted offers:");
      console.log(
        "🟢 [SERVICE] - From response.data.offers:",
        response.data?.offers?.length || 0,
      );
      console.log(
        "🟢 [SERVICE] - From response.data.data:",
        response.data?.data?.length || 0,
      );
      console.log(
        "🟢 [SERVICE] - From response.data.results:",
        response.data?.results?.length || 0,
      );
      console.log("🟢 [SERVICE] - Final offers array length:", offers.length);

      if (offers.length > 0) {
        console.log(
          "🟢 [SERVICE] - First offer sample:",
          JSON.stringify(offers[0], null, 2).substring(0, 500),
        );
      } else {
        console.warn("⚠️ [SERVICE] No offers found in response!");
        console.warn("⚠️ [SERVICE] Response structure:", {
          hasOffers: !!response.data?.offers,
          hasData: !!response.data?.data,
          hasResults: !!response.data?.results,
          topLevelKeys: Object.keys(response.data || {}),
        });
      }

      const total =
        response.data?.count || response.data?.total || offers.length;
      console.log("🟢 [SERVICE] Total count:", total);
      console.log(
        "🟢 [SERVICE] - From response.data.count:",
        response.data?.count,
      );
      console.log(
        "🟢 [SERVICE] - From response.data.total:",
        response.data?.total,
      );
      console.log("🟢 [SERVICE] - Fallback to offers.length:", offers.length);

      const result = {
        success: true,
        data: offers,
        total: total,
        raw: response.data,
        timestamp: new Date().toISOString(),
      };

      console.log("🟢 [SERVICE] Final result:", {
        success: result.success,
        dataLength: result.data.length,
        total: result.total,
        hasRaw: !!result.raw,
      });
      console.log("🟢 ===========================================\n");

      return result;
    } catch (error) {
      const cfg = error.config || {};
      const fullUrl = buildFullUrl(cfg.baseURL, cfg.url, cfg.params);
      const status = error.status ?? error.response?.status;
      const affiseBody = error.data ?? error.response?.data;

      console.error(
        "\n❌ ========== AFFISE SERVICE ERROR (getOffers) ==========",
      );
      console.error("❌ [SERVICE] Time:", new Date().toISOString());
      console.error("❌ [SERVICE] Message:", error.message);
      console.error("❌ [SERVICE] HTTP status:", status);
      console.error("❌ [SERVICE] Affise response body:", affiseBody);

      if (status === 403 || status === 401) {
        console.error(
          "🔴 [getOffers] Token rejected. Affise response:",
          JSON.stringify(affiseBody, null, 2),
        );
        console.error("🔴 [getOffers] Rejection reason:", error.message);
      }

      console.error("❌ [SERVICE] Request URL that failed:", fullUrl);
      console.error(
        "❌ [SERVICE] Request params:",
        JSON.stringify(cfg.params, null, 2),
      );
      console.error(
        "❌ [SERVICE] API-Key in params:",
        cfg.params ? "API-Key" in cfg.params : "N/A",
      );
      if (this.debug) {
        console.error(
          "❌ [SERVICE] Full error object:",
          JSON.stringify(
            {
              message: error.message,
              status: error.status,
              data: error.data,
              responseStatus: error.response?.status,
              responseData: error.response?.data,
              configUrl: cfg.url,
              configMethod: cfg.method,
            },
            null,
            2,
          ),
        );
      }
      console.error("❌ ===========================================\n");
      throw error;
    }
  }

  /**
   * Get custom statistics
   * Endpoint: GET /{version}/stats/custom
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getStatsCustom(queryParams = {}) {
    console.log(
      "🟢 [AFFISE] getStatsCustom called, params:",
      JSON.stringify(queryParams, null, 2),
    );
    if (!this.isConfigured()) {
      console.error("❌ [AFFISE] getStatsCustom: not configured");
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/custom`;
    try {
      const response = await this.client.get(endpoint, { params: queryParams });
      console.log(
        "🟢 [AFFISE] getStatsCustom success, status:",
        response.status,
      );
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(
        "❌ [AFFISE] getStatsCustom error:",
        err.message,
        "status:",
        err.status ?? err.response?.status,
        "data:",
        err.response?.data,
      );
      throw err;
    }
  }

  /**
   * Get conversions
   * Endpoint: GET /{version}/stats/conversions
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getConversions(queryParams = {}) {
    console.log(
      "🟢 [AFFISE] getConversions called, params:",
      JSON.stringify(queryParams, null, 2),
    );
    if (!this.isConfigured()) {
      console.error("❌ [AFFISE] getConversions: not configured");
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/conversions`;
    try {
      const response = await this.client.get(endpoint, { params: queryParams });
      console.log(
        "🟢 [AFFISE] getConversions success, status:",
        response.status,
      );
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(
        "❌ [AFFISE] getConversions error:",
        err.message,
        "status:",
        err.status ?? err.response?.status,
        "data:",
        err.response?.data,
      );
      throw err;
    }
  }

  /**
   * Get clicks
   * Endpoint: GET /{version}/stats/clicks
   * @param {Object} queryParams
   * @returns {Promise<Object>}
   */
  async getClicks(queryParams = {}) {
    console.log(
      "🟢 [AFFISE] getClicks called, params:",
      JSON.stringify(queryParams, null, 2),
    );
    if (!this.isConfigured()) {
      console.error("❌ [AFFISE] getClicks: not configured");
      throw {
        status: 500,
        message: "Affise API is not properly configured",
        data: null,
      };
    }

    const endpoint = `/${this.apiVersion}/stats/clicks`;
    try {
      const response = await this.client.get(endpoint, { params: queryParams });
      console.log("🟢 [AFFISE] getClicks success, status:", response.status);
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error(
        "❌ [AFFISE] getClicks error:",
        err.message,
        "status:",
        err.status ?? err.response?.status,
        "data:",
        err.response?.data,
      );
      throw err;
    }
  }

  /**
   * Health check for Affise API
   * @returns {Promise<Object>}
   */
  async healthCheck() {
    console.log("🟢 [AFFISE] healthCheck called");
    const configured = this.isConfigured();
    if (!configured) {
      console.error(
        "❌ [AFFISE] healthCheck: not configured (missing BASE_URL or API_KEY)",
      );
      return {
        status: "misconfigured",
        configured: false,
        error: "Missing Affise config (BASE_URL or API_KEY)",
      };
    }

    try {
      const today = new Date().toISOString().slice(0, 10);
      const params = { date_from: today, date_to: today, limit: 1 };
      console.log("🟢 [AFFISE] healthCheck request params:", params);
      const response = await this.client.get(
        `/${this.apiVersion}/stats/conversions`,
        { params },
      );
      console.log("🟢 [AFFISE] healthCheck success, status:", response.status);

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
      const status = error.status || error?.response?.status;
      console.error(
        "❌ [AFFISE] healthCheck error:",
        error.message,
        "httpStatus:",
        status,
        "data:",
        error.response?.data,
      );
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

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
    this.possibleBaseURLs = [
      config.EVERFLOW_BASE_URL
    ].filter(Boolean); // Remove undefined/null values
    
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
        if (this.apiKey) {
          config.headers["X-Eflow-API-Key"] = this.apiKey;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

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
            message: "Everflow API is not responding",
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
    return !!(this.baseURL && this.apiKey);
  }

  /**
   * Get all postbacks/offers (legacy method name - delegates to getOffers)
   * Endpoint: GET /v1/affiliates/alloffers
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
   * Endpoint: GET /v1/affiliates/alloffers (with network_offer_id filter)
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
      // Everflow API uses query parameters, not path parameters
      // Filter by network_offer_id
      const endpoint = `/v1/affiliates/alloffers`;
      const response = await this.client.get(endpoint, {
        params: {
          network_offer_id: offerId,
        },
      });

      // Everflow returns an array of offers, find the matching one
      let offers = [];
      if (response.data?.offers && Array.isArray(response.data.offers)) {
        offers = response.data.offers;
      } else if (Array.isArray(response.data)) {
        offers = response.data;
      }

      // Find the offer with matching network_offer_id
      const offer = offers.find(
        (o) =>
          o.network_offer_id?.toString() === offerId.toString() ||
          o.offer_id?.toString() === offerId.toString() ||
          o.id?.toString() === offerId.toString()
      );

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
   * Get offers - Uses the correct Everflow endpoint
   * Endpoint: GET /v1/affiliates/alloffers
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
      const endpoint = "/v1/affiliates/alloffers";
      
      // Extract userId if provided (for user-specific tracking)
      const { userId, ...apiParams } = queryParams;
      
      // If userId is provided, we'll add it to click URLs later
      // Everflow uses sub_id1, sub_id2, etc. for user tracking in postbacks
      const response = await this.client.get(endpoint, { params: apiParams });

      // Everflow returns: { "offers": [...], "paging": {...} }
      let offers = [];
      if (response.data?.offers && Array.isArray(response.data.offers)) {
        offers = response.data.offers;
      } else if (Array.isArray(response.data)) {
        offers = response.data;
      }

      // Normalize offers and add user-specific tracking if userId provided
      const normalizedOffers = offers.map((offer) => {
        const normalized = this.normalizeOffer(offer);
        
        // If userId provided, add it to click URL for tracking
        // Everflow uses sub_id1 parameter for user tracking in postbacks
        if (queryParams.userId && normalized.clickUrl) {
          try {
            const url = new URL(normalized.clickUrl);
            url.searchParams.set("sub_id1", queryParams.userId);
            normalized.clickUrl = url.toString();
            normalized.deepLink = url.toString();
          } catch (e) {
            // If URL parsing fails, append as query param
            const separator = normalized.clickUrl.includes("?") ? "&" : "?";
            normalized.clickUrl = `${normalized.clickUrl}${separator}sub_id1=${queryParams.userId}`;
            normalized.deepLink = normalized.clickUrl;
          }
        }
        
        return normalized;
      });

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
   * Everflow API returns: { network_offer_id, network_id, name, offer_status, network_category_id, ... }
   * @param {Object} offer - Raw offer from Everflow API
   * @returns {Object} Normalized offer
   */
  normalizeOffer(offer) {
    return {
      ...offer, // Preserve all original Everflow fields
      // Map to our standardized fields
      offerId: offer.network_offer_id?.toString() || offer.offer_id?.toString() || offer.id?.toString() || "",
      externalId: offer.network_offer_id?.toString() || offer.offer_id?.toString() || offer.id?.toString() || "",
      title: offer.name || offer.title || "Unknown Offer",
      description: offer.html_description || offer.description || offer.desc || "",
      clickUrl: offer.preview_url || offer.tracking_link || offer.click_url || "",
      deepLink: offer.preview_url || offer.tracking_link || offer.deep_link || "",
      category: offer.network_category_id?.toString() || offer.category || offer.category_name || "other",
      offerType: this.determineOfferType(offer),
      provider: "everflow",
      sdkProvider: "everflow",
      // Rewards - Everflow may have payout/revenue fields in separate endpoints
      coinReward: offer.payout || offer.revenue || offer.reward_amount || 0,
      estimatedTime: offer.estimated_time || offer.duration || offer.loi || 5,
      // Status mapping
      status: offer.offer_status === "active" ? "live" : (offer.offer_status || "live"),
      isAvailable: offer.offer_status === "active",
      // Metadata
      networkId: offer.network_id?.toString() || offer.networkId?.toString() || "",
      advertiserId: offer.advertiser_id?.toString() || offer.advertiserId?.toString() || "",
      // Additional Everflow-specific fields
      currency: offer.currency_id || offer.currency || "USD",
      thumbnailUrl: offer.thumbnail_url || "",
      visibility: offer.visibility || "public",
      // Requirements
      requirements: {
        minAge: offer.min_age || offer.minAge || 18,
        countries: offer.countries || offer.target_countries || [],
      },
      // Timestamps
      createdAt: offer.date_live_until || offer.created_at || offer.createdAt,
      updatedAt: offer.updated_at || offer.updatedAt,
    };
  }

  /**
   * Determine offer type from Everflow offer data
   * @param {Object} offer - Offer data
   * @returns {string} Offer type
   */
  determineOfferType(offer) {
    // Check explicit type field
    if (offer.type) {
      return offer.type.toLowerCase();
    }

    // Check category
    const category = (offer.category || offer.category_name || "").toLowerCase();
    if (category.includes("survey")) return "survey";
    if (category.includes("shopping") || category.includes("retail")) return "shopping";
    if (category.includes("receipt") || category.includes("magic")) return "magic_receipt";
    if (category.includes("cashback")) return "cashback";
    if (category.includes("game")) return "game";

    // Check name/description
    const name = (offer.name || offer.title || "").toLowerCase();
    const desc = (offer.description || "").toLowerCase();
    
    if (name.includes("survey") || desc.includes("survey")) return "survey";
    if (name.includes("shop") || desc.includes("shop")) return "shopping";
    if (name.includes("receipt") || desc.includes("receipt")) return "magic_receipt";
    if (name.includes("cashback") || desc.includes("cashback")) return "cashback";

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

// Export singleton instance
module.exports = new EverflowService();

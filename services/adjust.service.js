/**
 * Adjust S2S API Service
 * Handles server-to-server API calls to Adjust for event tracking
 * Documentation: https://dev.adjust.com/en/api/s2s-api
 * @module services/adjust
 */

const axios = require('axios');
const config = require('../config/config');

class AdjustService {
  constructor() {
    this.baseURL = 'https://s2s.adjust.com';
    this.apiToken = config.ADJUST_API_TOKEN;
    this.appToken = config.ADJUST_APP_TOKEN;

    // Create axios instance with default config
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    
    // Add Authorization header only if API token is available
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: headers,
      timeout: 30000 // 30 seconds timeout
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const errorData = {
            status: error.response.status,
            message: error.response.data?.error || error.message,
            data: error.response.data
          };
          throw errorData;
        } else if (error.request) {
          throw {
            status: 503,
            message: 'Adjust API is not responding',
            data: null
          };
        } else {
          throw {
            status: 500,
            message: error.message,
            data: null
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
    if (!this.isConfigured()) {
      throw {
        status: 500,
        message: 'Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.',
        data: null
      };
    }

    // Validate required fields
    if (!eventData.event_token) {
      throw {
        status: 400,
        message: 'event_token is required for Adjust events',
        data: null
      };
    }

    try {
      // Ensure required fields
      const payload = {
        app_token: eventData.app_token || this.appToken,
        event_token: eventData.event_token,
        s2s: '1', // Required to indicate S2S request
        ...eventData
      };

      // Remove undefined values
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const response = await this.client.post('/event', payload);
      
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error('Adjust sendEvent error:', error);
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
        message: 'Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.',
        data: null
      };
    }

    // Validate required fields
    if (revenueData.revenue === undefined || revenueData.revenue === null) {
      throw {
        status: 400,
        message: 'revenue is required for ad revenue tracking',
        data: null
      };
    }
    if (!revenueData.currency) {
      throw {
        status: 400,
        message: 'currency is required for ad revenue tracking',
        data: null
      };
    }
    if (!revenueData.ad_revenue_network) {
      throw {
        status: 400,
        message: 'ad_revenue_network is required for ad revenue tracking',
        data: null
      };
    }

    try {
      const payload = {
        app_token: revenueData.app_token || this.appToken,
        ...revenueData
      };

      // Remove undefined values
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const response = await this.client.post('/ad_revenue', payload);
      
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error('Adjust sendAdRevenue error:', error);
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
        message: 'Adjust API is not properly configured. Missing API_TOKEN or APP_TOKEN.',
        data: null
      };
    }

    try {
      const payload = {
        app_token: sessionData.app_token || this.appToken,
        ...sessionData
      };

      // Remove undefined values
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      const response = await this.client.post('/session', payload);
      
      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      console.error('Adjust sendSession error:', error);
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
      currency = 'USD',
      deviceIds = {},
      callbackParams = {}
    } = params;

    return this.sendEvent({
      event_token: eventToken,
      revenue: revenue,
      currency: currency,
      ...deviceIds,
      callback_params: typeof callbackParams === 'string' 
        ? callbackParams 
        : JSON.stringify(callbackParams)
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
    const {
      userId,
      eventToken,
      deviceIds = {},
      callbackParams = {}
    } = params;

    return this.sendEvent({
      event_token: eventToken,
      ...deviceIds,
      callback_params: typeof callbackParams === 'string' 
        ? callbackParams 
        : JSON.stringify(callbackParams)
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
        status: 'misconfigured',
        configured: false,
        error: 'Missing Adjust config (API_TOKEN or APP_TOKEN)'
      };
    }

    // Adjust doesn't have a health check endpoint, so we'll just verify config
    return {
      status: 'ok',
      configured: true,
      message: 'Adjust S2S API is configured'
    };
  }
}

// Export singleton instance
module.exports = new AdjustService();


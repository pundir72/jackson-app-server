const axios = require('axios');

// Tremendous configuration
const TREMENDOUS_CONFIG = {
  baseUrl: process.env.TREMENDOUS_BASE_URL || 'https://api.tremendous.com',
  apiKey: process.env.TREMENDOUS_API_KEY,
  appId: process.env.TREMENDOUS_APP_ID,
  timeout: 30000 // 30 seconds
};

/**
 * Tremendous SDK for global payouts and rewards
 */
class TremendousSDK {
  constructor() {
    this.apiKey = TREMENDOUS_CONFIG.apiKey;
    this.appId = TREMENDOUS_CONFIG.appId;
    this.baseUrl = TREMENDOUS_CONFIG.baseUrl;
    
    if (!this.apiKey || !this.appId) {
      console.warn('Tremendous credentials not configured. Payout system will be disabled.');
    }
  }

  /**
   * Create a payout/reward
   * @param {Object} params - Payout parameters
   * @param {string} params.userId - User ID
   * @param {number} params.amount - Amount in cents
   * @param {string} params.currency - Currency code
   * @param {Object} params.recipient - Recipient information
   * @param {string} params.rewardType - Type of reward (gift_card, cash, etc.)
   * @returns {Object} Payout result
   */
  async createPayout(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const { userId, amount, currency, recipient, rewardType = 'gift_card' } = params;

      const requestData = {
        app_id: this.appId,
        user_id: userId,
        amount: amount, // Amount in cents
        currency: currency,
        reward_type: rewardType,
        recipient: {
          email: recipient.email,
          name: recipient.name,
          phone: recipient.phone || null,
          address: recipient.address || null
        },
        metadata: {
          source: 'jackson_rewards',
          user_id: userId,
          created_at: new Date().toISOString()
        },
        delivery: {
          method: 'email',
          send_email: true
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/payouts/create`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        payoutId: response.data.payout_id,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        rewardType: response.data.reward_type,
        deliveryMethod: response.data.delivery_method,
        estimatedDelivery: response.data.estimated_delivery,
        trackingUrl: response.data.tracking_url
      };

    } catch (error) {
      console.error('Tremendous create payout error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payout status
   * @param {string} payoutId - Payout ID
   * @returns {Object} Payout status
   */
  async getPayoutStatus(payoutId) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/payouts/${payoutId}/status`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        payoutId: response.data.payout_id,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        rewardType: response.data.reward_type,
        deliveredAt: response.data.delivered_at,
        claimedAt: response.data.claimed_at,
        expiresAt: response.data.expires_at,
        trackingUrl: response.data.tracking_url
      };

    } catch (error) {
      console.error('Tremendous get payout status error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user payout history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Payout history
   */
  async getUserPayouts(userId, options = {}) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured',
          payouts: []
        };
      }

      const { page = 1, limit = 20, startDate, endDate, status } = options;

      const queryParams = new URLSearchParams({
        app_id: this.appId,
        user_id: userId,
        page: page.toString(),
        limit: limit.toString()
      });

      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);
      if (status) queryParams.append('status', status);

      const response = await axios.get(
        `${this.baseUrl}/v1/payouts/history?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        payouts: response.data.payouts.map(payout => ({
          id: payout.payout_id,
          amount: payout.amount,
          currency: payout.currency,
          rewardType: payout.reward_type,
          status: payout.status,
          createdAt: payout.created_at,
          deliveredAt: payout.delivered_at,
          claimedAt: payout.claimed_at,
          expiresAt: payout.expires_at,
          trackingUrl: payout.tracking_url
        })),
        pagination: {
          page: response.data.page,
          limit: response.data.limit,
          total: response.data.total,
          pages: response.data.pages
        },
        totalAmount: response.data.total_amount
      };

    } catch (error) {
      console.error('Tremendous get user payouts error:', error.message);
      return {
        success: false,
        error: error.message,
        payouts: []
      };
    }
  }

  /**
   * Get available reward types
   * @param {string} country - Country code
   * @returns {Object} Available reward types
   */
  async getRewardTypes(country = 'US') {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured',
          rewardTypes: []
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/rewards/types`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          params: {
            app_id: this.appId,
            country: country
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        rewardTypes: response.data.reward_types.map(type => ({
          id: type.type_id,
          name: type.name,
          description: type.description,
          minAmount: type.min_amount,
          maxAmount: type.max_amount,
          currency: type.currency,
          isAvailable: type.is_available,
          deliveryTime: type.delivery_time_hours,
          fees: type.fees || 0
        }))
      };

    } catch (error) {
      console.error('Tremendous get reward types error:', error.message);
      return {
        success: false,
        error: error.message,
        rewardTypes: []
      };
    }
  }

  /**
   * Get supported currencies
   * @returns {Object} Supported currencies
   */
  async getSupportedCurrencies() {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured',
          currencies: []
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/currencies/supported`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          params: {
            app_id: this.appId
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        currencies: response.data.currencies.map(currency => ({
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
          isSupported: currency.is_supported,
          minAmount: currency.min_amount,
          maxAmount: currency.max_amount
        }))
      };

    } catch (error) {
      console.error('Tremendous get currencies error:', error.message);
      return {
        success: false,
        error: error.message,
        currencies: []
      };
    }
  }

  /**
   * Cancel a payout
   * @param {string} payoutId - Payout ID
   * @returns {Object} Cancellation result
   */
  async cancelPayout(payoutId) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/v1/payouts/${payoutId}/cancel`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        payoutId: response.data.payout_id,
        status: response.data.status,
        cancelledAt: response.data.cancelled_at
      };

    } catch (error) {
      console.error('Tremendous cancel payout error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payout analytics
   * @param {Object} options - Analytics options
   * @returns {Object} Payout analytics
   */
  async getPayoutAnalytics(options = {}) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured',
          analytics: null
        };
      }

      const { startDate, endDate, groupBy = 'day' } = options;

      const queryParams = new URLSearchParams({
        app_id: this.appId,
        group_by: groupBy
      });

      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);

      const response = await axios.get(
        `${this.baseUrl}/v1/analytics/payouts?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        analytics: {
          totalPayouts: response.data.total_payouts,
          totalAmount: response.data.total_amount,
          averageAmount: response.data.average_amount,
          successRate: response.data.success_rate,
          topRewardTypes: response.data.top_reward_types,
          payoutsByDay: response.data.payouts_by_day || [],
          payoutsByCountry: response.data.payouts_by_country || []
        }
      };

    } catch (error) {
      console.error('Tremendous get analytics error:', error.message);
      return {
        success: false,
        error: error.message,
        analytics: null
      };
    }
  }

  /**
   * Verify payout callback
   * @param {Object} params - Callback parameters
   * @param {string} params.payoutId - Payout ID
   * @param {string} params.status - Payout status
   * @param {string} params.signature - Callback signature
   * @returns {Object} Verification result
   */
  async verifyCallback(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Tremendous not configured',
          isValid: false
        };
      }

      const { payoutId, status, signature } = params;

      const requestData = {
        app_id: this.appId,
        payout_id: payoutId,
        status: status,
        signature: signature,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/payouts/verify-callback`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        isValid: response.data.is_valid,
        payoutId: response.data.payout_id,
        status: response.data.status,
        updatedAt: response.data.updated_at
      };

    } catch (error) {
      console.error('Tremendous verify callback error:', error.message);
      return {
        success: false,
        error: error.message,
        isValid: false
      };
    }
  }
}

// Create singleton instance
const tremendous = new TremendousSDK();

module.exports = tremendous;


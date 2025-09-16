const axios = require('axios');

// Tremendous configuration
const TREMENDOUS_CONFIG = {
  baseUrl: process.env.TREMENDOUS_BASE_URL || 'https://testflight.tremendous.com/api/v2',
  apiKey: process.env.TREMENDOUS_API_KEY,
  timeout: 30000 // 30 seconds
};

/**
 * Tremendous SDK for global payouts and rewards (API v2)
 */
class TremendousSDK {
  constructor() {
    this.apiKey = TREMENDOUS_CONFIG.apiKey;
    this.baseUrl = TREMENDOUS_CONFIG.baseUrl;
    
    if (!this.apiKey) {
      console.warn('Tremendous API key not configured. Payout system will be disabled.');
    }
  }

  /**
   * Get default headers for API requests
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'accept': 'application/json',
      'content-type': 'application/json'
    };
  }

  /**
   * Create an order (payout/reward)
   * @param {Object} params - Order parameters
   * @param {string} params.externalId - External ID for tracking
   * @param {string} params.fundingSourceId - Funding source ID
   * @param {Object} params.reward - Reward details
   * @param {Object} params.reward.value - Reward value
   * @param {number} params.reward.value.denomination - Amount
   * @param {string} params.reward.value.currency_code - Currency code
   * @param {Object} params.reward.delivery - Delivery method
   * @param {string} params.reward.delivery.method - Delivery method (LINK, EMAIL, etc.)
   * @param {Object} params.reward.recipient - Recipient information
   * @param {string} params.reward.recipient.name - Recipient name
   * @param {string} params.reward.recipient.email - Recipient email
   * @param {Array} params.reward.products - Product IDs
   * @returns {Object} Order result
   */
  async createOrder(params) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      // Handle both old and new parameter structures
      let requestData;
      
      if (params.external_id && params.payment && params.reward) {
        // New Tremendous API v2 structure - pass through directly
        requestData = params;
      } else {
        // Old structure for backward compatibility
        const { external_id, funding_source_id, reward } = params;
        requestData = {
          payment: {
            funding_source_id: funding_source_id
          },
          external_id: external_id,
          reward: {
            value: {
              denomination: reward.value.denomination,
              currency_code: reward.value.currency_code
            },
            delivery: {
              method: reward.delivery.method
            },
            recipient: {
              name: reward.recipient.name,
              email: reward.recipient.email
            },
            products: reward.products
          }
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/orders`,
        requestData,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous create order error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get all orders
   * @param {Object} options - Query options
   * @returns {Object} Orders list
   */
  async getOrders(options = {}) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const queryParams = new URLSearchParams();
      if (options.external_id) queryParams.append('external_id', options.external_id);
      if (options.status) queryParams.append('status', options.status);
      if (options.limit) queryParams.append('limit', options.limit);
      if (options.offset) queryParams.append('offset', options.offset);

      const url = queryParams.toString() ? 
        `${this.baseUrl}/orders?${queryParams}` : 
        `${this.baseUrl}/orders`;

      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: TREMENDOUS_CONFIG.timeout
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get orders error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific order by ID
   * @param {string} orderId - Order ID
   * @returns {Object} Order details
   */
  async getOrder(orderId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/orders/${orderId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get order error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get funding sources
   * @returns {Object} Funding sources list
   */
  async getFundingSources() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/funding_sources`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get funding sources error:', error.response?.data || error.message);
      
      // Handle 502 Bad Gateway or server errors
      if (error.response?.status === 502 || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Tremendous service temporarily unavailable (502 Bad Gateway). Please try again later.',
          fallback: {
            funding_sources: [
              {
                id: 'fallback-funding-source',
                name: 'Default Funding Source',
                type: 'credit_card',
                status: 'active'
              }
            ]
          }
        };
      }
      
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get all products
   * @returns {Object} Products list
   */
  async getProducts() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/products`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get products error:', error.response?.data || error.message);
      
      // Handle 502 Bad Gateway or server errors
      if (error.response?.status === 502 || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Tremendous service temporarily unavailable (502 Bad Gateway). Please try again later.',
          fallback: {
            products: [
              {
                id: 'fallback-product-1',
                name: 'Amazon Gift Card',
                description: 'Digital gift card for Amazon',
                category: 'gift_cards',
                brand: 'Amazon',
                currency_code: 'USD',
                min_value: { denomination: 5, currency_code: 'USD' },
                max_value: { denomination: 100, currency_code: 'USD' },
                status: 'active'
              },
              {
                id: 'fallback-product-2',
                name: 'PayPal Cash',
                description: 'Direct PayPal transfer',
                category: 'cash',
                brand: 'PayPal',
                currency_code: 'USD',
                min_value: { denomination: 10, currency_code: 'USD' },
                max_value: { denomination: 500, currency_code: 'USD' },
                status: 'active'
              }
            ]
          }
        };
      }
      
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific product by ID
   * @param {string} productId - Product ID
   * @returns {Object} Product details
   */
  async getProduct(productId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/products/${productId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get product error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Approve an order
   * @param {string} orderId - Order ID
   * @returns {Object} Approval result
   */
  async approveOrder(orderId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/order_approvals/${orderId}/approve`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous approve order error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Reject an order
   * @param {string} orderId - Order ID
   * @returns {Object} Rejection result
   */
  async rejectOrder(orderId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/order_approvals/${orderId}/reject`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous reject order error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get rewards
   * @returns {Object} Rewards list
   */
  async getRewards() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/rewards`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get rewards error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific reward by ID
   * @param {string} rewardId - Reward ID
   * @returns {Object} Reward details
   */
  async getReward(rewardId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/rewards/${rewardId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get reward error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Generate link for a reward
   * @param {string} rewardId - Reward ID
   * @returns {Object} Generated link result
   */
  async generateRewardLink(rewardId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/rewards/${rewardId}/generate_link`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous generate reward link error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Resend a reward
   * @param {string} rewardId - Reward ID
   * @returns {Object} Resend result
   */
  async resendReward(rewardId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/rewards/${rewardId}/resend`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous resend reward error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Cancel a reward
   * @param {string} rewardId - Reward ID
   * @returns {Object} Cancel result
   */
  async cancelReward(rewardId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/rewards/${rewardId}/cancel`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous cancel reward error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get all campaigns
   * @returns {Object} Campaigns list
   */
  async getCampaigns() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/campaigns`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get campaigns error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Create a campaign
   * @param {Object} campaignData - Campaign data
   * @returns {Object} Campaign creation result
   */
  async createCampaign(campaignData) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/campaigns`,
        campaignData,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous create campaign error:', error.response?.data?.errors?.payload || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific campaign by ID
   * @param {string} campaignId - Campaign ID
   * @returns {Object} Campaign details
   */
  async getCampaign(campaignId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/campaigns/${campaignId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get campaign error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Update a campaign
   * @param {string} campaignId - Campaign ID
   * @param {Object} campaignData - Updated campaign data
   * @returns {Object} Campaign update result
   */
  async updateCampaign(campaignId, campaignData) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.put(
        `${this.baseUrl}/campaigns/${campaignId}`,
        campaignData,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous update campaign error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific funding source by ID
   * @param {string} fundingSourceId - Funding source ID
   * @returns {Object} Funding source details
   */
  async getFundingSource(fundingSourceId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/funding_sources/${fundingSourceId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get funding source error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get all invoices
   * @param {Object} options - Query options
   * @returns {Object} Invoices list
   */
  async getInvoices(options = {}) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const queryParams = new URLSearchParams();
      if (options.offset) queryParams.append('offset', options.offset);
      if (options.limit) queryParams.append('limit', options.limit);

      const url = queryParams.toString() ? 
        `${this.baseUrl}/invoices?${queryParams}` : 
        `${this.baseUrl}/invoices`;

      const response = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: TREMENDOUS_CONFIG.timeout
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get invoices error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Create an invoice
   * @param {Object} invoiceData - Invoice data
   * @returns {Object} Invoice creation result
   */
  async createInvoice(invoiceData) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/invoices`,
        invoiceData,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous create invoice error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific invoice by ID
   * @param {string} invoiceId - Invoice ID
   * @returns {Object} Invoice details
   */
  async getInvoice(invoiceId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/invoices/${invoiceId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get invoice error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Delete an invoice
   * @param {string} invoiceId - Invoice ID
   * @returns {Object} Invoice deletion result
   */
  async deleteInvoice(invoiceId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.delete(
        `${this.baseUrl}/invoices/${invoiceId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous delete invoice error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get invoice PDF
   * @param {string} invoiceId - Invoice ID
   * @returns {Object} Invoice PDF result
   */
  async getInvoicePDF(invoiceId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/invoices/${invoiceId}/pdf`,
        {
          headers: {
            ...this.getHeaders(),
            'accept': 'application/pdf'
          },
          timeout: TREMENDOUS_CONFIG.timeout,
          responseType: 'arraybuffer'
        }
      );

      return {
        success: true,
        data: response.data,
        contentType: 'application/pdf'
      };

    } catch (error) {
      console.error('Tremendous get invoice PDF error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get invoice CSV
   * @param {string} invoiceId - Invoice ID
   * @returns {Object} Invoice CSV result
   */
  async getInvoiceCSV(invoiceId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/invoices/${invoiceId}/csv`,
        {
          headers: {
            ...this.getHeaders(),
            'accept': 'text/csv'
          },
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data,
        contentType: 'text/csv'
      };

    } catch (error) {
      console.error('Tremendous get invoice CSV error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get balance transactions
   * @returns {Object} Balance transactions result
   */
  async getBalanceTransactions() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/balance_transactions`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get balance transactions error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get all organizations
   * @returns {Object} Organizations list
   */
  async getOrganizations() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/organizations`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get organizations error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Create an organization
   * @param {Object} organizationData - Organization data
   * @returns {Object} Organization creation result
   */
  async createOrganization(organizationData) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/organizations`,
        organizationData,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous create organization error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Get specific organization by ID
   * @param {string} organizationId - Organization ID
   * @returns {Object} Organization details
   */
  async getOrganization(organizationId) {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/organizations/${organizationId}`,
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous get organization error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

  /**
   * Create API key for organization
   * @returns {Object} API key creation result
   */
  async createOrganizationAPIKey() {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'Tremendous not configured'
        };
      }

      const response = await axios.post(
        `${this.baseUrl}/organizations/create_api_key`,
        {},
        {
          headers: this.getHeaders(),
          timeout: TREMENDOUS_CONFIG.timeout
        }
      );

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('Tremendous create organization API key error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error || error.message
      };
    }
  }

}

// Create singleton instance
const tremendous = new TremendousSDK();

module.exports = tremendous;


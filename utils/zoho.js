const axios = require('axios');
const ZohoToken = require('../models/ZohoToken');

class ZohoService {
  constructor() {
    this.baseURL = 'https://desk.zoho.com/api';
    this.tokenURL = 'https://accounts.zoho.com/oauth/v2/token';
  }

  /**
   * Generate access token using authorization code
   * @param {string} code - Authorization code from Zoho
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @param {string} redirectUri - Redirect URI used in authorization
   * @param {string} userId - User ID who is creating the token
   * @returns {Promise<Object>} Token response
   */
  async generateToken(code, clientId, clientSecret, redirectUri, userId) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code
      });

      const response = await axios.post(this.tokenURL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;

      // Deactivate any existing active tokens for this client
      await ZohoToken.deactivateAllTokens(clientId);

      // Save new token to database
      const zohoToken = new ZohoToken({
        ...tokenData,
        client_id: clientId,
        client_secret: clientSecret,
        createdBy: userId
      });

      await zohoToken.save();

      return {
        success: true,
        message: 'Token generated successfully',
        data: zohoToken.getDisplayData()
      };

    } catch (error) {
      console.error('Error generating Zoho token:', error.response?.data || error.message);
      return {
        success: false,
        error: 'Failed to generate token',
        details: error.response?.data || error.message
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} Token response
   */
  async refreshToken(clientId, clientSecret) {
    try {
      // Find the active token for this client
      const existingToken = await ZohoToken.findActiveToken(clientId);
      
      if (!existingToken) {
        return {
          success: false,
          error: 'No active token found for this client'
        };
      }

      if (!existingToken.refresh_token) {
        return {
          success: false,
          error: 'No refresh token available'
        };
      }

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: existingToken.refresh_token
      });

      const response = await axios.post(this.tokenURL, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const tokenData = response.data;

      // Update existing token
      existingToken.access_token = tokenData.access_token;
      existingToken.expires_in = tokenData.expires_in;
      existingToken.scope = tokenData.scope || existingToken.scope;
      existingToken.api_domain = tokenData.api_domain || existingToken.api_domain;
      existingToken.last_refreshed = new Date();
      existingToken.is_active = true;

      // Manually update expires_at since pre-save middleware might not trigger
      existingToken.expires_at = new Date(Date.now() + (tokenData.expires_in * 1000));

      await existingToken.save();

      return {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          access_token: existingToken.access_token,
          refresh_token: existingToken.refresh_token,
          token_type: existingToken.token_type,
          expires_in: existingToken.expires_in,
          scope: existingToken.scope,
          api_domain: existingToken.api_domain
        }
      };

    } catch (error) {
      console.error('Error refreshing Zoho token:', error.response?.data || error.message);
      return {
        success: false,
        error: 'Failed to refresh token',
        details: error.response?.data || error.message
      };
    }
  }

  /**
   * Get valid access token (refresh if needed)
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} Token response
   */
  async getValidToken(clientId, clientSecret) {
    try {
      const existingToken = await ZohoToken.findActiveToken(clientId);
      
      if (!existingToken) {
        return {
          success: false,
          error: 'No token found for this client. Please generate a new token first.'
        };
      }

      // Check if token is expired or expiring soon (within 5 minutes)
      if (existingToken.isExpired() || existingToken.isExpiringSoon(5)) {
        console.log('Token is expired or expiring soon, refreshing...');
        return await this.refreshToken(clientId, clientSecret);
      }

      return {
        success: true,
        message: 'Valid token found',
        data: existingToken.getDisplayData()
      };

    } catch (error) {
      console.error('Error getting valid token:', error);
      return {
        success: false,
        error: 'Failed to get valid token',
        details: error.message
      };
    }
  }

  /**
   * Make authenticated API call to Zoho
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {string} method - HTTP method
   * @param {Object} data - Request data
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} API response
   */
  async makeAPICall(endpoint, method = 'GET', data = null, clientId, clientSecret) {
    try {
      // Get valid token
      const tokenResult = await this.getValidToken(clientId, clientSecret);
      
      if (!tokenResult.success) {
        return tokenResult;
      }

      const token = await ZohoToken.findActiveToken(clientId);
      const url = `${this.baseURL}${endpoint}`;

      const config = {
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        }
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      }

      const response = await axios(config);

      return {
        success: true,
        data: response.data,
        status: response.status
      };

    } catch (error) {
      console.error('Error making Zoho API call:', error.response?.data || error.message);
      return {
        success: false,
        error: 'API call failed',
        details: error.response?.data || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Get all tickets from Zoho Desk
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tickets response
   */
  async getTickets(clientId, clientSecret, options = {}) {
    const { limit = 20, from = 0, sortBy = 'createdTime' } = options;
    
    const endpoint = `/v1/tickets?limit=${limit}&from=${from}&sortBy=${sortBy}`;
    
    return await this.makeAPICall(endpoint, 'GET', null, clientId, clientSecret);
  }

  /**
   * Get specific ticket by ID
   * @param {string} ticketId - Ticket ID
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} Ticket response
   */
  async getTicket(ticketId, clientId, clientSecret) {
    const endpoint = `/v1/tickets/${ticketId}`;
    
    return await this.makeAPICall(endpoint, 'GET', null, clientId, clientSecret);
  }

  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} Create response
   */
  async createTicket(ticketData, clientId, clientSecret) {
    const endpoint = '/v1/tickets';
    
    return await this.makeAPICall(endpoint, 'POST', ticketData, clientId, clientSecret);
  }

  /**
   * Update ticket
   * @param {string} ticketId - Ticket ID
   * @param {Object} updateData - Update data
   * @param {string} clientId - Zoho client ID
   * @param {string} clientSecret - Zoho client secret
   * @returns {Promise<Object>} Update response
   */
  async updateTicket(ticketId, updateData, clientId, clientSecret) {
    const endpoint = `/v1/tickets/${ticketId}`;
    
    return await this.makeAPICall(endpoint, 'PATCH', updateData, clientId, clientSecret);
  }

  /**
   * Get token status and information
   * @param {string} clientId - Zoho client ID
   * @returns {Promise<Object>} Token status
   */
  async getTokenStatus(clientId) {
    try {
      const token = await ZohoToken.findActiveToken(clientId);
      
      if (!token) {
        return {
          success: false,
          error: 'No token found for this client'
        };
      }

      return {
        success: true,
        data: {
          ...token.getDisplayData(),
          is_expired: token.isExpired(),
          is_expiring_soon: token.isExpiringSoon(),
          time_until_expiry: token.expires_at - new Date()
        }
      };

    } catch (error) {
      console.error('Error getting token status:', error);
      return {
        success: false,
        error: 'Failed to get token status',
        details: error.message
      };
    }
  }

  /**
   * Revoke token
   * @param {string} clientId - Zoho client ID
   * @returns {Promise<Object>} Revoke response
   */
  async revokeToken(clientId) {
    try {
      const result = await ZohoToken.deactivateAllTokens(clientId);
      
      return {
        success: true,
        message: 'Token revoked successfully',
        data: { modifiedCount: result.modifiedCount }
      };

    } catch (error) {
      console.error('Error revoking token:', error);
      return {
        success: false,
        error: 'Failed to revoke token',
        details: error.message
      };
    }
  }
}

module.exports = new ZohoService();



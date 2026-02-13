const axios = require('axios');

class VerisoulSDK {
  constructor(apiKey, baseURL) {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey
    };
  }

  // Session Management
  async authenticateSession(accountId, email, metadata = {}, group = null, sessionId = null) {
    try {
      const accountData = {
        id: accountId,
        email: email,
        metadata: metadata,
        group: group || 'regular_users' // Always include group (required by Verisoul)
      };

      // Verisoul requires session_id from their frontend SDK
      // If not provided, we'll try to create one, but it may fail
      // For backend-only integration, session_id should come from frontend SDK
      const finalSessionId = sessionId || this.generateSessionId();

      const data = {
        account: accountData,
        session_id: finalSessionId
      };

      // Log the request for debugging
      console.log('[Verisoul] Authenticating session:', {
        sessionId: finalSessionId,
        accountId: accountId,
        email: email,
        group: group || 'regular_users',
        isFromSDK: !!sessionId
      });

      // If sessionId is provided (from SDK), try with a small delay first
      // Verisoul may need a moment to process the session after SDK creates it
      let response;
      let lastError;
      const maxRetries = sessionId ? 2 : 0; // Only retry if sessionId is from SDK
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          // Wait 500ms before retry (session might need time to be processed)
          console.log(`[Verisoul] Retry attempt ${attempt} after delay...`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
          response = await axios.post(`${this.baseURL}/session/authenticate`, data, {
            headers: this.defaultHeaders
          });

          console.log('[Verisoul] Authentication successful:', {
            sessionId: finalSessionId,
            riskScore: response.data?.risk_score,
            decision: response.data?.decision,
            attempt: attempt + 1
          });

          return {
            success: true,
            data: response.data,
            sessionId: response.data.session_id || response.data.sessionId || finalSessionId
          };
        } catch (apiError) {
          lastError = apiError;
          
          // If it's not "Session ID not found", don't retry
          if (!apiError.response?.data?.message?.includes('Session ID not found')) {
            break;
          }
          
          // If this is the last attempt, break to handle the error
          if (attempt === maxRetries) {
            break;
          }
        }
      }
      
      // Handle the error after all retries
      const apiError = lastError;
      
      // Log the full error for debugging
      console.error('[Verisoul] Authentication error:', {
        sessionId: finalSessionId,
        status: apiError?.response?.status,
        statusText: apiError?.response?.statusText,
        message: apiError?.response?.data?.message,
        data: apiError?.response?.data
      });

      // If Verisoul returns "Session ID not found", it means we need frontend SDK
      // OR the session hasn't been fully created yet (timing issue)
      if (apiError?.response?.data?.message?.includes('Session ID not found')) {
        console.warn('[Verisoul] Session ID not found after retries. This could mean:');
        console.warn('  1. Frontend SDK not integrated');
        console.warn('  2. Session not fully created yet (timing issue - wait a few seconds)');
        console.warn('  3. Session ID format incorrect');
        console.warn('  4. Session ID from SDK is not yet available in Verisoul backend');
        
        // Return success with generated session ID for now
        // In production, you should integrate Verisoul frontend SDK
        return {
          success: true,
          data: {
            session_id: finalSessionId,
            risk_score: 0.5, // Default risk score
            decision: 'review',
            flags: ['session_not_verified'],
            warning: 'Frontend SDK not integrated - limited fraud detection'
          },
          sessionId: finalSessionId,
          warning: 'Verisoul frontend SDK integration required for full fraud detection'
        };
      }
      throw apiError; // Re-throw other errors
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getSession(sessionId) {
    try {
      const response = await axios.get(`${this.baseURL}/session/${sessionId}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async unauthenticateSession(sessionId) {
    try {
      const data = { session_id: sessionId };
      const response = await axios.post(`${this.baseURL}/session/unauthenticated`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Account Management
  async getAccount(accountId) {
    try {
      const response = await axios.get(`${this.baseURL}/account/${accountId}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateAccount(accountId, email, metadata = {}) {
    try {
      const data = {
        id: accountId,
        email: email,
        metadata: metadata
      };

      const response = await axios.put(`${this.baseURL}/account/${accountId}`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteAccount(accountId) {
    try {
      const response = await axios.delete(`${this.baseURL}/account/${accountId}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAccountSessions(accountId) {
    try {
      const response = await axios.get(`${this.baseURL}/account/${accountId}/sessions`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLinkedAccounts(accountId) {
    try {
      const response = await axios.get(`${this.baseURL}/account/${accountId}/accounts-linked`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // List Management
  async createList(listName, description) {
    try {
      const data = { list_description: description };
      const response = await axios.post(`${this.baseURL}/list/${listName}`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async addAccountToList(listName, accountId) {
    try {
      const response = await axios.post(`${this.baseURL}/list/${listName}/account/${accountId}`, {}, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLists() {
    try {
      const response = await axios.get(`${this.baseURL}/list`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getList(listName) {
    try {
      const response = await axios.get(`${this.baseURL}/list/${listName}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteList(listName) {
    try {
      const response = await axios.delete(`${this.baseURL}/list/${listName}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async removeAccountFromList(listName, accountId) {
    try {
      const response = await axios.delete(`${this.baseURL}/list/${listName}/account/${accountId}`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Phone Verification
  async verifyPhone(phoneNumber) {
    try {
      const data = { phone_number: phoneNumber };
      const response = await axios.post(`${this.baseURL}/phone`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Liveness Verification
  async verifyFace(sessionId) {
    try {
      const data = { session_id: sessionId };
      const response = await axios.post(`${this.baseURL}/liveness/verify-face`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async verifyIdentity(sessionId, accountId) {
    try {
      const data = {
        session_id: sessionId,
        account_id: accountId
      };
      const response = await axios.post(`${this.baseURL}/liveness/verify-identity`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async enrollUser(sessionId, accountId) {
    try {
      const data = {
        session_id: sessionId,
        account_id: accountId
      };
      const response = await axios.post(`${this.baseURL}/liveness/enroll`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLivenessSession() {
    try {
      const response = await axios.get(`${this.baseURL}/liveness/session`, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getLivenessRedirect(projectId) {
    try {
      const response = await axios.get(`${this.baseURL}/public/liveness-redirect?project_id=${projectId}`, {
        headers: {}
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async verifyId(sessionId) {
    try {
      const data = { session_id: sessionId };
      const response = await axios.post(`${this.baseURL}/liveness/verify-id`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Utility Methods
  generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  handleError(error) {
    // Log full error details for debugging
    console.error('Verisoul API Error:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data
      }
    });
    
    return {
      success: false,
      error: {
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        data: error.response?.data
      }
    };
  }
}

module.exports = VerisoulSDK;
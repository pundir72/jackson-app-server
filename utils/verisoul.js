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
      const data = {
        account: {
          id: accountId,
          email: email,
          metadata: metadata,
          ...(group && { group })
        },
        session_id: sessionId || this.generateSessionId()
      };

      const response = await axios.post(`${this.baseURL}/session/authenticate`, data, {
        headers: this.defaultHeaders
      });

      return {
        success: true,
        data: response.data,
        sessionId: data.session_id
      };
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
    console.error('Verisoul API Error:', error.response?.data || error.message);
    
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
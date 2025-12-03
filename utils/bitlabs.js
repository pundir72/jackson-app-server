const axios = require('axios');

// Bitlabs configuration
const BITLABS_CONFIG = {
  baseUrl: process.env.BITLABS_BASE_URL || 'https://api.bitlabs.ai',
  apiKey: process.env.BITLABS_API_KEY,
  publisherId: process.env.BITLABS_PUBLISHER_ID,
  timeout: 30000 // 30 seconds
};

/**
 * Bitlabs SDK for survey offers and rewards
 */
class BitlabsSDK {
  constructor() {
    this.apiKey = BITLABS_CONFIG.apiKey;
    this.publisherId = BITLABS_CONFIG.publisherId;
    this.baseUrl = BITLABS_CONFIG.baseUrl;
    
    if (!this.apiKey || !this.publisherId) {
      console.warn('Bitlabs credentials not configured. Survey integration will be disabled.');
    }
  }

  /**
   * Get available surveys for user
   * @param {Object} params - User parameters
   * @param {string} params.userId - User ID
   * @param {Object} params.userProfile - User profile information
   * @returns {Object} Available surveys
   */
  async getSurveys(params) {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured',
          surveys: []
        };
      }

      const { userId, userProfile } = params;

      const requestData = {
        publisher_id: this.publisherId,
        user_id: userId,
        user_profile: {
          age: userProfile.age,
          gender: userProfile.gender,
          country: userProfile.country,
          language: userProfile.language || 'en',
          interests: userProfile.interests || []
        },
        device_info: {
          platform: userProfile.platform || 'mobile',
          os_version: userProfile.osVersion,
          app_version: userProfile.appVersion
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/surveys/available`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        surveys: response.data.surveys.map(survey => ({
          id: survey.survey_id,
          title: survey.title,
          description: survey.description,
          estimatedTime: survey.estimated_time_minutes,
          reward: {
            coins: survey.reward_coins,
            currency: survey.reward_currency || 'coins'
          },
          category: survey.category,
          difficulty: survey.difficulty,
          requirements: survey.requirements || [],
          isAvailable: survey.is_available,
          expiresAt: survey.expires_at
        })),
        totalSurveys: response.data.total_surveys,
        estimatedEarnings: response.data.estimated_earnings
      };

    } catch (error) {
      console.error('Bitlabs get surveys error:', error.message);
      return {
        success: false,
        error: error.message,
        surveys: []
      };
    }
  }

  /**
   * Start a survey session
   * @param {Object} params - Survey parameters
   * @param {string} params.userId - User ID
   * @param {string} params.surveyId - Survey ID
   * @param {Object} params.deviceInfo - Device information
   * @returns {Object} Survey session
   */
  async startSurvey(params) {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured'
        };
      }

      const { userId, surveyId, deviceInfo } = params;

      const requestData = {
        publisher_id: this.publisherId,
        user_id: userId,
        survey_id: surveyId,
        device_info: {
          platform: deviceInfo.platform,
          os_version: deviceInfo.osVersion,
          app_version: deviceInfo.appVersion,
          user_agent: deviceInfo.userAgent
        },
        callback_url: `${process.env.API_BASE_URL}/api/surveys/callback/bitlabs`,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/surveys/start`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        sessionId: response.data.session_id,
        surveyUrl: response.data.survey_url,
        expiresAt: response.data.expires_at,
        estimatedTime: response.data.estimated_time_minutes,
        reward: response.data.reward
      };

    } catch (error) {
      console.error('Bitlabs start survey error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify survey completion callback
   * @param {Object} params - Callback parameters
   * @param {string} params.sessionId - Session ID
   * @param {string} params.userId - User ID
   * @param {string} params.surveyId - Survey ID
   * @param {number} params.reward - Reward amount
   * @param {string} params.signature - Callback signature
   * @returns {Object} Verification result
   */
  async verifyCallback(params) {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured',
          isValid: false
        };
      }

      const { sessionId, userId, surveyId, reward, signature } = params;

      const requestData = {
        publisher_id: this.publisherId,
        session_id: sessionId,
        user_id: userId,
        survey_id: surveyId,
        reward: reward,
        signature: signature,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/surveys/verify-callback`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        isValid: response.data.is_valid,
        reward: response.data.reward,
        surveyId: response.data.survey_id,
        completedAt: response.data.completed_at
      };

    } catch (error) {
      console.error('Bitlabs verify callback error:', error.message);
      return {
        success: false,
        error: error.message,
        isValid: false
      };
    }
  }

  /**
   * Get user survey history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Survey history
   */
  async getUserHistory(userId, options = {}) {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured',
          history: []
        };
      }

      const { page = 1, limit = 20, startDate, endDate } = options;

      const queryParams = new URLSearchParams({
        publisher_id: this.publisherId,
        user_id: userId,
        page: page.toString(),
        limit: limit.toString()
      });

      if (startDate) queryParams.append('start_date', startDate);
      if (endDate) queryParams.append('end_date', endDate);

      const response = await axios.get(
        `${this.baseUrl}/v1/surveys/history?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        history: response.data.surveys.map(survey => ({
          id: survey.survey_id,
          title: survey.title,
          completedAt: survey.completed_at,
          reward: survey.reward,
          status: survey.status,
          duration: survey.duration_minutes
        })),
        pagination: {
          page: response.data.page,
          limit: response.data.limit,
          total: response.data.total,
          pages: response.data.pages
        },
        totalEarnings: response.data.total_earnings
      };

    } catch (error) {
      console.error('Bitlabs get history error:', error.message);
      return {
        success: false,
        error: error.message,
        history: []
      };
    }
  }

  /**
   * Get survey categories
   * @returns {Object} Available categories
   */
  async getCategories() {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured',
          categories: []
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/surveys/categories`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        categories: response.data.categories.map(category => ({
          id: category.category_id,
          name: category.name,
          description: category.description,
          icon: category.icon,
          surveyCount: category.survey_count,
          averageReward: category.average_reward
        }))
      };

    } catch (error) {
      console.error('Bitlabs get categories error:', error.message);
      return {
        success: false,
        error: error.message,
        categories: []
      };
    }
  }

  /**
   * Get user earnings summary
   * @param {string} userId - User ID
   * @param {string} period - Time period (daily, weekly, monthly)
   * @returns {Object} Earnings summary
   */
  async getEarningsSummary(userId, period = 'monthly') {
    try {
      if (!this.apiKey || !this.publisherId) {
        return {
          success: false,
          error: 'Bitlabs not configured',
          summary: null
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/earnings/summary`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          params: {
            publisher_id: this.publisherId,
            user_id: userId,
            period: period
          },
          timeout: BITLABS_CONFIG.timeout
        }
      );

      return {
        success: true,
        summary: {
          period: response.data.period,
          totalEarnings: response.data.total_earnings,
          completedSurveys: response.data.completed_surveys,
          averageEarning: response.data.average_earning,
          topCategory: response.data.top_category,
          earningsByDay: response.data.earnings_by_day || []
        }
      };

    } catch (error) {
      console.error('Bitlabs get earnings error:', error.message);
      return {
        success: false,
        error: error.message,
        summary: null
      };
    }
  }
}

// Create singleton instance
const bitlabs = new BitlabsSDK();

module.exports = bitlabs;


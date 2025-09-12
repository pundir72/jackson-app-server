const axios = require('axios');

// Besitos configuration
const BESITOS_CONFIG = {
  baseUrl: process.env.BESITOS_BASE_URL || 'https://api.besitos.com',
  apiKey: process.env.BESITOS_API_KEY,
  appId: process.env.BESITOS_APP_ID,
  timeout: 30000 // 30 seconds
};

/**
 * Besitos SDK for game offers and rewards
 */
class BesitosSDK {
  constructor() {
    this.apiKey = BESITOS_CONFIG.apiKey;
    this.appId = BESITOS_CONFIG.appId;
    this.baseUrl = BESITOS_CONFIG.baseUrl;
    
    if (!this.apiKey || !this.appId) {
      console.warn('Besitos credentials not configured. Game offers will be disabled.');
    }
  }

  /**
   * Get available game offers
   * @param {Object} params - User parameters
   * @param {string} params.userId - User ID
   * @param {Object} params.userProfile - User profile information
   * @returns {Object} Available game offers
   */
  async getGameOffers(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured',
          offers: []
        };
      }

      const { userId, userProfile } = params;

      const requestData = {
        app_id: this.appId,
        user_id: userId,
        user_profile: {
          age: userProfile.age,
          gender: userProfile.gender,
          country: userProfile.country,
          language: userProfile.language || 'en',
          interests: userProfile.interests || [],
          gaming_preferences: userProfile.gamingPreferences || []
        },
        device_info: {
          platform: userProfile.platform || 'mobile',
          os_version: userProfile.osVersion,
          app_version: userProfile.appVersion,
          device_model: userProfile.deviceModel
        }
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/offers/games`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        offers: response.data.offers.map(offer => ({
          id: offer.offer_id,
          gameId: offer.game_id,
          title: offer.title,
          description: offer.description,
          icon: offer.icon_url,
          banner: offer.banner_url,
          genre: offer.genre,
          category: offer.category,
          difficulty: offer.difficulty,
          estimatedTime: offer.estimated_time_minutes,
          reward: {
            coins: offer.reward_coins,
            currency: offer.reward_currency || 'coins',
            xp: offer.reward_xp || 0
          },
          requirements: {
            minLevel: offer.min_level || 1,
            maxLevel: offer.max_level || null,
            tasks: offer.required_tasks || [],
            timeLimit: offer.time_limit_hours || null
          },
          isAvailable: offer.is_available,
          isInstalled: offer.is_installed || false,
          downloadUrl: offer.download_url,
          deepLink: offer.deep_link,
          expiresAt: offer.expires_at,
          priority: offer.priority || 1
        })),
        totalOffers: response.data.total_offers,
        estimatedEarnings: response.data.estimated_earnings
      };

    } catch (error) {
      console.error('Besitos get game offers error:', error.message);
      return {
        success: false,
        error: error.message,
        offers: []
      };
    }
  }

  /**
   * Track game installation
   * @param {Object} params - Installation parameters
   * @param {string} params.userId - User ID
   * @param {string} params.offerId - Offer ID
   * @param {string} params.gameId - Game ID
   * @param {Object} params.deviceInfo - Device information
   * @returns {Object} Installation tracking result
   */
  async trackInstallation(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured'
        };
      }

      const { userId, offerId, gameId, deviceInfo } = params;

      const requestData = {
        app_id: this.appId,
        user_id: userId,
        offer_id: offerId,
        game_id: gameId,
        device_info: {
          platform: deviceInfo.platform,
          os_version: deviceInfo.osVersion,
          app_version: deviceInfo.appVersion,
          device_id: deviceInfo.deviceId,
          ip_address: deviceInfo.ipAddress
        },
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/tracking/install`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        trackingId: response.data.tracking_id,
        status: response.data.status,
        reward: response.data.reward
      };

    } catch (error) {
      console.error('Besitos track installation error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Track game completion
   * @param {Object} params - Completion parameters
   * @param {string} params.userId - User ID
   * @param {string} params.offerId - Offer ID
   * @param {string} params.gameId - Game ID
   * @param {Object} params.completionData - Completion data
   * @returns {Object} Completion tracking result
   */
  async trackCompletion(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured'
        };
      }

      const { userId, offerId, gameId, completionData } = params;

      const requestData = {
        app_id: this.appId,
        user_id: userId,
        offer_id: offerId,
        game_id: gameId,
        completion_data: {
          level_reached: completionData.levelReached,
          score: completionData.score,
          time_played: completionData.timePlayedMinutes,
          tasks_completed: completionData.tasksCompleted,
          achievements: completionData.achievements || []
        },
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/tracking/complete`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        reward: response.data.reward,
        bonusReward: response.data.bonus_reward,
        totalReward: response.data.total_reward,
        status: response.data.status
      };

    } catch (error) {
      console.error('Besitos track completion error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify offer completion callback
   * @param {Object} params - Callback parameters
   * @param {string} params.userId - User ID
   * @param {string} params.offerId - Offer ID
   * @param {string} params.trackingId - Tracking ID
   * @param {string} params.signature - Callback signature
   * @returns {Object} Verification result
   */
  async verifyCallback(params) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured',
          isValid: false
        };
      }

      const { userId, offerId, trackingId, signature } = params;

      const requestData = {
        app_id: this.appId,
        user_id: userId,
        offer_id: offerId,
        tracking_id: trackingId,
        signature: signature,
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.baseUrl}/v1/offers/verify-callback`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        isValid: response.data.is_valid,
        reward: response.data.reward,
        offerId: response.data.offer_id,
        completedAt: response.data.completed_at
      };

    } catch (error) {
      console.error('Besitos verify callback error:', error.message);
      return {
        success: false,
        error: error.message,
        isValid: false
      };
    }
  }

  /**
   * Get user game history
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} Game history
   */
  async getUserHistory(userId, options = {}) {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured',
          history: []
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
        `${this.baseUrl}/v1/offers/history?${queryParams}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        history: response.data.offers.map(offer => ({
          id: offer.offer_id,
          gameId: offer.game_id,
          title: offer.title,
          status: offer.status,
          reward: offer.reward,
          completedAt: offer.completed_at,
          timePlayed: offer.time_played_minutes,
          levelReached: offer.level_reached
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
      console.error('Besitos get history error:', error.message);
      return {
        success: false,
        error: error.message,
        history: []
      };
    }
  }

  /**
   * Get game categories
   * @returns {Object} Available categories
   */
  async getCategories() {
    try {
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured',
          categories: []
        };
      }

      const response = await axios.get(
        `${this.baseUrl}/v1/offers/categories`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        categories: response.data.categories.map(category => ({
          id: category.category_id,
          name: category.name,
          description: category.description,
          icon: category.icon_url,
          offerCount: category.offer_count,
          averageReward: category.average_reward
        }))
      };

    } catch (error) {
      console.error('Besitos get categories error:', error.message);
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
      if (!this.apiKey || !this.appId) {
        return {
          success: false,
          error: 'Besitos not configured',
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
            app_id: this.appId,
            user_id: userId,
            period: period
          },
          timeout: BESITOS_CONFIG.timeout
        }
      );

      return {
        success: true,
        summary: {
          period: response.data.period,
          totalEarnings: response.data.total_earnings,
          completedOffers: response.data.completed_offers,
          averageEarning: response.data.average_earning,
          topGenre: response.data.top_genre,
          earningsByDay: response.data.earnings_by_day || []
        }
      };

    } catch (error) {
      console.error('Besitos get earnings error:', error.message);
      return {
        success: false,
        error: error.message,
        summary: null
      };
    }
  }
}

// Create singleton instance
const besitos = new BesitosSDK();

module.exports = besitos;


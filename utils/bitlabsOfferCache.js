/**
 * Bitlabs Offer Cache
 * Caches Bitlabs offers inventory and refreshes periodically
 * @module utils/bitlabsOfferCache
 */

const bitlabsService = require("../services/bitlabs.service");
const config = require("../config/config");
const nodeCache = require("node-cache");

// Create cache instance with TTL matching refresh interval
const cache = new nodeCache({
  stdTTL: config.BITLABS_REFRESH_INTERVAL_MINUTES * 60, // Convert minutes to seconds
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false,
});

class BitlabsOfferCache {
  constructor() {
    this.isRefreshing = false;
    this.lastRefreshTime = null;
    this.refreshInterval = null;
  }

  /**
   * Get cached offers or fetch fresh if cache is empty
   * @param {Object} queryParams - Query parameters (may include userId)
   * @returns {Promise<Array>} Offers array
   */
  async getOffers(queryParams = {}) {
    // Extract userId from queryParams if present
    const { userId, ...restParams } = queryParams;
    const cacheKey = this.getCacheKey(restParams); // Cache key without userId

    // Try to get from cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch fresh data
    return await this.refreshOffers(queryParams);
  }

  /**
   * Refresh offers from Bitlabs API and update cache
   * @param {Object} queryParams - Query parameters (may include userId)
   * @returns {Promise<Array>} Offers array
   */
  async refreshOffers(queryParams = {}) {
    if (this.isRefreshing) {
      // Wait a bit and try cache again
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const { userId, ...restParams } = queryParams;
      const cacheKey = this.getCacheKey(restParams);
      return cache.get(cacheKey) || [];
    }

    this.isRefreshing = true;
    const { userId, ...restParams } = queryParams;
    const cacheKey = this.getCacheKey(restParams); // Cache key without userId

    try {
      const result = await bitlabsService.getOffers(restParams, userId);

      if (result && result.success && Array.isArray(result.data)) {
        // Store in cache
        cache.set(cacheKey, result.data);
        this.lastRefreshTime = new Date();
        return result.data;
      } else if (Array.isArray(result)) {
        // If service returns array directly
        cache.set(cacheKey, result);
        this.lastRefreshTime = new Date();
        return result;
      } else {
        console.error(
          "Bitlabs offers refresh failed: Invalid response format",
          result
        );
        return [];
      }
    } catch (error) {
      console.error("Error refreshing Bitlabs offers:", error.message);
      // Return empty array on error, but don't cache it
      return [];
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Start periodic refresh
   * @param {number} intervalMinutes - Refresh interval in minutes
   */
  startPeriodicRefresh(intervalMinutes = null) {
    const interval =
      intervalMinutes || config.BITLABS_REFRESH_INTERVAL_MINUTES || 5;

    // Clear existing interval if any
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Refresh immediately on start
    this.refreshOffers().catch((err) => {
      console.error("Error in initial Bitlabs offer refresh:", err);
    });

    // Set up periodic refresh
    const intervalMs = interval * 60 * 1000; // Convert minutes to milliseconds
    this.refreshInterval = setInterval(() => {
      this.refreshOffers().catch((err) => {
        console.error("Error in periodic Bitlabs offer refresh:", err);
      });
    }, intervalMs);
  }

  /**
   * Stop periodic refresh
   */
  stopPeriodicRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Clear all cached offers
   */
  clearCache() {
    cache.flushAll();
    this.lastRefreshTime = null;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      keys: cache.keys().length,
      hits: cache.getStats().hits,
      misses: cache.getStats().misses,
      lastRefreshTime: this.lastRefreshTime,
      isRefreshing: this.isRefreshing,
    };
  }

  /**
   * Generate cache key from query parameters
   * @param {Object} queryParams - Query parameters
   * @returns {string} Cache key
   */
  getCacheKey(queryParams) {
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map((key) => `${key}:${queryParams[key]}`)
      .join("|");
    return `bitlabs_offers_${sortedParams || "default"}`;
  }

  /**
   * Pre-fetch offers for common query combinations
   * Bitlabs API uses: devices (array), is_game (boolean), in_app (boolean), etc.
   */
  async preFetchCommonOffers() {
    const commonQueries = [
      {}, // Try with NO parameters first (most likely to return offers)
      { is_game: true }, // All game offers
      { is_game: false }, // All non-game offers (surveys, magic receipts, cashback, shopping)
      { devices: ["android"] }, // Android only
      { devices: ["iphone"] }, // iPhone only
      { devices: ["ipad"] }, // iPad only
      { devices: ["android", "iphone"] }, // Mobile devices
      { is_game: true, devices: ["android"] }, // Android games
      { is_game: true, devices: ["iphone"] }, // iPhone games
      { is_game: true, devices: ["android", "iphone"] }, // Mobile games
      { is_game: false, devices: ["android"] }, // Android non-game offers
      { is_game: false, devices: ["iphone"] }, // iPhone non-game offers
      { is_game: false, devices: ["android", "iphone"] }, // Mobile non-game offers
    ];

    for (const query of commonQueries) {
      try {
        await this.refreshOffers(query);
        // Small delay between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `Error pre-fetching offers for ${JSON.stringify(query)}:`,
          error.message
        );
      }
    }
  }
}

// Export singleton instance
module.exports = new BitlabsOfferCache();

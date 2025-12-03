const NodeCache = require('node-cache');

// Create cache instances with different TTLs
const achievementCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes
  checkperiod: 60 // Check for expired keys every minute
});

const leaderboardCache = new NodeCache({ 
  stdTTL: 600, // 10 minutes
  checkperiod: 120 // Check for expired keys every 2 minutes
});

const profileCache = new NodeCache({ 
  stdTTL: 180, // 3 minutes
  checkperiod: 60 // Check for expired keys every minute
});

// Cache key generators
const getAchievementKey = (userId, category = null) => 
  `achievements:${userId}${category ? `:${category}` : ''}`;

const getLeaderboardKey = (category, timeframe) => 
  `leaderboard:${category}:${timeframe}`;

const getProfileKey = (userId) => 
  `profile:${userId}`;

const getStatsKey = (userId) => 
  `stats:${userId}`;

// Cache helper functions
const cache = {
  // Achievement cache
  getAchievements: (userId, category = null) => {
    const key = getAchievementKey(userId, category);
    return achievementCache.get(key);
  },
  
  setAchievements: (userId, data, category = null) => {
    const key = getAchievementKey(userId, category);
    achievementCache.set(key, data);
  },
  
  // Leaderboard cache
  getLeaderboard: (category, timeframe) => {
    const key = getLeaderboardKey(category, timeframe);
    return leaderboardCache.get(key);
  },
  
  setLeaderboard: (category, timeframe, data) => {
    const key = getLeaderboardKey(category, timeframe);
    leaderboardCache.set(key, data);
  },
  
  // Profile cache
  getProfile: (userId) => {
    const key = getProfileKey(userId);
    return profileCache.get(key);
  },
  
  setProfile: (userId, data) => {
    const key = getProfileKey(userId);
    profileCache.set(key, data);
  },
  
  // Stats cache
  getStats: (userId) => {
    const key = getStatsKey(userId);
    return profileCache.get(key);
  },
  
  setStats: (userId, data) => {
    const key = getStatsKey(userId);
    profileCache.set(key, data);
  },
  
  // Invalidate user-specific caches
  invalidateUser: (userId) => {
    const patterns = [
      `achievements:${userId}`,
      `profile:${userId}`,
      `stats:${userId}`
    ];
    
    patterns.forEach(pattern => {
      const keys = profileCache.keys().filter(key => key.includes(pattern));
      keys.forEach(key => profileCache.del(key));
    });
  },
  
  // Clear all caches
  clearAll: () => {
    achievementCache.flushAll();
    leaderboardCache.flushAll();
    profileCache.flushAll();
  },
  
  // Get cache stats
  getStats: () => ({
    achievement: {
      keys: achievementCache.keys().length,
      hits: achievementCache.getStats().hits,
      misses: achievementCache.getStats().misses
    },
    leaderboard: {
      keys: leaderboardCache.keys().length,
      hits: leaderboardCache.getStats().hits,
      misses: leaderboardCache.getStats().misses
    },
    profile: {
      keys: profileCache.keys().length,
      hits: profileCache.getStats().hits,
      misses: profileCache.getStats().misses
    }
  })
};

module.exports = cache;

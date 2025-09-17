const User = require('../models/User');
const UserAchievement = require('../models/UserAchievement');
const Leaderboard = require('../models/Leaderboard');
const cache = require('./cache');

/**
 * Get optimized user profile data with caching
 */
async function getOptimizedProfile(userId) {
  try {
    // Check cache first
    const cachedProfile = cache.getProfile(userId);
    if (cachedProfile) {
      return cachedProfile;
    }

    // Get user data with minimal fields
    const user = await User.findById(userId)
      .select('firstName lastName mobile profile email socialTag xp wallet badges titles vip')
      .lean();

    if (!user) {
      return null;
    }

    // Get basic achievement count (lightweight query)
    const achievementCount = await UserAchievement.countDocuments({ user: userId });
    
    // Get recent achievements (limit to 5)
    const recentAchievements = await UserAchievement.find({ user: userId })
      .populate('achievement', 'name description icon rarity')
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(5)
      .lean();

    // Get basic leaderboard rank (cached)
    const userRank = await getCachedUserRank(userId, 'overall', 'all_time');

    const profileData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      mobile: user.mobile,
      email: user.email,
      profile: user.profile,
      socialTag: user.socialTag,
      xp: user.xp,
      wallet: user.wallet,
      badges: user.badges || [],
      titles: user.titles || [],
      vip: user.vip,
      achievements: {
        recent: recentAchievements,
        total: achievementCount
      },
      leadership: {
        overallRank: userRank?.rank || null,
        percentile: userRank?.percentile || null
      }
    };

    // Cache the result
    cache.setProfile(userId, profileData);
    
    return profileData;
  } catch (error) {
    console.error('Error getting optimized profile:', error);
    throw error;
  }
}

/**
 * Get optimized user stats with caching
 */
async function getOptimizedStats(userId) {
  try {
    // Check cache first
    const cachedStats = cache.getStats(userId);
    if (cachedStats) {
      return cachedStats;
    }

    // Get user data with minimal fields
    const user = await User.findById(userId)
      .select('xp wallet games surveys races streak badges titles')
      .lean();

    if (!user) {
      return null;
    }

    // Calculate basic stats
    const stats = {
      xp: user.xp?.current || 0,
      balance: user.wallet?.balance || 0,
      gamesPlayed: user.games?.length || 0,
      surveysCompleted: user.surveys?.filter(s => s.completed).length || 0,
      racesCompleted: user.races?.filter(r => r.completed).length || 0,
      streak: user.streak?.current || 0,
      badges: user.badges?.length || 0,
      titles: user.titles?.length || 0
    };

    // Get basic achievement stats (lightweight)
    const achievementStats = await getCachedAchievementStats(userId);
    stats.achievements = achievementStats;

    // Get basic rankings (cached)
    const rankings = await getCachedUserRanks(userId);
    stats.rankings = rankings;

    // Cache the result
    cache.setStats(userId, stats);
    
    return stats;
  } catch (error) {
    console.error('Error getting optimized stats:', error);
    throw error;
  }
}

/**
 * Get cached user rank
 */
async function getCachedUserRank(userId, category, timeframe) {
  try {
    const cacheKey = `userRank:${userId}:${category}:${timeframe}`;
    const cached = cache.getProfile(cacheKey);
    if (cached) {
      return cached;
    }

    const rankData = await Leaderboard.getUserRank(userId, category, timeframe);
    
    if (rankData) {
      cache.setProfile(cacheKey, rankData);
    }
    
    return rankData;
  } catch (error) {
    console.error('Error getting cached user rank:', error);
    return null;
  }
}

/**
 * Get cached user ranks for all categories
 */
async function getCachedUserRanks(userId) {
  try {
    const cacheKey = `userRanks:${userId}`;
    const cached = cache.getProfile(cacheKey);
    if (cached) {
      return cached;
    }

    const categories = ['overall', 'xp', 'coins', 'streak'];
    const timeframes = ['all_time'];
    const ranks = {};

    for (const category of categories) {
      ranks[category] = {};
      for (const timeframe of timeframes) {
        const rankData = await getCachedUserRank(userId, category, timeframe);
        ranks[category][timeframe] = rankData;
      }
    }

    cache.setProfile(cacheKey, ranks);
    return ranks;
  } catch (error) {
    console.error('Error getting cached user ranks:', error);
    return {};
  }
}

/**
 * Get cached achievement stats
 */
async function getCachedAchievementStats(userId) {
  try {
    const cacheKey = `achievementStats:${userId}`;
    const cached = cache.getProfile(cacheKey);
    if (cached) {
      return cached;
    }

    // Get basic achievement stats with aggregation
    const stats = await UserAchievement.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          claimed: {
            $sum: { $cond: [{ $eq: ['$status', 'claimed'] }, 1, 0] }
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || { total: 0, completed: 0, claimed: 0, inProgress: 0 };
    
    cache.setProfile(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Error getting cached achievement stats:', error);
    return { total: 0, completed: 0, claimed: 0, inProgress: 0 };
  }
}

/**
 * Get optimized achievements with pagination
 */
async function getOptimizedAchievements(userId, options = {}) {
  try {
    const { category = null, status = null, page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    // Check cache first
    const cacheKey = `achievements:${userId}:${category || 'all'}:${status || 'all'}:${page}:${limit}`;
    const cached = cache.getAchievements(userId, cacheKey);
    if (cached) {
      return cached;
    }

    // Build query
    const query = { user: userId };
    if (status) {
      query.status = status;
    }

    // Get achievements with pagination
    const [achievements, total] = await Promise.all([
      UserAchievement.find(query)
        .populate('achievement', 'name description icon rarity category')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserAchievement.countDocuments(query)
    ]);

    // Filter by category if specified
    let filteredAchievements = achievements;
    if (category) {
      filteredAchievements = achievements.filter(achievement => 
        achievement.achievement?.category === category
      );
    }

    const result = {
      achievements: filteredAchievements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };

    cache.setAchievements(userId, result, cacheKey);
    return result;
  } catch (error) {
    console.error('Error getting optimized achievements:', error);
    throw error;
  }
}

/**
 * Get optimized leaderboard data
 */
async function getOptimizedLeaderboard(category, timeframe = 'all_time', limit = 50) {
  try {
    // Check cache first
    const cached = cache.getLeaderboard(category, timeframe);
    if (cached) {
      return {
        ...cached,
        leaderboard: cached.leaderboard.slice(0, limit)
      };
    }

    // Get leaderboard data
    const leaderboard = await Leaderboard.getLeaderboard(category, timeframe);
    
    if (leaderboard) {
      cache.setLeaderboard(category, timeframe, leaderboard);
      return {
        ...leaderboard,
        leaderboard: leaderboard.entries.slice(0, limit)
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting optimized leaderboard:', error);
    throw error;
  }
}

/**
 * Invalidate user caches when data changes
 */
function invalidateUserCaches(userId) {
  cache.invalidateUser(userId);
}

module.exports = {
  getOptimizedProfile,
  getOptimizedStats,
  getOptimizedAchievements,
  getOptimizedLeaderboard,
  getCachedUserRank,
  getCachedUserRanks,
  getCachedAchievementStats,
  invalidateUserCaches
};

const Leaderboard = require('../models/Leaderboard');
const User = require('../models/User');

// Leaderboard configuration
const LEADERBOARD_CONFIG = {
  categories: ['xp', 'coins', 'streak', 'games', 'surveys', 'races', 'overall'],
  timeframes: ['daily', 'weekly', 'monthly', 'all_time'],
  updateIntervals: {
    daily: 24 * 60 * 60 * 1000, // 24 hours
    weekly: 7 * 24 * 60 * 60 * 1000, // 7 days
    monthly: 30 * 24 * 60 * 60 * 1000, // 30 days
    all_time: 0 // Never expires
  },
  maxEntries: 100
};

/**
 * Update leaderboard for a specific category and timeframe
 */
async function updateLeaderboard(category, timeframe = 'all_time') {
  try {
    console.log(`Updating leaderboard: ${category} - ${timeframe}`);
    
    const leaderboard = await Leaderboard.updateLeaderboard(category, timeframe);
    return leaderboard;
  } catch (error) {
    console.error(`Error updating leaderboard ${category}-${timeframe}:`, error);
    throw error;
  }
}

/**
 * Update all leaderboards
 */
async function updateAllLeaderboards() {
  try {
    const updates = [];
    
    for (const category of LEADERBOARD_CONFIG.categories) {
      for (const timeframe of LEADERBOARD_CONFIG.timeframes) {
        updates.push(updateLeaderboard(category, timeframe));
      }
    }
    
    await Promise.all(updates);
    console.log('All leaderboards updated successfully');
  } catch (error) {
    console.error('Error updating all leaderboards:', error);
    throw error;
  }
}

/**
 * Get leaderboard data
 */
async function getLeaderboard(category, timeframe = 'all_time', limit = 50) {
  try {
    const leaderboard = await Leaderboard.getLeaderboard(category, timeframe);
    
    if (!leaderboard) {
      // Create leaderboard if it doesn't exist
      return await updateLeaderboard(category, timeframe);
    }
    
    // Check if leaderboard needs updating
    const needsUpdate = shouldUpdateLeaderboard(leaderboard, timeframe);
    if (needsUpdate) {
      return await updateLeaderboard(category, timeframe);
    }
    
    // Limit entries
    leaderboard.entries = leaderboard.entries.slice(0, limit);
    
    return leaderboard;
  } catch (error) {
    console.error(`Error getting leaderboard ${category}-${timeframe}:`, error);
    throw error;
  }
}

/**
 * Get user's rank in leaderboard
 */
async function getUserRank(userId, category, timeframe = 'all_time') {
  try {
    const rankData = await Leaderboard.getUserRank(userId, category, timeframe);
    
    if (!rankData) {
      // User not found in leaderboard, update and try again
      await updateLeaderboard(category, timeframe);
      return await Leaderboard.getUserRank(userId, category, timeframe);
    }
    
    return rankData;
  } catch (error) {
    console.error(`Error getting user rank ${category}-${timeframe}:`, error);
    return null;
  }
}

/**
 * Get user's position in all leaderboards
 */
async function getUserRanks(userId) {
  try {
    const ranks = {};
    
    for (const category of LEADERBOARD_CONFIG.categories) {
      ranks[category] = {};
      
      for (const timeframe of LEADERBOARD_CONFIG.timeframes) {
        const rankData = await getUserRank(userId, category, timeframe);
        ranks[category][timeframe] = rankData;
      }
    }
    
    return ranks;
  } catch (error) {
    console.error('Error getting user ranks:', error);
    return {};
  }
}

/**
 * Get leaderboard summary for user
 */
async function getLeaderboardSummary(userId) {
  try {
    const user = await User.findById(userId).select('firstName lastName profile.avatar badges xp wallet games surveys races streak vip.level');
    const ranks = await getUserRanks(userId);
    
    // Calculate overall performance score
    const performanceScore = calculatePerformanceScore(ranks);
    
    // Get best categories
    const bestCategories = getBestCategories(ranks);
    
    // Get recent improvements
    const improvements = await getRecentImprovements(userId);
    
    return {
      user: {
        name: user.firstName || 'Anonymous',
        avatar: user.profile?.avatar,
        badges: user.badges || [],
        tier: getTierFromXP(user.xp?.current || 0),
        vipLevel: user.vip?.level || 'free'
      },
      performance: {
        score: performanceScore,
        level: getPerformanceLevel(performanceScore),
        bestCategories,
        improvements
      },
      ranks: {
        overall: ranks.overall?.all_time,
        xp: ranks.xp?.all_time,
        coins: ranks.coins?.all_time,
        streak: ranks.streak?.all_time
      }
    };
  } catch (error) {
    console.error('Error getting leaderboard summary:', error);
    return null;
  }
}

/**
 * Check if leaderboard needs updating
 */
function shouldUpdateLeaderboard(leaderboard, timeframe) {
  if (timeframe === 'all_time') return false;
  
  const interval = LEADERBOARD_CONFIG.updateIntervals[timeframe];
  const lastUpdated = new Date(leaderboard.lastUpdated);
  const now = new Date();
  
  return (now - lastUpdated) > interval;
}

/**
 * Calculate performance score based on ranks
 */
function calculatePerformanceScore(ranks) {
  let totalScore = 0;
  let categoryCount = 0;
  
  for (const category in ranks) {
    const allTimeRank = ranks[category].all_time;
    if (allTimeRank && allTimeRank.percentile) {
      totalScore += allTimeRank.percentile;
      categoryCount++;
    }
  }
  
  return categoryCount > 0 ? Math.round(totalScore / categoryCount) : 0;
}

/**
 * Get best performing categories
 */
function getBestCategories(ranks) {
  const categories = [];
  
  for (const category in ranks) {
    const allTimeRank = ranks[category].all_time;
    if (allTimeRank && allTimeRank.percentile) {
      categories.push({
        category,
        percentile: allTimeRank.percentile,
        rank: allTimeRank.rank,
        totalUsers: allTimeRank.totalUsers
      });
    }
  }
  
  return categories
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 3);
}

/**
 * Get recent improvements (placeholder - would need historical data)
 */
async function getRecentImprovements(userId) {
  // This would require storing historical rank data
  // For now, return empty array
  return [];
}

/**
 * Get performance level based on score
 */
function getPerformanceLevel(score) {
  if (score >= 90) return { level: 'Legendary', color: '#FFD700', icon: '👑' };
  if (score >= 80) return { level: 'Epic', color: '#9C27B0', icon: '🌟' };
  if (score >= 70) return { level: 'Rare', color: '#2196F3', icon: '⭐' };
  if (score >= 60) return { level: 'Good', color: '#4CAF50', icon: '👍' };
  if (score >= 50) return { level: 'Average', color: '#FF9800', icon: '📈' };
  return { level: 'Beginner', color: '#9E9E9E', icon: '🌱' };
}

/**
 * Get tier from XP
 */
function getTierFromXP(xp) {
  if (xp >= 10000) return 'expert';
  if (xp >= 5000) return 'senior';
  if (xp >= 1000) return 'mid';
  return 'junior';
}

/**
 * Get leaderboard comparison data
 */
async function getLeaderboardComparison(userId, category, timeframe = 'all_time') {
  try {
    const leaderboard = await getLeaderboard(category, timeframe, 100);
    const userRank = await getUserRank(userId, category, timeframe);
    
    if (!leaderboard || !userRank) {
      return null;
    }
    
    // Get users around current user's rank
    const startIndex = Math.max(0, userRank.rank - 6);
    const endIndex = Math.min(leaderboard.entries.length, userRank.rank + 5);
    const nearbyUsers = leaderboard.entries.slice(startIndex, endIndex);
    
    return {
      category,
      timeframe,
      userRank,
      nearbyUsers: nearbyUsers.map(entry => ({
        rank: entry.rank,
        displayName: entry.displayName,
        avatar: entry.avatar,
        score: entry.score,
        badges: entry.badges,
        tier: entry.tier,
        isCurrentUser: entry.user.toString() === userId.toString()
      })),
      totalUsers: leaderboard.totalUsers
    };
  } catch (error) {
    console.error('Error getting leaderboard comparison:', error);
    return null;
  }
}

module.exports = {
  updateLeaderboard,
  updateAllLeaderboards,
  getLeaderboard,
  getUserRank,
  getUserRanks,
  getLeaderboardSummary,
  getLeaderboardComparison,
  LEADERBOARD_CONFIG
};

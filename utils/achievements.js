const Achievement = require('../models/Achievement');
const UserAchievement = require('../models/UserAchievement');
const User = require('../models/User');

// Achievement categories and their tracking functions
const ACHIEVEMENT_CATEGORIES = {
  streak: {
    name: 'Streak Master',
    description: 'Achievements for maintaining daily streaks',
    trackingFunction: 'trackStreakAchievements'
  },
  xp: {
    name: 'XP Collector',
    description: 'Achievements for earning experience points',
    trackingFunction: 'trackXPAchievements'
  },
  games: {
    name: 'Game Master',
    description: 'Achievements for playing and completing games',
    trackingFunction: 'trackGameAchievements'
  },
  surveys: {
    name: 'Survey Expert',
    description: 'Achievements for completing surveys',
    trackingFunction: 'trackSurveyAchievements'
  },
  races: {
    name: 'Race Champion',
    description: 'Achievements for participating in races',
    trackingFunction: 'trackRaceAchievements'
  },
  wallet: {
    name: 'Wealth Builder',
    description: 'Achievements for earning and managing coins',
    trackingFunction: 'trackWalletAchievements'
  },
  social: {
    name: 'Social Butterfly',
    description: 'Achievements for social interactions',
    trackingFunction: 'trackSocialAchievements'
  },
  special: {
    name: 'Special Events',
    description: 'Special and limited-time achievements',
    trackingFunction: 'trackSpecialAchievements'
  }
};

// Default achievements to seed
const DEFAULT_ACHIEVEMENTS = [
  // Streak Achievements
  {
    achievementId: 'streak_3',
    name: 'Getting Started',
    description: 'Maintain a 3-day streak',
    category: 'streak',
    icon: '🔥',
    rarity: 'common',
    requirements: { type: 'streak', value: 3, timeframe: 'all_time' },
    rewards: { coins: 50, xp: 25, badge: 'Streak Starter 🔥' },
    order: 1
  },
  {
    achievementId: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day streak',
    category: 'streak',
    icon: '🏆',
    rarity: 'uncommon',
    requirements: { type: 'streak', value: 7, timeframe: 'all_time' },
    rewards: { coins: 150, xp: 75, badge: 'Week Warrior 🏆' },
    order: 2
  },
  {
    achievementId: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day streak',
    category: 'streak',
    icon: '👑',
    rarity: 'legendary',
    requirements: { type: 'streak', value: 30, timeframe: 'all_time' },
    rewards: { coins: 1000, xp: 500, badge: 'Monthly Master 👑', title: 'Streak Legend' },
    order: 3
  },
  
  // XP Achievements
  {
    achievementId: 'xp_1000',
    name: 'First Steps',
    description: 'Earn 1,000 XP points',
    category: 'xp',
    icon: '⭐',
    rarity: 'common',
    requirements: { type: 'xp', value: 1000, timeframe: 'all_time' },
    rewards: { coins: 100, xp: 50, badge: 'XP Collector ⭐' },
    order: 1
  },
  {
    achievementId: 'xp_10000',
    name: 'XP Expert',
    description: 'Earn 10,000 XP points',
    category: 'xp',
    icon: '🌟',
    rarity: 'epic',
    requirements: { type: 'xp', value: 10000, timeframe: 'all_time' },
    rewards: { coins: 500, xp: 250, badge: 'XP Expert 🌟', title: 'Experience Master' },
    order: 2
  },
  
  // Game Achievements
  {
    achievementId: 'games_10',
    name: 'Game Enthusiast',
    description: 'Play 10 games',
    category: 'games',
    icon: '🎮',
    rarity: 'common',
    requirements: { type: 'games_played', value: 10, timeframe: 'all_time' },
    rewards: { coins: 75, xp: 40, badge: 'Game Enthusiast 🎮' },
    order: 1
  },
  {
    achievementId: 'games_100',
    name: 'Game Master',
    description: 'Play 100 games',
    category: 'games',
    icon: '🎯',
    rarity: 'rare',
    requirements: { type: 'games_played', value: 100, timeframe: 'all_time' },
    rewards: { coins: 300, xp: 150, badge: 'Game Master 🎯', title: 'Gaming Legend' },
    order: 2
  },
  
  // Survey Achievements
  {
    achievementId: 'surveys_5',
    name: 'Opinion Sharer',
    description: 'Complete 5 surveys',
    category: 'surveys',
    icon: '📝',
    rarity: 'common',
    requirements: { type: 'surveys_completed', value: 5, timeframe: 'all_time' },
    rewards: { coins: 60, xp: 30, badge: 'Opinion Sharer 📝' },
    order: 1
  },
  {
    achievementId: 'surveys_25',
    name: 'Survey Expert',
    description: 'Complete 25 surveys',
    category: 'surveys',
    icon: '📊',
    rarity: 'uncommon',
    requirements: { type: 'surveys_completed', value: 25, timeframe: 'all_time' },
    rewards: { coins: 200, xp: 100, badge: 'Survey Expert 📊' },
    order: 2
  },
  
  // Wallet Achievements
  {
    achievementId: 'coins_1000',
    name: 'First Thousand',
    description: 'Earn 1,000 coins',
    category: 'wallet',
    icon: '💰',
    rarity: 'common',
    requirements: { type: 'wallet_balance', value: 1000, timeframe: 'all_time' },
    rewards: { coins: 100, xp: 50, badge: 'Coin Collector 💰' },
    order: 1
  },
  {
    achievementId: 'coins_10000',
    name: 'Wealth Builder',
    description: 'Earn 10,000 coins',
    category: 'wallet',
    icon: '💎',
    rarity: 'epic',
    requirements: { type: 'wallet_balance', value: 10000, timeframe: 'all_time' },
    rewards: { coins: 500, xp: 250, badge: 'Wealth Builder 💎', title: 'Coin Master' },
    order: 2
  }
];

/**
 * Initialize default achievements
 */
async function initializeAchievements() {
  try {
    for (const achievementData of DEFAULT_ACHIEVEMENTS) {
      await Achievement.findOneAndUpdate(
        { achievementId: achievementData.achievementId },
        achievementData,
        { upsert: true, new: true }
      );
    }
    console.log('Default achievements initialized');
  } catch (error) {
    console.error('Error initializing achievements:', error);
  }
}

/**
 * Track and update achievements for a user
 */
async function trackAchievements(userId, category, data) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    const achievements = await Achievement.find({ 
      category, 
      isActive: true,
      'requirements.type': getRequirementType(category, data)
    });

    for (const achievement of achievements) {
      const currentValue = getCurrentValue(user, achievement, data);
      
      if (currentValue > 0) {
        let userAchievement = await UserAchievement.findOne({
          user: userId,
          achievementId: achievement.achievementId
        });

        if (!userAchievement) {
          userAchievement = await UserAchievement.createUserAchievement(userId, achievement, currentValue);
        } else {
          await userAchievement.updateProgress(currentValue);
        }

        // Award rewards if completed and not claimed
        if (userAchievement.status === 'completed' && !userAchievement.claimedAt) {
          await awardAchievementRewards(user, userAchievement);
        }
      }
    }
  } catch (error) {
    console.error('Error tracking achievements:', error);
  }
}

/**
 * Get current value for achievement tracking
 */
function getCurrentValue(user, achievement, data) {
  switch (achievement.requirements.type) {
    case 'streak':
      return user.streak?.current || 0;
    case 'xp':
      return user.xp?.current || 0;
    case 'games_played':
      return user.games?.length || 0;
    case 'games_completed':
      return user.games?.filter(g => g.completed).length || 0;
    case 'surveys_completed':
      return user.surveys?.filter(s => s.completed).length || 0;
    case 'races_completed':
      return user.races?.filter(r => r.completed).length || 0;
    case 'wallet_balance':
      return user.wallet?.balance || 0;
    case 'consecutive_days':
      return user.streak?.current || 0;
    case 'total_earnings':
      return user.wallet?.balance || 0;
    default:
      return 0;
  }
}

/**
 * Get requirement type based on category and data
 */
function getRequirementType(category, data) {
  const typeMap = {
    streak: 'streak',
    xp: 'xp',
    games: data?.completed ? 'games_completed' : 'games_played',
    surveys: 'surveys_completed',
    races: 'races_completed',
    wallet: 'wallet_balance'
  };
  return typeMap[category] || 'custom';
}

/**
 * Award achievement rewards to user
 */
async function awardAchievementRewards(user, userAchievement) {
  try {
    const rewards = userAchievement.rewards;
    
    // Award coins
    if (rewards.coins > 0) {
      user.wallet.balance = (user.wallet.balance || 0) + rewards.coins;
      user.wallet.lastUpdated = new Date();
    }
    
    // Award XP
    if (rewards.xp > 0) {
      user.xp.current = (user.xp.current || 0) + rewards.xp;
      user.xp.total = (user.xp.total || 0) + rewards.xp;
    }
    
    // Award badge
    if (rewards.badge) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(rewards.badge)) {
        user.badges.push(rewards.badge);
      }
    }
    
    // Award title
    if (rewards.title) {
      if (!user.titles) user.titles = [];
      if (!user.titles.includes(rewards.title)) {
        user.titles.push(rewards.title);
      }
    }
    
    await user.save();
    
    // Mark as claimed
    await userAchievement.claimRewards();
    
    // Invalidate user caches
    const { invalidateUserCaches } = require('./optimizedProfile');
    invalidateUserCaches(userId);
    
    return {
      coins: rewards.coins,
      xp: rewards.xp,
      badge: rewards.badge,
      title: rewards.title
    };
  } catch (error) {
    console.error('Error awarding achievement rewards:', error);
    throw error;
  }
}

/**
 * Get user's achievement progress
 */
async function getUserAchievements(userId, category = null) {
  try {
    const query = { user: userId };
    if (category) {
      query.achievement = { $in: await Achievement.find({ category }).select('_id') };
    }
    
    return await UserAchievement.find(query)
      .populate('achievement')
      .sort({ createdAt: -1 });
  } catch (error) {
    console.error('Error getting user achievements:', error);
    return [];
  }
}

/**
 * Get achievement statistics for user
 */
async function getAchievementStats(userId) {
  try {
    const achievements = await getUserAchievements(userId);
    
    const stats = {
      total: achievements.length,
      completed: achievements.filter(a => a.status === 'completed').length,
      claimed: achievements.filter(a => a.status === 'claimed').length,
      inProgress: achievements.filter(a => a.status === 'in_progress').length,
      byCategory: {},
      byRarity: {
        common: 0,
        uncommon: 0,
        rare: 0,
        epic: 0,
        legendary: 0
      }
    };
    
    achievements.forEach(achievement => {
      const category = achievement.achievement.category;
      const rarity = achievement.achievement.rarity;
      
      if (!stats.byCategory[category]) {
        stats.byCategory[category] = { total: 0, completed: 0 };
      }
      
      stats.byCategory[category].total++;
      if (achievement.status === 'completed' || achievement.status === 'claimed') {
        stats.byCategory[category].completed++;
      }
      
      stats.byRarity[rarity]++;
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting achievement stats:', error);
    return null;
  }
}

module.exports = {
  initializeAchievements,
  trackAchievements,
  getUserAchievements,
  getAchievementStats,
  ACHIEVEMENT_CATEGORIES,
  DEFAULT_ACHIEVEMENTS
};

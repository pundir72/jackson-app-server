const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const { standardIntegrityVerification } = require('../middleware/integrityVerification');
const Achievement = require('../models/Achievement');
const UserAchievement = require('../models/UserAchievement');
const { 
  getUserAchievements, 
  getAchievementStats, 
  trackAchievements,
  initializeAchievements,
  ACHIEVEMENT_CATEGORIES 
} = require('../utils/achievements');

// Get all available achievements
router.get('/', protect, async (req, res) => {
  try {
    const { category, rarity } = req.query;
    
    let query = { isActive: true };
    if (category) query.category = category;
    if (rarity) query.rarity = rarity;
    
    const achievements = await Achievement.find(query).sort({ order: 1, createdAt: 1 });
    
    res.json({
      success: true,
      data: {
        achievements,
        categories: ACHIEVEMENT_CATEGORIES,
        total: achievements.length
      }
    });
  } catch (error) {
    console.error('Error getting achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get achievements'
    });
  }
});

// Get user's achievements
router.get('/user', protect, async (req, res) => {
  try {
    const { category, status } = req.query;
    
    const achievements = await getUserAchievements(req.user.userId, category);
    
    let filteredAchievements = achievements;
    if (status) {
      filteredAchievements = achievements.filter(a => a.status === status);
    }
    
    res.json({
      success: true,
      data: {
        achievements: filteredAchievements,
        total: filteredAchievements.length
      }
    });
  } catch (error) {
    console.error('Error getting user achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user achievements'
    });
  }
});

// Get user's achievement statistics
router.get('/user/stats', protect, async (req, res) => {
  try {
    const stats = await getAchievementStats(req.user.userId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting achievement stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get achievement stats'
    });
  }
});

// Get specific achievement details
router.get('/:achievementId', protect, async (req, res) => {
  try {
    const { achievementId } = req.params;
    
    const achievement = await Achievement.getAchievementById(achievementId);
    if (!achievement) {
      return res.status(404).json({
        success: false,
        error: 'Achievement not found'
      });
    }
    
    // Get user's progress for this achievement
    const userProgress = await UserAchievement.getUserProgress(req.user.userId, achievementId);
    
    res.json({
      success: true,
      data: {
        achievement,
        userProgress: userProgress || null
      }
    });
  } catch (error) {
    console.error('Error getting achievement details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get achievement details'
    });
  }
});

// Claim achievement rewards
router.post('/:achievementId/claim', protect, standardIntegrityVerification, async (req, res) => {
  try {
    const { achievementId } = req.params;
    
    const userAchievement = await UserAchievement.findOne({
      user: req.user.userId,
      achievementId
    }).populate('achievement');
    
    if (!userAchievement) {
      return res.status(404).json({
        success: false,
        error: 'Achievement not found'
      });
    }
    
    if (userAchievement.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Achievement not completed yet'
      });
    }
    
    if (userAchievement.status === 'claimed') {
      return res.status(400).json({
        success: false,
        error: 'Rewards already claimed'
      });
    }
    
    // Award rewards
    const rewards = await awardAchievementRewards(req.user.userId, userAchievement);
    
    res.json({
      success: true,
      data: {
        message: 'Rewards claimed successfully',
        rewards
      }
    });
  } catch (error) {
    console.error('Error claiming achievement rewards:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim rewards'
    });
  }
});

// Get achievement categories
router.get('/categories/list', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: ACHIEVEMENT_CATEGORIES
    });
  } catch (error) {
    console.error('Error getting achievement categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get categories'
    });
  }
});

// Get achievements by category
router.get('/category/:category', protect, async (req, res) => {
  try {
    const { category } = req.params;
    
    if (!ACHIEVEMENT_CATEGORIES[category]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category'
      });
    }
    
    const achievements = await Achievement.getAchievementsByCategory(category);
    const userAchievements = await getUserAchievements(req.user.userId, category);
    
    // Merge user progress with achievements
    const achievementsWithProgress = achievements.map(achievement => {
      const userProgress = userAchievements.find(ua => 
        ua.achievementId === achievement.achievementId
      );
      
      return {
        ...achievement.toObject(),
        userProgress: userProgress || null
      };
    });
    
    res.json({
      success: true,
      data: {
        category: ACHIEVEMENT_CATEGORIES[category],
        achievements: achievementsWithProgress,
        total: achievementsWithProgress.length
      }
    });
  } catch (error) {
    console.error('Error getting achievements by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get achievements by category'
    });
  }
});

// Helper function to award rewards
async function awardAchievementRewards(userId, userAchievement) {
  const User = require('../models/User');
  const Transaction = require('../models/Transaction');
  
  const user = await User.findById(userId);
  const rewards = userAchievement.rewards;
  
  // Award coins
  if (rewards.coins > 0) {
    user.wallet.balance = (user.wallet.balance || 0) + rewards.coins;
    user.wallet.lastUpdated = new Date();
    
    // Create transaction record
    const transaction = new Transaction({
      user: userId,
      type: 'credit',
      amount: rewards.coins,
      description: `Achievement Reward: ${userAchievement.achievement.name}`,
      status: 'completed',
      referenceId: `ACH-${userAchievement.achievementId}-${Date.now()}`
    });
    
    await transaction.save();
  }
  
  // Award XP (apply tier multiplier)
  if (rewards.xp > 0) {
    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      rewards.xp
    );
    user.xp.current = (user.xp.current || 0) + finalXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
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
  
  return {
    coins: rewards.coins,
    xp: rewards.xp,
    badge: rewards.badge,
    title: rewards.title
  };
}

// Initialize achievements (seed default achievements)
router.post('/initialize', protect, async (req, res) => {
  try {
    const result = await initializeAchievements();
    res.json({
      success: true,
      message: 'Achievements initialized successfully',
      data: result
    });
  } catch (error) {
    console.error('Error initializing achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize achievements'
    });
  }
});

module.exports = router;

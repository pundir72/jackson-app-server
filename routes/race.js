const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const RaceConfig = require('../models/RaceConfig');
const BesitosService = require('../services/besitos.service');

// Race configuration
const RACE_CONFIG = {
  maxLevels: 10,
  timeLimit: 24 * 60 * 60 * 1000, // 24 hours
  botNames: ['Orbitron', 'ByteBeast', 'CyberChamp', 'PixelPro', 'GameMaster'],
  botSpeeds: [0.8, 1.0, 1.2, 1.1, 0.9], // Speed multipliers for different bots
  levelRewards: {
    coins: [10, 15, 20, 25, 30, 35, 40, 45, 50, 60],
    xp: [5, 8, 10, 12, 15, 18, 20, 22, 25, 30]
  },
  bonusRewards: {
    firstPlace: { coins: 100, xp: 50 },
    secondPlace: { coins: 75, xp: 40 },
    thirdPlace: { coins: 50, xp: 30 }
  }
};

// Get available races (from DB)
router.get('/available', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp races');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    
    // Fetch active configs and filter by tier gating
    const configs = await RaceConfig.listActive();
    const availableRaces = (configs || []).filter(cfg => isTierUnlocked(currentTier.id, cfg.requiredTier));
    
    res.json({
      success: true,
      data: {
        races: availableRaces,
        userTier: currentTier.id,
        message: 'Choose a race to compete against AI bots!'
      }
    });
  } catch (error) {
    console.error('Error getting available races:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get available races'
    });
  }
});

// List third-party games (from Besitos offers) for race selection
router.get('/games', protect, async (req, res) => {
  try {
    const { platform, country, category, limit = 50 } = req.query;
    const params = { platform, country, category, limit };
    // Clean undefined
    Object.keys(params).forEach(k => (params[k] === undefined || params[k] === '') && delete params[k]);
    const offers = await BesitosService.getOffers(params);
    // Normalize to race game card structure
    const games = (offers || []).map(o => ({
      id: o.offer_id || o.id || o.game_id || o.slug,
      title: o.title || o.name,
      icon: o.icon || o.icon_url || o.image || o.thumbnail,
      category: o.category || o.genre || 'General',
      coinReward: o.reward?.coins || o.payout || 0,
      xpReward: o.reward?.xp || Math.round((o.payout || 0) / 2),
      provider: 'besitos',
      deepLink: o.deeplink || o.deep_link || null
    }));
    res.json({ success: true, data: { games, total: games.length } });
  } catch (error) {
    console.error('Error fetching race games from Besitos:', error);
    res.status(error.status || 500).json({ success: false, error: error.message || 'Failed to fetch games' });
  }
});

// Get level definitions for a race
router.get('/:raceKey/levels', protect, async (req, res) => {
  try {
    const { raceKey } = req.params;
    const cfg = await RaceConfig.getByKey(raceKey);
    if (!cfg) {
      return res.status(404).json({ success: false, error: 'Race config not found' });
    }
    res.json({ success: true, data: { levels: cfg.levels, requiredTier: cfg.requiredTier, maxLevels: cfg.maxLevels } });
  } catch (error) {
    console.error('Error getting race levels:', error);
    res.status(500).json({ success: false, error: 'Failed to get race levels' });
  }
});

// Tier summary for current user
router.get('/tier-summary', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const tier = getCurrentTier(user.xp?.current || 0);
    res.json({ success: true, data: { tier, xp: user.xp?.current || 0 } });
  } catch (error) {
    console.error('Error getting tier summary:', error);
    res.status(500).json({ success: false, error: 'Failed to get tier summary' });
  }
});

// Start a race
router.post('/start', protect, async (req, res) => {
  try {
    const { raceKey, gameId } = req.body;
    const user = await User.findById(req.user.userId).select('xp races');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user already has an active race
    const activeRace = user.races.find(r => r.status === 'active');
    if (activeRace) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active race. Complete it first!'
      });
    }

    // Get race config from DB
    const cfg = await RaceConfig.getByKey(raceKey);
    if (!cfg) {
      return res.status(404).json({
        success: false,
        error: 'Race not found'
      });
    }

    // Check if user meets tier requirements
    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    if (!isTierUnlocked(currentTier.id, cfg.requiredTier)) {
      return res.status(400).json({
        success: false,
        error: `This race requires ${cfg.requiredTier} tier or higher`
      });
    }

    // Create new race entry
    const newRace = {
      raceId: raceKey,
      gameId,
      status: 'active',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + (cfg.durationMs || RACE_CONFIG.timeLimit)),
      currentLevel: 0,
      completedLevels: [],
      bots: generateRaceBotsFromConfig(cfg),
      position: 0,
      totalReward: { coins: 0, xp: 0 }
    };

    user.races.push(newRace);
    await user.save();

    res.json({
      success: true,
      data: {
        race: newRace,
        message: 'Race started! Compete against AI bots to win!'
      }
    });
  } catch (error) {
    console.error('Error starting race:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start race'
    });
  }
});

// Poll race status (for frontend to refresh ladder without websocket)
router.get('/:raceId/status', protect, async (req, res) => {
  try {
    const { raceId } = req.params;
    const user = await User.findById(req.user.userId).select('races');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const race = user.races.find(r => r.raceId === raceId);
    if (!race) return res.status(404).json({ success: false, error: 'Race not found' });
    // Update bot progress on poll
    updateBotProgress(race);
    await user.save();
    res.json({ success: true, data: { race } });
  } catch (error) {
    console.error('Error getting race status:', error);
    res.status(500).json({ success: false, error: 'Failed to get race status' });
  }
});

// Update race progress
router.post('/progress', protect, async (req, res) => {
  try {
    const { raceId, level, completed } = req.body;
    const user = await User.findById(req.user.userId).select('xp races wallet');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const race = user.races.find(r => r.raceId === raceId && r.status === 'active');
    if (!race) {
      return res.status(404).json({
        success: false,
        error: 'Active race not found'
      });
    }

    // Check if race is expired
    if (new Date() > race.expiresAt) {
      race.status = 'expired';
      await user.save();
      return res.status(400).json({
        success: false,
        error: 'Race has expired'
      });
    }

    // Update user progress
    let levelReward = null;
    if (completed && !race.completedLevels.includes(level)) {
      race.completedLevels.push(level);
      race.currentLevel = Math.max(race.currentLevel, level);

      // Award level rewards
      // Resolve level reward from config if available
      const cfg = await RaceConfig.getByKey(race.raceId);
      const lvl = (cfg && Array.isArray(cfg.levels)) ? cfg.levels.find(l => l.level === level) : null;
      levelReward = lvl && lvl.reward ? { coins: lvl.reward.coins || 0, xp: lvl.reward.xp || 0 } : {
        coins: RACE_CONFIG.levelRewards.coins[level - 1] || 0,
        xp: RACE_CONFIG.levelRewards.xp[level - 1] || 0
      };

      race.totalReward.coins += levelReward.coins;
      race.totalReward.xp += levelReward.xp;

      // Update user wallet and XP
      user.wallet.balance = (user.wallet.balance || 0) + levelReward.coins;
      user.xp.current = (user.xp.current || 0) + levelReward.xp;
      user.xp.total = (user.xp.total || 0) + levelReward.xp;
    }

    // Update bot progress
    updateBotProgress(race);

    // Check if race is completed
    const cfg = await RaceConfig.getByKey(race.raceId);
    const maxLevels = (cfg && cfg.maxLevels) || RACE_CONFIG.maxLevels;
    if (race.currentLevel >= maxLevels) {
      race.status = 'completed';
      race.completedAt = new Date();
      
      // Award bonus rewards based on position
      const position = calculateRacePosition(race);
      const bonusReward = getBonusRewardFromConfig(cfg, position) || getBonusReward(position);
      
      if (bonusReward) {
        race.totalReward.coins += bonusReward.coins;
        race.totalReward.xp += bonusReward.xp;
        
        user.wallet.balance += bonusReward.coins;
        user.xp.current += bonusReward.xp;
        user.xp.total += bonusReward.xp;
      }
      
      race.position = position;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        race,
        levelCompleted: completed,
        levelReward: levelReward,
        isRaceCompleted: race.status === 'completed',
        position: race.position
      }
    });
  } catch (error) {
    console.error('Error updating race progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update race progress'
    });
  }
});

// Get race leaderboard
router.get('/:raceId/leaderboard', protect, async (req, res) => {
  try {
    const { raceId } = req.params;
    const user = await User.findById(req.user.userId).select('races');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const race = user.races.find(r => r.raceId === raceId);
    if (!race) {
      return res.status(404).json({
        success: false,
        error: 'Race not found'
      });
    }

    const leaderboard = generateLeaderboard(race);
    
    res.json({
      success: true,
      data: {
        leaderboard,
        userPosition: race.position,
        raceStatus: race.status
      }
    });
  } catch (error) {
    console.error('Error getting race leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get race leaderboard'
    });
  }
});

// Get race history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const user = await User.findById(req.user.userId).select('races');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const races = user.races
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice((page - 1) * limit, page * limit);

    const total = user.races.length;

    res.json({
      success: true,
      data: {
        races: races.map(race => ({
          raceId: race.raceId,
          gameId: race.gameId,
          status: race.status,
          position: race.position,
          totalReward: race.totalReward,
          startedAt: race.startedAt,
          completedAt: race.completedAt,
          currentLevel: race.currentLevel
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting race history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get race history'
    });
  }
});

// Retry/reset a race (clears active or last completed entry for the key)
router.post('/:raceKey/retry', protect, async (req, res) => {
  try {
    const { raceKey } = req.params;
    const user = await User.findById(req.user.userId).select('races');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    user.races = (user.races || []).filter(r => !(r.raceId === raceKey && r.status === 'active'));
    await user.save();
    res.json({ success: true, message: 'Race reset. You can start again.' });
  } catch (error) {
    console.error('Error resetting race:', error);
    res.status(500).json({ success: false, error: 'Failed to reset race' });
  }
});

// Helper functions
async function getAvailableRaces(userTier) {
  const allRaces = [
    {
      id: 'beginner-race',
      name: 'Beginner Race',
      description: 'Perfect for new players!',
      requiredTier: 'junior',
      maxLevels: 5,
      timeLimit: '2 hours',
      reward: { coins: 100, xp: 50 },
      difficulty: 'Easy',
      icon: '🏁'
    },
    {
      id: 'intermediate-race',
      name: 'Intermediate Race',
      description: 'Challenge yourself with medium difficulty!',
      requiredTier: 'mid',
      maxLevels: 8,
      timeLimit: '4 hours',
      reward: { coins: 200, xp: 100 },
      difficulty: 'Medium',
      icon: '🏆'
    },
    {
      id: 'expert-race',
      name: 'Expert Race',
      description: 'For the most skilled players!',
      requiredTier: 'senior',
      maxLevels: 10,
      timeLimit: '6 hours',
      reward: { coins: 500, xp: 250 },
      difficulty: 'Hard',
      icon: '👑'
    }
  ];

  return allRaces.filter(race => isTierUnlocked(userTier.id, race.requiredTier));
}

function getRaceDetails(raceId) {
  const races = {
    'beginner-race': {
      id: 'beginner-race',
      name: 'Beginner Race',
      requiredTier: 'junior',
      maxLevels: 5,
      timeLimit: 2 * 60 * 60 * 1000 // 2 hours
    },
    'intermediate-race': {
      id: 'intermediate-race',
      name: 'Intermediate Race',
      requiredTier: 'mid',
      maxLevels: 8,
      timeLimit: 4 * 60 * 60 * 1000 // 4 hours
    },
    'expert-race': {
      id: 'expert-race',
      name: 'Expert Race',
      requiredTier: 'senior',
      maxLevels: 10,
      timeLimit: 6 * 60 * 60 * 1000 // 6 hours
    }
  };
  
  return races[raceId];
}

function generateRaceBotsFromConfig(cfg) {
  const bots = [];
  const list = Array.isArray(cfg?.bots) && cfg.bots.length ? cfg.bots : (RACE_CONFIG.botNames.map((n, i) => ({ name: n, speed: RACE_CONFIG.botSpeeds[i] || 1.0, avatar: '🤖' })));
  const botCount = Math.min(5, list.length);
  for (let i = 0; i < botCount; i++) {
    const b = list[i];
    bots.push({ id: `bot_${i + 1}`, name: b.name, currentLevel: 0, speed: b.speed || 1.0, avatar: b.avatar || '🤖', isActive: true });
  }
  return bots;
}

function updateBotProgress(race) {
  const now = new Date();
  const timeElapsed = now - race.startedAt;
  const hoursElapsed = timeElapsed / (1000 * 60 * 60);
  
  race.bots.forEach(bot => {
    if (bot.isActive) {
      // Calculate bot progress based on time elapsed and speed
      const expectedLevel = Math.min(
        Math.floor(hoursElapsed * bot.speed * 2), // 2 levels per hour at normal speed
        RACE_CONFIG.maxLevels
      );
      
      bot.currentLevel = Math.max(bot.currentLevel, expectedLevel);
      
      // Random chance for bot to complete a level
      if (Math.random() < 0.1 && bot.currentLevel < RACE_CONFIG.maxLevels) {
        bot.currentLevel++;
      }
    }
  });
}

function calculateRacePosition(race) {
  const userLevel = race.currentLevel;
  const botLevels = race.bots.map(bot => bot.currentLevel);
  const allLevels = [userLevel, ...botLevels].sort((a, b) => b - a);
  
  return allLevels.indexOf(userLevel) + 1;
}

function getBonusReward(position) {
  if (position === 1) return RACE_CONFIG.bonusRewards.firstPlace;
  if (position === 2) return RACE_CONFIG.bonusRewards.secondPlace;
  if (position === 3) return RACE_CONFIG.bonusRewards.thirdPlace;
  return null;
}

function getBonusRewardFromConfig(cfg, position) {
  if (!cfg || !cfg.bonusRewards) return null;
  if (position === 1) return cfg.bonusRewards.firstPlace;
  if (position === 2) return cfg.bonusRewards.secondPlace;
  if (position === 3) return cfg.bonusRewards.thirdPlace;
  return null;
}

function generateLeaderboard(race) {
  const leaderboard = [];
  
  // Add user
  leaderboard.push({
    id: 'user',
    name: 'You',
    avatar: '👤',
    level: race.currentLevel,
    isUser: true
  });
  
  // Add bots
  race.bots.forEach(bot => {
    leaderboard.push({
      id: bot.id,
      name: bot.name,
      avatar: bot.avatar,
      level: bot.currentLevel,
      isUser: false
    });
  });
  
  // Sort by level (descending)
  leaderboard.sort((a, b) => b.level - a.level);
  
  return leaderboard;
}

function getCurrentTier(xp) {
  if (xp >= 10000) return { id: 'expert', name: 'Expert' };
  if (xp >= 5000) return { id: 'senior', name: 'Senior' };
  if (xp >= 1000) return { id: 'mid', name: 'Mid-Level' };
  return { id: 'junior', name: 'Junior' };
}

function isTierUnlocked(userTier, requiredTier) {
  const tierOrder = ['junior', 'mid', 'senior', 'expert'];
  const userIndex = tierOrder.indexOf(userTier);
  const requiredIndex = tierOrder.indexOf(requiredTier);
  return userIndex >= requiredIndex;
}

module.exports = router;

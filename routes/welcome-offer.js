const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Welcome Offer configuration
const WELCOME_OFFER_CONFIG = {
  duration: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  rewardAmount: 20, // $20 reward
  requiredGames: 3,
  requiredMinutes: 5, // 5 minutes per game
  maxGames: 5, // Maximum games user can download
  taskTypes: ['game', 'survey', 'challenge']
};

// Get welcome offer status
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('onboarding welcomeOffer games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is eligible for welcome offer (within 24 hours of signup)
    const signupTime = user.onboarding?.completedAt || user.createdAt;
    const now = new Date();
    const timeSinceSignup = now - signupTime;
    const isEligible = timeSinceSignup <= WELCOME_OFFER_CONFIG.duration;
    
    // Check if offer is already completed
    const isCompleted = user.welcomeOffer?.completed || false;
    const isExpired = timeSinceSignup > WELCOME_OFFER_CONFIG.duration;
    
    // Get current progress
    const progress = await getWelcomeOfferProgress(user);
    
    res.json({
      success: true,
      data: {
        isEligible,
        isCompleted,
        isExpired,
        progress,
        timeRemaining: isEligible && !isCompleted ? 
          Math.max(0, WELCOME_OFFER_CONFIG.duration - timeSinceSignup) : 0,
        rewardAmount: WELCOME_OFFER_CONFIG.rewardAmount,
        requiredGames: WELCOME_OFFER_CONFIG.requiredGames,
        requiredMinutes: WELCOME_OFFER_CONFIG.requiredMinutes
      }
    });
  } catch (error) {
    console.error('Error getting welcome offer status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get welcome offer status'
    });
  }
});

// Start welcome offer
router.post('/start', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('onboarding welcomeOffer');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check eligibility
    const signupTime = user.onboarding?.completedAt || user.createdAt;
    const now = new Date();
    const timeSinceSignup = now - signupTime;
    
    if (timeSinceSignup > WELCOME_OFFER_CONFIG.duration) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer has expired'
      });
    }

    if (user.welcomeOffer?.started) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer already started'
      });
    }

    // Initialize welcome offer
    user.welcomeOffer = {
      started: true,
      startedAt: now,
      expiresAt: new Date(signupTime.getTime() + WELCOME_OFFER_CONFIG.duration),
      completed: false,
      gamesCompleted: 0,
      totalMinutesPlayed: 0,
      rewardClaimed: false,
      tasks: generateWelcomeOfferTasks()
    };

    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Welcome offer started! Complete 3 games to earn $20!',
        expiresAt: user.welcomeOffer.expiresAt,
        tasks: user.welcomeOffer.tasks
      }
    });
  } catch (error) {
    console.error('Error starting welcome offer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start welcome offer'
    });
  }
});

// Update game progress
router.post('/progress', protect, async (req, res) => {
  try {
    const { gameId, minutesPlayed, level } = req.body;
    const user = await User.findById(req.user.userId).select('welcomeOffer games');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.welcomeOffer?.started) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer not started'
      });
    }

    if (user.welcomeOffer.completed) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer already completed'
      });
    }

    // Check if offer is expired
    if (new Date() > user.welcomeOffer.expiresAt) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer has expired'
      });
    }

    // Update game progress
    const gameIndex = user.games.findIndex(g => g.gameId === gameId);
    if (gameIndex >= 0) {
      user.games[gameIndex].welcomeOfferMinutes = (user.games[gameIndex].welcomeOfferMinutes || 0) + minutesPlayed;
      user.games[gameIndex].lastLevel = level || user.games[gameIndex].lastLevel;
    }

    // Update welcome offer progress
    const progress = await updateWelcomeOfferProgress(user, gameId, minutesPlayed);
    
    await user.save();

    res.json({
      success: true,
      data: {
        progress,
        isCompleted: progress.gamesCompleted >= WELCOME_OFFER_CONFIG.requiredGames,
        message: progress.gamesCompleted >= WELCOME_OFFER_CONFIG.requiredGames ? 
          'Congratulations! You can now claim your $20 reward!' : 
          `Keep playing! ${WELCOME_OFFER_CONFIG.requiredGames - progress.gamesCompleted} more games to go!`
      }
    });
  } catch (error) {
    console.error('Error updating welcome offer progress:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update progress'
    });
  }
});

// Claim welcome offer reward
router.post('/claim', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('welcomeOffer wallet xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.welcomeOffer?.started) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer not started'
      });
    }

    if (user.welcomeOffer.completed) {
      return res.status(400).json({
        success: false,
        error: 'Welcome offer already completed'
      });
    }

    if (user.welcomeOffer.rewardClaimed) {
      return res.status(400).json({
        success: false,
        error: 'Reward already claimed'
      });
    }

    // Check if requirements are met
    const progress = await getWelcomeOfferProgress(user);
    if (progress.gamesCompleted < WELCOME_OFFER_CONFIG.requiredGames) {
      return res.status(400).json({
        success: false,
        error: 'Requirements not met. Complete 3 games to claim reward.'
      });
    }

    // Calculate reward amount
    const rewardCoins = WELCOME_OFFER_CONFIG.rewardAmount * 100; // $20 = 2000 coins
    const rewardXP = rewardCoins * 5; // 5 XP per coin

    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + rewardCoins;
    user.wallet.lastUpdated = new Date();
    user.xp.current = (user.xp.current || 0) + rewardXP;
    user.xp.total = (user.xp.total || 0) + rewardXP;

    // Mark welcome offer as completed
    user.welcomeOffer.completed = true;
    user.welcomeOffer.rewardClaimed = true;
    user.welcomeOffer.completedAt = new Date();

    // Create transaction record
    const transaction = new Transaction({
      user: req.user.userId,
      type: 'credit',
      amount: rewardCoins,
      description: `Welcome Offer Reward - $${WELCOME_OFFER_CONFIG.rewardAmount}`,
      status: 'completed',
      referenceId: `WELCOME-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    });

    await Promise.all([
      user.save(),
      transaction.save()
    ]);

    res.json({
      success: true,
      data: {
        message: 'Congratulations! You earned $20!',
        reward: {
          coins: rewardCoins,
          xp: rewardXP,
          amount: WELCOME_OFFER_CONFIG.rewardAmount
        },
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      }
    });
  } catch (error) {
    console.error('Error claiming welcome offer reward:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to claim reward'
    });
  }
});

// Get recommended games for welcome offer
router.get('/recommended-games', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('games preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const recommendedGames = getRecommendedGamesForWelcomeOffer(user);
    
    res.json({
      success: true,
      data: {
        games: recommendedGames,
        message: 'Download these games to complete your welcome offer!'
      }
    });
  } catch (error) {
    console.error('Error getting recommended games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recommended games'
    });
  }
});

// Helper functions
async function getWelcomeOfferProgress(user) {
  const games = user.games || [];
  const welcomeOffer = user.welcomeOffer || {};
  
  let gamesCompleted = 0;
  let totalMinutesPlayed = 0;
  
  games.forEach(game => {
    const minutes = game.welcomeOfferMinutes || 0;
    if (minutes >= WELCOME_OFFER_CONFIG.requiredMinutes) {
      gamesCompleted++;
    }
    totalMinutesPlayed += minutes;
  });
  
  return {
    gamesCompleted,
    totalMinutesPlayed,
    requiredGames: WELCOME_OFFER_CONFIG.requiredGames,
    requiredMinutes: WELCOME_OFFER_CONFIG.requiredMinutes,
    progressPercentage: Math.min((gamesCompleted / WELCOME_OFFER_CONFIG.requiredGames) * 100, 100)
  };
}

async function updateWelcomeOfferProgress(user, gameId, minutesPlayed) {
  const games = user.games || [];
  const game = games.find(g => g.gameId === gameId);
  
  if (game) {
    const totalMinutes = (game.welcomeOfferMinutes || 0) + minutesPlayed;
    game.welcomeOfferMinutes = totalMinutes;
    
    // Check if this game now qualifies as completed
    if (totalMinutes >= WELCOME_OFFER_CONFIG.requiredMinutes && !game.welcomeOfferCompleted) {
      game.welcomeOfferCompleted = true;
      user.welcomeOffer.gamesCompleted = (user.welcomeOffer.gamesCompleted || 0) + 1;
    }
  }
  
  return await getWelcomeOfferProgress(user);
}

function generateWelcomeOfferTasks() {
  return [
    {
      id: 'task_1',
      title: 'Download and play 3 games',
      description: 'Download any 3 games and play each for at least 5 minutes',
      type: 'game',
      required: 3,
      completed: 0,
      reward: {
        coins: WELCOME_OFFER_CONFIG.rewardAmount * 100,
        xp: WELCOME_OFFER_CONFIG.rewardAmount * 500
      }
    }
  ];
}

function getRecommendedGamesForWelcomeOffer(user) {
  const allGames = [
    {
      id: 'puzzle-master',
      name: 'Puzzle Master',
      icon: '🧩',
      genre: 'Puzzle',
      difficulty: 'Easy',
      timeRequired: '5 min',
      earningPotential: 50,
      description: 'Perfect for beginners - easy to learn, fun to play!',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/puzzle-master.jpg',
      isNew: false
    },
    {
      id: 'memory-game',
      name: 'Memory Game',
      icon: '🧠',
      genre: 'Arcade',
      difficulty: 'Easy',
      timeRequired: '5 min',
      earningPotential: 40,
      description: 'Train your memory while earning rewards!',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/memory-game.jpg',
      isNew: false
    },
    {
      id: 'word-challenge',
      name: 'Word Challenge',
      icon: '📝',
      genre: 'Strategy',
      difficulty: 'Medium',
      timeRequired: '10 min',
      earningPotential: 80,
      description: 'Test your vocabulary skills!',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/word-challenge.jpg',
      isNew: true
    },
    {
      id: 'orbit-fall',
      name: 'Orbit Fall',
      icon: '🌌',
      genre: 'Action',
      difficulty: 'Hard',
      timeRequired: '15 min',
      earningPotential: 150,
      description: 'High-reward action game for experienced players!',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/orbit-fall.jpg',
      isNew: false
    },
    {
      id: 'speed-racer',
      name: 'Speed Racer',
      icon: '🏎️',
      genre: 'Racing',
      difficulty: 'Medium',
      timeRequired: '10 min',
      earningPotential: 100,
      description: 'Race to victory and earn big rewards!',
      imageUrl: 'https://rewardsapi.hireagent.co/uploads/games/speed-racer.jpg',
      isNew: true
    }
  ];
  
  // Filter out games user has already played
  const playedGameIds = (user.games || []).map(g => g.gameId);
  return allGames.filter(game => !playedGameIds.includes(game.id));
}

module.exports = router;

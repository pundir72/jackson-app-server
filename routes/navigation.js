const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');

// Navigation configuration
const NAVIGATION_CONFIG = {
  mainTabs: [
    {
      id: 'home',
      name: 'Home',
      icon: '🏠',
      route: '/home',
      isActive: true
    },
    {
      id: 'games',
      name: 'My Games',
      icon: '🎮',
      route: '/games',
      isActive: false
    },
    {
      id: 'wallet',
      name: 'My Wallet',
      icon: '💰',
      route: '/wallet',
      isActive: false
    },
    {
      id: 'coach',
      name: 'Cash Coach',
      icon: '🎯',
      route: '/cash-coach',
      isActive: false
    }
  ],
  quickAccess: [
    {
      id: 'deals',
      name: 'Deals',
      icon: '🎁',
      route: '/deals',
      description: 'Exclusive offers and promotions'
    },
    {
      id: 'challenges',
      name: 'Daily Challenges',
      icon: '🏆',
      route: '/daily-challenges',
      description: 'Complete tasks to earn rewards'
    },
    {
      id: 'rewards',
      name: 'Daily Rewards',
      icon: '🎊',
      route: '/daily-rewards',
      description: 'Claim your daily login bonus'
    }
  ],
  appVersion: process.env.APP_VERSION || 'v0.0.1'
};

// Get navigation data
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp vip badges');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentXP = user.xp.current || 0;
    const currentTier = getCurrentTier(currentXP);
    const vipLevel = user.vip?.level || 'free';
    
    // Get notification counts
    const notifications = await getNotificationCounts(user);
    
    // Get quick access items with availability
    const quickAccess = await getQuickAccessItems(user, currentTier, vipLevel);
    
    res.json({
      success: true,
      data: {
        mainTabs: NAVIGATION_CONFIG.mainTabs.map(tab => ({
          ...tab,
          notificationCount: notifications[tab.id] || 0
        })),
        quickAccess,
        appVersion: NAVIGATION_CONFIG.appVersion,
        userTier: currentTier.id,
        vipLevel,
        badges: user.badges || []
      }
    });
  } catch (error) {
    console.error('Error getting navigation data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get navigation data'
    });
  }
});

// Get specific tab data
router.get('/tab/:tabId', protect, async (req, res) => {
  try {
    const { tabId } = req.params;
    const user = await User.findById(req.user.userId).select('xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const tabData = await getTabData(tabId, user);
    
    if (!tabData) {
      return res.status(404).json({
        success: false,
        error: 'Tab not found'
      });
    }

    res.json({
      success: true,
      data: tabData
    });
  } catch (error) {
    console.error('Error getting tab data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tab data'
    });
  }
});

// Get quick access data
router.get('/quick/:itemId', protect, async (req, res) => {
  try {
    const { itemId } = req.params;
    const user = await User.findById(req.user.userId).select('xp vip');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const quickAccessData = await getQuickAccessData(itemId, user);
    
    if (!quickAccessData) {
      return res.status(404).json({
        success: false,
        error: 'Quick access item not found'
      });
    }

    res.json({
      success: true,
      data: quickAccessData
    });
  } catch (error) {
    console.error('Error getting quick access data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quick access data'
    });
  }
});

// Update active tab
router.post('/active-tab', protect, async (req, res) => {
  try {
    const { tabId } = req.body;
    const user = await User.findById(req.user.userId).select('preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user's last active tab
    if (!user.preferences) user.preferences = {};
    user.preferences.lastActiveTab = tabId;
    user.preferences.lastTabSwitch = new Date();
    
    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Active tab updated',
        activeTab: tabId
      }
    });
  } catch (error) {
    console.error('Error updating active tab:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update active tab'
    });
  }
});

// Get app version info
router.get('/version', protect, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        version: NAVIGATION_CONFIG.appVersion,
        buildNumber: process.env.BUILD_NUMBER || '1',
        lastUpdated: process.env.BUILD_DATE || new Date().toISOString(),
        features: [
          'Homepage Dashboard',
          'Most Played Games',
          'Welcome Offer System',
          'Race Module',
          'Survey Integration',
          '30-Day Streak',
          'VIP Membership',
          'Cash Coach'
        ]
      }
    });
  } catch (error) {
    console.error('Error getting version info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get version info'
    });
  }
});

// Helper functions
async function getNotificationCounts(user) {
  const counts = {};
  
  try {
    // Get unread notifications for each tab
    counts.home = await getHomeNotificationCount(user);
    counts.games = await getGamesNotificationCount(user);
    counts.wallet = await getWalletNotificationCount(user);
    counts.coach = await getCoachNotificationCount(user);
  } catch (error) {
    console.error('Error getting notification counts:', error);
  }
  
  return counts;
}

async function getHomeNotificationCount(user) {
  // Count new offers, challenges, etc.
  let count = 0;
  
  // Check for new welcome offer
  if (!user.welcomeOffer?.completed && !user.welcomeOffer?.started) {
    count++;
  }
  
  // Check for new daily challenges
  const today = new Date();
  const lastChallengeCheck = user.preferences?.lastChallengeCheck;
  if (!lastChallengeCheck || new Date(lastChallengeCheck) < today) {
    count++;
  }
  
  return count;
}

async function getGamesNotificationCount(user) {
  // Count new games, updates, etc.
  let count = 0;
  
  // Check for new game recommendations
  const lastGameCheck = user.preferences?.lastGameCheck;
  const today = new Date();
  if (!lastGameCheck || new Date(lastGameCheck) < today) {
    count++;
  }
  
  return count;
}

async function getWalletNotificationCount(user) {
  // Count pending transactions, new rewards, etc.
  let count = 0;
  
  // Check for pending withdrawals
  const pendingWithdrawals = user.withdrawals?.filter(w => w.status === 'pending').length || 0;
  count += pendingWithdrawals;
  
  // Check for new rewards
  const lastRewardCheck = user.preferences?.lastRewardCheck;
  const today = new Date();
  if (!lastRewardCheck || new Date(lastRewardCheck) < today) {
    count++;
  }
  
  return count;
}

async function getCoachNotificationCount(user) {
  // Count new insights, goal updates, etc.
  let count = 0;
  
  // Check for new financial insights
  const lastInsightCheck = user.preferences?.lastInsightCheck;
  const today = new Date();
  if (!lastInsightCheck || new Date(lastInsightCheck) < today) {
    count++;
  }
  
  return count;
}

async function getQuickAccessItems(user, currentTier, vipLevel) {
  const items = [];
  
  for (const item of NAVIGATION_CONFIG.quickAccess) {
    const isAvailable = await isQuickAccessAvailable(item.id, user, currentTier, vipLevel);
    
    items.push({
      ...item,
      isAvailable,
      notificationCount: await getQuickAccessNotificationCount(item.id, user)
    });
  }
  
  return items;
}

async function isQuickAccessAvailable(itemId, user, currentTier, vipLevel) {
  switch (itemId) {
    case 'deals':
      return true; // Always available
    case 'challenges':
      return currentTier.id !== 'junior' || vipLevel !== 'free';
    case 'rewards':
      return true; // Always available
    default:
      return true;
  }
}

async function getQuickAccessNotificationCount(itemId, user) {
  switch (itemId) {
    case 'deals':
      return await getDealsNotificationCount(user);
    case 'challenges':
      return await getChallengesNotificationCount(user);
    case 'rewards':
      return await getRewardsNotificationCount(user);
    default:
      return 0;
  }
}

async function getDealsNotificationCount(user) {
  // Count new deals, promotions
  let count = 0;
  
  const lastDealCheck = user.preferences?.lastDealCheck;
  const today = new Date();
  if (!lastDealCheck || new Date(lastDealCheck) < today) {
    count++;
  }
  
  return count;
}

async function getChallengesNotificationCount(user) {
  // Count new challenges, incomplete challenges
  let count = 0;
  
  // Check for incomplete daily challenges
  const today = new Date();
  const lastChallengeCheck = user.preferences?.lastChallengeCheck;
  if (!lastChallengeCheck || new Date(lastChallengeCheck) < today) {
    count++;
  }
  
  return count;
}

async function getRewardsNotificationCount(user) {
  // Count claimable rewards
  let count = 0;
  
  // Check for unclaimed daily rewards
  const today = new Date();
  const lastRewardCheck = user.preferences?.lastRewardCheck;
  if (!lastRewardCheck || new Date(lastRewardCheck) < today) {
    count++;
  }
  
  return count;
}

async function getTabData(tabId, user) {
  switch (tabId) {
    case 'home':
      return {
        title: 'Home',
        data: await getHomeTabData(user)
      };
    case 'games':
      return {
        title: 'My Games',
        data: await getGamesTabData(user)
      };
    case 'wallet':
      return {
        title: 'My Wallet',
        data: await getWalletTabData(user)
      };
    case 'coach':
      return {
        title: 'Cash Coach',
        data: await getCoachTabData(user)
      };
    default:
      return null;
  }
}

async function getHomeTabData(user) {
  return {
    greeting: `Hi ${user.firstName || 'there'}!`,
    walletBalance: user.wallet?.balance || 0,
    xp: user.xp?.current || 0,
    streak: user.streak?.current || 0
  };
}

async function getGamesTabData(user) {
  return {
    totalGames: user.games?.length || 0,
    completedGames: user.games?.filter(g => g.completed).length || 0,
    recentGames: user.games?.slice(-5) || []
  };
}

async function getWalletTabData(user) {
  return {
    balance: user.wallet?.balance || 0,
    currency: user.wallet?.currency || 'coins',
    recentTransactions: [] // Would fetch from Transaction model
  };
}

async function getCoachTabData(user) {
  return {
    currentGoal: user.cashCoach?.financialGoals?.revenueGoal || 0,
    progress: user.cashCoach?.taskProgress?.progress || 0,
    insights: [] // Would fetch from FinancialInsight model
  };
}

async function getQuickAccessData(itemId, user) {
  switch (itemId) {
    case 'deals':
      return {
        title: 'Deals',
        items: [] // Would fetch from Deals model
      };
    case 'challenges':
      return {
        title: 'Daily Challenges',
        items: [] // Would fetch from challenges
      };
    case 'rewards':
      return {
        title: 'Daily Rewards',
        items: [] // Would fetch from rewards
      };
    default:
      return null;
  }
}

function getCurrentTier(xp) {
  if (xp >= 10000) return { id: 'expert', name: 'Expert' };
  if (xp >= 5000) return { id: 'senior', name: 'Senior' };
  if (xp >= 1000) return { id: 'mid', name: 'Mid-Level' };
  return { id: 'junior', name: 'Junior' };
}

module.exports = router;

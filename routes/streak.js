const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// Streak configuration
const STREAK_CONFIG = {
  maxDays: 30,
  milestones: [7, 14, 21, 30],
  rewards: {
    7: { coins: 50, xp: 25, badge: 'Week Warrior 🏆' },
    14: { coins: 150, xp: 75, badge: 'Fortnight Fighter 🥇' },
    21: { coins: 300, xp: 150, badge: 'Three Week Titan 🏅' },
    30: { coins: 500, xp: 250, badge: 'Monthly Master 👑' }
  },
  resetFallback: true, // Reset to last milestone instead of 0
  taskTypes: ['game', 'survey', 'challenge', 'receipt']
};

// Get streak status
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('xp streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    const lastMilestone = getLastMilestone(currentStreak);
    const nextMilestone = getNextMilestone(currentStreak);
    
    // Check if streak needs to be updated
    const today = new Date();
    const lastUpdate = streak.lastUpdated ? new Date(streak.lastUpdated) : null;
    const needsUpdate = !lastUpdate || !isSameDay(today, lastUpdate);
    
    if (needsUpdate) {
      await updateStreakStatus(user);
    }

    res.json({
      success: true,
      data: {
        currentStreak,
        lastMilestone,
        nextMilestone,
        isActive: currentStreak > 0,
        daysRemaining: nextMilestone ? nextMilestone.day - currentStreak : 0,
        progress: {
          current: currentStreak,
          target: nextMilestone ? nextMilestone.day : STREAK_CONFIG.maxDays,
          percentage: nextMilestone ? Math.round((currentStreak / nextMilestone.day) * 100) : 100
        },
        rewards: getAvailableRewards(currentStreak),
        streakTree: generateStreakTree(currentStreak)
      }
    });
  } catch (error) {
    console.error('Error getting streak status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak status'
    });
  }
});

// Complete daily task
router.post('/complete-task', protect, async (req, res) => {
  try {
    const { taskType, taskId } = req.body;
    const user = await User.findById(req.user.userId).select('xp streak wallet');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate task type
    if (!STREAK_CONFIG.taskTypes.includes(taskType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task type'
      });
    }

    // Check if task was already completed today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (user.streak?.completedTasks?.includes(todayStr)) {
      return res.status(400).json({
        success: false,
        error: 'Daily task already completed today'
      });
    }

    // Update streak
    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    const newStreak = currentStreak + 1;
    
    // Update streak data
    user.streak = {
      current: newStreak,
      lastUpdated: today,
      completedTasks: [...(streak.completedTasks || []), todayStr],
      lastTaskType: taskType,
      lastTaskId: taskId
    };

    // Check for milestone rewards
    const milestoneReward = getMilestoneReward(newStreak);
    let rewardEarned = null;
    
    if (milestoneReward) {
      // Award milestone reward
      user.wallet.balance = (user.wallet.balance || 0) + milestoneReward.coins;
      user.xp.current = (user.xp.current || 0) + milestoneReward.xp;
      user.xp.total = (user.xp.total || 0) + milestoneReward.xp;
      
      // Add badge to user profile
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(milestoneReward.badge)) {
        user.badges.push(milestoneReward.badge);
      }
      
      // Create transaction record
      const transaction = new Transaction({
        user: req.user.userId,
        type: 'credit',
        amount: milestoneReward.coins,
        description: `Streak Milestone Reward - Day ${newStreak}`,
        status: 'completed',
        referenceId: `STREAK-${newStreak}-${Date.now()}`
      });
      
      await transaction.save();
      
      rewardEarned = milestoneReward;
    }

    await user.save();

    res.json({
      success: true,
      data: {
        message: 'Daily task completed!',
        newStreak: newStreak,
        milestoneReached: !!milestoneReward,
        reward: rewardEarned,
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        badges: user.badges || []
      }
    });
  } catch (error) {
    console.error('Error completing daily task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete daily task'
    });
  }
});

// Get streak history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const user = await User.findById(req.user.userId).select('streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const streak = user.streak || {};
    const completedTasks = streak.completedTasks || [];
    
    // Generate streak history for the last 30 days
    const history = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const isCompleted = completedTasks.includes(dateStr);
      
      history.push({
        day: 30 - i,
        date: dateStr,
        isCompleted,
        isToday: i === 0,
        isMilestone: STREAK_CONFIG.milestones.includes(30 - i)
      });
    }

    res.json({
      success: true,
      data: {
        history,
        currentStreak: streak.current || 0,
        totalDays: completedTasks.length,
        milestones: STREAK_CONFIG.milestones.map(day => ({
          day,
          reward: STREAK_CONFIG.rewards[day],
          isReached: (streak.current || 0) >= day
        }))
      }
    });
  } catch (error) {
    console.error('Error getting streak history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak history'
    });
  }
});

// Reset streak (if user misses a day)
router.post('/reset', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('streak');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const streak = user.streak || {};
    const currentStreak = streak.current || 0;
    const lastMilestone = getLastMilestone(currentStreak);
    
    if (STREAK_CONFIG.resetFallback && lastMilestone) {
      // Reset to last milestone
      user.streak = {
        current: lastMilestone.day,
        lastUpdated: new Date(),
        completedTasks: streak.completedTasks || [],
        resetAt: new Date(),
        resetReason: 'missed_day'
      };
      
      await user.save();
      
      res.json({
        success: true,
        data: {
          message: `Streak reset to Day ${lastMilestone.day} (last milestone)`,
          newStreak: lastMilestone.day,
          resetReason: 'missed_day'
        }
      });
    } else {
      // Reset to 0
      user.streak = {
        current: 0,
        lastUpdated: new Date(),
        completedTasks: [],
        resetAt: new Date(),
        resetReason: 'missed_day'
      };
      
      await user.save();
      
      res.json({
        success: true,
        data: {
          message: 'Streak reset to Day 0',
          newStreak: 0,
          resetReason: 'missed_day'
        }
      });
    }
  } catch (error) {
    console.error('Error resetting streak:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset streak'
    });
  }
});

// Get streak leaderboard
router.get('/leaderboard', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Get top users by streak
    const topUsers = await User.find({
      'streak.current': { $gt: 0 }
    })
    .select('firstName streak badges')
    .sort({ 'streak.current': -1 })
    .limit(parseInt(limit));

    const leaderboard = topUsers.map((user, index) => ({
      rank: index + 1,
      name: user.firstName || 'Anonymous',
      streak: user.streak.current || 0,
      badges: user.badges || [],
      isCurrentUser: user._id.toString() === req.user.userId
    }));

    res.json({
      success: true,
      data: {
        leaderboard,
        totalUsers: topUsers.length
      }
    });
  } catch (error) {
    console.error('Error getting streak leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get streak leaderboard'
    });
  }
});

// Helper functions
async function updateStreakStatus(user) {
  const today = new Date();
  const streak = user.streak || {};
  const lastUpdate = streak.lastUpdated ? new Date(streak.lastUpdated) : null;
  
  if (!lastUpdate) {
    // First time - initialize streak
    user.streak = {
      current: 0,
      lastUpdated: today,
      completedTasks: []
    };
  } else {
    const daysDiff = Math.floor((today - lastUpdate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 1) {
      // Streak broken - reset
      const lastMilestone = getLastMilestone(streak.current || 0);
      
      if (STREAK_CONFIG.resetFallback && lastMilestone) {
        user.streak = {
          current: lastMilestone.day,
          lastUpdated: today,
          completedTasks: streak.completedTasks || [],
          resetAt: today,
          resetReason: 'missed_day'
        };
      } else {
        user.streak = {
          current: 0,
          lastUpdated: today,
          completedTasks: [],
          resetAt: today,
          resetReason: 'missed_day'
        };
      }
    }
  }
  
  await user.save();
}

function getLastMilestone(currentStreak) {
  const milestones = STREAK_CONFIG.milestones.filter(day => day <= currentStreak);
  return milestones.length > 0 ? { day: Math.max(...milestones) } : null;
}

function getNextMilestone(currentStreak) {
  const milestones = STREAK_CONFIG.milestones.filter(day => day > currentStreak);
  return milestones.length > 0 ? { day: Math.min(...milestones) } : null;
}

function getMilestoneReward(currentStreak) {
  return STREAK_CONFIG.rewards[currentStreak] || null;
}

function getAvailableRewards(currentStreak) {
  const rewards = [];
  
  STREAK_CONFIG.milestones.forEach(day => {
    if (day > currentStreak) {
      rewards.push({
        day,
        reward: STREAK_CONFIG.rewards[day],
        isReached: false,
        isNext: day === getNextMilestone(currentStreak)?.day
      });
    }
  });
  
  return rewards;
}

function generateStreakTree(currentStreak) {
  const tree = [];
  
  for (let day = 1; day <= STREAK_CONFIG.maxDays; day++) {
    const isCompleted = day <= currentStreak;
    const isMilestone = STREAK_CONFIG.milestones.includes(day);
    
    tree.push({
      day,
      isCompleted,
      isMilestone,
      reward: isMilestone ? STREAK_CONFIG.rewards[day] : null,
      isCurrent: day === currentStreak + 1
    });
  }
  
  return tree;
}

function isSameDay(date1, date2) {
  return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

module.exports = router;

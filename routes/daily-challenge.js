/**
 * Daily Challenge Routes (User-Facing)
 * Implements calendar view, today's challenge, game selection, and completion
 * @module routes/daily-challenge
 */

const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');
const DailyChallenge = require('../models/DailyChallenge');
const UserChallengeProgress = require('../models/UserChallengeProgress');
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const BesitosConversion = require('../models/BesitosConversion');
const besitosService = require('../services/besitos.service');

// ==================== CALENDAR VIEW ====================

/**
 * @route   GET /api/daily-challenge/calendar
 * @desc    Get calendar view of daily challenges for user
 * @query   {number} year - Year (default: current year)
 * @query   {number} month - Month 0-11 (default: current month)
 * @access  Private
 */
router.get('/calendar', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentDate = new Date();
    const year = req.query.year ? parseInt(req.query.year) : currentDate.getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : currentDate.getMonth();
    
    const user = await User.findById(userId).select('streak');
    
    // Get start and end dates for the month
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all challenges for the month
    const challenges = await DailyChallenge.find({
      challengeDate: {
        $gte: startDate,
        $lte: endDate
      },
      isVisible: true
    }).sort({ challengeDate: 1 });
    
    // Get user's progress for the month
    const userProgress = await UserChallengeProgress.find({
      userId,
      challengeDate: {
        $gte: startDate,
        $lte: endDate
      }
    });
    
    // Create a map of progress by date
    const progressMap = {};
    userProgress.forEach(progress => {
      const dateKey = progress.challengeDate.toISOString().split('T')[0];
      progressMap[dateKey] = progress;
    });
    
    // Get user's streak data
    const streakData = user.streak || {};
    const completedTasks = streakData.completedTasks || [];
    
    // Build calendar data
    const calendarDays = [];
    const daysInMonth = endDate.getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toISOString().split('T')[0];
      const dayTimestamp = date.getTime();
      const todayTimestamp = today.getTime();
      
      // Determine day state
      const isToday = dayTimestamp === todayTimestamp;
      const isFuture = dayTimestamp > todayTimestamp;
      const isPast = dayTimestamp < todayTimestamp;
      const isCompleted = completedTasks.includes(dateKey) || (progressMap[dateKey] && progressMap[dateKey].status === 'completed');
      const isMissed = isPast && !isCompleted;
      
      // Find challenge for this date
      const challenge = challenges.find(c => {
        const challengeDate = new Date(c.challengeDate);
        challengeDate.setHours(0, 0, 0, 0);
        return challengeDate.getTime() === dayTimestamp;
      });
      
      // Get user progress for this date
      const progress = progressMap[dateKey];
      
      // Build day data
      const dayData = {
        day: day,
        date: dateKey,
        dayOfWeek: date.getDay(), // 0 = Sunday
        isToday,
        isFuture,
        isPast,
        isCompleted,
        isMissed,
        isLocked: isFuture || isMissed,
        isClickable: isToday,
        challenge: challenge ? {
          id: challenge._id,
          title: challenge.title,
          type: challenge.type,
          coinReward: challenge.coinReward,
          xpReward: challenge.xpReward,
          hasGame: !!challenge.assignedGame?.gameId,
          hasSdkTask: challenge.sdkTask?.provider !== 'none'
        } : null,
        progress: progress ? {
          status: progress.status,
          percentage: progress.progress?.percentage || 0,
          rewardsEarned: progress.rewardsEarned
        } : null,
        // Milestone flags
        isMilestone: [5, 10, 20, 30].includes(streakData.current >= day ? day : 0)
      };
      
      calendarDays.push(dayData);
    }
    
    res.json({
      success: true,
      data: {
        year,
        month,
        monthName: startDate.toLocaleString('default', { month: 'long' }),
        today: today.toISOString().split('T')[0],
        calendarDays,
        streak: {
          current: streakData.current || 0,
          milestones: [5, 10, 20, 30],
          nextMilestone: [5, 10, 20, 30].find(m => m > (streakData.current || 0)) || 30
        }
      }
    });
  } catch (error) {
    console.error('Error getting calendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get calendar data'
    });
  }
});

// ==================== TODAY'S CHALLENGE ====================

/**
 * @route   GET /api/daily-challenge/today
 * @desc    Get today's challenge with countdown timer
 * @access  Private
 */
router.get('/today', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const user = await User.findById(userId).select('xp age location vip');
    
    // Determine day window (inclusive start, end of day)
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const now = new Date();
    
    // Find today's challenge (tolerant to timezone/time parts)
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: startOfDay, $lte: endOfDay },
      isVisible: true,
      // Ensure it's within live scheduling window
      'scheduling.startTime': { $lte: now },
      'scheduling.endTime': { $gte: now }
    }).populate('assignedGame.gameId');
    
    if (!challenge) {
      return res.json({
        success: true,
        data: {
          hasChallenge: false,
          message: 'No challenge available for today'
        }
      });
    }
    
    // Check if user can access this challenge
    const canAccess = challenge.canUserAccess({
      xp: user.xp?.current || 0,
      age: user.age,
      country: user.location?.current?.country
    });
    
    if (!canAccess) {
      return res.json({
        success: true,
        data: {
          hasChallenge: false,
          message: 'This challenge is not available for you'
        }
      });
    }
    
    // Get or create user's progress for today
    let progress = await UserChallengeProgress.getOrCreateTodayChallenge(
      userId,
      challenge._id,
      today
    );
    
    // Mark as viewed if not yet viewed
    if (progress.status === 'not_started') {
      await progress.markViewed();
      await challenge.updateAnalytics('view');
    }
    
    // Calculate time remaining (until end of day)
    const timeRemaining = Math.max(0, endOfDay - new Date());
    
    // Calculate countdown in hours, minutes, seconds
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    
    // Build response
    const responseData = {
      hasChallenge: true,
      challenge: {
        id: challenge._id,
        title: challenge.title,
        description: challenge.description,
        type: challenge.type,
        instructions: challenge.content?.instructions,
        mediaUrl: challenge.content?.mediaUrl,
        coinReward: challenge.coinReward,
        xpReward: challenge.xpReward,
        claimType: challenge.claimType,
        assignedGame: challenge.assignedGame?.gameId ? {
          id: challenge.assignedGame.gameId._id,
          title: challenge.assignedGame.gameId.title,
          iconUrl: challenge.assignedGame.gameId.metadata?.iconUrl,
          deepLink: challenge.assignedGame.gameId.metadata?.deepLink,
          isRequired: challenge.assignedGame.isRequired
        } : null,
        hasSdkTask: challenge.sdkTask?.provider !== 'none',
        sdkTask: challenge.sdkTask?.provider !== 'none' ? {
          provider: challenge.sdkTask.provider,
          taskId: challenge.sdkTask.taskId,
          offerId: challenge.sdkTask.offerId
        } : null
      },
      progress: {
        status: progress.status,
        percentage: progress.progress?.percentage || 0,
        selectedGame: progress.selectedGame?.gameId ? {
          id: progress.selectedGame.gameId,
          selectedAt: progress.selectedGame.selectedAt
        } : null,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        rewardsEarned: progress.rewardsEarned,
        rewardsClaimed: progress.rewardsClaimed
      },
      countdown: {
        timeRemaining, // milliseconds
        hours,
        minutes,
        seconds,
        formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
        endsAt: endOfDay.toISOString()
      },
      actions: {
        canSelectGame: !challenge.assignedGame?.isRequired && !progress.selectedGame?.gameId && progress.status !== 'completed',
        canPlay: (challenge.assignedGame?.gameId || progress.selectedGame?.gameId) && progress.status !== 'completed',
        canComplete: progress.status === 'in_progress' || progress.status === 'started',
        canClaimRewards: progress.status === 'completed' && !progress.rewardsClaimed
      }
    };
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error getting today challenge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today\'s challenge'
    });
  }
});

// ==================== GAME SELECTION ====================

/**
 * @route   POST /api/daily-challenge/select-game
 * @desc    Select a game for today's challenge
 * @body    {string} gameId - Game ID to select
 * @access  Private
 */
router.post('/select-game', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { gameId } = req.body;
    
    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: 'Game ID is required'
      });
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's challenge (day range + scheduling window)
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const now = new Date();

    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: startOfDay, $lte: endOfDay },
      isVisible: true,
      'scheduling.startTime': { $lte: now },
      'scheduling.endTime': { $gte: now }
    });
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: 'No challenge available for today'
      });
    }
    
    // Check if game selection is allowed
    if (challenge.assignedGame?.isRequired) {
      return res.status(400).json({
        success: false,
        error: 'This challenge has a required game, you cannot select a different one'
      });
    }
    
    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }
    
    // Get user's progress
    let progress = await UserChallengeProgress.getUserChallengeForDate(userId, today);
    
    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(userId, challenge._id, today);
    }
    
    // Check if challenge already completed
    if (progress.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Challenge already completed'
      });
    }
    
    // Select the game
    await progress.selectGame(gameId);
    
    res.json({
      success: true,
      message: 'Game selected successfully',
      data: {
        selectedGame: {
          id: game._id,
          title: game.title,
          iconUrl: game.metadata?.iconUrl,
          deepLink: game.metadata?.deepLink
        },
        canPlayNow: true
      }
    });
  } catch (error) {
    console.error('Error selecting game:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to select game'
    });
  }
});

// ==================== START CHALLENGE ====================

/**
 * @route   POST /api/daily-challenge/start
 * @desc    Start today's challenge
 * @access  Private
 */
router.post('/start', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get today's challenge using day range + scheduling window
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const now = new Date();

    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: startOfDay, $lte: endOfDay },
      isVisible: true,
      'scheduling.startTime': { $lte: now },
      'scheduling.endTime': { $gte: now }
    }).populate('assignedGame.gameId');
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: 'No challenge available for today'
      });
    }
    
    // Get user's progress
    let progress = await UserChallengeProgress.getUserChallengeForDate(userId, today);
    
    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(userId, challenge._id, today);
    }
    
    // Check if game is required/selected
    const hasGame = challenge.assignedGame?.gameId || progress.selectedGame?.gameId;
    if (!hasGame && challenge.type === 'game') {
      return res.status(400).json({
        success: false,
        error: 'Please select a game first'
      });
    }
    
    // Mark as started
    await progress.markStarted();
    await challenge.updateAnalytics('start');
    
    // Get the game to play
    let gameToPlay = null;
    if (challenge.assignedGame?.gameId) {
      gameToPlay = challenge.assignedGame.gameId;
    } else if (progress.selectedGame?.gameId) {
      gameToPlay = await Game.findById(progress.selectedGame.gameId);
    }
    
    res.json({
      success: true,
      message: 'Challenge started',
      data: {
        challengeId: challenge._id,
        status: progress.status,
        game: gameToPlay ? {
          id: gameToPlay._id,
          title: gameToPlay.title,
          deepLink: gameToPlay.metadata?.deepLink,
          packageName: gameToPlay.metadata?.packageName
        } : null,
        sdkTask: challenge.sdkTask?.provider !== 'none' ? challenge.sdkTask : null
      }
    });
  } catch (error) {
    console.error('Error starting challenge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start challenge'
    });
  }
});

// ==================== COMPLETE CHALLENGE ====================

/**
 * @route   POST /api/daily-challenge/complete
 * @desc    Complete today's challenge and claim rewards
 * @body    {string} conversionId - Optional Besitos conversion ID
 * @access  Private
 */
router.post('/complete', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversionId } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const user = await User.findById(userId).select('wallet xp streak badges');
    
    // Get today's challenge using day range + scheduling window
    const startOfDay = new Date(today);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const now = new Date();

    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: startOfDay, $lte: endOfDay },
      isVisible: true,
      'scheduling.startTime': { $lte: now },
      'scheduling.endTime': { $gte: now }
    });
    
    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: 'No challenge available for today'
      });
    }
    
    // Get user's progress
    const progress = await UserChallengeProgress.getUserChallengeForDate(userId, today);
    
    if (!progress) {
      return res.status(400).json({
        success: false,
        error: 'Challenge not started'
      });
    }
    
    // Check if already completed today
    if (progress.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Challenge already completed today'
      });
    }
    
    // Calculate rewards (with potential VIP bonuses)
    let coinReward = challenge.coinReward;
    let xpReward = challenge.xpReward;
    let bonusCoins = 0;
    let bonusXP = 0;
    
    // Apply VIP multipliers
    if (user.vip?.isActive) {
      const vipLevel = user.vip.level;
      if (vipLevel === 'gold') {
        bonusXP = Math.floor(xpReward * 0.5); // 50% bonus
      } else if (vipLevel === 'platinum') {
        bonusXP = Math.floor(xpReward); // 100% bonus
        bonusCoins = Math.floor(coinReward * 0.25); // 25% bonus
      }
    }
    
    const totalCoins = coinReward + bonusCoins;
    const totalXP = xpReward + bonusXP;
    
    // Update user wallet and XP
    user.wallet.balance = (user.wallet.balance || 0) + totalCoins;
    user.xp.current = (user.xp.current || 0) + totalXP;
    user.xp.total = (user.xp.total || 0) + totalXP;
    
    // Update streak
    const streak = user.streak || {};
    if (!streak.completedTasks) streak.completedTasks = [];
    
    if (!streak.completedTasks.includes(todayStr)) {
      streak.completedTasks.push(todayStr);
      streak.current = (streak.current || 0) + 1;
      streak.lastUpdated = new Date();
      streak.lastTaskType = 'challenge';
      user.streak = streak;
    }
    
    await user.save();
    
    // Mark progress as completed
    await progress.markCompleted({
      coins: coinReward,
      xp: xpReward,
      bonusCoins,
      bonusXP
    });
    await progress.claimRewards();
    
    // Update challenge analytics
    await challenge.updateAnalytics('complete', {
      coins: totalCoins,
      xp: totalXP
    });
    
    // Create transaction record
    const transaction = new Transaction({
      user: userId,
      type: 'credit',
      amount: totalCoins,
      description: `Daily Challenge: ${challenge.title}`,
      status: 'completed',
      metadata: {
        challengeId: challenge._id,
        challengeType: challenge.type,
        xpEarned: totalXP,
        bonusCoins,
        bonusXP
      },
      referenceId: `DAILY-CHALLENGE-${challenge._id}-${Date.now()}`
    });
    
    await transaction.save();
    
    // Check for streak milestones
    const streakMilestones = [5, 10, 20, 30];
    const milestoneReached = streakMilestones.find(m => m === streak.current);
    
    res.json({
      success: true,
      message: 'Challenge completed successfully!',
      data: {
        rewards: {
          coins: coinReward,
          xp: xpReward,
          bonusCoins,
          bonusXP,
          totalCoins,
          totalXP
        },
        newBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current
        },
        streak: {
          current: streak.current,
          milestoneReached: milestoneReached || null,
          nextMilestone: streakMilestones.find(m => m > streak.current) || null
        },
        transaction: {
          id: transaction._id,
          amount: transaction.amount
        }
      }
    });
  } catch (error) {
    console.error('Error completing challenge:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete challenge'
    });
  }
});

// ==================== USER HISTORY ====================

/**
 * @route   GET /api/daily-challenge/history
 * @desc    Get user's challenge history
 * @query   {number} limit - Number of records (default: 30)
 * @access  Private
 */
router.get('/history', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 30;
    
    const history = await UserChallengeProgress.getUserHistory(userId, limit);
    
    res.json({
      success: true,
      data: {
        history,
        total: history.length
      }
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get challenge history'
    });
  }
});

// ==================== USER STATS ====================

/**
 * @route   GET /api/daily-challenge/stats
 * @desc    Get user's challenge statistics
 * @access  Private
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const stats = await UserChallengeProgress.getUserStats(userId);
    
    // Transform stats into readable format
    const statsMap = {};
    let totalChallenges = 0;
    let totalCompleted = 0;
    let totalCoins = 0;
    let totalXP = 0;
    
    stats.forEach(stat => {
      statsMap[stat._id] = {
        count: stat.count,
        coins: stat.totalCoins + stat.totalBonusCoins,
        xp: stat.totalXP + stat.totalBonusXP
      };
      totalChallenges += stat.count;
      if (stat._id === 'completed') {
        totalCompleted = stat.count;
        totalCoins = stat.totalCoins + stat.totalBonusCoins;
        totalXP = stat.totalXP + stat.totalBonusXP;
      }
    });
    
    const completionRate = totalChallenges > 0 ? (totalCompleted / totalChallenges * 100).toFixed(2) : 0;
    
    res.json({
      success: true,
      data: {
        totalChallenges,
        totalCompleted,
        completionRate: parseFloat(completionRate),
        totalCoinsEarned: totalCoins,
        totalXPEarned: totalXP,
        byStatus: statsMap
      }
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get challenge statistics'
    });
  }
});

module.exports = router;


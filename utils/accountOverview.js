const User = require('../models/User');
const Transaction = require('../models/Transaction');
const UserAchievement = require('../models/UserAchievement');

/**
 * Account Overview Service
 * Handles all My Account Overview functionality
 */
class AccountOverviewService {
  constructor() {
    // All configuration is now dynamic and user-specific
    // No static configuration needed
  }

  /**
   * Get user-specific configuration based on onboarding data
   */
  getUserConfig(user) {
    const userGoals = user.onboarding?.dailyGoals || {};
    const userEarningGoal = user.onboarding?.dailyEarningGoal || 0;
    const userPrimaryGoal = user.onboarding?.primaryGoal || 'earn';
    const userAgeRange = user.onboarding?.ageRange || '18-25';
    const userGameStyle = user.onboarding?.gameStyle || 'casual';

    // Calculate dynamic goals based on user profile
    const dynamicGoals = this.calculateDynamicGoals(userGoals, userEarningGoal, userPrimaryGoal, userAgeRange, userGameStyle);

    return {
      dailyGoals: dynamicGoals,
      milestoneRewards: {
        gamesPlayed: {
          target: dynamicGoals.gamesPlayed,
          reward: this.calculateReward('gamesPlayed', dynamicGoals.gamesPlayed, userPrimaryGoal)
        },
        coinsEarned: {
          target: dynamicGoals.coinsEarned,
          reward: this.calculateReward('coinsEarned', dynamicGoals.coinsEarned, userPrimaryGoal)
        },
        challengesCompleted: {
          target: dynamicGoals.challengesCompleted,
          reward: this.calculateReward('challengesCompleted', dynamicGoals.challengesCompleted, userPrimaryGoal)
        }
      }
    };
  }

  /**
   * Calculate dynamic goals based on user profile
   */
  calculateDynamicGoals(userGoals, userEarningGoal, userPrimaryGoal, userAgeRange, userGameStyle) {
    // Base goals from user onboarding (always from database)
    let gamesPlayed = userGoals.gamesPlayed || 5; // Default only if not set in DB
    let coinsEarned = userGoals.coinsEarned || 900; // Default only if not set in DB
    let challengesCompleted = userGoals.challengesCompleted || 3; // Default only if not set in DB

    // Adjust based on user's daily earning goal
    if (userEarningGoal > 0) {
      // Scale coins goal based on earning goal (10-20% of daily earning goal)
      coinsEarned = Math.max(100, Math.min(5000, Math.round(userEarningGoal * 0.15)));
    }

    // Adjust based on primary goal
    switch (userPrimaryGoal) {
      case 'earn':
        coinsEarned = Math.round(coinsEarned * 1.2); // 20% higher for earners
        challengesCompleted = Math.min(10, challengesCompleted + 1);
        break;
      case 'save':
        coinsEarned = Math.round(coinsEarned * 0.8); // 20% lower for savers
        gamesPlayed = Math.max(1, gamesPlayed - 1);
        break;
      case 'invest':
        challengesCompleted = Math.min(10, challengesCompleted + 2); // More challenges for investors
        break;
      case 'learn':
        gamesPlayed = Math.max(1, gamesPlayed - 1); // Fewer games for learners
        challengesCompleted = Math.min(10, challengesCompleted + 1);
        break;
    }

    // Adjust based on age range
    switch (userAgeRange) {
      case '18-25':
        gamesPlayed = Math.min(20, gamesPlayed + 2); // More games for younger users
        break;
      case '26-35':
        gamesPlayed = Math.min(20, gamesPlayed + 1);
        break;
      case '56+':
        gamesPlayed = Math.max(1, gamesPlayed - 1); // Fewer games for older users
        challengesCompleted = Math.max(1, challengesCompleted - 1);
        break;
    }

    // Adjust based on game style preference
    switch (userGameStyle) {
      case 'easy':
      case 'casual':
        gamesPlayed = Math.min(20, gamesPlayed + 1); // More games for casual players
        break;
      case 'hard':
        gamesPlayed = Math.max(1, gamesPlayed - 1); // Fewer but harder games
        coinsEarned = Math.round(coinsEarned * 1.1); // Higher rewards for hard games
        break;
    }

    return {
      gamesPlayed: Math.max(1, Math.min(20, gamesPlayed)),
      coinsEarned: Math.max(100, Math.min(5000, coinsEarned)),
      challengesCompleted: Math.max(1, Math.min(10, challengesCompleted))
    };
  }

  /**
   * Calculate rewards based on goal type and user primary goal
   */
  calculateReward(goalType, target, userPrimaryGoal) {
    // Base rewards (dynamic based on goal type)
    let baseRewards;
    switch (goalType) {
      case 'gamesPlayed':
        baseRewards = { coins: 1000, xp: 500 };
        break;
      case 'coinsEarned':
        baseRewards = { coins: 100, xp: 50 };
        break;
      case 'challengesCompleted':
        baseRewards = { coins: 10, xp: 25 };
        break;
      default:
        baseRewards = { coins: 100, xp: 50 };
    }

    // Adjust rewards based on user's primary goal
    let multiplier = 1;
    switch (userPrimaryGoal) {
      case 'earn':
        multiplier = 1.2;
        break;
      case 'save':
        multiplier = 0.9;
        break;
      case 'invest':
        multiplier = 1.1;
        break;
      case 'learn':
        multiplier = 1.0;
        break;
    }

    return {
      coins: Math.round(baseRewards.coins * multiplier),
      xp: Math.round(baseRewards.xp * multiplier)
    };
  }

  /**
   * Get complete account overview data for a user
   */
  async getAccountOverview(userId) {
    try {
      const user = await User.findById(userId)
        .select('firstName lastName profile vip wallet xp games surveys races challenges streak badges milestone_gamesPlayed_claimed milestone_coinsEarned_claimed milestone_challengesCompleted_claimed onboarding');

      if (!user) {
        throw new Error('User not found');
      }

      // Get user-specific configuration
      const userConfig = this.getUserConfig(user);

      // Calculate total earnings
      const totalEarnings = {
        coins: user.wallet?.balance || 0,
        xp: user.xp?.current || 0
      };

      // Get today's progress with user-specific goals
      const todayProgress = await this.getTodayProgress(userId, userConfig);

      // Get reward badges with user-specific configuration
      const rewardBadges = await this.getRewardBadges(user, todayProgress, userConfig);

      // Get recent achievements
      const recentAchievements = await this.getRecentAchievements(userId);

      return {
        user: {
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Anonymous',
          avatar: user.profile?.avatar,
          tier: this.getTierFromXP(user.xp?.current || 0),
          vipLevel: user.vip?.level || 'free'
        },
        totalEarnings,
        progress: todayProgress,
        rewardBadges,
        recentAchievements,
        streak: {
          current: user.streak?.current || 0,
          lastUpdated: user.streak?.lastUpdated
        },
        badges: user.badges || [],
        // Include user-specific goals for frontend
        userGoals: userConfig.dailyGoals,
        userProfile: {
          primaryGoal: user.onboarding?.primaryGoal,
          ageRange: user.onboarding?.ageRange,
          gameStyle: user.onboarding?.gameStyle,
          dailyEarningGoal: user.onboarding?.dailyEarningGoal
        }
      };
    } catch (error) {
      console.error('Error getting account overview:', error);
      throw error;
    }
  }

  /**
   * Get today's progress for all activities
   */
  async getTodayProgress(userId, userConfig) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const user = await User.findById(userId);

    // Games played today (including games with progress > 0)
    const gamesPlayedToday = user.games?.filter(game => {
      const gameDate = new Date(game.date || game.completedAt);
      const isToday = gameDate >= today && gameDate < tomorrow;
      const hasProgress = game.completed || (game.progress && game.progress > 0);
      return isToday && hasProgress;
    }).length || 0;

    // Coins earned today
    const todayTransactions = await Transaction.find({
      user: userId,
      type: 'credit',
      createdAt: { $gte: today, $lt: tomorrow }
    });
    const coinsEarnedToday = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Challenges completed today
    const challengesCompletedToday = user.challenges?.filter(challenge => {
      const challengeDate = new Date(challenge.date);
      return challengeDate >= today && challengeDate < tomorrow && challenge.completed;
    }).length || 0;

    // Use user-specific goals
    const dailyGoals = userConfig.dailyGoals;

    return {
      gamesPlayed: {
        current: gamesPlayedToday,
        target: dailyGoals.gamesPlayed,
        percentage: Math.min((gamesPlayedToday / dailyGoals.gamesPlayed) * 100, 100),
        isCompleted: gamesPlayedToday >= dailyGoals.gamesPlayed
      },
      coinsEarned: {
        current: coinsEarnedToday,
        target: dailyGoals.coinsEarned,
        percentage: Math.min((coinsEarnedToday / dailyGoals.coinsEarned) * 100, 100),
        isCompleted: coinsEarnedToday >= dailyGoals.coinsEarned
      },
      challengesCompleted: {
        current: challengesCompletedToday,
        target: dailyGoals.challengesCompleted,
        percentage: Math.min((challengesCompletedToday / dailyGoals.challengesCompleted) * 100, 100),
        isCompleted: challengesCompletedToday >= dailyGoals.challengesCompleted
      }
    };
  }

  /**
   * Get reward badges for milestones
   */
  async getRewardBadges(user, progressData, userConfig) {
    const badges = [];
    const dailyGoals = userConfig.dailyGoals;
    const milestoneRewards = userConfig.milestoneRewards;

    // Games played milestone
    badges.push({
      type: 'gamesPlayed',
      title: 'Games Played',
      description: `Play ${dailyGoals.gamesPlayed} games today`,
      current: progressData.gamesPlayed.current,
      target: progressData.gamesPlayed.target,
      isCompleted: progressData.gamesPlayed.isCompleted,
      isClaimed: user.milestone_gamesPlayed_claimed || false,
      reward: milestoneRewards.gamesPlayed.reward,
      progressPercentage: progressData.gamesPlayed.percentage
    });

    // Coins earned milestone
    badges.push({
      type: 'coinsEarned',
      title: 'Coins Earned',
      description: `Earn ${dailyGoals.coinsEarned} coins today`,
      current: progressData.coinsEarned.current,
      target: progressData.coinsEarned.target,
      isCompleted: progressData.coinsEarned.isCompleted,
      isClaimed: user.milestone_coinsEarned_claimed || false,
      reward: milestoneRewards.coinsEarned.reward,
      progressPercentage: progressData.coinsEarned.percentage
    });

    // Challenges completed milestone
    badges.push({
      type: 'challengesCompleted',
      title: 'Challenges Completed',
      description: `Complete ${dailyGoals.challengesCompleted} challenges today`,
      current: progressData.challengesCompleted.current,
      target: progressData.challengesCompleted.target,
      isCompleted: progressData.challengesCompleted.isCompleted,
      isClaimed: user.milestone_challengesCompleted_claimed || false,
      reward: milestoneRewards.challengesCompleted.reward,
      progressPercentage: progressData.challengesCompleted.percentage
    });

    return badges;
  }

  /**
   * Get recent achievements for the user
   */
  async getRecentAchievements(userId) {
    const achievements = await UserAchievement.find({ user: userId })
      .populate('achievement', 'name description icon')
      .sort({ completedAt: -1 })
      .limit(5)
      .lean();

    return achievements.map(achievement => ({
      id: achievement._id,
      name: achievement.achievement?.name,
      description: achievement.achievement?.description,
      icon: achievement.achievement?.icon,
      completedAt: achievement.completedAt,
      rewards: achievement.rewards
    }));
  }

  /**
   * Claim a milestone reward
   */
  async claimMilestoneReward(userId, milestoneType) {
    try {
      const user = await User.findById(userId).select('onboarding');
      if (!user) {
        throw new Error('User not found');
      }

      // Get user-specific configuration
      const userConfig = this.getUserConfig(user);

      // Check if milestone type is valid
      if (!userConfig.milestoneRewards[milestoneType]) {
        throw new Error('Invalid milestone type');
      }

      // Check if already claimed
      const milestoneKey = `milestone_${milestoneType}_claimed`;
      if (user[milestoneKey]) {
        throw new Error('Milestone reward already claimed');
      }

      // Verify milestone completion with user-specific goals
      const isCompleted = await this.verifyMilestoneCompletion(userId, milestoneType, userConfig);

      if (!isCompleted) {
        throw new Error('Milestone not completed yet');
      }

      // Award reward
      const reward = userConfig.milestoneRewards[milestoneType].reward;
      user.wallet.balance = (user.wallet.balance || 0) + reward.coins;
      user.xp.current = (user.xp.current || 0) + reward.xp;
      user.xp.total = (user.xp.total || 0) + reward.xp;
      user[milestoneKey] = true;

      // Create transaction record
      const transaction = new Transaction({
        user: userId,
        type: 'credit',
        amount: reward.coins,
        description: `Milestone Reward - ${milestoneType}`,
        status: 'completed',
        referenceId: `MILESTONE-${milestoneType}-${Date.now()}`
      });

      await Promise.all([user.save(), transaction.save()]);

      return {
        reward,
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      };
    } catch (error) {
      console.error('Error claiming milestone reward:', error);
      throw error;
    }
  }

  /**
   * Verify if a milestone is completed
   */
  async verifyMilestoneCompletion(userId, milestoneType, userConfig) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyGoals = userConfig.dailyGoals;

    switch (milestoneType) {
      case 'gamesPlayed':
        const user = await User.findById(userId);
        if (!user || !user.games) {
          return false;
        }

        const gamesPlayedToday = user.games.filter(game => {
          // Check if game was completed today
          const gameDate = new Date(game.completedAt || game.date || game.lastPlayed);
          return gameDate >= today && gameDate < tomorrow && game.completed === true;
        }).length;

        console.log(`Games played today: ${gamesPlayedToday}, Target: ${dailyGoals.gamesPlayed}`);
        return gamesPlayedToday >= dailyGoals.gamesPlayed;

      case 'coinsEarned':
        const todayTransactions = await Transaction.find({
          user: userId,
          type: 'credit',
          createdAt: { $gte: today, $lt: tomorrow }
        });
        const coinsEarnedToday = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        console.log(`Coins earned today: ${coinsEarnedToday}, Target: ${dailyGoals.coinsEarned}`);
        return coinsEarnedToday >= dailyGoals.coinsEarned;

      case 'challengesCompleted':
        const userForChallenges = await User.findById(userId);
        if (!userForChallenges || !userForChallenges.challenges) {
          return false;
        }

        const challengesCompletedToday = userForChallenges.challenges.filter(challenge => {
          // Check if challenge was completed today
          const challengeDate = new Date(challenge.completedAt || challenge.date);
          return challengeDate >= today && challengeDate < tomorrow && challenge.completed === true;
        }).length;

        console.log(`Challenges completed today: ${challengesCompletedToday}, Target: ${dailyGoals.challengesCompleted}`);
        return challengesCompletedToday >= dailyGoals.challengesCompleted;

      default:
        return false;
    }
  }

  /**
   * Update progress for a specific activity
   */
  async updateProgress(userId, activityType, progressData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      let updatedProgress = null;

      switch (activityType) {
        case 'game':
          updatedProgress = await this.updateGameProgress(user, progressData);
          break;
        case 'coin':
          updatedProgress = await this.updateCoinProgress(user, progressData);
          break;
        case 'challenge':
          updatedProgress = await this.updateChallengeProgress(user, progressData);
          break;
        default:
          throw new Error('Invalid activity type');
      }

      await user.save();
      return updatedProgress;
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  }

  /**
   * Update game progress
   */
  async updateGameProgress(user, progressData) {
    const { gameId, completed, score, level } = progressData;

    // Initialize games array if it doesn't exist
    if (!user.games) {
      user.games = [];
    }

    const gameIndex = user.games.findIndex(g => g.gameId === gameId);
    const now = new Date();

    if (gameIndex >= 0) {
      user.games[gameIndex].lastPlayed = now;
      user.games[gameIndex].playCount = (user.games[gameIndex].playCount || 0) + 1;
      user.games[gameIndex].completed = completed;
      user.games[gameIndex].score = score;
      user.games[gameIndex].level = level;
      if (completed) {
        user.games[gameIndex].completedAt = now;
      }
    } else {
      user.games.push({
        gameId,
        firstPlayed: now,
        lastPlayed: now,
        playCount: 1,
        completed,
        score,
        level,
        completedAt: completed ? now : null
      });
    }

    return {
      gameId,
      completed,
      playCount: user.games[gameIndex >= 0 ? gameIndex : user.games.length - 1].playCount
    };
  }

  /**
   * Update coin progress
   */
  async updateCoinProgress(user, progressData) {
    const { amount, source, description } = progressData;

    // Initialize wallet if it doesn't exist
    if (!user.wallet) {
      user.wallet = { balance: 0, currency: 'USD' };
    }

    user.wallet.balance = (user.wallet.balance || 0) + amount;
    user.wallet.lastUpdated = new Date();

    const transaction = new Transaction({
      user: user._id,
      type: 'credit',
      amount,
      description: description || `Coin earned from ${source}`,
      status: 'completed',
      referenceId: `COIN-${Date.now()}`
    });

    await transaction.save();

    return {
      amount,
      newBalance: user.wallet.balance,
      source
    };
  }

  /**
   * Update challenge progress
   */
  async updateChallengeProgress(user, progressData) {
    const { challengeId, completed, reward } = progressData;

    // Initialize challenges array if it doesn't exist
    if (!user.challenges) {
      user.challenges = [];
    }

    const challengeIndex = user.challenges.findIndex(c => c.challengeId === challengeId);
    const now = new Date();

    if (challengeIndex >= 0) {
      user.challenges[challengeIndex].completed = completed;
      user.challenges[challengeIndex].completedAt = completed ? now : null;
    } else {
      user.challenges.push({
        challengeId,
        date: now,
        completed,
        completedAt: completed ? now : null
      });
    }

    if (completed && reward) {
      // Initialize wallet if it doesn't exist
      if (!user.wallet) {
        user.wallet = { balance: 0, currency: 'USD' };
      }

      // Initialize XP if it doesn't exist
      if (!user.xp) {
        user.xp = { current: 0, total: 0 };
      }

      user.wallet.balance = (user.wallet.balance || 0) + reward.coins;
      user.xp.current = (user.xp.current || 0) + reward.xp;
      user.xp.total = (user.xp.total || 0) + reward.xp;
    }

    return {
      challengeId,
      completed,
      reward: completed ? reward : null
    };
  }

  /**
   * Get progress history
   */
  async getProgressHistory(userId, startDate, endDate) {
    // Get games played history
    const gamesHistory = await User.aggregate([
      { $match: { _id: userId } },
      { $unwind: '$games' },
      {
        $match: {
          'games.completedAt': { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$games.completedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get coins earned history
    const coinsHistory = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          type: 'credit',
          createdAt: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get challenges completed history
    const challengesHistory = await User.aggregate([
      { $match: { _id: userId } },
      { $unwind: '$challenges' },
      {
        $match: {
          'challenges.completedAt': { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$challenges.completedAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    return {
      gamesPlayed: {
        daily: gamesHistory,
        total: gamesHistory.reduce((sum, day) => sum + day.count, 0),
        average: gamesHistory.length > 0 ? gamesHistory.reduce((sum, day) => sum + day.count, 0) / gamesHistory.length : 0
      },
      coinsEarned: {
        daily: coinsHistory,
        total: coinsHistory.reduce((sum, day) => sum + day.total, 0),
        average: coinsHistory.length > 0 ? coinsHistory.reduce((sum, day) => sum + day.total, 0) / coinsHistory.length : 0
      },
      challengesCompleted: {
        daily: challengesHistory,
        total: challengesHistory.reduce((sum, day) => sum + day.count, 0),
        average: challengesHistory.length > 0 ? challengesHistory.reduce((sum, day) => sum + day.count, 0) / challengesHistory.length : 0
      }
    };
  }

  /**
   * Get tier from XP
   */
  getTierFromXP(xp) {
    if (xp >= 10000) return 'expert';
    if (xp >= 5000) return 'advanced';
    if (xp >= 1000) return 'intermediate';
    return 'beginner';
  }
}

module.exports = new AccountOverviewService();

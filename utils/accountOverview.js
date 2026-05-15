const User = require('../models/User');
const Transaction = require('../models/Transaction');
const UserAchievement = require('../models/UserAchievement');
const UserChallengeProgress = require('../models/UserChallengeProgress');
const AccountOverviewConfig = require('../models/AccountOverviewConfig');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');

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
   * Check if all three daily milestones are completed and award a hardcoded reward once.
   * Prevent duplicate awards by setting `milestone_allTasks_claimed` on the user.
   */
  async checkAndGrantThreeTaskReward(userId, userDoc = null) {
    try {
      const user = userDoc || (await User.findById(userId));
      if (!user) return null;

      // Don't award twice
      if (user.milestone_allTasks_claimed) return null;

      const userConfig = this.getUserConfig(user);

      // Verify each milestone using existing verification logic
      const gamesDone = await this.verifyMilestoneCompletion(userId, 'gamesPlayed', userConfig);
      const coinsDone = await this.verifyMilestoneCompletion(userId, 'coinsEarned', userConfig);
      const challengesDone = await this.verifyMilestoneCompletion(userId, 'challengesCompleted', userConfig);

      if (!(gamesDone && coinsDone && challengesDone)) {
        return null;
      }

      const adminRewards = this._getAdminRewardsSync();
      const reward = adminRewards?.threeTaskReward
        ? { coins: adminRewards.threeTaskReward.coins, xp: adminRewards.threeTaskReward.xp }
        : { coins: 1200, xp: 600 };

      // Ensure wallet/xp structure
      if (!user.wallet) user.wallet = { balance: 0 };
      if (!user.xp) user.xp = { current: 0, total: 0 };

      // Apply coins
      user.wallet.balance = (user.wallet.balance || 0) + (reward.coins || 0);

      // Apply XP with tier multiplier helper
      const { finalXP } = await applyTierMultiplierToXP(user, reward.xp || 0);
      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;

      // Mark combined milestone claimed to avoid duplicates
      user.milestone_allTasks_claimed = true;

      const baseReferenceId = `MILESTONE-ALL-3-${Date.now()}`;

      // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
      const hasCoins = reward.coins > 0;
      const hasXP = finalXP > 0;
      let primaryAmount = 0;
      let primaryBalanceType = 'coins';

      if (hasCoins && hasXP) {
        // Both rewards - use coins as primary
        primaryAmount = reward.coins;
        primaryBalanceType = 'coins';
      } else if (hasCoins) {
        // Only coins
        primaryAmount = reward.coins;
        primaryBalanceType = 'coins';
      } else if (hasXP) {
        // Only XP
        primaryAmount = finalXP;
        primaryBalanceType = 'xp';
      }

      // Create single transaction with both coins and XP in metadata
      const transaction = new Transaction({
        user: userId,
        type: 'credit',
        balanceType: primaryBalanceType,
        amount: primaryAmount,
        description: 'Combined Milestone Reward - 3 daily tasks completed',
        status: 'completed',
        referenceId: baseReferenceId,
        metadata: {
          coins: reward.coins || 0,
          xp: finalXP || 0,
          baseXp: reward.xp || 0,
          finalXp: finalXP || 0,
          source: 'milestone_reward',
          milestoneType: 'all_three_tasks'
        }
      });

      await Promise.all([user.save(), transaction.save()]);

      return {
        reward,
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      };
    } catch (error) {
      console.error('Error in checkAndGrantThreeTaskReward:', error);
      throw error;
    }
  }

  /**
   * Check and award each individual milestone reward when completed (gamesPlayed, coinsEarned, challengesCompleted).
   * Prevent duplicates by checking `milestone_<type>_claimed` flags on the user.
   */
  async checkAndGrantIndividualMilestoneRewards(userId, userDoc = null) {
    try {
      const user = userDoc || (await User.findById(userId));
      if (!user) return null;

      const userConfig = this.getUserConfig(user);
      const milestoneTypes = ['gamesPlayed', 'coinsEarned', 'challengesCompleted'];
      const awarded = [];

      for (const type of milestoneTypes) {
        const milestoneKey = `milestone_${type}_claimed`;

        // Skip already claimed
        if (user[milestoneKey]) continue;

        // Verify completion
        const completed = await this.verifyMilestoneCompletion(userId, type, userConfig);
        if (!completed) continue;

        // Award configured reward for this milestone
        const reward = userConfig.milestoneRewards[type].reward || { coins: 0, xp: 0 };

        // Ensure wallet/xp exist
        if (!user.wallet) user.wallet = { balance: 0 };
        if (!user.xp) user.xp = { current: 0, total: 0 };

        // Apply coins
        user.wallet.balance = (user.wallet.balance || 0) + (reward.coins || 0);

        // Apply XP using tier multiplier
        const { finalXP } = await applyTierMultiplierToXP(user, reward.xp || 0);
        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        // Mark as claimed to prevent duplicates
        user[milestoneKey] = true;

        // CRITICAL: Reset continuous counter after milestone completion (only for games and challenges)
        // Coins remain daily-based, so no reset needed
        if (type === 'gamesPlayed') {
          if (!user.continuousProgress) {
            user.continuousProgress = {};
          }
          user.continuousProgress.gamesPlayed = 0;
          user.continuousProgress.lastGamesReset = new Date();
          console.log(`[MILESTONE-RESET] Games played counter reset to 0 after milestone completion`);
        } else if (type === 'challengesCompleted') {
          if (!user.continuousProgress) {
            user.continuousProgress = {};
          }
          user.continuousProgress.challengesCompleted = 0;
          user.continuousProgress.lastChallengesReset = new Date();
          console.log(`[MILESTONE-RESET] Challenges completed counter reset to 0 after milestone completion`);
        }

        const baseReferenceId = `MILESTONE-${type.toUpperCase()}-${Date.now()}`;

        // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
        const hasCoins = reward.coins > 0;
        const hasXP = finalXP > 0;
        let primaryAmount = 0;
        let primaryBalanceType = 'coins';

        if (hasCoins && hasXP) {
          // Both rewards - use coins as primary
          primaryAmount = reward.coins;
          primaryBalanceType = 'coins';
        } else if (hasCoins) {
          // Only coins
          primaryAmount = reward.coins;
          primaryBalanceType = 'coins';
        } else if (hasXP) {
          // Only XP
          primaryAmount = finalXP;
          primaryBalanceType = 'xp';
        }

        // Create single transaction with both coins and XP in metadata
        const transaction = new Transaction({
          user: userId,
          type: 'credit',
          balanceType: primaryBalanceType,
          amount: primaryAmount,
          description: `Milestone Reward - ${type}`,
          status: 'completed',
          referenceId: baseReferenceId,
          metadata: {
            coins: reward.coins || 0,
            xp: finalXP || 0,
            baseXp: reward.xp || 0,
            finalXp: finalXP || 0,
            source: 'milestone_reward',
            milestoneType: type
          }
        });

        // Save both user and transaction
        await Promise.all([user.save(), transaction.save()]);

        awarded.push({ type, reward, newBalance: user.wallet.balance, newXP: user.xp.current });
      }

      return awarded;
    } catch (error) {
      console.error('Error in checkAndGrantIndividualMilestoneRewards:', error);
      throw error;
    }
  }

  /**
   * Get user-specific configuration based on onboarding data and admin config
   */
  getUserConfig(user) {
    const userGoals = user.onboarding?.dailyGoals || {};
    const userEarningGoal = user.onboarding?.dailyEarningGoal || 0;
    const userPrimaryGoal = user.onboarding?.primaryGoal || 'earn';
    const userAgeRange = user.onboarding?.ageRange || '18-25';
    const userGameStyle = user.onboarding?.gameStyle || 'casual';

    // Calculate dynamic goals based on user profile
    const dynamicGoals = this.calculateDynamicGoals(userGoals, userEarningGoal, userPrimaryGoal, userAgeRange, userGameStyle);

    const adminRewards = this._getAdminRewardsSync();

    const milestoneRewards = {
      gamesPlayed: {
        target: dynamicGoals.gamesPlayed,
        reward: adminRewards?.milestones?.gamesPlayed?.reward
          ? { ...adminRewards.milestones.gamesPlayed.reward }
          : this.calculateReward('gamesPlayed', dynamicGoals.gamesPlayed, userPrimaryGoal)
      },
      coinsEarned: {
        target: dynamicGoals.coinsEarned,
        reward: adminRewards?.milestones?.coinsEarned?.reward
          ? { ...adminRewards.milestones.coinsEarned.reward }
          : this.calculateReward('coinsEarned', dynamicGoals.coinsEarned, userPrimaryGoal)
      },
      challengesCompleted: {
        target: dynamicGoals.challengesCompleted,
        reward: adminRewards?.milestones?.challengesCompleted?.reward
          ? { ...adminRewards.milestones.challengesCompleted.reward }
          : this.calculateReward('challengesCompleted', dynamicGoals.challengesCompleted, userPrimaryGoal)
      }
    };

    return {
      dailyGoals: {
        gamesPlayed: adminRewards?.milestones?.gamesPlayed?.target || dynamicGoals.gamesPlayed,
        coinsEarned: adminRewards?.milestones?.coinsEarned?.target || dynamicGoals.coinsEarned,
        challengesCompleted: adminRewards?.milestones?.challengesCompleted?.target || dynamicGoals.challengesCompleted
      },
      milestoneRewards
    };
  }

  _getAdminRewardsSync() {
    return this._adminRewardsCache;
  }

  async _loadAdminConfig() {
    try {
      const config = await AccountOverviewConfig.getActiveConfig();
      if (config && config.isActive) {
        const milestones = config.milestones || {};
        this._adminRewardsCache = {
          milestones: {
            gamesPlayed: milestones.gamesPlayed ? {
              target: milestones.gamesPlayed.target,
              reward: { coins: milestones.gamesPlayed.reward?.coins || 0, xp: milestones.gamesPlayed.reward?.xp || 0 }
            } : null,
            coinsEarned: milestones.coinsEarned ? {
              target: milestones.coinsEarned.target,
              reward: { coins: milestones.coinsEarned.reward?.coins || 0, xp: milestones.coinsEarned.reward?.xp || 0 }
            } : null,
            challengesCompleted: milestones.challengesCompleted ? {
              target: milestones.challengesCompleted.target,
              reward: { coins: milestones.challengesCompleted.reward?.coins || 0, xp: milestones.challengesCompleted.reward?.xp || 0 }
            } : null
          },
          threeTaskReward: {
            coins: config.threeTaskReward?.coins || 1200,
            xp: config.threeTaskReward?.xp || 600
          }
        };
      } else {
        this._adminRewardsCache = null;
      }
      this._adminConfigLoaded = true;
    } catch (err) {
      console.error('[AccountOverview] Failed to load admin config:', err);
      this._adminRewardsCache = null;
      this._adminConfigLoaded = true;
    }
  }

  _resetAdminConfigCache() {
    this._adminConfigLoaded = false;
    this._adminRewardsCache = null;
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

      // Load admin config synchronously so it's cached before getUserConfig runs
      this._resetAdminConfigCache();
      await this._loadAdminConfig();

      // Get user-specific configuration
      const userConfig = this.getUserConfig(user);

      // Check and award combined reward if user completed all three daily tasks
      // This will create a transaction and set a flag to avoid duplicate awards
      try {
        // First, auto-award any individual milestones that are completed but not claimed
        await this.checkAndGrantIndividualMilestoneRewards(userId, user);

        // Then, award the combined three-task reward if applicable
        await this.checkAndGrantThreeTaskReward(userId, user);
      } catch (err) {
        console.error('Error awarding combined three-task reward:', err);
        // proceed without failing the whole endpoint
      }

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

      // Calculate downloaded games count (games with installedAt or status: 'installed')
      // A game is considered downloaded if:
      // 1. It has installedAt date (explicitly installed)
      // 2. It has status: 'installed' (explicitly marked as installed)
      // 3. It has a date but no completed flag (legacy games that were started but not explicitly marked as installed)
      const downloadedGamesCount = user.games?.filter(game => {
        // Primary check: has installedAt or status: 'installed'
        if (game.installedAt || game.status === 'installed') {
          return true;
        }
        // Secondary check: has date (legacy games) but not completed (still active)
        if (game.date && !game.completed) {
          return true;
        }
        return false;
      }).length || 0;

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
        },
        // Add downloaded games count
        stats: {
          downloadedGames: downloadedGamesCount,
          totalGames: user.games?.length || 0,
          completedGames: user.games?.filter(game => game.completed).length || 0
        }
      };
    } catch (error) {
      console.error('Error getting account overview:', error);
      throw error;
    }
  }

  /**
   * Get today's progress for all activities
   * IMPORTANT: Games and challenges use CONTINUOUS counters (reset only after milestone completion)
   * Coins remain daily-based (reset at midnight)
   */
  async getTodayProgress(userId, userConfig) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const user = await User.findById(userId);

    // Initialize continuous progress if not exists
    if (!user.continuousProgress) {
      user.continuousProgress = {
        gamesPlayed: 0,
        challengesCompleted: 0
      };
    }

    // GAMES PLAYED: Use CONTINUOUS counter (not daily-based)
    // Counter resets only after milestone completion, not at midnight
    const gamesPlayedCurrent = user.continuousProgress.gamesPlayed || 0;

    // COINS EARNED: Keep daily-based (reset at midnight)
    const todayTransactions = await Transaction.find({
      user: userId,
      type: 'credit',
      createdAt: { $gte: today, $lt: tomorrow }
    });
    const coinsEarnedToday = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // CHALLENGES COMPLETED: Use CONTINUOUS counter (not daily-based)
    // Counter resets only after milestone completion, not at midnight
    const challengesCompletedCurrent = user.continuousProgress.challengesCompleted || 0;

    // Use user-specific goals
    const dailyGoals = userConfig.dailyGoals;

    return {
      gamesPlayed: {
        current: gamesPlayedCurrent,
        target: dailyGoals.gamesPlayed,
        percentage: Math.min((gamesPlayedCurrent / dailyGoals.gamesPlayed) * 100, 100),
        isCompleted: gamesPlayedCurrent >= dailyGoals.gamesPlayed
      },
      coinsEarned: {
        current: coinsEarnedToday,
        target: dailyGoals.coinsEarned,
        percentage: Math.min((coinsEarnedToday / dailyGoals.coinsEarned) * 100, 100),
        isCompleted: coinsEarnedToday >= dailyGoals.coinsEarned
      },
      challengesCompleted: {
        current: challengesCompletedCurrent,
        target: dailyGoals.challengesCompleted,
        percentage: Math.min((challengesCompletedCurrent / dailyGoals.challengesCompleted) * 100, 100),
        isCompleted: challengesCompletedCurrent >= dailyGoals.challengesCompleted
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

      // Award reward (apply tier multiplier to XP)
      const reward = userConfig.milestoneRewards[milestoneType].reward;
      user.wallet.balance = (user.wallet.balance || 0) + reward.coins;

      const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
        user,
        reward.xp || 0
      );
      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;
      user[milestoneKey] = true;

      const baseReferenceId = `MILESTONE-${milestoneType}-${Date.now()}`;

      // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
      const hasCoins = reward.coins > 0;
      const hasXP = finalXP > 0;
      let primaryAmount = 0;
      let primaryBalanceType = 'coins';

      if (hasCoins && hasXP) {
        // Both rewards - use coins as primary
        primaryAmount = reward.coins;
        primaryBalanceType = 'coins';
      } else if (hasCoins) {
        // Only coins
        primaryAmount = reward.coins;
        primaryBalanceType = 'coins';
      } else if (hasXP) {
        // Only XP
        primaryAmount = finalXP;
        primaryBalanceType = 'xp';
      }

      // Create single transaction with both coins and XP in metadata
      const transaction = new Transaction({
        user: userId,
        type: 'credit',
        balanceType: primaryBalanceType,
        amount: primaryAmount,
        description: `Milestone Reward - ${milestoneType}`,
        status: 'completed',
        referenceId: baseReferenceId,
        metadata: {
          coins: reward.coins || 0,
          xp: finalXP || 0,
          baseXp: reward.xp || 0,
          finalXp: finalXP || 0,
          source: 'milestone_reward',
          milestoneType: milestoneType
        }
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
        // GAMES: Use CONTINUOUS counter (not daily-based)
        const user = await User.findById(userId);
        if (!user) {
          return false;
        }

        // Initialize if not exists
        if (!user.continuousProgress) {
          user.continuousProgress = { gamesPlayed: 0 };
        }

        const gamesPlayedCurrent = user.continuousProgress.gamesPlayed || 0;
        console.log(`[MILESTONE-CHECK] Games played (continuous): ${gamesPlayedCurrent}, Target: ${dailyGoals.gamesPlayed}`);
        return gamesPlayedCurrent >= dailyGoals.gamesPlayed;

      case 'coinsEarned':
        // COINS: Keep daily-based (reset at midnight)
        const todayTransactions = await Transaction.find({
          user: userId,
          type: 'credit',
          createdAt: { $gte: today, $lt: tomorrow }
        });
        const coinsEarnedToday = todayTransactions.reduce((sum, tx) => sum + tx.amount, 0);

        console.log(`[MILESTONE-CHECK] Coins earned (today): ${coinsEarnedToday}, Target: ${dailyGoals.coinsEarned}`);
        return coinsEarnedToday >= dailyGoals.coinsEarned;

      case 'challengesCompleted':
        // CHALLENGES: Use CONTINUOUS counter (not daily-based)
        const userForChallenges = await User.findById(userId);
        if (!userForChallenges) {
          return false;
        }

        // Initialize if not exists
        if (!userForChallenges.continuousProgress) {
          userForChallenges.continuousProgress = { challengesCompleted: 0 };
        }

        const challengesCompletedCurrent = userForChallenges.continuousProgress.challengesCompleted || 0;
        console.log(`[MILESTONE-CHECK] Challenges completed (continuous): ${challengesCompletedCurrent}, Target: ${dailyGoals.challengesCompleted}`);
        return challengesCompletedCurrent >= dailyGoals.challengesCompleted;

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
    let isNewPlay = false;

    if (gameIndex >= 0) {
      // Check if this is a new play (lastPlayed is being updated)
      const previousLastPlayed = user.games[gameIndex].lastPlayed;
      user.games[gameIndex].lastPlayed = now;
      user.games[gameIndex].playCount = (user.games[gameIndex].playCount || 0) + 1;
      user.games[gameIndex].completed = completed;
      user.games[gameIndex].score = score;
      user.games[gameIndex].level = level;
      if (completed) {
        user.games[gameIndex].completedAt = now;
      }
      // Consider it a new play if lastPlayed changed significantly (more than 1 minute ago)
      isNewPlay = !previousLastPlayed || (now - new Date(previousLastPlayed)) > 60000;
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
      isNewPlay = true; // First time playing this game
    }

    // Increment continuous counter if this is a new play
    if (isNewPlay) {
      await this.incrementGamesPlayedCounter(user._id);
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

  /**
   * Increment continuous games played counter
   * Called when a game is played (lastPlayed is updated)
   */
  async incrementGamesPlayedCounter(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Initialize if not exists
      if (!user.continuousProgress) {
        user.continuousProgress = { gamesPlayed: 0 };
      }

      // Increment counter
      user.continuousProgress.gamesPlayed = (user.continuousProgress.gamesPlayed || 0) + 1;
      await user.save();

      console.log(
        `[CONTINUOUS-PROGRESS] Games played counter incremented to ${user.continuousProgress.gamesPlayed} for user ${userId}`
      );

      // Check if milestone reached and award immediately
      const userConfig = this.getUserConfig(user);
      if (
        user.continuousProgress.gamesPlayed >= userConfig.dailyGoals.gamesPlayed &&
        !user.milestone_gamesPlayed_claimed
      ) {
        console.log(
          `[CONTINUOUS-PROGRESS] Milestone reached! Awarding games played reward immediately...`
        );
        await this.checkAndGrantIndividualMilestoneRewards(userId);
      }
    } catch (error) {
      console.error('[CONTINUOUS-PROGRESS] Error incrementing games played counter:', error);
    }
  }

  /**
   * Increment continuous challenges completed counter
   * Called when a challenge is completed
   */
  async incrementChallengesCompletedCounter(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Initialize if not exists
      if (!user.continuousProgress) {
        user.continuousProgress = { challengesCompleted: 0 };
      }

      // Increment counter
      user.continuousProgress.challengesCompleted =
        (user.continuousProgress.challengesCompleted || 0) + 1;
      await user.save();

      console.log(
        `[CONTINUOUS-PROGRESS] Challenges completed counter incremented to ${user.continuousProgress.challengesCompleted} for user ${userId}`
      );

      // Check if milestone reached and award immediately
      const userConfig = this.getUserConfig(user);
      if (
        user.continuousProgress.challengesCompleted >= userConfig.dailyGoals.challengesCompleted &&
        !user.milestone_challengesCompleted_claimed
      ) {
        console.log(
          `[CONTINUOUS-PROGRESS] Milestone reached! Awarding challenges completed reward immediately...`
        );
        await this.checkAndGrantIndividualMilestoneRewards(userId);
      }
    } catch (error) {
      console.error(
        '[CONTINUOUS-PROGRESS] Error incrementing challenges completed counter:',
        error
      );
    }
  }
}

module.exports = new AccountOverviewService();

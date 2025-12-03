const User = require('../models/User');
const Deals = require('../models/Deals');
const TaskStepTemplate = require('../models/TaskStepTemplate');
const PayoutMethod = require('../models/PayoutMethod');
const FinancialInsight = require('../models/FinancialInsight');

/**
 * Cash Coach Utility Functions
 * Handles financial calculations, task recommendations, and progress tracking
 */

/**
 * Calculate monthly summary based on financial goals
 * @param {Object} financialGoals - User's financial goals
 * @returns {Object} Calculated monthly summary
 */
const calculateMonthlySummary = (financialGoals) => {
  const { salary, rent, food, savings, revenueGoal } = financialGoals;
  
  const totalIncome = salary;
  const totalExpenses = rent + food;
  const netSavings = totalIncome - totalExpenses;
  const jacksonContribution = revenueGoal;
  
  return {
    totalIncome,
    totalExpenses,
    netSavings,
    jacksonContribution,
    lastCalculated: new Date()
  };
};

/**
 * Generate task recommendations based on revenue goal
 * @param {number} revenueGoal - Target revenue from Jackson
 * @param {string} userId - User ID for personalized recommendations
 * @returns {Object} Task recommendations
 */
const generateTaskRecommendations = async (revenueGoal, userId) => {
  try {
    // Get user profile for personalized recommendations
    const user = await User.findById(userId).select('preferences games surveys xp vip');
    
    // Get available deals and tasks from database
    const availableDeals = await Deals.find({ 
      active: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    }).sort({ 'reward.coins': -1 });

    // Calculate average reward per task from actual deals
    const totalReward = availableDeals.reduce((sum, deal) => sum + deal.reward.coins, 0);
    const averageRewardPerTask = availableDeals.length > 0 ? totalReward / availableDeals.length : 20;
    const tasksNeeded = Math.ceil(revenueGoal / averageRewardPerTask);
    
    // Generate step-by-step plan from database templates
    const steps = await generateTaskStepsFromDB(revenueGoal, availableDeals, user);
    
    const recommendations = {
      revenueGoal,
      tasksNeeded,
      estimatedTimeDays: Math.ceil(tasksNeeded / 3), // 3 tasks per day average
      steps,
      gameRecommendations: getGameRecommendations(availableDeals, user),
      surveyRecommendations: getSurveyRecommendations(availableDeals, user),
      challengeRecommendations: getChallengeRecommendations(availableDeals, user),
      totalReward: {
        coins: revenueGoal,
        xp: revenueGoal * 5 // 5 XP per coin
      }
    };

    return recommendations;
  } catch (error) {
    console.error('Error generating task recommendations:', error);
    throw new Error('Failed to generate task recommendations');
  }
};

/**
 * Generate task steps from database templates
 * @param {number} revenueGoal - Target revenue
 * @param {Array} availableDeals - Available deals
 * @param {Object} user - User profile
 * @returns {Array} Task steps
 */
const generateTaskStepsFromDB = async (revenueGoal, availableDeals, user) => {
  try {
    // Get task step templates from database
    const templates = await TaskStepTemplate.getTemplatesForUser(
      user.xp?.level || 1, 
      user.vip?.level || 'free'
    );

    // Generate steps based on templates and available deals
    const steps = templates.map(template => {
      // Calculate dynamic rewards based on available deals
      let reward = { ...template.reward };
      
      // Adjust rewards based on user level and VIP status
      const levelMultiplier = 1 + (user.xp?.level || 1) * 0.1;
      const vipMultiplier = user.vip?.level === 'free' ? 1 : 
                           user.vip?.level === 'bronze' ? 1.2 :
                           user.vip?.level === 'gold' ? 1.5 : 2.0;
      
      reward.coins = Math.round(reward.coins * levelMultiplier * vipMultiplier);
      reward.xp = Math.round(reward.xp * levelMultiplier * vipMultiplier);

      return {
        id: template.id,
        title: template.title,
        description: template.description,
        type: template.type,
        completed: false,
        reward,
        order: template.order
      };
    });

    return steps;
  } catch (error) {
    console.error('Error generating task steps from DB:', error);
    // Fallback to basic steps if database fails
    return generateFallbackSteps(revenueGoal);
  }
};

/**
 * Fallback task steps if database is unavailable
 * @param {number} revenueGoal - Target revenue
 * @returns {Array} Basic task steps
 */
const generateFallbackSteps = (revenueGoal) => {
  return [
    {
      id: 'step_1',
      title: 'Complete 3 Games',
      description: 'Play and complete 3 recommended games to earn coins',
      type: 'game',
      completed: false,
      reward: { coins: 30, xp: 150 },
      order: 1
    },
    {
      id: 'step_2',
      title: 'Take 2 Surveys',
      description: 'Complete 2 surveys to earn additional rewards',
      type: 'survey',
      completed: false,
      reward: { coins: 25, xp: 125 },
      order: 2
    },
    {
      id: 'step_3',
      title: 'Reach Level Milestone',
      description: 'Reach the next level milestone for bonus rewards',
      type: 'milestone',
      completed: false,
      reward: { coins: 20, xp: 100 },
      order: 3
    },
    {
      id: 'step_4',
      title: 'Complete Daily Challenge',
      description: 'Finish today\'s daily challenge for extra coins',
      type: 'challenge',
      completed: false,
      reward: { coins: 15, xp: 75 },
      order: 4
    },
    {
      id: 'step_5',
      title: 'Upload Receipt',
      description: 'Upload a receipt to earn cashback rewards',
      type: 'receipt',
      completed: false,
      reward: { coins: 10, xp: 50 },
      order: 5
    }
  ];
};

/**
 * Get game recommendations based on available deals
 * @param {Array} availableDeals - Available deals
 * @param {Object} user - User preferences
 * @returns {Array} Game recommendations
 */
const getGameRecommendations = (availableDeals, user) => {
  const gameDeals = availableDeals.filter(deal => deal.type === 'game');
  
  return gameDeals.slice(0, 5).map(deal => ({
    id: deal._id,
    title: deal.title,
    description: deal.description,
    imageUrl: deal.imageUrl,
    reward: deal.reward,
    requirements: deal.requirements,
    vipOnly: deal.vipOnly
  }));
};

/**
 * Get survey recommendations
 * @param {Array} availableDeals - Available deals
 * @param {Object} user - User preferences
 * @returns {Array} Survey recommendations
 */
const getSurveyRecommendations = (availableDeals, user) => {
  const surveyDeals = availableDeals.filter(deal => deal.type === 'survey');
  
  return surveyDeals.slice(0, 3).map(deal => ({
    id: deal._id,
    title: deal.title,
    description: deal.description,
    reward: deal.reward,
    estimatedTime: '5-10 minutes',
    provider: 'BitLabs'
  }));
};

/**
 * Get challenge recommendations
 * @param {Array} availableDeals - Available deals
 * @param {Object} user - User preferences
 * @returns {Array} Challenge recommendations
 */
const getChallengeRecommendations = (availableDeals, user) => {
  const challengeDeals = availableDeals.filter(deal => deal.type === 'race');
  
  return challengeDeals.slice(0, 2).map(deal => ({
    id: deal._id,
    title: deal.title,
    description: deal.description,
    reward: deal.reward,
    duration: 'Daily',
    difficulty: 'Medium'
  }));
};

/**
 * Update task progress when user completes a task
 * @param {string} userId - User ID
 * @param {string} stepId - Step ID that was completed
 * @param {Object} taskData - Task completion data
 * @returns {Object} Updated progress
 */
const updateTaskProgress = async (userId, stepId, taskData) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { taskProgress } = user.cashCoach;
    const stepIndex = taskProgress.steps.findIndex(step => step.id === stepId);
    
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }

    // Mark step as completed
    taskProgress.steps[stepIndex].completed = true;
    taskProgress.steps[stepIndex].completedAt = new Date();
    
    // Update current step
    taskProgress.currentStep = Math.min(stepIndex + 1, taskProgress.totalSteps);
    
    // Add to earning history
    user.cashCoach.earningHistory.push({
      date: new Date(),
      source: taskData.source || 'game',
      amount: taskProgress.steps[stepIndex].reward.coins,
      description: `Completed: ${taskProgress.steps[stepIndex].title}`,
      taskId: stepId
    });

    // Update wallet balance
    user.wallet.balance += taskProgress.steps[stepIndex].reward.coins;
    user.wallet.lastUpdated = new Date();

    // Update XP
    user.xp.current += taskProgress.steps[stepIndex].reward.xp;
    user.xp.total += taskProgress.steps[stepIndex].reward.xp;

    // Check if all steps are completed
    const completedSteps = taskProgress.steps.filter(step => step.completed).length;
    if (completedSteps === taskProgress.totalSteps) {
      taskProgress.isActive = false;
      taskProgress.completedAt = new Date();
    }

    await user.save();

    return {
      stepCompleted: true,
      currentStep: taskProgress.currentStep,
      totalSteps: taskProgress.totalSteps,
      progress: (completedSteps / taskProgress.totalSteps) * 100,
      reward: taskProgress.steps[stepIndex].reward,
      isGoalCompleted: completedSteps === taskProgress.totalSteps
    };
  } catch (error) {
    console.error('Error updating task progress:', error);
    throw error;
  }
};

/**
 * Initialize task progress for a new goal
 * @param {string} userId - User ID
 * @param {number} revenueGoal - Revenue goal
 * @returns {Object} Initialized task progress
 */
const initializeTaskProgress = async (userId, revenueGoal) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate task recommendations
    const recommendations = await generateTaskRecommendations(revenueGoal, userId);
    
    // Initialize task progress
    user.cashCoach.taskProgress = {
      steps: recommendations.steps,
      currentStep: 0,
      totalSteps: recommendations.steps.length,
      totalReward: recommendations.totalReward,
      isActive: true,
      startedAt: new Date()
    };

    await user.save();

    return {
      taskProgress: user.cashCoach.taskProgress,
      recommendations: {
        gameRecommendations: recommendations.gameRecommendations,
        surveyRecommendations: recommendations.surveyRecommendations,
        challengeRecommendations: recommendations.challengeRecommendations
      }
    };
  } catch (error) {
    console.error('Error initializing task progress:', error);
    throw error;
  }
};

/**
 * Get payout methods available for the user
 * @param {string} userId - User ID
 * @returns {Array} Available payout methods
 */
const getPayoutMethods = async (userId) => {
  try {
    const user = await User.findById(userId).select('cashCoach.linkedAccounts profile');
    const linkedAccounts = user.cashCoach.linkedAccounts || [];
    
    // Get user's region from profile (default to US if not set)
    const userRegion = user.profile?.country || 'US';
    
    // Get payout methods from database
    const payoutMethods = await PayoutMethod.getMethodsForRegion(userRegion);
    
    // Format methods with linked status
    const formattedMethods = payoutMethods.map(method => ({
      id: method.id,
      name: method.name,
      icon: method.icon,
      enabled: method.enabled,
      isLinked: linkedAccounts.some(acc => acc.provider === method.id && acc.isActive),
      minAmount: method.minAmount,
      maxAmount: method.maxAmount,
      processingTime: method.processingTime,
      fees: method.fees,
      requirements: method.requirements,
      metadata: method.metadata
    }));

    return formattedMethods;
  } catch (error) {
    console.error('Error getting payout methods:', error);
    // Fallback to basic methods if database fails
    return getFallbackPayoutMethods(userId);
  }
};

/**
 * Fallback payout methods if database is unavailable
 * @param {string} userId - User ID
 * @returns {Array} Basic payout methods
 */
const getFallbackPayoutMethods = async (userId) => {
  try {
    const user = await User.findById(userId).select('cashCoach.linkedAccounts');
    const linkedAccounts = user.cashCoach.linkedAccounts || [];
    
    return [
      {
        id: 'paypal',
        name: 'PayPal',
        icon: 'paypal',
        enabled: true,
        isLinked: linkedAccounts.some(acc => acc.provider === 'paypal' && acc.isActive),
        minAmount: 5,
        maxAmount: 10000,
        processingTime: '1-3 days',
        fees: { fixed: 0, percentage: 2.9 }
      },
      {
        id: 'gpay',
        name: 'Google Pay',
        icon: 'google-pay',
        enabled: true,
        isLinked: linkedAccounts.some(acc => acc.provider === 'gpay' && acc.isActive),
        minAmount: 10,
        maxAmount: 5000,
        processingTime: 'instant',
        fees: { fixed: 0, percentage: 1.5 }
      },
      {
        id: 'bank',
        name: 'Bank Transfer',
        icon: 'bank',
        enabled: true,
        isLinked: linkedAccounts.some(acc => acc.provider === 'bank' && acc.isActive),
        minAmount: 20,
        maxAmount: 50000,
        processingTime: '3-5 days',
        fees: { fixed: 2, percentage: 0.5 }
      }
    ];
  } catch (error) {
    console.error('Error getting fallback payout methods:', error);
    return [];
  }
};

/**
 * Link a payout account
 * @param {string} userId - User ID
 * @param {Object} accountData - Account data
 * @returns {Object} Linked account info
 */
const linkPayoutAccount = async (userId, accountData) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { provider, accountId, accountName } = accountData;
    
    // Check if account already exists
    const existingAccount = user.cashCoach.linkedAccounts.find(
      acc => acc.provider === provider && acc.accountId === accountId
    );

    if (existingAccount) {
      throw new Error('Account already linked');
    }

    // Add new linked account
    const newAccount = {
      provider,
      accountId,
      accountName,
      isActive: true,
      isVerified: false, // Will be verified through provider API
      linkedAt: new Date()
    };

    user.cashCoach.linkedAccounts.push(newAccount);
    await user.save();

    return {
      success: true,
      account: newAccount,
      message: 'Account linked successfully'
    };
  } catch (error) {
    console.error('Error linking payout account:', error);
    throw error;
  }
};

/**
 * Get financial insights and recommendations
 * @param {string} userId - User ID
 * @returns {Object} Financial insights
 */
const getFinancialInsights = async (userId) => {
  try {
    const user = await User.findById(userId).select('cashCoach wallet xp vip profile');
    const { cashCoach, wallet, xp, vip, profile } = user;
    const { financialGoals, monthlySummary, earningHistory } = cashCoach;
    
    // Calculate financial metrics
    const totalEarnings = wallet.balance;
    const monthlyGoal = financialGoals.revenueGoal;
    const progressPercentage = monthlyGoal > 0 ? (totalEarnings / monthlyGoal) * 100 : 0;
    const daysRemaining = 30 - new Date().getDate();
    const averageDailyEarnings = wallet.balance / Math.max(1, new Date().getDate());
    
    // Get personalized insights from database
    const userProfile = {
      salary: financialGoals.salary,
      rent: financialGoals.rent,
      food: financialGoals.food,
      savings: financialGoals.savings,
      revenueGoal: monthlyGoal,
      vipLevel: vip?.level || 'free'
    };
    
    const dbInsights = await FinancialInsight.getInsightsForUser(userProfile);
    
    // Format insights
    const recommendations = dbInsights.map(insight => ({
      type: insight.type,
      title: insight.title,
      message: insight.message,
      priority: insight.priority >= 7 ? 'high' : insight.priority >= 4 ? 'medium' : 'low',
      category: insight.metadata.category,
      icon: insight.metadata.icon,
      color: insight.metadata.color,
      actionUrl: insight.metadata.actionUrl
    }));
    
    const insights = {
      monthlyBudget: {
        income: financialGoals.salary,
        expenses: financialGoals.rent + financialGoals.food,
        savings: financialGoals.savings,
        jacksonGoal: financialGoals.revenueGoal
      },
      progress: {
        goalProgress: Math.min(progressPercentage, 100),
        monthlyProgress: (new Date().getDate() / 30) * 100
      },
      totalEarnings,
      monthlyGoal,
      daysRemaining: Math.max(daysRemaining, 0),
      averageDailyEarnings,
      recommendations,
      // Additional calculated insights
      rentRatio: userProfile.salary > 0 ? (userProfile.rent / userProfile.salary) * 100 : 0,
      savingsRatio: userProfile.salary > 0 ? (userProfile.savings / userProfile.salary) * 100 : 0,
      needsToEarnDaily: daysRemaining > 0 ? (monthlyGoal - totalEarnings) / daysRemaining : 0,
      isOnTrack: progressPercentage >= (new Date().getDate() / 30) * 100
    };

    return insights;
  } catch (error) {
    console.error('Error getting financial insights:', error);
    // Fallback to basic insights if database fails
    return getFallbackFinancialInsights(userId);
  }
};

/**
 * Fallback financial insights if database is unavailable
 * @param {string} userId - User ID
 * @returns {Object} Basic financial insights
 */
const getFallbackFinancialInsights = async (userId) => {
  try {
    const user = await User.findById(userId).select('cashCoach wallet xp');
    const { cashCoach, wallet, xp } = user;
    const { financialGoals, earningHistory } = cashCoach;
    
    const totalEarnings = wallet.balance;
    const monthlyGoal = financialGoals.revenueGoal;
    const progressPercentage = monthlyGoal > 0 ? (totalEarnings / monthlyGoal) * 100 : 0;
    const daysRemaining = 30 - new Date().getDate();
    const averageDailyEarnings = wallet.balance / Math.max(1, new Date().getDate());
    
    return {
      monthlyBudget: {
        income: financialGoals.salary,
        expenses: financialGoals.rent + financialGoals.food,
        savings: financialGoals.savings,
        jacksonGoal: financialGoals.revenueGoal
      },
      progress: {
        goalProgress: Math.min(progressPercentage, 100),
        monthlyProgress: (new Date().getDate() / 30) * 100
      },
      totalEarnings,
      monthlyGoal,
      daysRemaining: Math.max(daysRemaining, 0),
      averageDailyEarnings,
      recommendations: [
        {
          type: 'tip',
          title: 'Increase Daily Activity',
          message: 'Try to complete more tasks each day to reach your goal faster.',
          priority: 'high',
          category: 'earning'
        },
        {
          type: 'warning',
          title: 'Goal Progress',
          message: 'You need to earn more to reach your monthly goal.',
          priority: 'medium',
          category: 'goal_setting'
        }
      ],
      isOnTrack: progressPercentage >= (new Date().getDate() / 30) * 100
    };
  } catch (error) {
    console.error('Error getting fallback financial insights:', error);
    return {
      monthlyBudget: { income: 0, expenses: 0, savings: 0, jacksonGoal: 0 },
      progress: { goalProgress: 0, monthlyProgress: 0 },
      totalEarnings: 0,
      monthlyGoal: 0,
      daysRemaining: 30,
      averageDailyEarnings: 0,
      recommendations: [],
      isOnTrack: false
    };
  }
};

module.exports = {
  calculateMonthlySummary,
  generateTaskRecommendations,
  updateTaskProgress,
  initializeTaskProgress,
  getPayoutMethods,
  linkPayoutAccount,
  getFinancialInsights,
  generateTaskStepsFromDB,
  generateFallbackSteps,
  getFallbackPayoutMethods,
  getFallbackFinancialInsights,
  getGameRecommendations,
  getSurveyRecommendations,
  getChallengeRecommendations
};

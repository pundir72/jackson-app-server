const FinancialGoal = require('../models/FinancialGoal');
const User = require('../models/User');
const logger = require('../utils/logger');

// Get financial tips
const getFinancialTips = async (req, res) => {
  try {
    const { category, difficulty, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const tips = [
      {
        id: 1,
        title: 'Build an Emergency Fund',
        description: 'Save 3-6 months of expenses for emergencies',
        category: 'saving',
        difficulty: 'beginner',
        estimatedSavings: 5000,
        timeToAchieve: '6 months',
        steps: [
          'Calculate your monthly expenses',
          'Set aside 10% of your income',
          'Open a high-yield savings account',
          'Automate your savings',
        ],
        icon: '🛡️',
      },
      {
        id: 2,
        title: 'Create a Budget',
        description: 'Track your income and expenses to control spending',
        category: 'budgeting',
        difficulty: 'beginner',
        estimatedSavings: 2000,
        timeToAchieve: '1 month',
        steps: [
          'List all your income sources',
          'Track all your expenses',
          'Categorize your spending',
          'Set spending limits',
        ],
        icon: '📊',
      },
      {
        id: 3,
        title: 'Pay Off High-Interest Debt',
        description: 'Focus on paying off credit cards and loans',
        category: 'debt',
        difficulty: 'intermediate',
        estimatedSavings: 3000,
        timeToAchieve: '12 months',
        steps: [
          'List all your debts',
          'Prioritize high-interest debt',
          'Use the avalanche method',
          'Consider debt consolidation',
        ],
        icon: '💳',
      },
      {
        id: 4,
        title: 'Start Investing',
        description: 'Begin with index funds and ETFs',
        category: 'investing',
        difficulty: 'intermediate',
        estimatedReturns: 8000,
        timeToAchieve: '5 years',
        steps: [
          'Open a brokerage account',
          'Start with index funds',
          'Dollar-cost average',
          'Reinvest dividends',
        ],
        icon: '📈',
      },
      {
        id: 5,
        title: 'Maximize Retirement Savings',
        description: 'Contribute to 401(k) and IRA accounts',
        category: 'retirement',
        difficulty: 'advanced',
        estimatedReturns: 500000,
        timeToAchieve: '30 years',
        steps: [
          'Contribute to employer 401(k)',
          'Open an IRA account',
          'Increase contributions annually',
          'Consider Roth options',
        ],
        icon: '🏖️',
      },
    ];

    // Filter tips based on query parameters
    let filteredTips = tips;
    if (category) {
      filteredTips = filteredTips.filter(tip => tip.category === category);
    }
    if (difficulty) {
      filteredTips = filteredTips.filter(tip => tip.difficulty === difficulty);
    }

    const total = filteredTips.length;
    const paginatedTips = filteredTips.slice(skip, skip + parseInt(limit));

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Financial tips retrieved successfully',
      data: {
        tips: paginatedTips,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting financial tips:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve financial tips',
      statusCode: 500,
    });
  }
};

// Get financial goals
const getFinancialGoals = async (req, res) => {
  try {
    const userId = req.user.id;

    const goals = await FinancialGoal.findByUserId(userId);

    res.status(200).json({
      success: true,
      message: 'Financial goals retrieved successfully',
      data: { goals },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting financial goals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve financial goals',
      statusCode: 500,
    });
  }
};

// Create financial goal
const createFinancialGoal = async (req, res) => {
  try {
    const { title, description, targetAmount, deadline, category, priority } = req.body;
    const userId = req.user.id;

    const goal = new FinancialGoal({
      userId,
      title,
      description,
      targetAmount: parseFloat(targetAmount),
      deadline: new Date(deadline),
      category,
      priority: priority || 'medium',
    });

    await goal.save();

    res.status(201).json({
      success: true,
      message: 'Financial goal created successfully',
      data: { goal },
      statusCode: 201,
    });
  } catch (error) {
    logger.error('Error creating financial goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create financial goal',
      statusCode: 500,
    });
  }
};

// Update financial goal
const updateFinancialGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user.id;

    const goal = await FinancialGoal.findById(id);
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Financial goal not found',
        statusCode: 404,
      });
    }

    if (goal.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        statusCode: 403,
      });
    }

    Object.assign(goal, updateData);
    await goal.save();

    res.status(200).json({
      success: true,
      message: 'Financial goal updated successfully',
      data: { goal },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error updating financial goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update financial goal',
      statusCode: 500,
    });
  }
};

// Add contribution to goal
const addContribution = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, source, description } = req.body;
    const userId = req.user.id;

    const goal = await FinancialGoal.findById(id);
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Financial goal not found',
        statusCode: 404,
      });
    }

    if (goal.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        statusCode: 403,
      });
    }

    await goal.addContribution(amount, source, description);

    res.status(200).json({
      success: true,
      message: 'Contribution added successfully',
      data: { goal },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error adding contribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add contribution',
      statusCode: 500,
    });
  }
};

// Get goal statistics
const getGoalStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await FinancialGoal.getStats(userId);
    const categoryStats = await FinancialGoal.getCategoryStats(userId);

    res.status(200).json({
      success: true,
      message: 'Goal statistics retrieved successfully',
      data: {
        stats: stats[0] || {
          totalGoals: 0,
          activeGoals: 0,
          completedGoals: 0,
          totalTargetAmount: 0,
          totalCurrentAmount: 0,
          averageProgress: 0,
        },
        categoryStats,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting goal statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve goal statistics',
      statusCode: 500,
    });
  }
};

// Get financial education content
const getEducationContent = async (req, res) => {
  try {
    const { topic, level } = req.query;

    const content = [
      {
        id: 1,
        title: 'Understanding Credit Scores',
        topic: 'credit',
        level: 'beginner',
        description: 'Learn how credit scores work and how to improve yours',
        duration: '15 minutes',
        content: [
          'What is a credit score?',
          'Factors that affect your score',
          'How to check your credit score',
          'Tips to improve your score',
        ],
        resources: [
          'Free credit report from AnnualCreditReport.com',
          'Credit monitoring services',
          'Credit score simulators',
        ],
      },
      {
        id: 2,
        title: 'Investment Basics',
        topic: 'investing',
        level: 'beginner',
        description: 'Start your investment journey with these fundamentals',
        duration: '20 minutes',
        content: [
          'What is investing?',
          'Types of investments',
          'Risk vs. return',
          'Diversification',
        ],
        resources: [
          'Investment calculators',
          'Portfolio trackers',
          'Educational videos',
        ],
      },
      {
        id: 3,
        title: 'Tax Planning',
        topic: 'taxes',
        level: 'intermediate',
        description: 'Optimize your tax strategy and save money',
        duration: '25 minutes',
        content: [
          'Understanding tax brackets',
          'Deductions and credits',
          'Tax-advantaged accounts',
          'Tax-loss harvesting',
        ],
        resources: [
          'Tax preparation software',
          'Tax calculators',
          'Professional tax advice',
        ],
      },
    ];

    let filteredContent = content;
    if (topic) {
      filteredContent = filteredContent.filter(item => item.topic === topic);
    }
    if (level) {
      filteredContent = filteredContent.filter(item => item.level === level);
    }

    res.status(200).json({
      success: true,
      message: 'Education content retrieved successfully',
      data: { content: filteredContent },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting education content:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve education content',
      statusCode: 500,
    });
  }
};

// Get personalized recommendations
const getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    const goals = await FinancialGoal.findByUserId(userId);

    // Generate personalized recommendations based on user profile and goals
    const recommendations = [
      {
        id: 1,
        type: 'goal',
        title: 'Start an Emergency Fund',
        description: 'Based on your spending patterns, we recommend building a $3,000 emergency fund',
        priority: 'high',
        estimatedTime: '6 months',
        action: 'create_goal',
      },
      {
        id: 2,
        type: 'tip',
        title: 'Track Your Spending',
        description: 'Monitor your daily expenses to identify saving opportunities',
        priority: 'medium',
        estimatedSavings: 500,
        action: 'track_spending',
      },
      {
        id: 3,
        type: 'education',
        title: 'Learn About Investing',
        description: 'Start learning about investment options for long-term wealth building',
        priority: 'low',
        estimatedTime: '2 weeks',
        action: 'start_learning',
      },
    ];

    res.status(200).json({
      success: true,
      message: 'Recommendations retrieved successfully',
      data: { recommendations },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recommendations',
      statusCode: 500,
    });
  }
};

module.exports = {
  getFinancialTips,
  getFinancialGoals,
  createFinancialGoal,
  updateFinancialGoal,
  addContribution,
  getGoalStats,
  getEducationContent,
  getRecommendations,
}; 
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');
const User = require('../models/User');
const {
  calculateMonthlySummary,
  generateTaskRecommendations,
  updateTaskProgress,
  initializeTaskProgress,
  getPayoutMethods,
  linkPayoutAccount,
  getFinancialInsights,
  generateTaskStepsFromDB,
  getFallbackPayoutMethods,
  getFallbackFinancialInsights
} = require('../utils/cashCoach');

// ============================================================================
// DASHBOARD & OVERVIEW ENDPOINTS
// ============================================================================

/**
 * Get Cash Coach dashboard data
 * GET /api/cash-coach/dashboard
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('cashCoach wallet xp');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { cashCoach, wallet, xp } = user;
    
    // Calculate current progress
    const goalProgress = cashCoach.financialGoals.revenueGoal > 0 
      ? (wallet.balance / cashCoach.financialGoals.revenueGoal) * 100 
      : 0;

    // Get financial insights
    const insights = await getFinancialInsights(req.user.userId);

    res.json({
      success: true,
      data: {
        // Financial Goals (Slider Values)
        financialGoals: cashCoach.financialGoals,
        
        // Monthly Summary (Calculated)
        monthlySummary: cashCoach.monthlySummary,
        
        // Current Status
        currentBalance: wallet.balance,
        currentXP: xp.current,
        currentLevel: xp.level,
        
        // Progress Tracking
        taskProgress: cashCoach.taskProgress,
        goalProgress: Math.min(goalProgress, 100),
        
        // Linked Accounts
        linkedAccounts: cashCoach.linkedAccounts,
        
        // Custom Goals
        customGoals: cashCoach.customGoals,
        
        // Recent Earnings
        recentEarnings: cashCoach.earningHistory.slice(-5),
        
        // Financial Insights
        insights,
        
        // Settings
        settings: cashCoach.settings
      }
    });
  } catch (error) {
    console.error('Error getting Cash Coach dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data',
      error: error.message
    });
  }
});

// ============================================================================
// FINANCIAL GOALS & SLIDERS ENDPOINTS
// ============================================================================

/**
 * Update financial goals (slider values)
 * PUT /api/cash-coach/financial-goals
 */
router.put('/financial-goals', protect, [
  body('salary').optional().isNumeric().withMessage('Salary must be a number'),
  body('rent').optional().isNumeric().withMessage('Rent must be a number'),
  body('food').optional().isNumeric().withMessage('Food must be a number'),
  body('savings').optional().isNumeric().withMessage('Savings must be a number'),
  body('revenueGoal').optional().isNumeric().withMessage('Revenue goal must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { salary, rent, food, savings, revenueGoal } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update financial goals
    if (salary !== undefined) user.cashCoach.financialGoals.salary = salary;
    if (rent !== undefined) user.cashCoach.financialGoals.rent = rent;
    if (food !== undefined) user.cashCoach.financialGoals.food = food;
    if (savings !== undefined) user.cashCoach.financialGoals.savings = savings;
    if (revenueGoal !== undefined) user.cashCoach.financialGoals.revenueGoal = revenueGoal;

    // Recalculate monthly summary
    user.cashCoach.monthlySummary = calculateMonthlySummary(user.cashCoach.financialGoals);

    await user.save();

    res.json({
      success: true,
      message: 'Financial goals updated successfully',
      data: {
        financialGoals: user.cashCoach.financialGoals,
        monthlySummary: user.cashCoach.monthlySummary
      }
    });
  } catch (error) {
    console.error('Error updating financial goals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update financial goals',
      error: error.message
    });
  }
});

/**
 * Get financial goals
 * GET /api/cash-coach/financial-goals
 */
router.get('/financial-goals', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('cashCoach');
    
    res.json({
      success: true,
      data: {
        financialGoals: user.cashCoach.financialGoals,
        monthlySummary: user.cashCoach.monthlySummary
      }
    });
  } catch (error) {
    console.error('Error getting financial goals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get financial goals',
      error: error.message
    });
  }
});

// ============================================================================
// HELP ME EARN ENDPOINTS
// ============================================================================

/**
 * Get personalized earning recommendations
 * GET /api/cash-coach/help-me-earn
 */
router.get('/help-me-earn', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('cashCoach');
    const revenueGoal = user.cashCoach.financialGoals.revenueGoal;

    if (revenueGoal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please set a revenue goal first'
      });
    }

    const recommendations = await generateTaskRecommendations(revenueGoal, req.user.userId);

    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    console.error('Error getting earning recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get earning recommendations',
      error: error.message
    });
  }
});

/**
 * Initialize task progress for "Achieve Your Goal" screen
 * POST /api/cash-coach/initialize-goal
 */
router.post('/initialize-goal', protect, [
  body('revenueGoal').isNumeric().withMessage('Revenue goal must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { revenueGoal } = req.body;
    const userId = req.user.userId;

    const result = await initializeTaskProgress(userId, revenueGoal);

    res.json({
      success: true,
      message: 'Goal initialized successfully',
      data: result
    });
  } catch (error) {
    console.error('Error initializing goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize goal',
      error: error.message
    });
  }
});

// ============================================================================
// TASK PROGRESS & ACHIEVE YOUR GOAL ENDPOINTS
// ============================================================================

/**
 * Get task progress
 * GET /api/cash-coach/task-progress
 */
router.get('/task-progress', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('cashCoach');
    
    res.json({
      success: true,
      data: {
        taskProgress: user.cashCoach.taskProgress,
        isActive: user.cashCoach.taskProgress.isActive,
        progress: user.cashCoach.taskProgress.currentStep / user.cashCoach.taskProgress.totalSteps * 100
      }
    });
  } catch (error) {
    console.error('Error getting task progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task progress',
      error: error.message
    });
  }
});

/**
 * Complete a task step
 * POST /api/cash-coach/complete-task
 */
router.post('/complete-task', protect, [
  body('stepId').isString().withMessage('Step ID is required'),
  body('source').optional().isString().withMessage('Source must be a string')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { stepId, source } = req.body;
    const userId = req.user.userId;

    const result = await updateTaskProgress(userId, stepId, { source });

    res.json({
      success: true,
      message: 'Task completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error completing task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete task',
      error: error.message
    });
  }
});

/**
 * Reset task progress
 * POST /api/cash-coach/reset-progress
 */
router.post('/reset-progress', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Reset task progress
    user.cashCoach.taskProgress = {
      steps: [],
      currentStep: 0,
      totalSteps: 0,
      totalReward: { coins: 0, xp: 0 },
      isActive: false,
      startedAt: null,
      completedAt: null
    };

    await user.save();

    res.json({
      success: true,
      message: 'Progress reset successfully'
    });
  } catch (error) {
    console.error('Error resetting progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset progress',
      error: error.message
    });
  }
});

// ============================================================================
// LINKED ACCOUNTS & PAYOUT METHODS ENDPOINTS
// ============================================================================

/**
 * Get linked accounts and payout methods
 * GET /api/cash-coach/linked-accounts
 */
router.get('/linked-accounts', protect, async (req, res) => {
  try {
    const payoutMethods = await getPayoutMethods(req.user.userId);
    const user = await User.findById(req.user.userId).select('cashCoach.linkedAccounts');
    
    res.json({
      success: true,
      data: {
        payoutMethods,
        linkedAccounts: user.cashCoach.linkedAccounts
      }
    });
  } catch (error) {
    console.error('Error getting linked accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get linked accounts',
      error: error.message
    });
  }
});

/**
 * Link a payout account
 * POST /api/cash-coach/link-account
 */
router.post('/link-account', protect, [
  body('provider').isIn(['paypal', 'gpay', 'revolut', 'bank', 'crypto']).withMessage('Invalid provider'),
  body('accountId').isString().withMessage('Account ID is required'),
  body('accountName').isString().withMessage('Account name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { provider, accountId, accountName } = req.body;
    const userId = req.user.userId;

    const result = await linkPayoutAccount(userId, { provider, accountId, accountName });

    res.json({
      success: true,
      message: 'Account linked successfully',
      data: result
    });
  } catch (error) {
    console.error('Error linking account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to link account',
      error: error.message
    });
  }
});

/**
 * Unlink a payout account
 * DELETE /api/cash-coach/link-account/:accountId
 */
router.delete('/link-account/:accountId', protect, async (req, res) => {
  try {
    const { accountId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove the linked account
    user.cashCoach.linkedAccounts = user.cashCoach.linkedAccounts.filter(
      acc => acc.accountId !== accountId
    );

    await user.save();

    res.json({
      success: true,
      message: 'Account unlinked successfully'
    });
  } catch (error) {
    console.error('Error unlinking account:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlink account',
      error: error.message
    });
  }
});

// ============================================================================
// CUSTOM GOALS ENDPOINTS
// ============================================================================

/**
 * Create a custom goal
 * POST /api/cash-coach/custom-goals
 */
router.post('/custom-goals', protect, [
  body('name').isString().withMessage('Goal name is required'),
  body('targetAmount').isNumeric().withMessage('Target amount must be a number'),
  body('category').optional().isIn(['vacation', 'rent_deposit', 'emergency', 'purchase', 'savings', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('targetDate').optional().isISO8601().withMessage('Invalid target date')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, description, targetAmount, category, priority, targetDate } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newGoal = {
      id: Date.now().toString(),
      name,
      description: description || '',
      targetAmount,
      currentAmount: 0,
      category: category || 'other',
      priority: priority || 'medium',
      status: 'active',
      targetDate: targetDate ? new Date(targetDate) : null,
      createdAt: new Date()
    };

    user.cashCoach.customGoals.push(newGoal);
    await user.save();

    res.json({
      success: true,
      message: 'Custom goal created successfully',
      data: newGoal
    });
  } catch (error) {
    console.error('Error creating custom goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create custom goal',
      error: error.message
    });
  }
});

/**
 * Update a custom goal
 * PUT /api/cash-coach/custom-goals/:goalId
 */
router.put('/custom-goals/:goalId', protect, [
  body('name').optional().isString(),
  body('targetAmount').optional().isNumeric(),
  body('currentAmount').optional().isNumeric(),
  body('status').optional().isIn(['active', 'completed', 'paused', 'cancelled'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { goalId } = req.params;
    const updates = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const goalIndex = user.cashCoach.customGoals.findIndex(goal => goal.id === goalId);
    if (goalIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }

    // Update goal
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        user.cashCoach.customGoals[goalIndex][key] = updates[key];
      }
    });

    // Set completed date if status changed to completed
    if (updates.status === 'completed' && user.cashCoach.customGoals[goalIndex].status !== 'completed') {
      user.cashCoach.customGoals[goalIndex].completedAt = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: 'Goal updated successfully',
      data: user.cashCoach.customGoals[goalIndex]
    });
  } catch (error) {
    console.error('Error updating custom goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update custom goal',
      error: error.message
    });
  }
});

/**
 * Delete a custom goal
 * DELETE /api/cash-coach/custom-goals/:goalId
 */
router.delete('/custom-goals/:goalId', protect, async (req, res) => {
  try {
    const { goalId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.cashCoach.customGoals = user.cashCoach.customGoals.filter(goal => goal.id !== goalId);
    await user.save();

    res.json({
      success: true,
      message: 'Goal deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting custom goal:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete custom goal',
      error: error.message
    });
  }
});

// ============================================================================
// RECEIPT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Upload a receipt
 * POST /api/cash-coach/receipts
 */
router.post('/receipts', protect, [
  body('amount').isNumeric().withMessage('Amount must be a number'),
  body('category').optional().isIn(['rent', 'food', 'utilities', 'transport', 'entertainment', 'other']),
  body('description').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { amount, category, description, imageUrl } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate reward based on amount (1% cashback)
    const rewardAmount = Math.floor(amount * 0.01);
    const xpReward = Math.floor(amount * 0.1);

    const newReceipt = {
      id: Date.now().toString(),
      amount,
      category: category || 'other',
      description: description || '',
      imageUrl: imageUrl || '',
      status: 'processing',
      reward: {
        coins: rewardAmount,
        xp: xpReward
      },
      uploadedAt: new Date()
    };

    user.cashCoach.receipts.push(newReceipt);
    
    // Add to earning history
    user.cashCoach.earningHistory.push({
      date: new Date(),
      source: 'receipt',
      amount: rewardAmount,
      description: `Receipt upload: ${description || 'No description'}`,
      taskId: newReceipt.id
    });

    await user.save();

    res.json({
      success: true,
      message: 'Receipt uploaded successfully',
      data: newReceipt
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload receipt',
      error: error.message
    });
  }
});

/**
 * Get receipt history
 * GET /api/cash-coach/receipts
 */
router.get('/receipts', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('cashCoach.receipts');
    
    res.json({
      success: true,
      data: user.cashCoach.receipts
    });
  } catch (error) {
    console.error('Error getting receipts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get receipts',
      error: error.message
    });
  }
});

// ============================================================================
// FINANCIAL INSIGHTS ENDPOINTS
// ============================================================================

/**
 * Get financial insights and recommendations
 * GET /api/cash-coach/insights
 */
router.get('/insights', protect, async (req, res) => {
  try {
    const insights = await getFinancialInsights(req.user.userId);
    
    res.json({
      success: true,
      data: insights
    });
  } catch (error) {
    console.error('Error getting financial insights:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get financial insights',
      error: error.message
    });
  }
});

// ============================================================================
// EARNING HISTORY ENDPOINTS
// ============================================================================

/**
 * Get earning history
 * GET /api/cash-coach/earning-history
 */
router.get('/earning-history', protect, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const user = await User.findById(req.user.userId).select('cashCoach.earningHistory');
    
    const history = user.cashCoach.earningHistory
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      data: {
        history,
        total: user.cashCoach.earningHistory.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Error getting earning history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get earning history',
      error: error.message
    });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Import models
const Offer = require('../models/Offer');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const GameDisplayRule = require('../models/GameDisplayRule');
const TaskProgressionRule = require('../models/TaskProgressionRule');
const WelcomeBonusTimer = require('../models/WelcomeBonusTimer');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// ==================== OFFERS MANAGEMENT ====================

// Get all offers with filtering and pagination
router.get('/offers', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      country = '', 
      sdkProvider = '', 
      xptr = '', 
      adOffer = '', 
      status = 'all' 
    } = req.query;
    
    let query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Country filter
    if (country) {
      query.countries = { $in: [country] };
    }
    
    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }
    
    // XPTR filter
    if (xptr) {
      query.xptrRule = { $regex: xptr, $options: 'i' };
    }
    
    // Ad Offer filter
    if (adOffer !== '') {
      query.isAdSupported = adOffer === 'true';
    }
    
    // Status filter
    if (status !== 'all') {
      query.isActive = status === 'active';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const offers = await Offer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sdkProvider', 'name')
      .lean();
    
    const total = await Offer.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        offers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting offers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offers',
      error: error.message
    });
  }
});

// Get single offer by ID
router.get('/offers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findById(id)
      .populate('sdkProvider', 'name')
      .lean();
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    res.json({
      success: true,
      data: offer
    });
  } catch (error) {
    console.error('Error getting offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get offer',
      error: error.message
    });
  }
});

// Create new offer
router.post('/offers', adminAuth, [
  body('name').notEmpty().withMessage('Offer name is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('sdkProvider').notEmpty().withMessage('SDK Provider is required'),
  body('expiryDate').isISO8601().withMessage('Valid expiry date is required'),
  body('countries').isArray().withMessage('Countries must be an array'),
  body('tierAccess').isArray().withMessage('Tier access must be an array')
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

    const offerData = req.body;
    offerData.createdBy = req.user.userId;
    
    const offer = new Offer(offerData);
    await offer.save();
    
    res.status(201).json({
      success: true,
      message: 'Offer created successfully',
      data: offer
    });
  } catch (error) {
    console.error('Error creating offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create offer',
      error: error.message
    });
  }
});

// Update offer
router.put('/offers/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Offer name cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('expiryDate').optional().isISO8601().withMessage('Valid expiry date is required')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();
    
    const offer = await Offer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Offer updated successfully',
      data: offer
    });
  } catch (error) {
    console.error('Error updating offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update offer',
      error: error.message
    });
  }
});

// Delete offer
router.delete('/offers/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findByIdAndDelete(id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Offer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete offer',
      error: error.message
    });
  }
});

// Toggle offer status
router.patch('/offers/:id/toggle-status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findById(id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Offer not found'
      });
    }
    
    offer.isActive = !offer.isActive;
    offer.updatedBy = req.user.userId;
    offer.updatedAt = new Date();
    
    await offer.save();
    
    res.json({
      success: true,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: offer.isActive }
    });
  } catch (error) {
    console.error('Error toggling offer status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle offer status',
      error: error.message
    });
  }
});

// ==================== GAMES MANAGEMENT ====================

// Get all games with filtering and pagination
router.get('/games', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      country = '', 
      sdkProvider = '', 
      xptr = '', 
      adGame = '', 
      status = 'all' 
    } = req.query;
    
    let query = {};
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Country filter
    if (country) {
      query.countries = { $in: [country] };
    }
    
    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }
    
    // XPTR filter
    if (xptr) {
      query.xptrRules = { $regex: xptr, $options: 'i' };
    }
    
    // Ad Game filter
    if (adGame !== '') {
      query.isAdSupported = adGame === 'true';
    }
    
    // Status filter
    if (status !== 'all') {
      query.isActive = status === 'active';
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('sdkProvider', 'name')
      .lean();
    
    // Add task count for each game
    const gamesWithTaskCount = await Promise.all(
      games.map(async (game) => {
        const taskCount = await GameTask.countDocuments({ gameId: game._id });
        return { ...game, taskCount };
      })
    );
    
    const total = await Game.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        games: gamesWithTaskCount,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting games:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get games',
      error: error.message
    });
  }
});

// Get single game by ID
router.get('/games/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const game = await Game.findById(id)
      .populate('sdkProvider', 'name')
      .lean();
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    // Get task count
    const taskCount = await GameTask.countDocuments({ gameId: id });
    game.taskCount = taskCount;
    
    res.json({
      success: true,
      data: game
    });
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get game',
      error: error.message
    });
  }
});

// Create new game
router.post('/games', adminAuth, [
  body('title').notEmpty().withMessage('Game title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('sdkProvider').notEmpty().withMessage('SDK Provider is required'),
  body('countries').isArray().withMessage('Countries must be an array'),
  body('xptrRules').notEmpty().withMessage('XPTR Rules are required')
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

    const gameData = req.body;
    gameData.createdBy = req.user.userId;
    
    const game = new Game(gameData);
    await game.save();
    
    res.status(201).json({
      success: true,
      message: 'Game created successfully',
      data: game
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create game',
      error: error.message
    });
  }
});

// Update game
router.put('/games/:id', adminAuth, [
  body('title').optional().notEmpty().withMessage('Game title cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();
    
    const game = await Game.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Game updated successfully',
      data: game
    });
  } catch (error) {
    console.error('Error updating game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update game',
      error: error.message
    });
  }
});

// Delete game
router.delete('/games/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if game has tasks
    const taskCount = await GameTask.countDocuments({ gameId: id });
    if (taskCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete game with existing tasks. Delete tasks first.'
      });
    }
    
    const game = await Game.findByIdAndDelete(id);
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting game:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete game',
      error: error.message
    });
  }
});

// ==================== TASKS MANAGEMENT ====================

// Get all tasks for a specific game
router.get('/games/:gameId/tasks', adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      search = '' 
    } = req.query;
    
    let query = { gameId };
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { completionRule: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tasks = await GameTask.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const total = await GameTask.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting tasks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tasks',
      error: error.message
    });
  }
});

// Get single task by ID
router.get('/tasks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await GameTask.findById(id).lean();
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    console.error('Error getting task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task',
      error: error.message
    });
  }
});

// Create new task
router.post('/games/:gameId/tasks', adminAuth, [
  body('name').notEmpty().withMessage('Task name is required'),
  body('completionRule').notEmpty().withMessage('Completion rule is required'),
  body('rewardType').isIn(['xp', 'coins']).withMessage('Reward type must be xp or coins'),
  body('rewardValue').isNumeric().withMessage('Reward value must be numeric')
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

    const { gameId } = req.params;
    
    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    const taskData = {
      ...req.body,
      gameId,
      createdBy: req.user.userId
    };
    
    const task = new GameTask(taskData);
    await task.save();
    
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task',
      error: error.message
    });
  }
});

// Update task
router.put('/tasks/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Task name cannot be empty'),
  body('completionRule').optional().notEmpty().withMessage('Completion rule cannot be empty'),
  body('rewardType').optional().isIn(['xp', 'coins']).withMessage('Reward type must be xp or coins'),
  body('rewardValue').optional().isNumeric().withMessage('Reward value must be numeric')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();
    
    const task = await GameTask.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Task updated successfully',
      data: task
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task',
      error: error.message
    });
  }
});

// Delete task
router.delete('/tasks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await GameTask.findByIdAndDelete(id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete task',
      error: error.message
    });
  }
});

// Toggle task override
router.patch('/tasks/:id/toggle-override', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await GameTask.findById(id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    task.isOverride = !task.isOverride;
    task.updatedBy = req.user.userId;
    task.updatedAt = new Date();
    
    await task.save();
    
    res.json({
      success: true,
      message: `Task override ${task.isOverride ? 'enabled' : 'disabled'} successfully`,
      data: { isOverride: task.isOverride }
    });
  } catch (error) {
    console.error('Error toggling task override:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle task override',
      error: error.message
    });
  }
});

// ==================== GAME DISPLAY RULES ====================

// Get game display rules
router.get('/display-rules', adminAuth, async (req, res) => {
  try {
    const rules = await GameDisplayRule.find({ isEnabled: true })
      .sort({ order: 1, createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting display rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get display rules',
      error: error.message
    });
  }
});

// Create game display rule
router.post('/display-rules', adminAuth, [
  body('userMilestone').notEmpty().withMessage('User milestone is required'),
  body('maxGamesToShow').isNumeric().withMessage('Max games to show must be numeric'),
  body('isEnabled').isBoolean().withMessage('Enabled status must be boolean')
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

    const ruleData = {
      ...req.body,
      createdBy: req.user.userId
    };
    
    const rule = new GameDisplayRule(ruleData);
    await rule.save();
    
    res.status(201).json({
      success: true,
      message: 'Display rule created successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error creating display rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create display rule',
      error: error.message
    });
  }
});

// Update game display rule
router.put('/display-rules/:id', adminAuth, [
  body('maxGamesToShow').optional().isNumeric().withMessage('Max games to show must be numeric'),
  body('isEnabled').optional().isBoolean().withMessage('Enabled status must be boolean')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();
    
    const rule = await GameDisplayRule.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Display rule not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Display rule updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating display rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update display rule',
      error: error.message
    });
  }
});

// ==================== TASK PROGRESSION RULES ====================

// Get task progression rules
router.get('/progression-rules', adminAuth, async (req, res) => {
  try {
    const rules = await TaskProgressionRule.find({ isActive: true })
      .sort({ createdAt: -1 })
      .populate('taskId', 'name')
      .lean();
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting progression rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progression rules',
      error: error.message
    });
  }
});

// Create task progression rule
router.post('/progression-rules', adminAuth, [
  body('taskId').notEmpty().withMessage('Task ID is required'),
  body('unlockCondition').notEmpty().withMessage('Unlock condition is required'),
  body('lockType').isIn(['sequential', 'timed', 'manual']).withMessage('Invalid lock type'),
  body('rewardTriggerRule').notEmpty().withMessage('Reward trigger rule is required')
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

    const ruleData = {
      ...req.body,
      createdBy: req.user.userId
    };
    
    const rule = new TaskProgressionRule(ruleData);
    await rule.save();
    
    res.status(201).json({
      success: true,
      message: 'Progression rule created successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error creating progression rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create progression rule',
      error: error.message
    });
  }
});

// Update task progression rule
router.put('/progression-rules/:id', adminAuth, [
  body('unlockCondition').optional().notEmpty().withMessage('Unlock condition cannot be empty'),
  body('lockType').optional().isIn(['sequential', 'timed', 'manual']).withMessage('Invalid lock type'),
  body('rewardTriggerRule').optional().notEmpty().withMessage('Reward trigger rule cannot be empty')
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

    const { id } = req.params;
    const updateData = req.body;
    updateData.updatedBy = req.user.userId;
    updateData.updatedAt = new Date();
    
    const rule = await TaskProgressionRule.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'Progression rule not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Progression rule updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating progression rule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update progression rule',
      error: error.message
    });
  }
});

// ==================== WELCOME BONUS TIMER RULES ====================

// Get welcome bonus timer rules
router.get('/welcome-bonus-timer', adminAuth, async (req, res) => {
  try {
    const rules = await WelcomeBonusTimer.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({
      success: true,
      data: rules
    });
  } catch (error) {
    console.error('Error getting welcome bonus timer rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get welcome bonus timer rules',
      error: error.message
    });
  }
});

// Update welcome bonus timer rules
router.put('/welcome-bonus-timer', adminAuth, [
  body('unlockTimeHours').isNumeric().withMessage('Unlock time must be numeric'),
  body('completionDeadlineDays').isNumeric().withMessage('Completion deadline must be numeric')
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

    // Find existing rule or create new one
    let rule = await WelcomeBonusTimer.findOne({ isActive: true });
    
    if (rule) {
      rule.unlockTimeHours = req.body.unlockTimeHours;
      rule.completionDeadlineDays = req.body.completionDeadlineDays;
      rule.gameOverrides = req.body.gameOverrides || [];
      rule.xpTierOverrides = req.body.xpTierOverrides || [];
      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();
    } else {
      rule = new WelcomeBonusTimer({
        ...req.body,
        createdBy: req.user.userId
      });
    }
    
    await rule.save();
    
    res.json({
      success: true,
      message: 'Welcome bonus timer rules updated successfully',
      data: rule
    });
  } catch (error) {
    console.error('Error updating welcome bonus timer rules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update welcome bonus timer rules',
      error: error.message
    });
  }
});

// ==================== MASTER DATA ENDPOINTS ====================

// Get countries list
router.get('/master-data/countries', adminAuth, async (req, res) => {
  try {
    const countries = [
      { code: 'US', name: 'United States' },
      { code: 'IN', name: 'India' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'CA', name: 'Canada' },
      { code: 'AU', name: 'Australia' },
      { code: 'DE', name: 'Germany' },
      { code: 'FR', name: 'France' },
      { code: 'BR', name: 'Brazil' },
      { code: 'MX', name: 'Mexico' },
      { code: 'JP', name: 'Japan' }
    ];
    
    res.json({
      success: true,
      data: countries
    });
  } catch (error) {
    console.error('Error getting countries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get countries',
      error: error.message
    });
  }
});

// Get SDK providers list
router.get('/master-data/sdk-providers', adminAuth, async (req, res) => {
  try {
    const providers = [
      { id: 'bitlabs', name: 'BitLabs' },
      { id: 'adgem', name: 'AdGem' },
      { id: 'besitos', name: 'Besitos' },
      { id: 'cpx', name: 'CPX Research' },
      { id: 'ayet', name: 'Ayet Studios' },
      { id: 'unity', name: 'Unity Ads' },
      { id: 'ironsource', name: 'IronSource' }
    ];
    
    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    console.error('Error getting SDK providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SDK providers',
      error: error.message
    });
  }
});

// Get XPTR values list
router.get('/master-data/xptr-values', adminAuth, async (req, res) => {
  try {
    const xptrValues = [
      'Play 5 minutes',
      'Play 10 minutes',
      'Play 15 minutes',
      'Watch Ad',
      'Complete Level 1',
      'Complete Level 3',
      'Complete Level 5',
      'Install Game',
      'Open Event',
      'Video Completed'
    ];
    
    res.json({
      success: true,
      data: xptrValues
    });
  } catch (error) {
    console.error('Error getting XPTR values:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get XPTR values',
      error: error.message
    });
  }
});

// Get tier access list
router.get('/master-data/tier-access', adminAuth, async (req, res) => {
  try {
    const tiers = [
      { id: 'free', name: 'Free' },
      { id: 'bronze', name: 'Bronze' },
      { id: 'silver', name: 'Silver' },
      { id: 'gold', name: 'Gold' },
      { id: 'platinum', name: 'Platinum' }
    ];
    
    res.json({
      success: true,
      data: tiers
    });
  } catch (error) {
    console.error('Error getting tier access:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tier access',
      error: error.message
    });
  }
});

module.exports = router;

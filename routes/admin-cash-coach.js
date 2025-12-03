const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const TaskStepTemplate = require('../models/TaskStepTemplate');
const PayoutMethod = require('../models/PayoutMethod');
const FinancialInsight = require('../models/FinancialInsight');
const Deals = require('../models/Deals');

// ============================================================================
// ADMIN AUTHENTICATION MIDDLEWARE
// ============================================================================

const { adminAuth } = require('../middleware/adminAuth');

// ============================================================================
// TASK STEP TEMPLATE MANAGEMENT
// ============================================================================

/**
 * Get all task step templates with filtering and pagination
 * GET /api/admin/cash-coach/task-templates
 */
router.get('/task-templates', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      isActive,
      search,
      sortBy = 'order',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const templates = await TaskStepTemplate.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await TaskStepTemplate.countDocuments(filter);

    res.json({
      success: true,
      data: {
        templates,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting task templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task templates',
      error: error.message
    });
  }
});

/**
 * Get single task step template
 * GET /api/admin/cash-coach/task-templates/:id
 */
router.get('/task-templates/:id', adminAuth, async (req, res) => {
  try {
    const template = await TaskStepTemplate.findOne({ id: req.params.id });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Task template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error getting task template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get task template',
      error: error.message
    });
  }
});

/**
 * Create new task step template
 * POST /api/admin/cash-coach/task-templates
 */
router.post('/task-templates', adminAuth, [
  body('id').notEmpty().withMessage('ID is required'),
  body('title').notEmpty().withMessage('Title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('type').isIn(['game', 'survey', 'challenge', 'milestone', 'receipt']).withMessage('Invalid type'),
  body('reward.coins').isNumeric().withMessage('Coins must be a number'),
  body('reward.xp').isNumeric().withMessage('XP must be a number'),
  body('order').isNumeric().withMessage('Order must be a number')
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

    // Check if template with same ID already exists
    const existingTemplate = await TaskStepTemplate.findOne({ id: req.body.id });
    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'Template with this ID already exists'
      });
    }

    const template = new TaskStepTemplate(req.body);
    await template.save();

    res.status(201).json({
      success: true,
      message: 'Task template created successfully',
      data: template
    });
  } catch (error) {
    console.error('Error creating task template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create task template',
      error: error.message
    });
  }
});

/**
 * Update task step template
 * PUT /api/admin/cash-coach/task-templates/:id
 */
router.put('/task-templates/:id', adminAuth, [
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('type').optional().isIn(['game', 'survey', 'challenge', 'milestone', 'receipt']).withMessage('Invalid type'),
  body('reward.coins').optional().isNumeric().withMessage('Coins must be a number'),
  body('reward.xp').optional().isNumeric().withMessage('XP must be a number'),
  body('order').optional().isNumeric().withMessage('Order must be a number')
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

    const template = await TaskStepTemplate.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Task template not found'
      });
    }

    res.json({
      success: true,
      message: 'Task template updated successfully',
      data: template
    });
  } catch (error) {
    console.error('Error updating task template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task template',
      error: error.message
    });
  }
});

/**
 * Delete task step template
 * DELETE /api/admin/cash-coach/task-templates/:id
 */
router.delete('/task-templates/:id', adminAuth, async (req, res) => {
  try {
    const template = await TaskStepTemplate.findOneAndDelete({ id: req.params.id });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Task template not found'
      });
    }

    res.json({
      success: true,
      message: 'Task template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting task template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete task template',
      error: error.message
    });
  }
});

/**
 * Toggle task template active status
 * PATCH /api/admin/cash-coach/task-templates/:id/toggle
 */
router.patch('/task-templates/:id/toggle', adminAuth, async (req, res) => {
  try {
    const template = await TaskStepTemplate.findOne({ id: req.params.id });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Task template not found'
      });
    }

    template.isActive = !template.isActive;
    template.updatedAt = new Date();
    await template.save();

    res.json({
      success: true,
      message: `Task template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
      data: template
    });
  } catch (error) {
    console.error('Error toggling task template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle task template',
      error: error.message
    });
  }
});

// ============================================================================
// PAYOUT METHOD MANAGEMENT
// ============================================================================

/**
 * Get all payout methods with filtering and pagination
 * GET /api/admin/cash-coach/payout-methods
 */
router.get('/payout-methods', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      region,
      enabled,
      search,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (region) filter.regions = region;
    if (enabled !== undefined) filter.enabled = enabled === 'true';
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { id: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const methods = await PayoutMethod.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PayoutMethod.countDocuments(filter);

    res.json({
      success: true,
      data: {
        methods,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting payout methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout methods',
      error: error.message
    });
  }
});

/**
 * Get single payout method
 * GET /api/admin/cash-coach/payout-methods/:id
 */
router.get('/payout-methods/:id', adminAuth, async (req, res) => {
  try {
    const method = await PayoutMethod.findOne({ id: req.params.id });
    
    if (!method) {
      return res.status(404).json({
        success: false,
        message: 'Payout method not found'
      });
    }

    res.json({
      success: true,
      data: method
    });
  } catch (error) {
    console.error('Error getting payout method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payout method',
      error: error.message
    });
  }
});

/**
 * Create new payout method
 * POST /api/admin/cash-coach/payout-methods
 */
router.post('/payout-methods', adminAuth, [
  body('id').notEmpty().withMessage('ID is required'),
  body('name').notEmpty().withMessage('Name is required'),
  body('icon').notEmpty().withMessage('Icon is required'),
  body('minAmount').isNumeric().withMessage('Min amount must be a number'),
  body('processingTime').isIn(['instant', '1-3 days', '3-5 days', '5-7 days']).withMessage('Invalid processing time'),
  body('regions').isArray().withMessage('Regions must be an array'),
  body('currencies').isArray().withMessage('Currencies must be an array')
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

    // Check if method with same ID already exists
    const existingMethod = await PayoutMethod.findOne({ id: req.body.id });
    if (existingMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payout method with this ID already exists'
      });
    }

    const method = new PayoutMethod(req.body);
    await method.save();

    res.status(201).json({
      success: true,
      message: 'Payout method created successfully',
      data: method
    });
  } catch (error) {
    console.error('Error creating payout method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payout method',
      error: error.message
    });
  }
});

/**
 * Update payout method
 * PUT /api/admin/cash-coach/payout-methods/:id
 */
router.put('/payout-methods/:id', adminAuth, [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('minAmount').optional().isNumeric().withMessage('Min amount must be a number'),
  body('processingTime').optional().isIn(['instant', '1-3 days', '3-5 days', '5-7 days']).withMessage('Invalid processing time')
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

    const method = await PayoutMethod.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!method) {
      return res.status(404).json({
        success: false,
        message: 'Payout method not found'
      });
    }

    res.json({
      success: true,
      message: 'Payout method updated successfully',
      data: method
    });
  } catch (error) {
    console.error('Error updating payout method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payout method',
      error: error.message
    });
  }
});

/**
 * Delete payout method
 * DELETE /api/admin/cash-coach/payout-methods/:id
 */
router.delete('/payout-methods/:id', adminAuth, async (req, res) => {
  try {
    const method = await PayoutMethod.findOneAndDelete({ id: req.params.id });

    if (!method) {
      return res.status(404).json({
        success: false,
        message: 'Payout method not found'
      });
    }

    res.json({
      success: true,
      message: 'Payout method deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting payout method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payout method',
      error: error.message
    });
  }
});

/**
 * Toggle payout method enabled status
 * PATCH /api/admin/cash-coach/payout-methods/:id/toggle
 */
router.patch('/payout-methods/:id/toggle', adminAuth, async (req, res) => {
  try {
    const method = await PayoutMethod.findOne({ id: req.params.id });

    if (!method) {
      return res.status(404).json({
        success: false,
        message: 'Payout method not found'
      });
    }

    method.enabled = !method.enabled;
    method.updatedAt = new Date();
    await method.save();

    res.json({
      success: true,
      message: `Payout method ${method.enabled ? 'enabled' : 'disabled'} successfully`,
      data: method
    });
  } catch (error) {
    console.error('Error toggling payout method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle payout method',
      error: error.message
    });
  }
});

// ============================================================================
// FINANCIAL INSIGHT MANAGEMENT
// ============================================================================

/**
 * Get all financial insights with filtering and pagination
 * GET /api/admin/cash-coach/financial-insights
 */
router.get('/financial-insights', adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      type,
      category,
      priority,
      isActive,
      search,
      sortBy = 'priority',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {};
    if (type) filter.type = type;
    if (category) filter['metadata.category'] = category;
    if (priority) filter.priority = parseInt(priority);
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const insights = await FinancialInsight.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await FinancialInsight.countDocuments(filter);

    res.json({
      success: true,
      data: {
        insights,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
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

/**
 * Get single financial insight
 * GET /api/admin/cash-coach/financial-insights/:id
 */
router.get('/financial-insights/:id', adminAuth, async (req, res) => {
  try {
    const insight = await FinancialInsight.findOne({ id: req.params.id });
    
    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Financial insight not found'
      });
    }

    res.json({
      success: true,
      data: insight
    });
  } catch (error) {
    console.error('Error getting financial insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get financial insight',
      error: error.message
    });
  }
});

/**
 * Create new financial insight
 * POST /api/admin/cash-coach/financial-insights
 */
router.post('/financial-insights', adminAuth, [
  body('id').notEmpty().withMessage('ID is required'),
  body('type').isIn(['tip', 'warning', 'motivation', 'achievement', 'reminder']).withMessage('Invalid type'),
  body('title').notEmpty().withMessage('Title is required'),
  body('message').notEmpty().withMessage('Message is required'),
  body('priority').isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  body('conditions').isObject().withMessage('Conditions must be an object')
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

    // Check if insight with same ID already exists
    const existingInsight = await FinancialInsight.findOne({ id: req.body.id });
    if (existingInsight) {
      return res.status(400).json({
        success: false,
        message: 'Financial insight with this ID already exists'
      });
    }

    const insight = new FinancialInsight(req.body);
    await insight.save();

    res.status(201).json({
      success: true,
      message: 'Financial insight created successfully',
      data: insight
    });
  } catch (error) {
    console.error('Error creating financial insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create financial insight',
      error: error.message
    });
  }
});

/**
 * Update financial insight
 * PUT /api/admin/cash-coach/financial-insights/:id
 */
router.put('/financial-insights/:id', adminAuth, [
  body('type').optional().isIn(['tip', 'warning', 'motivation', 'achievement', 'reminder']).withMessage('Invalid type'),
  body('title').optional().notEmpty().withMessage('Title cannot be empty'),
  body('message').optional().notEmpty().withMessage('Message cannot be empty'),
  body('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10')
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

    const insight = await FinancialInsight.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Financial insight not found'
      });
    }

    res.json({
      success: true,
      message: 'Financial insight updated successfully',
      data: insight
    });
  } catch (error) {
    console.error('Error updating financial insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update financial insight',
      error: error.message
    });
  }
});

/**
 * Delete financial insight
 * DELETE /api/admin/cash-coach/financial-insights/:id
 */
router.delete('/financial-insights/:id', adminAuth, async (req, res) => {
  try {
    const insight = await FinancialInsight.findOneAndDelete({ id: req.params.id });

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Financial insight not found'
      });
    }

    res.json({
      success: true,
      message: 'Financial insight deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting financial insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete financial insight',
      error: error.message
    });
  }
});

/**
 * Toggle financial insight active status
 * PATCH /api/admin/cash-coach/financial-insights/:id/toggle
 */
router.patch('/financial-insights/:id/toggle', adminAuth, async (req, res) => {
  try {
    const insight = await FinancialInsight.findOne({ id: req.params.id });

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: 'Financial insight not found'
      });
    }

    insight.isActive = !insight.isActive;
    insight.updatedAt = new Date();
    await insight.save();

    res.json({
      success: true,
      message: `Financial insight ${insight.isActive ? 'activated' : 'deactivated'} successfully`,
      data: insight
    });
  } catch (error) {
    console.error('Error toggling financial insight:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle financial insight',
      error: error.message
    });
  }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Bulk update task template order
 * PUT /api/admin/cash-coach/task-templates/bulk/order
 */
router.put('/task-templates/bulk/order', adminAuth, [
  body('updates').isArray().withMessage('Updates must be an array'),
  body('updates.*.id').notEmpty().withMessage('ID is required'),
  body('updates.*.order').isNumeric().withMessage('Order must be a number')
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

    const { updates } = req.body;
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { id: update.id },
        update: { order: update.order, updatedAt: new Date() }
      }
    }));

    await TaskStepTemplate.bulkWrite(bulkOps);

    res.json({
      success: true,
      message: 'Task template order updated successfully'
    });
  } catch (error) {
    console.error('Error bulk updating task template order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update task template order',
      error: error.message
    });
  }
});

/**
 * Bulk toggle active status
 * PATCH /api/admin/cash-coach/:type/bulk/toggle
 */
router.patch('/:type/bulk/toggle', adminAuth, [
  body('ids').isArray().withMessage('IDs must be an array'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean')
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

    const { type } = req.params;
    const { ids, isActive } = req.body;

    let Model;
    switch (type) {
      case 'task-templates':
        Model = TaskStepTemplate;
        break;
      case 'payout-methods':
        Model = PayoutMethod;
        break;
      case 'financial-insights':
        Model = FinancialInsight;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid type'
        });
    }

    const updateField = type === 'payout-methods' ? 'enabled' : 'isActive';
    const update = { [updateField]: isActive, updatedAt: new Date() };

    await Model.updateMany({ id: { $in: ids } }, update);

    res.json({
      success: true,
      message: `${type} ${isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error bulk toggling:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk toggle',
      error: error.message
    });
  }
});

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Get Cash Coach analytics dashboard
 * GET /api/admin/cash-coach/analytics
 */
router.get('/analytics', adminAuth, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // Get counts
    const [
      taskTemplatesCount,
      payoutMethodsCount,
      financialInsightsCount,
      activeDealsCount
    ] = await Promise.all([
      TaskStepTemplate.countDocuments(),
      PayoutMethod.countDocuments(),
      FinancialInsight.countDocuments(),
      Deals.countDocuments({ active: true })
    ]);

    // Get active counts
    const [
      activeTaskTemplates,
      enabledPayoutMethods,
      activeFinancialInsights
    ] = await Promise.all([
      TaskStepTemplate.countDocuments({ isActive: true }),
      PayoutMethod.countDocuments({ enabled: true }),
      FinancialInsight.countDocuments({ isActive: true })
    ]);

    // Get type distributions
    const taskTypeDistribution = await TaskStepTemplate.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const insightTypeDistribution = await FinancialInsight.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    const payoutRegionDistribution = await PayoutMethod.aggregate([
      { $unwind: '$regions' },
      { $group: { _id: '$regions', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          taskTemplates: { total: taskTemplatesCount, active: activeTaskTemplates },
          payoutMethods: { total: payoutMethodsCount, enabled: enabledPayoutMethods },
          financialInsights: { total: financialInsightsCount, active: activeFinancialInsights },
          activeDeals: activeDealsCount
        },
        distributions: {
          taskTypes: taskTypeDistribution,
          insightTypes: insightTypeDistribution,
          payoutRegions: payoutRegionDistribution
        },
        period,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error getting analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get analytics',
      error: error.message
    });
  }
});

/**
 * Get system health status
 * GET /api/admin/cash-coach/health
 */
router.get('/health', adminAuth, async (req, res) => {
  try {
    const health = {
      database: 'connected',
      models: {
        taskTemplates: 'ok',
        payoutMethods: 'ok',
        financialInsights: 'ok',
        deals: 'ok'
      },
      timestamp: new Date()
    };

    // Test database connections
    try {
      await TaskStepTemplate.findOne();
      await PayoutMethod.findOne();
      await FinancialInsight.findOne();
      await Deals.findOne();
    } catch (error) {
      health.database = 'error';
      health.error = error.message;
    }

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Error checking health:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check health',
      error: error.message
    });
  }
});

module.exports = router;

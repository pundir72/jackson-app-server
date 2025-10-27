const express = require('express');
const { body, validationResult } = require('express-validator');
const Integration = require('../models/Integration');
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// ==================== VALIDATION RULES ====================

const createIntegrationValidation = [
  body('integrationName').notEmpty().withMessage('Integration name is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('apiKey').notEmpty().withMessage('API Key is required'),
  body('endpointUrl').notEmpty().withMessage('Endpoint URL is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('active').optional().isBoolean().withMessage('Active must be boolean')
];

const updateIntegrationValidation = [
  body('integrationName').optional().notEmpty().withMessage('Integration name cannot be empty'),
  body('category').optional().notEmpty().withMessage('Category cannot be empty'),
  body('apiKey').optional().notEmpty().withMessage('API Key cannot be empty'),
  body('endpointUrl').optional().notEmpty().withMessage('Endpoint URL cannot be empty'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('active').optional().isBoolean().withMessage('Active must be boolean')
];

// ==================== CRUD OPERATIONS ====================

/**
 * @route   POST /api/integration
 * @desc    Create new integration
 * @access  Private (Admin only)
 */
router.post('/', adminAuth, createIntegrationValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const integrationData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const integration = await Integration.create(integrationData);

    res.status(201).json({
      success: true,
      message: 'Integration created successfully',
      data: integration.getDisplayData()
    });
  } catch (error) {
    console.error('Error creating integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create integration'
    });
  }
});

/**
 * @route   GET /api/integration
 * @desc    Get all integrations with filtering and pagination
 * @access  Private (Admin only)
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      active,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (category) query.category = category;
    if (active !== undefined) query.active = active === 'true';

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const integrations = await Integration.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name email');

    const total = await Integration.countDocuments(query);

    res.json({
      success: true,
      data: {
        integrations: integrations.map(integration => integration.getDisplayData()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting integrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get integrations'
    });
  }
});

/**
 * @route   GET /api/integration/:id
 * @desc    Get specific integration by ID
 * @access  Private (Admin only)
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await Integration.findById(id)
      .populate('createdBy', 'name email');

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    res.json({
      success: true,
      data: integration.getDisplayData()
    });
  } catch (error) {
    console.error('Error getting integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get integration'
    });
  }
});

/**
 * @route   PUT /api/integration/:id
 * @desc    Update integration
 * @access  Private (Admin only)
 */
router.put('/:id', adminAuth, updateIntegrationValidation, async (req, res) => {
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

    const integration = await Integration.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    res.json({
      success: true,
      message: 'Integration updated successfully',
      data: integration.getDisplayData()
    });
  } catch (error) {
    console.error('Error updating integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update integration'
    });
  }
});

/**
 * @route   DELETE /api/integration/:id
 * @desc    Delete integration
 * @access  Private (Admin only)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await Integration.findById(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    await Integration.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Integration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete integration'
    });
  }
});

/**
 * @route   PATCH /api/integration/:id/toggle
 * @desc    Toggle integration active status
 * @access  Private (Admin only)
 */
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const integration = await Integration.findById(id);
    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Integration not found'
      });
    }

    integration.active = !integration.active;
    await integration.save();

    res.json({
      success: true,
      message: `Integration ${integration.active ? 'activated' : 'deactivated'} successfully`,
      data: integration.getDisplayData()
    });
  } catch (error) {
    console.error('Error toggling integration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle integration'
    });
  }
});

module.exports = router;












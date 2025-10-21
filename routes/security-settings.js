const express = require('express');
const { body, validationResult } = require('express-validator');
const SecuritySettings = require('../models/SecuritySettings');
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// ==================== VALIDATION RULES ====================

const createSecuritySettingsValidation = [
  body('name').notEmpty().withMessage('Name is required'),
  body('verificationMethod').notEmpty().withMessage('Verification method is required'),
  body('retryType').notEmpty().withMessage('Retry type is required'),
  body('retryLimit').isInt({ min: 1, max: 10 }).withMessage('Retry limit must be between 1 and 10'),
  body('lockDuration').isInt({ min: 1, max: 1440 }).withMessage('Lock duration must be between 1 and 1440 minutes'),
  body('userRole').notEmpty().withMessage('User role is required')
];

const updateSecuritySettingsValidation = [
  body('name').optional().notEmpty().withMessage('Name cannot be empty'),
  body('verificationMethod').optional().notEmpty().withMessage('Verification method cannot be empty'),
  body('retryType').optional().notEmpty().withMessage('Retry type cannot be empty'),
  body('retryLimit').optional().isInt({ min: 1, max: 10 }).withMessage('Retry limit must be between 1 and 10'),
  body('lockDuration').optional().isInt({ min: 1, max: 1440 }).withMessage('Lock duration must be between 1 and 1440 minutes'),
  body('userRole').optional().notEmpty().withMessage('User role cannot be empty'),
  body('status').optional().notEmpty().withMessage('Status cannot be empty')
];

// ==================== CRUD OPERATIONS ====================

/**
 * @route   POST /api/security-settings
 * @desc    Create new security settings
 * @access  Private (Admin only)
 */
router.post('/', adminAuth, createSecuritySettingsValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const securitySettingsData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const securitySettings = await SecuritySettings.create(securitySettingsData);

    res.status(201).json({
      success: true,
      message: 'Security settings created successfully',
      data: securitySettings.getDisplayData()
    });
  } catch (error) {
    console.error('Error creating security settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create security settings'
    });
  }
});

/**
 * @route   GET /api/security-settings
 * @desc    Get all security settings with filtering and pagination
 * @access  Private (Admin only)
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      userRole, 
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (userRole) query.userRole = userRole;
    if (status) query.status = status;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const securitySettings = await SecuritySettings.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name email');

    const total = await SecuritySettings.countDocuments(query);

    res.json({
      success: true,
      data: {
        securitySettings: securitySettings.map(setting => setting.getDisplayData()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting security settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security settings'
    });
  }
});

/**
 * @route   GET /api/security-settings/:id
 * @desc    Get specific security settings by ID
 * @access  Private (Admin only)
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const securitySettings = await SecuritySettings.findById(id)
      .populate('createdBy', 'name email');

    if (!securitySettings) {
      return res.status(404).json({
        success: false,
        error: 'Security settings not found'
      });
    }

    res.json({
      success: true,
      data: securitySettings.getDisplayData()
    });
  } catch (error) {
    console.error('Error getting security settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get security settings'
    });
  }
});

/**
 * @route   PUT /api/security-settings/:id
 * @desc    Update security settings
 * @access  Private (Admin only)
 */
router.put('/:id', adminAuth, updateSecuritySettingsValidation, async (req, res) => {
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

    const securitySettings = await SecuritySettings.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!securitySettings) {
      return res.status(404).json({
        success: false,
        error: 'Security settings not found'
      });
    }

    res.json({
      success: true,
      message: 'Security settings updated successfully',
      data: securitySettings.getDisplayData()
    });
  } catch (error) {
    console.error('Error updating security settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update security settings'
    });
  }
});

/**
 * @route   DELETE /api/security-settings/:id
 * @desc    Delete security settings
 * @access  Private (Admin only)
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const securitySettings = await SecuritySettings.findById(id);
    if (!securitySettings) {
      return res.status(404).json({
        success: false,
        error: 'Security settings not found'
      });
    }

    await SecuritySettings.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Security settings deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting security settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete security settings'
    });
  }
});

module.exports = router;
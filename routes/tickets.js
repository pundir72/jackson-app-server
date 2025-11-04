const express = require('express');
const { body, validationResult, query } = require('express-validator');
const ticketService = require('../services/ticketService');
const protect = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/tickets/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    // Allow common file types
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images, documents, and archives are allowed'));
    }
  }
});

// ==================== VALIDATION RULES ====================

const createTicketValidation = [
  body('subject').notEmpty().withMessage('Subject is required').isLength({ max: 500 }).withMessage('Subject too long'),
  body('description').notEmpty().withMessage('Description is required'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent', 'Critical']).withMessage('Invalid priority'),
  body('category').optional().isIn(['General', 'Technical', 'Billing', 'Account', 'Feature Request', 'Bug Report', 'Other']).withMessage('Invalid category'),
  body('game').optional().isMongoId().withMessage('Invalid game ID'),
  body('contact.name').optional().isString().withMessage('Contact name must be a string'),
  body('contact.email').optional().isEmail().withMessage('Invalid email format'),
  body('contact.phone').optional().isString().withMessage('Contact phone must be a string'),
  body('tags').optional().isArray().withMessage('Tags must be an array'),
  body('images').optional().isArray().withMessage('Images must be an array'),
  body('metadata.deviceInfo.platform').optional().isString().withMessage('Platform must be a string'),
  body('metadata.deviceInfo.os').optional().isString().withMessage('OS must be a string'),
  body('metadata.deviceInfo.appVersion').optional().isString().withMessage('App version must be a string'),
  body('sla.response_time').optional().isNumeric().withMessage('Response time must be a number'),
  body('sla.resolution_time').optional().isNumeric().withMessage('Resolution time must be a number')
];

const updateTicketValidation = [
  body('subject').optional().notEmpty().withMessage('Subject cannot be empty').isLength({ max: 500 }).withMessage('Subject too long'),
  body('description').optional().notEmpty().withMessage('Description cannot be empty'),
  body('status').optional().isIn(['Open', 'In Progress', 'Resolved', 'Closed', 'Pending', 'On Hold']).withMessage('Invalid status'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent', 'Critical']).withMessage('Invalid priority'),
  body('category').optional().isIn(['General', 'Technical', 'Billing', 'Account', 'Feature Request', 'Bug Report', 'Other']).withMessage('Invalid category'),
  body('assigned_to').optional().isMongoId().withMessage('Invalid assigned_to ID'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
];

const addNoteValidation = [
  body('note').notEmpty().withMessage('Note is required'),
  body('isInternal').optional().isBoolean().withMessage('isInternal must be a boolean')
];

const assignTicketValidation = [
  body('assigneeId').isMongoId().withMessage('Invalid assignee ID')
];

const updateStatusValidation = [
  body('status').isIn(['Open', 'In Progress', 'Resolved', 'Closed', 'Pending', 'On Hold']).withMessage('Invalid status'),
  body('resolution').optional().isString().withMessage('Resolution must be a string')
];

// ==================== TICKET CRUD OPERATIONS ====================

/**
 * @route   POST /api/tickets
 * @desc    Create a new ticket
 * @access  Private
 */
router.post('/', protect, upload.array('attachments', 5), createTicketValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const ticketData = {
      ...req.body,
      source: 'Web',
      tags: req.body.tags || []
    };

    // Handle file attachments
    if (req.files && req.files.length > 0) {
      ticketData.attachments = req.files.map(file => ({
        filename: file.filename,
        original_name: file.originalname,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype
      }));
    }

    const result = await ticketService.createTicket(ticketData, req.user.userId, true);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create ticket',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets
 * @desc    Get tickets with filtering and paginaeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OGJlYjFhYTdkN2YxM2Q5NjFhMDkwNGQiLCJpYXQiOjE3NjE0MDQ0MDEsImV4cCI6MTc2MTQ5MDgwMX0.Ppd4tt0MJRa7J73BEoENy0FflfxzqMZpOJwEQB3yAc8tion
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const {
      page,
      limit,
      status,
      priority,
      category,
      assigned_to,
      search,
      sortBy,
      sortOrder,
      userOnly
    } = req.query;

    const filters = {
      status,
      priority,
      category,
      assigned_to,
      search,
      sortBy,
      sortOrder
    };

    const pagination = { page, limit };

    // If userOnly is true, only show tickets for the current user
    const userId = userOnly === 'true' ? req.user.userId : null;

    const result = await ticketService.getTickets(filters, pagination, userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error getting tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tickets',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets/game/:gameId
 * @desc    Get tickets for a specific game
 * @access  Private
 */
router.get('/game/:gameId', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const {
      page,
      limit,
      status,
      priority,
      category,
      search,
      sortBy,
      sortOrder
    } = req.query;

    const filters = {
      status,
      priority,
      category,
      search,
      sortBy,
      sortOrder
    };

    const pagination = { page, limit };

    const result = await ticketService.getGameTickets(gameId, filters, pagination);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error getting game tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get game tickets',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets/stats
 * @desc    Get ticket statistics
 * @access  Private
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const { userOnly } = req.query;
    const userId = userOnly === 'true' ? req.user.userId : null;

    const result = await ticketService.getTicketStats(userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error getting ticket stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ticket statistics',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets/overdue
 * @desc    Get overdue tickets
 * @access  Private (Admin only)
 */
router.get('/overdue', adminAuth, async (req, res) => {
  try {
    const Ticket = require('../models/Ticket');
    const overdueTickets = await Ticket.findOverdue()
      .populate('user', 'name email')
      .populate('assigned_to', 'name email');

    res.json({
      success: true,
      data: {
        tickets: overdueTickets.map(ticket => ticket.getDisplayData()),
        count: overdueTickets.length
      }
    });

  } catch (error) {
    console.error('Error getting overdue tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overdue tickets',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets/:id
 * @desc    Get specific ticket by ID
 * @access  Private
 */
router.get('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ticketService.getTicket(id, req.user.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }

  } catch (error) {
    console.error('Error getting ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ticket',
      details: error.message
    });
  }
});

/**
 * @route   PUT /api/tickets/:id
 * @desc    Update ticket
 * @access  Private
 */
router.put('/:id', protect, upload.array('attachments', 5), updateTicketValidation, async (req, res) => {
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
    const updateData = { ...req.body };

    // Handle new file attachments
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(file => ({
        filename: file.filename,
        original_name: file.originalname,
        file_path: file.path,
        file_size: file.size,
        mime_type: file.mimetype
      }));
      
      // Get existing ticket to append new attachments
      const Ticket = require('../models/Ticket');
      const ticket = await Ticket.findById(id);
      if (ticket) {
        updateData.attachments = [...(ticket.attachments || []), ...newAttachments];
      }
    }

    const result = await ticketService.updateTicket(id, updateData, req.user.userId, true);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update ticket',
      details: error.message
    });
  }
});

/**
 * @route   DELETE /api/tickets/:id
 * @desc    Delete ticket (soft delete)
 * @access  Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ticketService.deleteTicket(id, req.user.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete ticket',
      details: error.message
    });
  }
});

// ==================== TICKET OPERATIONS ====================

/**
 * @route   POST /api/tickets/:id/notes
 * @desc    Add note to ticket
 * @access  Private
 */
router.post('/:id/notes', protect, addNoteValidation, async (req, res) => {
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
    const { note, isInternal = true } = req.body;

    const result = await ticketService.addNote(id, note, req.user.userId, isInternal);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add note',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/tickets/:id/assign
 * @desc    Assign ticket to user
 * @access  Private (Admin only)
 */
router.post('/:id/assign', adminAuth, assignTicketValidation, async (req, res) => {
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
    const { assigneeId } = req.body;

    const result = await ticketService.assignTicket(id, assigneeId, req.user.userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign ticket',
      details: error.message
    });
  }
});

/**
 * @route   PATCH /api/tickets/:id/status
 * @desc    Update ticket status
 * @access  Private
 */
router.patch('/:id/status', protect, updateStatusValidation, async (req, res) => {
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
    const { status, resolution } = req.body;

    const result = await ticketService.updateStatus(id, status, req.user.userId, resolution);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update status',
      details: error.message
    });
  }
});

// ==================== ZOHO INTEGRATION ====================

/**
 * @route   POST /api/tickets/:id/sync
 * @desc    Sync ticket to Zoho
 * @access  Private (Admin only)
 */
router.post('/:id/sync', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ticketService.syncTicketToZoho(id);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error syncing ticket:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync ticket',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/tickets/sync/all
 * @desc    Sync all pending tickets to Zoho
 * @access  Private (Admin only)
 */
router.post('/sync/all', adminAuth, async (req, res) => {
  try {
    const result = await ticketService.syncAllPendingTickets();

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error syncing all tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync tickets',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/tickets/sync/status
 * @desc    Get sync status of tickets
 * @access  Private (Admin only)
 */
router.get('/sync/status', adminAuth, async (req, res) => {
  try {
    const Ticket = require('../models/Ticket');
    const syncStats = await Ticket.aggregate([
      {
        $group: {
          _id: '$zoho_sync.sync_status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        syncStats,
        total: syncStats.reduce((sum, stat) => sum + stat.count, 0)
      }
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync status',
      details: error.message
    });
  }
});

module.exports = router;
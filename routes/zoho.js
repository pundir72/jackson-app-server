const express = require('express');
const { body, validationResult } = require('express-validator');
const zohoService = require('../utils/zoho');
const ZohoToken = require('../models/ZohoToken');
const { protect } = require('../middleware/auth');
const { adminAuth } = require('../middleware/adminAuth');

const router = express.Router();

// ==================== VALIDATION RULES ====================

const generateTokenValidation = [
  body('code').notEmpty().withMessage('Authorization code is required'),
  body('client_id').notEmpty().withMessage('Client ID is required'),
  body('client_secret').notEmpty().withMessage('Client secret is required'),
  body('redirect_uri').notEmpty().withMessage('Redirect URI is required')
];

const refreshTokenValidation = [
  body('client_id').notEmpty().withMessage('Client ID is required'),
  body('client_secret').notEmpty().withMessage('Client secret is required')
];

const apiCallValidation = [
  body('endpoint').notEmpty().withMessage('Endpoint is required'),
  body('client_id').notEmpty().withMessage('Client ID is required'),
  body('client_secret').notEmpty().withMessage('Client secret is required'),
  body('method').optional().isIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).withMessage('Invalid HTTP method')
];

// ==================== TOKEN MANAGEMENT ====================

/**
 * @route   POST /api/zoho/token/generate
 * @desc    Generate Zoho access token using authorization code
 * @access  Private (Admin only)
 */
router.post('/token/generate', adminAuth, generateTokenValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { code, client_id, client_secret, redirect_uri } = req.body;

    const result = await zohoService.generateToken(
      code,
      client_id,
      client_secret,
      redirect_uri,
      req.user.userId
    );

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error generating Zoho token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate token',
      details: error.message
    });
  }
});

/**
 * @route   POST /api/zoho/token/refresh
 * @desc    Refresh Zoho access token
 * @access  Private (Admin only)
 */
router.post('/token/refresh', adminAuth, refreshTokenValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { client_id, client_secret } = req.body;

    const result = await zohoService.refreshToken(client_id, client_secret);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error refreshing Zoho token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/zoho/token/status/:clientId
 * @desc    Get token status for a client
 * @access  Private (Admin only)
 */
router.get('/token/status/:clientId', adminAuth, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await zohoService.getTokenStatus(clientId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }

  } catch (error) {
    console.error('Error getting token status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get token status',
      details: error.message
    });
  }
});

/**
 * @route   DELETE /api/zoho/token/revoke/:clientId
 * @desc    Revoke token for a client
 * @access  Private (Admin only)
 */
router.delete('/token/revoke/:clientId', adminAuth, async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await zohoService.revokeToken(clientId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }

  } catch (error) {
    console.error('Error revoking token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke token',
      details: error.message
    });
  }
});

/**
 * @route   GET /api/zoho/tokens
 * @desc    Get all Zoho tokens with filtering and pagination
 * @access  Private (Admin only)
 */
router.get('/tokens', adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      client_id,
      is_active,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (client_id) query.client_id = client_id;
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const tokens = await ZohoToken.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'name email');

    const total = await ZohoToken.countDocuments(query);

    res.json({
      success: true,
      data: {
        tokens: tokens.map(token => token.getDisplayData()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error getting Zoho tokens:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tokens'
    });
  }
});

// ==================== API CALLS ====================

/**
 * @route   POST /api/zoho/api/call
 * @desc    Make authenticated API call to Zoho
 * @access  Private (Admin only)
 */
router.post('/api/call', adminAuth, apiCallValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { endpoint, method = 'GET', data, client_id, client_secret } = req.body;

    const result = await zohoService.makeAPICall(endpoint, method, data, client_id, client_secret);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.status || 400).json(result);
    }

  } catch (error) {
    console.error('Error making Zoho API call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to make API call',
      details: error.message
    });
  }
});

// ==================== DESK API ENDPOINTS ====================

/**
 * @route   GET /api/zoho/desk/tickets
 * @desc    Get all tickets from Zoho Desk
 * @access  Private (Admin only)
 */
router.get('/desk/tickets', adminAuth, async (req, res) => {
  try {
    const { client_id, client_secret, limit, from, sortBy, sortOrder } = req.query;

    if (!client_id || !client_secret) {
      return res.status(400).json({
        success: false,
        error: 'client_id and client_secret are required'
      });
    }

    const options = {
      limit: limit ? parseInt(limit) : 20,
      from: from ? parseInt(from) : 0,
      sortBy: sortBy || 'createdTime',
      sortOrder: sortOrder || 'desc'
    };

    const result = await zohoService.getTickets(client_id, client_secret, options);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.status || 400).json(result);
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
 * @route   GET /api/zoho/desk/tickets/:ticketId
 * @desc    Get specific ticket by ID
 * @access  Private (Admin only)
 */
router.get('/desk/tickets/:ticketId', adminAuth, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { client_id, client_secret } = req.query;

    if (!client_id || !client_secret) {
      return res.status(400).json({
        success: false,
        error: 'client_id and client_secret are required'
      });
    }

    const result = await zohoService.getTicket(ticketId, client_id, client_secret);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.status || 400).json(result);
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
 * @route   POST /api/zoho/desk/tickets
 * @desc    Create a new ticket
 * @access  Private (Admin only)
 */
router.post('/desk/tickets', adminAuth, async (req, res) => {
  try {
    const { client_id, client_secret, ...ticketData } = req.body;

    if (!client_id || !client_secret) {
      return res.status(400).json({
        success: false,
        error: 'client_id and client_secret are required'
      });
    }

    const result = await zohoService.createTicket(ticketData, client_id, client_secret);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(result.status || 400).json(result);
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
 * @route   PATCH /api/zoho/desk/tickets/:ticketId
 * @desc    Update ticket
 * @access  Private (Admin only)
 */
router.patch('/desk/tickets/:ticketId', adminAuth, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { client_id, client_secret, ...updateData } = req.body;

    if (!client_id || !client_secret) {
      return res.status(400).json({
        success: false,
        error: 'client_id and client_secret are required'
      });
    }

    const result = await zohoService.updateTicket(ticketId, updateData, client_id, client_secret);

    if (result.success) {
      res.json(result);
    } else {
      res.status(result.status || 400).json(result);
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

// ==================== UTILITY ENDPOINTS ====================

/**
 * @route   GET /api/zoho/authorization-url
 * @desc    Get Zoho authorization URL
 * @access  Private (Admin only)
 */
router.get('/authorization-url', adminAuth, async (req, res) => {
  try {
    const { client_id, redirect_uri, scope = 'Desk.tickets.READ Desk.basic.READ' } = req.query;

    if (!client_id || !redirect_uri) {
      return res.status(400).json({
        success: false,
        error: 'client_id and redirect_uri are required'
      });
    }

    const authURL = `https://accounts.zoho.com/oauth/v2/auth?` +
      `scope=${encodeURIComponent(scope)}&` +
      `client_id=${client_id}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
      `access_type=offline`;

    res.json({
      success: true,
      data: {
        authorization_url: authURL,
        client_id,
        redirect_uri,
        scope
      }
    });

  } catch (error) {
    console.error('Error generating authorization URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
      details: error.message
    });
  }
});

module.exports = router;



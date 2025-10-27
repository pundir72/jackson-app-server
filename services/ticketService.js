const Ticket = require('../models/Ticket');
const User = require('../models/User');
const ZohoToken = require('../models/ZohoToken');
const zohoService = require('../utils/zoho');
const mongoose = require('mongoose');

class TicketService {
  constructor() {
    this.zohoClientId = process.env.ZOHO_CLIENT_ID || '1000.HQWXFO4JXG13GDK2XZA50DY9Y9AW5S';
    this.zohoClientSecret = process.env.ZOHO_CLIENT_SECRET || '88fc1018373f67863718319a61d9c446a63d918e04';
  }

  /**
   * Get active Zoho token from database
   * @returns {Promise<Object|null>} Active Zoho token or null
   */
  async getActiveZohoToken() {
    try {
      const token = await ZohoToken.findActiveToken(this.zohoClientId);
      return token;
    } catch (error) {
      console.error('Error getting active Zoho token:', error);
      return null;
    }
  }

  /**
   * Create a new ticket
   * @param {Object} ticketData - Ticket data
   * @param {string} userId - User creating the ticket
   * @param {boolean} syncToZoho - Whether to sync to Zoho immediately
   * @returns {Promise<Object>} Created ticket
   */
  async createTicket(ticketData, userId, syncToZoho = true) {
    try {
      // Get user information
      const user = await User.findById(userId).select('name email phone');
      if (!user) {
        throw new Error('User not found');
      }

      // Prepare ticket data
      const ticket = new Ticket({
        ...ticketData,
        user: userId,
        contact: {
          name: ticketData.contact?.name || `${user.firstName} ${user.lastName}`,
          email: ticketData.contact?.email || user.email,
          phone: ticketData.contact?.phone || user.mobile || ticketData.contact?.phone
        },
        created_by: userId,
        sla: {
          response_time: ticketData.sla?.response_time || 24,
          resolution_time: ticketData.sla?.resolution_time || 72
        },
        // Handle game-based tickets
        game: ticketData.game || null,
        metadata: ticketData.metadata || {},
        // Ensure all array fields are properly initialized
        attachments: Array.isArray(ticketData.attachments) ? ticketData.attachments : [],
        images: Array.isArray(ticketData.images) ? ticketData.images : [],
        tags: Array.isArray(ticketData.tags) ? ticketData.tags : [],
        replies: Array.isArray(ticketData.replies) ? ticketData.replies : [],
        internal_notes: Array.isArray(ticketData.internal_notes) ? ticketData.internal_notes : [],
        customer_notes: Array.isArray(ticketData.customer_notes) ? ticketData.customer_notes : []
      });

      await ticket.save();

      // Sync to Zoho if requested
      if (syncToZoho) {
        const syncResult = await this.syncTicketToZoho(ticket._id);
        if (syncResult.success) {
          // Refresh ticket data to include sync information
          await ticket.save();
        }
      }

      // Get fresh ticket data including sync status
      const freshTicket = await Ticket.findById(ticket._id);

      return {
        success: true,
        message: 'Ticket created successfully',
        data: freshTicket.getDisplayData()
      };

    } catch (error) {
      console.error('Error creating ticket:', error);
      return {
        success: false,
        error: 'Failed to create ticket',
        details: error.message
      };
    }
  }

  /**
   * Get tickets with filtering and pagination
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @param {string} userId - User ID (optional, for user-specific tickets)
   * @returns {Promise<Object>} Tickets with pagination
   */
  async getTickets(filters = {}, pagination = {}, userId = null) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        category,
        assigned_to,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = { ...filters, ...pagination };

      // Build query
      const query = { is_active: true };
      
      if (userId) {
        query.user = userId;
      }
      
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (category) query.category = category;
      if (assigned_to) query.assigned_to = assigned_to;
      
      if (search) {
        query.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'contact.email': { $regex: search, $options: 'i' } },
          { 'contact.name': { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query
      const tickets = await Ticket.find(query)
        .populate('user', 'name email')
        .populate('assigned_to', 'name email')
        .populate('resolved_by', 'name email')
        .populate('created_by', 'name email')
        .sort(sortOptions)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Ticket.countDocuments(query);

      return {
        success: true,
        data: {
          tickets: tickets.map(ticket => ticket.getDisplayData()),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error) {
      console.error('Error getting tickets:', error);
      return {
        success: false,
        error: 'Failed to get tickets',
        details: error.message
      };
    }
  }

  /**
   * Get a specific ticket by ID
   * @param {string} ticketId - Ticket ID
   * @param {string} userId - User ID (optional, for access control)
   * @returns {Promise<Object>} Ticket data
   */
  async getTicket(ticketId, userId = null) {
    try {
      const query = { _id: ticketId, is_active: true };
      
      if (userId) {
        query.$or = [
          { user: userId },
          { assigned_to: userId },
          { created_by: userId }
        ];
      }

      const ticket = await Ticket.findOne(query)
        .populate('user', 'name email')
        .populate('assigned_to', 'name email')
        .populate('resolved_by', 'name email')
        .populate('created_by', 'name email')
        .populate('internal_notes.created_by', 'name email')
        .populate('customer_notes.created_by', 'name email');

      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      return {
        success: true,
        data: ticket.getDisplayData()
      };

    } catch (error) {
      console.error('Error getting ticket:', error);
      return {
        success: false,
        error: 'Failed to get ticket',
        details: error.message
      };
    }
  }

  /**
   * Update a ticket
   * @param {string} ticketId - Ticket ID
   * @param {Object} updateData - Update data
   * @param {string} userId - User making the update
   * @param {boolean} syncToZoho - Whether to sync to Zoho
   * @returns {Promise<Object>} Updated ticket
   */
  async updateTicket(ticketId, updateData, userId, syncToZoho = true) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      // Update ticket fields
      Object.keys(updateData).forEach(key => {
        if (key !== 'internal_notes' && key !== 'customer_notes' && key !== 'attachments') {
          // Ensure array fields are properly handled
          if (['tags', 'images', 'replies'].includes(key) && !Array.isArray(updateData[key])) {
            ticket[key] = [];
          } else {
            ticket[key] = updateData[key];
          }
        }
      });

      ticket.stats.last_activity = new Date();
      await ticket.save();

      // Sync to Zoho if requested
      if (syncToZoho && ticket.zoho_ticket_id) {
        await this.syncTicketToZoho(ticketId);
      }

      return {
        success: true,
        message: 'Ticket updated successfully',
        data: ticket.getDisplayData()
      };

    } catch (error) {
      console.error('Error updating ticket:', error);
      return {
        success: false,
        error: 'Failed to update ticket',
        details: error.message
      };
    }
  }

  /**
   * Add a note to a ticket
   * @param {string} ticketId - Ticket ID
   * @param {string} note - Note content
   * @param {string} userId - User adding the note
   * @param {boolean} isInternal - Whether it's an internal note
   * @returns {Promise<Object>} Updated ticket
   */
  async addNote(ticketId, note, userId, isInternal = true) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      if (isInternal) {
        await ticket.addInternalNote(note, userId, true);
      } else {
        await ticket.addCustomerNote(note, userId);
      }

      return {
        success: true,
        message: 'Note added successfully',
        data: ticket.getDisplayData()
      };

    } catch (error) {
      console.error('Error adding note:', error);
      return {
        success: false,
        error: 'Failed to add note',
        details: error.message
      };
    }
  }

  /**
   * Assign ticket to a user
   * @param {string} ticketId - Ticket ID
   * @param {string} assigneeId - User ID to assign to
   * @param {string} userId - User making the assignment
   * @returns {Promise<Object>} Updated ticket
   */
  async assignTicket(ticketId, assigneeId, userId) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      await ticket.assignTo(assigneeId);
      
      // Add internal note about assignment
      await ticket.addInternalNote(`Ticket assigned to user ${assigneeId}`, userId);

      return {
        success: true,
        message: 'Ticket assigned successfully',
        data: ticket.getDisplayData()
      };

    } catch (error) {
      console.error('Error assigning ticket:', error);
      return {
        success: false,
        error: 'Failed to assign ticket',
        details: error.message
      };
    }
  }

  /**
   * Update ticket status
   * @param {string} ticketId - Ticket ID
   * @param {string} status - New status
   * @param {string} userId - User making the change
   * @param {string} resolution - Resolution text (optional)
   * @returns {Promise<Object>} Updated ticket
   */
  async updateStatus(ticketId, status, userId, resolution = null) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      await ticket.updateStatus(status, userId, resolution);
      
      // Add internal note about status change
      await ticket.addInternalNote(`Status changed to ${status}`, userId);

      return {
        success: true,
        message: 'Status updated successfully',
        data: ticket.getDisplayData()
      };

    } catch (error) {
      console.error('Error updating status:', error);
      return {
        success: false,
        error: 'Failed to update status',
        details: error.message
      };
    }
  }

  /**
   * Sync ticket to Zoho Desk
   * @param {string} ticketId - Ticket ID
   * @returns {Promise<Object>} Sync result
   */
  async syncTicketToZoho(ticketId) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      // Get active Zoho token from database
      const zohoToken = await this.getActiveZohoToken();
      if (!zohoToken) {
        return {
          success: false,
          error: 'No active Zoho token found. Please generate a token first.'
        };
      }

      // Check if token is expired and refresh if needed
      if (zohoToken.isExpired()) {
        console.log('Zoho token is expired, refreshing...');
        const refreshResult = await zohoService.refreshToken(
          this.zohoClientId,
          this.zohoClientSecret
        );
        
        if (!refreshResult.success) {
          return {
            success: false,
            error: 'Failed to refresh Zoho token',
            details: refreshResult.details
          };
        }
        
        // Update token in database
        zohoToken.access_token = refreshResult.data.access_token;
        zohoToken.refresh_token = refreshResult.data.refresh_token || zohoToken.refresh_token;
        zohoToken.expires_in = refreshResult.data.expires_in;
        zohoToken.last_refreshed = new Date();
        await zohoToken.save();
      }

      // Update sync status
      ticket.zoho_sync.sync_status = 'pending';
      ticket.zoho_sync.sync_attempts += 1;
      await ticket.save();

      // Prepare Zoho ticket data
      const zohoData = {
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        email: ticket.contact.email,
        // Zoho Desk specific fields
        departmentId: "1198895000000006907", // INDOVIA HOLDINGS LLC Department ID
        // contactId will be created automatically if not provided
        // Contact information
        contact: {
          firstName: ticket.contact.name.split(' ')[0],
          lastName: ticket.contact.name.split(' ').slice(1).join(' ') || '',
          email: ticket.contact.email,
          phone: ticket.contact.phone || ''
        }
      };

      let result;
      if (ticket.zoho_ticket_id) {
        // Update existing ticket
        result = await zohoService.updateTicket(
          ticket.zoho_ticket_id,
          zohoData,
          this.zohoClientId,
          this.zohoClientSecret
        );
      } else {
        // Create new ticket
        result = await zohoService.createTicket(
          zohoData,
          this.zohoClientId,
          this.zohoClientSecret
        );
      }

      if (result.success) {
        // Update local ticket with Zoho data
        ticket.zoho_ticket_id = result.data.id || ticket.zoho_ticket_id;
        ticket.zoho_sync.sync_status = 'synced';
        ticket.zoho_sync.last_synced = new Date();
        ticket.zoho_sync.last_sync_error = null;
        await ticket.save();

        return {
          success: true,
          message: 'Ticket synced to Zoho successfully',
          data: result.data
        };
      } else {
        // Mark sync as failed
        ticket.zoho_sync.sync_status = 'failed';
        ticket.zoho_sync.last_sync_error = result.error || 'Unknown error';
        await ticket.save();

        return {
          success: false,
          error: 'Failed to sync ticket to Zoho',
          details: result.details
        };
      }

    } catch (error) {
      console.error('Error syncing ticket to Zoho:', error);
      
      // Update sync status
      const ticket = await Ticket.findById(ticketId);
      if (ticket) {
        ticket.zoho_sync.sync_status = 'failed';
        ticket.zoho_sync.last_sync_error = error.message;
        await ticket.save();
      }

      return {
        success: false,
        error: 'Failed to sync ticket to Zoho',
        details: error.message
      };
    }
  }

  /**
   * Sync all pending tickets to Zoho
   * @returns {Promise<Object>} Sync results
   */
  async syncAllPendingTickets() {
    try {
      // Check if we have an active Zoho token
      const zohoToken = await this.getActiveZohoToken();
      if (!zohoToken) {
        return {
          success: false,
          error: 'No active Zoho token found. Please generate a token first.'
        };
      }

      const pendingTickets = await Ticket.findPendingSync();
      const results = {
        total: pendingTickets.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const ticket of pendingTickets) {
        const result = await this.syncTicketToZoho(ticket._id);
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push({
            ticketId: ticket._id,
            error: result.error
          });
        }
      }

      return {
        success: true,
        message: `Sync completed: ${results.successful} successful, ${results.failed} failed`,
        data: results
      };

    } catch (error) {
      console.error('Error syncing all tickets:', error);
      return {
        success: false,
        error: 'Failed to sync tickets',
        details: error.message
      };
    }
  }

  /**
   * Get tickets for a specific game
   * @param {string} gameId - Game ID
   * @param {Object} filters - Filter options
   * @param {Object} pagination - Pagination options
   * @returns {Promise<Object>} Game tickets with pagination
   */
  async getGameTickets(gameId, filters = {}, pagination = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        category,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = { ...filters, ...pagination };

      // Build query
      const query = { 
        game: gameId, 
        is_active: true 
      };
      
      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (category) query.category = category;
      
      if (search) {
        query.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'contact.email': { $regex: search, $options: 'i' } },
          { 'contact.name': { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort options
      const sortOptions = {};
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query
      const tickets = await Ticket.find(query)
        .populate('user', 'name email')
        .populate('game', 'name')
        .populate('assigned_to', 'name email')
        .populate('resolved_by', 'name email')
        .populate('created_by', 'name email')
        .sort(sortOptions)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Ticket.countDocuments(query);

      return {
        success: true,
        data: {
          tickets: tickets.map(ticket => ticket.getDisplayData()),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error) {
      console.error('Error getting game tickets:', error);
      return {
        success: false,
        error: 'Failed to get game tickets',
        details: error.message
      };
    }
  }

  /**
   * Get ticket statistics
   * @param {string} userId - User ID (optional)
   * @returns {Promise<Object>} Statistics
   */
  async getTicketStats(userId = null) {
    try {
      const query = { is_active: true };
      if (userId) query.user = userId;

      const stats = await Ticket.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            open: { $sum: { $cond: [{ $eq: ['$status', 'Open'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
            closed: { $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] } },
            highPriority: { $sum: { $cond: [{ $in: ['$priority', ['High', 'Urgent', 'Critical']] }, 1, 0] } },
            overdue: { $sum: { $cond: [{ $lt: ['$sla.due_date', new Date()] }, 1, 0] } }
          }
        }
      ]);

      const result = stats[0] || {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        highPriority: 0,
        overdue: 0
      };

      return {
        success: true,
        data: result
      };

    } catch (error) {
      console.error('Error getting ticket stats:', error);
      return {
        success: false,
        error: 'Failed to get ticket statistics',
        details: error.message
      };
    }
  }

  /**
   * Delete a ticket (soft delete)
   * @param {string} ticketId - Ticket ID
   * @param {string} userId - User deleting the ticket
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTicket(ticketId, userId) {
    try {
      const ticket = await Ticket.findById(ticketId);
      if (!ticket) {
        return {
          success: false,
          error: 'Ticket not found'
        };
      }

      // Soft delete
      ticket.is_active = false;
      ticket.stats.last_activity = new Date();
      await ticket.save();

      return {
        success: true,
        message: 'Ticket deleted successfully'
      };

    } catch (error) {
      console.error('Error deleting ticket:', error);
      return {
        success: false,
        error: 'Failed to delete ticket',
        details: error.message
      };
    }
  }
}

module.exports = new TicketService();

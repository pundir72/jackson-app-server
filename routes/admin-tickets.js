const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const { adminAuth } = require('../middleware/adminAuth');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Game = require('../models/Game');

// Configure multer for admin reply attachments
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/tickets/replies');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'reply-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB for admin files
});

/**
 * @route   GET /api/admin/tickets
 * @desc    Get all tickets with filters (admin)
 * @access  Private (Admin)
 */
router.get('/', adminAuth, async (req, res) => {
    try {
        const {
            status,
            category,
            priority,
            gameId,
            userId,
            assignedTo,
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search
        } = req.query;
        
        const query = {};
        
        // Apply filters
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (category) {
            query.category = category;
        }
        
        if (priority) {
            query.priority = priority;
        }
        
        if (gameId) {
            query.game = gameId;
        }
        
        if (userId) {
            query.user = userId;
        }
        
        if (assignedTo) {
            query.assignedTo = assignedTo;
        }
        
        // Search in description or ticket ID
        if (search) {
            query.$or = [
                { ticketId: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
        
        const [tickets, total] = await Promise.all([
            Ticket.find(query)
                .populate('user', 'firstName lastName email mobile')
                .populate('game', 'name icon category')
                .populate('assignedTo', 'firstName lastName email')
                .populate('resolution.resolvedBy', 'firstName lastName')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Ticket.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            data: {
                tickets,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Error fetching admin tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tickets',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/admin/tickets/stats
 * @desc    Get ticket statistics (admin)
 * @access  Private (Admin)
 */
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const { startDate, endDate, gameId } = req.query;
        
        // Overall stats
        const stats = await Ticket.getTicketStats();
        
        // Category breakdown
        const categoryStats = await Ticket.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Priority breakdown
        const priorityStats = await Ticket.aggregate([
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);
        
        // Average resolution time for completed tickets
        const resolutionTime = await Ticket.aggregate([
            {
                $match: {
                    status: { $in: ['completed', 'closed'] },
                    closedAt: { $exists: true }
                }
            },
            {
                $project: {
                    resolutionTimeMs: {
                        $subtract: ['$closedAt', '$createdAt']
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgResolutionTime: { $avg: '$resolutionTimeMs' },
                    minResolutionTime: { $min: '$resolutionTimeMs' },
                    maxResolutionTime: { $max: '$resolutionTimeMs' }
                }
            }
        ]);
        
        // Top games by ticket count
        const topGames = await Ticket.aggregate([
            {
                $group: {
                    _id: '$game',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            },
            {
                $lookup: {
                    from: 'games',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'game'
                }
            },
            {
                $unwind: '$game'
            },
            {
                $project: {
                    gameId: '$_id',
                    gameName: '$game.name',
                    count: 1
                }
            }
        ]);
        
        res.json({
            success: true,
            data: {
                overall: stats,
                byCategory: categoryStats,
                byPriority: priorityStats,
                resolution: resolutionTime[0] || null,
                topGames
            }
        });
    } catch (error) {
        console.error('Error fetching ticket stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/admin/tickets/:ticketId
 * @desc    Get ticket details (admin)
 * @access  Private (Admin)
 */
router.get('/:ticketId', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        const ticket = await Ticket.findOne({ ticketId })
            .populate('user', 'firstName lastName email mobile avatar')
            .populate('game', 'name icon category description')
            .populate('assignedTo', 'firstName lastName email')
            .populate('replies.adminUser', 'firstName lastName email')
            .populate('resolution.resolvedBy', 'firstName lastName email');
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        res.json({
            success: true,
            data: { ticket }
        });
    } catch (error) {
        console.error('Error fetching ticket details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ticket details',
            message: error.message
        });
    }
});

/**
 * @route   PATCH /api/admin/tickets/:ticketId/status
 * @desc    Update ticket status
 * @access  Private (Admin)
 */
router.patch('/:ticketId/status', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { status, resolutionNotes } = req.body;
        
        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'Status is required'
            });
        }
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        const result = await ticket.updateStatus(status, req.user.userId, resolutionNotes);
        
        res.json({
            success: true,
            message: 'Ticket status updated successfully',
            data: {
                ticketId: ticket.ticketId,
                ...result
            }
        });
    } catch (error) {
        console.error('Error updating ticket status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update status',
            message: error.message
        });
    }
});

/**
 * @route   POST /api/admin/tickets/:ticketId/reply
 * @desc    Add admin reply to ticket
 * @access  Private (Admin)
 */
router.post('/:ticketId/reply', adminAuth, upload.array('attachments', 3), async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Reply message is required'
            });
        }
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        // Process attachments if any
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                attachments.push({
                    url: `/uploads/tickets/replies/${file.filename}`,
                    filename: file.filename
                });
            }
        }
        
        await ticket.addReply(req.user.userId, message, attachments);
        
        // Populate for response
        await ticket.populate('replies.adminUser', 'firstName lastName email');
        
        res.json({
            success: true,
            message: 'Reply added successfully',
            data: {
                ticketId: ticket.ticketId,
                reply: ticket.replies[ticket.replies.length - 1]
            }
        });
    } catch (error) {
        console.error('Error adding reply:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add reply',
            message: error.message
        });
    }
});

/**
 * @route   PATCH /api/admin/tickets/:ticketId/assign
 * @desc    Assign ticket to admin user
 * @access  Private (Admin)
 */
router.patch('/:ticketId/assign', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { assignToUserId } = req.body;
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        // Verify assignee exists and is admin
        if (assignToUserId) {
            const assignee = await User.findById(assignToUserId);
            if (!assignee || assignee.role !== 'admin') {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid admin user'
                });
            }
            ticket.assignedTo = assignToUserId;
        } else {
            ticket.assignedTo = null; // Unassign
        }
        
        await ticket.save();
        await ticket.populate('assignedTo', 'firstName lastName email');
        
        res.json({
            success: true,
            message: assignToUserId ? 'Ticket assigned successfully' : 'Ticket unassigned',
            data: {
                ticketId: ticket.ticketId,
                assignedTo: ticket.assignedTo
            }
        });
    } catch (error) {
        console.error('Error assigning ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assign ticket',
            message: error.message
        });
    }
});

/**
 * @route   PATCH /api/admin/tickets/:ticketId/priority
 * @desc    Update ticket priority
 * @access  Private (Admin)
 */
router.patch('/:ticketId/priority', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { priority } = req.body;
        
        if (!priority) {
            return res.status(400).json({
                success: false,
                error: 'Priority is required'
            });
        }
        
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid priority. Must be: low, medium, high, or urgent'
            });
        }
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        const oldPriority = ticket.priority;
        ticket.priority = priority;
        await ticket.save();
        
        res.json({
            success: true,
            message: 'Ticket priority updated successfully',
            data: {
                ticketId: ticket.ticketId,
                oldPriority,
                newPriority: priority
            }
        });
    } catch (error) {
        console.error('Error updating priority:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update priority',
            message: error.message
        });
    }
});

/**
 * @route   PATCH /api/admin/tickets/:ticketId/category
 * @desc    Update ticket category
 * @access  Private (Admin)
 */
router.patch('/:ticketId/category', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        const { category } = req.body;
        
        if (!category) {
            return res.status(400).json({
                success: false,
                error: 'Category is required'
            });
        }
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        const oldCategory = ticket.category;
        ticket.category = category;
        await ticket.save();
        
        res.json({
            success: true,
            message: 'Ticket category updated successfully',
            data: {
                ticketId: ticket.ticketId,
                oldCategory,
                newCategory: category
            }
        });
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update category',
            message: error.message
        });
    }
});

/**
 * @route   DELETE /api/admin/tickets/:ticketId
 * @desc    Delete ticket permanently (admin)
 * @access  Private (Admin)
 */
router.delete('/:ticketId', adminAuth, async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        const ticket = await Ticket.findOne({ ticketId });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        // Delete associated images
        if (ticket.images && ticket.images.length > 0) {
            for (const image of ticket.images) {
                try {
                    const imagePath = path.join(__dirname, '..', image.url);
                    await fs.unlink(imagePath);
                } catch (fileError) {
                    console.error('Error deleting image:', fileError);
                }
            }
        }
        
        // Delete reply attachments
        if (ticket.replies && ticket.replies.length > 0) {
            for (const reply of ticket.replies) {
                if (reply.attachments && reply.attachments.length > 0) {
                    for (const attachment of reply.attachments) {
                        try {
                            const attachmentPath = path.join(__dirname, '..', attachment.url);
                            await fs.unlink(attachmentPath);
                        } catch (fileError) {
                            console.error('Error deleting attachment:', fileError);
                        }
                    }
                }
            }
        }
        
        await ticket.deleteOne();
        
        res.json({
            success: true,
            message: 'Ticket deleted permanently',
            data: { ticketId }
        });
    } catch (error) {
        console.error('Error deleting ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete ticket',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/admin/tickets/export/csv
 * @desc    Export tickets as CSV
 * @access  Private (Admin)
 */
router.get('/export/csv', adminAuth, async (req, res) => {
    try {
        const { status, category, startDate, endDate } = req.query;
        
        const query = {};
        if (status && status !== 'all') query.status = status;
        if (category) query.category = category;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }
        
        const tickets = await Ticket.find(query)
            .populate('user', 'firstName lastName email')
            .populate('game', 'name')
            .lean();
        
        // Generate CSV
        const csvHeaders = 'Ticket ID,User,Email,Game,Category,Status,Priority,Description,Created At,Closed At\n';
        const csvRows = tickets.map(ticket => {
            const user = `${ticket.user.firstName} ${ticket.user.lastName}`;
            const description = ticket.description.replace(/"/g, '""').replace(/\n/g, ' ');
            return `"${ticket.ticketId}","${user}","${ticket.user.email}","${ticket.game.name}","${ticket.category}","${ticket.status}","${ticket.priority}","${description}","${ticket.createdAt}","${ticket.closedAt || 'N/A'}"`;
        }).join('\n');
        
        const csv = csvHeaders + csvRows;
        
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="tickets-export-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export tickets',
            message: error.message
        });
    }
});

module.exports = router;


const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const protect = require('../middleware/auth');
const mongoose = require('mongoose');
const Ticket = require('../models/Ticket');
const Game = require('../models/Game');
const User = require('../models/User');

// Configure multer for ticket image uploads
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads/tickets');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ticket-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only jpg and png
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
        cb(null, true);
    } else {
        cb(new Error('Only .jpg and .png files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB limit
    }
});

/**
 * @route   POST /api/tickets
 * @desc    Raise a new ticket
 * @access  Private
 */
router.post('/', protect, upload.array('images', 3), async (req, res) => {
    try {
        const { gameId, description, category, deviceInfo, contextData } = req.body;
        
        // Validate required fields
        if (!gameId || !description) {
            return res.status(400).json({
                success: false,
                error: 'Game and description are required'
            });
        }
        
        // Validate description length (max 200 words)
        const wordCount = description.trim().split(/\s+/).length;
        if (wordCount > 200) {
            return res.status(400).json({
                success: false,
                error: 'Description must not exceed 200 words',
                wordCount,
                maxWords: 200
            });
        }
        
        // Check if description is not empty
        if (description.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Description cannot be empty'
            });
        }
        
        // Verify game exists
        const game = await Game.findById(gameId);
        // if (!game) {
        //     return res.status(404).json({
        //         success: false,
        //         error: 'Game not found'
        //     });
        // }
        
        // Process uploaded images
        const images = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    // Optimize image using sharp
                    const optimizedFilename = `optimized-${file.filename}`;
                    const optimizedPath = path.join(path.dirname(file.path), optimizedFilename);
                    
                    await sharp(file.path)
                        .resize(1024, 1024, {
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .jpeg({ quality: 85 })
                        .toFile(optimizedPath);
                    
                    // Delete original, use optimized
                    await fs.unlink(file.path);
                    
                    images.push({
                        url: `/uploads/tickets/${optimizedFilename}`,
                        filename: optimizedFilename,
                        uploadedAt: new Date()
                    });
                } catch (imageError) {
                    console.error('Image processing error:', imageError);
                    // Use original if optimization fails
                    images.push({
                        url: `/uploads/tickets/${file.filename}`,
                        filename: file.filename,
                        uploadedAt: new Date()
                    });
                }
            }
        }
        
        // Generate unique ticket ID
        const ticketId = await Ticket.generateTicketId();
        
        // Parse device info and context data if provided as JSON strings
        let parsedDeviceInfo = {};
        let parsedContextData = {};
        
        try {
            parsedDeviceInfo = deviceInfo ? (typeof deviceInfo === 'string' ? JSON.parse(deviceInfo) : deviceInfo) : {};
        } catch (e) {
            parsedDeviceInfo = {};
        }
        
        try {
            parsedContextData = contextData ? (typeof contextData === 'string' ? JSON.parse(contextData) : contextData) : {};
        } catch (e) {
            parsedContextData = {};
        }
        
        // Create ticket
        const ticket = new Ticket({
            ticketId,
            user: req.user.userId,
            game: gameId,
            description,
            wordCount,
            images,
            category: category || 'other',
            status: 'in_progress',
            metadata: {
                deviceInfo: parsedDeviceInfo,
                userLocation: {
                    ip: req.ip,
                    country: req.headers['cf-ipcountry'] || 'Unknown',
                    city: req.headers['cf-ipCity'] || 'Unknown'
                },
                contextData: parsedContextData
            }
        });
        
        await ticket.save();
        
        // Populate game details for response
        await ticket.populate('game', 'name icon category');
        
        res.status(201).json({
            success: true,
            message: 'Ticket raised successfully',
            data: {
                ticketId: ticket.ticketId,
                ticket: {
                    id: ticket._id,
                    ticketId: ticket.ticketId,
                    game: ticket.game,
                    description: ticket.description,
                    wordCount: ticket.wordCount,
                    images: ticket.images,
                    status: ticket.status,
                    statusBadge: ticket.statusBadge,
                    category: ticket.category,
                    createdAt: ticket.createdAt
                }
            }
        });
    } catch (error) {
        console.error('Error raising ticket:', error);
        
        // Handle specific errors
        if (error.message.includes('Only .jpg and .png')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid file format. Only .jpg and .png files are allowed'
            });
        }
        
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File too large. Maximum size is 2MB per image'
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to raise ticket',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/tickets
 * @desc    Get user's tickets with filters
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
    try {
        const { status, category, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const filters = {
            status: status || 'all',
            category,
            page,
            limit,
            sortBy,
            sortOrder
        };
        
        const result = await Ticket.getUserTickets(req.user.userId, filters);
        
        // Format tickets for response
        const formattedTickets = result.tickets.map(ticket => ({
            id: ticket._id,
            ticketId: ticket.ticketId,
            game: {
                id: ticket.game._id,
                name: ticket.game.name,
                icon: ticket.game.icon
            },
            descriptionPreview: ticket.description.split('\n').slice(0, 2).join('\n'),
            fullDescription: ticket.description,
            wordCount: ticket.wordCount,
            status: ticket.status,
            statusBadge: {
                color: ticket.statusBadge?.color,
                label: ticket.statusBadge?.label
            },
            category: ticket.category,
            images: ticket.images,
            repliesCount: ticket.replies?.length || 0,
            hasReplies: (ticket.replies?.length || 0) > 0,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt
        }));
        
        res.json({
            success: true,
            data: {
                tickets: formattedTickets,
                pagination: result.pagination
            }
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch tickets',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/tickets/stats
 * @desc    Get user's ticket statistics
 * @access  Private
 */
router.get('/stats', protect, async (req, res) => {
    try {
        const stats = await Ticket.getTicketStats(req.user.userId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error fetching ticket stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch ticket statistics',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/tickets/:ticketId
 * @desc    Get ticket details by ticket ID
 * @access  Private
 */
router.get('/:ticketId', protect, async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        // Find ticket by ticketId and ensure it belongs to the user
        const ticket = await Ticket.findOne({
            ticketId,
            user: req.user.userId
        })
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
            data: {
                ticket: {
                    id: ticket._id,
                    ticketId: ticket.ticketId,
                    game: ticket.game,
                    description: ticket.description,
                    wordCount: ticket.wordCount,
                    status: ticket.status,
                    statusBadge: ticket.statusBadge,
                    category: ticket.category,
                    priority: ticket.priority,
                    images: ticket.images,
                    replies: ticket.replies,
                    assignedTo: ticket.assignedTo,
                    resolution: ticket.resolution,
                    createdAt: ticket.createdAt,
                    updatedAt: ticket.updatedAt,
                    closedAt: ticket.closedAt
                }
            }
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
 * @route   GET /api/tickets/games/list
 * @desc    Get list of games user has played (for dropdown)
 * @access  Private
 */
router.get('/games/list', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select('games preferences');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const seen = new Set();
        const results = [];

        // Safely resolve minimal game info from user's games array
        const userGames = Array.isArray(user.games) ? user.games : [];

        for (const g of userGames) {
            const rawId = g && g.gameId ? String(g.gameId) : null;
            if (!rawId || seen.has(rawId)) continue;
            seen.add(rawId);

            let name = rawId;
            let icon = '🎮';
            let category = 'General';
            let id = rawId;

            try {
                if (mongoose.Types.ObjectId.isValid(rawId)) {
                    const dbGame = await Game.findById(rawId).select('title metadata.iconUrl metadata.genre');
                    if (dbGame) {
                        id = dbGame._id;
                        name = dbGame.title || name;
                        icon = (dbGame.metadata && (dbGame.metadata.iconUrl || dbGame.metadata.imageUrl)) || icon;
                        category = (dbGame.metadata && dbGame.metadata.genre) || category;
                    }
                }
            } catch (e) {
                // Ignore lookup errors and fall back to raw values
            }

            results.push({ id, name, icon, category });
        }

        res.json({
            success: true,
            data: {
                games: results,
                total: results.length
            }
        });
    } catch (error) {
        console.error('Error fetching user games:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch games',
            message: error.message
        });
    }
});

/**
 * @route   DELETE /api/tickets/:ticketId
 * @desc    Cancel/delete a ticket (only if pending or in_progress)
 * @access  Private
 */
router.delete('/:ticketId', protect, async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        const ticket = await Ticket.findOne({
            ticketId,
            user: req.user.userId
        });
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        // Only allow deletion if ticket is not completed/closed
        if (ticket.status === 'completed' || ticket.status === 'closed') {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete a completed or closed ticket'
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
        
        await ticket.deleteOne();
        
        res.json({
            success: true,
            message: 'Ticket deleted successfully',
            data: {
                ticketId: ticket.ticketId
            }
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

module.exports = router;


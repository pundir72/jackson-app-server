const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    // Unique ticket ID (displayed to users)
    ticketId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // User who raised the ticket
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Game related to the issue
    game: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game',
        required: true,
        index: true
    },
    
    // Issue description
    description: {
        type: String,
        required: true,
        maxlength: 2000, // ~200 words
        trim: true
    },
    
    // Word count for validation
    wordCount: {
        type: Number,
        default: 0
    },
    
    // Screenshot/evidence images
    images: [{
        url: String,
        filename: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Ticket status
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'closed', 'reopened'],
        default: 'in_progress',
        index: true
    },
    
    // Priority level (optional, for admin use)
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Category/Type of issue
    category: {
        type: String,
        enum: ['bug', 'payment', 'task_not_credited', 'game_issue', 'account', 'other'],
        default: 'other'
    },
    
    // Admin responses/replies
    replies: [{
        adminUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        message: {
            type: String,
            required: true
        },
        attachments: [{
            url: String,
            filename: String
        }],
        repliedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Assigned agent (optional)
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Resolution details
    resolution: {
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date,
        resolutionNotes: String
    },
    
    // Tracking metadata
    metadata: {
        deviceInfo: {
            platform: String,
            os: String,
            appVersion: String,
            deviceModel: String
        },
        userLocation: {
            ip: String,
            country: String,
            city: String
        },
        contextData: {
            orderId: String,
            transactionId: String,
            gameSessionId: String
        }
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    
    updatedAt: {
        type: Date,
        default: Date.now
    },
    
    closedAt: Date
}, {
    timestamps: true
});

// Indexes for performance
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ game: 1, status: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ ticketId: 1, user: 1 });

// Pre-save middleware to update timestamps
ticketSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    
    // Calculate word count from description
    if (this.description) {
        this.wordCount = this.description.trim().split(/\s+/).length;
    }
    
    next();
});

// Static method to generate unique ticket ID
ticketSchema.statics.generateTicketId = async function() {
    let ticketId;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
        // Generate 7-digit ticket ID (e.g., 2345678)
        ticketId = Math.floor(1000000 + Math.random() * 9000000).toString();
        
        // Check if ID already exists
        const existing = await this.findOne({ ticketId });
        if (!existing) {
            isUnique = true;
        }
        attempts++;
    }
    
    if (!isUnique) {
        // Fallback to timestamp-based ID
        ticketId = Date.now().toString().slice(-7);
    }
    
    return ticketId;
};

// Instance method to add admin reply
ticketSchema.methods.addReply = async function(adminUserId, message, attachments = []) {
    this.replies.push({
        adminUser: adminUserId,
        message,
        attachments,
        repliedAt: new Date()
    });
    
    // Update status to in_progress if it was pending
    if (this.status === 'pending') {
        this.status = 'in_progress';
    }
    
    this.updatedAt = new Date();
    await this.save();
    
    return this;
};

// Instance method to update status
ticketSchema.methods.updateStatus = async function(newStatus, adminUserId = null, notes = null) {
    const oldStatus = this.status;
    this.status = newStatus;
    this.updatedAt = new Date();
    
    // If completing/closing the ticket
    if (newStatus === 'completed' || newStatus === 'closed') {
        this.closedAt = new Date();
        if (adminUserId) {
            this.resolution = {
                resolvedBy: adminUserId,
                resolvedAt: new Date(),
                resolutionNotes: notes || 'Ticket resolved'
            };
        }
    }
    
    await this.save();
    
    return {
        oldStatus,
        newStatus,
        updatedAt: this.updatedAt
    };
};

// Static method to get user's tickets with filters
ticketSchema.statics.getUserTickets = async function(userId, filters = {}) {
    const {
        status,
        category,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = filters;
    
    const query = { user: userId };
    
    // Apply filters
    if (status && status !== 'all') {
        query.status = status;
    }
    
    if (category) {
        query.category = category;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [tickets, total] = await Promise.all([
        this.find(query)
            .populate('game', 'name icon category')
            .populate('assignedTo', 'firstName lastName email')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        this.countDocuments(query)
    ]);
    
    return {
        tickets,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    };
};

// Static method to get ticket statistics
ticketSchema.statics.getTicketStats = async function(userId = null) {
    const matchQuery = userId ? { user: new mongoose.Types.ObjectId(userId) } : {};
    
    const stats = await this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
    
    const result = {
        total: 0,
        pending: 0,
        in_progress: 0,
        completed: 0,
        closed: 0,
        reopened: 0
    };
    
    stats.forEach(stat => {
        result.total += stat.count;
        result[stat._id] = stat.count;
    });
    
    return result;
};

// Instance method to get preview (first 2 lines of description)
ticketSchema.methods.getDescriptionPreview = function(lines = 2) {
    if (!this.description) return '';
    
    const allLines = this.description.split('\n');
    return allLines.slice(0, lines).join('\n');
};

// Virtual for status badge color
ticketSchema.virtual('statusBadge').get(function() {
    const colors = {
        pending: { color: '#FFA500', label: 'Pending' },
        in_progress: { color: '#2196F3', label: 'In Progress' },
        completed: { color: '#4CAF50', label: 'Completed' },
        closed: { color: '#9E9E9E', label: 'Closed' },
        reopened: { color: '#FF5722', label: 'Reopened' }
    };
    
    return colors[this.status] || colors.pending;
});

// Ensure virtuals are included in JSON
ticketSchema.set('toJSON', { virtuals: true });
ticketSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Ticket', ticketSchema);


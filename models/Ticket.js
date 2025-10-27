const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  // Legacy Ticket ID (for compatibility with existing system)
  ticketId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Zoho Integration
  zoho_ticket_id: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  
  // Basic Ticket Information
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  description: {
    type: String,
    required: true,
    trim: true
  },
  
  // Ticket Status
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed', 'Pending', 'On Hold'],
    default: 'Open'
  },
  
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent', 'Critical'],
    default: 'Medium'
  },
  
  category: {
    type: String,
    enum: ['General', 'Technical', 'Billing', 'Account', 'Feature Request', 'Bug Report', 'Other'],
    default: 'General'
  },
  
  // User Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Game Information (for game-based tickets)
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: false // Not all tickets are game-related
  },
  
  // Word count for description
  wordCount: {
    type: Number,
    default: 0
  },
  
  // Contact Information
  contact: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      trim: true
    }
  },
  
  // Assignment
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Ticket Source
  source: {
    type: String,
    enum: ['Web', 'Email', 'Phone', 'API', 'Mobile App', 'Admin Panel'],
    default: 'Web'
  },
  
  // Resolution Information (new format)
  resolution: {
    type: String,
    trim: true
  },
  
  resolved_at: {
    type: Date,
    default: null
  },
  
  resolved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Legacy resolution format for compatibility
  resolution_legacy: {
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolutionNotes: String
  },
  
  // Closed timestamp
  closedAt: {
    type: Date,
    default: null
  },
  
  // Zoho Sync Information
  zoho_sync: {
    last_synced: {
      type: Date,
      default: null
    },
    sync_status: {
      type: String,
      enum: ['pending', 'synced', 'failed', 'not_synced'],
      default: 'not_synced'
    },
    sync_attempts: {
      type: Number,
      default: 0
    },
    last_sync_error: {
      type: String,
      trim: true
    }
  },
  
  // Tags and Labels
  tags: [{
    type: String,
    trim: true
  }],
  
  // Attachments (new format)
  attachments: [{
    filename: String,
    original_name: String,
    file_path: String,
    file_size: Number,
    mime_type: String,
    uploaded_at: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Images (legacy format for compatibility)
  images: [{
    url: String,
    filename: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Metadata
  metadata: {
    deviceInfo: {
      platform: String,
      os: String,
      appVersion: String
    },
    userLocation: {
      ip: String,
      country: String,
      city: String
    }
  },
  
  // Replies (legacy format)
  replies: [{
    message: String,
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Internal Notes
  internal_notes: [{
    note: String,
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    is_private: {
      type: Boolean,
      default: true
    }
  }],
  
  // Customer Communication
  customer_notes: [{
    note: String,
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    created_at: {
      type: Date,
      default: Date.now
    }
  }],
  
  // SLA Information
  sla: {
    response_time: {
      type: Number, // in hours
      default: 24
    },
    resolution_time: {
      type: Number, // in hours
      default: 72
    },
    first_response_at: {
      type: Date,
      default: null
    },
    due_date: {
      type: Date,
      default: null
    }
  },
  
  // Ticket Statistics
  stats: {
    response_count: {
      type: Number,
      default: 0
    },
    last_activity: {
      type: Date,
      default: Date.now
    },
    time_spent: {
      type: Number, // in minutes
      default: 0
    }
  },
  
  // System Fields
  is_active: {
    type: Boolean,
    default: true
  },
  
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
ticketSchema.index({ user: 1, status: 1 });
ticketSchema.index({ game: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
ticketSchema.index({ assigned_to: 1, status: 1 });
ticketSchema.index({ zoho_ticket_id: 1 });
ticketSchema.index({ 'contact.email': 1 });
ticketSchema.index({ created_at: -1 });
ticketSchema.index({ 'zoho_sync.sync_status': 1 });
ticketSchema.index({ ticketId: 1, user: 1 });

// Instance methods
ticketSchema.methods.isOverdue = function() {
  if (!this.sla.due_date) return false;
  return new Date() > this.sla.due_date && this.status !== 'Closed' && this.status !== 'Resolved';
};

ticketSchema.methods.getTimeToResponse = function() {
  if (this.sla.first_response_at) return null; // Already responded
  if (!this.sla.response_time) return null;
  
  const responseDeadline = new Date(this.createdAt.getTime() + (this.sla.response_time * 60 * 60 * 1000));
  return responseDeadline;
};

ticketSchema.methods.getTimeToResolution = function() {
  if (this.status === 'Closed' || this.status === 'Resolved') return null;
  if (!this.sla.resolution_time) return null;
  
  const resolutionDeadline = new Date(this.createdAt.getTime() + (this.sla.resolution_time * 60 * 60 * 1000));
  return resolutionDeadline;
};

ticketSchema.methods.addInternalNote = function(note, userId, isPrivate = true) {
  this.internal_notes.push({
    note,
    created_by: userId,
    is_private: isPrivate
  });
  this.stats.last_activity = new Date();
  return this.save();
};

ticketSchema.methods.addCustomerNote = function(note, userId) {
  this.customer_notes.push({
    note,
    created_by: userId
  });
  this.stats.last_activity = new Date();
  this.stats.response_count += 1;
  return this.save();
};

ticketSchema.methods.updateStatus = function(newStatus, userId, resolution = null) {
  this.status = newStatus;
  this.stats.last_activity = new Date();
  
  if (newStatus === 'Resolved' || newStatus === 'Closed') {
    this.resolved_at = new Date();
    this.resolved_by = userId;
    if (resolution) {
      this.resolution = resolution;
    }
  }
  
  return this.save();
};

ticketSchema.methods.assignTo = function(userId) {
  this.assigned_to = userId;
  this.stats.last_activity = new Date();
  return this.save();
};

ticketSchema.methods.getDisplayData = function() {
  return {
    id: this._id,
    zoho_ticket_id: this.zoho_ticket_id,
    subject: this.subject,
    description: this.description,
    status: this.status,
    priority: this.priority,
    category: this.category,
    user: this.user,
    contact: this.contact,
    assigned_to: this.assigned_to,
    source: this.source,
    resolution: this.resolution,
    resolved_at: this.resolved_at,
    resolved_by: this.resolved_by,
    zoho_sync: this.zoho_sync,
    tags: this.tags,
    attachments: this.attachments,
    sla: {
      ...this.sla,
      is_overdue: this.isOverdue(),
      time_to_response: this.getTimeToResponse(),
      time_to_resolution: this.getTimeToResolution()
    },
    stats: this.stats,
    is_active: this.is_active,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Static methods
ticketSchema.statics.findByUser = function(userId, options = {}) {
  const query = { user: userId, is_active: true };
  if (options.status) query.status = options.status;
  if (options.priority) query.priority = options.priority;
  
  return this.find(query)
    .populate('user', 'name email')
    .populate('assigned_to', 'name email')
    .populate('resolved_by', 'name email')
    .sort({ createdAt: -1 });
};

ticketSchema.statics.findByAssignee = function(userId, options = {}) {
  const query = { assigned_to: userId, is_active: true };
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .populate('user', 'name email')
    .populate('assigned_to', 'name email')
    .sort({ createdAt: -1 });
};

ticketSchema.statics.findOverdue = function() {
  return this.find({
    is_active: true,
    status: { $nin: ['Closed', 'Resolved'] },
    'sla.due_date': { $lt: new Date() }
  })
    .populate('user', 'name email')
    .populate('assigned_to', 'name email')
    .sort({ 'sla.due_date': 1 });
};

ticketSchema.statics.findPendingSync = function() {
  return this.find({
    'zoho_sync.sync_status': { $in: ['pending', 'failed'] },
    is_active: true
  });
};

// Pre-save middleware
ticketSchema.pre('save', function(next) {
  // Generate ticketId if not provided
  if (!this.ticketId) {
    this.ticketId = Math.random().toString(36).substr(2, 9).toUpperCase();
  }
  
  // Calculate word count for description
  if (this.description) {
    this.wordCount = this.description.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  // Calculate due date based on SLA
  if (this.sla.resolution_time && !this.sla.due_date) {
    this.sla.due_date = new Date(this.createdAt.getTime() + (this.sla.resolution_time * 60 * 60 * 1000));
  }
  
  // Set first response time if this is the first customer note
  if (this.customer_notes.length === 1 && !this.sla.first_response_at) {
    this.sla.first_response_at = new Date();
  }
  
  // Set closedAt when status is closed or resolved
  if ((this.status === 'Closed' || this.status === 'Resolved') && !this.closedAt) {
    this.closedAt = new Date();
  }
  
  next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;
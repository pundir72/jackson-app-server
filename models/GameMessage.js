const mongoose = require('mongoose');

const gameMessageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gameId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['task', 'tip', 'reward', 'reminder', 'update', 'challenge'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  expiresAt: {
    type: Date
  },
  metadata: {
    taskId: String,
    rewardAmount: Number,
    challengeId: String,
    actionRequired: String,
    deepLink: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
gameMessageSchema.index({ user: 1, gameId: 1, isRead: 1 });
gameMessageSchema.index({ user: 1, type: 1 });
gameMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for unread count
gameMessageSchema.virtual('isUnread').get(function() {
  return !this.isRead;
});

// Method to mark as read
gameMessageSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to get unread count for user
gameMessageSchema.statics.getUnreadCount = function(userId, gameId = null) {
  const query = { user: userId, isRead: false };
  if (gameId) {
    query.gameId = gameId;
  }
  return this.countDocuments(query);
};

// Static method to get messages for a game
gameMessageSchema.statics.getGameMessages = function(userId, gameId, options = {}) {
  const query = { user: userId, gameId };
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.priority) {
    query.priority = options.priority;
  }
  
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Static method to create message
gameMessageSchema.statics.createMessage = function(data) {
  return this.create({
    user: data.user,
    gameId: data.gameId,
    type: data.type,
    title: data.title,
    content: data.content,
    priority: data.priority || 'medium',
    expiresAt: data.expiresAt,
    metadata: data.metadata || {}
  });
};

module.exports = mongoose.model('GameMessage', gameMessageSchema);


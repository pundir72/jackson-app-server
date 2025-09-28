const mongoose = require('mongoose');

const aiChatSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  gameId: {
    type: String,
    required: false
  },
  context: {
    type: String,
    enum: ['general', 'game_specific', 'earning_tips', 'challenge_help', 'technical_support'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active'
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      messageId: String,
      suggestions: [String],
      gameContext: {
        gameId: String,
        gameTitle: String,
        category: String
      },
      actionRequired: {
        type: String,
        action: String,
        data: mongoose.Schema.Types.Mixed
      }
    }
  }],
  sessionData: {
    totalMessages: {
      type: Number,
      default: 0
    },
    userSatisfaction: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: null
    },
    resolved: {
      type: Boolean,
      default: false
    },
    resolution: {
      type: String,
      enum: ['solved', 'escalated', 'abandoned'],
      default: null
    }
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
aiChatSchema.index({ user: 1, status: 1 });
aiChatSchema.index({ user: 1, gameId: 1 });
aiChatSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for message count
aiChatSchema.virtual('messageCount').get(function() {
  return this.messages.length;
});

// Virtual for last message
aiChatSchema.virtual('lastMessage').get(function() {
  return this.messages[this.messages.length - 1];
});

// Method to add message
aiChatSchema.methods.addMessage = function(role, content, metadata = {}) {
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
    metadata
  });
  this.sessionData.totalMessages = this.messages.length;
  return this.save();
};

// Method to get conversation history
aiChatSchema.methods.getConversationHistory = function(limit = 50) {
  return this.messages
    .slice(-limit)
    .map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata
    }));
};

// Method to mark as resolved
aiChatSchema.methods.markResolved = function(resolution = 'solved') {
  this.status = 'completed';
  this.sessionData.resolved = true;
  this.sessionData.resolution = resolution;
  return this.save();
};

// Method to set satisfaction rating
aiChatSchema.methods.setSatisfaction = function(rating) {
  this.sessionData.userSatisfaction = rating;
  return this.save();
};

// Static method to get active chats for user
aiChatSchema.statics.getActiveChats = function(userId) {
  return this.find({
    user: userId,
    status: 'active'
  }).sort({ updatedAt: -1 });
};

// Static method to get chat history
aiChatSchema.statics.getChatHistory = function(userId, limit = 20) {
  return this.find({ user: userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('gameId context status sessionData createdAt updatedAt');
};

// Static method to get game-specific chats
aiChatSchema.statics.getGameChats = function(userId, gameId) {
  return this.find({
    user: userId,
    gameId: gameId
  }).sort({ updatedAt: -1 });
};

// Static method to create new chat session
aiChatSchema.statics.createChatSession = function(userId, gameId = null, context = 'general') {
  return this.create({
    user: userId,
    gameId: gameId,
    context: context,
    messages: [],
    sessionData: {
      totalMessages: 0,
      resolved: false
    }
  });
};

// Static method to get chat statistics
aiChatSchema.statics.getChatStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const stats = await this.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalChats: { $sum: 1 },
        totalMessages: { $sum: '$sessionData.totalMessages' },
        resolvedChats: {
          $sum: { $cond: ['$sessionData.resolved', 1, 0] }
        },
        averageMessages: { $avg: '$sessionData.totalMessages' },
        satisfactionRatings: {
          $push: '$sessionData.userSatisfaction'
        }
      }
    }
  ]);
  
  const result = stats[0] || {
    totalChats: 0,
    totalMessages: 0,
    resolvedChats: 0,
    averageMessages: 0,
    satisfactionRatings: []
  };
  
  // Calculate satisfaction distribution
  const satisfactionCounts = result.satisfactionRatings.reduce((acc, rating) => {
    if (rating) {
      acc[rating] = (acc[rating] || 0) + 1;
    }
    return acc;
  }, {});
  
  result.satisfactionDistribution = satisfactionCounts;
  delete result.satisfactionRatings;
  
  return result;
};

// Static method to get popular topics
aiChatSchema.statics.getPopularTopics = async function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const topics = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$context',
        count: { $sum: 1 },
        avgMessages: { $avg: '$sessionData.totalMessages' }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: 10
    }
  ]);
  
  return topics;
};

// Pre-save middleware to update session data
aiChatSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.sessionData.totalMessages = this.messages.length;
  }
  next();
});

module.exports = mongoose.model('AIChat', aiChatSchema);


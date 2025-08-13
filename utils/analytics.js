const mongoose = require('mongoose');

// Analytics event schema
const eventSchema = new mongoose.Schema({
  event: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Create model
const Event = mongoose.model('Event', eventSchema);

// Analytics service
const analytics = {
  // Log an event
  async log(event, metadata) {
    try {
      const eventDoc = new Event({
        event,
        metadata
      });

      if (metadata.userId) {
        eventDoc.userId = metadata.userId;
      }

      await eventDoc.save();
      return eventDoc;
    } catch (error) {
      console.error('Failed to log analytics event:', error);
      throw error;
    }
  },

  // Get analytics for a specific user
  async getUserAnalytics(userId, event, startDate, endDate) {
    try {
      const query = {
        userId,
        event
      };

      if (startDate) {
        query.timestamp = { $gte: startDate };
      }

      if (endDate) {
        if (!query.timestamp) {
          query.timestamp = {};
        }
        query.timestamp.$lte = endDate;
      }

      return Event.find(query).sort({ timestamp: -1 });
    } catch (error) {
      console.error('Failed to get user analytics:', error);
      throw error;
    }
  },

  // Get analytics summary
  async getAnalyticsSummary(event, startDate, endDate) {
    try {
      const query = {
        event
      };

      if (startDate) {
        query.timestamp = { $gte: startDate };
      }

      if (endDate) {
        if (!query.timestamp) {
          query.timestamp = {};
        }
        query.timestamp.$lte = endDate;
      }

      return Event.aggregate([
        { $match: query },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          success: { $sum: { $cond: [{ $eq: ['$metadata.success', true] }, 1, 0] } },
          failure: { $sum: { $cond: [{ $eq: ['$metadata.success', false] }, 1, 0] } }
        } },
        { $project: {
          _id: 0,
          total: 1,
          success: 1,
          failure: 1,
          successRate: { $multiply: [{ $divide: ['$success', '$total'] }, 100] }
        } }
      ]);
    } catch (error) {
      console.error('Failed to get analytics summary:', error);
      throw error;
    }
  }
};

module.exports = analytics;

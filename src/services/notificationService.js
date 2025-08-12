const logger = require('../utils/logger');

// Mock notification storage (in production, this would be a database)
let notifications = [];

// Send notification
const sendNotification = async (userId, notificationData) => {
  try {
    const notification = {
      id: Date.now().toString(),
      userId,
      type: notificationData.type,
      title: notificationData.title,
      message: notificationData.message,
      data: notificationData.data || {},
      isRead: false,
      createdAt: new Date(),
    };

    // Store notification
    notifications.push(notification);

    // In production, you would:
    // 1. Save to database
    // 2. Send push notification if user has enabled it
    // 3. Send email notification if configured
    // 4. Send SMS notification if configured

    logger.info(`Notification sent to user ${userId}: ${notificationData.title}`);

    return notification;
  } catch (error) {
    logger.error('Error sending notification:', error);
    throw error;
  }
};

// Get user notifications
const getUserNotifications = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = options;
    const skip = (page - 1) * limit;

    let userNotifications = notifications.filter(n => n.userId === userId);

    if (unreadOnly) {
      userNotifications = userNotifications.filter(n => !n.isRead);
    }

    const total = userNotifications.length;
    const paginatedNotifications = userNotifications
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(skip, skip + limit);

    return {
      notifications: paginatedNotifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    logger.error('Error getting user notifications:', error);
    throw error;
  }
};

// Mark notification as read
const markAsRead = async (userId, notificationId) => {
  try {
    const notification = notifications.find(
      n => n.id === notificationId && n.userId === userId
    );

    if (!notification) {
      throw new Error('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return notification;
  } catch (error) {
    logger.error('Error marking notification as read:', error);
    throw error;
  }
};

// Mark all notifications as read
const markAllAsRead = async (userId) => {
  try {
    const userNotifications = notifications.filter(n => n.userId === userId);
    
    userNotifications.forEach(notification => {
      notification.isRead = true;
      notification.readAt = new Date();
    });

    return { count: userNotifications.length };
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    throw error;
  }
};

// Delete notification
const deleteNotification = async (userId, notificationId) => {
  try {
    const index = notifications.findIndex(
      n => n.id === notificationId && n.userId === userId
    );

    if (index === -1) {
      throw new Error('Notification not found');
    }

    const deletedNotification = notifications.splice(index, 1)[0];
    return deletedNotification;
  } catch (error) {
    logger.error('Error deleting notification:', error);
    throw error;
  }
};

// Get unread count
const getUnreadCount = async (userId) => {
  try {
    const unreadNotifications = notifications.filter(
      n => n.userId === userId && !n.isRead
    );

    return unreadNotifications.length;
  } catch (error) {
    logger.error('Error getting unread count:', error);
    throw error;
  }
};

// Send challenge notification
const sendChallengeNotification = async (userId, challengeData) => {
  return sendNotification(userId, {
    type: 'new_challenge',
    title: 'New Challenge Available!',
    message: `Complete "${challengeData.title}" to earn ${challengeData.pointsReward} points and $${challengeData.cashbackReward} cashback!`,
    data: {
      challengeId: challengeData.id,
      challengeTitle: challengeData.title,
      rewards: {
        points: challengeData.pointsReward,
        cashback: challengeData.cashbackReward,
      },
    },
  });
};

// Send reward notification
const sendRewardNotification = async (userId, rewardData) => {
  return sendNotification(userId, {
    type: 'reward_earned',
    title: 'Reward Earned!',
    message: `Congratulations! You earned ${rewardData.points} points and $${rewardData.cashback} cashback!`,
    data: {
      points: rewardData.points,
      cashback: rewardData.cashback,
      source: rewardData.source,
    },
  });
};

// Send VIP notification
const sendVIPNotification = async (userId, vipData) => {
  return sendNotification(userId, {
    type: 'vip_upgrade',
    title: 'VIP Benefits Unlocked!',
    message: 'You now have access to exclusive VIP benefits and higher rewards!',
    data: {
      benefits: vipData.benefits,
      expiryDate: vipData.expiryDate,
    },
  });
};

// Send receipt notification
const sendReceiptNotification = async (userId, receiptData) => {
  return sendNotification(userId, {
    type: 'receipt_processed',
    title: 'Receipt Processed!',
    message: `Your receipt from ${receiptData.storeName} has been processed. You earned ${receiptData.points} points and $${receiptData.cashback} cashback!`,
    data: {
      receiptId: receiptData.id,
      storeName: receiptData.storeName,
      amount: receiptData.amount,
      rewards: {
        points: receiptData.points,
        cashback: receiptData.cashback,
      },
    },
  });
};

// Send goal notification
const sendGoalNotification = async (userId, goalData) => {
  return sendNotification(userId, {
    type: 'goal_milestone',
    title: 'Goal Milestone Reached!',
    message: `Congratulations! You've reached ${goalData.progress}% of your "${goalData.title}" goal!`,
    data: {
      goalId: goalData.id,
      goalTitle: goalData.title,
      progress: goalData.progress,
      targetAmount: goalData.targetAmount,
      currentAmount: goalData.currentAmount,
    },
  });
};

// Send daily reminder
const sendDailyReminder = async (userId, reminderData) => {
  return sendNotification(userId, {
    type: 'daily_reminder',
    title: 'Daily Check-in',
    message: 'Complete your daily challenges and scan receipts to earn more rewards!',
    data: {
      availableChallenges: reminderData.availableChallenges,
      pendingReceipts: reminderData.pendingReceipts,
    },
  });
};

// Send weekly summary
const sendWeeklySummary = async (userId, summaryData) => {
  return sendNotification(userId, {
    type: 'weekly_summary',
    title: 'Weekly Summary',
    message: `This week you earned ${summaryData.pointsEarned} points and $${summaryData.cashbackEarned} cashback!`,
    data: {
      pointsEarned: summaryData.pointsEarned,
      cashbackEarned: summaryData.cashbackEarned,
      challengesCompleted: summaryData.challengesCompleted,
      receiptsScanned: summaryData.receiptsScanned,
      gamesPlayed: summaryData.gamesPlayed,
    },
  });
};

module.exports = {
  sendNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  sendChallengeNotification,
  sendRewardNotification,
  sendVIPNotification,
  sendReceiptNotification,
  sendGoalNotification,
  sendDailyReminder,
  sendWeeklySummary,
}; 
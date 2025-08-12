const Challenge = require('../models/Challenge');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { sendNotification } = require('../services/notificationService');

// Get daily challenges
const getDailyChallenges = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, category, difficulty } = req.query;
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;

    const challenges = await Challenge.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Challenge.countDocuments(query);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Daily challenges retrieved successfully',
      data: {
        challenges,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting daily challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve daily challenges',
      statusCode: 500,
    });
  }
};

// Get all challenges
const getChallenges = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, category, difficulty } = req.query;
    const skip = (page - 1) * limit;

    const query = { isActive: true };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;

    const challenges = await Challenge.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Challenge.countDocuments(query);

    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: parseInt(limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    };

    res.status(200).json({
      success: true,
      message: 'Challenges retrieved successfully',
      data: {
        challenges,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting challenges:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve challenges',
      statusCode: 500,
    });
  }
};

// Get challenge by ID
const getChallengeById = async (req, res) => {
  try {
    const { id } = req.params;
    const challenge = await Challenge.findById(id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found',
        statusCode: 404,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Challenge retrieved successfully',
      data: { challenge },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting challenge by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve challenge',
      statusCode: 500,
    });
  }
};

// Complete challenge
const completeChallenge = async (req, res) => {
  try {
    const { challengeId, proof } = req.body;
    const userId = req.user.id;

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: 'Challenge not found',
        statusCode: 404,
      });
    }

    if (!challenge.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Challenge is not active',
        statusCode: 400,
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    // Check if user can complete this challenge
    if (!challenge.isAvailableForUser(user)) {
      return res.status(403).json({
        success: false,
        message: 'You are not eligible for this challenge',
        statusCode: 403,
      });
    }

    // Calculate rewards
    const rewards = challenge.getTotalReward();
    
    // Apply VIP multiplier if user is VIP
    if (user.isVipActive()) {
      rewards.points = Math.floor(rewards.points * 1.5);
      rewards.cashback = parseFloat((rewards.cashback * 1.5).toFixed(2));
    }

    // Update user rewards
    await user.addPoints(rewards.points);
    await user.addCashback(rewards.cashback);

    // Update wallet
    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }
    await wallet.addFunds(rewards.cashback, 'challenge');

    // Update challenge completion count
    challenge.currentCompletions += 1;
    await challenge.save();

    // Send notification
    await sendNotification(userId, {
      type: 'challenge_completed',
      title: 'Challenge Completed!',
      message: `You earned ${rewards.points} points and $${rewards.cashback} cashback!`,
      data: {
        challengeId: challenge._id,
        challengeTitle: challenge.title,
        rewards,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Challenge completed successfully',
      data: {
        challenge: {
          id: challenge._id,
          title: challenge.title,
        },
        rewards,
        userStats: {
          totalPoints: user.totalPoints,
          totalCashback: user.totalCashback,
        },
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error completing challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete challenge',
      statusCode: 500,
    });
  }
};

// Get rewards history
const getRewardsHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, startDate, endDate } = req.query;
    const userId = req.user.id;
    const skip = (page - 1) * limit;

    // This would typically come from a separate rewards history collection
    // For now, we'll return a mock response
    const history = [
      {
        id: 1,
        type: 'challenge_completion',
        description: 'Completed: Spend $50 at Walmart',
        points: 50,
        cashback: 2.50,
        createdAt: new Date(),
      },
    ];

    const pagination = {
      currentPage: parseInt(page),
      totalPages: 1,
      totalItems: history.length,
      itemsPerPage: parseInt(limit),
      hasNextPage: false,
      hasPrevPage: false,
    };

    res.status(200).json({
      success: true,
      message: 'Rewards history retrieved successfully',
      data: {
        history,
        pagination,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting rewards history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve rewards history',
      statusCode: 500,
    });
  }
};

// Get leaderboard
const getLeaderboard = async (req, res) => {
  try {
    const { period = 'all-time', type = 'points', limit = 100 } = req.query;

    // Get top users based on criteria
    let sortCriteria = {};
    switch (type) {
      case 'points':
        sortCriteria = { totalPoints: -1 };
        break;
      case 'cashback':
        sortCriteria = { totalCashback: -1 };
        break;
      case 'challenges':
        // This would require tracking challenge completions
        sortCriteria = { totalPoints: -1 };
        break;
      default:
        sortCriteria = { totalPoints: -1 };
    }

    const users = await User.find({ isActive: true })
      .select('firstName lastName avatar totalPoints totalCashback')
      .sort(sortCriteria)
      .limit(parseInt(limit));

    // Find current user's rank
    const currentUser = await User.findById(req.user.id)
      .select('totalPoints totalCashback');

    let userRank = null;
    if (currentUser) {
      const userRankData = await User.countDocuments({
        isActive: true,
        [type === 'cashback' ? 'totalCashback' : 'totalPoints']: {
          $gt: type === 'cashback' ? currentUser.totalCashback : currentUser.totalPoints,
        },
      });
      userRank = userRankData + 1;
    }

    res.status(200).json({
      success: true,
      message: 'Leaderboard retrieved successfully',
      data: {
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
          },
          points: user.totalPoints,
          cashback: user.totalCashback,
        })),
        userRank: userRank ? {
          rank: userRank,
          points: currentUser.totalPoints,
          cashback: currentUser.totalCashback,
        } : null,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve leaderboard',
      statusCode: 500,
    });
  }
};

// Get points balance
const getPointsBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('totalPoints');

    res.status(200).json({
      success: true,
      message: 'Points balance retrieved successfully',
      data: {
        points: user.totalPoints,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting points balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve points balance',
      statusCode: 500,
    });
  }
};

// Get cashback balance
const getCashbackBalance = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select('totalCashback');

    res.status(200).json({
      success: true,
      message: 'Cashback balance retrieved successfully',
      data: {
        cashback: user.totalCashback,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting cashback balance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cashback balance',
      statusCode: 500,
    });
  }
};

// Redeem points
const redeemPoints = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    if (user.totalPoints < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient points',
        statusCode: 400,
      });
    }

    // Convert points to cashback (1 point = $0.01)
    const cashbackAmount = amount * 0.01;
    
    user.totalPoints -= amount;
    user.totalCashback += cashbackAmount;
    await user.save();

    // Update wallet
    let wallet = await Wallet.findByUserId(userId);
    if (!wallet) {
      wallet = await Wallet.createForUser(userId);
    }
    await wallet.addFunds(cashbackAmount, 'points_redemption');

    res.status(200).json({
      success: true,
      message: 'Points redeemed successfully',
      data: {
        pointsRedeemed: amount,
        cashbackEarned: cashbackAmount,
        newPointsBalance: user.totalPoints,
        newCashbackBalance: user.totalCashback,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error redeeming points:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem points',
      statusCode: 500,
    });
  }
};

// Redeem cashback
const redeemCashback = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        statusCode: 404,
      });
    }

    if (user.totalCashback < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient cashback',
        statusCode: 400,
      });
    }

    // This would typically create a withdrawal request
    // For now, we'll just deduct from the balance
    user.totalCashback -= amount;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Cashback redemption request submitted',
      data: {
        amountRequested: amount,
        newCashbackBalance: user.totalCashback,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error redeeming cashback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to redeem cashback',
      statusCode: 500,
    });
  }
};

module.exports = {
  getDailyChallenges,
  getChallenges,
  getChallengeById,
  completeChallenge,
  getRewardsHistory,
  getLeaderboard,
  getPointsBalance,
  getCashbackBalance,
  redeemPoints,
  redeemCashback,
}; 
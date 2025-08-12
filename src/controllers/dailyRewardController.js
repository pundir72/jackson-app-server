const DailyReward = require('../models/DailyReward');
const User = require('../models/User');
const logger = require('../utils/logger');

function toDateKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

// Calculate reward based on streak length
function computeReward(streak) {
  // Example: base 10 points + 0.1 cashback; +5 points every 5 streak; +0.05 cashback every 7 streak
  const basePoints = 10;
  const baseCashback = 0.1;
  const bonusPoints = Math.floor(streak / 5) * 5;
  const bonusCashback = Math.floor(streak / 7) * 0.05;
  return { points: basePoints + bonusPoints, cashback: parseFloat((baseCashback + bonusCashback).toFixed(2)) };
}

const getToday = async (req, res) => {
  try {
    const userId = req.user.id;
    const date = toDateKey();

    const existing = await DailyReward.findOne({ userId, date });
    // Fetch streak info from user
    const user = await User.findById(userId).select('dailyStreak lastDailyReward');
    const streak = user?.dailyStreak || 0;
    const reward = computeReward(streak + (existing ? 0 : 1));

    res.status(200).json({
      success: true,
      message: 'Today\'s daily reward',
      data: {
        date,
        claimed: !!existing,
        reward,
        streak,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Error getting today daily reward:', error);
    res.status(500).json({ success: false, message: 'Failed to get daily reward', statusCode: 500 });
  }
};

const claim = async (req, res) => {
  try {
    const userId = req.user.id;
    const date = toDateKey();

    const existing = await DailyReward.findOne({ userId, date });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Daily reward already claimed', statusCode: 400 });
    }

    // Load user for streak tracking
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found', statusCode: 404 });

    // Update streak
    const last = user.lastDailyReward ? new Date(user.lastDailyReward) : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = toDateKey(yesterday);
    const lastKey = last ? toDateKey(last) : null;

    if (lastKey === yesterdayKey) {
      user.dailyStreak = (user.dailyStreak || 0) + 1;
    } else if (lastKey === toDateKey()) {
      // Should not happen as we checked existing, but guard
      return res.status(400).json({ success: false, message: 'Already claimed today', statusCode: 400 });
    } else {
      user.dailyStreak = 1;
    }

    user.lastDailyReward = new Date();

    const reward = computeReward(user.dailyStreak);

    // Save daily reward
    const record = await DailyReward.create({ userId, date, points: reward.points, cashback: reward.cashback });

    // Apply to user balances
    await user.addPoints(reward.points);
    await user.addCashback(reward.cashback);

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Daily reward claimed',
      data: {
        record,
        streak: user.dailyStreak,
      },
      statusCode: 201,
    });
  } catch (error) {
    logger.error('Error claiming daily reward:', error);
    res.status(500).json({ success: false, message: 'Failed to claim daily reward', statusCode: 500 });
  }
};

module.exports = { getToday, claim };
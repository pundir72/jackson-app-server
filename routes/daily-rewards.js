const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/auth');
const DailyRewardProgress = require('../models/DailyRewardProgress');
const DailyRewardConfig = require('../models/DailyRewardConfig');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getISOWeekKey, getWeekBoundsUtc, initWeekDays } = require('../utils/dailyRewardHelpers');
const { trackAchievements } = require('../utils/achievements');

// Load or create weekly progress
async function loadProgress(userId, dateUtc = new Date()) {
  const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
  const weekKey = getISOWeekKey(dateUtc);
  let progress = await DailyRewardProgress.findOne({ userId, weekKey });
  if (!progress) {
    progress = await DailyRewardProgress.create({
      userId,
      weekKey,
      weekStart,
      weekEnd,
      days: initWeekDays()
    });

    // Initialize states relative to the requested date
    const todayIdx = ((dateUtc.getUTCDay() + 6) % 7); // 0..6 Mon..Sun
    const isCurrentWeek = dateUtc >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Within last 7 days
    let changed = false;
    
    progress.days.forEach((d, idx) => {
      if (isCurrentWeek) {
        // Current week: past days missed, today claimable, future days locked
        if (idx < todayIdx && d.status === 'locked') { d.status = 'missed'; changed = true; }
        if (idx === todayIdx && d.status === 'locked') { d.status = 'claimable'; changed = true; }
      } else {
        // Previous week: all days should be missed (since they're in the past)
        if (d.status === 'locked') { d.status = 'missed'; changed = true; }
      }
    });
    if (changed) await progress.save();
  }

  // Safety net: ensure proper status based on the requested date
  // For current week: today is claimable, past days are missed
  // For previous weeks: all days should be either claimed or missed (never locked)
  const todayIdx = ((dateUtc.getUTCDay() + 6) % 7);
  const isCurrentWeek = dateUtc >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Within last 7 days
  let changed = false;
  
  progress.days.forEach((d, idx) => {
    // Don't change already claimed rewards
    if (d.status === 'claimed') return;
    
    if (isCurrentWeek) {
      // Current week logic: past days missed, today claimable, future days locked
      if (idx < todayIdx && d.status === 'locked') { d.status = 'missed'; changed = true; }
      if (idx === todayIdx && d.status === 'locked') { d.status = 'claimable'; changed = true; }
    } else {
      // Previous week logic: all days should be either claimed or missed (never locked)
      if (d.status === 'locked') { d.status = 'missed'; changed = true; }
    }
  });
  if (changed) await progress.save();
  return progress;
}

async function loadConfig() {
  const cfg = await DailyRewardConfig.findOne({ isActive: true }).sort({ version: -1 });
  if (cfg) return cfg;
  // Fallback default
  return {
    version: 1,
    days: Array.from({ length: 7 }, (_, i) => ({ dayNumber: i + 1, coins: 10, xp: 5 })),
    bigReward: { coins: 200, xp: 100, awardBadge: false },
    fallbackReward: { coins: 50, xp: 25 }
  };
}

// GET /api/daily-rewards/week?date=YYYY-MM-DD
router.get('/week', protect, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const progress = await loadProgress(req.user.userId, date);
    const today = new Date();
    const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1; // 1..7 Mon..Sun

    // compute next unlock timer (end of UTC day)
    const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    res.json({
      success: true,
      data: {
        weekKey: progress.weekKey,
        weekStart: progress.weekStart,
        weekEnd: progress.weekEnd,
        todayDayNumber,
        days: progress.days,
        bigRewardEligible: progress.bigRewardEligible,
        bigRewardGranted: progress.bigRewardGranted,
        countdown: Math.max(0, endOfDay - today)
      }
    });
  } catch (e) {
    console.error('Error getting daily reward week:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward week' });
  }
});

// POST /api/daily-rewards/claim
router.post('/claim', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const progress = await loadProgress(userId, now);
    const cfg = await loadConfig();

    const todayIdx = ((now.getUTCDay() + 6) % 7); // 0..6
    const day = progress.days[todayIdx];

    if (!day || (day.status !== 'claimable')) {
      return res.status(400).json({ success: false, error: 'Reward not claimable' });
    }

    // Determine reward
    const base = cfg.days.find(d => d.dayNumber === day.dayNumber) || { coins: 10, xp: 5 };

    // Check perfect streak for big reward on Day 7
    let bigReward = null;
    if (day.dayNumber === 7) {
      const allClaimed = progress.days.slice(0, 6).every(d => d.status === 'claimed');
      if (allClaimed) {
        bigReward = cfg.bigReward;
        progress.bigRewardEligible = true;
        progress.bigRewardGranted = true;
      }
    }

    const coins = base.coins + (bigReward ? bigReward.coins : 0);
    const xp = base.xp + (bigReward ? bigReward.xp : 0);

    // Apply claim
    day.status = 'claimed';
    day.claimedAt = now;
    day.coins = coins;
    day.xp = xp;

    // Unlock next day (or mark missed for past days)
    if (todayIdx + 1 < progress.days.length) {
      const next = progress.days[todayIdx + 1];
      if (next.status === 'locked') next.status = 'claimable';
    }

    // If any previous day is still locked, mark it as missed
    progress.days.forEach((d, idx) => {
      if (idx < todayIdx && d.status === 'locked') d.status = 'missed';
    });

    progress.lastUpdated = now;
    await progress.save();

    // Credit wallet
    const user = await User.findById(userId).select('wallet xp badges');
    user.wallet.balance = (user.wallet.balance || 0) + coins;
    user.wallet.lastUpdated = now;
    user.xp.current = (user.xp.current || 0) + xp;
    user.xp.total = (user.xp.total || 0) + xp;
    if (cfg.bigReward.awardBadge && bigReward && cfg.bigReward.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName)) user.badges.push(cfg.bigReward.badgeName);
    }

    const tx = new Transaction({
      user: userId,
      type: 'credit',
      amount: coins,
      description: `Daily Reward Day ${day.dayNumber}${bigReward ? ' (Big Reward)' : ''}`,
      status: 'completed',
      metadata: { rewardDay: day.dayNumber, bigReward: !!bigReward, xp }
    });

    await Promise.all([user.save(), tx.save()]);

    // Track achievements for daily reward claim
    setImmediate(async () => {
      try {
        // Count total daily rewards claimed by this user
        const totalClaimed = await DailyRewardProgress.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(userId) } },
          { $unwind: '$days' },
          { $match: { 'days.status': 'claimed' } },
          { $count: 'total' }
        ]);
        
        const dailyRewardsClaimed = totalClaimed.length > 0 ? totalClaimed[0].total : 0;
        
        await trackAchievements(userId, 'wallet', {
          coins: coins,
          xp: xp,
          dayNumber: day.dayNumber,
          bigReward: !!bigReward,
          category: 'daily_reward',
          dailyRewardsClaimed: dailyRewardsClaimed
        });
      } catch (error) {
        console.error('Error tracking daily reward achievements:', error);
      }
    });

    res.json({
      success: true,
      data: {
        day: day.dayNumber,
        coins,
        xp,
        bigReward: !!bigReward,
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      }
    });
  } catch (e) {
    console.error('Error claiming daily reward:', e);
    res.status(500).json({ success: false, error: 'Failed to claim daily reward' });
  }
});

// GET /api/daily-rewards/history?weeks=4
router.get('/history', protect, async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const records = await DailyRewardProgress.find({ userId: req.user.userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({ success: true, data: records });
  } catch (e) {
    console.error('Error getting daily reward history:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward history' });
  }
});

module.exports = router;


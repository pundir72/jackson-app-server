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
  // Always use actual current date for logic, not the requested date
  const now = new Date();
  const currentWeekKey = getISOWeekKey(now);
  const requestedWeekKey = getISOWeekKey(dateUtc);
  const isCurrentWeek = requestedWeekKey === currentWeekKey;

  const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
  const weekKey = requestedWeekKey;

  // Get user account creation date to enforce access restriction
  const user = await User.findById(userId).select('createdAt');
  if (!user) {
    return null; // User not found
  }

  const userCreatedAt = user.createdAt || new Date();

  // Check if requested week is before user account creation
  // User should only access data from their account creation date onward
  // Allow access if the week contains or is after the user's creation date
  if (weekEnd < userCreatedAt) {
    // Entire week is before user account was created - not allowed
    return null;
  }

  let progress = await DailyRewardProgress.findOne({ userId, weekKey });

  // Calculate today's index using actual current date (not requested date)
  const todayIdx = ((now.getUTCDay() + 6) % 7); // 0..6 Mon..Sun

  if (!progress) {
    // Check if this is a future week (not allowed)
    const requestedDate = new Date(dateUtc);
    if (requestedDate > now) {
      // Future week - return null
      return null;
    }

    progress = await DailyRewardProgress.create({
      userId,
      weekKey,
      weekStart,
      weekEnd,
      days: initWeekDays()
    });

    // Initialize states based on whether it's current week and user creation date
    let changed = false;

    // Check if this week contains the user's creation date
    const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);

    // Calculate which day of the week the user was created (0-6, Mon-Sun) within this specific week
    let userCreatedDayIdx = -1;
    if (weekContainsUserCreation) {
      // Calculate days difference from week start to user creation date
      const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
    }

    if (isCurrentWeek) {
      // Current week: use actual today's index
      // Past days missed, today claimable, future days locked
      // But also check user creation date - days before user creation should be missed
      progress.days.forEach((d, idx) => {
        // If user was created in this week, mark days before creation as missed
        if (weekContainsUserCreation && idx < userCreatedDayIdx) {
          d.status = 'missed';
          changed = true;
        } else if (idx < todayIdx && d.status === 'locked') {
          d.status = 'missed';
          changed = true;
        } else if (idx === todayIdx && d.status === 'locked') {
          d.status = 'claimable';
          changed = true;
        }
        // Future days remain locked
      });
    } else {
      // Previous week: check if user was created in this week
      if (weekContainsUserCreation) {
        // User was created in this week - mark days before creation as missed
        progress.days.forEach((d, idx) => {
          if (idx < userCreatedDayIdx && d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          } else if (idx >= userCreatedDayIdx && d.status === 'locked') {
            d.status = 'missed'; // Past week days after creation are also missed
            changed = true;
          }
        });
      } else {
        // Entire week is before or after user creation - all days should be missed
        progress.days.forEach((d) => {
          if (d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          }
        });
      }
    }

    if (changed) await progress.save();
  }

  // Safety net: ensure proper status based on actual current date and user creation date
  // For current week: today is claimable, past days are missed
  // For previous weeks: all days should be either claimed or missed (never locked or claimable)
  // Also ensure days before user creation are marked as missed
  let changed = false;

  // Check if this week contains the user's creation date
  const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);

  // Calculate which day of the week the user was created (0-6, Mon-Sun) within this specific week
  let userCreatedDayIdx = -1;
  if (weekContainsUserCreation) {
    // Calculate days difference from week start to user creation date
    const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
    userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff)); // Clamp to 0-6
  }

  progress.days.forEach((d, idx) => {
    // Don't change already claimed rewards
    if (d.status === 'claimed') return;

    // First check: days before user creation should always be missed
    if (weekContainsUserCreation && idx < userCreatedDayIdx) {
      if (d.status !== 'missed') {
        d.status = 'missed';
        changed = true;
      }
      return; // Skip other checks for days before creation
    }

    if (isCurrentWeek) {
      // Current week logic: use actual today's index
      // Past days missed, today claimable, future days locked
      if (idx < todayIdx) {
        // Past day - should be missed
        if (d.status === 'locked' || d.status === 'claimable') {
          d.status = 'missed';
          changed = true;
        }
      } else if (idx === todayIdx) {
        // Today - should be claimable
        if (d.status === 'locked') {
          d.status = 'claimable';
          changed = true;
        }
      }
      // Future days remain locked (no change needed)
    } else {
      // Previous week logic: all days should be either claimed or missed (never locked or claimable)
      if (d.status === 'locked' || d.status === 'claimable') {
        d.status = 'missed';
        changed = true;
      }
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
    const now = new Date();

    // Reset time to midnight for day-wise comparison
    const startOfDate = new Date(date.setHours(0, 0, 0, 0));
    const startOfNow = new Date(now.setHours(0, 0, 0, 0));

    // Validate date - ensure it's not a future date
    if (startOfDate > startOfNow) {
      return res.status(400).json({
        success: false,
        error: 'Cannot access future weeks'
      });
    }

    // Get user account creation date
    const user = await User.findById(req.user.userId).select('createdAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userCreatedAt = user.createdAt || new Date();
    const startOfUserCreatedAt = new Date(userCreatedAt.setHours(0, 0, 0, 0));

    // Compare only by date (ignore time)
    if (startOfUserCreatedAt > startOfDate) {
      return res.status(400).json({
        success: false,
        error: 'You can only access data from your account creation date onward'
      });
    }


    // Check if requested week is before user account creation
    const { weekStart, weekEnd } = getWeekBoundsUtc(date);

    // Allow access if the week contains or is after the user's creation date
    if (weekEnd < userCreatedAt) {
      // Requested week is before user account was created - redirect to current week
      const progress = await loadProgress(req.user.userId, now);

      if (!progress) {
        return res.status(500).json({
          success: false,
          error: 'Failed to load current week progress'
        });
      }

      const today = new Date();
      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

      return res.json({
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
        },
        message: 'You can only access data from your account creation date onward'
      });
    }

    const progress = await loadProgress(req.user.userId, date);

    // If loadProgress returns null (access denied or error)
    if (!progress) {
      // Fallback to current week
      const currentProgress = await loadProgress(req.user.userId, now);

      if (!currentProgress) {
        return res.status(500).json({
          success: false,
          error: 'Failed to load current week progress'
        });
      }

      const today = new Date();
      const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
      const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

      return res.json({
        success: true,
        data: {
          weekKey: currentProgress.weekKey,
          weekStart: currentProgress.weekStart,
          weekEnd: currentProgress.weekEnd,
          todayDayNumber,
          days: currentProgress.days,
          bigRewardEligible: currentProgress.bigRewardEligible,
          bigRewardGranted: currentProgress.bigRewardGranted,
          countdown: Math.max(0, endOfDay - today)
        },
        message: 'Redirected to current week'
      });
    }

    const today = new Date();
    const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1; // 1..7 Mon..Sun

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

    // CRITICAL: Credit rewards FIRST before marking as claimed
    // This ensures atomicity - if crediting fails, status remains claimable
    const user = await User.findById(userId).select('wallet xp badges');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const oldBalance = user.wallet.balance || 0;
    const oldXP = user.xp.current || 0;

    user.wallet.balance = oldBalance + coins;
    user.wallet.lastUpdated = now;

    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      xp || 0
    );

    user.xp.current = oldXP + finalXP;
    user.xp.total = (user.xp.total || 0) + finalXP;
    if (cfg.bigReward && cfg.bigReward.awardBadge && bigReward && cfg.bigReward.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName)) user.badges.push(cfg.bigReward.badgeName);
    }

    const tx = new Transaction({
      user: userId,
      type: 'credit',
      amount: coins,
      description: `Daily Reward Day ${day.dayNumber}${bigReward ? ' (Big Reward)' : ''}`,
      status: 'completed',
      metadata: { rewardDay: day.dayNumber, bigReward: !!bigReward, baseXp: xp, xp: finalXP, tierMultiplier }
    });

    // Save user and transaction together - if this fails, status won't be marked as claimed
    try {
      await Promise.all([user.save(), tx.save()]);
    } catch (error) {
      // Rollback user changes if transaction save fails
      user.wallet.balance = oldBalance;
      user.xp.current = oldXP;
      await user.save();
      throw error;
    }

    // ONLY AFTER successfully crediting rewards, mark as claimed
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
        xp: finalXP,
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


const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const protect = require('../middleware/auth');
const DailyRewardProgress = require('../models/DailyRewardProgress');
const DailyRewardConfigV2 = require('../models/DailyRewardConfigV2');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { 
  getISOWeekKey, 
  getWeekBoundsUtc, 
  initWeekDays,
  calculateUserWeekNumber,
  getWeekMultiplier,
  applyMultiplier
} = require('../utils/dailyRewardHelpersV2');
const { trackAchievements } = require('../utils/achievements');
const { applyTierMultiplierToXP } = require('../utils/xpTierMultiplier');

// V2 copy of loadProgress / loadConfig reused from V1, but referencing V2 helpers/config

async function loadProgress(userId, dateUtc = new Date()) {
  const now = new Date();
  const currentWeekKey = getISOWeekKey(now);
  const requestedWeekKey = getISOWeekKey(dateUtc);
  const isCurrentWeek = requestedWeekKey === currentWeekKey;

  const { weekStart, weekEnd } = getWeekBoundsUtc(dateUtc);
  const weekKey = requestedWeekKey;

  const user = await User.findById(userId).select('createdAt');
  if (!user) {
    return null;
  }

  const userCreatedAt = user.createdAt || new Date();

  if (weekEnd < userCreatedAt) {
    return null;
  }

  let progress = await DailyRewardProgress.findOne({ userId, weekKey });
  const todayIdx = ((now.getUTCDay() + 6) % 7);

  if (!progress) {
    const requestedDate = new Date(dateUtc);
    if (requestedDate > now) {
      return null;
    }

    progress = await DailyRewardProgress.create({
      userId,
      weekKey,
      weekStart,
      weekEnd,
      days: initWeekDays()
    });

    let changed = false;
    const weekContainsUserCreation = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);
    let userCreatedDayIdx = -1;
    if (weekContainsUserCreation) {
      const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
      userCreatedDayIdx = Math.max(0, Math.min(6, daysDiff));
    }

    if (isCurrentWeek) {
      progress.days.forEach((d, idx) => {
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
      });
    } else {
      if (weekContainsUserCreation) {
        progress.days.forEach((d, idx) => {
          if (idx < userCreatedDayIdx && d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          } else if (idx >= userCreatedDayIdx && d.status === 'locked') {
            d.status = 'missed';
            changed = true;
          }
        });
      } else {
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

  let changed = false;
  const weekContainsUserCreation2 = (weekStart <= userCreatedAt && weekEnd >= userCreatedAt);
  let userCreatedDayIdx2 = -1;
  if (weekContainsUserCreation2) {
    const daysDiff = Math.floor((userCreatedAt - weekStart) / (24 * 60 * 60 * 1000));
    userCreatedDayIdx2 = Math.max(0, Math.min(6, daysDiff));
  }

  progress.days.forEach((d, idx) => {
    if (d.status === 'claimed') return;

    if (weekContainsUserCreation2 && idx < userCreatedDayIdx2) {
      if (d.status !== 'missed') {
        d.status = 'missed';
        changed = true;
      }
      return;
    }

    if (isCurrentWeek) {
      if (idx < todayIdx) {
        if (d.status === 'locked' || d.status === 'claimable') {
          d.status = 'missed';
          changed = true;
        }
      } else if (idx === todayIdx) {
        if (d.status === 'locked') {
          d.status = 'claimable';
          changed = true;
        }
      }
    } else {
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
  const cfg = await DailyRewardConfigV2.findOne({ isActive: true }).sort({ version: -1 });
  if (cfg) return cfg;
  // Fallback default V2-style config
  return {
    version: 1,
    days: Array.from({ length: 7 }, (_, i) => ({ 
      dayNumber: i + 1, 
      active: true,
      rewardType: 'Both',
      coinValue: 10,
      xpValue: 5,
      coins: 10, 
      xp: 5,
      claimButtonLabel: 'CLAIM NOW',
      timerLabel: 'Next reward in',
      claimableOnLoginOnly: false
    })),
    bigReward: { 
      enabled: true,
      rewardType: 'Both',
      coinValue: 200,
      xpValue: 100,
      coins: 200, 
      xp: 100, 
      awardBadge: false,
      downgradeOnMiss: true
    },
    fallbackReward: { coins: 50, xp: 25 },
    weeklyMultiplier: {
      enabled: false,
      week2: 1.0,
      week3: null,
      week4: null,
      additionalWeeks: [],
      roundingRule: 'Round Nearest'
    }
  };
}

// GET /api/daily-rewards-v2/week
router.get('/week', protect, async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const now = new Date();

    const startOfDate = new Date(date.setHours(0, 0, 0, 0));
    const startOfNow = new Date(now.setHours(0, 0, 0, 0));

    if (startOfDate > startOfNow) {
      return res.status(400).json({
        success: false,
        error: 'Cannot access future weeks'
      });
    }

    const user = await User.findById(req.user.userId).select('createdAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userCreatedAt = user.createdAt || new Date();
    const startOfUserCreatedAt = new Date(userCreatedAt.setHours(0, 0, 0, 0));

    if (startOfUserCreatedAt > startOfDate) {
      return res.status(400).json({
        success: false,
        error: 'You can only access data from your account creation date onward'
      });
    }

    const { weekStart, weekEnd } = getWeekBoundsUtc(date);

    if (weekEnd < userCreatedAt) {
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

      const cfg = await loadConfig();
      const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      
      const enrichedDays = progress.days.map(day => {
        const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
        return {
          ...day.toObject(),
          active: dayConfig?.active !== false,
          rewardType: dayConfig?.rewardType || 'Both',
          claimButtonLabel: dayConfig?.claimButtonLabel || 'CLAIM NOW',
          timerLabel: dayConfig?.timerLabel || 'Next reward in',
          claimableOnLoginOnly: dayConfig?.claimableOnLoginOnly || false
        };
      });

      return res.json({
        success: true,
        data: {
          weekKey: progress.weekKey,
          weekStart: progress.weekStart,
          weekEnd: progress.weekEnd,
          todayDayNumber,
          days: enrichedDays,
          bigRewardEligible: progress.bigRewardEligible,
          bigRewardGranted: progress.bigRewardGranted,
          countdown: Math.max(0, endOfDay - today),
          weekNumber,
          weeklyMultiplier: {
            enabled: cfg.weeklyMultiplier?.enabled || false,
            currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
            status: cfg.weeklyMultiplier?.enabled 
              ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
              : 'Weekly Multiplier: Disabled'
          },
          bigReward: {
            enabled: cfg.bigReward?.enabled !== false,
            downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false
          }
        },
        message: 'You can only access data from your account creation date onward'
      });
    }

    const progress = await loadProgress(req.user.userId, date);

    if (!progress) {
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

      const cfg = await loadConfig();
      const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
      const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
      
      const enrichedDays = currentProgress.days.map(day => {
        const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
        return {
          ...day.toObject(),
          active: dayConfig?.active !== false,
          rewardType: dayConfig?.rewardType || 'Both',
          claimButtonLabel: dayConfig?.claimButtonLabel || 'CLAIM NOW',
          timerLabel: dayConfig?.timerLabel || 'Next reward in',
          claimableOnLoginOnly: dayConfig?.claimableOnLoginOnly || false
        };
      });

      return res.json({
        success: true,
        data: {
          weekKey: currentProgress.weekKey,
          weekStart: currentProgress.weekStart,
          weekEnd: currentProgress.weekEnd,
          todayDayNumber,
          days: enrichedDays,
          bigRewardEligible: currentProgress.bigRewardEligible,
          bigRewardGranted: currentProgress.bigRewardGranted,
          countdown: Math.max(0, endOfDay - today),
          weekNumber,
          weeklyMultiplier: {
            enabled: cfg.weeklyMultiplier?.enabled || false,
            currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
            status: cfg.weeklyMultiplier?.enabled 
              ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
              : 'Weekly Multiplier: Disabled'
          },
          bigReward: {
            enabled: cfg.bigReward?.enabled !== false,
            downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false
          }
        },
        message: 'Redirected to current week'
      });
    }

    const today = new Date();
    const todayDayNumber = ((today.getUTCDay() + 6) % 7) + 1;
    const endOfDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59, 999));

    const cfg = await loadConfig();
    const weekNumber = await calculateUserWeekNumber(req.user.userId, today, DailyRewardProgress);
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    
    const enrichedDays = progress.days.map(day => {
      const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
      return {
        ...day.toObject(),
        active: dayConfig?.active !== false,
        rewardType: dayConfig?.rewardType || 'Both',
        claimButtonLabel: dayConfig?.claimButtonLabel || 'CLAIM NOW',
        timerLabel: dayConfig?.timerLabel || 'Next reward in',
        claimableOnLoginOnly: dayConfig?.claimableOnLoginOnly || false
      };
    });

    return res.json({
      success: true,
      data: {
        weekKey: progress.weekKey,
        weekStart: progress.weekStart,
        weekEnd: progress.weekEnd,
        todayDayNumber,
        days: enrichedDays,
        bigRewardEligible: progress.bigRewardEligible,
        bigRewardGranted: progress.bigRewardGranted,
        countdown: Math.max(0, endOfDay - today),
        weekNumber,
        weeklyMultiplier: {
          enabled: cfg.weeklyMultiplier?.enabled || false,
          currentMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
          status: cfg.weeklyMultiplier?.enabled 
            ? `Weekly Multiplier: Gradual (Active) - Week ${weekNumber} (${weekMultiplier}x)`
            : 'Weekly Multiplier: Disabled'
        },
        bigReward: {
          enabled: cfg.bigReward?.enabled !== false,
          downgradeOnMiss: cfg.bigReward?.downgradeOnMiss !== false
        }
      }
    });
  } catch (e) {
    console.error('Error getting daily reward V2 week:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward V2 week' });
  }
});

// POST /api/daily-rewards-v2/claim
router.post('/claim', protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const progress = await loadProgress(userId, now);
    const cfg = await loadConfig();

    const todayIdx = ((now.getUTCDay() + 6) % 7);
    const day = progress.days[todayIdx];

    if (!day || (day.status !== 'claimable')) {
      return res.status(400).json({ success: false, error: 'Reward not claimable' });
    }

    const dayConfig = cfg.days.find(d => d.dayNumber === day.dayNumber);
    if (!dayConfig) {
      return res.status(400).json({ success: false, error: 'Day configuration not found' });
    }

    if (dayConfig.active === false) {
      return res.status(400).json({ success: false, error: 'This day\'s reward is not active' });
    }

    const weekNumber = await calculateUserWeekNumber(userId, now, DailyRewardProgress);
    const weekMultiplier = getWeekMultiplier(cfg, weekNumber);
    const roundingRule = cfg.weeklyMultiplier?.roundingRule || 'Round Nearest';

    const rewardType = dayConfig.rewardType || 'Both';
    let baseCoins = 0;
    let baseXP = 0;

    if (rewardType === 'Coins' || rewardType === 'Both') {
      baseCoins = dayConfig.coinValue !== undefined ? dayConfig.coinValue : dayConfig.coins || 0;
    }
    if (rewardType === 'XP' || rewardType === 'Both') {
      baseXP = dayConfig.xpValue !== undefined ? dayConfig.xpValue : dayConfig.xp || 0;
    }

    let finalCoins = baseCoins;
    let finalXP = baseXP;

    if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
      finalCoins = applyMultiplier(baseCoins, weekMultiplier, roundingRule);
      finalXP = applyMultiplier(baseXP, weekMultiplier, roundingRule);
    }

    let bigReward = null;
    let bigRewardCoins = 0;
    let bigRewardXP = 0;

    if (day.dayNumber === 7 && cfg.bigReward?.enabled !== false) {
      const downgradeOnMiss = cfg.bigReward.downgradeOnMiss !== false;
      
      if (downgradeOnMiss) {
        const allClaimed = progress.days.slice(0, 6).every(d => d.status === 'claimed');
        if (allClaimed && weekNumber === 1) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      } else {
        if (weekNumber === 1) {
          bigReward = cfg.bigReward;
          progress.bigRewardEligible = true;
          progress.bigRewardGranted = true;
        }
      }

      if (bigReward) {
        const bigRewardType = bigReward.rewardType || 'Both';
        
        if (bigRewardType === 'Coins' || bigRewardType === 'Both') {
          bigRewardCoins = bigReward.coinValue !== undefined ? bigReward.coinValue : bigReward.coins || 0;
        }
        if (bigRewardType === 'XP' || bigRewardType === 'Both') {
          bigRewardXP = bigReward.xpValue !== undefined ? bigReward.xpValue : bigReward.xp || 0;
        }

        if (weekNumber > 1 && cfg.weeklyMultiplier?.enabled) {
          bigRewardCoins = applyMultiplier(bigRewardCoins, weekMultiplier, roundingRule);
          bigRewardXP = applyMultiplier(bigRewardXP, weekMultiplier, roundingRule);
        }
      } else if (weekNumber === 1) {
        bigRewardCoins = cfg.fallbackReward?.coins || 0;
        bigRewardXP = cfg.fallbackReward?.xp || 0;
      }
    }

    const coins = finalCoins + bigRewardCoins;
    const xp = finalXP + bigRewardXP;

    day.status = 'claimed';
    day.claimedAt = now;
    day.coins = coins;
    day.xp = xp;

    if (todayIdx + 1 < progress.days.length) {
      const next = progress.days[todayIdx + 1];
      if (next.status === 'locked') next.status = 'claimable';
    }

    progress.days.forEach((d, idx) => {
      if (idx < todayIdx && d.status === 'locked') d.status = 'missed';
    });

    progress.lastUpdated = now;
    await progress.save();

    const user = await User.findById(userId).select('wallet xp badges');
    user.wallet.balance = (user.wallet.balance || 0) + coins;
    user.wallet.lastUpdated = now;

    const { finalXP: finalXPWithTier, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      xp || 0
    );

    user.xp.current = (user.xp.current || 0) + finalXPWithTier;
    user.xp.total = (user.xp.total || 0) + finalXPWithTier;
    
    if (bigReward && cfg.bigReward?.awardBadge && cfg.bigReward?.badgeName) {
      if (!user.badges) user.badges = [];
      if (!user.badges.includes(cfg.bigReward.badgeName)) user.badges.push(cfg.bigReward.badgeName);
    }

    const tx = new Transaction({
      user: userId,
      type: 'credit',
      amount: coins,
      description: `Daily Reward V2 Day ${day.dayNumber}${bigReward ? ' (Big Reward)' : ''}${weekNumber > 1 ? ` Week ${weekNumber}` : ''}`,
      status: 'completed',
      metadata: { 
        rewardDay: day.dayNumber, 
        bigReward: !!bigReward, 
        baseXp: xp, 
        xp: finalXPWithTier, 
        tierMultiplier,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0
      }
    });

    await Promise.all([user.save(), tx.save()]);

    setImmediate(async () => {
      try {
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
          category: 'daily_reward_v2',
          dailyRewardsClaimed: dailyRewardsClaimed,
          weekNumber: weekNumber
        });
      } catch (error) {
        console.error('Error tracking daily reward V2 achievements:', error);
      }
    });

    res.json({
      success: true,
      data: {
        day: day.dayNumber,
        coins,
        xp: finalXPWithTier,
        bigReward: !!bigReward,
        weekNumber,
        weekMultiplier: weekNumber > 1 ? weekMultiplier : 1.0,
        newBalance: user.wallet.balance,
        newXP: user.xp.current
      }
    });
  } catch (e) {
    console.error('Error claiming daily reward V2:', e);
    res.status(500).json({ success: false, error: 'Failed to claim daily reward V2' });
  }
});

router.get('/history', protect, async (req, res) => {
  try {
    const { weeks = 4 } = req.query;
    const records = await DailyRewardProgress.find({ userId: req.user.userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({ success: true, data: records });
  } catch (e) {
    console.error('Error getting daily reward V2 history:', e);
    res.status(500).json({ success: false, error: 'Failed to get daily reward V2 history' });
  }
});

module.exports = router;



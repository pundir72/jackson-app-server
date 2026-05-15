const express = require('express');
const router = express.Router();
const AccountOverviewConfig = require('../models/AccountOverviewConfig');
const User = require('../models/User');
const { adminAuth } = require('../middleware/adminAuth');

router.use(adminAuth);

router.get('/config', async (req, res) => {
  try {
    const config = await AccountOverviewConfig.getActiveConfig();
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching account overview config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
  }
});

router.get('/config/history', async (req, res) => {
  try {
    const configs = await AccountOverviewConfig.find()
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: configs });
  } catch (error) {
    console.error('Error fetching config history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config history' });
  }
});

router.get('/config/:id', async (req, res) => {
  try {
    const config = await AccountOverviewConfig.findById(req.params.id);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch config' });
  }
});

async function syncTargetsToAllUsers(milestones) {
  if (!milestones) return;
  const updateFields = {};
  if (milestones.gamesPlayed && milestones.gamesPlayed.target !== undefined) {
    updateFields['onboarding.dailyGoals.gamesPlayed'] = milestones.gamesPlayed.target;
  }
  if (milestones.coinsEarned && milestones.coinsEarned.target !== undefined) {
    updateFields['onboarding.dailyGoals.coinsEarned'] = milestones.coinsEarned.target;
  }
  if (milestones.challengesCompleted && milestones.challengesCompleted.target !== undefined) {
    updateFields['onboarding.dailyGoals.challengesCompleted'] = milestones.challengesCompleted.target;
  }
  if (Object.keys(updateFields).length > 0) {
    await User.updateMany({}, { $set: updateFields });
    console.log(`[Admin] Synced targets to all users: ${JSON.stringify(updateFields)}`);
  }
}

router.post('/config', async (req, res) => {
  try {
    const { milestones, threeTaskReward, isActive } = req.body;

    await AccountOverviewConfig.updateMany(
      { isActive: true },
      { isActive: false }
    );

    const config = await AccountOverviewConfig.create({
      milestones,
      threeTaskReward,
      isActive: isActive !== undefined ? isActive : true,
      updatedBy: req.user?.userId
    });

    await syncTargetsToAllUsers(milestones);

    res.status(201).json({
      success: true,
      data: config,
      message: 'Account overview config created successfully'
    });
  } catch (error) {
    console.error('Error creating config:', error);
    res.status(500).json({ success: false, error: 'Failed to create config' });
  }
});

router.put('/config/:id', async (req, res) => {
  try {
    const config = await AccountOverviewConfig.findById(req.params.id);
    if (!config) {
      return res.status(404).json({ success: false, error: 'Config not found' });
    }

    const { milestones, threeTaskReward, isActive } = req.body;

    if (milestones) {
      if (milestones.gamesPlayed) {
        if (milestones.gamesPlayed.target !== undefined) config.milestones.gamesPlayed.target = milestones.gamesPlayed.target;
        if (milestones.gamesPlayed.reward) {
          if (milestones.gamesPlayed.reward.coins !== undefined) config.milestones.gamesPlayed.reward.coins = milestones.gamesPlayed.reward.coins;
          if (milestones.gamesPlayed.reward.xp !== undefined) config.milestones.gamesPlayed.reward.xp = milestones.gamesPlayed.reward.xp;
        }
      }
      if (milestones.coinsEarned) {
        if (milestones.coinsEarned.target !== undefined) config.milestones.coinsEarned.target = milestones.coinsEarned.target;
        if (milestones.coinsEarned.reward) {
          if (milestones.coinsEarned.reward.coins !== undefined) config.milestones.coinsEarned.reward.coins = milestones.coinsEarned.reward.coins;
          if (milestones.coinsEarned.reward.xp !== undefined) config.milestones.coinsEarned.reward.xp = milestones.coinsEarned.reward.xp;
        }
      }
      if (milestones.challengesCompleted) {
        if (milestones.challengesCompleted.target !== undefined) config.milestones.challengesCompleted.target = milestones.challengesCompleted.target;
        if (milestones.challengesCompleted.reward) {
          if (milestones.challengesCompleted.reward.coins !== undefined) config.milestones.challengesCompleted.reward.coins = milestones.challengesCompleted.reward.coins;
          if (milestones.challengesCompleted.reward.xp !== undefined) config.milestones.challengesCompleted.reward.xp = milestones.challengesCompleted.reward.xp;
        }
      }
    }

    if (threeTaskReward) {
      if (threeTaskReward.coins !== undefined) config.threeTaskReward.coins = threeTaskReward.coins;
      if (threeTaskReward.xp !== undefined) config.threeTaskReward.xp = threeTaskReward.xp;
    }

    if (isActive !== undefined) {
      if (isActive) {
        await AccountOverviewConfig.updateMany(
          { _id: { $ne: config._id }, isActive: true },
          { isActive: false }
        );
      }
      config.isActive = isActive;
    }

    config.updatedBy = req.user?.userId;
    await config.save();

    await syncTargetsToAllUsers(milestones);

    res.json({
      success: true,
      data: config,
      message: 'Account overview config updated successfully'
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ success: false, error: 'Failed to update config' });
  }
});

module.exports = router;

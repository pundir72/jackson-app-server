/**
 * Admin routes for client games integrated through Adjust.
 *
 * Game details, tasks, display rules and placement use the existing admin game
 * endpoints, exactly as for partner games. These routes add only what client
 * games need on top: the Adjust link, the rewards kill switch, a setup check,
 * the review queue for events that could not be credited automatically, and
 * the figures for reconciling against Adjust.
 * @module routes/admin-direct-games
 */

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const DirectGameEvent = require('../models/DirectGameEvent');
const { PROVIDER, creditByAdmin, rejectByAdmin, retryEvent } = require('../utils/directGameProcessor');

router.use(adminAuth);

const isHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const validId = (id) => mongoose.Types.ObjectId.isValid(id);

async function findClientGame(id) {
  if (!validId(id)) return null;
  const game = await Game.findById(id);
  return game && game.sdkProvider === PROVIDER ? game : null;
}

/** Everything that would stop this game's milestones from being credited. */
async function getSetupIssues(game) {
  const issues = [];
  const di = game.directIntegration || {};
  if (!di.adjustAppToken) issues.push({ level: 'error', field: 'adjustAppToken', message: 'Adjust app token is missing' });
  if (!di.trackerUrl) issues.push({ level: 'error', field: 'trackerUrl', message: 'Adjust tracker link is missing' });
  if (!game.metadata?.packageName) issues.push({ level: 'warning', field: 'packageName', message: 'Package name is missing' });
  if (!game.gameDetails?.downloadUrl) issues.push({ level: 'warning', field: 'storeUrl', message: 'Store link is missing' });

  const tasks = await GameTask.find({ gameId: game._id, isActive: true }).select('name externalTaskId eventTypes').lean();
  if (!tasks.length) issues.push({ level: 'error', field: 'tasks', message: 'No active tasks' });

  const byToken = new Map();
  for (const task of tasks) {
    if (!task.externalTaskId) {
      issues.push({ level: 'error', field: 'tasks', taskId: task._id, message: `Task "${task.name}" has no Adjust event token` });
      continue;
    }
    byToken.set(task.externalTaskId, [...(byToken.get(task.externalTaskId) || []), task]);
    if (!task.eventTypes?.length) {
      issues.push({
        level: 'warning',
        field: 'tasks',
        taskId: task._id,
        message: `Task "${task.name}" is unclassified, so it only counts toward "tasks" daily challenges`,
      });
    }
  }
  for (const [token, shared] of byToken) {
    if (shared.length > 1) {
      issues.push({ level: 'error', field: 'tasks', message: `Adjust event ${token} is mapped to ${shared.length} tasks` });
    }
  }
  return issues;
}

/**
 * @route GET /api/admin/direct-games/games
 * @desc  Client games with their Adjust setup and outstanding issues
 */
router.get('/games', async (req, res) => {
  try {
    const games = await Game.find({ sdkProvider: PROVIDER }).sort({ createdAt: -1 });
    const data = await Promise.all(
      games.map(async (game) => ({
        _id: game._id,
        gameId: game.gameId,
        title: game.title,
        isActive: game.isActive,
        uiSection: game.uiSection,
        packageName: game.metadata?.packageName || null,
        storeUrl: game.gameDetails?.downloadUrl || null,
        iconUrl: game.metadata?.iconUrl || null,
        directIntegration: game.directIntegration,
        issues: await getSetupIssues(game),
      }))
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list client games', error: error.message });
  }
});

/**
 * @route GET /api/admin/direct-games/games/:id/validation
 * @desc  Setup check - an empty `errors` list means milestones can be credited
 */
router.get('/games/:id/validation', async (req, res) => {
  try {
    const game = await findClientGame(req.params.id);
    if (!game) return res.status(404).json({ success: false, message: 'Client game not found' });
    const issues = await getSetupIssues(game);
    res.json({
      success: true,
      data: {
        ready: !issues.some((i) => i.level === 'error'),
        errors: issues.filter((i) => i.level === 'error'),
        warnings: issues.filter((i) => i.level === 'warning'),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to validate game', error: error.message });
  }
});

/**
 * @route PUT /api/admin/direct-games/games/:id/config
 * @desc  Link a client game (created with sdkProvider "adjust") to its Adjust app
 * @body  {String} adjustAppToken, {String} trackerUrl, {String} [packageName],
 *        {String} [storeUrl], {String} [iconUrl]
 */
router.put('/games/:id/config', async (req, res) => {
  try {
    const game = await findClientGame(req.params.id);
    if (!game) {
      return res.status(404).json({ success: false, message: 'Client game not found. Create it with SDK provider "adjust" first.' });
    }

    const { adjustAppToken, trackerUrl, packageName, storeUrl, iconUrl } = req.body || {};
    const errors = [];
    const token = typeof adjustAppToken === 'string' ? adjustAppToken.trim() : '';
    if (!token) errors.push('adjustAppToken is required');
    if (!trackerUrl || !isHttpUrl(trackerUrl)) errors.push('trackerUrl must be a valid http(s) URL');
    if (storeUrl && !isHttpUrl(storeUrl)) errors.push('storeUrl must be a valid http(s) URL');
    if (iconUrl && !isHttpUrl(iconUrl)) errors.push('iconUrl must be a valid http(s) URL');
    if (errors.length) return res.status(400).json({ success: false, message: 'Validation failed', errors });

    // Variants of the same game share an app token; different games must not,
    // or their events could not be told apart
    const clash = await Game.findOne({
      'directIntegration.adjustAppToken': token,
      gameId: { $ne: game.gameId },
    }).select('title gameId').lean();
    if (clash) {
      return res.status(409).json({ success: false, message: `App token already used by "${clash.title}" (${clash.gameId})` });
    }

    // $set rather than save(): games created through the shared admin form
    // carry an empty xptrRules, which full-document validation rejects even
    // though nothing here touches it
    const set = {
      'directIntegration.adjustAppToken': token,
      'directIntegration.trackerUrl': trackerUrl.trim(),
      updatedBy: req.user.userId,
    };
    if (packageName !== undefined) set['metadata.packageName'] = String(packageName).trim() || null;
    if (storeUrl !== undefined) set['gameDetails.downloadUrl'] = storeUrl || '';
    if (iconUrl !== undefined) set['metadata.iconUrl'] = iconUrl || null;
    const updated = await Game.findByIdAndUpdate(game._id, { $set: set }, { new: true });

    res.json({ success: true, message: 'Adjust configuration saved', data: { game: updated, issues: await getSetupIssues(updated) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save configuration', error: error.message });
  }
});

/**
 * @route PATCH /api/admin/direct-games/games/:id/rewards
 * @desc  Kill switch. Applies to every variant of the game, and takes effect
 *        for the next event processed. Events received while off are queued
 *        for review, not lost.
 * @body  {Boolean} enabled
 */
router.patch('/games/:id/rewards', async (req, res) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: 'enabled must be true or false' });
    }
    const game = await findClientGame(req.params.id);
    if (!game) return res.status(404).json({ success: false, message: 'Client game not found' });

    const result = await Game.updateMany(
      { gameId: game.gameId, sdkProvider: PROVIDER },
      {
        $set: {
          'directIntegration.rewardsEnabled': req.body.enabled,
          'directIntegration.rewardsToggledAt': new Date(),
          'directIntegration.rewardsToggledBy': req.user.userId,
        },
      }
    );
    res.json({
      success: true,
      message: `Rewards ${req.body.enabled ? 'enabled' : 'disabled'}`,
      data: { gameId: game.gameId, rewardsEnabled: req.body.enabled, variantsUpdated: result.modifiedCount },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update rewards switch', error: error.message });
  }
});

/**
 * @route GET /api/admin/direct-games/events
 * @desc  Event log and review queue. `status=review` is the queue.
 * @query status, reason, game, userId, eventToken, from, to, page, limit
 */
router.get('/events', async (req, res) => {
  try {
    const { status, reason, game, userId, eventToken, from, to } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

    const query = {};
    if (status) query.status = { $in: String(status).split(',') };
    if (reason) query.reason = reason;
    if (game && validId(game)) query.game = game;
    if (userId && validId(userId)) query.userId = userId;
    if (eventToken) query.eventToken = eventToken;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const [events, total] = await Promise.all([
      DirectGameEvent.find(query)
        .select('-raw')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'firstName lastName email')
        .populate('game', 'title gameId')
        .populate('task', 'name rewardType rewardValue')
        .lean(),
      DirectGameEvent.countDocuments(query),
    ]);
    res.json({ success: true, data: { events, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list events', error: error.message });
  }
});

router.get('/events/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const event = await DirectGameEvent.findById(req.params.id)
      .populate('userId', 'firstName lastName email mobile')
      .populate('game', 'title gameId directIntegration')
      .populate('task', 'name rewardType rewardValue externalTaskId isRepeatable')
      .lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get event', error: error.message });
  }
});

/**
 * @route POST /api/admin/direct-games/events/:id/credit
 * @desc  Credit an event from the review queue
 * @body  {String} [userId] - required when the event matched no user
 *        {String} [taskId] - required when the event matched no task
 *        {String} [note]
 */
router.post('/events/:id/credit', async (req, res) => {
  try {
    const { userId, taskId, note } = req.body || {};
    if (!validId(req.params.id) || (userId && !validId(userId)) || (taskId && !validId(taskId))) {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    const result = await creditByAdmin(req.params.id, { adminId: req.user.userId, userId, taskId, note });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({
      success: result.event.status === 'credited',
      message: result.event.status === 'credited' ? 'Event credited' : `Not credited: ${result.event.reasonDetail || result.event.reason}`,
      data: result.event,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to credit event', error: error.message });
  }
});

router.post('/events/:id/reject', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const result = await rejectByAdmin(req.params.id, { adminId: req.user.userId, note: req.body?.note });
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({ success: true, message: 'Event rejected', data: result.event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reject event', error: error.message });
  }
});

/**
 * @route POST /api/admin/direct-games/events/:id/retry
 * @desc  Re-run the automatic checks, e.g. after mapping a missing task
 */
router.post('/events/:id/retry', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid id' });
    const result = await retryEvent(req.params.id);
    if (result.error) return res.status(400).json({ success: false, message: result.error });
    res.json({ success: true, message: `Event is now ${result.event?.status}`, data: result.event });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retry event', error: error.message });
  }
});

/**
 * @route GET /api/admin/direct-games/reports/summary
 * @desc  Per game and Adjust event: what arrived and what it became. Compare
 *        `received` with Adjust's event counts for the same period.
 * @query from, to (ISO dates; default: current calendar month, UTC)
 */
router.get('/reports/summary', async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = req.query.to ? new Date(req.query.to) : now;

    const rows = await DirectGameEvent.aggregate([
      { $match: { activityKind: 'event', receivedAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { appToken: '$adjustAppToken', eventToken: '$eventToken', status: '$status' },
          count: { $sum: 1 },
          coins: { $sum: '$reward.coins' },
          xp: { $sum: '$reward.xp' },
        },
      },
    ]);

    const games = await Game.find({ sdkProvider: PROVIDER }).select('title gameId directIntegration.adjustAppToken').lean();
    const titleByToken = new Map(games.map((g) => [g.directIntegration?.adjustAppToken, g.title]));

    const summary = new Map();
    for (const row of rows) {
      const key = `${row._id.appToken}:${row._id.eventToken}`;
      if (!summary.has(key)) {
        summary.set(key, {
          adjustAppToken: row._id.appToken,
          game: titleByToken.get(row._id.appToken) || null,
          eventToken: row._id.eventToken,
          received: 0,
          byStatus: {},
          coinsCredited: 0,
          xpCredited: 0,
        });
      }
      const entry = summary.get(key);
      entry.received += row.count;
      entry.byStatus[row._id.status] = row.count;
      if (row._id.status === 'credited') {
        entry.coinsCredited += row.coins;
        entry.xpCredited += row.xp;
      }
    }

    const openReview = await DirectGameEvent.countDocuments({ status: { $in: ['review', 'failed'] } });
    res.json({ success: true, data: { from, to, openReview, rows: [...summary.values()] } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to build summary', error: error.message });
  }
});

module.exports = router;

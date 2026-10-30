/**
 * Processes Adjust milestone callbacks from client games into rewards.
 *
 * Callbacks are stored first (routes/direct-games.js), then each stored event
 * runs through the same steps, in this order:
 *
 *   1. kind      only in-app events pay; installs just bind the launch ticket
 *   2. match     user (utils/directGameMatching), game by app token, task by
 *                Adjust event token
 *   3. checks    kill switch, late event, account status - a failure goes to
 *                admin review, never silently dropped
 *   4. lock      a task the user still sees as locked is held, and re-checked
 *                whenever the user progresses
 *   5. credit    one claim per user+task (unique index), then the shared reward
 *                service, which is itself exactly-once per event
 *
 * Every step is safe to repeat. A crash leaves the event in `processing`, and
 * the sweeper picks it up again once the lock goes stale.
 */

const config = require('../config/config');
const DirectGameEvent = require('../models/DirectGameEvent');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const User = require('../models/User');
const { resolveUser } = require('./directGameMatching');
const { getTaskUnlockState } = require('./taskUnlock');
const { creditGameTask } = require('./gameTaskRewards');

const PROVIDER = 'adjust';
const MAX_ATTEMPTS = 6;
const STALE_LOCK_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTRIBUTION_KINDS = ['install', 'reattribution', 'reinstall'];

const outcome = (status, reason = null, detail = null, fields = {}) => ({ status, reason, detail, fields });

async function claim(eventId, fromStatuses) {
  const now = new Date();
  return DirectGameEvent.findOneAndUpdate(
    {
      _id: eventId,
      $or: [
        { status: { $in: fromStatuses } },
        { status: 'processing', lockedAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } },
      ],
    },
    { $set: { status: 'processing', lockedAt: now } },
    { new: true }
  );
}

async function finish(eventId, { status, reason, detail, fields }) {
  await DirectGameEvent.updateOne(
    { _id: eventId, status: 'processing' },
    { $set: { status, reason, reasonDetail: detail, lockedAt: null, ...fields } }
  );
}

/** Steps 1-2. Returns the matched context, or an outcome to stop at. */
async function match(event) {
  if (ATTRIBUTION_KINDS.includes(event.activityKind)) {
    // Resolving binds a labelled ticket to this device for later events
    if (event.label && event.adjustAppToken) await resolveUser(event);
    return { stop: outcome('ignored', 'attribution_only') };
  }
  if (event.activityKind !== 'event') {
    return { stop: outcome('ignored', 'unsupported_activity', event.activityKind) };
  }
  if (event.environment === 'sandbox' && !config.DIRECT_GAMES_ACCEPT_SANDBOX) {
    return { stop: outcome('rejected', 'sandbox_event') };
  }
  if (!event.adjustAppToken || !event.eventToken) {
    return { stop: outcome('review', 'malformed_callback', 'Missing app_token or event_token') };
  }

  // Already matched on an earlier pass (held, or retried after a failure)
  if (event.userId && event.game && event.task) {
    const [game, task] = await Promise.all([Game.findById(event.game), GameTask.findById(event.task)]);
    if (game && task) return { game, task, userId: event.userId };
  }

  const games = await Game.find({
    sdkProvider: PROVIDER,
    'directIntegration.adjustAppToken': event.adjustAppToken,
  });
  if (!games.length) {
    return { stop: outcome('review', 'unknown_game', `No client game has Adjust app token ${event.adjustAppToken}`) };
  }

  // Game and task come from Adjust's own tokens, so they are known even when
  // the user is not - an admin reviewing an unmatched event then only has to
  // pick the user.
  let tasks = await GameTask.find({
    gameId: { $in: games.map((g) => g._id) },
    externalTaskId: event.eventToken,
    isActive: true,
  });
  const taskFields = (list) =>
    list.length === 1
      ? {
          game: list[0].gameId,
          task: list[0]._id,
          rewardSnapshot: { rewardType: list[0].rewardType, rewardValue: list[0].rewardValue, capturedAt: new Date() },
        }
      : {};

  const user = await resolveUser(event, { deviceWindowDays: config.DIRECT_GAMES_LATE_EVENT_DAYS });
  if (user.review) return { stop: outcome('review', user.review, user.detail, taskFields(tasks)) };

  const matchedFields = { userId: user.userId, matchMethod: user.method, ticket: user.ticket || null };

  // One game can have several targeting variants sharing an app token, each
  // with its own tasks. The variant the user launched wins when known.
  if (user.gameId) {
    const launched = tasks.filter((t) => String(t.gameId) === String(user.gameId));
    if (launched.length) tasks = launched;
  }
  if (!tasks.length) {
    return {
      stop: outcome('review', 'unknown_event', `No active task is mapped to Adjust event ${event.eventToken}`, {
        ...matchedFields,
        game: user.gameId || games[0]._id,
      }),
    };
  }
  if (tasks.length > 1) {
    return {
      stop: outcome('review', 'ambiguous_task', `${tasks.length} tasks are mapped to Adjust event ${event.eventToken}`, matchedFields),
    };
  }

  const task = tasks[0];
  const game = games.find((g) => String(g._id) === String(task.gameId));

  if (user.method === 'advertising_id' && config.DIRECT_GAMES_DEVICE_MATCH_MODE !== 'credit') {
    return {
      stop: outcome('review', 'device_match_needs_review', 'Matched by advertising id only', {
        ...matchedFields,
        game: game._id,
        task: task._id,
        rewardSnapshot: { rewardType: task.rewardType, rewardValue: task.rewardValue, capturedAt: new Date() },
      }),
    };
  }

  return { game, task, userId: user.userId, matchedFields };
}

const snapshotFor = (event, task) =>
  event.rewardSnapshot?.rewardType
    ? event.rewardSnapshot
    : { rewardType: task.rewardType, rewardValue: task.rewardValue, capturedAt: new Date() };

/** Step 5, shared with admin credit. Claims the milestone, then pays it. */
async function claimAndCredit(event, { userId, game, task, taskNumber, rewardSnapshot }) {
  const rewardKey = task.isRepeatable
    ? `${userId}:${task._id}:${event._id}`
    : `${userId}:${task._id}`;

  if (event.rewardKey !== rewardKey) {
    try {
      await DirectGameEvent.updateOne({ _id: event._id }, { $set: { rewardKey } });
    } catch (err) {
      if (err.code === 11000) return outcome('duplicate', 'already_rewarded', 'This milestone was already rewarded');
      throw err;
    }
  }

  const result = await creditGameTask({
    userId,
    game,
    task,
    eventId: event._id,
    rewardSnapshot,
    taskNumber,
    referenceId: `ADJUST-${event._id}`,
    source: 'adjust_direct_game',
    challengeKey: event.deliveryKey,
  });

  if (result.status === 'already_completed') {
    return outcome('duplicate', 'already_completed', 'Task was already completed by this user');
  }
  return outcome('credited', null, null, {
    creditedAt: new Date(),
    reward: {
      coins: result.coins,
      xp: result.xp,
      baseXP: result.baseXP,
      xpMultiplier: result.xpMultiplier,
      coinBoxAccumulated: result.coinBoxAccumulated,
      transactionId: result.transactionId,
    },
  });
}

async function evaluate(event) {
  const matched = await match(event);
  if (matched.stop) return matched.stop;

  const { game, task, userId } = matched;
  const rewardSnapshot = snapshotFor(event, task);
  const fields = { ...(matched.matchedFields || {}), userId, game: game._id, task: task._id, rewardSnapshot };
  const withFields = (o) => ({ ...o, fields: { ...fields, ...o.fields } });

  // Step 3
  if (game.directIntegration?.rewardsEnabled === false) {
    return withFields(outcome('review', 'rewards_disabled', 'Rewards are switched off for this game'));
  }
  const eventTime = event.eventTime || event.receivedAt;
  if (event.receivedAt - eventTime > config.DIRECT_GAMES_LATE_EVENT_DAYS * DAY_MS) {
    return withFields(outcome('review', 'late_event', `Received more than ${config.DIRECT_GAMES_LATE_EVENT_DAYS} days after the milestone`));
  }
  const user = await User.findById(userId).select('role profile tasks games xp vip taskProgression');
  if (!user) return withFields(outcome('review', 'user_not_found'));
  if (user.role === 'USER' && user.profile?.status && user.profile.status !== 'active') {
    return withFields(outcome('review', 'user_inactive', `Account is ${user.profile.status}`));
  }

  // Step 4
  const unlock = await getTaskUnlockState({ user, game, task });
  if (!unlock.unlocked) return withFields(outcome('held', 'task_locked', unlock.reason));

  // Step 5
  return withFields(await claimAndCredit(event, { userId, game, task, taskNumber: unlock.taskNumber, rewardSnapshot }));
}

/**
 * Runs one stored event through the pipeline.
 * @param {ObjectId|String} eventId
 * @param {Object} [opts]
 * @param {String[]} [opts.fromStatuses]  statuses this call may pick up
 * @param {Boolean} [opts.releaseHeld]    re-check the user's held events after a credit
 * @returns {Promise<Object|null>} the final event, or null if another worker owns it
 */
async function processEvent(eventId, { fromStatuses = ['received', 'failed'], releaseHeld = true } = {}) {
  const event = await claim(eventId, fromStatuses);
  if (!event) return null;

  try {
    const result = await evaluate(event);
    await finish(event._id, result);
    if (result.status === 'credited' && releaseHeld) {
      await releaseHeldEvents(result.fields.userId, result.fields.game);
    }
  } catch (err) {
    const attempts = (event.attempts || 0) + 1;
    console.error('[directGameProcessor] processing failed', { eventId: String(event._id), attempts, error: err.message });
    if (attempts >= MAX_ATTEMPTS) {
      await finish(event._id, outcome('review', 'processing_failed', err.message, { attempts, lastError: err.message }));
    } else {
      const backoffMinutes = Math.min(2 ** attempts, 60);
      await finish(event._id, outcome('failed', 'processing_error', err.message, {
        attempts,
        lastError: err.message,
        nextAttemptAt: new Date(Date.now() + backoffMinutes * 60 * 1000),
      }));
    }
  }
  return DirectGameEvent.findById(event._id).lean();
}

/**
 * Re-checks a user's held events for a game after they progress. Each credit
 * can unlock the next task, so passes repeat until one credits nothing.
 */
async function releaseHeldEvents(userId, gameId) {
  if (!userId || !gameId) return;
  const MAX_PASSES = 20;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const held = await DirectGameEvent.find({ status: 'held', userId, game: gameId })
      .sort({ eventTime: 1, createdAt: 1 })
      .select('_id')
      .lean();
    let credited = 0;
    for (const { _id } of held) {
      const result = await processEvent(_id, { fromStatuses: ['held'], releaseHeld: false });
      if (result?.status === 'credited') credited++;
    }
    if (!credited) return;
  }
}

/** Non-blocking hook for routes where a user's tasks can unlock. */
function releaseHeldEventsInBackground(userId, gameId) {
  setImmediate(() => {
    releaseHeldEvents(userId, gameId).catch((err) =>
      console.error('[directGameProcessor] releasing held events failed:', err.message)
    );
  });
}

/**
 * Admin credits an event from the review queue. Skips the automatic checks -
 * the admin's decision replaces them - but never the one-reward-per-milestone
 * guard.
 */
async function creditByAdmin(eventId, { adminId, userId, taskId, note }) {
  const event = await claim(eventId, ['review', 'held', 'failed']);
  if (!event) return { error: 'Event is not awaiting a decision' };

  try {
    const resolvedUserId = userId || event.userId;
    const task = await GameTask.findById(taskId || event.task);
    if (!resolvedUserId || !task) {
      await finish(event._id, outcome('review', event.reason, event.reasonDetail));
      return { error: 'A user and a task are required to credit this event' };
    }
    const [game, user] = await Promise.all([
      Game.findById(task.gameId),
      User.findById(resolvedUserId).select('tasks games xp vip taskProgression'),
    ]);
    if (!game || game.sdkProvider !== PROVIDER || !user) {
      await finish(event._id, outcome('review', event.reason, event.reasonDetail));
      return { error: 'User or client game not found' };
    }

    const rewardSnapshot = snapshotFor(event, task);
    const unlock = await getTaskUnlockState({ user, game, task });
    const result = await claimAndCredit(event, {
      userId: user._id, game, task, taskNumber: unlock.taskNumber, rewardSnapshot,
    });
    result.fields = {
      ...result.fields,
      userId: user._id,
      game: game._id,
      task: task._id,
      rewardSnapshot,
      matchMethod: userId && String(userId) !== String(event.userId) ? 'admin' : event.matchMethod,
      review: {
        decision: result.status === 'credited' ? 'credited' : null,
        decidedBy: adminId,
        decidedAt: new Date(),
        note,
      },
    };
    await finish(event._id, result);
    if (result.status === 'credited') releaseHeldEventsInBackground(user._id, game._id);
    return { event: await DirectGameEvent.findById(event._id).lean() };
  } catch (err) {
    await finish(event._id, outcome('review', 'processing_failed', err.message, { lastError: err.message }));
    throw err;
  }
}

async function rejectByAdmin(eventId, { adminId, note }) {
  const result = await DirectGameEvent.findOneAndUpdate(
    { _id: eventId, status: { $in: ['review', 'held', 'failed'] } },
    {
      $set: {
        status: 'rejected',
        reason: 'admin_rejected',
        lockedAt: null,
        review: { decision: 'rejected', decidedBy: adminId, decidedAt: new Date(), note },
      },
    },
    { new: true }
  ).lean();
  return result ? { event: result } : { error: 'Event is not awaiting a decision' };
}

/** Sends an event back through the full pipeline, e.g. after fixing game setup. */
async function retryEvent(eventId) {
  const reset = await DirectGameEvent.findOneAndUpdate(
    { _id: eventId, status: { $in: ['review', 'failed', 'held'] } },
    { $set: { status: 'received', reason: null, reasonDetail: null, attempts: 0, nextAttemptAt: null } },
    { new: true }
  );
  if (!reset) return { error: 'Only events in review, held or failed can be retried' };
  return { event: await processEvent(reset._id) };
}

/** Picks up anything missed: unprocessed, due for retry, stale, or held. */
async function sweep({ limit = 100 } = {}) {
  const now = Date.now();
  const due = await DirectGameEvent.find({
    $or: [
      { status: 'received', createdAt: { $lt: new Date(now - 30 * 1000) } },
      { status: 'failed', nextAttemptAt: { $lte: new Date(now) } },
      { status: 'processing', lockedAt: { $lt: new Date(now - STALE_LOCK_MS) } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select('_id')
    .lean();
  for (const { _id } of due) await processEvent(_id);

  // Oldest-checked first; each pass touches updatedAt, so the queue rotates
  const held = await DirectGameEvent.find({ status: 'held' }).sort({ updatedAt: 1 }).limit(limit).select('_id').lean();
  for (const { _id } of held) await processEvent(_id, { fromStatuses: ['held'] });

  return { processed: due.length, heldChecked: held.length };
}

function startDirectGameScheduler() {
  const cron = require('node-cron');
  let running = false;
  cron.schedule('* * * * *', async () => {
    if (running) return;
    running = true;
    try {
      await sweep();
    } catch (err) {
      console.error('[directGameProcessor] sweep failed:', err.message);
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });
}

module.exports = {
  PROVIDER,
  processEvent,
  releaseHeldEvents,
  releaseHeldEventsInBackground,
  creditByAdmin,
  rejectByAdmin,
  retryEvent,
  sweep,
  startDirectGameScheduler,
};

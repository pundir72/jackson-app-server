/**
 * Credits a completed game task to a user: coins (wallet or coin box), XP with
 * the tier multiplier, task completion, progression, ledger and daily-challenge
 * progress.
 *
 * Written for client games, whose milestones arrive as events, but takes no
 * provider-specific input so partner webhooks can move onto it later instead of
 * each carrying its own copy of this logic.
 *
 * Exactly-once: the balance change is a single atomic update that only matches
 * while the user has not yet recorded this event id, and records it in the same
 * write. A retry after a crash at any point therefore cannot pay twice; it only
 * repairs whatever bookkeeping (ledger, challenge) the crash interrupted.
 */

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const GameTask = require('../models/GameTask');
const { applyTierMultiplierToXP } = require('./xpTierMultiplier');
const { recordTaskCompletionForChallenge } = require('./challengeEventProgress');
const { findProgressionRule } = require('./taskUnlock');

/** Task N = Base XP x (Multiplier ^ (N-1)), as the game task routes compute it. */
function calculateStepwiseXP(taskNumber, baseXP, multiplier) {
  if (!taskNumber || taskNumber <= 1) return baseXP;
  return baseXP * Math.pow(multiplier, taskNumber - 1);
}

const readProgression = (user, key) => {
  const map = user?.taskProgression;
  if (!map) return null;
  return typeof map.get === 'function' ? map.get(key) : map[key];
};

async function ensureLedgerEntry({ referenceId, userId, game, task, amounts, source, eventId }) {
  const existing = await Transaction.findOne({ referenceId, user: userId }).select('_id').lean();
  if (existing) return existing._id;

  const isCoins = amounts.coins > 0 || amounts.rewardType === 'coins';
  const transaction = await Transaction.create({
    user: userId,
    type: 'credit',
    amount: isCoins ? amounts.coins : amounts.xp,
    balanceType: isCoins ? 'coins' : 'xp',
    description: `Game task completed - ${game.title} - ${task.name}`,
    status: 'completed',
    referenceId,
    gameId: game.gameId,
    game: game._id,
    metadata: {
      gameId: game.gameId,
      taskId: String(task._id),
      source,
      eventId: eventId ? String(eventId) : undefined,
      coins: amounts.coins,
      xp: amounts.xp,
      baseXP: amounts.baseXP,
      xpMultiplier: amounts.xpMultiplier,
      coinBoxAccumulated: amounts.coinBoxAccumulated,
    },
  });
  return transaction._id;
}

/**
 * @param {Object} params
 * @param {String|ObjectId} params.userId
 * @param {Object} params.game
 * @param {Object} params.task
 * @param {ObjectId} params.eventId        idempotency key; one credit per id, ever
 * @param {Object} params.rewardSnapshot   {rewardType, rewardValue} captured when the event arrived
 * @param {Number} [params.taskNumber]     1-based list position, for stepwise XP
 * @param {String} params.referenceId      ledger reference, stable per event
 * @param {String} params.source           ledger source tag
 * @param {String} [params.challengeKey]   dedupe key for daily-challenge counting
 * @returns {Promise<{status: 'credited'|'already_credited'|'already_completed', coins, xp, baseXP,
 *                    xpMultiplier, coinBoxAccumulated, transactionId}>}
 */
async function creditGameTask({
  userId,
  game,
  task,
  eventId,
  rewardSnapshot,
  taskNumber,
  referenceId,
  source,
  challengeKey,
}) {
  const user = await User.findById(userId).select('tasks games xp vip taskProgression wallet');
  if (!user) throw new Error(`User ${userId} not found`);

  const gameKey = String(game._id);
  const taskId = String(task._id);
  const rewardType = rewardSnapshot?.rewardType || task.rewardType;
  const rewardValue = Number(rewardSnapshot?.rewardValue ?? task.rewardValue) || 0;

  const firstCompletion = !(user.tasks || []).some((t) => t.taskId === taskId && t.completed);
  const rule = await findProgressionRule(user);

  // Rules added after a user started a game count their earlier completions,
  // the same initialisation the task routes do.
  if (rule && !readProgression(user, gameKey)) {
    const gameTaskIds = (
      await GameTask.find({ gameId: game._id, isActive: true }).select('_id').lean()
    ).map((t) => String(t._id));
    const alreadyDone = (user.tasks || []).filter(
      (t) => t.completed && gameTaskIds.includes(t.taskId)
    ).length;
    await User.updateOne(
      { _id: user._id, [`taskProgression.${gameKey}`]: { $exists: false } },
      {
        $set: {
          [`taskProgression.${gameKey}`]: {
            completedTasks: alreadyDone,
            thresholdReached: false,
            rewardTransferred: false,
            coinBoxBalance: 0,
            coinBoxTransferredAt: null,
          },
        },
      }
    );
  }
  const progression = readProgression(user, gameKey) || {};

  let coins = 0;
  let xp = 0;
  let baseXP;
  let xpMultiplier;
  let coinBoxAccumulated = false;

  if (rewardType === 'xp') {
    baseXP = rewardValue;
    if (game.xpRewardConfig?.baseXP > 0) {
      baseXP = calculateStepwiseXP(taskNumber, game.xpRewardConfig.baseXP, game.xpRewardConfig.multiplier || 1.0);
    }
    const { finalXP, multiplier } = await applyTierMultiplierToXP(user, baseXP);
    xp = finalXP;
    xpMultiplier = multiplier;
  } else if (rewardType === 'coins') {
    coins = rewardValue;
    // Coins wait in the coin box until the user has passed the threshold and
    // transferred once; after that they go straight to the wallet.
    coinBoxAccumulated = Boolean(rule) && !(progression.thresholdReached && progression.rewardTransferred);
  }

  const amounts = { rewardType, coins, xp, baseXP, xpMultiplier, coinBoxAccumulated };

  // Paid by an earlier attempt that crashed before finishing its bookkeeping:
  // repair the ledger and challenge, never the balance.
  const repair = async () => {
    const transactionId = await ensureLedgerEntry({ referenceId, userId: user._id, game, task, source, eventId, amounts });
    if (challengeKey) {
      await recordTaskCompletionForChallenge({ userId: user._id, task, game, transactionId: challengeKey });
    }
    return { status: 'already_credited', ...amounts, transactionId };
  };

  if (await User.exists({ _id: user._id, directGameEventIds: eventId })) return repair();
  if (!firstCompletion && !task.isRepeatable) return { status: 'already_completed' };

  const now = new Date();
  const filter = { _id: user._id, directGameEventIds: { $ne: eventId } };
  if (!task.isRepeatable) {
    filter.tasks = { $not: { $elemMatch: { taskId, completed: true } } };
  }

  const inc = {};
  const set = {};
  if (coins > 0 && coinBoxAccumulated) inc[`taskProgression.${gameKey}.coinBoxBalance`] = coins;
  if (coins > 0 && !coinBoxAccumulated) {
    inc['wallet.balance'] = coins;
    set['wallet.lastUpdated'] = now;
  }
  if (xp > 0) {
    inc['xp.current'] = xp;
    inc['xp.total'] = xp;
  }
  if (rule && firstCompletion) inc[`taskProgression.${gameKey}.completedTasks`] = 1;

  const push = { directGameEventIds: eventId };
  if (firstCompletion) {
    push.tasks = { taskId, type: 'normal', completed: true, xpReward: xp, date: now };
  }

  const update = { $push: push };
  if (Object.keys(inc).length) update.$inc = inc;
  if (Object.keys(set).length) update.$set = set;

  const result = await User.updateOne(filter, update);

  if (result.modifiedCount === 0) {
    // Lost a race: either a concurrent attempt paid this event, or another
    // event completed the task in between
    const recorded = await User.exists({ _id: user._id, directGameEventIds: eventId });
    return recorded ? repair() : { status: 'already_completed' };
  }

  if (rule && firstCompletion) {
    await User.updateOne(
      {
        _id: user._id,
        [`taskProgression.${gameKey}.completedTasks`]: { $gte: rule.firstBatchSize },
        [`taskProgression.${gameKey}.thresholdReached`]: { $ne: true },
      },
      { $set: { [`taskProgression.${gameKey}.thresholdReached`]: true } }
    );
  }

  const transactionId = await ensureLedgerEntry({ referenceId, userId: user._id, game, task, source, eventId, amounts });

  if (challengeKey) {
    // Never throws - challenge bookkeeping must not undo a credit
    await recordTaskCompletionForChallenge({ userId: user._id, task, game, transactionId: challengeKey });
  }

  return { status: 'credited', coins, xp, baseXP, xpMultiplier, coinBoxAccumulated, transactionId };
}

module.exports = { creditGameTask, calculateStepwiseXP };

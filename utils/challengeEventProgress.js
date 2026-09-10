/**
 * Records a completed provider goal against today's daily challenge.
 *
 * Both provider webhooks call this, so counting rules live in one place rather
 * than being duplicated per provider and drifting.
 *
 * Deliberately never throws: a webhook must still credit the user's game task
 * even if challenge progress cannot be recorded. Failures are logged and
 * swallowed.
 */

const DailyChallenge = require('../models/DailyChallenge');
const UserChallengeProgress = require('../models/UserChallengeProgress');
const { resolveObjective } = require('./challengeObjective');
const { taskMatchesObjective } = require('./taskClassification');

const startOfUtcDay = (date = new Date()) => {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

/**
 * @param {Object} params
 * @param {String} params.userId
 * @param {Object} params.task            the GameTask that was completed
 * @param {Object} params.game            the Game it belongs to
 * @param {String} params.transactionId   provider transaction/postback id, for dedupe
 * @returns {Promise<{counted: boolean, reason?: string, currentStep?: number, totalSteps?: number, completed?: boolean}>}
 */
async function recordTaskCompletionForChallenge({ userId, task, game, transactionId }) {
  try {
    if (!userId || !task) return { counted: false, reason: 'missing_input' };

    const dayStart = startOfUtcDay();
    const challenge = await DailyChallenge.findOne({
      challengeDate: dayStart,
      type: 'game',
      status: { $in: ['live', 'scheduled'] },
    });
    if (!challenge) return { counted: false, reason: 'no_challenge_today' };

    const { objective, target, gameScope, requiresProviderEvents } = resolveObjective(challenge);
    if (!requiresProviderEvents) {
      // playtime challenges are app-reported, not event-driven
      return { counted: false, reason: 'objective_not_event_driven' };
    }
    if (!target) return { counted: false, reason: 'no_target_configured' };

    // A 'specific' challenge only counts goals from its own game. 'any' counts
    // whatever the user is actually playing, which is the point of that scope.
    if (gameScope === 'specific') {
      const challengeGameId = String(
        challenge.assignedGame?.gameId || challenge.gameId || ''
      );
      const eventGameId = String(game?._id || game?.gameId || '');
      const matches =
        challengeGameId &&
        (challengeGameId === eventGameId || challengeGameId === String(game?.gameId || ''));
      if (!matches) return { counted: false, reason: 'different_game' };
    }

    // Inferred (keyword-guessed) classifications are excluded inside
    // taskMatchesObjective - a guess must never pay a reward.
    if (!taskMatchesObjective(task, objective)) {
      return { counted: false, reason: 'task_does_not_match_objective' };
    }

    const progress = await UserChallengeProgress.findOne({
      userId,
      challengeId: challenge._id,
    });
    if (!progress) return { counted: false, reason: 'challenge_not_started' };
    if (progress.status === 'completed') return { counted: false, reason: 'already_completed' };

    // Dedupe. Providers retry postbacks, and a retry must not advance progress.
    // Keyed on the provider transaction id where present, otherwise the task, so
    // a task without a transaction id still cannot be counted twice.
    const dedupeKey = transactionId ? `txn:${transactionId}` : `task:${task._id}`;
    progress.progress = progress.progress || {};
    const meta = progress.progress.metadata || {};
    const counted = Array.isArray(meta.countedEventKeys) ? meta.countedEventKeys : [];
    if (counted.includes(dedupeKey)) {
      return { counted: false, reason: 'duplicate_event' };
    }

    counted.push(dedupeKey);
    const currentStep = counted.length;

    progress.progress.metadata = { ...meta, countedEventKeys: counted };
    progress.progress.currentStep = currentStep;
    progress.progress.totalSteps = target;
    progress.progress.percentage = Math.min(100, Math.floor((currentStep / target) * 100));
    progress.markModified('progress.metadata');
    await progress.save();

    console.log('[challengeEventProgress] counted goal toward daily challenge', {
      userId: String(userId),
      challengeId: String(challenge._id),
      objective,
      taskId: String(task._id),
      currentStep,
      target,
    });

    return {
      counted: true,
      currentStep,
      totalSteps: target,
      completed: currentStep >= target,
    };
  } catch (error) {
    // Never let challenge bookkeeping break the webhook's primary job.
    console.error('[challengeEventProgress] failed to record challenge progress:', error.message);
    return { counted: false, reason: 'error' };
  }
}

module.exports = { recordTaskCompletionForChallenge, startOfUtcDay };

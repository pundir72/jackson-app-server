/**
 * Whether a game task is unlocked for a user, decided the way the player's task
 * list decides it (GET /api/game/:gameId/tasks in routes/game.js).
 *
 * Event-driven crediting (client games) needs the answer without a request in
 * hand: an event for a task the user still sees as locked is held, not paid.
 * Mirroring the list - rather than the self-report /complete endpoint, which
 * skips the check when no progression rule matches - keeps "held" meaning
 * exactly "shown to the user as locked".
 */

const GameTask = require('../models/GameTask');
const TaskProgressionRule = require('../models/TaskProgressionRule');
const WelcomeBonusTimer = require('../models/WelcomeBonusTimer');

/** Same profile the task routes build for progression rule matching. */
function buildProgressionProfile(user) {
  const gamesPlayed =
    user?.games?.filter(
      (g) => g.installedAt || g.status === 'installed' || (g.date && !g.completed)
    ).length || 0;

  let membershipTier = 'free';
  if (user?.vip?.tier) {
    membershipTier = user.vip.tier;
  } else if (user?.vip?.level && user.vip.level !== 'free') {
    membershipTier = user.vip.level;
  }

  return { xp: user?.xp?.current || 0, gamesPlayed, membershipTier };
}

/**
 * findBestMatchForUser reads with lean(), so the result has no instance
 * methods. Hydrating restores canUnlockTask without a second query.
 */
async function findProgressionRule(user) {
  const rule = await TaskProgressionRule.findBestMatchForUser(buildProgressionProfile(user));
  return rule ? TaskProgressionRule.hydrate(rule) : null;
}

const readProgression = (user, gameIdString) => {
  const map = user?.taskProgression;
  if (!map) return null;
  return typeof map.get === 'function' ? map.get(gameIdString) : map[gameIdString];
};

/**
 * Bonus tasks are listed separately, and only for the user's first N games.
 * Returns their ids when that applies to this game, otherwise [].
 */
async function getBonusTaskIds(user, gameIdString) {
  const bonusRule = await WelcomeBonusTimer.findOne({ isActive: true }).lean();
  const maxGames = bonusRule?.maxGamesWithBonusTasks || 3;

  const firstGames = [...(user?.games || [])]
    .sort(
      (a, b) =>
        new Date(a.installedAt || a.date || a.firstPlayed || 0) -
        new Date(b.installedAt || b.date || b.firstPlayed || 0)
    )
    .slice(0, maxGames)
    .map((g) => String(g.gameId));
  if (!firstGames.includes(gameIdString)) return [];

  const rule = await WelcomeBonusTimer.findOne({
    isActive: true,
    'gameBonusTasks.bonusTasks.0': { $exists: true },
    'gameBonusTasks.isEnabled': true,
  }).lean();
  const config = rule?.gameBonusTasks?.find((c) => c.isEnabled && c.bonusTasks?.length > 0);
  return config ? config.bonusTasks.map((bt) => String(bt.taskId)) : [];
}

/**
 * @param {Object} params
 * @param {Object} params.user  needs tasks, games, xp, vip, taskProgression
 * @param {Object} params.game
 * @param {Object} params.task
 * @param {Object} [params.progressionRule]  pass to skip the lookup; null means "no rule"
 * @returns {Promise<{unlocked: boolean, reason: string, taskNumber: number|null}>}
 *          taskNumber is the 1-based position in the player's list, for stepwise XP
 */
async function getTaskUnlockState({ user, game, task, progressionRule }) {
  const gameIdString = String(game._id);
  const taskIdString = String(task._id);
  const completedTaskIds = (user?.tasks || []).filter((t) => t.completed).map((t) => t.taskId);

  const bonusTaskIds = await getBonusTaskIds(user, gameIdString);
  if (bonusTaskIds.includes(taskIdString)) {
    // Bonus tasks unlock on their own timer, which no partner webhook enforces
    // either; they are never held.
    return { unlocked: true, reason: 'Bonus task', taskNumber: null };
  }

  const query = { gameId: game._id, isActive: true, isProviderSynced: { $ne: true } };
  if (bonusTaskIds.length) query._id = { $nin: bonusTaskIds };
  const tasks = await GameTask.find(query).sort({ order: 1, createdAt: 1 }).select('_id').lean();
  const index = tasks.findIndex((t) => String(t._id) === taskIdString);
  const taskNumber = index >= 0 ? index + 1 : null;

  if (completedTaskIds.includes(taskIdString)) {
    return { unlocked: true, reason: 'Completed', taskNumber };
  }
  if (index < 0) {
    // Not on the player's list (inactive or hidden) - nothing to be locked behind
    return { unlocked: true, reason: 'Not in task list', taskNumber };
  }

  const rule = progressionRule === undefined ? await findProgressionRule(user) : progressionRule;

  if (rule) {
    let progression = readProgression(user, gameIdString);
    if (!progression) {
      const gameTaskIds = (
        await GameTask.find({ gameId: game._id, isActive: true }).select('_id').lean()
      ).map((t) => String(t._id));
      progression = {
        completedTasks: completedTaskIds.filter((id) => gameTaskIds.includes(id)).length,
        rewardTransferred: false,
      };
    }
    const check = rule.canUnlockTask(
      progression.completedTasks || 0,
      taskNumber,
      progression.rewardTransferred || false
    );
    return { unlocked: Boolean(check.canUnlock), reason: check.reason || 'Unlocked', taskNumber };
  }

  if (index === 0) return { unlocked: true, reason: 'First task', taskNumber };
  const previousDone = completedTaskIds.includes(String(tasks[index - 1]._id));
  return previousDone
    ? { unlocked: true, reason: 'Unlocked', taskNumber }
    : { unlocked: false, reason: 'Complete previous task first', taskNumber };
}

module.exports = {
  buildProgressionProfile,
  findProgressionRule,
  getTaskUnlockState,
};

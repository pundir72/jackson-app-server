/**
 * Resolves what a daily challenge actually requires.
 *
 * Game challenges used to support one thing - play for N minutes, held in
 * requirements.timeLimit. They now carry an explicit objective, but challenges
 * created before that still exist, so every consumer must read them through
 * here rather than reaching for a field directly. Otherwise a legacy challenge
 * silently resolves to "no requirement" and completes for free.
 */

const OBJECTIVES = ['playtime', 'purchases', 'milestones', 'tasks'];

/**
 * @returns {{objective: string|null, target: number, gameScope: string,
 *            requiresProviderEvents: boolean, unit: string}}
 */
function resolveObjective(challenge = {}) {
  const req = challenge.requirements || {};
  const rawObjective = req.objective;

  // Legacy: no objective, but a timeLimit means it was a play-time challenge.
  const objective =
    rawObjective && OBJECTIVES.includes(rawObjective)
      ? rawObjective
      : req.timeLimit
        ? 'playtime'
        : null;

  const target =
    Number(req.target) > 0
      ? Number(req.target)
      : objective === 'playtime'
        ? Number(req.timeLimit) || 0
        : 0;

  return {
    objective,
    target,
    gameScope: req.gameScope === 'any' ? 'any' : 'specific',
    // Play time is reported by the app; the rest are counted from provider
    // goal completions arriving on webhooks.
    requiresProviderEvents: objective === 'purchases' || objective === 'milestones' || objective === 'tasks',
    unit: objective === 'playtime' ? 'minutes' : objective || '',
  };
}

/**
 * Human-readable requirement, used in API responses and error messages so the
 * apps and the user see the same wording.
 */
function describeObjective(challenge = {}) {
  const { objective, target } = resolveObjective(challenge);
  if (!objective || !target) return null;

  switch (objective) {
    case 'playtime':
      return `Play for ${target} minute${target === 1 ? '' : 's'}`;
    case 'purchases':
      return `Make ${target} purchase${target === 1 ? '' : 's'}`;
    case 'milestones':
      return `Complete ${target} milestone${target === 1 ? '' : 's'}`;
    case 'tasks':
      return `Complete ${target} task${target === 1 ? '' : 's'}`;
    default:
      return null;
  }
}

module.exports = { OBJECTIVES, resolveObjective, describeObjective };

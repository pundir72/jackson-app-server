/**
 * Classifies provider game tasks so daily challenges can count them.
 *
 * Daily challenges need to ask "has the user made 2 purchases" or "completed 3
 * milestones". Providers deliver goal completions, but only one of them says
 * what kind of action a goal represents:
 *
 *   BitLabs  events[].type_id  - a semantic type, usable directly
 *   Besitos  goal_type/section - only ever "linear"/"non-linear"; describes
 *                               sequencing and UI grouping, NOT what the goal is
 *
 * So BitLabs classifies itself, and Besitos needs a human. Keyword matching on
 * the goal text produces a *suggestion* only - never something that can pay a
 * reward on its own.
 */

const EVENT_TYPES = ['install', 'purchase', 'milestone', 'playtime'];

const CLASSIFICATION_SOURCES = ['provider', 'admin', 'inferred'];

/**
 * BitLabs type_id -> our event types.
 *
 * 1, 3, 11 and 13 map cleanly onto provider semantics (install, purchase,
 * ordered-level event, any-purchase).
 *
 * 2 and 15 are documented by BitLabs as generic EVENT and BONUS_EVENT - they do
 * NOT officially mean "milestone". Mapping them to milestone is a Jackson
 * decision that fits the current catalogue, where every such event is an
 * in-game achievement ("Complete the Tutorial", "Complete any level",
 * "*Bonus Reward: Unlock 20 Characters"). If a future BitLabs game uses a
 * generic event for something else, this mapping is where it will be wrong.
 */
const BITLABS_TYPE_MAP = {
  1: ['install'],
  2: ['milestone'], // generic EVENT - Jackson mapping, not provider semantics
  3: ['purchase'],
  11: ['milestone'], // ORDERED_LEVEL_EVENT
  13: ['purchase'], // ANY_PURCHASE
  15: ['milestone'], // generic BONUS_EVENT - Jackson mapping
};

// Applied to Besitos goal text only, to prefill the admin UI. Deliberately
// narrow: a false positive here would suggest paying a reward for the wrong
// action, so anything uncertain is left unclassified for a human to decide.
const KEYWORD_RULES = [
  { type: 'purchase', pattern: /\b(purchase|purchases|buy|bought|deposit|spend|iap|in-app)\b/i },
  { type: 'install', pattern: /\b(install|installed|download|downloaded)\b/i },
  { type: 'milestone', pattern: /\b(reach|complete|completed|unlock|level|stage|area|village|tutorial|win|achieve)\b/i },
];

const normalizeExternalTaskId = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};

/**
 * Classifies a BitLabs event from its type_id.
 * Unknown ids return no types rather than a guess - new type ids appear as
 * BitLabs adds them, and guessing would silently pay rewards for the wrong
 * action.
 */
function classifyBitLabsEvent(event = {}) {
  const typeId = Number(event.type_id);
  const mapped = Number.isFinite(typeId) ? BITLABS_TYPE_MAP[typeId] : undefined;

  if (!mapped) {
    if (Number.isFinite(typeId)) {
      console.warn(
        `[taskClassification] Unknown BitLabs type_id ${typeId} for "${event.name || ''}" - leaving unclassified`
      );
    }
    return {
      externalTaskId: normalizeExternalTaskId(event.id),
      providerTypeId: Number.isFinite(typeId) ? typeId : null,
      eventTypes: [],
      classificationSource: 'provider',
    };
  }

  return {
    externalTaskId: normalizeExternalTaskId(event.id),
    providerTypeId: typeId,
    eventTypes: [...mapped],
    classificationSource: 'provider',
  };
}

/**
 * Suggests types for a Besitos goal from its text.
 *
 * Always 'inferred'. Callers must not let inferred classifications satisfy a
 * challenge - a keyword guess should never pay out. "Deposit $10 + Win 15 Cash
 * Games" is exactly the string that makes this dangerous: it is a purchase AND
 * a milestone, and a single keyword would get it wrong either way.
 */
function classifyBesitosGoal(goal = {}) {
  const text = String(goal.text || goal.name || '').trim();
  const eventTypes = KEYWORD_RULES.filter((r) => r.pattern.test(text)).map((r) => r.type);

  return {
    externalTaskId: normalizeExternalTaskId(goal.goal_id),
    providerTypeId: null,
    // Deduplicated, order follows KEYWORD_RULES so results are stable
    eventTypes: [...new Set(eventTypes)],
    classificationSource: 'inferred',
  };
}

/**
 * Classifies one provider item, dispatching on provider name.
 * Returns null when the provider is unrecognised.
 */
function classifyProviderTask(provider, item) {
  const name = String(provider || '').trim().toLowerCase();
  if (name === 'bitlabs') return classifyBitLabsEvent(item);
  if (name === 'besitos') return classifyBesitosGoal(item);
  return null;
}

/**
 * Merges a fresh provider classification onto an existing task.
 *
 * An admin classification always wins and is never overwritten by a provider
 * refresh - otherwise the next sync would silently discard the human decision
 * that made a Besitos goal usable in the first place.
 */
function mergeClassification(existing, incoming) {
  if (!incoming) return existing || null;
  if (existing && existing.classificationSource === 'admin') {
    return {
      ...existing,
      // still refresh identity fields, they are facts rather than judgements
      externalTaskId: incoming.externalTaskId || existing.externalTaskId,
      providerTypeId:
        incoming.providerTypeId !== null && incoming.providerTypeId !== undefined
          ? incoming.providerTypeId
          : existing.providerTypeId,
    };
  }
  return incoming;
}

/**
 * Whether a task may count toward a purchase/milestone challenge objective.
 *
 * Inferred classifications are excluded on purpose: they are keyword guesses
 * shown to an admin for confirmation, not evidence a user did something.
 */
function isClassificationTrusted(task = {}) {
  return (
    task.classificationSource === 'provider' ||
    task.classificationSource === 'admin'
  );
}

/**
 * Whether a task satisfies a given objective.
 * `tasks` accepts any completed task regardless of classification, since it
 * only asks "did the user finish something".
 */
function taskMatchesObjective(task = {}, objective) {
  if (objective === 'tasks') return true;
  if (objective !== 'purchases' && objective !== 'milestones') return false;
  if (!isClassificationTrusted(task)) return false;

  const wanted = objective === 'purchases' ? 'purchase' : 'milestone';
  return Array.isArray(task.eventTypes) && task.eventTypes.includes(wanted);
}

module.exports = {
  EVENT_TYPES,
  CLASSIFICATION_SOURCES,
  BITLABS_TYPE_MAP,
  normalizeExternalTaskId,
  classifyBitLabsEvent,
  classifyBesitosGoal,
  classifyProviderTask,
  mergeClassification,
  isClassificationTrusted,
  taskMatchesObjective,
};

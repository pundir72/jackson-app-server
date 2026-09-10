/**
 * Mirrors a game's provider goals into GameTask records so daily challenges can
 * count them.
 *
 * Challenges count completed provider goals, and a webhook identifies a goal by
 * its provider id. Without a GameTask carrying that id there is nothing to match
 * and nothing to classify, so purchase and milestone challenges cannot work at
 * all for a game whose goals were never imported.
 *
 * Synced tasks are marked `isProviderSynced` and are HIDDEN by default
 * everywhere a task list is shown - the player-facing game task list, and the
 * admin pickers. A game can have 20+ provider goals against a handful of
 * curated tasks, so surfacing them unasked would swamp both. They are visible
 * only in the classification editor, which exists to work through them.
 */

const GameTask = require('../models/GameTask');
const {
  classifyProviderTask,
  mergeClassification,
} = require('./taskClassification');

// Provider payloads are stored under besitosRawData for BOTH providers - the
// field name is a misnomer, BitLabs games keep their events there too.
const providerItems = (game) => {
  const raw = game?.besitosRawData || {};
  const provider = String(game?.sdkProvider || '').toLowerCase();
  if (provider === 'bitlabs') return { provider, items: raw.events || [] };
  if (provider === 'besitos') return { provider, items: raw.goals || [] };
  return { provider, items: [] };
};

// BitLabs names its events, Besitos calls the field text.
const itemText = (item) => String(item?.name || item?.text || '').trim();
const itemId = (item) => {
  const id = item?.id ?? item?.goal_id;
  return id === undefined || id === null ? null : String(id).trim();
};

/**
 * Upserts one GameTask per provider goal.
 *
 * Existing tasks are matched by provider id first, falling back to name so a
 * hand-created task adopts its provider id rather than being duplicated
 * alongside an identical synced one.
 *
 * Never throws - a provider sync failure must not fail the game save that
 * triggered it.
 *
 * @param {Object} game
 * @param {ObjectId|String} createdBy - admin performing the import; GameTask.createdBy
 *   is required, so without it every create would fail validation
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
async function syncProviderTasksForGame(game, createdBy) {
  const result = { created: 0, updated: 0, skipped: 0 };
  try {
    if (!game || !game._id || !createdBy) return result;

    const { provider, items } = providerItems(game);
    if (!items.length) return result;

    const existing = await GameTask.find({ gameId: game._id });
    const byExternalId = new Map(
      existing.filter((t) => t.externalTaskId).map((t) => [String(t.externalTaskId), t])
    );
    const byName = new Map(
      existing.map((t) => [String(t.name || '').trim().toLowerCase(), t])
    );

    let order = existing.length;

    for (const item of items) {
      const externalId = itemId(item);
      const text = itemText(item);
      if (!externalId || !text) {
        result.skipped++;
        continue;
      }

      const incoming = classifyProviderTask(provider, item);
      if (!incoming) {
        result.skipped++;
        continue;
      }

      const match =
        byExternalId.get(externalId) || byName.get(text.toLowerCase()) || null;

      if (match) {
        // mergeClassification protects an admin's decision from being
        // overwritten by a later provider refresh.
        const merged = mergeClassification(match.toObject(), incoming);
        match.externalTaskId = merged.externalTaskId;
        match.providerTypeId = merged.providerTypeId;
        match.eventTypes = merged.eventTypes;
        match.classificationSource = merged.classificationSource;
        await match.save();
        result.updated++;
        continue;
      }

      await GameTask.create({
        gameId: game._id,
        name: text,
        description: text,
        completionRule: 'provider',
        rewardType: 'coins',
        rewardValue: 0,
        order: ++order,
        isActive: true,
        isProviderSynced: true,
        externalTaskId: incoming.externalTaskId,
        providerTypeId: incoming.providerTypeId,
        eventTypes: incoming.eventTypes,
        classificationSource: incoming.classificationSource,
        createdBy,
      });
      result.created++;
    }

    if (result.created || result.updated) {
      console.log(
        `[syncProviderTasks] ${game.title || game._id}: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`
      );
    }
    return result;
  } catch (error) {
    console.error('[syncProviderTasks] sync failed:', error.message);
    return result;
  }
}

module.exports = { syncProviderTasksForGame };

/**
 * Populates GameTask classification from stored provider payloads.
 *
 * Existing GameTasks were created by hand and carry no provider task id, so
 * webhooks cannot match them and daily challenges cannot count them. This walks
 * every game's stored provider payload, matches it to existing tasks, and fills
 * in externalTaskId / providerTypeId / eventTypes / classificationSource.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless --write is passed.
 *
 *   node scripts/backfill-task-classification.js            # report only
 *   node scripts/backfill-task-classification.js --write    # apply
 *
 * Admin classifications are never overwritten - see mergeClassification.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/config');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const {
  classifyProviderTask,
  mergeClassification,
} = require('../utils/taskClassification');

const WRITE = process.argv.includes('--write');

// Provider payloads are stored under besitosRawData for BOTH providers - the
// field name is a misnomer, BitLabs games keep their events there too.
const providerItems = (game) => {
  const raw = game.besitosRawData || {};
  const provider = String(game.sdkProvider || '').toLowerCase();
  if (provider === 'bitlabs') return { provider: 'bitlabs', items: raw.events || [] };
  if (provider === 'besitos') return { provider: 'besitos', items: raw.goals || [] };
  return { provider, items: [] };
};

// Provider text differs: BitLabs uses `name`, Besitos uses `text`.
const itemText = (item) => String(item.name || item.text || '').trim();

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  await mongoose.connect(config.MONGODB_URI || process.env.MONGODB_URI);
  console.log(WRITE ? '*** WRITE MODE ***' : 'dry run - no changes will be written');

  const games = await Game.find({}).lean();
  const summary = { games: 0, tasks: 0, matched: 0, unmatched: 0, skippedAdmin: 0, unclassified: 0 };
  const plan = [];

  for (const game of games) {
    const { provider, items } = providerItems(game);
    if (!items.length) continue;
    summary.games++;

    const tasks = await GameTask.find({ gameId: game._id });
    if (!tasks.length) continue;

    // Match a task to its provider item by name/text. Provider ids were never
    // stored, so text is the only link available for the initial backfill.
    for (const task of tasks) {
      summary.tasks++;
      const item = items.find((i) => norm(itemText(i)) === norm(task.name));

      if (!item) {
        summary.unmatched++;
        plan.push({ game: game.title, task: task.name, action: 'NO PROVIDER MATCH' });
        continue;
      }

      const incoming = classifyProviderTask(provider, item);
      if (!incoming) continue;

      if (task.classificationSource === 'admin') {
        summary.skippedAdmin++;
        plan.push({ game: game.title, task: task.name, action: 'skipped (admin classified)' });
        continue;
      }

      const merged = mergeClassification(task.toObject(), incoming);
      if (!merged.eventTypes.length) summary.unclassified++;
      summary.matched++;

      plan.push({
        game: game.title,
        task: task.name.slice(0, 46),
        action: `${merged.classificationSource} -> [${merged.eventTypes.join(', ') || 'unclassified'}] id=${merged.externalTaskId}`,
      });

      if (WRITE) {
        task.externalTaskId = merged.externalTaskId;
        task.providerTypeId = merged.providerTypeId;
        task.eventTypes = merged.eventTypes;
        task.classificationSource = merged.classificationSource;
        await task.save();
      }
    }
  }

  console.log('\n--- plan ---');
  for (const p of plan) {
    console.log(`  [${String(p.game).slice(0, 22).padEnd(22)}] ${p.task.padEnd(48)} ${p.action}`);
  }
  console.log('\n--- summary ---');
  console.log(' ', JSON.stringify(summary, null, 1).replace(/\n\s*/g, ' '));
  if (!WRITE) console.log('\nRe-run with --write to apply.');

  await mongoose.disconnect();
})().catch((e) => {
  console.error('backfill failed:', e.message);
  process.exit(1);
});

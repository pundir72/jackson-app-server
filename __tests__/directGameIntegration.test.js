/**
 * Client games (Adjust) - event handling end to end against a real MongoDB:
 * valid, duplicate, late, unmatched, locked and simultaneous events, plus the
 * kill switch and admin review.
 */

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.ADJUST_DIRECT_CALLBACK_SECRET = 'test-callback-secret';
process.env.DIRECT_GAMES_LATE_EVENT_DAYS = '30';

// The game routes pull in the shared Redis client, which retries forever
// without a server and keeps Jest from exiting
jest.mock('../utils/redisClient', () => ({ client: null, isReady: false }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const config = require('../config/config');
const User = require('../models/User');
const Game = require('../models/Game');
const GameTask = require('../models/GameTask');
const Transaction = require('../models/Transaction');
const DirectGameEvent = require('../models/DirectGameEvent');
const GameLaunchTicket = require('../models/GameLaunchTicket');
const TaskProgressionRule = require('../models/TaskProgressionRule');
const { processEvent, creditByAdmin, sweep } = require('../utils/directGameProcessor');

jest.setTimeout(60000);

const APP_TOKEN = 'clientapp001';
const SECRET = process.env.ADJUST_DIRECT_CALLBACK_SECRET;

let mongo;
let app;
let admin;
let player;
let game;
let taskOne; // coins, first in order
let taskTwo; // xp, unlocks after taskOne
let seq = 0;

const tokenFor = (user) => jwt.sign({ userId: user._id }, config.JWT_SECRET);

const makeUser = (overrides = {}) => {
  seq += 1;
  return User.create({
    firstName: 'Test',
    lastName: `User${seq}`,
    email: `user${seq}@example.com`,
    mobile: `55500000${String(seq).padStart(2, '0')}`,
    username: `user${seq}`,
    password: 'password123',
    ...overrides,
  });
};

const nowSeconds = (offsetMs = 0) => String(Math.floor((Date.now() + offsetMs) / 1000));

/** Sends a callback the way Adjust would and waits for it to finish processing. */
async function sendCallback(params) {
  const res = await request(app)
    .get('/api/direct-games/adjust/callback')
    .query({ token: SECRET, app_token: APP_TOKEN, activity_kind: 'event', ...params });
  if (res.body.id) await waitForProcessed(res.body.id);
  return res;
}

async function waitForStatus(id, done) {
  for (let i = 0; i < 100; i++) {
    const event = await DirectGameEvent.findById(id).lean();
    if (event && done(event.status)) return event;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Event ${id} did not reach the expected status`);
}

const waitForProcessed = (id) => waitForStatus(id, (s) => !['received', 'processing'].includes(s));

async function launch(user, body = {}) {
  const res = await request(app)
    .post(`/api/direct-games/${game._id}/launch`)
    .set('Authorization', `Bearer ${tokenFor(user)}`)
    .send(body);
  expect(res.status).toBe(200);
  return new URL(res.body.data.launchUrl).searchParams.get('label');
}

const balanceOf = async (user) => (await User.findById(user._id).lean()).wallet.balance;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // The unique indexes are what makes duplicates safe, so they must exist
  // before any test runs. (Not syncIndexes() - an unrelated model declares a
  // conflicting index.)
  await Promise.all([User, Game, GameTask, Transaction, DirectGameEvent, GameLaunchTicket].map((m) => m.init()));

  app = express();
  app.use(express.json());
  app.use('/api/direct-games', require('../routes/direct-games'));
  app.use('/api/admin/direct-games', require('../routes/admin-direct-games'));
  app.use('/api/game', require('../routes/game'));

  admin = await makeUser({ role: 'ADMIN' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Game.deleteMany({}),
    GameTask.deleteMany({}),
    DirectGameEvent.deleteMany({}),
    GameLaunchTicket.deleteMany({}),
    Transaction.deleteMany({}),
    TaskProgressionRule.deleteMany({}),
  ]);
  player = await makeUser();
  game = await Game.create({
    gameId: 'client-game-1',
    title: 'Client Puzzle',
    description: 'A client game',
    sdkProvider: 'adjust',
    xptrRules: 'none',
    createdBy: admin._id,
    metadata: { packageName: 'com.client.puzzle' },
    directIntegration: { adjustAppToken: APP_TOKEN, trackerUrl: 'https://app.adjust.com/abc123' },
  });
  taskOne = await GameTask.create({
    gameId: game._id, name: 'Reach level 5', completionRule: 'adjust', rewardType: 'coins',
    rewardValue: 100, externalTaskId: 'ev_level5', order: 1, createdBy: admin._id,
  });
  taskTwo = await GameTask.create({
    gameId: game._id, name: 'Reach level 10', completionRule: 'adjust', rewardType: 'xp',
    rewardValue: 50, externalTaskId: 'ev_level10', order: 2, createdBy: admin._id,
  });
});

describe('valid events', () => {
  test('a ticketed milestone credits the wallet, ledger and task list', async () => {
    const label = await launch(player);
    const res = await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });

    expect(res.status).toBe(200);
    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event.status).toBe('credited');
    expect(event.matchMethod).toBe('ticket');
    expect(String(event.userId)).toBe(String(player._id));
    expect(event.reward.coins).toBe(100);

    const user = await User.findById(player._id).lean();
    expect(user.wallet.balance).toBe(100);
    expect(user.tasks.find((t) => t.taskId === String(taskOne._id))?.completed).toBe(true);
    expect(user.games.some((g) => g.gameId === String(game._id))).toBe(true);

    const txn = await Transaction.findOne({ referenceId: `ADJUST-${event._id}` }).lean();
    expect(txn).toMatchObject({ amount: 100, balanceType: 'coins', status: 'completed' });

    const ticket = await GameLaunchTicket.findOne({ ticket: label }).lean();
    expect(ticket.boundAdid).toBe('adid-1');
  });

  test('later events from the same device match without the label', async () => {
    const label = await launch(player);
    await sendCallback({ activity_kind: 'install', label, adid: 'adid-2', created_at: nowSeconds() });
    const res = await sendCallback({ event_token: 'ev_level5', adid: 'adid-2', created_at: nowSeconds(1000) });

    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event.status).toBe('credited');
    expect(event.matchMethod).toBe('adjust_device');
  });

  test('installs bind the ticket but pay nothing', async () => {
    const label = await launch(player);
    const res = await sendCallback({ activity_kind: 'install', label, adid: 'adid-3', created_at: nowSeconds() });

    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event.status).toBe('ignored');
    expect(await balanceOf(player)).toBe(0);
    expect((await GameLaunchTicket.findOne({ ticket: label }).lean()).boundAdid).toBe('adid-3');
  });
});

describe('duplicate events', () => {
  test('a retried delivery is dropped at the door', async () => {
    const label = await launch(player);
    const params = { event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() };
    await sendCallback(params);
    const retry = await sendCallback(params);

    expect(retry.status).toBe(200);
    expect(retry.body.duplicate).toBe(true);
    expect(await DirectGameEvent.countDocuments()).toBe(1);
    expect(await balanceOf(player)).toBe(100);
  });

  test('the same milestone reported again pays only once', async () => {
    const label = await launch(player);
    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });
    const again = await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds(5000) });

    const event = await DirectGameEvent.findById(again.body.id).lean();
    expect(event.status).toBe('duplicate');
    expect(await balanceOf(player)).toBe(100);
    expect(await Transaction.countDocuments()).toBe(1);
  });

  test('a repeatable task pays every time', async () => {
    await GameTask.updateOne({ _id: taskOne._id }, { isRepeatable: true });
    const label = await launch(player);
    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });
    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds(5000) });

    expect(await balanceOf(player)).toBe(200);
    const user = await User.findById(player._id).lean();
    expect(user.tasks.filter((t) => t.taskId === String(taskOne._id))).toHaveLength(1);
  });
});

describe('late, unmatched and rejected events', () => {
  test('an event older than the window goes to review', async () => {
    const label = await launch(player);
    const fortyDaysAgo = -40 * 24 * 60 * 60 * 1000;
    const res = await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds(fortyDaysAgo) });

    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event).toMatchObject({ status: 'review', reason: 'late_event' });
    expect(await balanceOf(player)).toBe(0);
  });

  test('an event from an unknown device goes to review', async () => {
    const res = await sendCallback({ event_token: 'ev_level5', adid: 'stranger', created_at: nowSeconds() });
    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event).toMatchObject({ status: 'review', reason: 'unmatched_user' });
  });

  test('an unmapped Adjust event goes to review with the user attached', async () => {
    const label = await launch(player);
    const res = await sendCallback({ event_token: 'ev_unknown', label, adid: 'adid-1', created_at: nowSeconds() });
    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event).toMatchObject({ status: 'review', reason: 'unknown_event' });
    expect(String(event.userId)).toBe(String(player._id));
  });

  test('a ticket reused on another device goes to review', async () => {
    const label = await launch(player);
    await sendCallback({ activity_kind: 'install', label, adid: 'adid-1', created_at: nowSeconds() });
    const res = await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-other', created_at: nowSeconds(1000) });
    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event).toMatchObject({ status: 'review', reason: 'ticket_device_mismatch' });
  });

  test('an advertising-id-only match is queued for review by default', async () => {
    await launch(player, { advertisingId: '38400000-8cf0-11bd-b23e-10b96e40000d' });
    const res = await sendCallback({
      event_token: 'ev_level5', adid: 'adid-9', gps_adid: '38400000-8CF0-11BD-B23E-10B96E40000D', created_at: nowSeconds(),
    });
    const event = await DirectGameEvent.findById(res.body.id).lean();
    expect(event).toMatchObject({ status: 'review', reason: 'device_match_needs_review' });
    expect(await balanceOf(player)).toBe(0);
  });

  test('a callback without the secret is refused and not stored', async () => {
    const res = await request(app).get('/api/direct-games/adjust/callback').query({ token: 'wrong', app_token: APP_TOKEN });
    expect(res.status).toBe(401);

    const saved = config.ADJUST_DIRECT_CALLBACK_SECRET;
    config.ADJUST_DIRECT_CALLBACK_SECRET = undefined;
    const unset = await request(app).get('/api/direct-games/adjust/callback').query({ token: SECRET });
    config.ADJUST_DIRECT_CALLBACK_SECRET = saved;
    expect(unset.status).toBe(503);

    expect(await DirectGameEvent.countDocuments()).toBe(0);
  });
});

describe('locked tasks', () => {
  test('a milestone for a locked task is held, then credited when it unlocks', async () => {
    const label = await launch(player);
    const early = await sendCallback({ event_token: 'ev_level10', label, adid: 'adid-1', created_at: nowSeconds() });
    expect((await DirectGameEvent.findById(early.body.id).lean()).status).toBe('held');
    expect((await User.findById(player._id).lean()).xp.current).toBe(0);

    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds(1000) });

    // Released right after the unlocking credit, in the same background run
    const released = await waitForStatus(early.body.id, (s) => s === 'credited');
    expect(released.status).toBe('credited');
    const user = await User.findById(player._id).lean();
    expect(user.wallet.balance).toBe(100);
    expect(user.xp.current).toBe(50);
  });

  test('with a progression rule, coins wait in the coin box', async () => {
    await TaskProgressionRule.create({
      ruleName: 'everyone', userMilestones: ['returning_user'], firstBatchSize: 2, createdBy: admin._id,
    });
    const label = await launch(player); // launch records the game, so the user is "returning"
    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });

    const user = await User.findById(player._id).lean();
    expect(user.wallet.balance).toBe(0);
    expect(user.taskProgression[String(game._id)]).toMatchObject({ coinBoxBalance: 100, completedTasks: 1 });
  });
});

describe('simultaneous events', () => {
  test('the same milestone arriving five times at once pays once', async () => {
    const label = await launch(player);
    const ids = [];
    for (let i = 0; i < 5; i++) {
      const event = await DirectGameEvent.create({
        deliveryKey: `concurrent-${i}`, activityKind: 'event', adjustAppToken: APP_TOKEN,
        eventToken: 'ev_level5', label, adid: 'adid-1', eventTime: new Date(), receivedAt: new Date(),
      });
      ids.push(event._id);
    }
    await Promise.all(ids.map((id) => processEvent(id)));

    const statuses = (await DirectGameEvent.find({ _id: { $in: ids } }).lean()).map((e) => e.status);
    expect(statuses.filter((s) => s === 'credited')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'duplicate')).toHaveLength(4);
    expect(await balanceOf(player)).toBe(100);
    expect(await Transaction.countDocuments()).toBe(1);
  });

  test('one event processed by several workers at once pays once', async () => {
    const label = await launch(player);
    const event = await DirectGameEvent.create({
      deliveryKey: 'one-event', activityKind: 'event', adjustAppToken: APP_TOKEN,
      eventToken: 'ev_level5', label, adid: 'adid-1', eventTime: new Date(), receivedAt: new Date(),
    });
    await Promise.all([processEvent(event._id), processEvent(event._id), processEvent(event._id)]);

    expect((await DirectGameEvent.findById(event._id).lean()).status).toBe('credited');
    expect(await balanceOf(player)).toBe(100);
  });

  test('two different milestones at once both pay, the locked one via the sweeper', async () => {
    const label = await launch(player);
    const make = (key, token) => DirectGameEvent.create({
      deliveryKey: key, activityKind: 'event', adjustAppToken: APP_TOKEN,
      eventToken: token, label, adid: 'adid-1', eventTime: new Date(), receivedAt: new Date(),
    });
    const [a, b] = await Promise.all([make('a', 'ev_level5'), make('b', 'ev_level10')]);
    await Promise.all([processEvent(a._id), processEvent(b._id)]);
    await sweep();

    const user = await User.findById(player._id).lean();
    expect(user.wallet.balance).toBe(100);
    expect(user.xp.current).toBe(50);
  });

  test('a crash after paying is repaired on retry without paying again', async () => {
    const label = await launch(player);
    const event = await DirectGameEvent.create({
      deliveryKey: 'crashy', activityKind: 'event', adjustAppToken: APP_TOKEN,
      eventToken: 'ev_level5', label, adid: 'adid-1', eventTime: new Date(), receivedAt: new Date(),
    });
    await processEvent(event._id);
    // Simulate a crash that lost the ledger entry and the final status
    await Transaction.deleteMany({});
    await DirectGameEvent.updateOne({ _id: event._id }, { status: 'failed', nextAttemptAt: new Date(0) });

    await processEvent(event._id);

    expect(await balanceOf(player)).toBe(100);
    expect(await Transaction.countDocuments({ referenceId: `ADJUST-${event._id}` })).toBe(1);
  });
});

describe('kill switch and admin review', () => {
  test('events while rewards are off are queued, and an admin can credit them', async () => {
    const off = await request(app)
      .patch(`/api/admin/direct-games/games/${game._id}/rewards`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ enabled: false });
    expect(off.status).toBe(200);

    const label = await launch(player);
    const res = await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });
    const queued = await DirectGameEvent.findById(res.body.id).lean();
    expect(queued).toMatchObject({ status: 'review', reason: 'rewards_disabled' });
    expect(await balanceOf(player)).toBe(0);

    const credit = await request(app)
      .post(`/api/admin/direct-games/events/${queued._id}/credit`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ note: 'approved' });
    expect(credit.status).toBe(200);
    expect(credit.body.data.status).toBe('credited');
    expect(await balanceOf(player)).toBe(100);
  });

  test('an admin can assign an unmatched event to a user, once', async () => {
    const res = await sendCallback({ event_token: 'ev_level5', adid: 'stranger', created_at: nowSeconds() });
    const first = await creditByAdmin(res.body.id, { adminId: admin._id, userId: player._id, note: 'support ticket' });
    expect(first.event).toMatchObject({ status: 'credited', matchMethod: 'admin' });

    const again = await creditByAdmin(res.body.id, { adminId: admin._id, userId: player._id });
    expect(again.error).toBeDefined();
    expect(await balanceOf(player)).toBe(100);
  });

  test('admin endpoints require an admin', async () => {
    const res = await request(app)
      .get('/api/admin/direct-games/events')
      .set('Authorization', `Bearer ${tokenFor(player)}`);
    expect(res.status).toBe(403);
  });

  test('Adjust setup saves for a game created by the admin form', async () => {
    // The shared game form sends an empty xptrRules, which a full-document
    // save would reject
    await Game.collection.updateOne({ _id: game._id }, { $set: { xptrRules: '' } });

    const res = await request(app)
      .put(`/api/admin/direct-games/games/${game._id}/config`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({
        adjustAppToken: APP_TOKEN,
        trackerUrl: 'https://app.adjust.com/newtracker',
        storeUrl: 'https://play.google.com/store/apps/details?id=com.client.puzzle',
      });
    expect(res.status).toBe(200);

    const saved = await Game.findById(game._id).lean();
    expect(saved.directIntegration.trackerUrl).toBe('https://app.adjust.com/newtracker');
    expect(saved.gameDetails.downloadUrl).toBe('https://play.google.com/store/apps/details?id=com.client.puzzle');
  });

  test('the setup check reports a task without an Adjust event', async () => {
    await GameTask.create({
      gameId: game._id, name: 'Unmapped', completionRule: 'adjust', rewardType: 'coins',
      rewardValue: 10, order: 3, createdBy: admin._id,
    });
    const res = await request(app)
      .get(`/api/admin/direct-games/games/${game._id}/validation`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.errors.map((e) => e.message)).toContain('Task "Unmapped" has no Adjust event token');
  });
});

describe('daily challenge', () => {
  test('a credited milestone counts toward a started "tasks" challenge', async () => {
    const DailyChallenge = require('../models/DailyChallenge');
    const UserChallengeProgress = require('../models/UserChallengeProgress');
    const { startOfUtcDay } = require('../utils/challengeEventProgress');
    const today = startOfUtcDay();

    const challenge = await DailyChallenge.create({
      challengeDate: today, title: 'Finish a task', type: 'game', coinReward: 10, xpReward: 5,
      claimType: 'auto', status: 'live', createdBy: admin._id,
      requirements: { objective: 'tasks', target: 1, gameScope: 'any' },
      scheduling: { startTime: today, endTime: new Date(today.getTime() + 86399999) },
    });
    await UserChallengeProgress.create({
      userId: player._id, challengeId: challenge._id, challengeDate: today, status: 'started',
    });

    const label = await launch(player);
    await sendCallback({ event_token: 'ev_level5', label, adid: 'adid-1', created_at: nowSeconds() });

    const progress = await UserChallengeProgress.findOne({ userId: player._id }).lean();
    expect(progress.progress.currentStep).toBe(1);
    await DailyChallenge.deleteMany({});
    await UserChallengeProgress.deleteMany({});
  });
});

describe('partner flow guard', () => {
  test('the app cannot self-report completion of a client game task', async () => {
    const res = await request(app)
      .post(`/api/game/${game._id}/tasks/${taskOne._id}/complete`)
      .set('Authorization', `Bearer ${tokenFor(player)}`);
    expect(res.status).toBe(403);
    expect(await balanceOf(player)).toBe(0);
  });
});

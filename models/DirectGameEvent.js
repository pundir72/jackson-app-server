const mongoose = require('mongoose');

/**
 * Inbox of Adjust callbacks from client games.
 *
 * Every callback is stored here before anything else happens, so an event is
 * never lost to a crash or a bug in processing - it can always be retried or
 * decided by an admin. See utils/directGameProcessor.js for the lifecycle:
 *
 *   received -> processing -> credited | held | review | rejected | duplicate | ignored
 *                         \-> failed (retried with backoff, then review)
 */
const STATUSES = [
  'received',
  'processing',
  'credited',
  'held',       // matched, but the task is still locked for this user
  'review',     // needs an admin: unmatched, failed a check, or kill switch off
  'rejected',   // decided by an admin, or a sandbox event in production
  'duplicate',  // milestone already rewarded for this user
  'ignored',    // not a milestone (install/session/...), stored for the record
  'failed'
];

const MATCH_METHODS = ['ticket', 'adjust_device', 'advertising_id', 'admin'];

const directGameEventSchema = new mongoose.Schema({
  // Identifies one delivery. Adjust retries a callback with the same values,
  // so a retry collides here and is dropped at the door.
  deliveryKey: {
    type: String,
    required: true,
    unique: true
  },
  activityKind: { type: String, trim: true },
  adjustAppToken: { type: String, trim: true },
  appId: { type: String, trim: true },
  eventToken: { type: String, trim: true },
  eventName: { type: String, trim: true },
  label: { type: String, trim: true },
  adid: { type: String, trim: true },
  gpsAdid: { type: String, trim: true, lowercase: true },
  environment: { type: String, trim: true },
  // When the milestone happened according to Adjust; receipt time if absent
  eventTime: Date,
  receivedAt: { type: Date, default: Date.now },
  raw: { type: mongoose.Schema.Types.Mixed },

  status: {
    type: String,
    enum: STATUSES,
    default: 'received',
    index: true
  },
  // Machine-readable cause of the current status, e.g. 'unmatched_user'
  reason: { type: String, default: null },
  reasonDetail: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: Date,
  lockedAt: Date,
  lastError: String,

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', default: null },
  task: { type: mongoose.Schema.Types.ObjectId, ref: 'GameTask', default: null },
  ticket: { type: String, default: null },
  matchMethod: { type: String, enum: [...MATCH_METHODS, null], default: null },

  // Claimed just before crediting: user+task for a one-time task, so a second
  // event for the same milestone hits the unique index instead of paying.
  rewardKey: { type: String, default: undefined },

  // Task reward captured when the event was first matched. Later edits to the
  // task do not change what an already-received milestone pays.
  rewardSnapshot: {
    rewardType: { type: String, enum: ['xp', 'coins', null], default: null },
    rewardValue: Number,
    capturedAt: Date
  },
  reward: {
    coins: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    baseXP: Number,
    xpMultiplier: Number,
    coinBoxAccumulated: { type: Boolean, default: false },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' }
  },
  creditedAt: Date,

  review: {
    decision: { type: String, enum: ['credited', 'rejected', null], default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
    note: String
  }
}, {
  timestamps: true
});

directGameEventSchema.index(
  { rewardKey: 1 },
  { unique: true, partialFilterExpression: { rewardKey: { $type: 'string' } } }
);
directGameEventSchema.index({ status: 1, nextAttemptAt: 1 });
directGameEventSchema.index({ status: 1, reason: 1, createdAt: -1 });
directGameEventSchema.index({ userId: 1, game: 1, status: 1 });
directGameEventSchema.index({ adjustAppToken: 1, eventToken: 1, createdAt: -1 });

directGameEventSchema.statics.STATUSES = STATUSES;
directGameEventSchema.statics.MATCH_METHODS = MATCH_METHODS;

module.exports = mongoose.model('DirectGameEvent', directGameEventSchema);

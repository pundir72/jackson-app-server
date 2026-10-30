/**
 * Turns an Adjust callback from a client game into "which Jackson user did
 * this".
 *
 * A client game's Adjust app knows nothing about Jackson accounts, so the user
 * is recovered from what Jackson planted on the way in, strongest first:
 *
 *   1. label     - the launch ticket, echoed by Adjust on every callback of an
 *                  install it attributed to our tracker link
 *   2. adid      - the Adjust device id, once a ticketed callback has bound it
 *   3. gps_adid  - the advertising id the Jackson app reported at launch. The
 *                  only route for a game that was already installed, and the
 *                  weakest: several accounts can share a device.
 *
 * Anything that does not resolve to exactly one user goes to admin review. An
 * ambiguous match must never pay a reward on a guess.
 */

const crypto = require('crypto');
const GameLaunchTicket = require('../models/GameLaunchTicket');

const pick = (obj, ...keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return null;
};

// Adjust sends literal "{placeholder}" text when a value is unavailable for a
// callback; treat those as absent rather than as an id.
const clean = (value) => (value && /^\{[a-z_]+\}$/i.test(value) ? null : value);

/** Adjust timestamps are unix seconds (created_at) or milliseconds (created_at_milli). */
const parseAdjustTime = (raw) => {
  const milli = clean(pick(raw, 'created_at_milli'));
  if (milli && /^\d+$/.test(milli)) return new Date(Number(milli));
  const seconds = clean(pick(raw, 'created_at', 'event_time'));
  if (seconds && /^\d+$/.test(seconds)) return new Date(Number(seconds) * 1000);
  if (seconds) {
    const parsed = new Date(seconds);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

/** Zeroed ids come from users who opted out of ad tracking - they identify no one. */
const isUsableAdvertisingId = (id) =>
  Boolean(id) && /^[0-9a-f-]{8,}$/i.test(id) && /[1-9a-f]/i.test(id);

function normalizeCallback(raw = {}) {
  const gpsAdid = clean(pick(raw, 'gps_adid', 'gpsAdid'));
  return {
    activityKind: (clean(pick(raw, 'activity_kind', 'activityKind')) || 'unknown').toLowerCase(),
    adjustAppToken: clean(pick(raw, 'app_token', 'appToken')),
    appId: clean(pick(raw, 'app_id', 'appId')),
    eventToken: clean(pick(raw, 'event_token', 'eventToken')),
    eventName: clean(pick(raw, 'event_name', 'eventName')),
    label: clean(pick(raw, 'label')),
    adid: clean(pick(raw, 'adid')),
    gpsAdid: isUsableAdvertisingId(gpsAdid) ? gpsAdid.toLowerCase() : null,
    environment: (clean(pick(raw, 'environment')) || '').toLowerCase() || null,
    eventTime: parseAdjustTime(raw),
  };
}

/**
 * A retried callback repeats the same values, so hashing the identifying ones
 * gives the same key and the retry is dropped. Distinct events always differ in
 * creation time; without one, the whole payload is hashed so two different
 * events are never collapsed into one.
 */
function buildDeliveryKey(raw = {}) {
  const fields = [
    'app_token', 'app_id', 'activity_kind', 'event_token', 'adid',
    'gps_adid', 'label', 'created_at_milli', 'created_at',
  ];
  const hasTime = Boolean(clean(pick(raw, 'created_at_milli', 'created_at')));
  const source = hasTime
    ? fields.map((f) => `${f}=${pick(raw, f) || ''}`).join('&')
    : JSON.stringify(
        Object.keys(raw).filter((k) => k !== 'token').sort().map((k) => [k, raw[k]])
      );
  return crypto.createHash('sha256').update(source).digest('hex');
}

const distinctUserIds = (tickets) => [...new Set(tickets.map((t) => String(t.userId)))];

/**
 * @param {Object} event  normalized callback (see normalizeCallback)
 * @param {Object} opts
 * @param {Number} opts.deviceWindowDays  how far back an advertising-id launch may be matched
 * @returns {Promise<{userId?, method?, ticket?, gameId?, review?: string, detail?: string}>}
 *          `review` is set when no single user can be trusted.
 */
async function resolveUser(event, { deviceWindowDays = 30 } = {}) {
  const { adjustAppToken, label, adid, gpsAdid } = event;

  if (label) {
    const ticket = await GameLaunchTicket.findOne({ ticket: label });
    if (ticket) {
      if (ticket.adjustAppToken !== adjustAppToken) {
        return { review: 'ticket_game_mismatch', detail: 'Launch ticket belongs to a different game' };
      }
      if (ticket.boundAdid && adid && ticket.boundAdid !== adid) {
        return { review: 'ticket_device_mismatch', detail: 'Launch ticket already used on another device' };
      }
      if (!ticket.boundAdid && adid) {
        // Only bind if still unbound - two callbacks racing must not both win
        await GameLaunchTicket.updateOne(
          { _id: ticket._id, boundAdid: null },
          { $set: { boundAdid: adid, boundAt: new Date() } }
        );
      }
      return { userId: ticket.userId, method: 'ticket', ticket: ticket.ticket, gameId: ticket.game };
    }
    // An unknown label is not proof of anything - fall through to device matching
  }

  if (adid) {
    const tickets = await GameLaunchTicket.find({ adjustAppToken, boundAdid: adid })
      .sort({ createdAt: -1 })
      .select('userId game ticket')
      .lean();
    const users = distinctUserIds(tickets);
    if (users.length === 1) {
      return { userId: tickets[0].userId, method: 'adjust_device', ticket: tickets[0].ticket, gameId: tickets[0].game };
    }
    if (users.length > 1) {
      return { review: 'ambiguous_device', detail: `Adjust device linked to ${users.length} users` };
    }
  }

  if (gpsAdid) {
    const since = new Date(Date.now() - deviceWindowDays * 24 * 60 * 60 * 1000);
    const tickets = await GameLaunchTicket.find({ adjustAppToken, gpsAdid, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .select('userId game ticket')
      .lean();
    const users = distinctUserIds(tickets);
    if (users.length === 1) {
      return { userId: tickets[0].userId, method: 'advertising_id', ticket: tickets[0].ticket, gameId: tickets[0].game };
    }
    if (users.length > 1) {
      return { review: 'ambiguous_device', detail: `Advertising id launched by ${users.length} users` };
    }
  }

  return { review: 'unmatched_user', detail: 'No launch ticket or known device for this event' };
}

module.exports = {
  normalizeCallback,
  buildDeliveryKey,
  isUsableAdvertisingId,
  parseAdjustTime,
  resolveUser,
};

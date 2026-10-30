/**
 * Direct (client) game integration - user-facing and Adjust-facing routes.
 *
 * Client games are listed alongside partner games, but report milestones
 * through their own Adjust app. The app calls /launch when the user taps Play;
 * Adjust calls /adjust/callback for every install and in-app event.
 * @module routes/direct-games
 */

const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const protect = require('../middleware/auth');
const config = require('../config/config');
const Game = require('../models/Game');
const User = require('../models/User');
const DirectGameEvent = require('../models/DirectGameEvent');
const GameLaunchTicket = require('../models/GameLaunchTicket');
const { normalizeCallback, buildDeliveryKey, isUsableAdvertisingId } = require('../utils/directGameMatching');
const { processEvent, PROVIDER } = require('../utils/directGameProcessor');

const secretMatches = (provided) => {
  const expected = config.ADJUST_DIRECT_CALLBACK_SECRET;
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * @route   GET|POST /api/direct-games/adjust/callback
 * @desc    Adjust server-to-server callback for client games. Configured per
 *          game in its Adjust app with a URL carrying `token=<secret>` and the
 *          placeholders listed in docs/direct-game-integration.md.
 * @access  Adjust only (shared secret)
 */
router.all('/adjust/callback', async (req, res) => {
  const raw = { ...(req.query || {}), ...(req.method === 'POST' ? req.body || {} : {}) };

  if (!config.ADJUST_DIRECT_CALLBACK_SECRET) {
    console.error('[direct-games] ADJUST_DIRECT_CALLBACK_SECRET is not set - rejecting callback');
    return res.status(503).json({ success: false, error: 'Callback endpoint not configured' });
  }
  if (!secretMatches(raw.token)) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  delete raw.token;

  try {
    const event = await DirectGameEvent.create({
      deliveryKey: buildDeliveryKey(raw),
      ...normalizeCallback(raw),
      receivedAt: new Date(),
      raw,
    });

    // Respond first; the sweeper picks the event up if this never runs
    setImmediate(() => {
      processEvent(event._id).catch((err) =>
        console.error('[direct-games] processing failed:', err.message)
      );
    });
    return res.status(200).json({ success: true, id: event._id });
  } catch (err) {
    if (err.code === 11000) {
      // Adjust retried a callback we already have
      return res.status(200).json({ success: true, duplicate: true });
    }
    console.error('[direct-games] failed to store callback:', err.message);
    // Non-2xx so Adjust retries - nothing was stored
    return res.status(500).json({ success: false, error: 'Failed to store callback' });
  }
});

/**
 * @route   POST /api/direct-games/:gameId/launch
 * @desc    Called when the user taps Play on a client game. Issues a one-time
 *          launch ticket and returns the URL to open, which carries the ticket
 *          to Adjust so the game's milestones can be traced back to this user.
 * @param   {String} gameId - Game _id
 * @body    {String} [advertisingId] - Google advertising id read on the device
 * @access  Private
 */
router.post('/:gameId/launch', protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(gameId)) {
      return res.status(400).json({ success: false, error: 'Invalid gameId' });
    }

    const game = await Game.findById(gameId).lean();
    if (!game || game.sdkProvider !== PROVIDER || !game.isActive) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }
    const { adjustAppToken, trackerUrl, rewardsEnabled } = game.directIntegration || {};
    if (!adjustAppToken || !trackerUrl) {
      return res.status(409).json({ success: false, error: 'Game is not fully configured yet' });
    }

    const advertisingId = String(req.body?.advertisingId || '').trim().toLowerCase();
    const ticket = await GameLaunchTicket.create({
      ticket: crypto.randomBytes(12).toString('base64url'),
      userId: req.user.userId,
      game: game._id,
      adjustAppToken,
      gpsAdid: isUsableAdvertisingId(advertisingId) ? advertisingId : null,
    });

    const launchUrl = new URL(trackerUrl);
    launchUrl.searchParams.set('label', ticket.ticket);

    // Same "installed" record /api/game/install keeps, so My Games and task
    // progression see the game without a second call
    const gameKey = String(game._id);
    await User.updateOne(
      { _id: req.user.userId, 'games.gameId': { $ne: gameKey } },
      { $push: { games: { gameId: gameKey, installedAt: new Date(), status: 'installed' } } }
    );

    return res.json({
      success: true,
      data: {
        launchUrl: launchUrl.toString(),
        packageName: game.metadata?.packageName || null,
        storeUrl: game.gameDetails?.downloadUrl || null,
        rewardsEnabled: rewardsEnabled !== false,
      },
    });
  } catch (err) {
    console.error('[direct-games] launch failed:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to launch game' });
  }
});

module.exports = router;

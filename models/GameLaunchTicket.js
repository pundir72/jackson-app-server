const mongoose = require('mongoose');

/**
 * One-time ticket created when a user taps Play on a client (Adjust) game.
 *
 * Callbacks from a client game's Adjust app say nothing about Jackson users.
 * The ticket bridges that: the app opens the game's Adjust tracker link with
 * `label=<ticket>`, Adjust attaches the label to the install it attributes, and
 * echoes it on every later callback from that install.
 *
 * "One-time" means one device: the first Adjust device id (adid) seen with a
 * ticket is bound to it, and a callback carrying the same ticket from another
 * device is sent to review instead of paying - a shared or leaked link must not
 * credit a stranger's play to this user.
 */
const gameLaunchTicketSchema = new mongoose.Schema({
  ticket: {
    type: String,
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },
  adjustAppToken: {
    type: String,
    required: true,
    trim: true
  },
  // Advertising id the Jackson app read on the device at launch. Lets a
  // callback without a label (game already installed, so no new attribution)
  // be traced back to a user - a weaker match, see DIRECT_GAMES_DEVICE_MATCH_MODE.
  gpsAdid: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  // Adjust device id first seen with this ticket
  boundAdid: {
    type: String,
    trim: true,
    default: null
  },
  boundAt: Date
}, {
  timestamps: true
});

gameLaunchTicketSchema.index({ adjustAppToken: 1, boundAdid: 1 });
gameLaunchTicketSchema.index({ adjustAppToken: 1, gpsAdid: 1, createdAt: -1 });

module.exports = mongoose.model('GameLaunchTicket', gameLaunchTicketSchema);

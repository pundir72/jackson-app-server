/**
 * Resolves the URL that actually launches a game.
 *
 * Providers do not give us a stable link to store: BitLabs returns a
 * `click_url` and Besitos a `url`, both carried on the offer payload we keep in
 * `besitosRawData` (the field name is a misnomer - it holds BitLabs payloads
 * too). `Game.metadata.deepLink` and `Game.gameDetails.downloadUrl` exist in the
 * schema but nothing populates them, so reading those yields nothing.
 *
 * The game listing (routes/game.js, `/discover`) has always resolved the link
 * from the raw payload. Daily challenges read the empty schema fields instead,
 * which meant a game challenge started, opened nothing, and could never record
 * play time - the user was then told their play time was not tracked. This is
 * that same resolution, shared so the two cannot drift apart again.
 */

/** Points a URL's existing `paramName` at this user, leaving it alone if absent. */
const injectUserIdParam = (url, paramName, userId) => {
  if (!url || !userId) return url;
  try {
    const urlObj = new URL(url);
    if (urlObj.searchParams.has(paramName)) {
      urlObj.searchParams.set(paramName, userId);
      return urlObj.toString();
    }
  } catch {
    // Not absolute - fall through to a textual replace
    const re = new RegExp(`${paramName}=[^&]*`);
    if (re.test(url)) {
      return url.replace(re, `${paramName}=${encodeURIComponent(userId)}`);
    }
  }
  return url;
};

/**
 * @param {Object} game - a Game document (lean or hydrated)
 * @param {String} [userId] - injected into Besitos' partner_user_id when present
 * @returns {String|null} launch URL, or null when the game has none
 */
function resolveGameDeepLink(game, userId) {
  if (!game) return null;

  const raw = game.besitosRawData || {};
  const isBitlabs =
    game.sdkProvider && String(game.sdkProvider).toLowerCase() === "bitlabs";

  // Besitos carries the user through partner_user_id; BitLabs does not.
  const providerUrl = isBitlabs
    ? raw.click_url
    : injectUserIdParam(raw.url, "partner_user_id", userId);

  return (
    providerUrl ||
    raw.click_url ||
    raw.url ||
    game.clickUrl ||
    game.gameDetails?.downloadUrl ||
    game.metadata?.deepLink ||
    null
  );
}

module.exports = { resolveGameDeepLink, injectUserIdParam };

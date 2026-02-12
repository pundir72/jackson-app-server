const XPMultiplier = require("../models/XPMultiplier");

/**
 * Derive XP tier key from a user's current XP.
 * Mirrors the tiering used in xp-tier routes but normalised to JUNIOR/MID/SENIOR.
 *
 * Junior: 0 - 999
 * Mid:    1000 - 4999
 * Senior: 5000+
 */
function getTierKeyFromXP(currentXp = 0) {
  const xp = Number(currentXp) || 0;

  if (xp >= 5000) return "SENIOR";
  if (xp >= 1000) return "MID";
  return "JUNIOR";
}

/**
 * Apply configured tier-based XP multiplier to a base XP value.
 * - If no active config exists for the user's tier, returns the base XP unchanged.
 * - If config is inactive or missing, base XP is used.
 *
 * @param {Object} user - Mongoose User document or lean object with xp.current
 * @param {number} baseXP - XP before tier multiplier
 * @returns {Promise<{ finalXP: number, multiplier: number, tier: string, configId?: string }>}
 */
async function applyTierMultiplierToXP(user, baseXP) {
  const numericBase = Number(baseXP) || 0;
  if (numericBase <= 0) {
    return {
      finalXP: numericBase,
      multiplier: 1.0,
      tier: null,
    };
  }

  const currentXp = user?.xp?.current || 0;
  const tierKey = getTierKeyFromXP(currentXp);

  try {
    const config = await XPMultiplier.findOne({
      tier: tierKey,
      isActive: true,
    }).lean();

    if (!config || !config.multiplier || config.multiplier <= 0) {
      console.log("[XP Tier Multiplier] No active config for tier:", {
        currentXp,
        tierKey,
        multiplierUsed: 1.0,
        note: "Falling back to 1.0 (Junior = 1x)",
      });
      return {
        finalXP: Math.round(numericBase),
        multiplier: 1.0,
        tier: tierKey,
      };
    }

    const m = Number(config.multiplier) || 1.0;
    const finalXP = Math.round(numericBase * m);

    console.log("[XP Tier Multiplier] Using config:", {
      currentXp,
      tierKey,
      multiplierUsed: m,
      expectedTiers: "Junior 0-999=1x, Mid 1000-4999=1.3x, Senior 5000+=1.5x",
    });

    return {
      finalXP,
      multiplier: m,
      tier: tierKey,
      configId: config._id?.toString(),
    };
  } catch (error) {
    console.error("Error applying tier multiplier:", error);
    return {
      finalXP: Math.round(numericBase),
      multiplier: 1.0,
      tier: tierKey,
    };
  }
}

module.exports = {
  getTierKeyFromXP,
  applyTierMultiplierToXP,
};



const XPTierV2 = require("../models/XPTierV2");
const XPMultiplier = require("../models/XPMultiplier");

/**
 * Derive XP tier from a user's current XP using XPTierV2 model.
 * Returns the tier enum: Junior, Middle, or Senior
 *
 * @param {number} currentXp - User's current XP
 * @returns {Promise<string|null>} - Tier name (Junior, Middle, Senior) or null if not found
 */
async function getTierFromXPV2(currentXp = 0) {
  try {
    const xp = Number(currentXp) || 0;
    const tier = await XPTierV2.findByXpValue(xp);
    return tier ? tier.tier : null;
  } catch (error) {
    console.error("Error getting tier from XP V2:", error);
    return null;
  }
}

/**
 * Get tier key in XPMultiplier format (JUNIOR, MID, SENIOR) from XP value using V2 model
 * 
 * @param {number} currentXp - User's current XP
 * @returns {Promise<string>} - Tier key (JUNIOR, MID, SENIOR)
 */
async function getTierKeyFromXPV2(currentXp = 0) {
  try {
    const tier = await getTierFromXPV2(currentXp);
    
    if (!tier) {
      return "JUNIOR"; // Default
    }

    // Map tier names to XPMultiplier enum values
    const tierMap = {
      'Junior': 'JUNIOR',
      'Middle': 'MID',
      'Senior': 'SENIOR'
    };

    return tierMap[tier] || 'JUNIOR';
  } catch (error) {
    console.error("Error getting tier key from XP V2:", error);
    return "JUNIOR"; // Default fallback
  }
}

/**
 * Apply configured tier-based XP multiplier to a base XP value using V2 models.
 * - Uses XPTierV2 to determine user's tier
 * - Uses XPMultiplier to get the multiplier value
 * - If no active config exists for the user's tier, returns the base XP unchanged.
 *
 * @param {Object} user - Mongoose User document or lean object with xp.current
 * @param {number} baseXP - XP before tier multiplier
 * @returns {Promise<{ finalXP: number, multiplier: number, tier: string, configId?: string }>}
 */
async function applyTierMultiplierToXPV2(user, baseXP) {
  const numericBase = Number(baseXP) || 0;
  if (numericBase <= 0) {
    return {
      finalXP: numericBase,
      multiplier: 1.0,
      tier: null,
    };
  }

  const currentXp = user?.xp?.current || 0;
  
  try {
    // Get tier from XPTierV2
    const tier = await getTierFromXPV2(currentXp);
    
    if (!tier) {
      return {
        finalXP: Math.round(numericBase),
        multiplier: 1.0,
        tier: null,
      };
    }

    // Get tier key for XPMultiplier lookup
    const tierKey = await getTierKeyFromXPV2(currentXp);

    // Get multiplier from XPMultiplier
    const config = await XPMultiplier.findOne({
      tier: tierKey,
      isActive: true,
    }).lean();

    if (!config || !config.multiplier || config.multiplier <= 0) {
      return {
        finalXP: Math.round(numericBase),
        multiplier: 1.0,
        tier: tier,
      };
    }

    const m = Number(config.multiplier) || 1.0;
    const finalXP = Math.round(numericBase * m);

    return {
      finalXP,
      multiplier: m,
      tier: tier,
      configId: config._id?.toString(),
    };
  } catch (error) {
    console.error("Error applying tier multiplier V2:", error);
    return {
      finalXP: Math.round(numericBase),
      multiplier: 1.0,
      tier: null,
    };
  }
}

/**
 * Get user's current tier information using V2 model
 * 
 * @param {Object} user - Mongoose User document or lean object with xp.current
 * @returns {Promise<{tier: string|null, tierDoc: Object|null, xpRange: string|null, accessBenefit: string|null}>}
 */
async function getUserTierInfoV2(user) {
  try {
    const currentXp = user?.xp?.current || 0;
    const tierDoc = await XPTierV2.findByXpValue(currentXp);
    
    if (!tierDoc) {
      return {
        tier: null,
        tierDoc: null,
        xpRange: null,
        accessBenefit: null
      };
    }

    // Get access benefit from XPMultiplier
    const tierKey = await getTierKeyFromXPV2(currentXp);
    const multiplier = await XPMultiplier.findOne({
      tier: tierKey,
      isActive: true,
    }).lean();

    const accessBenefit = multiplier && multiplier.multiplier 
      ? `${multiplier.multiplier}x` 
      : '1.0x';

    return {
      tier: tierDoc.tier,
      tierDoc: tierDoc,
      xpRange: tierDoc.xpRange,
      accessBenefit: accessBenefit
    };
  } catch (error) {
    console.error("Error getting user tier info V2:", error);
    return {
      tier: null,
      tierDoc: null,
      xpRange: null,
      accessBenefit: null
    };
  }
}

module.exports = {
  getTierFromXPV2,
  getTierKeyFromXPV2,
  applyTierMultiplierToXPV2,
  getUserTierInfoV2,
};


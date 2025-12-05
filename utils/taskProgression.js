const { getTierKeyFromXP } = require("./xpTierMultiplier");

/**
 * Get user's XP tier in lowercase format (junior/mid/senior)
 * Used for task progression rule matching
 *
 * @param {Object} user - User object with xp.current
 * @returns {string} - 'junior', 'mid', or 'senior'
 */
function getUserXpTier(user) {
  const currentXp = user?.xp?.current || 0;
  const tierKey = getTierKeyFromXP(currentXp);

  // Convert to lowercase for matching with task progression rules
  return tierKey.toLowerCase();
}

/**
 * Get user's membership tier (bronze/gold/platinum)
 * Checks vip.level or vip.tier field
 *
 * @param {Object} user - User object with vip information
 * @returns {string|null} - 'bronze', 'gold', 'platinum', or null if no membership
 */
function getUserMembershipTier(user) {
  if (!user) return null;

  // Check vip.level first (most common)
  const vipLevel = user.vip?.level;
  if (vipLevel) {
    const levelLower = vipLevel.toLowerCase();
    if (["bronze", "gold", "platinum"].includes(levelLower)) {
      return levelLower;
    }
  }

  // Check vip.tier as fallback
  const vipTier = user.vip?.tier;
  if (vipTier) {
    const tierLower = vipTier.toLowerCase();
    if (["bronze", "gold", "platinum"].includes(tierLower)) {
      return tierLower;
    }
  }

  // Check if user has active VIP subscription
  if (user.vip?.subscription) {
    const subscriptionTier = user.vip.subscription.tier;
    if (subscriptionTier) {
      const tierLower = subscriptionTier.toLowerCase();
      if (["bronze", "gold", "platinum"].includes(tierLower)) {
        return tierLower;
      }
    }
  }

  return null;
}

/**
 * Check if user meets XP tier requirement
 *
 * @param {Object} user - User object
 * @param {string} requiredTier - Required tier: 'junior', 'mid', or 'senior'
 * @returns {boolean}
 */
function meetsXpTierRequirement(user, requiredTier) {
  if (!requiredTier) return true; // No requirement means always pass

  const userTier = getUserXpTier(user);
  return userTier === requiredTier.toLowerCase();
}

/**
 * Check if user meets membership tier requirement
 *
 * @param {Object} user - User object
 * @param {string} requiredTier - Required tier: 'bronze', 'gold', or 'platinum'
 * @returns {boolean}
 */
function meetsMembershipTierRequirement(user, requiredTier) {
  if (!requiredTier) return true; // No requirement means always pass

  const userTier = getUserMembershipTier(user);
  if (!userTier) return false; // User has no membership

  return userTier === requiredTier.toLowerCase();
}

/**
 * Get tier comparison for unlock reason messages
 *
 * @param {Object} user - User object
 * @param {string} requiredXpTier - Required XP tier
 * @param {string} requiredMembershipTier - Required membership tier
 * @returns {Object} - { xpTierMatch: boolean, membershipTierMatch: boolean, userXpTier: string, userMembershipTier: string|null }
 */
function getTierComparison(user, requiredXpTier, requiredMembershipTier) {
  const userXpTier = getUserXpTier(user);
  const userMembershipTier = getUserMembershipTier(user);

  return {
    xpTierMatch: meetsXpTierRequirement(user, requiredXpTier),
    membershipTierMatch: meetsMembershipTierRequirement(
      user,
      requiredMembershipTier
    ),
    userXpTier,
    userMembershipTier,
  };
}

module.exports = {
  getUserXpTier,
  getUserMembershipTier,
  meetsXpTierRequirement,
  meetsMembershipTierRequirement,
  getTierComparison,
};

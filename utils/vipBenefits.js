const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');

/**
 * VIP Benefits Management System
 * Handles all VIP-related benefits, features, and access control
 */

/**
 * Get user's current VIP benefits
 * @param {string} userId - User ID
 * @returns {Object} User's VIP benefits and features
 */
const getUserVIPBenefits = async (userId) => {
  try {
    const user = await User.findById(userId).select('vip');
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!activeSubscription || !activeSubscription.isActive()) {
      return {
        tier: 'free',
        isActive: false,
        benefits: [],
        features: getFreeTierFeatures(),
        xpMultiplier: 1.0,
        weeklyXpBonus: 0,
        bonusSpins: 0,
        noAds: false,
        prioritySupport: false,
        earlyAccess: false,
        unlimitedSpins: false
      };
    }

    const tier = await VIPTier.getTierById(activeSubscription.tier);
    if (!tier) {
      return {
        tier: 'free',
        isActive: false,
        benefits: [],
        features: getFreeTierFeatures(),
        xpMultiplier: 1.0,
        weeklyXpBonus: 0,
        bonusSpins: 0,
        noAds: false,
        prioritySupport: false,
        earlyAccess: false,
        unlimitedSpins: false
      };
    }

    return {
      tier: activeSubscription.tier,
      isActive: true,
      benefits: tier.getBenefitsSummary(),
      features: tier.features,
      xpMultiplier: tier.features.xpMultiplier,
      weeklyXpBonus: tier.features.weeklyXpBonus,
      bonusSpins: tier.features.bonusSpins,
      noAds: tier.features.noAds,
      prioritySupport: tier.features.prioritySupport,
      earlyAccess: tier.features.earlyAccess,
      unlimitedSpins: tier.features.unlimitedSpins,
      subscription: activeSubscription.getSummary()
    };
  } catch (error) {
    console.error('Error getting user VIP benefits:', error);
    return {
      tier: 'free',
      isActive: false,
      benefits: [],
      features: getFreeTierFeatures(),
      xpMultiplier: 1.0,
      weeklyXpBonus: 0,
      bonusSpins: 0,
      noAds: false,
      prioritySupport: false,
      earlyAccess: false,
      unlimitedSpins: false
    };
  }
};

/**
 * Check if user has specific VIP feature
 * @param {string} userId - User ID
 * @param {string} feature - Feature name
 * @returns {boolean} True if user has the feature
 */
const hasVIPFeature = async (userId, feature) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.features[feature] || false;
  } catch (error) {
    console.error('Error checking VIP feature:', error);
    return false;
  }
};

/**
 * Get XP multiplier for user
 * @param {string} userId - User ID
 * @returns {number} XP multiplier
 */
const getXPMultiplier = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.xpMultiplier || 1.0;
  } catch (error) {
    console.error('Error getting XP multiplier:', error);
    return 1.0;
  }
};

/**
 * Get weekly XP bonus for user
 * @param {string} userId - User ID
 * @returns {number} Weekly XP bonus
 */
const getWeeklyXPBonus = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.weeklyXpBonus || 0;
  } catch (error) {
    console.error('Error getting weekly XP bonus:', error);
    return 0;
  }
};

/**
 * Get bonus spins for user
 * @param {string} userId - User ID
 * @returns {number} Bonus spins
 */
const getBonusSpins = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.bonusSpins || 0;
  } catch (error) {
    console.error('Error getting bonus spins:', error);
    return 0;
  }
};

/**
 * Check if user should see ads
 * @param {string} userId - User ID
 * @returns {boolean} True if user should see ads
 */
const shouldShowAds = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return !benefits.noAds;
  } catch (error) {
    console.error('Error checking ad display:', error);
    return true; // Show ads by default
  }
};

/**
 * Check if user has priority support
 * @param {string} userId - User ID
 * @returns {boolean} True if user has priority support
 */
const hasPrioritySupport = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.prioritySupport || false;
  } catch (error) {
    console.error('Error checking priority support:', error);
    return false;
  }
};

/**
 * Check if user has early access
 * @param {string} userId - User ID
 * @returns {boolean} True if user has early access
 */
const hasEarlyAccess = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.earlyAccess || false;
  } catch (error) {
    console.error('Error checking early access:', error);
    return false;
  }
};

/**
 * Check if user has unlimited spins
 * @param {string} userId - User ID
 * @returns {boolean} True if user has unlimited spins
 */
const hasUnlimitedSpins = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    return benefits.unlimitedSpins || false;
  } catch (error) {
    console.error('Error checking unlimited spins:', error);
    return false;
  }
};

/**
 * Apply VIP benefits to user actions
 * @param {string} userId - User ID
 * @param {string} action - Action type (xp_earned, spin_used, etc.)
 * @param {Object} data - Action data
 * @returns {Object} Modified data with VIP benefits applied
 */
const applyVIPBenefits = async (userId, action, data) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    
    switch (action) {
      case 'xp_earned':
        return {
          ...data,
          xpEarned: Math.round(data.xpEarned * benefits.xpMultiplier),
          multiplier: benefits.xpMultiplier,
          isVIP: benefits.isActive
        };
        
      case 'spin_used':
        if (benefits.unlimitedSpins) {
          return {
            ...data,
            spinsUsed: 0, // No spins deducted
            isUnlimited: true,
            isVIP: benefits.isActive
          };
        }
        return {
          ...data,
          isVIP: benefits.isActive
        };
        
      case 'ad_display':
        return {
          ...data,
          shouldShowAd: benefits.noAds ? false : true,
          isVIP: benefits.isActive
        };
        
      case 'support_priority':
        return {
          ...data,
          priority: benefits.prioritySupport ? 'high' : 'normal',
          isVIP: benefits.isActive
        };
        
      case 'early_access':
        return {
          ...data,
          hasAccess: benefits.earlyAccess,
          isVIP: benefits.isActive
        };
        
      default:
        return {
          ...data,
          isVIP: benefits.isActive
        };
    }
  } catch (error) {
    console.error('Error applying VIP benefits:', error);
    return data;
  }
};

/**
 * Get free tier features
 * @returns {Object} Free tier features
 */
const getFreeTierFeatures = () => {
  return {
    noAds: false,
    xpMultiplier: 1.0,
    weeklyXpBonus: 0,
    bonusSpins: 0,
    prioritySupport: false,
    earlyAccess: false,
    unlimitedSpins: false
  };
};

/**
 * Get all VIP features comparison
 * @returns {Object} All VIP features comparison
 */
const getVIPFeaturesComparison = async () => {
  try {
    const tiers = await VIPTier.getActiveTiers();
    
    const comparison = tiers.map(tier => ({
      tierId: tier.tierId,
      name: tier.name,
      features: tier.features,
      benefits: tier.getBenefitsSummary()
    }));

    // Add free tier
    comparison.unshift({
      tierId: 'free',
      name: 'Free',
      features: getFreeTierFeatures(),
      benefits: [
        {
          id: 'basic_games',
          title: 'Basic Games',
          description: 'Access to basic games',
          icon: 'game-controller'
        },
        {
          id: 'standard_xp',
          title: 'Standard XP',
          description: 'Earn XP at normal rate',
          icon: 'star'
        }
      ]
    });

    return comparison;
  } catch (error) {
    console.error('Error getting VIP features comparison:', error);
    return [];
  }
};

/**
 * Check if user can access premium content
 * @param {string} userId - User ID
 * @param {string} contentType - Type of content (game, feature, etc.)
 * @param {string} requiredTier - Required VIP tier
 * @returns {boolean} True if user can access content
 */
const canAccessPremiumContent = async (userId, contentType, requiredTier) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    
    if (!benefits.isActive) {
      return false;
    }

    const tierOrder = { free: 0, bronze: 1, gold: 2, platinum: 3 };
    const userTierLevel = tierOrder[benefits.tier] || 0;
    const requiredTierLevel = tierOrder[requiredTier] || 0;

    return userTierLevel >= requiredTierLevel;
  } catch (error) {
    console.error('Error checking premium content access:', error);
    return false;
  }
};

/**
 * Get VIP upgrade recommendations for user
 * @param {string} userId - User ID
 * @returns {Object} Upgrade recommendations
 */
const getUpgradeRecommendations = async (userId) => {
  try {
    const benefits = await getUserVIPBenefits(userId);
    const tiers = await VIPTier.getActiveTiers();
    
    if (benefits.tier === 'platinum') {
      return {
        canUpgrade: false,
        message: 'You already have the highest VIP tier!',
        recommendations: []
      };
    }

    const currentTierIndex = tiers.findIndex(tier => tier.tierId === benefits.tier);
    const nextTier = tiers[currentTierIndex + 1];
    
    if (!nextTier) {
      return {
        canUpgrade: false,
        message: 'No upgrade available',
        recommendations: []
      };
    }

    const recommendations = [];
    
    // Check usage patterns to recommend features
    if (!benefits.noAds) {
      recommendations.push({
        feature: 'noAds',
        title: 'Ad-Free Experience',
        description: 'Remove all ads for uninterrupted gaming',
        benefit: 'Enjoy games without interruptions'
      });
    }

    if (benefits.xpMultiplier < nextTier.features.xpMultiplier) {
      recommendations.push({
        feature: 'xpMultiplier',
        title: 'XP Boost',
        description: `Earn ${nextTier.features.xpMultiplier}x XP instead of ${benefits.xpMultiplier}x`,
        benefit: 'Level up faster and unlock rewards quicker'
      });
    }

    if (!benefits.prioritySupport) {
      recommendations.push({
        feature: 'prioritySupport',
        title: 'Priority Support',
        description: 'Get faster response times for support requests',
        benefit: 'Resolve issues quickly with dedicated support'
      });
    }

    return {
      canUpgrade: true,
      currentTier: benefits.tier,
      nextTier: nextTier.tierId,
      nextTierName: nextTier.name,
      recommendations,
      upgradeUrl: `/vip/upgrade?tier=${nextTier.tierId}`
    };
  } catch (error) {
    console.error('Error getting upgrade recommendations:', error);
    return {
      canUpgrade: false,
      message: 'Unable to get recommendations',
      recommendations: []
    };
  }
};

/**
 * Log VIP benefit usage
 * @param {string} userId - User ID
 * @param {string} benefit - Benefit used
 * @param {Object} metadata - Additional metadata
 */
const logBenefitUsage = async (userId, benefit, metadata = {}) => {
  try {
    // This would integrate with your analytics system
    console.log(`VIP Benefit Used: ${userId} - ${benefit}`, metadata);
    
    // Example: Log to analytics
    // await analytics.log('vip_benefit_used', {
    //   userId,
    //   benefit,
    //   timestamp: new Date(),
    //   ...metadata
    // });
  } catch (error) {
    console.error('Error logging benefit usage:', error);
  }
};

module.exports = {
  getUserVIPBenefits,
  hasVIPFeature,
  getXPMultiplier,
  getWeeklyXPBonus,
  getBonusSpins,
  shouldShowAds,
  hasPrioritySupport,
  hasEarlyAccess,
  hasUnlimitedSpins,
  applyVIPBenefits,
  getFreeTierFeatures,
  getVIPFeaturesComparison,
  canAccessPremiumContent,
  getUpgradeRecommendations,
  logBenefitUsage
};










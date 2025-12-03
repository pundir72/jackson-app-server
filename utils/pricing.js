const VIPTier = require('../models/VIPTier');

// Regional pricing configuration
const REGIONAL_PRICING = {
  US: {
    currency: 'USD',
    symbol: '$',
    bronze: { weekly: 2.00, monthly: 5.00, yearly: 50.00 },
    gold: { weekly: 4.00, monthly: 10.00, yearly: 100.00 },
    platinum: { weekly: 8.00, monthly: 20.00, yearly: 200.00 }
  },
  EU: {
    currency: 'EUR',
    symbol: '€',
    bronze: { weekly: 1.80, monthly: 4.50, yearly: 45.00 },
    gold: { weekly: 3.60, monthly: 9.00, yearly: 90.00 },
    platinum: { weekly: 7.20, monthly: 18.00, yearly: 180.00 }
  },
  UK: {
    currency: 'GBP',
    symbol: '£',
    bronze: { weekly: 1.60, monthly: 4.00, yearly: 40.00 },
    gold: { weekly: 3.20, monthly: 8.00, yearly: 80.00 },
    platinum: { weekly: 6.40, monthly: 16.00, yearly: 160.00 }
  },
  IN: {
    currency: 'INR',
    symbol: '₹',
    bronze: { weekly: 120, monthly: 299, yearly: 2999 },
    gold: { weekly: 240, monthly: 599, yearly: 5999 },
    platinum: { weekly: 480, monthly: 1199, yearly: 11999 }
  }
};

// Trending plans configuration (which plan is most popular)
const TRENDING_PLANS = {
  bronze: 'monthly',
  gold: 'yearly',
  platinum: 'yearly'
};

// Discount configurations
const DISCOUNTS = {
  first_time: {
    bronze: { weekly: 0.05, monthly: 0.1, yearly: 0.15 }, // 5% weekly, 10% monthly, 15% yearly
    gold: { weekly: 0.05, monthly: 0.1, yearly: 0.15 },
    platinum: { weekly: 0.05, monthly: 0.1, yearly: 0.15 }
  },
  limited_time: {
    bronze: { weekly: 0.1, monthly: 0.2, yearly: 0.25 }, // 10% weekly, 20% monthly, 25% yearly
    gold: { weekly: 0.1, monthly: 0.2, yearly: 0.25 },
    platinum: { weekly: 0.1, monthly: 0.2, yearly: 0.25 }
  }
};

/**
 * Get VIP pricing for a specific region
 * @param {string} region - Region code (US, EU, UK, IN)
 * @param {string} userId - User ID for personalized pricing
 * @param {boolean} excludePendingSubscription - Exclude pending subscriptions when checking first-time status
 * @returns {Object} Pricing information
 */
const getVIPPricing = async (region = 'US', userId = null, excludePendingSubscription = false) => {
  try {
    const regionConfig = REGIONAL_PRICING[region] || REGIONAL_PRICING.US;
    const tiers = await VIPTier.getActiveTiers();

    const pricing = {};

    for (const tier of tiers) {
      const basePricing = regionConfig[tier.tierId];
      if (!basePricing) continue;

      // Check for discounts
      const discounts = await getApplicableDiscounts(tier.tierId, userId, excludePendingSubscription);

      pricing[tier.tierId] = {
        weekly: {
          amount: basePricing.weekly,
          currency: regionConfig.currency,
          symbol: regionConfig.symbol,
          formatted: `${regionConfig.symbol}${basePricing.weekly.toFixed(2)}`,
          originalAmount: basePricing.weekly,
          discount: discounts.weekly,
          discountedAmount: basePricing.weekly * (1 - discounts.weekly),
          isDiscounted: discounts.weekly > 0
        },
        monthly: {
          amount: basePricing.monthly,
          currency: regionConfig.currency,
          symbol: regionConfig.symbol,
          formatted: `${regionConfig.symbol}${basePricing.monthly.toFixed(2)}`,
          originalAmount: basePricing.monthly,
          discount: discounts.monthly,
          discountedAmount: basePricing.monthly * (1 - discounts.monthly),
          isDiscounted: discounts.monthly > 0
        },
        yearly: {
          amount: basePricing.yearly,
          currency: regionConfig.currency,
          symbol: regionConfig.symbol,
          formatted: `${regionConfig.symbol}${basePricing.yearly.toFixed(2)}`,
          originalAmount: basePricing.yearly,
          discount: discounts.yearly,
          discountedAmount: basePricing.yearly * (1 - discounts.yearly),
          isDiscounted: discounts.yearly > 0
        },
        trending: TRENDING_PLANS[tier.tierId] || 'monthly',
        savings: {
          weekly: basePricing.monthly / 4 - basePricing.weekly,
          monthly: basePricing.yearly / 12 - basePricing.monthly,
          yearly: basePricing.monthly * 12 - basePricing.yearly,
          weeklyPercentage: Math.round(((basePricing.monthly / 4 - basePricing.weekly) / basePricing.weekly) * 100),
          monthlyPercentage: Math.round(((basePricing.yearly / 12 - basePricing.monthly) / basePricing.monthly) * 100),
          yearlyPercentage: Math.round(((basePricing.monthly * 12 - basePricing.yearly) / basePricing.yearly) * 100)
        }
      };
    }

    return {
      region,
      currency: regionConfig.currency,
      symbol: regionConfig.symbol,
      pricing,
      lastUpdated: new Date()
    };

  } catch (error) {
    console.error('Error getting VIP pricing:', error);
    throw new Error('Failed to get VIP pricing');
  }
};

/**
 * Get applicable discounts for a user and tier
 * @param {string} tierId - VIP tier ID
 * @param {string} userId - User ID
 * @returns {Object} Discount percentages
 */
const getApplicableDiscounts = async (tierId, userId, excludePendingSubscription = false) => {
  try {
    // Check if user is first-time subscriber
    const isFirstTime = await checkFirstTimeSubscriber(userId, excludePendingSubscription);

    // Check for limited-time offers
    const hasLimitedTimeOffer = await checkLimitedTimeOffer();

    let discounts = { weekly: 0, monthly: 0, yearly: 0 };

    if (isFirstTime) {
      discounts = DISCOUNTS.first_time[tierId] || { weekly: 0, monthly: 0, yearly: 0 };
    }

    if (hasLimitedTimeOffer) {
      const limitedTimeDiscounts = DISCOUNTS.limited_time[tierId] || { weekly: 0, monthly: 0, yearly: 0 };
      // Use the higher discount
      discounts = {
        weekly: Math.max(discounts.weekly, limitedTimeDiscounts.weekly),
        monthly: Math.max(discounts.monthly, limitedTimeDiscounts.monthly),
        yearly: Math.max(discounts.yearly, limitedTimeDiscounts.yearly)
      };
    }

    return discounts;

  } catch (error) {
    console.error('Error getting applicable discounts:', error);
    return { weekly: 0, monthly: 0, yearly: 0 };
  }
};

/**
 * Check if user is a first-time subscriber
 * @param {string} userId - User ID
 * @returns {boolean} True if first-time subscriber
 */
const checkFirstTimeSubscriber = async (userId, excludePendingSubscription = false) => {
  if (!userId) return false;
  
  try {
    const VIPSubscription = require('../models/VIPSubscription');
    let query = { userId };
    
    if (excludePendingSubscription) {
      // Exclude pending subscriptions when checking for first-time status
      query.status = { $ne: 'pending' };
    }
    
    const existingSubscriptions = await VIPSubscription.find(query);
    return existingSubscriptions.length === 0;
  } catch (error) {
    console.error('Error checking first-time subscriber:', error);
    return false;
  }
};

/**
 * Check for limited-time offers
 * @returns {boolean} True if limited-time offer is active
 */
const checkLimitedTimeOffer = async () => {
  // This could be enhanced to check database for active campaigns
  // For now, return false
  return false;
};

/**
 * Calculate subscription cost
 * @param {string} tierId - VIP tier ID
 * @param {string} plan - Plan type (weekly/monthly/yearly)
 * @param {string} region - Region code
 * @param {string} userId - User ID for discounts
 * @param {boolean} excludePendingSubscription - Exclude pending subscriptions when checking first-time status
 * @returns {Object} Cost calculation
 */
const calculateSubscriptionCost = async (tierId, plan, region = 'US', userId = null, excludePendingSubscription = false) => {
  try {
    const pricing = await getVIPPricing(region, userId, excludePendingSubscription);
    const tierPricing = pricing.pricing[tierId];
    
    if (!tierPricing) {
      throw new Error(`Pricing not found for tier: ${tierId}`);
    }
    
    const planPricing = tierPricing[plan];
    if (!planPricing) {
      throw new Error(`Plan not found: ${plan}`);
    }
    
    return {
      tierId,
      plan,
      region,
      amount: planPricing.discountedAmount || planPricing.amount,
      originalAmount: planPricing.originalAmount,
      currency: planPricing.currency,
      discount: planPricing.discount,
      isDiscounted: planPricing.isDiscounted,
      formatted: planPricing.formatted
    };
    
  } catch (error) {
    console.error('Error calculating subscription cost:', error);
    throw error;
  }
};

/**
 * Get pricing comparison between tiers
 * @param {string} region - Region code
 * @returns {Object} Tier comparison
 */
const getTierComparison = async (region = 'US') => {
  try {
    const pricing = await getVIPPricing(region);
    const tiers = await VIPTier.getActiveTiers();

    const comparison = tiers.map(tier => {
      const tierPricing = pricing.pricing[tier.tierId];
      return {
        tierId: tier.tierId,
        name: tier.name,
        logo: tier.logo,
        description: tier.description,
        monthly: tierPricing.monthly,
        yearly: tierPricing.yearly,
        trending: tierPricing.trending,
        savings: tierPricing.savings,
        features: tier.features
      };
    });

    return {
      region,
      currency: pricing.currency,
      symbol: pricing.symbol,
      tiers: comparison,
      lastUpdated: new Date()
    };

  } catch (error) {
    console.error('Error getting tier comparison:', error);
    throw error;
  }
};

/**
 * Validate pricing for a subscription
 * @param {string} tierId - VIP tier ID
 * @param {string} plan - Plan type
 * @param {number} amount - Expected amount
 * @param {string} region - Region code
 * @param {string} userId - User ID for discount calculation
 * @param {boolean} excludePendingSubscription - Exclude pending subscriptions when checking first-time status
 * @returns {boolean} True if pricing is valid
 */
const validatePricing = async (tierId, plan, amount, region = 'US', userId = null, excludePendingSubscription = false) => {
  try {
    const cost = await calculateSubscriptionCost(tierId, plan, region, userId, excludePendingSubscription);
    const expectedAmount = Math.round(cost.amount * 100); // Convert to cents
    const actualAmount = Math.round(amount * 100);
    
    console.log('Pricing validation:', {
      tierId,
      plan,
      region,
      userId,
      excludePendingSubscription,
      expectedAmount,
      actualAmount,
      difference: Math.abs(expectedAmount - actualAmount)
    });
    
    return Math.abs(expectedAmount - actualAmount) < 1; // Allow 1 cent difference
  } catch (error) {
    console.error('Error validating pricing:', error);
    return false;
  }
};

module.exports = {
  getVIPPricing,
  calculateSubscriptionCost,
  getTierComparison,
  validatePricing,
  getApplicableDiscounts,
  REGIONAL_PRICING,
  TRENDING_PLANS,
  DISCOUNTS
};








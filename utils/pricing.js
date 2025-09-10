const VIPTier = require('../models/VIPTier');

// Regional pricing configuration
const REGIONAL_PRICING = {
  US: {
    currency: 'USD',
    symbol: '$',
    bronze: { monthly: 5.00, yearly: 50.00 },
    gold: { monthly: 10.00, yearly: 100.00 },
    platinum: { monthly: 20.00, yearly: 200.00 }
  },
  EU: {
    currency: 'EUR',
    symbol: '€',
    bronze: { monthly: 4.50, yearly: 45.00 },
    gold: { monthly: 9.00, yearly: 90.00 },
    platinum: { monthly: 18.00, yearly: 180.00 }
  },
  UK: {
    currency: 'GBP',
    symbol: '£',
    bronze: { monthly: 4.00, yearly: 40.00 },
    gold: { monthly: 8.00, yearly: 80.00 },
    platinum: { monthly: 16.00, yearly: 160.00 }
  },
  IN: {
    currency: 'INR',
    symbol: '₹',
    bronze: { monthly: 299, yearly: 2999 },
    gold: { monthly: 599, yearly: 5999 },
    platinum: { monthly: 1199, yearly: 11999 }
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
    bronze: { monthly: 0.1, yearly: 0.15 }, // 10% monthly, 15% yearly
    gold: { monthly: 0.1, yearly: 0.15 },
    platinum: { monthly: 0.1, yearly: 0.15 }
  },
  limited_time: {
    bronze: { monthly: 0.2, yearly: 0.25 }, // 20% monthly, 25% yearly
    gold: { monthly: 0.2, yearly: 0.25 },
    platinum: { monthly: 0.2, yearly: 0.25 }
  }
};

/**
 * Get VIP pricing for a specific region
 * @param {string} region - Region code (US, EU, UK, IN)
 * @param {string} userId - User ID for personalized pricing
 * @returns {Object} Pricing information
 */
const getVIPPricing = async (region = 'US', userId = null) => {
  try {
    const regionConfig = REGIONAL_PRICING[region] || REGIONAL_PRICING.US;
    const tiers = await VIPTier.getActiveTiers();
    
    const pricing = {};
    
    for (const tier of tiers) {
      const basePricing = regionConfig[tier.tierId];
      if (!basePricing) continue;
      
      // Check for discounts
      const discounts = await getApplicableDiscounts(tier.tierId, userId);
      
      pricing[tier.tierId] = {
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
          monthly: basePricing.yearly / 12 - basePricing.monthly,
          percentage: Math.round(((basePricing.yearly / 12 - basePricing.monthly) / basePricing.monthly) * 100)
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
const getApplicableDiscounts = async (tierId, userId) => {
  try {
    // Check if user is first-time subscriber
    const isFirstTime = await checkFirstTimeSubscriber(userId);
    
    // Check for limited-time offers
    const hasLimitedTimeOffer = await checkLimitedTimeOffer();
    
    let discounts = { monthly: 0, yearly: 0 };
    
    if (isFirstTime) {
      discounts = DISCOUNTS.first_time[tierId] || { monthly: 0, yearly: 0 };
    }
    
    if (hasLimitedTimeOffer) {
      const limitedTimeDiscounts = DISCOUNTS.limited_time[tierId] || { monthly: 0, yearly: 0 };
      // Use the higher discount
      discounts = {
        monthly: Math.max(discounts.monthly, limitedTimeDiscounts.monthly),
        yearly: Math.max(discounts.yearly, limitedTimeDiscounts.yearly)
      };
    }
    
    return discounts;
    
  } catch (error) {
    console.error('Error getting applicable discounts:', error);
    return { monthly: 0, yearly: 0 };
  }
};

/**
 * Check if user is a first-time subscriber
 * @param {string} userId - User ID
 * @returns {boolean} True if first-time subscriber
 */
const checkFirstTimeSubscriber = async (userId) => {
  if (!userId) return false;
  
  try {
    const VIPSubscription = require('../models/VIPSubscription');
    const existingSubscriptions = await VIPSubscription.find({ userId });
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
 * @param {string} plan - Plan type (monthly/yearly)
 * @param {string} region - Region code
 * @param {string} userId - User ID for discounts
 * @returns {Object} Cost calculation
 */
const calculateSubscriptionCost = async (tierId, plan, region = 'US', userId = null) => {
  try {
    const pricing = await getVIPPricing(region, userId);
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
 * @returns {boolean} True if pricing is valid
 */
const validatePricing = async (tierId, plan, amount, region = 'US') => {
  try {
    const cost = await calculateSubscriptionCost(tierId, plan, region);
    const expectedAmount = Math.round(cost.amount * 100); // Convert to cents
    const actualAmount = Math.round(amount * 100);
    
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



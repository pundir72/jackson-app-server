const VIPTier = require('../models/VIPTier');
const VIPSubscription = require('../models/VIPSubscription');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Weekly VIP Benefits Application System
 * Handles automatic application of weekly VIP benefits like XP bonuses and spin quotas
 */

/**
 * Apply weekly VIP benefits to all active subscribers
 * This function should be called by a cron job weekly
 */
const applyWeeklyVIPBenefits = async () => {
  try {
    console.log('Starting weekly VIP benefits application...');
    
    // Get all active VIP subscriptions
    const activeSubscriptions = await VIPSubscription.find({
      status: 'active',
      endDate: { $gt: new Date() }
    }).populate('userId', 'firstName lastName email');
    
    console.log(`Found ${activeSubscriptions.length} active VIP subscriptions`);
    
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const subscription of activeSubscriptions) {
      try {
        await applyWeeklyBenefitsToUser(subscription);
        results.successful++;
        console.log(`Applied weekly benefits to user ${subscription.userId._id}`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId: subscription.userId._id,
          error: error.message
        });
        console.error(`Failed to apply weekly benefits to user ${subscription.userId._id}:`, error.message);
      }
      results.processed++;
    }
    
    console.log('Weekly VIP benefits application completed:', results);
    return results;
    
  } catch (error) {
    console.error('Error in weekly VIP benefits application:', error);
    throw error;
  }
};

/**
 * Apply weekly benefits to a specific user
 * @param {Object} subscription - VIP subscription object
 */
const applyWeeklyBenefitsToUser = async (subscription) => {
  try {
    const userId = subscription.userId._id || subscription.userId;
    const tier = await VIPTier.getTierById(subscription.tier);
    
    if (!tier) {
      throw new Error(`VIP tier not found: ${subscription.tier}`);
    }
    
    const benefits = [];
    
    // Apply weekly XP bonus
    if (tier.features.weeklyXpBonus > 0) {
      await applyWeeklyXPBonus(userId, tier.features.weeklyXpBonus, subscription.tier);
      benefits.push({
        type: 'xp_bonus',
        amount: tier.features.weeklyXpBonus,
        description: `Weekly VIP ${subscription.tier} XP bonus`
      });
    }
    
    // Apply bonus spins
    if (tier.features.bonusSpins > 0) {
      await applyBonusSpins(userId, tier.features.bonusSpins, subscription.tier);
      benefits.push({
        type: 'bonus_spins',
        amount: tier.features.bonusSpins,
        description: `Weekly VIP ${subscription.tier} bonus spins`
      });
    }
    
    // Log the benefits application
    await logWeeklyBenefitsApplication(userId, subscription.tier, benefits);
    
    return benefits;
    
  } catch (error) {
    console.error('Error applying weekly benefits to user:', error);
    throw error;
  }
};

/**
 * Apply weekly XP bonus to user
 * @param {string} userId - User ID
 * @param {number} xpBonus - XP bonus amount
 * @param {string} tier - VIP tier
 */
const applyWeeklyXPBonus = async (userId, xpBonus, tier) => {
  try {
    // Update user's XP
    await User.findByIdAndUpdate(userId, {
      $inc: { 'xp.current': xpBonus }
    });
    
    // Create transaction record
    const transaction = new Transaction({
      user: userId,
      type: 'credit',
      amount: xpBonus,
      description: `Weekly VIP ${tier} XP bonus`,
      status: 'completed',
      referenceId: `vip_xp_${Date.now()}_${userId}`,
      metadata: {
        source: 'vip_weekly_benefit',
        tier: tier,
        benefitType: 'xp_bonus'
      }
    });
    
    await transaction.save();
    
    console.log(`Applied ${xpBonus} XP bonus to user ${userId}`);
    
  } catch (error) {
    console.error('Error applying weekly XP bonus:', error);
    throw error;
  }
};

/**
 * Apply bonus spins to user
 * @param {string} userId - User ID
 * @param {number} bonusSpins - Number of bonus spins
 * @param {string} tier - VIP tier
 */
const applyBonusSpins = async (userId, bonusSpins, tier) => {
  try {
    // Create transaction record for bonus spins
    const transaction = new Transaction({
      user: userId,
      type: 'credit',
      amount: bonusSpins,
      description: `Weekly VIP ${tier} bonus spins`,
      status: 'completed',
      referenceId: `vip_spins_${Date.now()}_${userId}`,
      metadata: {
        source: 'vip_weekly_benefit',
        tier: tier,
        benefitType: 'bonus_spins'
      }
    });
    
    await transaction.save();
    
    console.log(`Applied ${bonusSpins} bonus spins to user ${userId}`);
    
  } catch (error) {
    console.error('Error applying bonus spins:', error);
    throw error;
  }
};

/**
 * Log weekly benefits application
 * @param {string} userId - User ID
 * @param {string} tier - VIP tier
 * @param {Array} benefits - Applied benefits
 */
const logWeeklyBenefitsApplication = async (userId, tier, benefits) => {
  try {
    // This could be enhanced to log to a separate benefits log collection
    console.log(`Weekly benefits applied to user ${userId} (${tier}):`, benefits);
    
    // You could also create a benefits log entry in the database
    // const benefitsLog = new BenefitsLog({
    //   userId,
    //   tier,
    //   benefits,
    //   appliedAt: new Date()
    // });
    // await benefitsLog.save();
    
  } catch (error) {
    console.error('Error logging weekly benefits application:', error);
    // Don't throw error here as it's just logging
  }
};

/**
 * Get user's weekly benefits status
 * @param {string} userId - User ID
 * @returns {Object} Weekly benefits status
 */
const getWeeklyBenefitsStatus = async (userId) => {
  try {
    const activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!activeSubscription) {
      return {
        hasActiveSubscription: false,
        nextBenefitDate: null,
        benefits: []
      };
    }
    
    const tier = await VIPTier.getTierById(activeSubscription.tier);
    if (!tier) {
      return {
        hasActiveSubscription: false,
        nextBenefitDate: null,
        benefits: []
      };
    }
    
    // Calculate next benefit date (weekly from subscription start)
    const startDate = new Date(activeSubscription.startDate);
    const now = new Date();
    const weeksSinceStart = Math.floor((now - startDate) / (7 * 24 * 60 * 60 * 1000));
    const nextBenefitDate = new Date(startDate);
    nextBenefitDate.setDate(nextBenefitDate.getDate() + (weeksSinceStart + 1) * 7);
    
    // Get recent weekly benefits
    const recentBenefits = await Transaction.find({
      user: userId,
      'metadata.source': 'vip_weekly_benefit',
      createdAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 });
    
    return {
      hasActiveSubscription: true,
      tier: activeSubscription.tier,
      nextBenefitDate,
      benefits: tier.features.weeklyXpBonus > 0 || tier.features.bonusSpins > 0 ? [
        ...(tier.features.weeklyXpBonus > 0 ? [{
          type: 'xp_bonus',
          amount: tier.features.weeklyXpBonus,
          description: `Weekly VIP ${activeSubscription.tier} XP bonus`
        }] : []),
        ...(tier.features.bonusSpins > 0 ? [{
          type: 'bonus_spins',
          amount: tier.features.bonusSpins,
          description: `Weekly VIP ${activeSubscription.tier} bonus spins`
        }] : [])
      ] : [],
      recentBenefits: recentBenefits.map(benefit => ({
        type: benefit.metadata.benefitType,
        amount: benefit.amount,
        description: benefit.description,
        appliedAt: benefit.createdAt
      }))
    };
    
  } catch (error) {
    console.error('Error getting weekly benefits status:', error);
    return {
      hasActiveSubscription: false,
      nextBenefitDate: null,
      benefits: []
    };
  }
};

/**
 * Manually apply weekly benefits to a specific user (for testing or manual triggers)
 * @param {string} userId - User ID
 * @returns {Object} Application result
 */
const manuallyApplyWeeklyBenefits = async (userId) => {
  try {
    const subscription = await VIPSubscription.getActiveSubscription(userId);
    
    if (!subscription) {
      throw new Error('No active VIP subscription found for user');
    }
    
    const benefits = await applyWeeklyBenefitsToUser(subscription);
    
    return {
      success: true,
      userId,
      tier: subscription.tier,
      benefits
    };
    
  } catch (error) {
    console.error('Error manually applying weekly benefits:', error);
    return {
      success: false,
      userId,
      error: error.message
    };
  }
};

module.exports = {
  applyWeeklyVIPBenefits,
  applyWeeklyBenefitsToUser,
  getWeeklyBenefitsStatus,
  manuallyApplyWeeklyBenefits
};

/**
 * XP Decay V2 Utility
 * Handles XP decay logic based on admin-configured decay settings
 * @module utils/xpDecayV2
 */

const XPDecaySettingV2 = require('../models/XPDecaySettingV2');
const XPTierV2 = require('../models/XPTierV2');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * Check if user is inactive based on lastActive or lastLoginAt
 * @param {Object} user - User document
 * @param {Number} inactiveDurationDays - Number of days of inactivity required
 * @returns {Object} { isInactive: boolean, daysInactive: number, lastActivityDate: Date }
 */
function checkInactivity(user, inactiveDurationDays) {
  // Use lastActive if available, otherwise fall back to lastLoginAt
  const lastActivityDate = user.lastActive || user.lastLoginAt || user.createdAt;
  
  if (!lastActivityDate) {
    // If no activity date, consider user inactive
    return {
      isInactive: true,
      daysInactive: inactiveDurationDays + 1, // Force inactive
      lastActivityDate: user.createdAt || new Date()
    };
  }

  const now = new Date();
  const daysSinceActivity = Math.floor((now - new Date(lastActivityDate)) / (1000 * 60 * 60 * 24));
  
  return {
    isInactive: daysSinceActivity >= inactiveDurationDays,
    daysInactive: daysSinceActivity,
    lastActivityDate: new Date(lastActivityDate)
  };
}

/**
 * Apply XP decay to a user based on their tier and inactivity
 * @param {Object} user - User document
 * @param {Object} options - Options
 * @param {Boolean} options.forceCheck - Force check even if recently checked
 * @returns {Promise<Object>} Decay result
 */
async function applyXPDecay(user, options = {}) {
  try {
    const currentXp = user.xp?.current || 0;
    
    // Get user's tier from XP
    const tierDoc = await XPTierV2.findByXpValue(currentXp);
    if (!tierDoc) {
      return {
        applied: false,
        reason: 'No tier found for user XP',
        currentXp,
        newXp: currentXp,
        decayAmount: 0
      };
    }

    // Get decay setting for this tier
    const decaySetting = await XPDecaySettingV2.findByTier(tierDoc.tier);
    if (!decaySetting || !decaySetting.status) {
      return {
        applied: false,
        reason: `No active decay setting found for tier: ${tierDoc.tier}`,
        currentXp,
        newXp: currentXp,
        decayAmount: 0,
        tier: tierDoc.tier
      };
    }

    // Check if user is inactive
    const inactivityCheck = checkInactivity(user, decaySetting.inactiveDuration);
    if (!inactivityCheck.isInactive) {
      return {
        applied: false,
        reason: `User is not inactive. Days inactive: ${inactivityCheck.daysInactive}, Required: ${decaySetting.inactiveDuration}`,
        currentXp,
        newXp: currentXp,
        decayAmount: 0,
        tier: tierDoc.tier,
        daysInactive: inactivityCheck.daysInactive,
        requiredDays: decaySetting.inactiveDuration
      };
    }

    // Calculate decay
    const decayResult = decaySetting.calculateDecay(currentXp);
    if (!decayResult.canDecay || decayResult.decayAmount <= 0) {
      return {
        applied: false,
        reason: decayResult.reason || 'Decay calculation returned no decay',
        currentXp,
        newXp: currentXp,
        decayAmount: 0,
        tier: tierDoc.tier,
        daysInactive: inactivityCheck.daysInactive
      };
    }

    // Apply decay to user
    const newXp = decayResult.newXp;
    const oldXp = currentXp;
    
    // Ensure we have a Mongoose document (not lean object)
    let userDoc = user;
    if (!userDoc.save || userDoc.constructor.name === 'Object') {
      userDoc = await User.findById(user._id || user);
      if (!userDoc) {
        throw new Error('User not found');
      }
    }
    
    // Update user XP
    userDoc.xp.current = newXp;
    userDoc.xp.lastUpdated = new Date();
    await userDoc.save();

    // Create transaction record for decay
    const transaction = new Transaction({
      userId: user._id,
      type: 'xp_decay',
      amount: -decayResult.decayAmount, // Negative amount for deduction
      balance: {
        before: oldXp,
        after: newXp
      },
      metadata: {
        tier: tierDoc.tier,
        decayRuleType: decaySetting.decayRuleType,
        daysInactive: inactivityCheck.daysInactive,
        inactiveDuration: decaySetting.inactiveDuration,
        minimumXpLimit: decaySetting.minimumXpLimit,
        reason: 'XP decay due to inactivity'
      },
      status: 'completed',
      createdAt: new Date()
    });
    await transaction.save();

    // Send notification if configured
    if (decaySetting.sendNotification) {
      // TODO: Implement notification system
      // For now, we'll just log it
      console.log(`📢 XP Decay notification for user ${user._id}: ${decaySetting.notificationMessage}`);
    }

    return {
      applied: true,
      reason: 'XP decay applied successfully',
      currentXp: oldXp,
      newXp: newXp,
      decayAmount: decayResult.decayAmount,
      tier: tierDoc.tier,
      daysInactive: inactivityCheck.daysInactive,
      transactionId: transaction._id,
      notificationSent: decaySetting.sendNotification
    };
  } catch (error) {
    console.error('Error applying XP decay:', error);
    return {
      applied: false,
      reason: `Error: ${error.message}`,
      currentXp: user.xp?.current || 0,
      newXp: user.xp?.current || 0,
      decayAmount: 0,
      error: error.message
    };
  }
}

/**
 * Check decay status for a user without applying it
 * @param {Object} user - User document
 * @returns {Promise<Object>} Decay status
 */
async function checkDecayStatus(user) {
  try {
    const currentXp = user.xp?.current || 0;
    
    // Get user's tier from XP
    const tierDoc = await XPTierV2.findByXpValue(currentXp);
    if (!tierDoc) {
      return {
        canDecay: false,
        reason: 'No tier found for user XP',
        currentXp,
        tier: null
      };
    }

    // Get decay setting for this tier
    const decaySetting = await XPDecaySettingV2.findByTier(tierDoc.tier);
    if (!decaySetting || !decaySetting.status) {
      return {
        canDecay: false,
        reason: `No active decay setting found for tier: ${tierDoc.tier}`,
        currentXp,
        tier: tierDoc.tier,
        decaySetting: null
      };
    }

    // Check if user is inactive
    const inactivityCheck = checkInactivity(user, decaySetting.inactiveDuration);
    
    // Calculate potential decay
    const decayResult = decaySetting.calculateDecay(currentXp);

    return {
      canDecay: inactivityCheck.isInactive && decayResult.canDecay,
      reason: inactivityCheck.isInactive 
        ? (decayResult.canDecay ? 'User is inactive and decay can be applied' : decayResult.reason)
        : `User is not inactive. Days inactive: ${inactivityCheck.daysInactive}, Required: ${decaySetting.inactiveDuration}`,
      currentXp,
      tier: tierDoc.tier,
      daysInactive: inactivityCheck.daysInactive,
      requiredDays: decaySetting.inactiveDuration,
      isInactive: inactivityCheck.isInactive,
      decaySetting: {
        decayRuleType: decaySetting.decayRuleType,
        xpDeduction: decaySetting.xpDeduction,
        minimumXpLimit: decaySetting.minimumXpLimit,
        inactiveDuration: decaySetting.inactiveDuration
      },
      potentialDecay: decayResult.canDecay ? {
        decayAmount: decayResult.decayAmount,
        newXp: decayResult.newXp
      } : null
    };
  } catch (error) {
    console.error('Error checking decay status:', error);
    return {
      canDecay: false,
      reason: `Error: ${error.message}`,
      currentXp: user.xp?.current || 0,
      tier: null,
      error: error.message
    };
  }
}

/**
 * Process XP decay for all eligible users (for scheduled jobs)
 * @param {Object} options - Options
 * @param {Number} options.batchSize - Number of users to process per batch
 * @returns {Promise<Object>} Processing results
 */
async function processDecayForAllUsers(options = {}) {
  const batchSize = options.batchSize || 100;
  let processed = 0;
  let applied = 0;
  let errors = 0;

  try {
    // Get all active decay settings
    const decaySettings = await XPDecaySettingV2.getActiveSettings();
    if (decaySettings.length === 0) {
      return {
        success: true,
        processed: 0,
        applied: 0,
        errors: 0,
        message: 'No active decay settings found'
      };
    }

    // Process users in batches
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const users = await User.find({})
        .select('xp lastActive lastLoginAt createdAt')
        .skip(skip)
        .limit(batchSize);

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      for (const user of users) {
        try {
          processed++;
          const result = await applyXPDecay(user, { forceCheck: true });
          if (result.applied) {
            applied++;
          }
        } catch (error) {
          errors++;
          console.error(`Error processing decay for user ${user._id}:`, error);
        }
      }

      skip += batchSize;
      if (users.length < batchSize) {
        hasMore = false;
      }
    }

    return {
      success: true,
      processed,
      applied,
      errors,
      message: `Processed ${processed} users, applied decay to ${applied} users, ${errors} errors`
    };
  } catch (error) {
    console.error('Error processing decay for all users:', error);
    return {
      success: false,
      processed,
      applied,
      errors,
      error: error.message
    };
  }
}

module.exports = {
  applyXPDecay,
  checkDecayStatus,
  processDecayForAllUsers,
  checkInactivity
};


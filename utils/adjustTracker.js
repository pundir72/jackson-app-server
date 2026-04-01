/**
 * Adjust Event Tracker Utility
 * Provides standardized Adjust event tracking across the application
 */

const adjustService = require('../services/adjust.service');
const AdjustEventToken = require('../models/AdjustEventToken');

/**
 * Resolve actual Adjust event token from DB by event name.
 * Returns null (and logs a warning) if not found — never throws.
 */
const resolveToken = async (name) => {
  try {
    const record = await AdjustEventToken.findByName(name);
    return record ? record.token : null;
  } catch (err) {
    console.warn(`[Adjust Tracker] DB token lookup failed for "${name}":`, err.message);
    return null;
  }
};

/**
 * Track event to Adjust with standardized error handling
 * @param {string} eventToken - Adjust event token
 * @param {string} userId - User ID
 * @param {Object} additionalParams - Additional callback parameters
 * @param {string} deviceId - Device ID (optional)
 * @param {number} revenue - Revenue amount (optional)
 * @param {string} currency - Currency code (optional, default: USD)
 */
const trackEvent = async (eventToken, userId, additionalParams = {}, deviceId = null, revenue = null, currency = 'USD') => {
  try {
    const eventData = {
      eventToken,
      callbackParams: {
        user_id: userId,
        timestamp: new Date().toISOString(),
        ...additionalParams
      }
    };

    // Add device ID if provided
    if (deviceId) {
      eventData.deviceIds = {
        gps_adid: deviceId
      };
    }

    // Add revenue if provided
    if (revenue !== null && revenue > 0) {
      eventData.revenue = revenue;
      eventData.currency = currency;
    }

    console.log(`[Adjust Tracker] Tracking event: ${eventToken} for user: ${userId}`);
    await adjustService.sendEvent(eventData);
    console.log(`[Adjust Tracker] Successfully tracked: ${eventToken}`);
    
  } catch (error) {
    console.error(`[Adjust Tracker] Failed to track ${eventToken} for user ${userId}:`, error);
    // Don't throw - never fail main logic due to tracking error
  }
};

/**
 * Track revenue event to Adjust
 * @param {string} eventToken - Adjust event token
 * @param {string} userId - User ID
 * @param {number} revenue - Revenue amount
 * @param {string} currency - Currency code
 * @param {Object} additionalParams - Additional callback parameters
 * @param {string} deviceId - Device ID (optional)
 */
const trackRevenue = async (eventToken, userId, revenue, currency = 'USD', additionalParams = {}, deviceId = null) => {
  await trackEvent(eventToken, userId, additionalParams, deviceId, revenue, currency);
};

/**
 * Track user registration
 * @param {string} userId - User ID
 * @param {Object} registrationData - Registration data
 */
const trackRegistration = async (userId, registrationData = {}) => {
  // 'registration completed' is the exact name stored in AdjustEventToken DB (matches CSV)
  const token = await resolveToken('registration completed');
  if (!token) {
    console.warn('[Adjust Tracker] Token for "registration completed" not found in DB — event skipped');
    return;
  }
  await trackEvent(token, userId, {
    registration_method: registrationData.method || 'email',
    source: registrationData.source || 'direct',
    platform: registrationData.platform || 'mobile'
  }, registrationData.deviceId);
};

/**
 * Track survey completion
 * @param {string} userId - User ID
 * @param {Object} surveyData - Survey completion data
 */
const trackSurveyCompletion = async (userId, surveyData = {}) => {
  await trackEvent('survey_complete', userId, {
    provider: surveyData.provider || 'unknown',
    survey_id: surveyData.surveyId,
    reward_amount: surveyData.rewardAmount || 0,
    completion_duration: surveyData.duration
  }, surveyData.deviceId);
};

/**
 * Track game task completion
 * @param {string} userId - User ID
 * @param {Object} taskData - Task completion data
 */
const trackTaskCompletion = async (userId, taskData = {}) => {
  const eventToken = taskData.isBonusTask ? 'bonus_task_complete' : 'game_task_complete';
  await trackEvent(eventToken, userId, {
    game_id: taskData.gameId,
    task_id: taskData.taskId,
    task_type: taskData.isBonusTask ? 'bonus' : 'normal',
    reward_amount: taskData.rewardAmount || 0,
    task_name: taskData.taskName
  }, taskData.deviceId);
};

/**
 * Track cash withdrawal
 * @param {string} userId - User ID
 * @param {Object} withdrawalData - Withdrawal data
 */
const trackWithdrawal = async (userId, withdrawalData = {}) => {
  await trackRevenue('cash_withdrawal', userId, withdrawalData.amount, 'USD', {
    withdrawal_method: withdrawalData.method,
    withdrawal_count: withdrawalData.count || 1,
    processing_fee: withdrawalData.fee || 0
  }, withdrawalData.deviceId);
};

/**
 * Track VIP purchase
 * @param {string} userId - User ID
 * @param {Object} purchaseData - Purchase data
 */
const trackVIPPurchase = async (userId, purchaseData = {}) => {
  await trackRevenue('vip_purchase', userId, purchaseData.amount, purchaseData.currency || 'USD', {
    vip_tier: purchaseData.tier,
    subscription_type: purchaseData.type,
    payment_method: purchaseData.paymentMethod
  }, purchaseData.deviceId);
};

/**
 * Track achievement unlock
 * @param {string} userId - User ID
 * @param {Object} achievementData - Achievement data
 */
const trackAchievement = async (userId, achievementData = {}) => {
  await trackEvent('achievement_unlock', userId, {
    achievement_id: achievementData.achievementId,
    achievement_name: achievementData.name,
    achievement_category: achievementData.category,
    achievement_rarity: achievementData.rarity
  }, achievementData.deviceId);
};

/**
 * Track daily challenge completion
 * @param {string} userId - User ID
 * @param {Object} challengeData - Challenge data
 */
const trackDailyChallenge = async (userId, challengeData = {}) => {
  await trackEvent('daily_challenge_complete', userId, {
    challenge_date: challengeData.date,
    reward_amount: challengeData.rewardAmount || 0,
    streak_count: challengeData.streakCount || 1
  }, challengeData.deviceId);
};

module.exports = {
  trackEvent,
  trackRevenue,
  trackRegistration,
  trackSurveyCompletion,
  trackTaskCompletion,
  trackWithdrawal,
  trackVIPPurchase,
  trackAchievement,
  trackDailyChallenge
};
/**
 * Daily Reward Compatibility Layer for ADM-DR-001
 * Ensures 100% API compatibility with existing daily reward endpoints
 */

const { loadProgressFixed, calculateMidWeekJoinMetadataFixed } = require('./dailyRewardProgressFixed');

/**
 * Drop-in replacement for loadProgress that maintains full API compatibility
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for
 * @returns {Object|null} Progress object compatible with existing API
 */
async function loadProgressCompatible(userId, dateUtc = new Date()) {
  try {
    // Use the fixed logic
    const progress = await loadProgressFixed(userId, dateUtc);
    
    if (!progress) {
      return null;
    }

    // Ensure all required fields are present for API compatibility
    const compatibleProgress = {
      ...progress,
      // Ensure these fields always exist
      weekKey: progress.weekKey,
      weekStart: progress.weekStart,
      weekEnd: progress.weekEnd,
      days: progress.days || [],
      bigRewardEligible: progress.bigRewardEligible || false,
      bigRewardGranted: progress.bigRewardGranted || false,
      
      // Add any missing fields that existing API expects
      userId: progress.userId || userId,
      createdAt: progress.createdAt || new Date(),
      updatedAt: progress.updatedAt || new Date()
    };

    // Ensure days array has correct structure
    compatibleProgress.days = compatibleProgress.days.map((day, index) => ({
      dayNumber: day.dayNumber || (index + 1),
      status: day.status || 'locked',
      claimedAt: day.claimedAt || null,
      date: day.date || null,
      // Ensure any other fields that might be expected
      ...day
    }));

    return compatibleProgress;
    
  } catch (error) {
    console.error('Error in loadProgressCompatible:', error);
    return null;
  }
}

/**
 * Enhanced mid-week join metadata that's fully compatible with existing API
 * @param {Date} weekStart - Week start date
 * @param {Date} weekEnd - Week end date
 * @param {Date} userCreatedAt - User creation date
 * @param {boolean} isFirstWeek - Whether this is user's first week
 * @returns {Object} Compatible metadata object
 */
function calculateMidWeekJoinMetadataCompatible(weekStart, weekEnd, userCreatedAt, isFirstWeek = false) {
  try {
    // Use the fixed logic
    const metadata = calculateMidWeekJoinMetadataFixed(weekStart, weekEnd, userCreatedAt, isFirstWeek);
    
    // Ensure backward compatibility with existing API expectations
    return {
      ...metadata,
      // Maintain existing field names if they were different
      isMidWeekJoin: metadata.isMidWeekJoin || false,
      userCreatedDayIndex: metadata.userCreatedDayIndex,
      userCreatedDayNumber: metadata.userCreatedDayNumber,
      daysMissedBeforeJoin: metadata.daysMissedBeforeJoin || 0,
      daysAvailableAfterJoin: metadata.daysAvailableAfterJoin || 7,
      message: metadata.message || '',
      
      // Add new fields for enhanced functionality
      isFirstWeek: metadata.isFirstWeek || false,
      behavior: metadata.behavior || 'CALENDAR_WEEK',
      explanation: metadata.explanation || ''
    };
    
  } catch (error) {
    console.error('Error in calculateMidWeekJoinMetadataCompatible:', error);
    
    // Return safe fallback that matches existing API
    return {
      isMidWeekJoin: false,
      userCreatedDayIndex: null,
      userCreatedDayNumber: null,
      daysMissedBeforeJoin: 0,
      daysAvailableAfterJoin: 7,
      message: '',
      isFirstWeek: false,
      behavior: 'CALENDAR_WEEK',
      explanation: 'Using fallback metadata due to error'
    };
  }
}

/**
 * Wrapper function that can be used as a direct replacement in existing routes
 * Usage: Replace `await loadProgress(userId, date)` with `await loadProgressWrapper(userId, date)`
 */
async function loadProgressWrapper(userId, dateUtc = new Date()) {
  return await loadProgressCompatible(userId, dateUtc);
}

/**
 * Check if the fix should be enabled (feature flag support)
 * This allows gradual rollout or easy rollback if needed
 */
function isFirstWeekFixEnabled() {
  // Could be controlled by environment variable or database setting
  return process.env.ENABLE_FIRST_WEEK_FIX !== 'false';
}

/**
 * Smart progress loader that can fall back to original logic if needed
 * @param {string} userId - User ID
 * @param {Date} dateUtc - Date to load progress for
 * @param {Function} originalLoadProgress - Original loadProgress function (fallback)
 * @returns {Object|null} Progress object
 */
async function loadProgressSmart(userId, dateUtc = new Date(), originalLoadProgress = null) {
  try {
    // Check if fix is enabled
    if (!isFirstWeekFixEnabled()) {
      console.log('First week fix disabled, using original logic');
      return originalLoadProgress ? await originalLoadProgress(userId, dateUtc) : null;
    }

    // Try the fixed logic
    const progress = await loadProgressCompatible(userId, dateUtc);
    
    if (progress) {
      return progress;
    }

    // Fallback to original logic if available
    if (originalLoadProgress) {
      console.log('Fixed logic failed, falling back to original');
      return await originalLoadProgress(userId, dateUtc);
    }

    return null;
    
  } catch (error) {
    console.error('Error in loadProgressSmart:', error);
    
    // Try fallback if available
    if (originalLoadProgress) {
      try {
        console.log('Exception occurred, using fallback logic');
        return await originalLoadProgress(userId, dateUtc);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
    
    return null;
  }
}

module.exports = {
  loadProgressCompatible,
  calculateMidWeekJoinMetadataCompatible,
  loadProgressWrapper,
  loadProgressSmart,
  isFirstWeekFixEnabled
};
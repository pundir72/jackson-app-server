/**
 * Event Validation Middleware
 * Validates event progression (e.g., level numbers must be sequential)
 * Prevents fraudulent event reporting
 * @module middleware/eventValidation
 */

const User = require('../models/User');

/**
 * Validate level completion event
 * Ensures level numbers are sequential and not duplicates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const validateLevelEvent = async (req, res, next) => {
  const { levelNumber, eventType } = req.body;
  
  // Only validate if this is a level-related event
  if (eventType !== 'level_complete' && !levelNumber) {
    return next();
  }
  
  if (!levelNumber || typeof levelNumber !== 'number') {
    return res.status(400).json({
      success: false,
      error: 'levelNumber is required and must be a number for level_complete events',
      code: 'LEVEL_NUMBER_INVALID'
    });
  }

  if (levelNumber < 1) {
    return res.status(400).json({
      success: false,
      error: 'levelNumber must be greater than 0',
      code: 'LEVEL_NUMBER_INVALID'
    });
  }

  try {
    const userId = req.user?.userId || req.firebaseUser?.uid;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required',
        code: 'USER_NOT_AUTHENTICATED'
      });
    }

    // Find user by userId (could be MongoDB _id or Firebase UID)
    let user;
    if (userId.match(/^[0-9a-fA-F]{24}$/)) {
      // MongoDB ObjectId
      user = await User.findById(userId);
    } else {
      // Firebase UID
      user = await User.findOne({ 'metadata.firebaseUid': userId });
    }
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Get last completed level from user progress
    const lastLevel = user.progress?.lastLevel || 0;
    
    // Validate level progression
    if (levelNumber <= lastLevel) {
      return res.status(400).json({
        success: false,
        error: `Invalid level number. Must be greater than last completed level (${lastLevel}).`,
        code: 'LEVEL_NUMBER_INVALID',
        lastCompletedLevel: lastLevel,
        requestedLevel: levelNumber
      });
    }

    // Check for level skipping (optional: allow skipping if configured)
    const allowLevelSkipping = process.env.ALLOW_LEVEL_SKIPPING === 'true';
    if (!allowLevelSkipping && levelNumber > lastLevel + 1) {
      return res.status(400).json({
        success: false,
        error: `Level skipping not allowed. Expected level ${lastLevel + 1}, got ${levelNumber}.`,
        code: 'LEVEL_SKIPPING_NOT_ALLOWED',
        lastCompletedLevel: lastLevel,
        expectedLevel: lastLevel + 1,
        requestedLevel: levelNumber
      });
    }

    // Store validated level for later use
    req.validatedLevel = levelNumber;
    req.userDocument = user;
    
    next();
  } catch (error) {
    console.error('Error validating level event:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate event',
      code: 'VALIDATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate general event (checks for duplicates, timestamps, etc.)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
const validateEvent = async (req, res, next) => {
  const { eventType, eventId, timestamp } = req.body;
  
  // Validate event type
  const allowedEventTypes = [
    'level_complete',
    'game_complete',
    'achievement_unlocked',
    'purchase',
    'ad_revenue',
    'session_start',
    'custom'
  ];
  
  if (eventType && !allowedEventTypes.includes(eventType)) {
    return res.status(400).json({
      success: false,
      error: `Invalid event type. Allowed types: ${allowedEventTypes.join(', ')}`,
      code: 'EVENT_TYPE_INVALID'
    });
  }

  // Validate timestamp if provided (should not be in the future)
  if (timestamp) {
    const eventTime = new Date(timestamp);
    const now = new Date();
    
    if (eventTime > now) {
      return res.status(400).json({
        success: false,
        error: 'Event timestamp cannot be in the future',
        code: 'TIMESTAMP_INVALID'
      });
    }
    
    // Check if event is too old (more than 58 days, Adjust's limit)
    const daysDiff = (now - eventTime) / (1000 * 60 * 60 * 24);
    if (daysDiff > 58) {
      return res.status(400).json({
        success: false,
        error: 'Event timestamp is too old (more than 58 days)',
        code: 'TIMESTAMP_TOO_OLD'
      });
    }
  }

  // TODO: Add duplicate event detection using eventId
  // This would require storing event IDs in a cache or database
  
  next();
};

module.exports = {
  validateLevelEvent,
  validateEvent
};


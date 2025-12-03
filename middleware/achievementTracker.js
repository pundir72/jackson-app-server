const { trackAchievements } = require('../utils/achievements');

/**
 * Middleware to track achievements when users complete actions
 */
const achievementTracker = (category) => {
  return async (req, res, next) => {
    try {
      // Call the original route handler
      await next();
      
      // Track achievements after successful completion
      if (req.user && req.user.userId) {
        // Extract relevant data from request/response
        const data = extractAchievementData(req, res, category);
        
        // Track achievements asynchronously (don't wait for completion)
        setImmediate(() => {
          trackAchievements(req.user.userId, category, data)
            .catch(error => {
              console.error('Error tracking achievements:', error);
            });
        });
      }
    } catch (error) {
      // If there's an error, still call next to pass it to error handler
      next(error);
    }
  };
};

/**
 * Extract relevant data for achievement tracking based on category
 */
function extractAchievementData(req, res, category) {
  const data = {
    category,
    timestamp: new Date()
  };
  
  switch (category) {
    case 'games':
      data.completed = req.body?.completed || false;
      data.gameId = req.body?.gameId || req.params?.gameId;
      break;
      
    case 'surveys':
      data.completed = req.body?.completed || false;
      data.surveyId = req.body?.surveyId || req.params?.surveyId;
      break;
      
    case 'races':
      data.completed = req.body?.completed || false;
      data.raceId = req.body?.raceId || req.params?.raceId;
      break;
      
    case 'streak':
      data.taskType = req.body?.taskType;
      data.taskId = req.body?.taskId;
      break;
      
    case 'xp':
      data.xpEarned = req.body?.xpEarned || res.locals?.xpEarned;
      data.source = req.body?.source || 'task';
      break;
      
    case 'wallet':
      data.coinsEarned = req.body?.coinsEarned || res.locals?.coinsEarned;
      data.source = req.body?.source || 'task';
      break;
      
    default:
      // Generic data extraction
      data.completed = req.body?.completed || false;
      data.source = req.body?.source || 'unknown';
  }
  
  return data;
}

/**
 * Specific middleware for different action types
 */
const trackGameAchievements = achievementTracker('games');
const trackSurveyAchievements = achievementTracker('surveys');
const trackRaceAchievements = achievementTracker('races');
const trackStreakAchievements = achievementTracker('streak');
const trackXPAchievements = achievementTracker('xp');
const trackWalletAchievements = achievementTracker('wallet');

module.exports = {
  achievementTracker,
  trackGameAchievements,
  trackSurveyAchievements,
  trackRaceAchievements,
  trackStreakAchievements,
  trackXPAchievements,
  trackWalletAchievements
};

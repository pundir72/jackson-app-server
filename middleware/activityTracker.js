/**
 * Activity Tracker Middleware
 * Automatically tracks user activity on protected routes
 * @module middleware/activityTracker
 */

const { trackUserActivity } = require('../utils/dailyActivityTracker');

/**
 * Middleware to track user activity
 * Should be used after auth middleware to ensure user is authenticated
 */
function trackActivity(req, res, next) {
  // Only track activity for authenticated users
  if (req.user && req.user.userId) {
    // Track activity asynchronously without blocking the request
    trackUserActivity(req.user.userId, {
      endpoint: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    }).catch(error => {
      // Log error but don't fail the request
      console.error('Activity tracking error:', error);
    });
  }
  
  next();
}

/**
 * Middleware to track activity only for specific routes
 * @param {Array} routes - Array of route patterns to track
 */
function trackActivityForRoutes(routes = []) {
  return (req, res, next) => {
    const shouldTrack = routes.some(route => {
      if (typeof route === 'string') {
        return req.path.startsWith(route);
      } else if (route instanceof RegExp) {
        return route.test(req.path);
      }
      return false;
    });

    if (shouldTrack && req.user && req.user.userId) {
      trackUserActivity(req.user.userId, {
        endpoint: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
      }).catch(error => {
        console.error('Activity tracking error:', error);
      });
    }
    
    next();
  };
}

/**
 * Middleware to track activity with custom options
 * @param {Object} options - Tracking options
 */
function trackActivityWithOptions(options = {}) {
  return (req, res, next) => {
    if (req.user && req.user.userId) {
      const trackingData = {
        endpoint: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        ...options
      };

      trackUserActivity(req.user.userId, trackingData).catch(error => {
        console.error('Activity tracking error:', error);
      });
    }
    
    next();
  };
}

module.exports = {
  trackActivity,
  trackActivityForRoutes,
  trackActivityWithOptions
};






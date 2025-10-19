/**
 * Protected Route Activity Tracker Middleware
 * This middleware should be used on routes that have authentication
 * @module middleware/protectedRouteTracker
 */

const { trackUserActivity } = require('../utils/dailyActivityTracker');

/**
 * Middleware to track user activity on protected routes
 * This middleware should be used AFTER authentication middleware
 */
function protectedRouteTracker(req, res, next) {
  // Only track activity for authenticated users
  if (req.user && req.user.userId) {
    console.log('Protected route tracker - User ID:', req.user.userId, 'Route:', req.path);
    
    // Skip tracking for certain routes that don't represent user activity
    const skipRoutes = [
      '/api/daily-activity/stats',
      '/api/daily-activity/history',
      '/api/daily-activity/check/',
      '/api/daily-activity/leaderboard',
      '/api/auth/login',
      '/api/auth/signup',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/webhooks/',
      '/api/admin/',
      '/api/test/'
    ];

    const shouldSkip = skipRoutes.some(route => {
      if (route.endsWith('/')) {
        return req.path.startsWith(route);
      }
      return req.path === route || req.path.startsWith(route + '/');
    });

    if (!shouldSkip) {
      console.log('Tracking activity for user:', req.user.userId, 'on route:', req.path);
      // Track activity asynchronously without blocking the request
      trackUserActivity(req.user.userId, {
        endpoint: req.path,
        method: req.method,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        timestamp: new Date(),
        source: 'protected_route_middleware'
      }).catch(error => {
        // Log error but don't fail the request
        console.error('Protected route activity tracking error:', error);
      });
    } else {
      console.log('Skipping activity tracking for user:', req.user.userId, 'on route:', req.path);
    }
  } else {
    console.log('No user found in request - skipping activity tracking for route:', req.path);
  }
  
  next();
}

module.exports = {
  protectedRouteTracker
};







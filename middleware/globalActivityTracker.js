/**
 * Global Activity Tracker Middleware
 * Automatically tracks user activity for all protected routes
 * @module middleware/globalActivityTracker
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { trackUserActivity } = require('../utils/dailyActivityTracker');

/**
 * Global middleware to track user activity on all API routes
 * This middleware extracts user info from JWT token and tracks activity
 */
function globalActivityTracker(req, res, next) {
  // Only track activity for API routes
  if (req.path.startsWith('/api/')) {
    let userId = null;
    
    // Try to get user ID from req.user (if auth middleware already ran)
    if (req.user && req.user.userId) {
      userId = req.user.userId;
      console.log('User ID from req.user:', userId);
    } else {
      // Extract user ID from JWT token directly
      try {
        // Try to get token from x-auth-token header first
        let token = req.header('x-auth-token');
        
        // If not found, try Authorization header (Bearer token)
        if (!token) {
          token = req.header('Authorization');
          if (token && token.startsWith('Bearer ')) {
            token = token.replace('Bearer ', '');
          }
        }
        
        // Also try to get token from query params or body as fallback
        if (!token) {
          token = req.query.token || req.body.token;
        }
        
        if (token) {
          // Verify and decode token
          const decoded = jwt.verify(token, config.JWT_SECRET);
          if (decoded && decoded.userId) {
            userId = decoded.userId;
            console.log('User ID from JWT token:', userId);
          }
        }
      } catch (error) {
        // Token is invalid or missing - that's okay, we'll just skip tracking
        console.log('No valid token found for activity tracking on route:', req.path);
      }
    }
    
    // If we have a user ID, proceed with tracking
    if (userId) {
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
        console.log('Tracking activity for user:', userId, 'on route:', req.path);
        // Track activity asynchronously without blocking the request
        trackUserActivity(userId, {
          endpoint: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          timestamp: new Date(),
          source: 'global_middleware'
        }).catch(error => {
          // Log error but don't fail the request
          console.error('Global activity tracking error:', error);
        });
      } else {
        console.log('Skipping activity tracking for user:', userId, 'on route:', req.path);
      }
    } else {
      console.log('No user ID found - skipping activity tracking for route:', req.path);
    }
  }
  
  next();
}

/**
 * Global middleware to track user activity with custom options
 * @param {Object} options - Tracking options
 */
function globalActivityTrackerWithOptions(options = {}) {
  return (req, res, next) => {
    // Only track activity for authenticated users on API routes
    if (req.user && req.user.userId && req.path.startsWith('/api/')) {
      // Skip tracking for certain routes
      const skipRoutes = options.skipRoutes || [
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
        const trackingData = {
          endpoint: req.path,
          method: req.method,
          userAgent: req.headers['user-agent'],
          ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
          timestamp: new Date(),
          source: 'global_middleware',
          ...options
        };

        trackUserActivity(req.user.userId, trackingData).catch(error => {
          console.error('Global activity tracking error:', error);
        });
      }
    }
    
    next();
  };
}

module.exports = {
  globalActivityTracker,
  globalActivityTrackerWithOptions
};

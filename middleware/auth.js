const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { generateError } = require('../utils/error');
const User = require('../models/User');

module.exports = async (req, res, next) => {
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
    
    // Check if no token
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'No token, authorization denied',
          statusCode: 401
        }
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Check if decoded token has required fields
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token format',
          statusCode: 401
        }
      });
    }
    
    // Check if user account status allows access (only active users can access protected routes)
    const user = await User.findById(decoded.userId);
    if (user && user.role === 'USER' && user.profile && user.profile.status !== 'active') {
      const status = user.profile.status;
      const statusReason = user.profile.statusReason;
      
      let message = 'Your account is not active. Please contact support for more information.';
      if (status === 'suspended') {
        message = statusReason || 'Your account has been suspended. Please contact support for more information.';
      } else if (status === 'paused') {
        message = statusReason || 'Your account has been paused. Please contact support for more information.';
      } else if (status === 'inactive') {
        message = 'Your account is inactive. Please contact support to reactivate your account.';
      }
      
      return res.status(403).json({
        success: false,
        error: {
          message: 'Account not active',
          details: message,
          accountStatus: status,
          statusReason: statusReason
        }
      });
    }
    
    // Add user to request object
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({
      success: false,
      error: {
        message: 'Token is not valid',
        statusCode: 401,
        stack: err.stack
      }
    });
  }
};

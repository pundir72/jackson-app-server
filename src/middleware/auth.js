const { verifyToken } = require('../utils/helpers');
const User = require('../models/User');
const logger = require('../utils/logger');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
        statusCode: 401,
      });
    }

    // Extract token
    const token = authHeader.substring(7);

    // Verify token
    const decoded = verifyToken(token);

    // Check if user exists and is active
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token or user inactive.',
        statusCode: 401,
      });
    }

    // Add user to request object
    req.user = user;
    req.userId = user.id;

    // Update last activity
    await user.updateLastActivity();

    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token.',
      statusCode: 401,
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId);

    if (user && user.isActive) {
      req.user = user;
      req.userId = user.id;
      await user.updateLastActivity();
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// VIP-only middleware
const vipMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
      statusCode: 401,
    });
  }

  if (!req.user.isVip) {
    return res.status(403).json({
      success: false,
      message: 'VIP membership required for this feature.',
      statusCode: 403,
    });
  }

  next();
};

// Admin middleware (for future admin features)
const adminMiddleware = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.',
      statusCode: 401,
    });
  }

  // Add admin check logic here when needed
  // if (!req.user.isAdmin) {
  //   return res.status(403).json({
  //     success: false,
  //     message: 'Admin access required.',
  //     statusCode: 403,
  //   });
  // }

  next();
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  vipMiddleware,
  adminMiddleware,
}; 
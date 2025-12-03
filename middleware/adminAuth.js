const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

/**
 * Admin Authentication Middleware
 * Same as auth.js but checks for ADMIN role
 */
const adminAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header (same as auth.js)
    let token = req.header('Authorization');
    
    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No admin token provided',
        statusCode: 401
      });
    }

    // Extract token
    token = token.replace('Bearer ', '');
    // Verify token (same as auth.js)
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Check if decoded token has required fields
    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format',
        statusCode: 401
      });
    }

    // Check if user has ADMIN role
    const user = await User.findById(decoded.userId).select('role email');
    if (!user) {
      console.error('Admin auth: User not found for userId:', decoded.userId);
      return res.status(403).json({
        success: false,
        message: 'User not found',
        statusCode: 403
      });
    }
    
    console.log('Admin auth check - User:', user.email, 'Role:', user.role);
    
    if (user.role !== 'ADMIN') {
      console.error('Admin auth: User does not have ADMIN role. Current role:', user.role);
      return res.status(403).json({
        success: false,
        message: 'Admin privileges required',
        statusCode: 403,
        debug: {
          userId: decoded.userId,
          userEmail: user.email,
          currentRole: user.role,
          requiredRole: 'ADMIN'
        }
      });
    }
    
    // Add user to request object (same as auth.js)
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Admin auth middleware error:', err.message);
    return res.status(401).json({
      success: false,
      message: 'Token is not valid',
      statusCode: 401
    });
  }
};

module.exports = {
  adminAuth
};
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { generateError } = require('../utils/error');

module.exports = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('x-auth-token');
    
    // Check if no token
    if (!token) {
      throw generateError('No token, authorization denied', 401);
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Add user to request object
    req.user = decoded;
    next();
  } catch (err) {
    throw generateError('Token is not valid', 401);
  }
};

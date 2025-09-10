const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth');

// Test authentication endpoint
router.get('/test-auth', protect, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication successful',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Test authentication without middleware (for debugging)
router.get('/test-auth-debug', (req, res) => {
  const authHeader = req.header('Authorization');
  const xAuthToken = req.header('x-auth-token');
  const queryToken = req.query.token;
  const bodyToken = req.body.token;
  
  res.json({
    success: true,
    message: 'Debug info',
    headers: {
      'Authorization': authHeader,
      'x-auth-token': xAuthToken
    },
    query: {
      token: queryToken
    },
    body: {
      token: bodyToken
    },
    allHeaders: req.headers
  });
});

module.exports = router;

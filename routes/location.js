const express = require('express');
const router = express.Router();
const User = require('../models/User');
const protect = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Update location settings
router.post('/settings', async (req, res) => {
  try {
    const { mobile, status, mode } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    // Validate status and mode
    const validStatus = ['granted', 'denied', 'not_asked'];
    const validModes = ['always', 'while_using', 'once', 'never'];

    if (status && !validStatus.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    if (mode && !validModes.includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode value' });
    }

    // Update user's location settings
    const update = {
      'locationSettings.status': status || 'not_asked',
      'locationSettings.mode': mode || 'never'
    };

    if (status === 'granted') {
      update['locationSettings.lastGrantedAt'] = new Date();
    }

    const user = await User.findOneAndUpdate(
      { mobile },
      update,
      { upsert: true, new: true }
    );

    // Log the event
    console.log(`Location settings updated for user ${mobile}:`, {
      status,
      mode
    });

    res.status(200).json({ 
      message: 'Location settings updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location settings' });
  }
});

// Get current location settings
router.get('/settings/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      status: user.locationSettings.status,
      mode: user.locationSettings.mode,
      lastGrantedAt: user.locationSettings.lastGrantedAt,
      ipLocation: user.locationSettings.ipLocation,
      fallbackLocation: user.locationSettings.fallbackLocation
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch location settings' });
  }
});

// IP-based location fallback
router.post('/ip-location', async (req, res) => {
  try {
    const { mobile, country, city, latitude, longitude } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    const update = {
      'locationSettings.ipLocation': {
        country,
        city,
        latitude,
        longitude
      },
      'locationSettings.fallbackLocation': {
        enabled: true,
        lastUsed: new Date(),
        reason: 'IP-based fallback location'
      }
    };

    const user = await User.findOneAndUpdate(
      { mobile },
      update,
      { upsert: true, new: true }
    );

    res.status(200).json({ 
      message: 'IP location updated successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update IP location' });
  }
});

// Get location status for analytics
router.get('/analytics/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      status: user.locationSettings.status,
      mode: user.locationSettings.mode,
      lastGrantedAt: user.locationSettings.lastGrantedAt,
      fallbackLocation: user.locationSettings.fallbackLocation.enabled
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Update current location
router.post('/update', protect, async (req, res) => {
    try {
        const { latitude, longitude, accuracy, timestamp } = req.body;
        const userId = req.user.userId;

        // Validate coordinates
        if (latitude && (latitude < -90 || latitude > 90)) {
            return res.status(400).json({ error: 'Invalid latitude value' });
        }

        if (longitude && (longitude < -180 || longitude > 180)) {
            return res.status(400).json({ error: 'Invalid longitude value' });
        }

        // Find user from MongoDB
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Initialize location if it doesn't exist
        if (!user.location) {
            user.location = {
                current: {},
                history: []
            };
        }

        // Update current location
        user.location.current = {
            latitude,
            longitude,
            accuracy: accuracy || 0,
            timestamp: timestamp || new Date()
        };

        // Add to history
        user.location.history.push({
            latitude,
            longitude,
            accuracy: accuracy || 0,
            timestamp: timestamp || new Date()
        });

        // Keep only last 100 locations in history
        if (user.location.history.length > 100) {
            user.location.history = user.location.history.slice(-100);
        }

        await user.save();

        // Log the location update
        console.log(`Location updated for user ${user.userId} (mobile: ${user.mobile}):`, {
            latitude,
            longitude,
            accuracy,
            timestamp: timestamp || new Date()
        });

        res.status(200).json({ 
            message: 'Location updated successfully',
            location: user.location.current
        });
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});

// Get location history
router.get('/history', protect, async (req, res) => {
    try {
        const { startDate, endDate, limit = 100 } = req.query;
        const userId = req.user.userId;

        // Find user from MongoDB
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Filter history based on date range if provided
        let history = [...user.location.history];

        if (startDate || endDate) {
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            
            history = history.filter(location => {
                const locDate = new Date(location.timestamp);
                return locDate >= start && locDate <= end;
            });
        }

        // Sort by timestamp (newest first) and limit results
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        history = history.slice(0, parseInt(limit));

        res.status(200).json({
            history,
            total: history.length
        });
    } catch (error) {
        console.error('Error fetching location history:', error);
        res.status(500).json({ error: 'Failed to fetch location history' });
    }
});

module.exports = router;

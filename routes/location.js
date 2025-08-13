const express = require('express');
const router = express.Router();
const User = require('../models/User');
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

module.exports = router;

const express = require('express');
const router = express.Router();
const Disclosure = require('../models/Disclosure');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');
const protect = require('../middleware/auth');


// Get disclosure content
router.get('/', async (req, res) => {
  try {
    const disclosures = await Disclosure.find({ active: true })
      .sort({ category: 1 });
    
    if (!disclosures || disclosures.length === 0) {
      return res.status(404).json({ error: 'Disclosure content not found' });
    }

    res.status(200).json(disclosures);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch disclosure content' });
  }
});

// Record disclosure acceptance
router.post('/accept', protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get the latest disclosure version
    const latestDisclosure = await Disclosure.findOne({ active: true })
      .sort({ createdAt: -1 });
    
    if (!latestDisclosure) {
      return res.status(500).json({ error: 'No active disclosure version found' });
    }

    // Update user's disclosure acceptance
    const user = await User.findByIdAndUpdate(
      userId,
      {
        disclosureAccepted: true,
        disclosureAcceptedAt: new Date(),
        disclosureVersion: latestDisclosure.version
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.disclosureAccepted = true;
    user.disclosureAcceptedAt = new Date();
    user.disclosureVersion = latestDisclosure.version;
    await user.save();

    // Log the event
    console.log(`Disclosure accepted by user ${user.mobile} at ${new Date()}`);

    res.status(200).json({ 
      message: 'Disclosure accepted successfully',
      user
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record disclosure acceptance' });
  }
});

// Check if disclosure needs to be shown
router.get('/required/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    const user = await User.findOne({ mobile });

    // If user doesn't exist or hasn't accepted disclosure, show it
    if (!user || !user.disclosureAccepted) {
      return res.status(200).json({ 
        required: true,
        message: 'Disclosure must be accepted before proceeding' 
      });
    }

    res.status(200).json({ required: false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check disclosure requirement' });
  }
});

// Get all disclosures
router.get('/list', async (req, res) => {
    try {
        const disclosures = await Disclosure.find()
            .sort({ createdAt: -1 });
        
        res.status(200).json(disclosures);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch disclosures' });
    }
});

module.exports = router;

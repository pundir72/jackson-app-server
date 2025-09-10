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
      return res.status(404).json({ 
        success: false,
        error: 'Disclosure content not found' 
      });
    }

    // Format response to match frontend requirements
    const formattedDisclosures = disclosures.map(disclosure => ({
      id: disclosure._id,
      title: disclosure.title,
      description: disclosure.description,
      category: disclosure.category,
      version: disclosure.version
    }));

    res.status(200).json({
      success: true,
      data: {
        title: 'Prominent Disclosure',
        disclosures: formattedDisclosures,
        version: disclosures[0]?.version || '1.0'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch disclosure content' 
    });
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

    // Log the event and analytics
    console.log(`Disclosure accepted by user ${user.mobile} at ${new Date()}`);
    
    // Analytics event (if analytics service is available)
    try {
      // This would integrate with your analytics service
      console.log('Analytics Event: disclosure_acknowledged', {
        userId: user._id,
        mobile: user.mobile,
        timestamp: new Date(),
        version: latestDisclosure.version
      });
    } catch (analyticsError) {
      console.warn('Analytics tracking failed:', analyticsError.message);
    }

    res.status(200).json({ 
      success: true,
      message: 'Disclosure accepted successfully',
      data: {
        disclosureAccepted: true,
        disclosureAcceptedAt: user.disclosureAcceptedAt,
        disclosureVersion: user.disclosureVersion
      }
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
        success: true,
        data: {
          required: true,
          message: 'Disclosure must be accepted before proceeding',
          canProceed: false
        }
      });
    }

    res.status(200).json({ 
      success: true,
      data: {
        required: false,
        canProceed: true,
        disclosureAcceptedAt: user.disclosureAcceptedAt,
        disclosureVersion: user.disclosureVersion
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to check disclosure requirement' 
    });
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

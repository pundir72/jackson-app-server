const express = require('express');
const router = express.Router();
const XPDecaySettingV2 = require('../models/XPDecaySettingV2');
const XPTierV2 = require('../models/XPTierV2');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * Helper function to get XP Range from XPTierV2 model
 * Auto-populates XP range based on selected tier
 */
async function getXpRangeFromTier(tier) {
  try {
    const tierDoc = await XPTierV2.findOne({ tier, status: true });
    
    if (!tierDoc) {
      throw new Error(`Tier ${tier} not found in XPTierV2`);
    }

    return {
      xpRange: tierDoc.xpRange,
      xpMin: tierDoc.xpMin,
      xpMax: tierDoc.xpMax
    };
  } catch (error) {
    console.error('Error fetching XP range from tier:', error);
    throw error;
  }
}

/* ========================================
   XP DECAY SETTINGS V2 APIs
======================================== */

// Get all XP Decay Settings V2
router.get('/xp-decay-v2', async (req, res) => {
  try {
    const { status, tier, decayRuleType } = req.query;
    
    let query = {};
    if (status !== undefined) {
      query.status = status === 'true';
    }
    if (tier) {
      query.tier = tier;
    }
    if (decayRuleType) {
      query.decayRuleType = decayRuleType;
    }

    const settings = await XPDecaySettingV2.find(query)
      .sort({ xpMin: 1 })
      .lean();

    res.json({
      success: true,
      data: settings,
      total: settings.length
    });
  } catch (error) {
    console.error('Error fetching XP Decay Settings V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Decay Settings V2'
    });
  }
});

// Get single XP Decay Setting V2
router.get('/xp-decay-v2/:id', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found'
      });
    }

    res.json({
      success: true,
      data: setting
    });
  } catch (error) {
    console.error('Error fetching XP Decay Setting V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Decay Setting V2'
    });
  }
});

// Create new XP Decay Setting V2
router.post('/xp-decay-v2', async (req, res) => {
  try {
    const {
      tier,
      decayRuleType,
      xpDeduction,
      inactiveDuration,
      minimumXpLimit,
      status = true,
      sendNotification = true,
      notificationMessage
    } = req.body;

    // Validation
    if (!tier) {
      return res.status(400).json({
        success: false,
        error: 'Tier is required. Must be one of: Junior, Middle, Senior'
      });
    }

    if (!['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be one of: Junior, Middle, Senior'
      });
    }

    if (!decayRuleType || !['Fixed', 'Stepwise'].includes(decayRuleType)) {
      return res.status(400).json({
        success: false,
        error: 'Decay Rule Type is required. Must be one of: Fixed, Stepwise'
      });
    }

    if (xpDeduction === undefined || xpDeduction === null || xpDeduction < 0) {
      return res.status(400).json({
        success: false,
        error: 'XP Deduction is required and must be >= 0'
      });
    }

    if (inactiveDuration === undefined || inactiveDuration === null || inactiveDuration < 1) {
      return res.status(400).json({
        success: false,
        error: 'Inactive Duration is required and must be >= 1 day'
      });
    }

    if (minimumXpLimit === undefined || minimumXpLimit === null || minimumXpLimit < 0) {
      return res.status(400).json({
        success: false,
        error: 'Minimum XP Limit is required and must be >= 0'
      });
    }

    // Check for duplicate tier (only 1 entry per tier allowed)
    const existingSetting = await XPDecaySettingV2.findOne({ tier });
    if (existingSetting) {
      // If duplicate found, return the existing setting for editing
      return res.status(400).json({
        success: false,
        error: 'Decay setting for this tier already exists. Only one entry per tier is allowed.',
        data: existingSetting,
        existingId: existingSetting._id,
        message: 'Use PUT /api/admin/rewards/xp-decay-v2/:id to update the existing setting'
      });
    }

    // Auto-populate XP Range from XPTierV2
    let xpRangeData;
    try {
      xpRangeData = await getXpRangeFromTier(tier);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: `Tier ${tier} not found in XP Tier V2. Please create the tier first.`
      });
    }

    const newSetting = new XPDecaySettingV2({
      tier,
      xpRange: xpRangeData.xpRange,
      xpMin: xpRangeData.xpMin,
      xpMax: xpRangeData.xpMax,
      decayRuleType,
      xpDeduction,
      inactiveDuration,
      minimumXpLimit,
      status,
      sendNotification: sendNotification !== undefined ? sendNotification : true,
      notificationMessage: notificationMessage || 'Your XP will decay due to inactivity. Stay active to maintain your tier!'
    });

    await newSetting.save();

    res.status(201).json({
      success: true,
      data: newSetting,
      message: 'XP Decay Setting V2 created successfully'
    });
  } catch (error) {
    console.error('Error creating XP Decay Setting V2:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Decay setting for this tier already exists. Only one entry per tier is allowed.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create XP Decay Setting V2',
      details: error.message
    });
  }
});

// Update XP Decay Setting V2
router.put('/xp-decay-v2/:id', async (req, res) => {
  try {
    const {
      tier,
      decayRuleType,
      xpDeduction,
      inactiveDuration,
      minimumXpLimit,
      status,
      sendNotification,
      notificationMessage
    } = req.body;

    const setting = await XPDecaySettingV2.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found'
      });
    }

    // Validation
    if (tier !== undefined && !['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be one of: Junior, Middle, Senior'
      });
    }

    if (decayRuleType !== undefined && !['Fixed', 'Stepwise'].includes(decayRuleType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Decay Rule Type. Must be one of: Fixed, Stepwise'
      });
    }

    if (xpDeduction !== undefined && (xpDeduction < 0 || xpDeduction === null)) {
      return res.status(400).json({
        success: false,
        error: 'XP Deduction must be >= 0'
      });
    }

    if (inactiveDuration !== undefined && (inactiveDuration < 1 || inactiveDuration === null)) {
      return res.status(400).json({
        success: false,
        error: 'Inactive Duration must be >= 1 day'
      });
    }

    if (minimumXpLimit !== undefined && (minimumXpLimit < 0 || minimumXpLimit === null)) {
      return res.status(400).json({
        success: false,
        error: 'Minimum XP Limit must be >= 0'
      });
    }

    // Check for duplicate tier if tier is being changed
    if (tier && tier !== setting.tier) {
      const existingSetting = await XPDecaySettingV2.findOne({ 
        tier,
        _id: { $ne: req.params.id }
      });
      if (existingSetting) {
        return res.status(400).json({
          success: false,
          error: 'Decay setting for this tier already exists. Only one entry per tier is allowed.'
        });
      }
    }

    // Update fields
    if (tier !== undefined) {
      setting.tier = tier;
      // Auto-update XP Range when tier changes
      try {
        const xpRangeData = await getXpRangeFromTier(tier);
        setting.xpRange = xpRangeData.xpRange;
        setting.xpMin = xpRangeData.xpMin;
        setting.xpMax = xpRangeData.xpMax;
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: `Tier ${tier} not found in XP Tier V2. Please create the tier first.`
        });
      }
    }
    if (decayRuleType !== undefined) setting.decayRuleType = decayRuleType;
    if (xpDeduction !== undefined) setting.xpDeduction = xpDeduction;
    if (inactiveDuration !== undefined) setting.inactiveDuration = inactiveDuration;
    if (minimumXpLimit !== undefined) setting.minimumXpLimit = minimumXpLimit;
    if (status !== undefined) setting.status = status;
    if (sendNotification !== undefined) setting.sendNotification = sendNotification;
    if (notificationMessage !== undefined) setting.notificationMessage = notificationMessage;

    await setting.save();

    res.json({
      success: true,
      data: setting,
      message: 'XP Decay Setting V2 updated successfully'
    });
  } catch (error) {
    console.error('Error updating XP Decay Setting V2:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Decay setting for this tier already exists. Only one entry per tier is allowed.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update XP Decay Setting V2',
      details: error.message
    });
  }
});

// Delete XP Decay Setting V2
router.delete('/xp-decay-v2/:id', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found'
      });
    }

    await XPDecaySettingV2.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'XP Decay Setting V2 deleted successfully',
      data: { id: setting._id, tier: setting.tier }
    });
  } catch (error) {
    console.error('Error deleting XP Decay Setting V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete XP Decay Setting V2'
    });
  }
});

// Toggle XP Decay Setting V2 status
router.patch('/xp-decay-v2/:id/status', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id);

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found'
      });
    }

    setting.status = !setting.status;
    await setting.save();

    res.json({
      success: true,
      message: `XP Decay Setting V2 ${setting.status ? 'activated' : 'deactivated'} successfully`,
      data: { status: setting.status }
    });
  } catch (error) {
    console.error('Error toggling XP Decay Setting V2 status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle XP Decay Setting V2 status'
    });
  }
});

// Get decay setting by tier (utility endpoint)
router.get('/xp-decay-v2/by-tier/:tier', async (req, res) => {
  try {
    const { tier } = req.params;
    
    if (!['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be one of: Junior, Middle, Senior'
      });
    }

    const setting = await XPDecaySettingV2.findByTier(tier);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: `No decay setting found for tier: ${tier}`
      });
    }

    res.json({
      success: true,
      data: setting
    });
  } catch (error) {
    console.error('Error finding decay setting by tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find decay setting by tier'
    });
  }
});

// Calculate decay for a user (utility endpoint for testing)
router.post('/xp-decay-v2/calculate', async (req, res) => {
  try {
    const { tier, currentXp } = req.body;

    if (!tier || !['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Valid tier is required. Must be one of: Junior, Middle, Senior'
      });
    }

    if (currentXp === undefined || currentXp === null || currentXp < 0) {
      return res.status(400).json({
        success: false,
        error: 'Current XP is required and must be >= 0'
      });
    }

    const setting = await XPDecaySettingV2.findByTier(tier);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: `No decay setting found for tier: ${tier}`
      });
    }

    if (!setting.status) {
      return res.status(400).json({
        success: false,
        error: 'Decay setting is inactive'
      });
    }

    const decayResult = setting.calculateDecay(currentXp);

    res.json({
      success: true,
      data: {
        tier,
        currentXp,
        decayResult,
        setting: {
          decayRuleType: setting.decayRuleType,
          xpDeduction: setting.xpDeduction,
          minimumXpLimit: setting.minimumXpLimit
        }
      }
    });
  } catch (error) {
    console.error('Error calculating decay:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate decay',
      details: error.message
    });
  }
});

module.exports = router;


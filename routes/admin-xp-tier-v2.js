const express = require('express');
const router = express.Router();
const XPTierV2 = require('../models/XPTierV2');
const XPMultiplier = require('../models/XPMultiplier');

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth');

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * Coerces an XP bound to a finite number, or null when it is absent or not
 * numeric.
 *
 * The old checks were `value === undefined || value === null || value < 0`,
 * which an empty string slips straight through: `'' < 0` is false. Mongoose
 * then casts `''` to null, the schema's `required` fails, and the request dies
 * as a generic 500 - the admin panel showed "Failed to create XP Tier V2" with
 * no hint that a required field had simply been left blank.
 */
function toFiniteNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Helper function to get Access Benefit (XP Multiplier) from XPMultiplier model
 * Maps tier enum to XPMultiplier tier format: Junior -> JUNIOR, Middle -> MID, Senior -> SENIOR
 */
async function getAccessBenefitFromMultiplier(tier) {
  try {
    // Map tier names to XPMultiplier enum values
    const tierMap = {
      'Junior': 'JUNIOR',
      'Middle': 'MID',
      'Senior': 'SENIOR'
    };

    const multiplierTier = tierMap[tier];
    if (!multiplierTier) {
      return '1.0x'; // Default
    }

    const multiplier = await XPMultiplier.findOne({
      tier: multiplierTier,
      isActive: true
    });

    if (multiplier && multiplier.multiplier) {
      return `${multiplier.multiplier}x`;
    }

    // Default multipliers if not found in XPMultiplier
    const defaultMultipliers = {
      'Junior': '1.0x',
      'Middle': '1.5x',
      'Senior': '2.0x'
    };

    return defaultMultipliers[tier] || '1.0x';
  } catch (error) {
    console.error('Error fetching access benefit from multiplier:', error);
    return '1.0x'; // Default fallback
  }
}

/* ========================================
   XP TIER V2 APIs
======================================== */

// Get all XP Tiers V2
router.get('/xp-tiers-v2', async (req, res) => {
  try {
    const { status } = req.query;
    
    let query = {};
    if (status !== undefined) {
      query.status = status === 'true';
    }

    const tiers = await XPTierV2.find(query)
      .sort({ xpMin: 1 })
      .lean();

    // Enrich with access benefits from XPMultiplier
    const enrichedTiers = await Promise.all(
      tiers.map(async (tier) => {
        const accessBenefit = await getAccessBenefitFromMultiplier(tier.tier);
        return {
          ...tier,
          accessBenefit
        };
      })
    );

    res.json({
      success: true,
      data: enrichedTiers,
      total: enrichedTiers.length
    });
  } catch (error) {
    console.error('Error fetching XP Tiers V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Tiers V2'
    });
  }
});

// Get single XP Tier V2
router.get('/xp-tiers-v2/:id', async (req, res) => {
  try {
    const tier = await XPTierV2.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP Tier V2 not found'
      });
    }

    // Get access benefit from multiplier
    const accessBenefit = await getAccessBenefitFromMultiplier(tier.tier);
    const tierData = tier.toObject();
    tierData.accessBenefit = accessBenefit;

    res.json({
      success: true,
      data: tierData
    });
  } catch (error) {
    console.error('Error fetching XP Tier V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Tier V2'
    });
  }
});

// Create new XP Tier V2
router.post('/xp-tiers-v2', async (req, res) => {
  try {
    const {
      tier,
      xpMin,
      xpMax,
      status = true
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

    const parsedXpMin = toFiniteNumber(xpMin);
    if (parsedXpMin === null || parsedXpMin < 0) {
      return res.status(400).json({
        success: false,
        error: 'XP Min is required and must be a number greater than or equal to 0'
      });
    }

    const parsedXpMax = toFiniteNumber(xpMax);

    // For Senior tier, xpMax can be empty/0 (represents 300+)
    // For Junior and Middle, xpMax is required and must be > 0
    if (tier !== 'Senior' && (parsedXpMax === null || parsedXpMax === 0)) {
      return res.status(400).json({
        success: false,
        error: 'XP Max is required for Junior and Middle tiers and must be a number greater than 0'
      });
    }

    // For Senior tier, normalize xpMax: empty or 0 means no upper bound
    const normalizedXpMax =
      tier === 'Senior' && (parsedXpMax === null || parsedXpMax === 0)
        ? null
        : parsedXpMax;

    if (tier !== 'Senior' && parsedXpMin >= normalizedXpMax) {
      return res.status(400).json({
        success: false,
        error: 'XP Min must be less than XP Max'
      });
    }

    // Check for duplicate tier (only 1 entry per tier allowed)
    const existingTier = await XPTierV2.findOne({ tier });
    if (existingTier) {
      // If duplicate found, return the existing tier for editing
      return res.status(400).json({
        success: false,
        error: 'Tier already exists. Only one entry per tier is allowed.',
        data: existingTier,
        existingId: existingTier._id,
        message: 'Use PUT /api/admin/rewards/xp-tiers-v2/:id to update the existing tier'
      });
    }

    // Get access benefit from XPMultiplier
    const accessBenefit = await getAccessBenefitFromMultiplier(tier);

    // Create XP range string
    let xpRange;
    if (tier === 'Senior' && normalizedXpMax === null) {
      xpRange = `${parsedXpMin}+`;
    } else {
      xpRange = `${parsedXpMin} - ${normalizedXpMax}`;
    }

    const newTier = new XPTierV2({
      tier,
      xpMin: parsedXpMin,
      xpMax: normalizedXpMax,
      xpRange,
      accessBenefit,
      status
    });

    await newTier.save();

    res.status(201).json({
      success: true,
      data: newTier,
      message: 'XP Tier V2 created successfully'
    });
  } catch (error) {
    console.error('Error creating XP Tier V2:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Tier already exists. Only one entry per tier is allowed.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create XP Tier V2',
      details: error.message
    });
  }
});

// Update XP Tier V2
router.put('/xp-tiers-v2/:id', async (req, res) => {
  try {
    const {
      tier,
      xpMin,
      xpMax,
      status
    } = req.body;

    const tierDoc = await XPTierV2.findById(req.params.id);
    
    if (!tierDoc) {
      return res.status(404).json({
        success: false,
        error: 'XP Tier V2 not found'
      });
    }

    // Validation
    if (tier !== undefined && !['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be one of: Junior, Middle, Senior'
      });
    }

    // Check for duplicate tier if tier is being changed
    if (tier && tier !== tierDoc.tier) {
      const existingTier = await XPTierV2.findOne({ 
        tier,
        _id: { $ne: req.params.id }
      });
      if (existingTier) {
        return res.status(400).json({
          success: false,
          error: 'Tier already exists. Only one entry per tier is allowed.'
        });
      }
    }

    // Validate XP range. Anything supplied must be numeric - an empty string
    // would otherwise pass these comparisons and fail later as a generic 500.
    const finalTier = tier || tierDoc.tier;

    let finalXpMin = tierDoc.xpMin;
    if (xpMin !== undefined) {
      finalXpMin = toFiniteNumber(xpMin);
      if (finalXpMin === null || finalXpMin < 0) {
        return res.status(400).json({
          success: false,
          error: 'XP Min must be a number greater than or equal to 0'
        });
      }
    }

    let finalXpMax = tierDoc.xpMax;
    if (xpMax !== undefined) {
      finalXpMax = toFiniteNumber(xpMax);
    }

    // For Senior tier, empty or 0 means no upper bound
    if (finalTier === 'Senior' && (finalXpMax === 0 || finalXpMax === null)) {
      finalXpMax = null;
    }

    if (finalTier !== 'Senior' && (finalXpMax === null || finalXpMax === 0)) {
      return res.status(400).json({
        success: false,
        error: 'XP Max is required for Junior and Middle tiers and must be a number greater than 0'
      });
    }

    if (finalTier !== 'Senior' && finalXpMin >= finalXpMax) {
      return res.status(400).json({
        success: false,
        error: 'XP Min must be less than XP Max'
      });
    }

    // Update fields
    if (tier !== undefined) tierDoc.tier = tier;
    if (xpMin !== undefined) tierDoc.xpMin = finalXpMin;
    if (xpMax !== undefined) {
      tierDoc.xpMax = finalTier === 'Senior' ? null : finalXpMax;
    }
    if (status !== undefined) tierDoc.status = status;

    // Auto-update access benefit from XPMultiplier
    const finalTierForBenefit = tier || tierDoc.tier;
    tierDoc.accessBenefit = await getAccessBenefitFromMultiplier(finalTierForBenefit);

    // XP range will be auto-generated in pre-save hook
    await tierDoc.save();

    res.json({
      success: true,
      data: tierDoc,
      message: 'XP Tier V2 updated successfully'
    });
  } catch (error) {
    console.error('Error updating XP Tier V2:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Tier already exists. Only one entry per tier is allowed.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update XP Tier V2',
      details: error.message
    });
  }
});

// Delete XP Tier V2
router.delete('/xp-tiers-v2/:id', async (req, res) => {
  try {
    const tier = await XPTierV2.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP Tier V2 not found'
      });
    }

    await XPTierV2.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'XP Tier V2 deleted successfully',
      data: { id: tier._id, tier: tier.tier }
    });
  } catch (error) {
    console.error('Error deleting XP Tier V2:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete XP Tier V2'
    });
  }
});

// Toggle XP Tier V2 status
router.patch('/xp-tiers-v2/:id/status', async (req, res) => {
  try {
    const tier = await XPTierV2.findById(req.params.id);

    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP Tier V2 not found'
      });
    }

    tier.status = !tier.status;
    await tier.save();

    res.json({
      success: true,
      message: `XP Tier V2 ${tier.status ? 'activated' : 'deactivated'} successfully`,
      data: { status: tier.status }
    });
  } catch (error) {
    console.error('Error toggling XP Tier V2 status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle XP Tier V2 status'
    });
  }
});

// Get tier by XP value (utility endpoint)
router.get('/xp-tiers-v2/by-xp/:xp', async (req, res) => {
  try {
    const xp = parseInt(req.params.xp);
    
    if (isNaN(xp) || xp < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid XP value'
      });
    }

    const tier = await XPTierV2.findByXpValue(xp);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'No tier found for this XP value'
      });
    }

    // Get access benefit
    const accessBenefit = await getAccessBenefitFromMultiplier(tier.tier);
    const tierData = tier.toObject();
    tierData.accessBenefit = accessBenefit;

    res.json({
      success: true,
      data: tierData
    });
  } catch (error) {
    console.error('Error finding tier by XP:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find tier by XP'
    });
  }
});

module.exports = router;


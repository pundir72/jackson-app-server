const express = require('express')
const router = express.Router()
const XPDecaySettingV2 = require('../models/XPDecaySettingV2')
const XPTierV2 = require('../models/XPTierV2')

// Admin authentication middleware
const { adminAuth } = require('../middleware/adminAuth')

// Apply admin auth to all routes
router.use(adminAuth)

/**
 * Helper function to get XP Range from XPTierV2 model
 * Auto-populates XP range based on selected tier
 * CRITICAL FIX: Checks if tier exists first, then checks status
 * Provides clear error messages for better UX
 */
async function getXpRangeFromTier(tier) {
  try {
    // CRITICAL FIX: First check if tier exists (regardless of status)
    // Use case-insensitive search and trim whitespace
    const normalizedTier = tier && typeof tier === 'string' ? tier.trim() : tier;
    
    // CRITICAL FIX: First try exact match (case-sensitive) for performance
    let tierDocAnyStatus = await XPTierV2.findOne({ tier: normalizedTier });
    
    // If exact match fails, try case-insensitive search
    if (!tierDocAnyStatus) {
      tierDocAnyStatus = await XPTierV2.findOne({ 
        tier: { $regex: new RegExp(`^${normalizedTier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
    }
    
    if (!tierDocAnyStatus) {
      // CRITICAL FIX: Provide list of available tiers for better UX
      const allTiers = await XPTierV2.find({}).select('tier status').lean();
      const availableTiers = allTiers.map(t => t.tier).join(', ');
      throw new Error(`TIER_NOT_FOUND: Tier "${normalizedTier}" does not exist. Available tiers: ${availableTiers || 'None found. Please create tiers in XP Tier V2 settings first.'}`)
    }
    
    // CRITICAL FIX: Use the actual tier name from database (case-corrected)
    const actualTierName = tierDocAnyStatus.tier;
    
    // CRITICAL FIX: Allow creating decay rules even if tier is inactive (with warning)
    // Admin can activate tier later, but decay rule should be creatable
    if (!tierDocAnyStatus.status) {
      console.warn(`⚠️ Warning: Tier "${actualTierName}" is inactive. Decay rule will be created but won't apply until tier is activated.`)
    }

    // Tier exists - return XP range data (regardless of status)
    // CRITICAL FIX: Ensure xpRange is properly formatted (handle null xpMax for Senior tier)
    let formattedXpRange = tierDocAnyStatus.xpRange;
    if (!formattedXpRange) {
      if (tierDocAnyStatus.xpMax === null || tierDocAnyStatus.xpMax === undefined) {
        formattedXpRange = `${tierDocAnyStatus.xpMin}+`;
      } else {
        formattedXpRange = `${tierDocAnyStatus.xpMin} - ${tierDocAnyStatus.xpMax}`;
      }
    }

    return {
      xpRange: formattedXpRange,
      xpMin: tierDocAnyStatus.xpMin,
      xpMax: tierDocAnyStatus.xpMax,
      tierStatus: tierDocAnyStatus.status, // Include status for reference
      actualTierName: actualTierName, // Return actual tier name from DB (case-corrected)
    }
  } catch (error) {
    console.error('Error fetching XP range from tier:', error)
    throw error
  }
}

/* ========================================
   XP DECAY SETTINGS V2 APIs
======================================== */

// Get all XP Decay Settings V2
router.get('/xp-decay-v2', async (req, res) => {
  try {
    const { status, tier, decayRuleType } = req.query

    let query = {}
    if (status !== undefined) {
      query.status = status === 'true'
    }
    if (tier) {
      query.tier = tier
    }
    if (decayRuleType) {
      query.decayRuleType = decayRuleType
    }

    const settings = await XPDecaySettingV2.find(query)
      .sort({ xpMin: 1 })
      .lean()

    res.json({
      success: true,
      data: settings,
      total: settings.length,
    })
  } catch (error) {
    console.error('Error fetching XP Decay Settings V2:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Decay Settings V2',
    })
  }
})

// Get single XP Decay Setting V2
router.get('/xp-decay-v2/:id', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found',
      })
    }

    res.json({
      success: true,
      data: setting,
    })
  } catch (error) {
    console.error('Error fetching XP Decay Setting V2:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP Decay Setting V2',
    })
  }
})

// Create new XP Decay Setting V2
router.post('/xp-decay-v2', async (req, res) => {
  try {
    // Map frontend field names to backend field names
    const {
      tier,
      tierName,
      decayRuleType,
      xpDeduction,
      xpDeductionAmount,
      inactiveDuration,
      inactivityDuration,
      minimumXpLimit,
      status = true,
      sendNotification,
      notificationToggle,
      notificationMessage,
    } = req.body

    // CRITICAL FIX: Validate tier FIRST, before any other processing
    // Handle both 'tier' and 'tierName' field names from frontend
    const tierValue = (tier !== undefined && tier !== null) ? tier : (tierName !== undefined && tierName !== null ? tierName : undefined)
    
    // CRITICAL FIX: Comprehensive validation - check ALL possible empty cases
    // Check if tier is missing, null, undefined, empty string, or whitespace-only
    let normalizedTierValue = undefined;
    if (tierValue !== undefined && tierValue !== null) {
      if (typeof tierValue === 'string') {
        normalizedTierValue = tierValue.trim();
      } else {
        normalizedTierValue = tierValue;
      }
    }
    
    // CRITICAL FIX: Validate tier is provided and not empty (MUST be first validation)
    if (
      tierValue === undefined ||
      tierValue === null ||
      normalizedTierValue === undefined ||
      normalizedTierValue === null ||
      normalizedTierValue === '' ||
      (typeof normalizedTierValue === 'string' && normalizedTierValue.trim() === '')
    ) {
      console.log('[XP-DECAY-VALIDATION] Tier validation failed:', {
        tier,
        tierName,
        tierValue,
        normalizedTierValue,
        tierType: typeof tierValue,
        tierNameType: typeof tierName
      });
      
      return res.status(400).json({
        success: false,
        error: 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
        errorCode: 'TIER_REQUIRED',
        field: 'tier',
        receivedValues: {
          tier: tier,
          tierName: tierName,
          tierValue: tierValue
        },
        suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
      })
    }

    const xpDeductionValue =
      xpDeduction !== undefined ? xpDeduction : xpDeductionAmount
    const sendNotificationValue =
      sendNotification !== undefined ? sendNotification : notificationToggle

    // Parse inactivityDuration if it's a string like "1 day"
    let inactiveDurationValue = inactiveDuration
    if (inactivityDuration) {
      const match = inactivityDuration.match(/(\d+)/)
      inactiveDurationValue = match ? parseInt(match[1]) : 1
    }

    // CRITICAL FIX: Validate tier value is one of the allowed values (case-insensitive check)
    const allowedTiers = ['Junior', 'Middle', 'Senior'];
    const tierMatch = allowedTiers.find(t => t.toLowerCase() === normalizedTierValue.toLowerCase());
    if (!tierMatch) {
      return res.status(400).json({
        success: false,
        error: `Invalid XP Tier "${normalizedTierValue}". Must be one of: Junior, Middle, or Senior`,
        errorCode: 'TIER_INVALID',
        field: 'tier',
        receivedValue: normalizedTierValue,
        allowedValues: allowedTiers,
      })
    }
    // CRITICAL FIX: Use the correct case from allowedTiers (normalize to proper case)
    const correctCaseTier = tierMatch; // This will be used below

    if (!decayRuleType || !['Fixed', 'Stepwise'].includes(decayRuleType)) {
      return res.status(400).json({
        success: false,
        error: 'Decay Rule Type is required. Must be one of: Fixed, Stepwise',
      })
    }

    if (
      xpDeductionValue === undefined ||
      xpDeductionValue === null ||
      xpDeductionValue < 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'XP Deduction is required and must be >= 0',
      })
    }

    if (
      inactiveDurationValue === undefined ||
      inactiveDurationValue === null ||
      inactiveDurationValue < 1
    ) {
      return res.status(400).json({
        success: false,
        error: 'Inactive Duration is required and must be >= 1 day',
      })
    }

    if (
      minimumXpLimit === undefined ||
      minimumXpLimit === null ||
      minimumXpLimit < 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Minimum XP Limit is required and must be >= 0',
      })
    }

    // Check for duplicate tier (only 1 entry per tier allowed)
    // CRITICAL FIX: Use correct case tier value for consistency
    const existingSetting = await XPDecaySettingV2.findOne({ 
      $or: [
        { tier: correctCaseTier },
        { tier: normalizedTierValue },
        { tier: { $regex: new RegExp(`^${correctCaseTier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
      ]
    })
    if (existingSetting) {
      // If duplicate found, return the existing setting for editing
      return res.status(400).json({
        success: false,
        error:
          'Decay setting for this tier already exists. Only one entry per tier is allowed.',
        data: existingSetting,
        existingId: existingSetting._id,
        message:
          'Use PUT /api/admin/rewards/xp-decay-v2/:id to update the existing setting',
      })
    }

    // Auto-populate XP Range from XPTierV2
    // CRITICAL FIX: Use correct case tier value
    let xpRangeData
    try {
      xpRangeData = await getXpRangeFromTier(correctCaseTier)
      
      // CRITICAL FIX: Use actual tier name from database (case-corrected)
      const finalTierName = xpRangeData.actualTierName || correctCaseTier;
      
      // CRITICAL FIX: Warn if tier is inactive but allow creation
      if (xpRangeData.tierStatus === false) {
        console.warn(`⚠️ Creating decay rule for inactive tier "${finalTierName}". Rule will not apply until tier is activated.`)
      }
    } catch (error) {
      // CRITICAL FIX: Provide clear error messages based on error type
      if (error.message.includes('TIER_NOT_FOUND')) {
        return res.status(400).json({
          success: false,
          error: error.message.replace('TIER_NOT_FOUND: ', ''),
          errorCode: 'TIER_NOT_FOUND',
          suggestion: `Please create the "${correctCaseTier}" tier in Admin → Rewards → XP Tier V2 settings first.`,
        })
      } else {
      return res.status(400).json({
        success: false,
          error: `Failed to fetch XP range for tier "${correctCaseTier}". ${error.message}`,
          errorCode: 'TIER_FETCH_ERROR',
      })
      }
    }

    // CRITICAL FIX: Use actual tier name from database (case-corrected)
    const finalTierName = xpRangeData.actualTierName || correctCaseTier;

    const newSetting = new XPDecaySettingV2({
      tier: finalTierName,
      xpRange: xpRangeData.xpRange,
      xpMin: xpRangeData.xpMin,
      xpMax: xpRangeData.xpMax,
      decayRuleType,
      xpDeduction: xpDeductionValue,
      inactiveDuration: inactiveDurationValue,
      minimumXpLimit,
      status,
      sendNotification:
        sendNotificationValue !== undefined ? sendNotificationValue : true,
      notificationMessage:
        notificationMessage ||
        'Your XP will decay due to inactivity. Stay active to maintain your tier!',
    })

    await newSetting.save()

    res.status(201).json({
      success: true,
      data: newSetting,
      message: 'XP Decay Setting V2 created successfully',
    })
  } catch (error) {
    console.error('Error creating XP Decay Setting V2:', error)

    // CRITICAL FIX: Handle validation errors from model pre-save hook
    if (error.name === 'ValidationError' || error.errors) {
      const validationErrors = error.errors || {};
      const tierError = validationErrors.tier;
      
      if (tierError) {
        return res.status(400).json({
          success: false,
          error: tierError.message || 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
          errorCode: 'TIER_REQUIRED',
          field: 'tier',
          suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
        })
      }
      
      // Handle other validation errors
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        return res.status(400).json({
          success: false,
          error: firstError.message || 'Validation error',
          errorCode: 'VALIDATION_ERROR',
          details: validationErrors,
        })
      }
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error:
          'Decay setting for this tier already exists. Only one entry per tier is allowed.',
      })
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create XP Decay Setting V2',
      details: error.message,
    })
  }
})

// Update XP Decay Setting V2
router.put('/xp-decay-v2/:id', async (req, res) => {
  try {
    // Map frontend field names to backend field names
    const {
      tier,
      tierName, // Frontend sends tierName
      decayRuleType,
      xpDeduction,
      xpDeductionAmount, // Frontend sends xpDeductionAmount
      inactiveDuration,
      inactivityDuration, // Frontend sends inactivityDuration (string like "1 day")
      minimumXpLimit,
      status,
      sendNotification,
      notificationToggle, // Frontend sends notificationToggle
      notificationMessage,
    } = req.body

    // CRITICAL FIX: Normalize tier value and validate early
    // Map frontend fields to backend fields
    const tierValue = tier !== undefined ? tier : tierName
    // CRITICAL FIX: Check for empty string, whitespace-only, null, undefined
    const normalizedTierValue = tierValue && typeof tierValue === 'string' 
      ? tierValue.trim() 
      : tierValue
    const xpDeductionValue =
      xpDeduction !== undefined ? xpDeduction : xpDeductionAmount
    const sendNotificationValue =
      sendNotification !== undefined ? sendNotification : notificationToggle

    // Parse inactivityDuration if it's a string like "1 day"
    let inactiveDurationValue = inactiveDuration
    if (inactivityDuration) {
      const match = inactivityDuration.match(/(\d+)/)
      inactiveDurationValue = match ? parseInt(match[1]) : undefined
    }

    const setting = await XPDecaySettingV2.findById(req.params.id)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found',
      })
    }

    // CRITICAL FIX: Comprehensive validation for tier field when updating
    // Only validate if tierValue is being updated (not undefined)
    let correctCaseTier = undefined; // Initialize for use outside if block
    if (tierValue !== undefined) {
      // CRITICAL FIX: Comprehensive validation - check ALL possible empty cases
      if (
        tierValue === undefined ||
        tierValue === null ||
        normalizedTierValue === undefined ||
        normalizedTierValue === null ||
        normalizedTierValue === '' ||
        (typeof normalizedTierValue === 'string' && normalizedTierValue.trim() === '')
      ) {
        console.log('[XP-DECAY-VALIDATION] Tier validation failed (UPDATE):', {
          tier,
          tierName,
          tierValue,
          normalizedTierValue,
          tierType: typeof tierValue,
          tierNameType: typeof tierName
        });
        
        return res.status(400).json({
          success: false,
          error: 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
          errorCode: 'TIER_REQUIRED',
          field: 'tier',
          receivedValues: {
            tier: tier,
            tierName: tierName,
            tierValue: tierValue
          },
          suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
        })
      }

      // CRITICAL FIX: Validate tier value is one of the allowed values (case-insensitive check)
      const allowedTiers = ['Junior', 'Middle', 'Senior'];
      const tierMatch = allowedTiers.find(t => t.toLowerCase() === normalizedTierValue.toLowerCase());
      if (!tierMatch) {
        return res.status(400).json({
          success: false,
          error: `Invalid XP Tier "${normalizedTierValue}". Must be one of: Junior, Middle, or Senior`,
          errorCode: 'TIER_INVALID',
          field: 'tier',
          receivedValue: normalizedTierValue,
          allowedValues: allowedTiers,
        })
      }
      // CRITICAL FIX: Use the correct case from allowedTiers (normalize to proper case)
      correctCaseTier = tierMatch; // Store for use below
    }

    if (
      decayRuleType !== undefined &&
      !['Fixed', 'Stepwise'].includes(decayRuleType)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Decay Rule Type. Must be one of: Fixed, Stepwise',
      })
    }

    if (
      xpDeductionValue !== undefined &&
      (xpDeductionValue < 0 || xpDeductionValue === null)
    ) {
      return res.status(400).json({
        success: false,
        error: 'XP Deduction must be >= 0',
      })
    }

    if (
      inactiveDurationValue !== undefined &&
      (inactiveDurationValue < 1 || inactiveDurationValue === null)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Inactive Duration must be >= 1 day',
      })
    }

    if (
      minimumXpLimit !== undefined &&
      (minimumXpLimit < 0 || minimumXpLimit === null)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Minimum XP Limit must be >= 0',
      })
    }

    // Check for duplicate tier if tier is being changed
    // CRITICAL FIX: Use correct case tier value for consistency
    if (tierValue !== undefined && correctCaseTier && correctCaseTier !== setting.tier) {
      const existingSetting = await XPDecaySettingV2.findOne({
        $or: [
          { tier: correctCaseTier },
          { tier: { $regex: new RegExp(`^${correctCaseTier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
        ],
        _id: { $ne: req.params.id },
      })
      if (existingSetting) {
        return res.status(400).json({
          success: false,
          error:
            'Decay setting for this tier already exists. Only one entry per tier is allowed.',
        })
      }
    }

    // Update fields
    // CRITICAL FIX: Use correct case tier value
    if (tierValue !== undefined) {
      // CRITICAL FIX: Use correct case tier from validation above
      const finalTierName = correctCaseTier || normalizedTierValue;
      setting.tier = finalTierName
      // Auto-update XP Range when tier changes
      try {
        const xpRangeData = await getXpRangeFromTier(finalTierName)
        setting.xpRange = xpRangeData.xpRange
        setting.xpMin = xpRangeData.xpMin
        setting.xpMax = xpRangeData.xpMax
        
        // CRITICAL FIX: Use actual tier name from database (case-corrected)
        const actualTierName = xpRangeData.actualTierName || finalTierName;
        setting.tier = actualTierName; // Ensure we use the exact case from DB
        
        // CRITICAL FIX: Warn if tier is inactive but allow update
        if (xpRangeData.tierStatus === false) {
          console.warn(`⚠️ Updating decay rule for inactive tier "${actualTierName}". Rule will not apply until tier is activated.`)
        }
      } catch (error) {
        // CRITICAL FIX: Provide clear error messages based on error type
        if (error.message.includes('TIER_NOT_FOUND')) {
          return res.status(400).json({
            success: false,
            error: error.message.replace('TIER_NOT_FOUND: ', ''),
            errorCode: 'TIER_NOT_FOUND',
            suggestion: `Please create the "${finalTierName}" tier in Admin → Rewards → XP Tier V2 settings first.`,
          })
        } else {
        return res.status(400).json({
          success: false,
            error: `Failed to fetch XP range for tier "${finalTierName}". ${error.message}`,
            errorCode: 'TIER_FETCH_ERROR',
        })
        }
      }
    }
    if (decayRuleType !== undefined) setting.decayRuleType = decayRuleType
    if (xpDeductionValue !== undefined) setting.xpDeduction = xpDeductionValue
    if (inactiveDurationValue !== undefined)
      setting.inactiveDuration = inactiveDurationValue
    if (minimumXpLimit !== undefined) setting.minimumXpLimit = minimumXpLimit
    if (status !== undefined) setting.status = status
    if (sendNotificationValue !== undefined)
      setting.sendNotification = sendNotificationValue
    if (notificationMessage !== undefined)
      setting.notificationMessage = notificationMessage

    await setting.save()

    res.json({
      success: true,
      data: setting,
      message: 'XP Decay Setting V2 updated successfully',
    })
  } catch (error) {
    console.error('Error updating XP Decay Setting V2:', error)

    // CRITICAL FIX: Handle validation errors from model pre-save hook
    if (error.name === 'ValidationError' || error.errors) {
      const validationErrors = error.errors || {};
      const tierError = validationErrors.tier;
      
      if (tierError) {
        return res.status(400).json({
          success: false,
          error: tierError.message || 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
          errorCode: 'TIER_REQUIRED',
          field: 'tier',
          suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
        })
      }
      
      // Handle other validation errors
      const firstError = Object.values(validationErrors)[0];
      if (firstError) {
        return res.status(400).json({
          success: false,
          error: firstError.message || 'Validation error',
          errorCode: 'VALIDATION_ERROR',
          details: validationErrors,
        })
      }
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error:
          'Decay setting for this tier already exists. Only one entry per tier is allowed.',
      })
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update XP Decay Setting V2',
      details: error.message,
    })
  }
})

// Delete XP Decay Setting V2
router.delete('/xp-decay-v2/:id', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found',
      })
    }

    await XPDecaySettingV2.findByIdAndDelete(req.params.id)

    res.json({
      success: true,
      message: 'XP Decay Setting V2 deleted successfully',
      data: { id: setting._id, tier: setting.tier },
    })
  } catch (error) {
    console.error('Error deleting XP Decay Setting V2:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete XP Decay Setting V2',
    })
  }
})

// Toggle XP Decay Setting V2 status
router.patch('/xp-decay-v2/:id/status', async (req, res) => {
  try {
    const setting = await XPDecaySettingV2.findById(req.params.id)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP Decay Setting V2 not found',
      })
    }

    setting.status = !setting.status
    await setting.save()

    res.json({
      success: true,
      message: `XP Decay Setting V2 ${setting.status ? 'activated' : 'deactivated'} successfully`,
      data: { status: setting.status },
    })
  } catch (error) {
    console.error('Error toggling XP Decay Setting V2 status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to toggle XP Decay Setting V2 status',
    })
  }
})

// Toggle notification setting
router.patch('/xp-decay-v2/:id/notification', async (req, res) => {
  try {
    const { sendNotification } = req.body

    const setting = await XPDecaySettingV2.findById(req.params.id)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found',
      })
    }

    setting.sendNotification =
      sendNotification !== undefined
        ? sendNotification
        : !setting.sendNotification
    await setting.save()

    res.json({
      success: true,
      data: setting,
      message: `Notification setting ${
        setting.sendNotification ? 'enabled' : 'disabled'
      } successfully`,
    })
  } catch (error) {
    console.error('Error toggling notification setting:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to toggle notification setting',
    })
  }
})

// Get decay setting by tier (utility endpoint)
router.get('/xp-decay-v2/by-tier/:tier', async (req, res) => {
  try {
    const { tier } = req.params

    if (!['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier. Must be one of: Junior, Middle, Senior',
      })
    }

    const setting = await XPDecaySettingV2.findByTier(tier)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: `No decay setting found for tier: ${tier}`,
      })
    }

    res.json({
      success: true,
      data: setting,
    })
  } catch (error) {
    console.error('Error finding decay setting by tier:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to find decay setting by tier',
    })
  }
})

// Calculate decay for a user (utility endpoint for testing)
router.post('/xp-decay-v2/calculate', async (req, res) => {
  try {
    const { tier, currentXp } = req.body

    if (!tier || !['Junior', 'Middle', 'Senior'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Valid tier is required. Must be one of: Junior, Middle, Senior',
      })
    }

    if (currentXp === undefined || currentXp === null || currentXp < 0) {
      return res.status(400).json({
        success: false,
        error: 'Current XP is required and must be >= 0',
      })
    }

    const setting = await XPDecaySettingV2.findByTier(tier)

    if (!setting) {
      return res.status(404).json({
        success: false,
        error: `No decay setting found for tier: ${tier}`,
      })
    }

    if (!setting.status) {
      return res.status(400).json({
        success: false,
        error: 'Decay setting is inactive',
      })
    }

    const decayResult = setting.calculateDecay(currentXp)

    res.json({
      success: true,
      data: {
        tier,
        currentXp,
        decayResult,
        setting: {
          decayRuleType: setting.decayRuleType,
          xpDeduction: setting.xpDeduction,
          minimumXpLimit: setting.minimumXpLimit,
        },
      },
    })
  } catch (error) {
    console.error('Error calculating decay:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to calculate decay',
      details: error.message,
    })
  }
})

module.exports = router

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
    const tierDocAnyStatus = await XPTierV2.findOne({ tier })
    
    if (!tierDocAnyStatus) {
      throw new Error(`TIER_NOT_FOUND: Tier "${tier}" does not exist. Please create the tier first in XP Tier V2 settings.`)
    }
    
    // CRITICAL FIX: Check if tier is active
    if (!tierDocAnyStatus.status) {
      throw new Error(`TIER_INACTIVE: Tier "${tier}" exists but is inactive. Please activate the tier in XP Tier V2 settings before creating decay rules.`)
    }
    
    // Tier exists and is active - return XP range data
    return {
      xpRange: tierDocAnyStatus.xpRange,
      xpMin: tierDocAnyStatus.xpMin,
      xpMax: tierDocAnyStatus.xpMax,
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

    // CRITICAL FIX: Normalize tier value and validate early
    // Handle both 'tier' and 'tierName' field names from frontend
    const tierValue = (tier || tierName)
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
      inactiveDurationValue = match ? parseInt(match[1]) : 1
    }

    // CRITICAL FIX: Comprehensive validation for tier field
    // Check for missing, empty, null, undefined, or whitespace-only values
    if (
      !normalizedTierValue || 
      normalizedTierValue === '' || 
      (typeof normalizedTierValue === 'string' && normalizedTierValue.trim() === '')
    ) {
      return res.status(400).json({
        success: false,
        error: 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
        errorCode: 'TIER_REQUIRED',
        field: 'tier',
        suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
      })
    }

    // CRITICAL FIX: Validate tier value is one of the allowed values
    if (!['Junior', 'Middle', 'Senior'].includes(normalizedTierValue)) {
      return res.status(400).json({
        success: false,
        error: `Invalid XP Tier "${normalizedTierValue}". Must be one of: Junior, Middle, or Senior`,
        errorCode: 'TIER_INVALID',
        field: 'tier',
        receivedValue: normalizedTierValue,
        allowedValues: ['Junior', 'Middle', 'Senior'],
      })
    }

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
    // CRITICAL FIX: Use normalized tier value
    const existingSetting = await XPDecaySettingV2.findOne({ tier: normalizedTierValue })
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
    // CRITICAL FIX: Use normalized tier value
    let xpRangeData
    try {
      xpRangeData = await getXpRangeFromTier(normalizedTierValue)
    } catch (error) {
      // CRITICAL FIX: Provide clear error messages based on error type
      if (error.message.includes('TIER_NOT_FOUND')) {
        return res.status(400).json({
          success: false,
          error: error.message.replace('TIER_NOT_FOUND: ', ''),
          errorCode: 'TIER_NOT_FOUND',
          suggestion: `Please create the "${normalizedTierValue}" tier in Admin → Rewards → XP Tier V2 settings first.`,
        })
      } else if (error.message.includes('TIER_INACTIVE')) {
        return res.status(400).json({
          success: false,
          error: error.message.replace('TIER_INACTIVE: ', ''),
          errorCode: 'TIER_INACTIVE',
          suggestion: `Please activate the "${normalizedTierValue}" tier in Admin → Rewards → XP Tier V2 settings.`,
        })
      } else {
        return res.status(400).json({
          success: false,
          error: `Failed to fetch XP range for tier "${normalizedTierValue}". ${error.message}`,
          errorCode: 'TIER_FETCH_ERROR',
        })
      }
    }

    const newSetting = new XPDecaySettingV2({
      tier: normalizedTierValue,
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
    if (tierValue !== undefined) {
      // Check for empty, null, or whitespace-only values
      if (
        !normalizedTierValue || 
        normalizedTierValue === '' || 
        (typeof normalizedTierValue === 'string' && normalizedTierValue.trim() === '')
      ) {
        return res.status(400).json({
          success: false,
          error: 'XP Tier is required. Please select a tier: Junior, Middle, or Senior',
          errorCode: 'TIER_REQUIRED',
          field: 'tier',
          suggestion: 'Please select one of the available XP tiers (Junior, Middle, or Senior) from the dropdown.',
        })
      }

      // Validate tier value is one of the allowed values
      if (!['Junior', 'Middle', 'Senior'].includes(normalizedTierValue)) {
        return res.status(400).json({
          success: false,
          error: `Invalid XP Tier "${normalizedTierValue}". Must be one of: Junior, Middle, or Senior`,
          errorCode: 'TIER_INVALID',
          field: 'tier',
          receivedValue: normalizedTierValue,
          allowedValues: ['Junior', 'Middle', 'Senior'],
        })
      }
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
    // CRITICAL FIX: Use normalized tier value
    if (tierValue !== undefined && normalizedTierValue !== setting.tier) {
      const existingSetting = await XPDecaySettingV2.findOne({
        tier: normalizedTierValue,
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
    // CRITICAL FIX: Use normalized tier value
    if (tierValue !== undefined) {
      setting.tier = normalizedTierValue
      // Auto-update XP Range when tier changes
      try {
        const xpRangeData = await getXpRangeFromTier(normalizedTierValue)
        setting.xpRange = xpRangeData.xpRange
        setting.xpMin = xpRangeData.xpMin
        setting.xpMax = xpRangeData.xpMax
      } catch (error) {
        // CRITICAL FIX: Provide clear error messages based on error type
        if (error.message.includes('TIER_NOT_FOUND')) {
          return res.status(400).json({
            success: false,
            error: error.message.replace('TIER_NOT_FOUND: ', ''),
            errorCode: 'TIER_NOT_FOUND',
            suggestion: `Please create the "${normalizedTierValue}" tier in Admin → Rewards → XP Tier V2 settings first.`,
          })
        } else if (error.message.includes('TIER_INACTIVE')) {
          return res.status(400).json({
            success: false,
            error: error.message.replace('TIER_INACTIVE: ', ''),
            errorCode: 'TIER_INACTIVE',
            suggestion: `Please activate the "${normalizedTierValue}" tier in Admin → Rewards → XP Tier V2 settings.`,
          })
        } else {
          return res.status(400).json({
            success: false,
            error: `Failed to fetch XP range for tier "${normalizedTierValue}". ${error.message}`,
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

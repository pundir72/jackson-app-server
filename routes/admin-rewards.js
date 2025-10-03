const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const XPDecaySetting = require('../models/XPDecaySetting');
const XPTier = require('../models/XPTier');
const BonusLogic = require('../models/BonusLogic');

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/badges/';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'badge-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Accept PNG, SVG, JPG, JPEG, and WebP files
  if (file.mimetype === 'image/png' || file.mimetype === 'image/svg+xml' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg' || file.mimetype === 'image/webp') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG, SVG, JPG, JPEG, and WebP files are allowed for badges'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware to check admin authentication
const adminAuth = async (req, res, next) => {
  try {
    // TODO: Implement proper admin authentication
    // For now, we'll use a simple check
    const adminToken = req.headers.authorization;
    if (!adminToken || !adminToken.includes('admin')) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required'
      });
    }
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid admin token'
    });
  }
};

// Apply admin auth to all routes
router.use(adminAuth);

/* ========================================
   XP DECAY SETTINGS APIs
======================================== */

// Get all XP decay settings
router.get('/xp-decay', async (req, res) => {
  try {
    const { status, tierName, decayRuleType } = req.query;
    
    let query = {};
    if (status !== undefined) query.status = status === 'true';
    if (tierName) query.tierName = new RegExp(tierName, 'i');
    if (decayRuleType) query.decayRuleType = decayRuleType;

    const settings = await XPDecaySetting.find(query)
      .sort({ order: 1, xpMin: 1 })
      .lean();

    res.json({
      success: true,
      data: settings,
      total: settings.length
    });
  } catch (error) {
    console.error('Error fetching XP decay settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP decay settings'
    });
  }
});

// Get single XP decay setting
router.get('/xp-decay/:id', async (req, res) => {
  try {
    const setting = await XPDecaySetting.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found'
      });
    }

    res.json({
      success: true,
      data: setting
    });
  } catch (error) {
    console.error('Error fetching XP decay setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP decay setting'
    });
  }
});

// Create new XP decay setting
router.post('/xp-decay', async (req, res) => {
  try {
    const {
      tierName,
      xpRange,
      decayRuleType,
      inactivityDuration,
      minimumXpLimit,
      status = true,
      notificationToggle = true
    } = req.body;

    // Parse XP range from various formats
    let xpMin, xpMax;
    if (xpRange) {
      // Try multiple patterns (order matters - most specific first)
      let rangeMatch = xpRange.match(/(\d+)\s*-\s*(\d+)\s*XP/i); // "0 - 999 XP"
      if (!rangeMatch) {
        rangeMatch = xpRange.match(/(\d+)\s*-\s*(\d+)/); // "0 - 999" (with spaces)
      }
      if (!rangeMatch) {
        rangeMatch = xpRange.match(/(\d+)-(\d+)/); // "0-999" (no spaces)
      }
      if (!rangeMatch) {
        rangeMatch = xpRange.match(/(\d+)\s*to\s*(\d+)/i); // "0 to 999"
      }
      if (!rangeMatch) {
        rangeMatch = xpRange.match(/(\d+)\s+(\d+)/); // "0 999" (space between numbers)
      }
      
      if (rangeMatch) {
        xpMin = parseInt(rangeMatch[1]);
        xpMax = parseInt(rangeMatch[2]);
      }
    }

    // Validation
    if (!tierName) {
      return res.status(400).json({
        success: false,
        error: 'Tier name is required'
      });
    }

    if (!xpRange) {
      return res.status(400).json({
        success: false,
        error: 'XP range is required'
      });
    }

    if (xpMin === undefined || xpMax === undefined || xpMin === null || xpMax === null) {
      return res.status(400).json({
        success: false,
        error: 'Invalid XP range format. Supported formats: "0 - 999 XP", "0 - 999", "0 to 999", or "0 999"'
      });
    }

    if (xpMin >= xpMax) {
      return res.status(400).json({
        success: false,
        error: 'XP min must be less than XP max'
      });
    }

    // Check for overlapping XP ranges
    const overlappingSetting = await XPDecaySetting.findOne({
      $or: [
        { xpMin: { $lte: xpMax }, xpMax: { $gte: xpMin } }
      ],
      status: true
    });

    if (overlappingSetting) {
      return res.status(400).json({
        success: false,
        error: `XP range overlaps with existing setting: ${overlappingSetting.tierName}`
      });
    }

    // Parse inactivity duration to get days
    let inactivityDurationDays = 7; // Default
    if (inactivityDuration) {
      const match = inactivityDuration.match(/(\d+)\s*(Days?|Weeks?|Months?)/i);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.includes('week')) {
          inactivityDurationDays = value * 7;
        } else if (unit.includes('month')) {
          inactivityDurationDays = value * 30;
        } else {
          inactivityDurationDays = value;
        }
      }
    }

    const newSetting = new XPDecaySetting({
      tierName,
      xpRange: `${xpMin} - ${xpMax} XP`,
      xpMin,
      xpMax,
      decayRuleType: decayRuleType || 'Fixed',
      inactivityDuration,
      inactivityDurationDays,
      minimumXpLimit: minimumXpLimit || 0,
      decayPercentage: '25%', // Default
      decayPercentageValue: 25, // Default
      sendNotification: notificationToggle,
      notificationMessage: 'Your XP will decay due to inactivity. Stay active to maintain your tier!',
      status,
      order: 0
    });

    await newSetting.save();

    res.status(201).json({
      success: true,
      data: newSetting,
      message: 'XP decay setting created successfully'
    });
  } catch (error) {
    console.error('Error creating XP decay setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create XP decay setting'
    });
  }
});

// Update XP decay setting
router.put('/xp-decay/:id', async (req, res) => {
  try {
    const {
      tierName,
      xpMin,
      xpMax,
      decayRuleType,
      inactivityDuration,
      inactivityDurationDays,
      minimumXpLimit,
      decayPercentage,
      decayPercentageValue,
      sendNotification,
      notificationMessage,
      status,
      order
    } = req.body;

    const setting = await XPDecaySetting.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found'
      });
    }

    // Validation for XP range if being updated
    if (xpMin !== undefined && xpMax !== undefined) {
      if (xpMin >= xpMax) {
        return res.status(400).json({
          success: false,
          error: 'XP min must be less than XP max'
        });
      }

      // Check for overlapping XP ranges (excluding current setting)
      const overlappingSetting = await XPDecaySetting.findOne({
        _id: { $ne: req.params.id },
        $or: [
          { xpMin: { $lte: xpMax }, xpMax: { $gte: xpMin } }
        ],
        status: true
      });

      if (overlappingSetting) {
        return res.status(400).json({
          success: false,
          error: `XP range overlaps with existing setting: ${overlappingSetting.tierName}`
        });
      }
    }

    // Update fields
    if (tierName !== undefined) setting.tierName = tierName;
    if (xpMin !== undefined) setting.xpMin = xpMin;
    if (xpMax !== undefined) setting.xpMax = xpMax;
    if (decayRuleType !== undefined) setting.decayRuleType = decayRuleType;
    if (inactivityDuration !== undefined) setting.inactivityDuration = inactivityDuration;
    if (inactivityDurationDays !== undefined) setting.inactivityDurationDays = inactivityDurationDays;
    if (minimumXpLimit !== undefined) setting.minimumXpLimit = minimumXpLimit;
    if (decayPercentage !== undefined) setting.decayPercentage = decayPercentage;
    if (decayPercentageValue !== undefined) setting.decayPercentageValue = decayPercentageValue;
    if (sendNotification !== undefined) setting.sendNotification = sendNotification;
    if (notificationMessage !== undefined) setting.notificationMessage = notificationMessage;
    if (status !== undefined) setting.status = status;
    if (order !== undefined) setting.order = order;

    // Update XP range if min/max changed
    if (xpMin !== undefined || xpMax !== undefined) {
      setting.xpRange = `${setting.xpMin} - ${setting.xpMax} XP`;
    }

    await setting.save();

    res.json({
      success: true,
      data: setting,
      message: 'XP decay setting updated successfully'
    });
  } catch (error) {
    console.error('Error updating XP decay setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update XP decay setting'
    });
  }
});

// Bulk delete XP decay settings
router.delete('/xp-decay/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await XPDecaySetting.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `${result.deletedCount} XP decay settings deleted successfully`
    });
  } catch (error) {
    console.error('Error bulk deleting XP decay settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk delete XP decay settings'
    });
  }
});

// Delete XP decay setting
router.delete('/xp-decay/:id', async (req, res) => {
  try {
    const setting = await XPDecaySetting.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found'
      });
    }

    await XPDecaySetting.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'XP decay setting deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting XP decay setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete XP decay setting'
    });
  }
});

// Toggle XP decay setting status
router.patch('/xp-decay/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const setting = await XPDecaySetting.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found'
      });
    }

    setting.status = status !== undefined ? status : !setting.status;
    await setting.save();

    res.json({
      success: true,
      data: setting,
      message: `XP decay setting ${setting.status ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling XP decay setting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle XP decay setting status'
    });
  }
});

// Toggle notification setting
router.patch('/xp-decay/:id/notification', async (req, res) => {
  try {
    const { sendNotification } = req.body;
    
    const setting = await XPDecaySetting.findById(req.params.id);
    
    if (!setting) {
      return res.status(404).json({
        success: false,
        error: 'XP decay setting not found'
      });
    }

    setting.sendNotification = sendNotification !== undefined ? sendNotification : !setting.sendNotification;
    await setting.save();

    res.json({
      success: true,
      data: setting,
      message: `Notification setting ${setting.sendNotification ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    console.error('Error toggling notification setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle notification setting'
    });
  }
});

// Bulk update XP decay settings status
router.patch('/xp-decay/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await XPDecaySetting.updateMany(
      { _id: { $in: ids } },
      { status: status }
    );

    res.json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      },
      message: `${result.modifiedCount} XP decay settings updated successfully`
    });
  } catch (error) {
    console.error('Error bulk updating XP decay settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update XP decay settings'
    });
  }
});

// Bulk delete XP decay settings
router.delete('/xp-decay/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await XPDecaySetting.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `${result.deletedCount} XP decay settings deleted successfully`
    });
  } catch (error) {
    console.error('Error bulk deleting XP decay settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk delete XP decay settings'
    });
  }
});

/* ========================================
   XP TIERS APIs
======================================== */

// Get all XP tiers
router.get('/xp-tiers', async (req, res) => {
  try {
    const { status, tierName, xpRange } = req.query;
    
    let query = {};
    if (status !== undefined) query.status = status === 'true';
    if (tierName) query.tierName = new RegExp(tierName, 'i');
    if (xpRange) query.xpRange = new RegExp(xpRange, 'i');

    const tiers = await XPTier.find(query)
      .sort({ order: 1, xpMin: 1 })
      .lean();

    res.json({
      success: true,
      data: tiers,
      total: tiers.length
    });
  } catch (error) {
    console.error('Error fetching XP tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP tiers'
    });
  }
});

// Get single XP tier
router.get('/xp-tiers/:id', async (req, res) => {
  try {
    const tier = await XPTier.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP tier not found'
      });
    }

    res.json({
      success: true,
      data: tier
    });
  } catch (error) {
    console.error('Error fetching XP tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP tier'
    });
  }
});

// Create new XP tier
router.post('/xp-tiers', upload.single('badgeFile'), async (req, res) => {
  try {
    const {
      tierName,
      xpMin,
      xpMax,
      badge,
      accessBenefits,
      iconSrc,
      status = true
    } = req.body;

    // Handle file upload
    let badgeFileUrl = null;
    if (req.file) {
      // Generate URL for uploaded file
      badgeFileUrl = `/uploads/badges/${req.file.filename}`;
    }

    // Validation
    if (!tierName || xpMin === undefined || xpMax === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Tier name, XP min, and XP max are required'
      });
    }

    if (xpMin >= xpMax) {
      return res.status(400).json({
        success: false,
        error: 'XP min must be less than XP max'
      });
    }

    // Check for overlapping XP ranges
    const overlappingTier = await XPTier.findOne({
      $or: [
        { xpMin: { $lte: xpMax }, xpMax: { $gte: xpMin } }
      ],
      status: true
    });

    if (overlappingTier) {
      return res.status(400).json({
        success: false,
        error: `XP range overlaps with existing tier: ${overlappingTier.tierName}`
      });
    }

    // Check for duplicate tier name
    const existingTier = await XPTier.findOne({ tierName });
    if (existingTier) {
      return res.status(400).json({
        success: false,
        error: 'Tier name already exists'
      });
    }

    const newTier = new XPTier({
      tierName,
      tierColor: '#4CAF50', // Default color
      bgColor: '#f8f9fa', // Default background
      borderColor: '#dee2e6', // Default border
      iconSrc: iconSrc || 'https://rewardsapi.hireagent.co/uploads/avatars/1758267852322-951613456.png', // Use frontend provided or default
      xpMin,
      xpMax,
      xpRange: `${xpMin} - ${xpMax} XP`,
      badge: badge || '🥉',
      badgeFile: badgeFileUrl,
      accessBenefits: accessBenefits || 'Entry-level access',
      benefits: [], // Default empty array
      multipliers: { coins: 1.0, xp: 1.0, spins: 1.0 }, // Default multipliers
      requirements: { minLevel: 1, vipRequired: 'free', maxPerDay: null }, // Default requirements
      status,
      order: 0 // Default order
    });

    await newTier.save();

    res.status(201).json({
      success: true,
      data: newTier,
      message: 'XP tier created successfully'
    });
  } catch (error) {
    console.error('Error creating XP tier:', error);
    
    // Handle multer errors specifically
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum 5MB allowed.'
      });
    }
    
    if (error.message === 'Only PNG, SVG, JPG, JPEG, and WebP files are allowed for badges') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to create XP tier'
    });
  }
});

// Update XP tier
router.put('/xp-tiers/:id', upload.single('badgeFile'), async (req, res) => {
  try {
    const {
      tierName,
      xpMin,
      xpMax,
      badge,
      accessBenefits,
      iconSrc,
      status
    } = req.body;

    // Handle file upload
    let badgeFileUrl = null;
    if (req.file) {
      // Generate URL for uploaded file
      badgeFileUrl = `/uploads/badges/${req.file.filename}`;
    }

    const tier = await XPTier.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP tier not found'
      });
    }

    // Validation for XP range if being updated
    if (xpMin !== undefined && xpMax !== undefined) {
      if (xpMin >= xpMax) {
        return res.status(400).json({
          success: false,
          error: 'XP min must be less than XP max'
        });
      }

      // Check for overlapping XP ranges (excluding current tier)
      const overlappingTier = await XPTier.findOne({
        _id: { $ne: req.params.id },
        $or: [
          { xpMin: { $lte: xpMax }, xpMax: { $gte: xpMin } }
        ],
        status: true
      });

      if (overlappingTier) {
        return res.status(400).json({
          success: false,
          error: `XP range overlaps with existing tier: ${overlappingTier.tierName}`
        });
      }
    }

    // Check for duplicate tier name (excluding current tier)
    if (tierName && tierName !== tier.tierName) {
      const existingTier = await XPTier.findOne({ tierName, _id: { $ne: req.params.id } });
      if (existingTier) {
        return res.status(400).json({
          success: false,
          error: 'Tier name already exists'
        });
      }
    }

    // Update fields - only update fields that frontend sends
    if (tierName !== undefined) tier.tierName = tierName;
    if (xpMin !== undefined) tier.xpMin = xpMin;
    if (xpMax !== undefined) tier.xpMax = xpMax;
    if (badge !== undefined) tier.badge = badge;
    if (badgeFileUrl !== null) tier.badgeFile = badgeFileUrl;
    if (accessBenefits !== undefined) tier.accessBenefits = accessBenefits;
    if (iconSrc !== undefined) tier.iconSrc = iconSrc;
    if (status !== undefined) tier.status = status;
    
    // Auto-update xpRange when xpMin or xpMax changes
    if (xpMin !== undefined || xpMax !== undefined) {
      tier.xpRange = `${tier.xpMin} - ${tier.xpMax} XP`;
    }

    await tier.save();

    res.json({
      success: true,
      data: tier,
      message: 'XP tier updated successfully'
    });
  } catch (error) {
    console.error('Error updating XP tier:', error);
    
    // Handle multer errors specifically
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size too large. Maximum 5MB allowed.'
      });
    }
    
    if (error.message === 'Only PNG, SVG, JPG, JPEG, and WebP files are allowed for badges') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update XP tier'
    });
  }
});

// Bulk delete XP tiers
router.delete('/xp-tiers/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await XPTier.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `${result.deletedCount} XP tiers deleted successfully`
    });
  } catch (error) {
    console.error('Error bulk deleting XP tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk delete XP tiers'
    });
  }
});

// Delete XP tier
router.delete('/xp-tiers/:id', async (req, res) => {
  try {
    const tier = await XPTier.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP tier not found'
      });
    }

    await XPTier.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'XP tier deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting XP tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete XP tier'
    });
  }
});

// Toggle XP tier status
router.patch('/xp-tiers/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const tier = await XPTier.findById(req.params.id);
    
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'XP tier not found'
      });
    }

    tier.status = status !== undefined ? status : !tier.status;
    await tier.save();

    res.json({
      success: true,
      data: tier,
      message: `XP tier ${tier.status ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling XP tier status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle XP tier status'
    });
  }
});

// Bulk update XP tiers status
router.patch('/xp-tiers/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await XPTier.updateMany(
      { _id: { $in: ids } },
      { status: status }
    );

    res.json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      },
      message: `${result.modifiedCount} XP tiers updated successfully`
    });
  } catch (error) {
    console.error('Error bulk updating XP tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update XP tiers'
    });
  }
});

/* ========================================
   BONUS LOGIC APIs
======================================== */

// Get all bonus logic rules
router.get('/bonus-logic', async (req, res) => {
  try {
    const { status, bonusType, active, category } = req.query;
    
    let query = {};
    if (status !== undefined) query.status = status === 'true';
    if (active !== undefined) query.active = active === 'true';
    if (bonusType) query.bonusType = bonusType;
    if (category) query['metadata.category'] = category;

    const bonusRules = await BonusLogic.find(query)
      .sort({ priority: -1, order: 1 })
      .lean();

    res.json({
      success: true,
      data: bonusRules,
      total: bonusRules.length
    });
  } catch (error) {
    console.error('Error fetching bonus logic rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bonus logic rules'
    });
  }
});

// Get single bonus logic rule
router.get('/bonus-logic/:id', async (req, res) => {
  try {
    const rule = await BonusLogic.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Bonus logic rule not found'
      });
    }

    res.json({
      success: true,
      data: rule
    });
  } catch (error) {
    console.error('Error fetching bonus logic rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bonus logic rule'
    });
  }
});

// Create new bonus logic rule
router.post('/bonus-logic', async (req, res) => {
  try {
    const {
      bonusType,
      triggerCondition,
      rewardValue,
      active = true
    } = req.body;

    // Validation
    if (!bonusType || !triggerCondition || !rewardValue) {
      return res.status(400).json({
        success: false,
        error: 'Bonus type, trigger condition, and reward value are required'
      });
    }

    // Parse reward value to extract details
    let rewardDetails = { coins: 0, xp: 0, spins: 0, giftCards: 0, multiplier: 1.0, duration: 0 };
    if (rewardValue) {
      const match = rewardValue.match(/(\d+)\s+(XP|Coins?|Points?|₹|\$)/i);
      if (match) {
        const value = parseInt(match[1]);
        const type = match[2].toLowerCase();
        if (type.includes('xp')) {
          rewardDetails.xp = value;
        } else if (type.includes('coin')) {
          rewardDetails.coins = value;
        } else if (type.includes('point')) {
          rewardDetails.coins = value; // Points = Coins
        } else if (type.includes('₹') || type.includes('$')) {
          rewardDetails.giftCards = value;
        }
      }
    }

    const newRule = new BonusLogic({
      bonusType,
      triggerCondition,
      triggerDetails: {}, // Default empty object
      rewardValue,
      rewardDetails,
      conditions: { minLevel: 1, vipRequired: 'free', maxPerUser: null, maxPerDay: null, cooldownPeriod: 0 },
      notification: { enabled: true, title: 'New Bonus Available!', message: 'Check out our latest bonus and earn more rewards!', sendBefore: 24 },
      active,
      status: true, // Default to true
      priority: 0, // Default priority
      order: 0, // Default order
      metadata: { description: '', category: 'engagement', tags: [], createdBy: 'admin' }
    });

    await newRule.save();

    res.status(201).json({
      success: true,
      data: newRule,
      message: 'Bonus logic rule created successfully'
    });
  } catch (error) {
    console.error('Error creating bonus logic rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bonus logic rule'
    });
  }
});

// Update bonus logic rule
router.put('/bonus-logic/:id', async (req, res) => {
  try {
    const {
      bonusType,
      triggerCondition,
      triggerDetails,
      rewardValue,
      rewardDetails,
      conditions,
      notification,
      active,
      status,
      priority,
      order,
      metadata
    } = req.body;

    const rule = await BonusLogic.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Bonus logic rule not found'
      });
    }

    // Check for duplicate active bonus types (excluding current rule)
    if (bonusType && active && status) {
      const existingRule = await BonusLogic.findOne({
        _id: { $ne: req.params.id },
        bonusType,
        active: true,
        status: true
      });

      if (existingRule) {
        return res.status(400).json({
          success: false,
          error: `Only one active bonus of type "${bonusType}" is allowed. Please deactivate the existing one first.`
        });
      }
    }

    // Update fields
    if (bonusType !== undefined) rule.bonusType = bonusType;
    if (triggerCondition !== undefined) rule.triggerCondition = triggerCondition;
    if (triggerDetails !== undefined) rule.triggerDetails = triggerDetails;
    if (rewardValue !== undefined) rule.rewardValue = rewardValue;
    if (rewardDetails !== undefined) rule.rewardDetails = rewardDetails;
    if (conditions !== undefined) rule.conditions = conditions;
    if (notification !== undefined) rule.notification = notification;
    if (active !== undefined) rule.active = active;
    if (status !== undefined) rule.status = status;
    if (priority !== undefined) rule.priority = priority;
    if (order !== undefined) rule.order = order;
    if (metadata !== undefined) rule.metadata = metadata;

    await rule.save();

    res.json({
      success: true,
      data: rule,
      message: 'Bonus logic rule updated successfully'
    });
  } catch (error) {
    console.error('Error updating bonus logic rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bonus logic rule'
    });
  }
});

// Bulk delete bonus logic rules
router.delete('/bonus-logic/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await BonusLogic.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      data: {
        deletedCount: result.deletedCount
      },
      message: `${result.deletedCount} bonus logic rules deleted successfully`
    });
  } catch (error) {
    console.error('Error bulk deleting bonus logic rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk delete bonus logic rules'
    });
  }
});

// Delete bonus logic rule
router.delete('/bonus-logic/:id', async (req, res) => {
  try {
    const rule = await BonusLogic.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Bonus logic rule not found'
      });
    }

    await BonusLogic.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Bonus logic rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting bonus logic rule:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bonus logic rule'
    });
  }
});

// Toggle bonus logic rule status
router.patch('/bonus-logic/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const rule = await BonusLogic.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Bonus logic rule not found'
      });
    }

    rule.status = status !== undefined ? status : !rule.status;
    await rule.save();

    res.json({
      success: true,
      data: rule,
      message: `Bonus logic rule ${rule.status ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling bonus logic rule status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle bonus logic rule status'
    });
  }
});

// Toggle bonus logic rule active status
router.patch('/bonus-logic/:id/active', async (req, res) => {
  try {
    const { active } = req.body;
    
    const rule = await BonusLogic.findById(req.params.id);
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Bonus logic rule not found'
      });
    }

    // Check for duplicate active bonus types
    if (active && rule.status) {
      const existingRule = await BonusLogic.findOne({
        _id: { $ne: req.params.id },
        bonusType: rule.bonusType,
        active: true,
        status: true
      });

      if (existingRule) {
        return res.status(400).json({
          success: false,
          error: `Only one active bonus of type "${rule.bonusType}" is allowed. Please deactivate the existing one first.`
        });
      }
    }

    rule.active = active !== undefined ? active : !rule.active;
    await rule.save();

    res.json({
      success: true,
      data: rule,
      message: `Bonus logic rule ${rule.active ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling bonus logic rule active status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle bonus logic rule active status'
    });
  }
});

// Bulk update bonus logic rules status
router.patch('/bonus-logic/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'IDs array is required'
      });
    }

    const result = await BonusLogic.updateMany(
      { _id: { $in: ids } },
      { status: status }
    );

    res.json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      },
      message: `${result.modifiedCount} bonus logic rules updated successfully`
    });
  } catch (error) {
    console.error('Error bulk updating bonus logic rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to bulk update bonus logic rules'
    });
  }
});

module.exports = router;





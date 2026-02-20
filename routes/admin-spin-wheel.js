/**
 * Admin Spin Wheel Manager Routes
 * Manages spin wheel rewards, configuration, and analytics
 * @module routes/admin-spin-wheel
 */

const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const { adminAuth } = require("../middleware/adminAuth");
const SpinWheelReward = require("../models/SpinWheelReward");
const SpinWheelConfig = require("../models/SpinWheelConfig");
const SpinWheelLog = require("../models/SpinWheelLog");
const { 
  validateProbabilityConfiguration, 
  getProbabilityAnalysis,
  suggestProbabilityFixes 
} = require("../utils/spinWheelProbabilityValidator");
const User = require("../models/User");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const config = require("../config/config");

/**
 * Parse date string as UTC for campaign start/end.
 * If the string has no timezone (e.g. from datetime-local), treat it as UTC.
 */
function parseDateAsUTC(value) {
  if (!value || typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

// Multer setup for icon uploads
const iconsUploadDir = path.join(__dirname, "../uploads/spin-wheel/icons");
fs.mkdirSync(iconsUploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, iconsUploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Invalid file type. Only PNG, JPEG, WEBP, SVG allowed."));
  },
});

// ==================== PRIZE POOL MANAGEMENT ====================

/**
 * @route   GET /api/admin/spin-wheel/rewards
 * @desc    Get all spin wheel rewards with filters
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} search - Search by reward name
 * @query   {string} type - Filter by reward type
 * @query   {string} status - Filter by active status
 * @query   {string} tier - Filter by eligible tier
 * @access  Admin
 */
router.get(
  "/rewards",
  adminAuth,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { page = 1, limit = 10, search, type, status, tier } = req.query;

      // Build query
      const query = {};

      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      if (type) query.type = type;
      if (status !== undefined) query.isActive = status === "active";
      if (tier) query.eligibleTiers = tier;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [rewards, total] = await Promise.all([
        SpinWheelReward.find(query)
          .populate("createdBy", "firstName lastName email")
          .populate("updatedBy", "firstName lastName email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        SpinWheelReward.countDocuments(query),
      ]);

      // Get total probability validation
      const probabilityCheck = await SpinWheelReward.validateTotalProbability();

      res.json({
        success: true,
        data: {
          rewards,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit),
          },
          probabilityCheck,
        },
      });
    } catch (error) {
      console.error("Error getting spin wheel rewards:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get spin wheel rewards",
      });
    }
  }
);

/**
 * @route   POST /api/admin/spin-wheel/rewards
 * @desc    Create new spin wheel reward
 * @body    {string} name - Reward name
 * @body    {string} type - Reward type
 * @body    {number} amount - Reward amount
 * @body    {number} probability - Win probability (0-100)
 * @body    {array} eligibleTiers - Eligible user tiers
 * @body    {string} icon - Icon URL
 * @body    {string} color - Reward color
 * @body    {object} metadata - Additional reward data
 * @access  Admin
 */
router.post(
  "/rewards",
  adminAuth,
  upload.single("icon"),
  [
    body("name").notEmpty().withMessage("Reward name is required"),
    body("type")
      .isIn(["coins", "xp", "coupon", "bonus_task", "premium_feature"])
      .withMessage("Invalid reward type"),
    body("amount").isInt({ min: 0 }).withMessage("Amount must be non-negative"),
    body("probability")
      .isFloat({ min: 0, max: 100 })
      .withMessage("Probability must be between 0 and 100"),
    body("eligibleTiers")
      .optional()
      .isArray()
      .withMessage("Eligible tiers must be an array"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      // Frontend compatibility: map label->name, active->isActive, tierVisibility->eligibleTiers
      const name = (req.body.name || req.body.label || "").toString().trim();
      let type = (req.body.type || "").toString().trim();
      const amount = req.body.amount;
      const probability = req.body.probability;
      const color = (req.body.color || "#FFD700").toString();
      const metadata = req.body.metadata || {};

      // Normalize numeric fields (multipart form-data sends strings)
      const amountNum = Number(amount);
      const probabilityNum = Number(probability);
      if (Number.isNaN(amountNum) || Number.isNaN(probabilityNum)) {
        return res.status(400).json({
          success: false,
          error: "Amount and probability must be numbers",
        });
      }

      // Normalize tiers from either eligibleTiers or eligibleTiers[]
      // Accept tierVisibility from frontend or eligibleTiers (array or repeated keys)
      const TIER_LIST = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
      let tiers =
        req.body.eligibleTiers ??
        req.body["eligibleTiers[]"] ??
        req.body.tierVisibility;
      if (!tiers) {
        tiers = TIER_LIST;
      } else if (typeof tiers === "string") {
        tiers = [tiers];
      }
      if (tiers.includes("All Tiers")) tiers = TIER_LIST;

      // Normalize type
      const typeMap = {
        Coins: "coins",
        coins: "coins",
        XP: "xp",
        xp: "xp",
        Coupon: "coupon",
        coupon: "coupon",
        "Bonus Task": "bonus_task",
        bonus_task: "bonus_task",
        Premium: "premium_feature",
        premium: "premium_feature",
        premium_feature: "premium_feature",
      };
      type = typeMap[type] || type;

      // Enhanced probability validation for BUG-063
      const probabilityValidation = await validateProbabilityConfiguration({
        name,
        probability: probabilityNum,
        eligibleTiers: tiers
      });

      if (!probabilityValidation.isValid) {
        const suggestions = suggestProbabilityFixes(probabilityValidation);
        return res.status(400).json({
          success: false,
          error: "Probability configuration is invalid",
          details: probabilityValidation.errors,
          warnings: probabilityValidation.warnings,
          suggestions: suggestions.suggestions,
          tierAnalysis: probabilityValidation.tierAnalysis,
          message: "Same probability can be used across different tiers, but not within the same tier"
        });
      }

      const payload = {
        name,
        type,
        amount: amountNum,
        probability: probabilityNum,
        eligibleTiers: tiers,
        color,
        metadata,
        createdBy: req.user.userId,
        isActive:
          req.body.isActive !== undefined
            ? req.body.isActive
            : req.body.active !== undefined
            ? req.body.active
            : true,
      };

      if (req.file) {
        let finalFilename = req.file.filename;
        const isRaster = req.file.mimetype !== "image/svg+xml";
        if (isRaster) {
          const optimizedName = `${Date.now()}-optimized-${
            path.parse(req.file.filename).name
          }.webp`;
          const optimizedPath = path.join(iconsUploadDir, optimizedName);
          await sharp(req.file.path)
            .resize(256, 256, { fit: "inside" })
            .webp({ quality: 85 })
            .toFile(optimizedPath);
          fs.unlink(req.file.path, () => {});
          finalFilename = optimizedName;
        }
        payload.icon = `${config.IMAGE_BASE_URL}/uploads/spin-wheel/icons/${finalFilename}`;
      }

      const reward = new SpinWheelReward(payload);

      await reward.save();

      // Get updated probability check
      const updatedProbabilityCheck =
        await SpinWheelReward.validateTotalProbability();

      res.status(201).json({
        success: true,
        message: "Reward created successfully",
        data: {
          reward,
          probabilityCheck: updatedProbabilityCheck,
        },
      });
    } catch (error) {
      console.error("Error creating spin wheel reward:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create reward",
      });
    }
  }
);

/**
 * @route   GET /api/admin/spin-wheel/rewards/:id
 * @desc    Get single spin wheel reward
 * @access  Admin
 */
router.get("/rewards/:id", adminAuth, async (req, res) => {
  try {
    const reward = await SpinWheelReward.findById(req.params.id)
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email");

    if (!reward) {
      return res.status(404).json({
        success: false,
        error: "Reward not found",
      });
    }

    res.json({
      success: true,
      data: reward,
    });
  } catch (error) {
    console.error("Error getting spin wheel reward:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get reward",
    });
  }
});

/**
 * @route   PUT /api/admin/spin-wheel/rewards/:id
 * @desc    Update spin wheel reward
 * @access  Admin
 */
router.put(
  "/rewards/:id",
  adminAuth,
  upload.single("icon"),
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Reward name cannot be empty"),
    body("type")
      .optional()
      .custom((value) => {
        const validTypes = [
          "coins",
          "Coins",
          "xp",
          "XP",
          "coupon",
          "Coupon",
          "Coupons",
          "bonus_task",
          "Bonus Task",
          "premium_feature",
          "Premium",
          "premium",
        ];
        return validTypes.includes(value);
      })
      .withMessage("Invalid reward type"),
    body("amount")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Amount must be non-negative"),
    body("probability")
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Probability must be between 0 and 100"),
    body("eligibleTiers")
      .optional()
      .isArray()
      .withMessage("Eligible tiers must be an array"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const reward = await SpinWheelReward.findById(req.params.id);
      if (!reward) {
        return res.status(404).json({
          success: false,
          error: "Reward not found",
        });
      }

      // Enhanced probability validation for BUG-063 (for updates)
      if (req.body.probability !== undefined || req.body.eligibleTiers !== undefined) {
        const newProbability = req.body.probability !== undefined 
          ? Number(req.body.probability) 
          : reward.probability;
        const newEligibleTiers = req.body.eligibleTiers !== undefined 
          ? (Array.isArray(req.body.eligibleTiers) ? req.body.eligibleTiers : [req.body.eligibleTiers])
          : reward.eligibleTiers;

        if (Number.isNaN(newProbability)) {
          return res.status(400).json({ 
            success: false, 
            error: "Probability must be a number" 
          });
        }

        const probabilityValidation = await validateProbabilityConfiguration({
          name: req.body.name || reward.name,
          probability: newProbability,
          eligibleTiers: newEligibleTiers
        }, req.params.id); // Exclude current reward from validation

        if (!probabilityValidation.isValid) {
          const suggestions = suggestProbabilityFixes(probabilityValidation);
          return res.status(400).json({
            success: false,
            error: "Probability configuration is invalid",
            details: probabilityValidation.errors,
            warnings: probabilityValidation.warnings,
            suggestions: suggestions.suggestions,
            tierAnalysis: probabilityValidation.tierAnalysis,
            message: "Same probability can be used across different tiers, but not within the same tier"
          });
        }
      }

      // Normalize numeric fields on update and map frontend aliases
      const updatePayload = { ...req.body };
      if (updatePayload.label && !updatePayload.name)
        updatePayload.name = updatePayload.label;
      if (
        updatePayload.active !== undefined &&
        updatePayload.isActive === undefined
      )
        updatePayload.isActive = updatePayload.active;
      if (updatePayload.amount !== undefined)
        updatePayload.amount = Number(updatePayload.amount);
      if (updatePayload.probability !== undefined)
        updatePayload.probability = Number(updatePayload.probability);

      // Normalize type field (same as POST endpoint)
      if (updatePayload.type !== undefined) {
        const typeMap = {
          Coins: "coins",
          coins: "coins",
          XP: "xp",
          xp: "xp",
          Coupon: "coupon",
          Coupons: "coupon", // Handle plural form
          coupon: "coupon",
          "Bonus Task": "bonus_task",
          bonus_task: "bonus_task",
          Premium: "premium_feature",
          premium: "premium_feature",
          premium_feature: "premium_feature",
        };
        updatePayload.type = typeMap[updatePayload.type] || updatePayload.type;
      }

      // Normalize eligible tiers arrays
      if (updatePayload["eligibleTiers[]"] && !updatePayload.eligibleTiers) {
        updatePayload.eligibleTiers = Array.isArray(
          updatePayload["eligibleTiers[]"]
        )
          ? updatePayload["eligibleTiers[]"]
          : [updatePayload["eligibleTiers[]"]];
        delete updatePayload["eligibleTiers[]"];
      }
      if (updatePayload.tierVisibility && !updatePayload.eligibleTiers) {
        const TIER_LIST = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
        updatePayload.eligibleTiers = Array.isArray(
          updatePayload.tierVisibility
        )
          ? updatePayload.tierVisibility
          : [updatePayload.tierVisibility];
        if (updatePayload.eligibleTiers.includes("All Tiers"))
          updatePayload.eligibleTiers = TIER_LIST;
        delete updatePayload.tierVisibility;
      }

      // Update reward
      Object.assign(reward, updatePayload);

      // If icon uploaded with PUT, process it and update
      if (req.file) {
        let finalFilename = req.file.filename;
        const isRaster = req.file.mimetype !== "image/svg+xml";
        if (isRaster) {
          const optimizedName = `${Date.now()}-optimized-${
            path.parse(req.file.filename).name
          }.webp`;
          const optimizedPath = path.join(iconsUploadDir, optimizedName);
          await sharp(req.file.path)
            .resize(256, 256, { fit: "inside" })
            .webp({ quality: 85 })
            .toFile(optimizedPath);
          fs.unlink(req.file.path, () => {});
          finalFilename = optimizedName;
        }

        if (reward.icon && reward.icon.startsWith(config.IMAGE_BASE_URL)) {
          const oldPath = path.join(
            __dirname,
            "..",
            reward.icon.replace(config.IMAGE_BASE_URL, "").replace(/^\//, "")
          );
          fs.existsSync(oldPath) && fs.unlink(oldPath, () => {});
        }

        reward.icon = `${config.IMAGE_BASE_URL}/uploads/spin-wheel/icons/${finalFilename}`;
      }
      reward.updatedBy = req.user.userId;
      await reward.save();

      // Get updated probability check
      const updatedProbabilityCheck =
        await SpinWheelReward.validateTotalProbability();

      res.json({
        success: true,
        message: "Reward updated successfully",
        data: {
          reward,
          probabilityCheck: updatedProbabilityCheck,
        },
      });
    } catch (error) {
      console.error("Error updating spin wheel reward:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update reward",
      });
    }
  }
);

/**
 * @route   DELETE /api/admin/spin-wheel/rewards/:id
 * @desc    Delete spin wheel reward
 * @access  Admin
 */
router.delete("/rewards/:id", adminAuth, async (req, res) => {
  try {
    const reward = await SpinWheelReward.findById(req.params.id);
    if (!reward) {
      return res.status(404).json({
        success: false,
        error: "Reward not found",
      });
    }

    await SpinWheelReward.findByIdAndDelete(req.params.id);

    // Get updated probability check
    const updatedProbabilityCheck =
      await SpinWheelReward.validateTotalProbability();

    res.json({
      success: true,
      message: "Reward deleted successfully",
      data: {
        probabilityCheck: updatedProbabilityCheck,
      },
    });
  } catch (error) {
    console.error("Error deleting spin wheel reward:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete reward",
    });
  }
});

/**
 * @route   POST /api/admin/spin-wheel/rewards/:id/icon
 * @desc    Upload or replace reward icon
 * @access  Admin
 */
router.post(
  "/rewards/:id/icon",
  adminAuth,
  upload.single("icon"),
  async (req, res) => {
    try {
      const reward = await SpinWheelReward.findById(req.params.id);
      if (!reward) {
        return res
          .status(404)
          .json({ success: false, error: "Reward not found" });
      }

      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "Icon file is required" });
      }

      // Optional: generate optimized PNG/WEBP preview (skip for SVG)
      let finalFilename = req.file.filename;
      const isRaster = req.file.mimetype !== "image/svg+xml";
      if (isRaster) {
        const optimizedName = `${Date.now()}-optimized-${
          path.parse(req.file.filename).name
        }.webp`;
        const optimizedPath = path.join(iconsUploadDir, optimizedName);
        await sharp(req.file.path)
          .resize(256, 256, { fit: "inside" })
          .webp({ quality: 85 })
          .toFile(optimizedPath);
        // delete original
        fs.unlink(req.file.path, () => {});
        finalFilename = optimizedName;
      }

      // Delete old icon file if exists and is local
      if (reward.icon && reward.icon.startsWith(config.IMAGE_BASE_URL)) {
        const oldPath = path.join(
          __dirname,
          "..",
          reward.icon.replace(config.IMAGE_BASE_URL, "").replace(/^\//, "")
        );
        fs.existsSync(oldPath) && fs.unlink(oldPath, () => {});
      }

      const publicUrl = `${config.IMAGE_BASE_URL}/uploads/spin-wheel/icons/${finalFilename}`;
      reward.icon = publicUrl;
      reward.updatedBy = req.user.userId;
      await reward.save();

      res.json({
        success: true,
        message: "Icon uploaded successfully",
        data: { iconUrl: publicUrl, rewardId: reward._id },
      });
    } catch (error) {
      console.error("Error uploading icon:", error);
      res.status(500).json({ success: false, error: "Failed to upload icon" });
    }
  }
);

/**
 * @route   PATCH /api/admin/spin-wheel/rewards/:id/toggle
 * @desc    Toggle reward active status
 * @access  Admin
 */
router.patch("/rewards/:id/toggle", adminAuth, async (req, res) => {
  try {
    const reward = await SpinWheelReward.findById(req.params.id);
    if (!reward) {
      return res.status(404).json({
        success: false,
        error: "Reward not found",
      });
    }

    reward.isActive = !reward.isActive;
    reward.updatedBy = req.user.userId;
    await reward.save();

    // Get updated probability check
    const updatedProbabilityCheck =
      await SpinWheelReward.validateTotalProbability();

    res.json({
      success: true,
      message: `Reward ${
        reward.isActive ? "activated" : "deactivated"
      } successfully`,
      data: {
        reward,
        probabilityCheck: updatedProbabilityCheck,
      },
    });
  } catch (error) {
    console.error("Error toggling reward status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle reward status",
    });
  }
});

// ==================== SPIN WHEEL CONFIGURATION ====================

/**
 * @route   GET /api/admin/spin-wheel/config
 * @desc    Get spin wheel configuration
 * @access  Admin
 */
router.get("/config", adminAuth, async (req, res) => {
  try {
    const config = await SpinWheelConfig.findOne({ isActive: true })
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email");

    if (!config) {
      // Return default configuration
      const defaultConfig = {
        name: "Main Spin Wheel",
        spinMode: "free",
        cooldownMinutes: 360,
        maxSpinsPerDay: 3,
        eligibleTiers: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
        vipMultipliers: {
          bronze: 1.0,
          silver: 1.2,
          gold: 1.5,
          platinum: 2.0,
          diamond: 2.5,
        },
        additionalSpinsPerTier: {
          bronze: 5,
          silver: 0,
          gold: 10,
          platinum: 50,
          diamond: 0,
        },
        isActive: true,
        visualSettings: {
          wheelColors: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],
          animationDuration: 3000,
          soundEnabled: true,
        },
      };

      return res.json({
        success: true,
        data: {
          // Frontend naming
          spinMode: defaultConfig.spinMode,
          cooldownPeriod: Math.floor(defaultConfig.cooldownMinutes / 60), // Convert minutes to hours for frontend
          maxSpinsPerDay: defaultConfig.maxSpinsPerDay,
          eligibleTiers: ["All Tiers"],
          startDate: defaultConfig.startDate,
          endDate: defaultConfig.endDate,
          raw: defaultConfig,
        },
      });
    }

    const TIER_LIST = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    const isAllTiers =
      Array.isArray(config.eligibleTiers) &&
      config.eligibleTiers.length >= 3 &&
      config.eligibleTiers.every((t) => TIER_LIST.includes(t));
    res.json({
      success: true,
      data: {
        spinMode: config.spinMode === "ad_based" ? "ad-based" : config.spinMode,
        cooldownPeriod: Math.floor(config.cooldownMinutes / 60), // Convert minutes to hours for frontend
        maxSpinsPerDay: config.maxSpinsPerDay,
        eligibleTiers: isAllTiers ? ["All Tiers"] : config.eligibleTiers,
        startDate: config.startDate,
        endDate: config.endDate,
        raw: config,
      },
    });
  } catch (error) {
    console.error("Error getting spin wheel config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get configuration",
    });
  }
});

/**
 * @route   POST /api/admin/spin-wheel/config
 * @desc    Create or update spin wheel configuration
 * @body    {string} name - Configuration name
 * @body    {string} spinMode - Spin mode (free/ad_based/premium)
 * @body    {number} cooldownMinutes - Cooldown in minutes
 * @body    {number} maxSpinsPerDay - Max spins per day
 * @body    {array} eligibleTiers - Eligible user tiers
 * @body    {object} vipMultipliers - VIP tier multipliers
 * @body    {object} visualSettings - Visual configuration
 * @access  Admin
 */
router.post(
  "/config",
  adminAuth,
  [
    body("name")
      .optional()
      .notEmpty()
      .withMessage("Configuration name is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      // Frontend → Backend field mapping
      const name = req.body.name || "Main Spin Wheel";
      const spinModeInput = req.body.spinMode || "free";
      const spinMode =
        spinModeInput === "ad-based" ? "ad_based" : spinModeInput; // map frontend to backend enum

      // Frontend sends cooldownPeriod (hours). Convert to minutes for storage
      const cooldownPeriod = Number(req.body.cooldownPeriod);
      // If cooldownPeriod is provided and is less than 24, assume it's in hours and convert to minutes
      // Otherwise, assume it's already in minutes (for backward compatibility)
      let cooldownMinutes;
      if (
        Number.isFinite(cooldownPeriod) &&
        cooldownPeriod > 0 &&
        cooldownPeriod <= 24
      ) {
        // Frontend sends hours (1-24), convert to minutes
        cooldownMinutes = Math.floor(cooldownPeriod * 60);
      } else if (Number.isFinite(cooldownPeriod) && cooldownPeriod > 24) {
        // Already in minutes (backward compatibility)
        cooldownMinutes = cooldownPeriod;
      } else {
        // Fallback to default or use cooldownMinutes if provided
        cooldownMinutes = Number(req.body.cooldownMinutes || 360);
      }

      const maxSpinsPerDay = Number(req.body.maxSpinsPerDay || 3);

      const TIER_LIST = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
      let eligibleTiers = req.body.eligibleTiers || req.body["eligibleTiers[]"];
      if (!eligibleTiers)
        eligibleTiers = req.body.eligibleTiers || req.body.tiers || [];
      if (typeof eligibleTiers === "string") eligibleTiers = [eligibleTiers];
      if (eligibleTiers.includes("All Tiers") || eligibleTiers.length === 0)
        eligibleTiers = TIER_LIST;

      const vipMultipliers = req.body.vipMultipliers;
      const additionalSpinsPerTier = req.body.additionalSpinsPerTier;
      const visualSettings = req.body.visualSettings;
      // Store start/end as UTC so campaign window is enforced consistently
      const startDate = parseDateAsUTC(req.body.startDate);
      const endDate = parseDateAsUTC(req.body.endDate);

      // Deactivate existing config
      await SpinWheelConfig.updateMany({ isActive: true }, { isActive: false });

      // Create new config
      const config = new SpinWheelConfig({
        name,
        spinMode,
        cooldownMinutes,
        maxSpinsPerDay,
        eligibleTiers,
        vipMultipliers: vipMultipliers || {
          bronze: 1.0,
          silver: 1.2,
          gold: 1.5,
          platinum: 2.0,
          diamond: 2.5,
        },
        additionalSpinsPerTier: additionalSpinsPerTier || {
          bronze: 5,
          silver: 0,
          gold: 10,
          platinum: 50,
          diamond: 0,
        },
        visualSettings: visualSettings || {
          wheelColors: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],
          animationDuration: 3000,
          soundEnabled: true,
        },
        startDate: startDate || null,
        endDate: endDate || null,
        createdBy: req.user.userId,
      });

      await config.save();

      res.status(201).json({
        success: true,
        message: "Configuration saved successfully",
        data: config,
      });
    } catch (error) {
      console.error("Error saving spin wheel config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to save configuration",
      });
    }
  }
);

// ==================== ANALYTICS & STATISTICS ====================

/**
 * @route   GET /api/admin/spin-wheel/analytics/overview
 * @desc    Get spin wheel analytics overview
 * @query   {string} startDate - Start date filter
 * @query   {string} endDate - End date filter
 * @access  Admin
 */
router.get("/analytics/overview", adminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.createdAt = {};
      if (startDate) filters.createdAt.$gte = new Date(startDate);
      if (endDate) filters.createdAt.$lte = new Date(endDate);
    }

    const [totalSpins, totalWins, rewardStats, dailySpins, popularRewards] =
      await Promise.all([
        SpinWheelLog.countDocuments(filters),
        SpinWheelLog.countDocuments({ ...filters, isWin: true }),
        SpinWheelLog.getSpinStats(filters),
        SpinWheelLog.getDailySpinCounts(30),
        SpinWheelLog.getPopularRewards(10),
      ]);

    const winRate =
      totalSpins > 0 ? ((totalWins / totalSpins) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalSpins,
          totalWins,
          winRate: parseFloat(winRate),
          averageSpinsPerDay:
            dailySpins.length > 0
              ? (
                  dailySpins.reduce((sum, day) => sum + day.spinCount, 0) /
                  dailySpins.length
                ).toFixed(2)
              : 0,
        },
        rewardStats,
        dailySpins,
        popularRewards,
      },
    });
  } catch (error) {
    console.error("Error getting spin wheel analytics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get analytics",
    });
  }
});

/**
 * @route   GET /api/admin/spin-wheel/analytics/spins
 * @desc    Get spin wheel spin logs with filters
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} userTier - Filter by user tier
 * @query   {string} rewardType - Filter by reward type
 * @query   {string} startDate - Start date filter
 * @query   {string} endDate - End date filter
 * @access  Admin
 */
router.get(
  "/analytics/spins",
  adminAuth,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        page = 1,
        limit = 20,
        userTier,
        rewardType,
        startDate,
        endDate,
      } = req.query;

      // Build query
      const query = {};

      if (userTier) query.userTier = userTier;
      if (rewardType) query.rewardType = rewardType;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [spins, total] = await Promise.all([
        SpinWheelLog.find(query)
          .populate("user", "firstName lastName email mobile")
          .populate("reward", "name type amount")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        SpinWheelLog.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          spins,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Error getting spin logs:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get spin logs",
      });
    }
  }
);

// ==================== UTILITY ENDPOINTS ====================

/**
 * @route   GET /api/admin/spin-wheel/rewards/types
 * @desc    Get available reward types
 * @access  Admin
 */
router.get("/rewards/types", adminAuth, async (req, res) => {
  try {
    const types = ["coins", "xp", "coupon", "bonus_task", "premium_feature"];

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get reward types",
    });
  }
});

/**
 * @route   GET /api/admin/spin-wheel/rewards/tiers
 * @desc    Get available user tiers
 * @access  Admin
 */
router.get("/rewards/tiers", adminAuth, async (req, res) => {
  try {
    const tiers = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];

    res.json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to get user tiers",
    });
  }
});

/**
 * @route   GET /api/admin/spin-wheel/probability/check
 * @desc    Check probability configuration and get detailed analysis (BUG-063 Fix)
 * @access  Admin
 */
router.get("/probability/check", adminAuth, async (req, res) => {
  try {
    const [probabilityCheck, detailedAnalysis] = await Promise.all([
      SpinWheelReward.validateTotalProbability(),
      getProbabilityAnalysis()
    ]);

    res.json({
      success: true,
      data: {
        legacy: probabilityCheck, // Keep for backward compatibility
        analysis: detailedAnalysis,
        rules: {
          description: "BUG-063 Fix: Clarified probability rules",
          rules: [
            "Same probability CAN be used across different tiers",
            "Same probability CANNOT be duplicated within the same tier", 
            "Total probability per tier should not exceed 100%",
            "Global total probability CAN exceed 100% (tiers are independent)"
          ],
          // BUG-063 Fix: Provide per-tier remaining percentages instead of global
          remainingPerTier: calculateRemainingPerTier(detailedAnalysis),
          globalLimitEnforced: false // BUG-063 fix: No global limit
        }
      },
    });
  } catch (error) {
    console.error("Error checking probability:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check probability configuration",
    });
  }
});

/**
 * Calculate remaining probability percentage for each tier (BUG-063 fix)
 */
function calculateRemainingPerTier(analysis) {
  const allTiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
  const remaining = {};
  
  allTiers.forEach(tier => {
    const tierData = analysis.tierAnalysis[tier];
    if (tierData) {
      remaining[tier] = Math.max(0, 100 - tierData.totalProbability);
    } else {
      remaining[tier] = 100; // No rewards in this tier yet
    }
  });
  
  return remaining;
}

module.exports = router;

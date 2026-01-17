const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Import models
const Offer = require("../models/Offer");
const Game = require("../models/Game");
const GameTask = require("../models/GameTask");
const GameDisplayRule = require("../models/GameDisplayRule");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");
const User = require("../models/User");
const besitosController = require("../controllers/besitos.controller");
const bitlabsController = require("../controllers/bitlabs.controller");

// Admin authentication middleware
const { adminAuth } = require("../middleware/adminAuth");

// ==================== HELPER FUNCTIONS ====================

// Ensure compound unique index exists for game variants (gameId+gender+uiSection+ageGroup)
try {
  Game.collection.createIndex(
    { gameId: 1, gender: 1, uiSection: 1, ageGroup: 1 },
    { unique: true }
  );
} catch (e) {
  // ignore - index may already exist or not be creatable at runtime
  console.warn("Could not create game variant unique index:", e.message);
}

function normalizeSegmentValue(v) {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return String(v).trim();
  return v.trim();
}

function normalizeGender(g) {
  return normalizeSegmentValue(g).toLowerCase() || "all";
}

/**
 * Safely parse JSON values from form-data
 * Handles strings, arrays, and already parsed values
 * @param {any} value - Value to parse
 * @param {any} defaultValue - Default value if parsing fails
 * @returns {any} - Parsed value or default
 */
function safeParseJSON(value, defaultValue = []) {
  if (!value) return defaultValue;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch (e) {
      console.error("JSON parse error:", e.message, "Value:", value);
      return defaultValue;
    }
  }
  return value;
}

// Configure multer for offer creative uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/offer-creatives");
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only image files are allowed (jpeg, jpg, png, gif, webp, svg)"
        )
      );
    }
  },
});

// ==================== OFFERS MANAGEMENT ====================

// Get all offers with filtering and pagination
router.get("/offers", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      country = "",
      sdkProvider = "",
      xptr = "",
      adOffer = "",
      status = "all",
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Country filter
    if (country) {
      query.countries = { $in: [country] };
    }

    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }

    // XPTR filter
    if (xptr) {
      query.xptrRule = { $regex: xptr, $options: "i" };
    }

    // Ad Offer filter
    if (adOffer !== "") {
      query.isAdSupported = adOffer === "true";
    }

    // Status filter
    if (status !== "all") {
      const statusLower = status.toLowerCase();
      if (statusLower === "active") {
        query.isActive = true;
      } else if (statusLower === "inactive") {
        query.isActive = false;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const offers = await Offer.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("sdkProvider", "name")
      .lean();

    const total = await Offer.countDocuments(query);

    res.json({
      success: true,
      data: {
        offers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting offers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get offers",
      error: error.message,
    });
  }
});

// Get available UI sections/screens for games and offers
router.get("/ui-sections", adminAuth, async (req, res) => {
  try {
    // Get distinct uiSection values from both Games and Offers
    const [gameSections, offerSections] = await Promise.all([
      Game.distinct("uiSection"),
      Offer.distinct("uiSection"),
    ]);

    // Combine and deduplicate sections
    const allSections = [...new Set([...gameSections, ...offerSections])]
      .filter((section) => section && section.trim() !== "") // Remove empty/null values
      .sort();

    // Common screen/section names based on segments.json
    const commonSections = [
      "Swipe",
      "Most Played",
      "Most Played Screen",
      "Highest Earning",
      "Cash Coach Recommendation",
      "Leadership",
      "Featured",
      "Banner",
      "Carousel",
      "Home",
      "Games",
      "Wallet",
      "Discover",
    ];

    // Combine common sections with existing ones
    const allAvailableSections = [
      ...new Set([...commonSections, ...allSections]),
    ]
      .filter((section) => section && section.trim() !== "")
      .sort();

    res.json({
      success: true,
      data: {
        sections: allAvailableSections,
        gameSections: gameSections.filter((s) => s && s.trim() !== ""),
        offerSections: offerSections.filter((s) => s && s.trim() !== ""),
      },
    });
  } catch (error) {
    console.error("Error getting UI sections:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get UI sections",
      error: error.message,
    });
  }
});

// Get single offer by ID
router.get("/offers/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id)
      .populate("sdkProvider", "name")
      .lean();

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.json({
      success: true,
      data: offer,
    });
  } catch (error) {
    console.error("Error getting offer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get offer",
      error: error.message,
    });
  }
});

// Check if offer ID is available
router.get("/offers/check-id/:offerId", adminAuth, async (req, res) => {
  try {
    const { offerId } = req.params;

    const existingOffer = await Offer.findOne({ offerId });

    res.json({
      success: true,
      available: !existingOffer,
      message: existingOffer
        ? "This offer ID is already taken"
        : "This offer ID is available",
    });
  } catch (error) {
    console.error("Error checking offer ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check offer ID",
      error: error.message,
    });
  }
});

// Create or update offer variant with file uploads (upsert by offerId+gender+uiSection+ageGroup)
router.post(
  "/offers",
  adminAuth,
  upload.fields([
    { name: "offerCardImage", maxCount: 1 },
    { name: "additionalAssets", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      // Lookup offer from Besitos by offerId provided without sending headers
      req.query.offer_id = req.body.offerId;
      const captureOffer = () => {
        let payload = null;
        let code = 200;
        return {
          res: {
            status(c) {
              code = c;
              return this;
            },
            json(obj) {
              payload = obj;
              return this;
            },
          },
          get() {
            return payload || { success: false, data: [] };
          },
        };
      };
      const cap1 = captureOffer();
      await besitosController.getOffers(req, cap1.res);
      const getOffer = cap1.get();
      // If external offer lookup fails or returns empty, stop processing
      if (
        !getOffer ||
        getOffer.success !== true ||
        !Array.isArray(getOffer.data) ||
        getOffer.data.length === 0
      ) {
        return res.status(404).json({
          success: false,
          message: "External offer not found for the provided offerId",
          error: "EXTERNAL_OFFER_NOT_FOUND",
        });
      }

      // Parse JSON fields from form-data
      const parsedCountries = JSON.parse(req.body.countries || "[]");
      const parsedAgeGroups = req.body.ageGroups
        ? JSON.parse(req.body.ageGroups)
        : [];
      const targetGender = (req.body.gender || "all").toLowerCase();
      const targetUiSection = req.body.uiSection || "";
      const targetAgeGroup =
        req.body.ageGroup ||
        (Array.isArray(parsedAgeGroups) && parsedAgeGroups.length > 0
          ? parsedAgeGroups[0]
          : "");

      const offerData = {
        offerId: req.body.offerId,
        name: req.body.name,
        description: req.body.description,
        sdkProvider: req.body.sdkProvider,
        startDate: req.body.startDate,
        expiryDate: req.body.expiryDate,
        countries: parsedCountries,
        cities: req.body.cities ? JSON.parse(req.body.cities) : [],
        tierAccess: JSON.parse(req.body.tierAccess || "[]"),
        ageGroups: parsedAgeGroups,
        gender: targetGender,
        marketingChannel: req.body.marketingChannel,
        campaignName: req.body.campaignName,
        xpTier: req.body.xpTier ? parseInt(req.body.xpTier) : 1,
        isActive: req.body.isActive === "true",
        isDefaultFallback: req.body.isDefaultFallback === "true",
        isAdSupported: req.body.isAdSupported === "true",
        xptrRule: req.body.xptrRule,
        reward: {
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : 0,
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : 0,
        },
        metadata: {
          estimatedTimeMinutes: req.body.estimatedTime
            ? parseInt(req.body.estimatedTime)
            : 5,
          difficulty: req.body.difficulty || "easy",
          category: req.body.category || "survey",
          deepLink: req.body.deepLink,
          trackingId: req.body.trackingId,
        },
        createdBy: req.user.userId,
        deviceType: req.body.deviceType || "android",
        uiSection: targetUiSection,
        ageGroup: targetAgeGroup,
      };

      // Map external offer details into gameDetails snapshot
      const external = getOffer.data[0];
      offerData.gameDetails = {
        id: external.id || "",
        name: external.title || external.name || offerData.name,
        description: external.description || offerData.description,
        image: external.image || external.large_image || "",
        square_image: external.square_image || "",
        large_image: external.large_image || external.image || "",
        category:
          Array.isArray(external.categories) &&
          external.categories[0] &&
          external.categories[0].name
            ? external.categories[0].name
            : external.category || "",
        downloadUrl: external.url || "",
      };

      // Handle uploaded offer card image
      if (
        req.files &&
        req.files.offerCardImage &&
        req.files.offerCardImage[0]
      ) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.offerCardImage[0].filename}`;

        offerData.creative = {
          offerCard: {
            imageUrl: imageUrl,
            layout: req.body.cardLayout || "standard",
            dimensions: {
              width: req.body.cardWidth ? parseInt(req.body.cardWidth) : 320,
              height: req.body.cardHeight ? parseInt(req.body.cardHeight) : 180,
            },
          },
          additionalAssets: [],
        };

        // Store image URL in metadata as well for backward compatibility
        offerData.metadata.imageUrl = imageUrl;
      }

      // Handle additional asset uploads
      if (req.files && req.files.additionalAssets) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        if (!offerData.creative) {
          offerData.creative = { additionalAssets: [] };
        }

        req.files.additionalAssets.forEach((file, index) => {
          offerData.creative.additionalAssets.push({
            type: req.body[`assetType_${index}`] || "banner",
            url: `${baseUrl}/uploads/offer-creatives/${file.filename}`,
            altText: req.body[`assetAlt_${index}`] || `Asset ${index + 1}`,
          });
        });
      }

      // Upsert by compound key (offerId, gender, uiSection, ageGroup)
      const filter = {
        offerId: offerData.offerId,
        gender: targetGender,
        uiSection: targetUiSection,
        ageGroup: targetAgeGroup,
      };
      const update = {
        $set: {
          name: offerData.name,
          description: offerData.description,
          sdkProvider: offerData.sdkProvider,
          startDate: offerData.startDate,
          expiryDate: offerData.expiryDate,
          countries: offerData.countries,
          cities: offerData.cities,
          tierAccess: offerData.tierAccess,
          ageGroups: parsedAgeGroups,
          gender: targetGender,
          marketingChannel: offerData.marketingChannel,
          campaignName: offerData.campaignName,
          xpTier: offerData.xpTier,
          isActive: offerData.isActive,
          isDefaultFallback: offerData.isDefaultFallback,
          isAdSupported: offerData.isAdSupported,
          xptrRule: offerData.xptrRule,
          reward: offerData.reward,
          metadata: offerData.metadata,
          deviceType: offerData.deviceType,
          uiSection: targetUiSection,
          ageGroup: targetAgeGroup,
          gameDetails: offerData.gameDetails,
          creative: offerData.creative,
        },
        $setOnInsert: {
          offerId: offerData.offerId,
          createdBy: req.user.userId,
        },
      };

      const upserted = await Offer.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      });

      res.status(201).json({
        success: true,
        message: "Offer created/updated successfully",
        data: upserted,
      });
    } catch (error) {
      console.error("Error creating offer:", error);

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum size is 5MB",
          error: error.message,
        });
      }

      // Handle MongoDB duplicate key error (compound key)
      if (error.code === 11000 || error.name === "MongoServerError") {
        return res.status(400).json({
          success: false,
          message:
            "An offer variant with the same offerId, gender, uiSection and ageGroup already exists.",
          error: "DUPLICATE_OFFER_VARIANT",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create offer",
        error: error.message,
      });
    }
  }
);

// Update offer with file uploads
router.put(
  "/offers/:id",
  adminAuth,
  upload.fields([
    { name: "offerCardImage", maxCount: 1 },
    { name: "additionalAssets", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;

      // Find existing offer
      const existingOffer = await Offer.findById(id);
      if (!existingOffer) {
        return res.status(404).json({
          success: false,
          message: "Offer not found",
        });
      }

      // Check if updating offerId and if new offerId already exists
      if (req.body.offerId && req.body.offerId !== existingOffer.offerId) {
        const duplicateOffer = await Offer.findOne({
          offerId: req.body.offerId,
          _id: { $ne: id }, // Exclude current offer
        });

        if (duplicateOffer) {
          return res.status(400).json({
            success: false,
            message:
              "An offer with this ID already exists. The offerId field must be unique.",
            error: "DUPLICATE_OFFER_ID",
          });
        }
      }

      // Build update data
      const updateData = {
        updatedBy: req.user.userId,
        updatedAt: new Date(),
      };

      // Update basic fields if provided
      if (req.body.offerId) updateData.offerId = req.body.offerId;
      if (req.body.name) updateData.name = req.body.name;
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.sdkProvider) updateData.sdkProvider = req.body.sdkProvider;
      if (req.body.startDate) updateData.startDate = req.body.startDate;
      if (req.body.expiryDate) updateData.expiryDate = req.body.expiryDate;
      if (req.body.countries)
        updateData.countries = JSON.parse(req.body.countries);
      if (req.body.cities) updateData.cities = JSON.parse(req.body.cities);
      if (req.body.tierAccess)
        updateData.tierAccess = JSON.parse(req.body.tierAccess);
      if (req.body.ageGroups)
        updateData.ageGroups = JSON.parse(req.body.ageGroups);
      if (req.body.ageGroup) updateData.ageGroup = req.body.ageGroup;
      if (req.body.gender) updateData.gender = req.body.gender;
      if (req.body.uiSection !== undefined)
        updateData.uiSection = req.body.uiSection || "";
      if (req.body.marketingChannel)
        updateData.marketingChannel = req.body.marketingChannel;
      if (req.body.campaignName)
        updateData.campaignName = req.body.campaignName;
      if (req.body.xpTier) updateData.xpTier = parseInt(req.body.xpTier);
      if (req.body.isActive !== undefined)
        updateData.isActive = req.body.isActive === "true";
      if (req.body.isDefaultFallback !== undefined)
        updateData.isDefaultFallback = req.body.isDefaultFallback === "true";
      if (req.body.isAdSupported !== undefined)
        updateData.isAdSupported = req.body.isAdSupported === "true";
      if (req.body.xptrRule) updateData.xptrRule = req.body.xptrRule;

      // Update rewards
      if (req.body.rewardCoins || req.body.rewardXP) {
        updateData.reward = {
          coins: req.body.rewardCoins
            ? parseFloat(req.body.rewardCoins)
            : existingOffer.reward?.coins || 0,
          xp: req.body.rewardXP
            ? parseFloat(req.body.rewardXP)
            : existingOffer.reward?.xp || 0,
        };
      }

      // Update metadata
      if (
        req.body.estimatedTime ||
        req.body.difficulty ||
        req.body.category ||
        req.body.deepLink ||
        req.body.trackingId
      ) {
        updateData.metadata = {
          ...existingOffer.metadata?.toObject(),
          estimatedTimeMinutes: req.body.estimatedTime
            ? parseInt(req.body.estimatedTime)
            : existingOffer.metadata?.estimatedTimeMinutes,
          difficulty: req.body.difficulty || existingOffer.metadata?.difficulty,
          category: req.body.category || existingOffer.metadata?.category,
          deepLink: req.body.deepLink || existingOffer.metadata?.deepLink,
          trackingId: req.body.trackingId || existingOffer.metadata?.trackingId,
        };
      }

      // Handle new uploaded offer card image
      if (
        req.files &&
        req.files.offerCardImage &&
        req.files.offerCardImage[0]
      ) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.offerCardImage[0].filename}`;

        updateData.creative = {
          ...existingOffer.creative?.toObject(),
          offerCard: {
            imageUrl: imageUrl,
            layout:
              req.body.cardLayout ||
              existingOffer.creative?.offerCard?.layout ||
              "standard",
            dimensions: {
              width: req.body.cardWidth
                ? parseInt(req.body.cardWidth)
                : existingOffer.creative?.offerCard?.dimensions?.width || 320,
              height: req.body.cardHeight
                ? parseInt(req.body.cardHeight)
                : existingOffer.creative?.offerCard?.dimensions?.height || 180,
            },
          },
        };

        // Update metadata imageUrl for backward compatibility
        if (!updateData.metadata) updateData.metadata = {};
        updateData.metadata.imageUrl = imageUrl;
      }

      // Handle new additional asset uploads
      if (req.files && req.files.additionalAssets) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        if (!updateData.creative) {
          updateData.creative = existingOffer.creative?.toObject() || {};
        }

        updateData.creative.additionalAssets =
          existingOffer.creative?.additionalAssets || [];

        req.files.additionalAssets.forEach((file, index) => {
          updateData.creative.additionalAssets.push({
            type: req.body[`assetType_${index}`] || "banner",
            url: `${baseUrl}/uploads/offer-creatives/${file.filename}`,
            altText: req.body[`assetAlt_${index}`] || `Asset ${index + 1}`,
          });
        });
      }

      const offer = await Offer.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      res.json({
        success: true,
        message: "Offer updated successfully",
        data: offer,
      });
    } catch (error) {
      console.error("Error updating offer:", error);

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum size is 5MB",
          error: error.message,
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === "MongoServerError") {
        return res.status(400).json({
          success: false,
          message:
            "An offer with this ID already exists. The offerId field must be unique.",
          error: "DUPLICATE_OFFER_ID",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update offer",
        error: error.message,
      });
    }
  }
);

// Delete offer
router.delete("/offers/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findByIdAndDelete(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.json({
      success: true,
      message: "Offer deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete offer",
      error: error.message,
    });
  }
});

// Toggle offer status
router.patch("/offers/:id/toggle-status", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findById(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    offer.isActive = !offer.isActive;
    offer.updatedBy = req.user.userId;
    offer.updatedAt = new Date();

    await offer.save();

    res.json({
      success: true,
      message: `Offer ${
        offer.isActive ? "activated" : "deactivated"
      } successfully`,
      data: { isActive: offer.isActive },
    });
  } catch (error) {
    console.error("Error toggling offer status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle offer status",
      error: error.message,
    });
  }
});

// ==================== GAMES MANAGEMENT ====================

// Get all games with filtering and pagination
router.get("/games", adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      country = "",
      sdkProvider = "",
      xptr = "",
      xpTier = "",
      adGame = "",
      status = "all",
      gender = "",
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Country filter removed - countries field no longer exists in Game model

    // SDK Provider filter
    if (sdkProvider) {
      query.sdkProvider = sdkProvider;
    }

    // XPTR filter
    if (xptr) {
      query.xptrRules = { $regex: xptr, $options: "i" };
    }

    // XP Tier filter
    if (xpTier && xpTier !== "") {
      const xpTierNum = parseInt(xpTier);
      if (!isNaN(xpTierNum)) {
        query.xpTier = xpTierNum;
      }
    }

    // Ad Game filter
    if (adGame !== "") {
      query.isAdSupported = adGame === "true";
    }

    // Status filter
    if (status !== "all") {
      const statusLower = status.toLowerCase();
      if (statusLower === "active") {
        query.isActive = true;
      } else if (statusLower === "inactive") {
        query.isActive = false;
      }
    }

    // Gender filter
    if (gender && gender !== "all" && gender.trim() !== "") {
      query.gender = gender.toLowerCase();
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const games = await Game.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("sdkProvider", "name")
      .lean();

    // Add task count for each game
    const gamesWithTaskCount = await Promise.all(
      games.map(async (game) => {
        const taskCount = await GameTask.countDocuments({ gameId: game._id });
        return { ...game, taskCount };
      })
    );

    const total = await Game.countDocuments(query);

    res.json({
      success: true,
      data: {
        games: gamesWithTaskCount,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting games:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get games",
      error: error.message,
    });
  }
});

// Get single game by ID
router.get("/games/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // console.log({ id });
    const game = await Game.findById(id).populate("sdkProvider", "name").lean();

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get task count
    const taskCount = await GameTask.countDocuments({ gameId: id });
    game.taskCount = taskCount;

    res.json({
      success: true,
      data: game,
    });
  } catch (error) {
    console.error("Error getting game:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get game",
      error: error.message,
    });
  }
});

// Check if game ID is available
router.get("/games/check-id/:gameId", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;

    const existingGame = await Game.findOne({ gameId });

    res.json({
      success: true,
      available: !existingGame,
      message: existingGame
        ? "This game ID is already taken"
        : "This game ID is available",
    });
  } catch (error) {
    console.error("Error checking game ID:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check game ID",
      error: error.message,
    });
  }
});

// Check if a game variant (gameId + gender + uiSection + ageGroup) already exists
router.post("/games/check-variant", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const gender = normalizeGender(req.body.gender || "all");
    const uiSection = normalizeSegmentValue(req.body.uiSection || "");
    const ageGroup = normalizeSegmentValue(req.body.ageGroup || "");

    if (!gameId) {
      return res.status(400).json({
        success: false,
        message: "gameId is required",
      });
    }

    const existing = await Game.findOne({
      gameId: gameId,
      gender: gender,
      uiSection: uiSection,
      ageGroup: ageGroup,
    }).lean();

    res.json({
      success: true,
      exists: !!existing,
      data: existing || null,
    });
  } catch (error) {
    console.error("Error checking game variant:", error);
    res.status(500).json({ success: false, message: "Failed to check variant", error: error.message });
  }
});

// Create new game with file uploads
router.post(
  "/games",
  adminAuth,
  upload.fields([{ name: "gameThumbnail", maxCount: 1 }]),
  async (req, res) => {
    try {
      console.log("=== ADMIN GAME CREATE START ===");
      console.log("Admin User ID:", req.user?.userId);
      console.log("Request Body Keys:", Object.keys(req.body));
      console.log("Request Body:", JSON.stringify(req.body, null, 2));
      console.log("Files:", req.files ? Object.keys(req.files) : "No files");

      // Fetch external details based on SDK provider
      const sdkProvider = req.body.sdkProvider || "besitos";
      console.log("SDK Provider:", sdkProvider);
      let external = null;

      if (sdkProvider === "besitos") {
        console.log("Fetching Besitos game with gameId:", req.body.gameId);
        req.query.offer_id = req.body.gameId;
        const captureGame = () => {
          let payload = null;
          let code = 200;
          return {
            res: {
              status(c) {
                code = c;
                console.log("Besitos API Status Code:", c);
                return this;
              },
              json(obj) {
                payload = obj;
                console.log(
                  "Besitos API Response:",
                  JSON.stringify(obj, null, 2)
                );
                return this;
              },
            },
            get() {
              return payload || { success: false, data: [] };
            },
          };
        };
        const cap2 = captureGame();
        await besitosController.getOffers(req, cap2.res);
        const ext = cap2.get();
        console.log("Besitos External Data:", ext ? "Found" : "Not found");
        if (
          !ext ||
          ext.success !== true ||
          !Array.isArray(ext.data) ||
          ext.data.length === 0
        ) {
          console.error("❌ Besitos game not found. Response:", ext);
          return res.status(404).json({
            success: false,
            message:
              "External game not found for the provided gameId in Besitos",
            error: "EXTERNAL_GAME_NOT_FOUND",
          });
        }
        external = ext.data[0];
        console.log("✅ Besitos game found:", external.id, external.title);
      } else if (sdkProvider === "bitlabs") {
        // Fetch from Bitlabs using cached offers
        const bitlabsOfferCache = require("../utils/bitlabsOfferCache");
        const gameIdToFind = req.body.gameId?.toString().trim();

        if (!gameIdToFind) {
          return res.status(400).json({
            success: false,
            message: "gameId is required for Bitlabs games",
            error: "MISSING_GAME_ID",
          });
        }

        // console.log(`Looking for Bitlabs game with ID: ${gameIdToFind}`);

        // Helper function to check if offer matches gameId
        const matchesGameId = (offer) => {
          const offerId =
            offer.id?.toString() ||
            offer.offer_id?.toString() ||
            offer.game_id?.toString() ||
            "";
          const productId =
            offer.product_id?.toString() || offer.productId?.toString() || "";
          const appId = offer.app_metadata?.app_id?.toString() || "";

          return (
            offerId === gameIdToFind ||
            productId === gameIdToFind ||
            appId === gameIdToFind
          );
        };

        // Try multiple query combinations to find the game
        const queryCombinations = [
          {}, // No filters (most likely to have the game)
          { is_game: true }, // Game offers only
          { is_game: true, devices: ["android"] }, // Android games
          { is_game: true, devices: ["iphone"] }, // iPhone games
          { is_game: true, devices: ["android", "iphone"] }, // Mobile games
        ];

        let offers = [];
        let found = false;

        // Try each query combination
        for (const queryParams of queryCombinations) {
          try {
            // console.log(`Trying query: ${JSON.stringify(queryParams)}`);
            offers = await bitlabsOfferCache.getOffers(queryParams);
            // console.log(
            //   `Found ${offers.length} offers with query: ${JSON.stringify(
            //     queryParams
            //   )}`
            // );

            // Search in current offers
            external = offers.find(matchesGameId);

            if (external) {
              // console.log(
              //   `✅ Found game in Bitlabs: ${JSON.stringify({
              //     id: external.id,
              //     gameId: external.gameId,
              //     title: external.title,
              //   })}`
              // );
              found = true;
              break;
            }

            // If not found, try refreshing cache for this query
            // console.log(
            //   `Game not found in cache, refreshing for query: ${JSON.stringify(
            //     queryParams
            //   )}`
            // );
            const refreshedOffers = await bitlabsOfferCache.refreshOffers(
              queryParams
            );
            // console.log(`Refreshed ${refreshedOffers.length} offers`);

            external = refreshedOffers.find(matchesGameId);

            if (external) {
              // console.log(
              //   `✅ Found game after refresh: ${JSON.stringify({
              //     id: external.id,
              //     gameId: external.gameId,
              //     title: external.title,
              //   })}`
              // );
              found = true;
              break;
            }
          } catch (error) {
            console.error(
              `Error fetching offers for query ${JSON.stringify(queryParams)}:`,
              error.message
            );
            // Continue to next query combination
          }
        }

        if (!found || !external) {
          // Log available offer IDs for debugging
          const sampleIds = offers.slice(0, 5).map((o) => ({
            id: o.id,
            gameId: o.gameId,
            productId: o.productId,
            title: o.title,
          }));

          console.error(
            `❌ Game not found. Searched ${offers.length} offers. Sample IDs:`,
            sampleIds
          );

          return res.status(404).json({
            success: false,
            message: `External game not found for the provided gameId "${gameIdToFind}" in Bitlabs. Searched ${offers.length} offers.`,
            error: "EXTERNAL_GAME_NOT_FOUND",
            searchedGameId: gameIdToFind,
            offersSearched: offers.length,
            sampleOfferIds: sampleIds,
          });
        }
      } else {
        // For other SDKs, allow creation without external validation
        external = {
          id: req.body.gameId,
          title: req.body.title,
          description: req.body.description,
          image: "",
          square_image: "",
          large_image: "",
          category: req.body.genre || "General",
          url: "",
        };
      }

      // Parse JSON fields from form-data (using safe parsing)
      // Countries field removed - no longer parsing countries
      const parsedAgeGroups = safeParseJSON(req.body.ageGroups, []);
      const targetGender = normalizeGender(req.body.gender || "all");
      const targetUiSection = normalizeSegmentValue(req.body.uiSection || "");
      const targetAgeGroup = normalizeSegmentValue(
        req.body.ageGroup ||
          (Array.isArray(parsedAgeGroups) && parsedAgeGroups.length > 0
            ? parsedAgeGroups[0]
            : "")
      );

      console.log("Parsed Fields:");
      console.log("  - Age Groups:", parsedAgeGroups);
      console.log("  - Gender:", targetGender);
      console.log("  - UI Section:", targetUiSection);
      console.log("  - Age Group:", targetAgeGroup);

      // Parse XP Tiers (multi-select) - already validated above
      const parsedXpTiers = safeParseJSON(req.body.xpTiers, []);

      // Parse XP Reward Config - already validated above
      const baseXP = parseFloat(req.body.baseXP);
      const xpMultiplier = parseFloat(req.body.xpMultiplier);

      // Parse third-party game data if provided from frontend
      let thirdPartyData = null;
      if (req.body.thirdPartyGameData) {
        try {
          thirdPartyData =
            typeof req.body.thirdPartyGameData === "string"
              ? JSON.parse(req.body.thirdPartyGameData)
              : req.body.thirdPartyGameData;
        } catch (error) {
          console.error("Error parsing thirdPartyGameData:", error);
        }
      }

      const gameData = {
        gameId: req.body.gameId,
        title: req.body.title,
        description: req.body.description,
        sdkProvider: req.body.sdkProvider,
        // Countries field removed
        xptrRules: req.body.xptrRules,
        rewards: {
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : 0,
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : 0,
        },
        defaultTaskCount:
          req.body.defaultTaskCount !== undefined &&
          req.body.defaultTaskCount !== null &&
          req.body.defaultTaskCount !== ""
            ? parseInt(req.body.defaultTaskCount) || 0
            : 0,
        xpTier: req.body.xpTier ? parseInt(req.body.xpTier) : 1,
        xpTiers: parsedXpTiers, // Multi-select XP tiers
        xpRewardConfig: {
          baseXP: baseXP,
          multiplier: xpMultiplier,
        },
        isDefaultFallback: req.body.isDefaultFallback === "true",
        ageGroups: parsedAgeGroups,
        gender: targetGender,
        marketingChannel: req.body.marketingChannel,
        campaignName: req.body.campaignName,
        tierRestrictions: {
          minTier: req.body.tier ? req.body.tier.toLowerCase() : "free",
          maxTier: "platinum",
        },
        metadata: {
          genre: req.body.genre || "puzzle",
          difficulty: req.body.difficulty || "easy",
          rating: req.body.rating ? parseFloat(req.body.rating) : 3.0,
          estimatedPlayTime: req.body.estimatedPlayTime
            ? parseInt(req.body.estimatedPlayTime)
            : 10,
        },
        isActive: req.body.isActive === "true",
        isAdSupported: req.body.isAdSupported === "true",
        createdBy: req.user.userId,
        deviceType: req.body.deviceType || "android",
        uiSection: targetUiSection,
        // Store third-party game data (use provided data or fallback to external)
        besitosRawData: thirdPartyData || external || null,
      };

      // Map external details into gameDetails snapshot
      gameData.gameDetails = {
        id: external.id || "",
        name: external.title || external.name || gameData.title,
        description: external.description || gameData.description,
        image: external.image || external.large_image || "",
        square_image: external.square_image || "",
        large_image: external.large_image || external.image || "",
        category:
          Array.isArray(external.categories) &&
          external.categories[0] &&
          external.categories[0].name
            ? external.categories[0].name
            : external.category || "",
        downloadUrl: external.url || "",
      };

      // Store complete raw data from third-party API (Besitos, Bitlabs, etc.)
      // Prioritize thirdPartyGameData from frontend, otherwise use external data
      if (thirdPartyData) {
        gameData.besitosRawData = thirdPartyData;
      } else if (sdkProvider === "besitos" || sdkProvider === "bitlabs") {
        gameData.besitosRawData = external;
      }

      // Handle uploaded game thumbnail
      if (req.files && req.files.gameThumbnail && req.files.gameThumbnail[0]) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.gameThumbnail[0].filename}`;

        gameData.metadata.thumbnail = {
          url: imageUrl,
          dimensions: {
            width: req.body.thumbnailWidth
              ? parseInt(req.body.thumbnailWidth)
              : 300,
            height: req.body.thumbnailHeight
              ? parseInt(req.body.thumbnailHeight)
              : 300,
          },
          altText: req.body.thumbnailAltText || gameData.title,
        };

        // Store image URL in metadata as well for backward compatibility
        gameData.metadata.imageUrl = imageUrl;
      }

      // Upsert by compound key (gameId, gender, uiSection, ageGroup) same as seed logic
      const filter = {
        gameId: gameData.gameId,
        gender: targetGender,
        uiSection: targetUiSection,
        ageGroup: targetAgeGroup,
      };

      // Prevent duplicate variant creation by checking existing document first
      try {
        const existingVariant = await Game.findOne(filter).lean();
        if (existingVariant) {
          return res.status(409).json({
            success: false,
            message:
              "A game variant with the same gameId and segment (gender/uiSection/ageGroup) already exists.",
            duplicateId: existingVariant._id,
          });
        }
      } catch (e) {
        console.warn("Error checking for existing game variant:", e.message);
      }
      console.log("Upsert Filter:", JSON.stringify(filter, null, 2));
      console.log(
        "Game Data to Save:",
        JSON.stringify(
          {
            title: gameData.title,
            gameId: gameData.gameId,
            sdkProvider: gameData.sdkProvider,
            isActive: gameData.isActive,
            rewards: gameData.rewards,
            xpTier: gameData.xpTier,
            xpTiers: gameData.xpTiers,
            xpRewardConfig: gameData.xpRewardConfig,
          },
          null,
          2
        )
      );

      const update = {
        $set: {
          title: gameData.title,
          description: gameData.description,
          sdkProvider: gameData.sdkProvider,
          // Countries field removed
          xptrRules: gameData.xptrRules,
          isActive: gameData.isActive,
          isAdSupported: gameData.isAdSupported,
          deviceType: gameData.deviceType,
          rewards: gameData.rewards,
          metadata: gameData.metadata,
          gameDetails: gameData.gameDetails,
          uiSection: targetUiSection,
          gender: targetGender,
          ageGroup: targetAgeGroup,
          ageGroups: parsedAgeGroups,
          xpTier: gameData.xpTier,
          xpTiers: gameData.xpTiers,
          xpRewardConfig: gameData.xpRewardConfig,
          defaultTaskCount: gameData.defaultTaskCount,
          tierRestrictions: gameData.tierRestrictions,
          marketingChannel: gameData.marketingChannel,
          campaignName: gameData.campaignName,
          isDefaultFallback: gameData.isDefaultFallback,
          // Store complete raw data from third-party API
          besitosRawData: gameData.besitosRawData || null,
        },
        $setOnInsert: {
          createdBy: req.user.userId,
        },
      };

      console.log("Attempting to upsert game to database...");
      const upserted = await Game.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      });
      console.log("✅ Game upserted successfully. ID:", upserted._id);
      console.log(
        "Upserted Game Data:",
        JSON.stringify(
          {
            _id: upserted._id,
            gameId: upserted.gameId,
            title: upserted.title,
            isActive: upserted.isActive,
            rewards: upserted.rewards,
            xpTier: upserted.xpTier,
            xpTiers: upserted.xpTiers,
          },
          null,
          2
        )
      );
      console.log("=== ADMIN GAME CREATE END ===");

      res.status(201).json({
        success: true,
        message: "Game created/updated successfully",
        data: upserted,
      });
    } catch (error) {
      console.error("=== ERROR CREATING GAME ===");
      console.error("Error:", error);
      console.error("Error Stack:", error.stack);
      console.error("Error Message:", error.message);
      console.error("Error Code:", error.code);
      console.error("Error Name:", error.name);
      console.error("Request Body:", req.body);
      console.error("=== END ERROR ===");

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum size is 5MB",
          error: error.message,
        });
      }

      // Handle MongoDB duplicate key error (compound key)
      if (error.code === 11000 || error.name === "MongoServerError") {
        return res.status(400).json({
          success: false,
          message:
            "A game variant with the same gameId, gender, uiSection and ageGroup already exists.",
          error: "DUPLICATE_GAME_VARIANT",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create game",
        error: error.message,
      });
    }
  }
);

// Update game with file uploads
router.put(
  "/games/:id",
  adminAuth,
  upload.fields([{ name: "gameThumbnail", maxCount: 1 }]),
  async (req, res) => {
    try {
      console.log("=== ADMIN GAME UPDATE START ===");
      console.log("Game ID:", req.params.id);
      console.log("Admin User ID:", req.user?.userId);
      console.log("Request Body Keys:", Object.keys(req.body));
      console.log("Request Body:", JSON.stringify(req.body, null, 2));
      console.log("Files:", req.files ? Object.keys(req.files) : "No files");

      const { id } = req.params;

      // Find existing game
      const existingGame = await Game.findById(id);
      if (!existingGame) {
        console.error("❌ Game not found with ID:", id);
        return res.status(404).json({
          success: false,
          message: "Game not found",
        });
      }
      console.log(
        "✅ Existing game found:",
        existingGame.gameId,
        existingGame.title
      );
      console.log(
        "Existing Game Data:",
        JSON.stringify(
          {
            gameId: existingGame.gameId,
            title: existingGame.title,
            isActive: existingGame.isActive,
            rewards: existingGame.rewards,
            xpTier: existingGame.xpTier,
            xpTiers: existingGame.xpTiers,
            xpRewardConfig: existingGame.xpRewardConfig,
          },
          null,
          2
        )
      );

      // Build update data
      const updateData = {
        updatedBy: req.user.userId,
        updatedAt: new Date(),
      };

      // Check if gameId or sdkProvider is being updated (to refresh external data)
      const gameIdChanged =
        req.body.gameId && req.body.gameId.trim() !== existingGame.gameId;
      const sdkProviderChanged =
        req.body.sdkProvider &&
        req.body.sdkProvider !== existingGame.sdkProvider;
      const shouldRefreshExternalData = gameIdChanged || sdkProviderChanged;

      // Update basic fields if provided
      if (req.body.gameId) {
        if (!req.body.gameId.trim()) {
          return res.status(400).json({
            success: false,
            message: "Game ID cannot be empty",
            error: "INVALID_GAME_ID",
          });
        }
        updateData.gameId = req.body.gameId.trim();
      }
      if (req.body.title) {
        if (!req.body.title.trim()) {
          return res.status(400).json({
            success: false,
            message: "Game title cannot be empty",
            error: "INVALID_TITLE",
          });
        }
        updateData.title = req.body.title.trim();
      }
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.sdkProvider) updateData.sdkProvider = req.body.sdkProvider;
      // Countries field removed - no longer updating countries
      if (req.body.xptrRules) {
        if (!req.body.xptrRules.trim()) {
          return res.status(400).json({
            success: false,
            message: "XPTR Rules cannot be empty",
            error: "INVALID_XPTR_RULES",
          });
        }
        updateData.xptrRules = req.body.xptrRules.trim();
      }
      if (req.body.ageGroups) {
        const parsedAgeGroups = safeParseJSON(req.body.ageGroups, []);
        updateData.ageGroups = parsedAgeGroups;

        // Auto-update ageGroup (singular) from ageGroups array if not explicitly provided
        // Use first ageGroup from array, or explicit ageGroup if provided
        if (req.body.ageGroup) {
          updateData.ageGroup = normalizeSegmentValue(req.body.ageGroup);
        } else if (
          Array.isArray(parsedAgeGroups) &&
          parsedAgeGroups.length > 0
        ) {
          updateData.ageGroup = normalizeSegmentValue(parsedAgeGroups[0]);
          console.log(
            `Auto-updating ageGroup to first value from ageGroups: ${parsedAgeGroups[0]}`
          );
        }
      } else if (req.body.ageGroup) {
        // If only ageGroup is provided (not ageGroups), update it
        updateData.ageGroup = normalizeSegmentValue(req.body.ageGroup);
      }
      if (req.body.gender) updateData.gender = normalizeGender(req.body.gender);
      if (req.body.uiSection !== undefined)
        updateData.uiSection = normalizeSegmentValue(req.body.uiSection || "");
      if (req.body.marketingChannel)
        updateData.marketingChannel = req.body.marketingChannel;
      if (req.body.campaignName)
        updateData.campaignName = req.body.campaignName;
      if (req.body.xpTier) updateData.xpTier = parseInt(req.body.xpTier);
      if (req.body.defaultTaskCount)
        updateData.defaultTaskCount = parseInt(req.body.defaultTaskCount);
      if (req.body.isActive !== undefined)
        updateData.isActive = req.body.isActive === "true";
      if (req.body.isDefaultFallback !== undefined)
        updateData.isDefaultFallback = req.body.isDefaultFallback === "true";
      if (req.body.isAdSupported !== undefined)
        updateData.isAdSupported = req.body.isAdSupported === "true";

      // Ignore coins updates (read-only from API) - silently skip if provided
      if (req.body.rewardCoins !== undefined) {
        console.log(
          `⚠️ rewardCoins provided (${req.body.rewardCoins}) but ignored - coins are read-only from 3rd-party API`
        );
        // Don't return error, just ignore the field
      }

      // Update rewards (XP only - coins are read-only from API)
      if (req.body.rewardXP !== undefined) {
        if (!updateData.rewards) updateData.rewards = {};
        updateData.rewards.xp = req.body.rewardXP
          ? parseFloat(req.body.rewardXP)
          : existingGame.rewards?.xp || 0;
        // Keep existing coins (read-only, from API)
        updateData.rewards.coins = existingGame.rewards?.coins || 0;
      } else {
        // If XP is not being updated, ensure coins are preserved
        if (!updateData.rewards) updateData.rewards = {};
        updateData.rewards.coins = existingGame.rewards?.coins || 0;
      }

      // Update XP Tiers (multi-select) with validation
      if (req.body.xpTiers !== undefined) {
        const parsedXpTiers = safeParseJSON(req.body.xpTiers, []);
        // Validate XP tiers
        if (Array.isArray(parsedXpTiers) && parsedXpTiers.length > 0) {
          const validTiers = ["Junior", "Mid", "Senior"];
          const invalidTiers = parsedXpTiers.filter(
            (t) => !validTiers.includes(t)
          );
          if (invalidTiers.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Invalid XP tiers: ${invalidTiers.join(
                ", "
              )}. Must be one of: Junior, Mid, Senior`,
              error: "INVALID_XP_TIERS",
            });
          }
          updateData.xpTiers = parsedXpTiers;
        } else if (parsedXpTiers.length === 0) {
          return res.status(400).json({
            success: false,
            message: "At least one XP Tier must be selected",
            error: "XP_TIERS_REQUIRED",
          });
        }
      }

      // Update XP Reward Config (baseXP and multiplier) with validation
      if (
        req.body.baseXP !== undefined ||
        req.body.xpMultiplier !== undefined
      ) {
        const baseXP =
          req.body.baseXP !== undefined
            ? parseFloat(req.body.baseXP)
            : existingGame.xpRewardConfig?.baseXP || 0;
        const xpMultiplier =
          req.body.xpMultiplier !== undefined
            ? parseFloat(req.body.xpMultiplier)
            : existingGame.xpRewardConfig?.multiplier || 1.0;

        // Validate baseXP
        if (req.body.baseXP !== undefined && (isNaN(baseXP) || baseXP <= 0)) {
          return res.status(400).json({
            success: false,
            message: "Base XP must be a number greater than 0",
            error: "INVALID_BASE_XP",
          });
        }

        // Validate multiplier
        if (
          req.body.xpMultiplier !== undefined &&
          (isNaN(xpMultiplier) || xpMultiplier < 0.1)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Stepwise Multiplier must be a number greater than or equal to 0.1",
            error: "INVALID_MULTIPLIER",
          });
        }

        updateData.xpRewardConfig = {
          baseXP: baseXP,
          multiplier: xpMultiplier,
        };
      }

      // Update tier restrictions
      if (req.body.tier) {
        updateData.tierRestrictions = {
          ...existingGame.tierRestrictions?.toObject(),
          minTier: req.body.tier,
          maxTier: "platinum",
        };
      }

      // Update metadata
      if (
        req.body.genre ||
        req.body.difficulty ||
        req.body.rating ||
        req.body.estimatedPlayTime
      ) {
        updateData.metadata = {
          ...existingGame.metadata?.toObject(),
          genre: req.body.genre || existingGame.metadata?.genre,
          difficulty: req.body.difficulty || existingGame.metadata?.difficulty,
          rating: req.body.rating
            ? parseFloat(req.body.rating)
            : existingGame.metadata?.rating,
          estimatedPlayTime: req.body.estimatedPlayTime
            ? parseInt(req.body.estimatedPlayTime)
            : existingGame.metadata?.estimatedPlayTime,
        };
      }

      // Handle new uploaded game thumbnail
      if (req.files && req.files.gameThumbnail && req.files.gameThumbnail[0]) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const imageUrl = `${baseUrl}/uploads/offer-creatives/${req.files.gameThumbnail[0].filename}`;

        if (!updateData.metadata) updateData.metadata = {};
        updateData.metadata.thumbnail = {
          url: imageUrl,
          dimensions: {
            width: req.body.thumbnailWidth
              ? parseInt(req.body.thumbnailWidth)
              : existingGame.metadata?.thumbnail?.dimensions?.width || 300,
            height: req.body.thumbnailHeight
              ? parseInt(req.body.thumbnailHeight)
              : existingGame.metadata?.thumbnail?.dimensions?.height || 300,
          },
          altText: req.body.thumbnailAltText || existingGame.title,
        };

        // Update metadata imageUrl for backward compatibility
        updateData.metadata.imageUrl = imageUrl;
      }

      // If gameId or sdkProvider changed, fetch fresh external data
      if (shouldRefreshExternalData) {
        const sdkProvider = updateData.sdkProvider || existingGame.sdkProvider;
        const gameId = updateData.gameId || existingGame.gameId;
        let external = null;

        if (sdkProvider === "besitos") {
          try {
            req.query.offer_id = gameId;
            const captureGame = () => {
              let payload = null;
              let code = 200;
              return {
                res: {
                  status(c) {
                    code = c;
                    return this;
                  },
                  json(obj) {
                    payload = obj;
                    return this;
                  },
                },
                get() {
                  return payload || { success: false, data: [] };
                },
              };
            };
            const cap2 = captureGame();
            await besitosController.getOffers(req, cap2.res);
            const ext = cap2.get();
            if (
              ext &&
              ext.success === true &&
              Array.isArray(ext.data) &&
              ext.data.length > 0
            ) {
              external = ext.data[0];
              updateData.besitosRawData = external;
              // Also update gameDetails with fresh data
              updateData.gameDetails = {
                id: external.id || "",
                name:
                  external.title ||
                  external.name ||
                  updateData.title ||
                  existingGame.title,
                description:
                  external.description ||
                  updateData.description ||
                  existingGame.description,
                image: external.image || external.large_image || "",
                square_image: external.square_image || "",
                large_image: external.large_image || external.image || "",
                category:
                  Array.isArray(external.categories) &&
                  external.categories[0] &&
                  external.categories[0].name
                    ? external.categories[0].name
                    : external.category || "",
                downloadUrl: external.url || "",
              };
            }
          } catch (error) {
            console.error("Error fetching external data during update:", error);
            // Continue without updating external data
          }
        } else if (sdkProvider === "bitlabs") {
          // Similar logic for Bitlabs if needed
          // For now, preserve existing besitosRawData
        }
      } else {
        // Preserve existing besitosRawData if not refreshing
        // (MongoDB will preserve it automatically, but being explicit)
        if (existingGame.besitosRawData) {
          updateData.besitosRawData = existingGame.besitosRawData;
        }
      }

      // If changing variant identifying fields (gameId, gender, uiSection, ageGroup),
      // ensure we don't create a duplicate variant
      try {
        const newGameId = updateData.gameId || existingGame.gameId;
        const newGender = updateData.gender || existingGame.gender || "all";
        const newUiSection = updateData.uiSection || existingGame.uiSection || "";
        const newAgeGroup = updateData.ageGroup || existingGame.ageGroup || "";

        const duplicate = await Game.findOne({
          gameId: newGameId,
          gender: newGender,
          uiSection: newUiSection,
          ageGroup: newAgeGroup,
          _id: { $ne: id },
        }).lean();
        if (duplicate) {
          return res.status(409).json({
            success: false,
            message:
              "A game variant with the same gameId and segment already exists.",
            duplicateId: duplicate._id,
          });
        }
      } catch (e) {
        console.warn("Error checking for duplicate variant before update:", e.message);
      }

      console.log("Update Data:", JSON.stringify(updateData, null, 2));
      console.log("Attempting to update game in database...");

      const game = await Game.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      console.log("✅ Game updated successfully. ID:", game._id);
      console.log(
        "Updated Game Data:",
        JSON.stringify(
          {
            _id: game._id,
            gameId: game.gameId,
            title: game.title,
            isActive: game.isActive,
            rewards: game.rewards,
            xpTier: game.xpTier,
            xpTiers: game.xpTiers,
            xpRewardConfig: game.xpRewardConfig,
          },
          null,
          2
        )
      );
      console.log("=== ADMIN GAME UPDATE END ===");

      res.json({
        success: true,
        message: "Game updated successfully",
        data: game,
      });
    } catch (error) {
      console.error("=== ERROR UPDATING GAME ===");
      console.error("Error:", error);
      console.error("Error Stack:", error.stack);
      console.error("Error Message:", error.message);
      console.error("Error Code:", error.code);
      console.error("Error Name:", error.name);
      console.error("Game ID:", req.params.id);
      console.error("Request Body:", req.body);
      console.error("=== END ERROR ===");

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum size is 5MB",
          error: error.message,
        });
      }

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === "MongoServerError") {
        return res.status(400).json({
          success: false,
          message:
            "A game with this ID already exists. The gameId must be unique.",
          error: "DUPLICATE_GAME_ID",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to update game",
        error: error.message,
      });
    }
  }
);

// Delete game
router.delete("/games/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if game has tasks
    const taskCount = await GameTask.countDocuments({ gameId: id });
    if (taskCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete game with existing tasks. Delete tasks first.",
      });
    }

    const game = await Game.findByIdAndDelete(id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.json({
      success: true,
      message: "Game deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting game:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete game",
      error: error.message,
    });
  }
});

// ==================== TASKS MANAGEMENT ====================

// Get all tasks for a specific game (for admin to select bonus tasks)
// This endpoint returns ALL tasks, including those that might be configured as bonus tasks
router.get("/games/:gameId/tasks", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const {
      page = 1,
      limit = 100,
      search = "",
      excludeBonus = "false",
    } = req.query;

    let query = { gameId };

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { completionRule: { $regex: search, $options: "i" } },
      ];
    }

    // If excludeBonus is true, exclude tasks that are configured as bonus tasks
    if (excludeBonus === "true") {
      const rule = await WelcomeBonusTimer.findOne({
        isActive: true,
        "gameBonusTasks.gameId": gameId,
        "gameBonusTasks.isEnabled": true,
      });

      if (rule) {
        const gameBonusConfig = rule.gameBonusTasks.find(
          (config) => config.gameId.toString() === gameId && config.isEnabled
        );

        if (gameBonusConfig && gameBonusConfig.bonusTasks.length > 0) {
          const bonusTaskIds = gameBonusConfig.bonusTasks.map(
            (bt) => bt.taskId
          );
          query._id = { $nin: bonusTaskIds };
        }
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const tasks = await GameTask.find(query)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await GameTask.countDocuments(query);

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting tasks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tasks",
      error: error.message,
    });
  }
});

// Get single task by ID
router.get("/tasks/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findById(id).lean();

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      data: task,
    });
  } catch (error) {
    console.error("Error getting task:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get task",
      error: error.message,
    });
  }
});

// Create new task
router.post(
  "/games/:gameId/tasks",
  adminAuth,
  [
    body("name").notEmpty().withMessage("Task name is required"),
    body("completionRule")
      .notEmpty()
      .withMessage("Completion rule is required"),
    body("rewardType")
      .isIn(["xp", "coins"])
      .withMessage("Reward type must be xp or coins"),
    body("rewardValue").isNumeric().withMessage("Reward value must be numeric"),
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

      const { gameId } = req.params;

      // Verify game exists
      const game = await Game.findById(gameId);
      if (!game) {
        return res.status(404).json({
          success: false,
          message: "Game not found",
        });
      }

      const taskData = {
        ...req.body,
        gameId,
        createdBy: req.user.userId,
      };

      const task = new GameTask(taskData);
      await task.save();

      res.status(201).json({
        success: true,
        message: "Task created successfully",
        data: task,
      });
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create task",
        error: error.message,
      });
    }
  }
);

// Update task
router.put(
  "/tasks/:id",
  adminAuth,
  [
    body("name").optional().notEmpty().withMessage("Task name cannot be empty"),
    body("completionRule")
      .optional()
      .notEmpty()
      .withMessage("Completion rule cannot be empty"),
    body("rewardType")
      .optional()
      .isIn(["xp", "coins"])
      .withMessage("Reward type must be xp or coins"),
    body("rewardValue")
      .optional()
      .isNumeric()
      .withMessage("Reward value must be numeric"),
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

      const { id } = req.params;
      const updateData = req.body;
      updateData.updatedBy = req.user.userId;
      updateData.updatedAt = new Date();

      const task = await GameTask.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      res.json({
        success: true,
        message: "Task updated successfully",
        data: task,
      });
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update task",
        error: error.message,
      });
    }
  }
);

// Delete task
router.delete("/tasks/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findByIdAndDelete(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete task",
      error: error.message,
    });
  }
});

// Toggle task override
router.patch("/tasks/:id/toggle-override", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await GameTask.findById(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    task.isOverride = !task.isOverride;
    task.updatedBy = req.user.userId;
    task.updatedAt = new Date();

    await task.save();

    res.json({
      success: true,
      message: `Task override ${
        task.isOverride ? "enabled" : "disabled"
      } successfully`,
      data: { isOverride: task.isOverride },
    });
  } catch (error) {
    console.error("Error toggling task override:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle task override",
      error: error.message,
    });
  }
});

// ==================== GAME DISPLAY RULES ====================

// Test admin access endpoint (for debugging)
router.get("/test-admin", adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "role email firstName lastName"
    );
    res.json({
      success: true,
      message: "Admin access confirmed",
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error checking admin access",
      error: error.message,
    });
  }
});

// Get game display rules with pagination
router.get("/display-rules", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get all rules (not just enabled) with status
    const [rules, total] = await Promise.all([
      GameDisplayRule.find()
        .populate("xpTier", "tierName xpMin xpMax")
        .populate("createdBy", "firstName lastName email")
        .populate("updatedBy", "firstName lastName email")
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GameDisplayRule.countDocuments(),
    ]);

    // Add status label to each rule
    const rulesWithStatus = rules.map((rule) => ({
      ...rule,
      status: rule.isEnabled ? "Active" : "Inactive",
    }));

    res.json({
      success: true,
      data: rulesWithStatus,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting display rules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get display rules",
      error: error.message,
    });
  }
});

// Get single game display rule by ID (for editing)
router.get("/display-rules/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await GameDisplayRule.findById(id)
      .populate("createdBy", "firstName lastName email")
      .populate("updatedBy", "firstName lastName email");

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Display rule not found",
      });
    }

    res.json({
      success: true,
      data: {
        ...rule.toObject(),
        status: rule.isEnabled ? "Active" : "Inactive",
      },
    });
  } catch (error) {
    console.error("Error getting display rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get display rule",
      error: error.message,
    });
  }
});

// Create game display rule with duplicate detection
router.post(
  "/display-rules",
  adminAuth,
  [
    body("ruleName").notEmpty().trim().withMessage("Rule name is required"),
    body("userMilestones")
      .isArray({ min: 1 })
      .withMessage("At least one user milestone is required")
      .custom((milestones) => {
        // Validate that first_time_user and returning_user are not both selected
        if (
          milestones.includes("first_time_user") &&
          milestones.includes("returning_user")
        ) {
          throw new Error(
            "Cannot select both 'first_time_user' and 'returning_user' milestones. They are mutually exclusive."
          );
        }
        return true;
      }),
    body("userMilestones.*")
      .isIn(["first_time_user", "returning_user", "xp_tier", "membership_tier"])
      .withMessage(
        "Invalid milestone type. Must be one of: first_time_user, returning_user, xp_tier, membership_tier"
      ),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        if (
          req.body.userMilestones &&
          req.body.userMilestones.includes("xp_tier") &&
          !value
        ) {
          throw new Error(
            'XP Tier is required when "XP Tier" milestone is selected'
          );
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .custom((value, { req }) => {
        if (
          req.body.userMilestones &&
          req.body.userMilestones.includes("membership_tier") &&
          !value
        ) {
          throw new Error(
            'Membership Tier is required when "Membership Tier" milestone is selected'
          );
        }
        return true;
      }),
    body("maxGamesToShow")
      .isInt({ min: 1 })
      .withMessage("Max games to show must be a positive integer"),
    body("isEnabled")
      .optional()
      .isBoolean()
      .withMessage("Enabled status must be boolean"),
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

      // Get targetSegment from request (top-level or metadata) or auto-generate
      let targetSegment =
        req.body.targetSegment || req.body.metadata?.targetSegment;
      if (
        !targetSegment &&
        req.body.userMilestones &&
        req.body.userMilestones.length > 0
      ) {
        const segmentParts = [];
        req.body.userMilestones.forEach((milestone) => {
          switch (milestone) {
            case "first_time_user":
              segmentParts.push("New Users");
              break;
            case "returning_user":
              segmentParts.push("Engaged Users");
              break;
            case "xp_tier":
              segmentParts.push("XP Tier");
              break;
            case "membership_tier":
              if (req.body.membershipTier) {
                const tierName =
                  req.body.membershipTier.charAt(0).toUpperCase() +
                  req.body.membershipTier.slice(1);
                segmentParts.push(`${tierName} Tier`);
              } else {
                segmentParts.push("Membership Tier");
              }
              break;
          }
        });
        targetSegment =
          segmentParts.length > 0 ? segmentParts.join(", ") : "All Users";
      }

      const ruleData = {
        ...req.body,
        createdBy: req.user.userId,
        targetSegment: targetSegment || "All Users", // Set as top-level field
      };

      // Ensure metadata exists and set targetSegment for backward compatibility
      if (!ruleData.metadata) {
        ruleData.metadata = {};
      }
      ruleData.metadata.targetSegment = targetSegment || "All Users";

      // Check for duplicate rule
      const duplicate = await GameDisplayRule.findDuplicate(ruleData);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A rule with these conditions already exists.",
          duplicateRuleId: duplicate._id,
          duplicateRule: duplicate,
          shouldRedirectToEdit: true,
        });
      }

      const rule = new GameDisplayRule(ruleData);
      await rule.save();

      // Populate references for response
      // No need to populate xpTier - it's now a string
      await rule.populate("createdBy", "firstName lastName email");

      res.status(201).json({
        success: true,
        message: "Display rule created successfully",
        data: {
          ...rule.toObject(),
          status: rule.isEnabled ? "Active" : "Inactive",
        },
      });
    } catch (error) {
      // Handle unique constraint violation (duplicate ruleName)
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "A rule with this name already exists.",
          error: "Duplicate rule name",
        });
      }

      console.error("Error creating display rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create display rule",
        error: error.message,
      });
    }
  }
);

// Update game display rule with duplicate detection
router.put(
  "/display-rules/:id",
  adminAuth,
  [
    body("ruleName")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Rule name cannot be empty"),
    body("userMilestones")
      .optional()
      .isArray({ min: 1 })
      .withMessage("At least one user milestone is required")
      .custom((milestones) => {
        // Validate that first_time_user and returning_user are not both selected
        if (
          milestones &&
          milestones.includes("first_time_user") &&
          milestones.includes("returning_user")
        ) {
          throw new Error(
            "Cannot select both 'first_time_user' and 'returning_user' milestones. They are mutually exclusive."
          );
        }
        return true;
      }),
    body("userMilestones.*")
      .optional()
      .isIn(["first_time_user", "returning_user", "xp_tier", "membership_tier"])
      .withMessage("Invalid milestone type"),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        const milestones = req.body.userMilestones;
        if (milestones && milestones.includes("xp_tier") && !value) {
          throw new Error(
            'XP Tier is required when "XP Tier" milestone is selected'
          );
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .custom((value, { req }) => {
        const milestones = req.body.userMilestones;
        if (milestones && milestones.includes("membership_tier") && !value) {
          throw new Error(
            'Membership Tier is required when "Membership Tier" milestone is selected'
          );
        }
        return true;
      }),
    body("maxGamesToShow")
      .optional()
      .isNumeric()
      .withMessage("Max games to show must be numeric"),
    body("isEnabled")
      .optional()
      .isBoolean()
      .withMessage("Enabled status must be boolean"),
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

      const { id } = req.params;

      // Get existing rule
      const existingRule = await GameDisplayRule.findById(id);
      if (!existingRule) {
        return res.status(404).json({
          success: false,
          message: "Display rule not found",
        });
      }

      const updateData = { ...req.body };
      updateData.updatedBy = req.user.userId;
      updateData.updatedAt = new Date();

      // Determine final milestones after update
      const finalMilestones =
        updateData.userMilestones || existingRule.userMilestones;
      const finalMembershipTier =
        updateData.membershipTier !== undefined
          ? updateData.membershipTier
          : existingRule.membershipTier;

      // Get targetSegment from request (top-level or metadata) or auto-generate
      let targetSegment =
        updateData.targetSegment || updateData.metadata?.targetSegment;

      // Auto-generate targetSegment from userMilestones if milestones are being updated
      if (
        updateData.userMilestones ||
        updateData.membershipTier !== undefined ||
        !targetSegment
      ) {
        if (finalMilestones && finalMilestones.length > 0) {
          const segmentParts = [];
          finalMilestones.forEach((milestone) => {
            switch (milestone) {
              case "first_time_user":
                segmentParts.push("New Users");
                break;
              case "returning_user":
                segmentParts.push("Engaged Users");
                break;
              case "xp_tier":
                segmentParts.push("XP Tier");
                break;
              case "membership_tier":
                if (finalMembershipTier) {
                  const tierName =
                    finalMembershipTier.charAt(0).toUpperCase() +
                    finalMembershipTier.slice(1);
                  segmentParts.push(`${tierName} Tier`);
                } else {
                  segmentParts.push("Membership Tier");
                }
                break;
            }
          });
          targetSegment =
            segmentParts.length > 0 ? segmentParts.join(", ") : "All Users";
        } else {
          targetSegment =
            targetSegment || existingRule.targetSegment || "All Users";
        }
      } else {
        targetSegment =
          targetSegment || existingRule.targetSegment || "All Users";
      }

      // Set targetSegment as top-level field
      updateData.targetSegment = targetSegment;

      // Ensure metadata exists and set targetSegment for backward compatibility
      if (!updateData.metadata) {
        updateData.metadata = existingRule.metadata || {};
      }
      updateData.metadata.targetSegment = targetSegment;

      // Validate that final milestones don't have conflicting values
      if (
        finalMilestones &&
        finalMilestones.includes("first_time_user") &&
        finalMilestones.includes("returning_user")
      ) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          error:
            "Cannot have both 'first_time_user' and 'returning_user' milestones. They are mutually exclusive.",
        });
      }

      // Clear conditional fields if their milestones are removed
      if (finalMilestones && !finalMilestones.includes("xp_tier")) {
        updateData.xpTier = null;
      }
      if (finalMilestones && !finalMilestones.includes("membership_tier")) {
        updateData.membershipTier = null;
      }

      // Check for duplicate rule (excluding current rule)
      const ruleDataForCheck = {
        ...existingRule.toObject(),
        ...updateData,
        userMilestones: finalMilestones,
        xpTier:
          updateData.xpTier !== undefined
            ? updateData.xpTier
            : finalMilestones.includes("xp_tier")
            ? existingRule.xpTier
            : null,
        membershipTier:
          updateData.membershipTier !== undefined
            ? updateData.membershipTier
            : finalMilestones.includes("membership_tier")
            ? existingRule.membershipTier
            : null,
        segmentOverrides:
          updateData.segmentOverrides !== undefined
            ? updateData.segmentOverrides
            : existingRule.segmentOverrides,
      };

      const duplicate = await GameDisplayRule.findDuplicate(
        ruleDataForCheck,
        id
      );
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A rule with these conditions already exists.",
          duplicateRuleId: duplicate._id,
          duplicateRule: duplicate,
          shouldRedirectToEdit: true,
        });
      }

      const rule = await GameDisplayRule.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate("updatedBy", "firstName lastName email");

      res.json({
        success: true,
        message: "Display rule updated successfully",
        data: {
          ...rule.toObject(),
          status: rule.isEnabled ? "Active" : "Inactive",
        },
      });
    } catch (error) {
      console.error("Error updating display rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update display rule",
        error: error.message,
      });
    }
  }
);

// Delete game display rule
router.delete("/display-rules/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.query; // Require confirmation query parameter

    if (confirm !== "true") {
      return res.status(400).json({
        success: false,
        message:
          "Deletion requires confirmation. Add ?confirm=true to the URL.",
      });
    }

    const rule = await GameDisplayRule.findByIdAndDelete(id);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Display rule not found",
      });
    }

    res.json({
      success: true,
      message: "Display rule deleted successfully",
      data: {
        id: rule._id,
        ruleName: rule.ruleName,
      },
    });
  } catch (error) {
    console.error("Error deleting display rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete display rule",
      error: error.message,
    });
  }
});

// ==================== TASK PROGRESSION RULES ====================

// Get all task progression rules
router.get("/progression-rules", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get only progression rules that have been configured by admins (have createdBy)
    const query = { createdBy: { $exists: true, $ne: null } };

    const [rules, total] = await Promise.all([
      TaskProgressionRule.find(query)
        .populate("createdBy", "firstName lastName email")
        .populate("updatedBy", "firstName lastName email")
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TaskProgressionRule.countDocuments(query),
    ]);

    // Format response
    const formattedRules = rules.map((rule) => {
      return {
        _id: rule._id,
        ruleName: rule.ruleName || null,
        userMilestones: rule.userMilestones || [],
        xpTier: rule.xpTier || null,
        membershipTier: rule.membershipTier || null,
        priority: rule.priority || 0,
        firstBatchSize: rule.firstBatchSize || 5,
        nextBatchSize: rule.nextBatchSize || 5,
        maxBatches: rule.maxBatches || null,
        isActive: rule.isActive !== false,
        createdBy: rule.createdBy || null,
        updatedBy: rule.updatedBy || null,
        createdAt: rule.createdAt || new Date(),
        updatedAt: rule.updatedAt || new Date(),
      };
    });

    res.json({
      success: true,
      data: formattedRules,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error getting progression rules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get progression rules",
      error: error.message,
    });
  }
});

// Get task progression rule by ID
router.get("/progression-rules/:ruleId", adminAuth, async (req, res) => {
  try {
    const { ruleId } = req.params;

    const rule = await TaskProgressionRule.findById(ruleId).lean();

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Progression rule not found",
      });
    }

    // Format response
    const formattedData = {
      _id: rule._id,
      ruleName: rule.ruleName || null,
      userMilestones: rule.userMilestones || [],
      xpTier: rule.xpTier || null,
      membershipTier: rule.membershipTier || null,
      priority: rule.priority || 0,
      minimumEventThreshold: rule.minimumEventThreshold,
      postThresholdTasks: rule.postThresholdTasks
        .filter((pt) => pt.isEnabled)
        .sort((a, b) => a.order - b.order)
        .map((pt) => ({
          taskId: pt.taskId._id || pt.taskId,
          order: pt.order,
          name: pt.taskId.name || null,
          description: pt.taskId.description || null,
          completionRule: pt.taskId.completionRule || null,
          rewardType: pt.taskId.rewardType || null,
          rewardValue: pt.taskId.rewardValue || null,
          requiredXpTier: pt.requiredXpTier,
          requiredMembershipTier: pt.requiredMembershipTier,
          isEnabled: pt.isEnabled,
        })),
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };

    res.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("Error getting progression rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get progression rule",
      error: error.message,
    });
  }
});

// Create or update user-based task progression rule
router.post(
  "/progression-rules",
  adminAuth,
  [
    body("ruleName").notEmpty().trim().withMessage("Rule name is required"),
    body("userMilestones")
      .isArray({ min: 1 })
      .withMessage("User milestones must be a non-empty array"),
    body("userMilestones.*")
      .isIn(["first_time_user", "returning_user", "xp_tier", "membership_tier"])
      .withMessage("Invalid milestone type"),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        if (req.body.userMilestones?.includes("xp_tier") && !value) {
          throw new Error(
            "XP tier is required when xp_tier milestone is selected"
          );
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .isIn(["bronze", "gold", "platinum", "free", null])
      .custom((value, { req }) => {
        if (req.body.userMilestones?.includes("membership_tier") && !value) {
          throw new Error(
            "Membership tier is required when membership_tier milestone is selected"
          );
        }
        return true;
      }),
    body("priority")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Priority must be a non-negative integer"),
    body("firstBatchSize")
      .isInt({ min: 1 })
      .withMessage("First batch size must be at least 1"),
    body("nextBatchSize")
      .isInt({ min: 1 })
      .withMessage("Next batch size must be at least 1"),
    body("maxBatches")
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || value === "") {
          return true; // Allow null/undefined/empty
        }
        const numValue = parseInt(value, 10);
        return !isNaN(numValue) && Number.isInteger(numValue) && numValue >= 1;
      })
      .withMessage("Max batches must be at least 1 or null"),
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
        ruleName,
        userMilestones,
        xpTier,
        membershipTier,
        priority = 0,
        firstBatchSize,
        nextBatchSize,
        maxBatches = null,
      } = req.body;

      // Find or create rule by ruleName
      let rule = await TaskProgressionRule.findOne({ ruleName: ruleName });

      if (rule) {
        // Update existing rule
        rule.userMilestones = userMilestones;
        rule.xpTier = xpTier || null;
        rule.membershipTier = membershipTier || null;
        rule.priority = priority;
        rule.firstBatchSize = firstBatchSize;
        rule.nextBatchSize = nextBatchSize;
        rule.maxBatches = maxBatches;
        rule.updatedBy = req.user.userId;
        rule.updatedAt = new Date();
      } else {
        // Create new rule
        rule = new TaskProgressionRule({
          ruleName: ruleName,
          userMilestones: userMilestones,
          xpTier: xpTier || null,
          membershipTier: membershipTier || null,
          priority: priority,
          firstBatchSize: firstBatchSize,
          nextBatchSize: nextBatchSize,
          maxBatches: maxBatches,
          createdBy: req.user.userId,
        });
      }

      // Check for duplicate priority in the same segment (xpTier + membershipTier)
      const duplicateQuery = {
        priority: priority,
        xpTier: xpTier || null,
        membershipTier: membershipTier || null,
        _id: { $ne: rule._id || null }, // Exclude current rule if updating
      };
      const existingRule = await TaskProgressionRule.findOne(duplicateQuery);
      if (existingRule) {
        return res.status(400).json({
          success: false,
          message: "A rule with the same priority already exists for this segment (XP Tier + Membership Tier combination)",
        });
      }

      // Validate configuration
      if (!rule.isValidConfiguration()) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid configuration. Please check your post threshold tasks setup.",
        });
      }

      await rule.save();

      // No need to populate xpTier - it's now a string

      // Format response
      const formattedData = {
        _id: rule._id,
        ruleName: rule.ruleName,
        userMilestones: rule.userMilestones,
        xpTier: rule.xpTier || null,
        membershipTier: rule.membershipTier || null,
        priority: rule.priority || 0,
        firstBatchSize: rule.firstBatchSize,
        nextBatchSize: rule.nextBatchSize,
        maxBatches: rule.maxBatches,
        isActive: rule.isActive,
      };

      res.json({
        success: true,
        message: rule.isNew
          ? "Progression rule created successfully"
          : "Progression rule updated successfully",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error saving progression rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save progression rule",
        error: error.message,
      });
    }
  }
);

// Update task progression rule by ID
router.put(
  "/progression-rules/:ruleId",
  adminAuth,
  [
    body("ruleName").notEmpty().trim().withMessage("Rule name is required"),
    body("userMilestones")
      .isArray({ min: 1 })
      .withMessage("User milestones must be a non-empty array"),
    body("userMilestones.*")
      .isIn(["first_time_user", "returning_user", "xp_tier", "membership_tier"])
      .withMessage("Invalid milestone type"),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        if (req.body.userMilestones?.includes("xp_tier") && !value) {
          throw new Error(
            "XP tier is required when xp_tier milestone is selected"
          );
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .isIn(["bronze", "gold", "platinum", "free", null])
      .custom((value, { req }) => {
        if (req.body.userMilestones?.includes("membership_tier") && !value) {
          throw new Error(
            "Membership tier is required when membership_tier milestone is selected"
          );
        }
        return true;
      }),
    body("priority")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Priority must be a non-negative integer"),
    body("firstBatchSize")
      .isInt({ min: 1 })
      .withMessage("First batch size must be at least 1"),
    body("nextBatchSize")
      .isInt({ min: 1 })
      .withMessage("Next batch size must be at least 1"),
    body("maxBatches")
      .optional({ nullable: true })
      .custom((value) => {
        if (value === null || value === undefined || value === "") {
          return true; // Allow null/undefined/empty
        }
        const numValue = parseInt(value, 10);
        return !isNaN(numValue) && Number.isInteger(numValue) && numValue >= 1;
      })
      .withMessage("Max batches must be at least 1 or null"),
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

      const { ruleId } = req.params;
      const {
        ruleName,
        userMilestones,
        xpTier,
        membershipTier,
        priority = 0,
        firstBatchSize,
        nextBatchSize,
        maxBatches = null,
        isActive,
      } = req.body;

      // Find rule by ID
      const rule = await TaskProgressionRule.findById(ruleId);

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: "Progression rule not found",
        });
      }

      // Update rule fields
      rule.ruleName = ruleName;
      rule.userMilestones = userMilestones;
      rule.xpTier = xpTier || null;
      rule.membershipTier = membershipTier || null;
      rule.priority = priority;
      rule.firstBatchSize = firstBatchSize;
      rule.nextBatchSize = nextBatchSize;
      rule.maxBatches = maxBatches;
      if (isActive !== undefined) {
        rule.isActive = isActive;
      }
      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();

      // Validate configuration
      if (!rule.isValidConfiguration()) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid configuration. Please check your batch configuration.",
        });
      }

      await rule.save();

      // Format response
      const formattedData = {
        _id: rule._id,
        ruleName: rule.ruleName,
        userMilestones: rule.userMilestones,
        xpTier: rule.xpTier || null,
        membershipTier: rule.membershipTier || null,
        priority: rule.priority || 0,
        firstBatchSize: rule.firstBatchSize,
        nextBatchSize: rule.nextBatchSize,
        maxBatches: rule.maxBatches,
        isActive: rule.isActive,
      };

      res.json({
        success: true,
        message: "Progression rule updated successfully",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error updating progression rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update progression rule",
        error: error.message,
      });
    }
  }
);

// Delete task progression rule for a game
router.delete("/progression-rules/:ruleId", adminAuth, async (req, res) => {
  try {
    const { ruleId } = req.params;
    const { confirm } = req.query;

    if (confirm !== "true") {
      return res.status(400).json({
        success: false,
        message: "Please confirm deletion by adding ?confirm=true to the URL",
      });
    }

    const rule = await TaskProgressionRule.findByIdAndDelete(ruleId);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Progression rule not found",
      });
    }

    res.json({
      success: true,
      message: "Progression rule deleted successfully",
      data: {
        id: rule._id,
        ruleName: rule.ruleName,
      },
    });
  } catch (error) {
    console.error("Error deleting progression rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete progression rule",
      error: error.message,
    });
  }
});

// ==================== WELCOME BONUS TIMER RULES ====================

// Get welcome bonus timer rules
router.get("/welcome-bonus-timer", adminAuth, async (req, res) => {
  try {
    const rules = await WelcomeBonusTimer.find({ isActive: true })
      .populate("gameBonusTasks.gameId", "title gameId")
      .populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue"
      )
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error("Error getting welcome bonus timer rules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get welcome bonus timer rules",
      error: error.message,
    });
  }
});

// Get welcome bonus timer rule for a specific game
router.get("/welcome-bonus-timer/game/:gameId", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;

    const rule = await WelcomeBonusTimer.findOne({
      isActive: true,
      "gameBonusTasks.gameId": gameId,
      "gameBonusTasks.isEnabled": true,
    })
      .populate("gameBonusTasks.gameId", "title gameId")
      .populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue"
      )
      .lean();

    if (!rule) {
      return res.json({
        success: true,
        data: null,
        message: "No bonus tasks configured for this game",
      });
    }

    const gameBonusConfig = rule.gameBonusTasks.find(
      (config) => config.gameId._id.toString() === gameId && config.isEnabled
    );

    if (!gameBonusConfig) {
      return res.json({
        success: true,
        data: null,
        message: "No bonus tasks configured for this game",
      });
    }

    // Format response for frontend
    const formattedData = {
      gameId: gameBonusConfig.gameId._id || gameBonusConfig.gameId,
      gameTitle: gameBonusConfig.gameId.title || null,
      gameGameId: gameBonusConfig.gameId.gameId || null,
      minimumEventThreshold: gameBonusConfig.minimumEventThreshold,
      completionDeadlineHours: 24, // Fixed 24 hours
      taskLogic: "sequential", // Always sequential
      bonusTasks: gameBonusConfig.bonusTasks
        .filter((bt) => bt.isEnabled)
        .sort((a, b) => a.order - b.order)
        .map((bt) => ({
          taskId: bt.taskId._id || bt.taskId,
          order: bt.order,
          name: bt.taskId.name || null,
          description: bt.taskId.description || null,
          completionRule: bt.taskId.completionRule || null,
          rewardType: bt.taskId.rewardType || null,
          rewardValue: bt.taskId.rewardValue || null,
          unlockCondition: bt.unlockCondition,
          isEnabled: bt.isEnabled,
        })),
      isEnabled: gameBonusConfig.isEnabled,
    };

    res.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("Error getting welcome bonus timer rule for game:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get welcome bonus timer rule for game",
      error: error.message,
    });
  }
});

// Update welcome bonus timer rules (legacy - for backward compatibility)
router.put(
  "/welcome-bonus-timer",
  adminAuth,
  [
    body("unlockTimeHours")
      .optional()
      .isNumeric()
      .withMessage("Unlock time must be numeric"),
    body("completionDeadlineDays")
      .optional()
      .isNumeric()
      .withMessage("Completion deadline must be numeric"),
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

      // Find existing rule or create new one
      let rule = await WelcomeBonusTimer.findOne({ isActive: true });

      if (rule) {
        if (req.body.unlockTimeHours !== undefined) {
          rule.unlockTimeHours = req.body.unlockTimeHours;
        }
        if (req.body.completionDeadlineDays !== undefined) {
          rule.completionDeadlineDays = req.body.completionDeadlineDays;
        }
        if (req.body.maxGamesWithBonusTasks !== undefined) {
          rule.maxGamesWithBonusTasks = req.body.maxGamesWithBonusTasks;
        }
        if (req.body.maxBonusTasksPerGame !== undefined) {
          rule.maxBonusTasksPerGame = req.body.maxBonusTasksPerGame;
        }
        if (req.body.gameOverrides !== undefined) {
          rule.gameOverrides = req.body.gameOverrides;
        }
        if (req.body.xpTierOverrides !== undefined) {
          rule.xpTierOverrides = req.body.xpTierOverrides;
        }
        if (req.body.isActive !== undefined) {
          rule.isActive = req.body.isActive;
        }
        rule.updatedBy = req.user.userId;
        rule.updatedAt = new Date();
      } else {
        rule = new WelcomeBonusTimer({
          unlockTimeHours: req.body.unlockTimeHours || 24,
          completionDeadlineDays: req.body.completionDeadlineDays || 7,
          maxGamesWithBonusTasks: req.body.maxGamesWithBonusTasks || 3,
          maxBonusTasksPerGame: req.body.maxBonusTasksPerGame || 3,
          gameOverrides: req.body.gameOverrides || [],
          xpTierOverrides: req.body.xpTierOverrides || [],
          isActive: req.body.isActive !== undefined ? req.body.isActive : true,
          createdBy: req.user.userId,
        });
      }

      await rule.save();

      res.json({
        success: true,
        message: "Welcome bonus timer rules updated successfully",
        data: rule,
      });
    } catch (error) {
      console.error("Error updating welcome bonus timer rules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update welcome bonus timer rules",
        error: error.message,
      });
    }
  }
);

// Create or update game bonus tasks configuration
router.post(
  "/welcome-bonus-timer/game/:gameId/bonus-tasks",
  adminAuth,
  [
    body("minimumEventThreshold")
      .isInt({ min: 0 })
      .withMessage("Minimum event threshold must be a non-negative integer"),
    body("completionDeadlineHours")
      .optional()
      .isInt({ min: 1, max: 168 })
      .withMessage("Completion deadline hours must be between 1 and 168 (1 week)"),
    body("bonusTasks")
      .isArray()
      .withMessage("Bonus tasks must be an array"),
    body("bonusTasks.*.taskId").isMongoId().withMessage("Invalid task ID"),
    body("bonusTasks.*.order")
      .isInt({ min: 1 })
      .withMessage("Order must be a positive integer"),
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

      const { gameId } = req.params;
      const { minimumEventThreshold, completionDeadlineHours, bonusTasks } = req.body;

      // Validate at least 1 task
      if (!bonusTasks || bonusTasks.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one bonus task is required",
        });
      }

      // Get maxBonusTasksPerGame from configuration for dynamic validation
      const activeRule = await WelcomeBonusTimer.findOne({
        isActive: true,
      }).lean();
      const maxTasksPerGame = activeRule?.maxBonusTasksPerGame || 3;

      // Validate bonus tasks count using dynamic maxTasksPerGame
      if (bonusTasks.length > maxTasksPerGame) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${maxTasksPerGame} bonus tasks allowed per game`,
        });
      }

      // Validate order values don't exceed maxBonusTasksPerGame
      if (bonusTasks.length > 0) {
        const maxOrder = Math.max(...bonusTasks.map((bt) => bt.order || 0));
        if (maxOrder > maxTasksPerGame) {
          return res.status(400).json({
            success: false,
            message: `Task order cannot exceed ${maxTasksPerGame}`,
          });
        }
      }

      // Validate that order values are unique and sequential
      const orders = bonusTasks.map((bt) => bt.order).sort((a, b) => a - b);
      const expectedOrders = Array.from(
        { length: bonusTasks.length },
        (_, i) => i + 1
      );
      const hasSequentialOrders = orders.every(
        (order, index) => order === expectedOrders[index]
      );

      if (!hasSequentialOrders) {
        return res.status(400).json({
          success: false,
          message: "Bonus tasks must have sequential order starting from 1",
          error: "INVALID_TASK_ORDER",
        });
      }

      // Validate no duplicate task IDs
      const taskIdsForDuplicateCheck = bonusTasks.map((bt) => bt.taskId);
      const uniqueTaskIds = [
        ...new Set(taskIdsForDuplicateCheck.map((id) => id.toString())),
      ];
      if (taskIdsForDuplicateCheck.length !== uniqueTaskIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "Duplicate task IDs are not allowed. Each task can only be selected once.",
          error: "DUPLICATE_TASK_IDS",
        });
      }

      // Validate that all task IDs exist and are active
      const taskIds = bonusTasks.map((bt) => bt.taskId);
      const existingTasks = await GameTask.find({
        _id: { $in: taskIds },
        gameId: gameId,
        isActive: true, // Only allow active tasks
      });

      if (existingTasks.length !== taskIds.length) {
        return res.status(400).json({
          success: false,
          message:
            "One or more task IDs are invalid, inactive, or do not belong to this game",
          error: "INVALID_TASK_IDS",
        });
      }

      // Find or create active rule
      let rule = await WelcomeBonusTimer.findOne({ isActive: true });

      if (!rule) {
        rule = new WelcomeBonusTimer({
          unlockTimeHours: 24,
          completionDeadlineDays: 7,
          maxGamesWithBonusTasks: 3,
          maxBonusTasksPerGame: 3,
          createdBy: req.user.userId,
        });
      }

      // Find existing game bonus task configuration
      const existingGameIndex = rule.gameBonusTasks.findIndex(
        (config) => config.gameId.toString() === gameId
      );

      const bonusTasksData = bonusTasks.map((bt) => ({
        taskId: bt.taskId,
        order: bt.order,
        unlockCondition:
          bt.unlockCondition ||
          "Unlock this Bonus Task after Minimum Event Threshold is met.",
        isEnabled: true,
      }));

      if (existingGameIndex >= 0) {
        // Update existing configuration
        rule.gameBonusTasks[existingGameIndex].minimumEventThreshold =
          minimumEventThreshold;
        rule.gameBonusTasks[existingGameIndex].completionDeadlineHours =
          completionDeadlineHours || 24;
        rule.gameBonusTasks[existingGameIndex].bonusTasks = bonusTasksData;
        rule.gameBonusTasks[existingGameIndex].isEnabled = true;
        rule.gameBonusTasks[existingGameIndex].updatedAt = new Date();
      } else {
        // Add new configuration
        rule.gameBonusTasks.push({
          gameId: gameId,
          minimumEventThreshold: minimumEventThreshold,
          completionDeadlineHours: completionDeadlineHours || 24,
          bonusTasks: bonusTasksData,
          isEnabled: true,
        });
      }

      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();

      // Validate configuration
      if (!rule.isValidConfiguration()) {
        // Log validation details for debugging
        console.error("WelcomeBonusTimer validation failed:", {
          unlockTimeHours: rule.unlockTimeHours,
          completionDeadlineDays: rule.completionDeadlineDays,
          maxBonusTasksPerGame: rule.maxBonusTasksPerGame,
          gameBonusTasksCount: rule.gameBonusTasks.length,
          gameBonusTasks: rule.gameBonusTasks.map(gbt => ({
            gameId: gbt.gameId,
            bonusTasksCount: gbt.bonusTasks?.length || 0,
            orders: gbt.bonusTasks?.map(bt => bt.order) || []
          }))
        });
        return res.status(400).json({
          success: false,
          message:
            "Invalid configuration. Please check your bonus tasks setup. Ensure unlock time is less than completion deadline, and bonus tasks have sequential orders starting from 1.",
        });
      }

      await rule.save();

      // Populate before returning
      await rule.populate("gameBonusTasks.gameId", "title gameId");
      await rule.populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue"
      );

      const gameBonusConfig = rule.gameBonusTasks.find(
        (config) => config.gameId._id.toString() === gameId
      );

      // Format response for frontend
      const formattedData = {
        gameId: gameBonusConfig.gameId._id || gameBonusConfig.gameId,
        gameTitle: gameBonusConfig.gameId.title || null,
        gameGameId: gameBonusConfig.gameId.gameId || null,
        minimumEventThreshold: gameBonusConfig.minimumEventThreshold,
        completionDeadlineHours: gameBonusConfig.completionDeadlineHours || 24,
        taskLogic: "sequential", // Always sequential
        bonusTasks: gameBonusConfig.bonusTasks
          .filter((bt) => bt.isEnabled)
          .sort((a, b) => a.order - b.order)
          .map((bt) => ({
            taskId: bt.taskId._id || bt.taskId,
            order: bt.order,
            name: bt.taskId.name || null,
            description: bt.taskId.description || null,
            completionRule: bt.taskId.completionRule || null,
            rewardType: bt.taskId.rewardType || null,
            rewardValue: bt.taskId.rewardValue || null,
            unlockCondition: bt.unlockCondition,
            isEnabled: bt.isEnabled,
          })),
        isEnabled: gameBonusConfig.isEnabled,
      };

      res.json({
        success: true,
        message: "Game bonus tasks configured successfully",
        data: formattedData,
      });
    } catch (error) {
      console.error("Error updating game bonus tasks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update game bonus tasks",
        error: error.message,
      });
    }
  }
);

// Delete game bonus tasks configuration
router.delete(
  "/welcome-bonus-timer/game/:gameId/bonus-tasks",
  adminAuth,
  async (req, res) => {
    try {
      const { gameId } = req.params;

      const rule = await WelcomeBonusTimer.findOne({ isActive: true });

      if (!rule) {
        return res.status(404).json({
          success: false,
          message: "No active welcome bonus timer rule found",
        });
      }

      const gameIndex = rule.gameBonusTasks.findIndex(
        (config) => config.gameId.toString() === gameId
      );

      if (gameIndex < 0) {
        return res.status(404).json({
          success: false,
          message: "No bonus tasks configuration found for this game",
        });
      }

      // Remove the game bonus tasks configuration
      rule.gameBonusTasks.splice(gameIndex, 1);
      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();

      await rule.save();

      res.json({
        success: true,
        message: "Game bonus tasks configuration deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting game bonus tasks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete game bonus tasks",
        error: error.message,
      });
    }
  }
);

// Get all game bonus tasks configurations
router.get(
  "/welcome-bonus-timer/game-bonus-tasks",
  adminAuth,
  async (req, res) => {
    try {
      const rule = await WelcomeBonusTimer.findOne({ isActive: true })
        .populate("gameBonusTasks.gameId", "title gameId")
        .populate(
          "gameBonusTasks.bonusTasks.taskId",
          "name description completionRule rewardType rewardValue"
        )
        .lean();

      if (!rule) {
        return res.json({
          success: true,
          data: {
            configurations: [],
          },
        });
      }

      // Format all game bonus task configurations
      const configurations = rule.gameBonusTasks
        .filter((config) => config.isEnabled)
        .map((config) => ({
          gameId: config.gameId._id || config.gameId,
          gameTitle: config.gameId?.title || null,
          gameGameId: config.gameId?.gameId || null,
          minimumEventThreshold: config.minimumEventThreshold,
          completionDeadlineHours: config.completionDeadlineHours || 24,
          taskLogic: "sequential", // Always sequential
          bonusTasks: config.bonusTasks
            .filter((bt) => bt.isEnabled)
            .sort((a, b) => a.order - b.order)
            .map((bt) => ({
              taskId: bt.taskId._id || bt.taskId,
              order: bt.order,
              name: bt.taskId?.name || null,
              description: bt.taskId?.description || null,
              completionRule: bt.taskId?.completionRule || null,
              rewardType: bt.taskId?.rewardType || null,
              rewardValue: bt.taskId?.rewardValue || null,
              unlockCondition: bt.unlockCondition,
              isEnabled: bt.isEnabled,
            })),
          isEnabled: config.isEnabled,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        }));

      res.json({
        success: true,
        data: {
          configurations,
        },
      });
    } catch (error) {
      console.error("Error getting all game bonus tasks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get game bonus tasks configurations",
        error: error.message,
      });
    }
  }
);

// ==================== MASTER DATA ENDPOINTS ====================

// Get countries list
router.get("/master-data/countries", adminAuth, async (req, res) => {
  try {
    const countries = [
      { code: "US", name: "United States" },
      { code: "IN", name: "India" },
      { code: "GB", name: "United Kingdom" },
      { code: "CA", name: "Canada" },
      { code: "AU", name: "Australia" },
      { code: "DE", name: "Germany" },
      { code: "FR", name: "France" },
      { code: "BR", name: "Brazil" },
      { code: "MX", name: "Mexico" },
      { code: "JP", name: "Japan" },
    ];

    res.json({
      success: true,
      data: countries,
    });
  } catch (error) {
    console.error("Error getting countries:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get countries",
      error: error.message,
    });
  }
});

// Get SDK providers list
router.get("/master-data/sdk-providers", adminAuth, async (req, res) => {
  try {
    const providers = [
      { id: "bitlabs", name: "BitLabs" },
      { id: "adgem", name: "AdGem" },
      { id: "besitos", name: "Besitos" },
      { id: "everflow", name: "Everflow" },
      { id: "applovin_max", name: "AppLovin MAX" },
      { id: "cpx", name: "CPX Research" },
      { id: "ayet", name: "Ayet Studios" },
      { id: "unity", name: "Unity Ads" },
      { id: "ironsource", name: "IronSource" },
    ];

    res.json({
      success: true,
      data: providers,
    });
  } catch (error) {
    console.error("Error getting SDK providers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get SDK providers",
      error: error.message,
    });
  }
});

// Get XPTR values list
router.get("/master-data/xptr-values", adminAuth, async (req, res) => {
  try {
    const xptrValues = [
      "Play 5 minutes",
      "Play 10 minutes",
      "Play 15 minutes",
      "Watch Ad",
      "Complete Level 1",
      "Complete Level 3",
      "Complete Level 5",
      "Install Game",
      "Open Event",
      "Video Completed",
    ];

    res.json({
      success: true,
      data: xptrValues,
    });
  } catch (error) {
    console.error("Error getting XPTR values:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get XPTR values",
      error: error.message,
    });
  }
});

// Get tier access list
router.get("/master-data/tier-access", adminAuth, async (req, res) => {
  try {
    const tiers = [
      { id: "free", name: "Free" },
      { id: "bronze", name: "Bronze" },
      { id: "gold", name: "Gold" },
      { id: "platinum", name: "Platinum" },
    ];

    res.json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    console.error("Error getting tier access:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tier access",
      error: error.message,
    });
  }
});

// Check if game ID is available
router.get("/games/by-sdk/:sdk", adminAuth, async (req, res) => {
  try {
    const { sdk } = req.params;
    if (sdk === "besitos") {
      await besitosController.getOffers(req, res);
    } else if (sdk === "bitlabs") {
      await bitlabsController.getOffers(req, res);
    } else {
      res.status(404).json({
        success: false,
        message: "No games found for the selected SDK.",
      });
    }
  } catch (error) {
    console.error("Error while fetching game list:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the game list.",
      error: error.message,
    });
  }
});

/**
 * Get configured non-gaming offers from database
 * GET /api/admin/game-offers/non-game-offers/configured/bitlabs
 * Query: {
 *   offerType: 'survey' | 'cashback' | 'shopping' | 'magic_receipt' | 'all',
 *   status: 'live' | 'paused' | 'all'
 * }
 */
router.get(
  "/non-game-offers/configured/bitlabs",
  adminAuth,
  async (req, res) => {
    try {
      const SurveySDK = require("../models/SurveySDK");
      const SurveyOffer = require("../models/SurveyOffer");
      const NonGameOffer = require("../models/NonGameOffer");

      const { offerType = "all", status = "all" } = req.query;

      // console.log("🔵 [ADMIN BACKEND] Get configured offers request:", {
      //   offerType,
      //   status,
      //   query: req.query,
      // });

      // Find BitLab SDK
      const bitlabSDK = await SurveySDK.findOne({
        name: { $regex: /bitlab/i },
      });

      if (!bitlabSDK) {
        // console.log("⚠️ [ADMIN BACKEND] BitLab SDK not found");
        return res.json({
          success: true,
          data: {
            configuredOffers: [],
            breakdown: {
              surveys: 0,
              cashback: 0,
              shopping: 0,
              magicReceipts: 0,
              other: 0,
            },
            total: 0,
          },
        });
      }

      // console.log("✅ [ADMIN BACKEND] BitLab SDK found:", {
      //   id: bitlabSDK._id,
      //   name: bitlabSDK.name,
      // });

      // Build base query
      const baseQuery = {
        sdkId: sdk._id,
      };

      if (status !== "all") {
        baseQuery.status = status;
      }

      // console.log("🔍 [ADMIN BACKEND] Base query:", baseQuery);

      // Fetch from both models based on offerType
      let allOffers = [];

      if (offerType === "all" || offerType === "survey") {
        // Get surveys from SurveyOffer
        const surveyQuery = { ...baseQuery, offerType: "survey" };
        // console.log("🔍 [ADMIN BACKEND] Survey query:", surveyQuery);
        const surveys = await SurveyOffer.find(surveyQuery)
          .populate("sdkId", "name displayName")
          .sort({ createdAt: -1 })
          .lean();
        // console.log(`✅ [ADMIN BACKEND] Found ${surveys.length} surveys`);
        allOffers.push(...surveys);
      }

      if (
        offerType === "all" ||
        offerType === "cashback" ||
        offerType === "shopping" ||
        offerType === "magic_receipt"
      ) {
        // Get non-gaming offers from NonGameOffer
        const nonGameQuery = { ...baseQuery };
        if (offerType !== "all") {
          nonGameQuery.offerType = offerType;
        }
        // console.log("🔍 [ADMIN BACKEND] Non-game query:", nonGameQuery);
        const nonGameOffers = await NonGameOffer.find(nonGameQuery)
          .populate("sdkId", "name displayName")
          .sort({ createdAt: -1 })
          .lean();
        // console.log(
        //   `✅ [ADMIN BACKEND] Found ${nonGameOffers.length} non-gaming offers`
        // );

        // Debug: Check all non-gaming offers regardless of query
        const allNonGameOffersDebug = await NonGameOffer.find({})
          .populate("sdkId", "name displayName")
          .sort({ createdAt: -1 })
          .lean();
        // console.log(
        //   `🔍 [ADMIN BACKEND] Total non-gaming offers in DB: ${allNonGameOffersDebug.length}`
        // );
        if (allNonGameOffersDebug.length > 0) {
          // console.log(
          //   "📋 [ADMIN BACKEND] All non-gaming offers in DB:",
          //   allNonGameOffersDebug.map((o) => ({
          //     id: o._id,
          //     externalId: o.externalId,
          //     title: o.title,
          //     offerType: o.offerType,
          //     status: o.status,
          //     sdkId: o.sdkId?._id || o.sdkId,
          //     sdkName: o.sdkId?.name || "N/A",
          //   }))
          // );
        }

        if (nonGameOffers.length > 0) {
          // console.log(
          //   "📋 [ADMIN BACKEND] Non-gaming offers matching query:",
          //   nonGameOffers.slice(0, 3).map((o) => ({
          //     id: o._id,
          //     externalId: o.externalId,
          //     title: o.title,
          //     offerType: o.offerType,
          //     status: o.status,
          //   }))
          // );
        }
        allOffers.push(...nonGameOffers);
      }

      // Sort all offers by createdAt
      allOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Group by type
      const breakdown = {
        surveys: 0,
        cashback: 0,
        shopping: 0,
        magicReceipts: 0,
        other: 0,
      };

      allOffers.forEach((offer) => {
        if (offer.offerType === "survey") breakdown.surveys++;
        else if (offer.offerType === "cashback") breakdown.cashback++;
        else if (offer.offerType === "shopping") breakdown.shopping++;
        else if (offer.offerType === "magic_receipt") breakdown.magicReceipts++;
        else breakdown.other++;
      });

      res.json({
        success: true,
        data: {
          configuredOffers: allOffers.map((offer) => {
            // Extract all fields from metadata to match normalized format
            const metadata = offer.metadata || {};
            const bitlabsData = metadata.bitlabsData || {};
            const publisherRevenue = metadata.publisherRevenue || {};

            return {
              id: offer._id,
              externalId: offer.externalId,
              title: offer.title,
              description: offer.description,
              category: offer.category,
              offerType: offer.offerType,
              coinReward: offer.coinReward,
              estimatedTime: offer.estimatedTime,
              status: offer.status,
              targetAudience: offer.targetAudience,

              // Return all fields in the same format as normalized offer
              // Reward fields
              reward: metadata.reward || {
                coins: offer.coinReward,
                currency: "points",
                xp: metadata.userRewardXP || Math.round(offer.coinReward * 0.5),
              },
              userRewardCoins: metadata.userRewardCoins || offer.coinReward,
              userRewardXP:
                metadata.userRewardXP || Math.round(offer.coinReward * 0.5),

              // Bitlabs specific fields
              value: publisherRevenue.value || bitlabsData.value || 0,
              cpi: publisherRevenue.cpi || bitlabsData.cpi || 0,
              cr: bitlabsData.cr || 0,
              loi: bitlabsData.loi || offer.estimatedTime || 0,
              rating: bitlabsData.rating || 0,
              country: bitlabsData.country || null,
              language: bitlabsData.language || null,
              tags: bitlabsData.tags || [],

              // URLs
              clickUrl: metadata.externalUrl || "",
              surveyUrl: metadata.surveyUrl || "",
              deepLink: metadata.deepLink || "",
              supportUrl: metadata.supportUrl || "",

              // Images
              icon: metadata.thumbnail || "",
              banner: metadata.thumbnail || "",

              // Publisher revenue
              publisherRevenue: publisherRevenue,

              // Complete metadata
              metadata: offer.metadata,

              // Timestamps
              createdAt: offer.createdAt,
              updatedAt: offer.updatedAt,
            };
          }),
          breakdown,
          total: allOffers.length,
        },
      });
    } catch (error) {
      console.error("Error getting configured offers:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get configured offers",
        error: error.message,
      });
    }
  }
);

// Get non-game offers from Bitlabs (surveys, magic receipts, cashback, shopping)
router.get("/non-game-offers/by-sdk/:sdk", adminAuth, async (req, res) => {
  try {
    const { sdk } = req.params;
    const { type = "all", devices, is_game = false, country } = req.query;

    // console.log("🟡 [ADMIN BACKEND ROUTE] Received request:", {
    //   endpoint: "/non-game-offers/by-sdk/:sdk",
    //   sdk,
    //   queryParams: {
    //     type,
    //     devices,
    //     is_game,
    //     country,
    //   },
    //   allQueryParams: req.query,
    //   userId: req.user?.userId,
    // });

    if (sdk === "bitlabs") {
      const bitlabsOfferCache = require("../utils/bitlabsOfferCache");
      const bitlabsNonGames = require("../utils/bitlabs-non-games");

      // Build query parameters
      const queryParams = {
        is_game: false, // Only non-game offers
      };

      // Add device filter if provided
      if (devices) {
        queryParams.devices = Array.isArray(devices) ? devices : [devices];
      }

      // Build userProfile with country and device support
      // CRITICAL: Offers are often country-specific!
      // If testing from India but offers target US, specify country=US
      const userProfile = {};
      if (country) {
        userProfile.country = country;
        // console.log(
        //   `🌍 Admin request: Using country "${country}" for non-game offers`
        // );
      } else {
        // console.log(
        //   `⚠️ Admin request: No country specified. Will default to "US" in utility function.`
        // );
        // console.log(
        //   `   To test with India-targeted offers, add ?country=IN to the request URL`
        // );
      }

      // Convert devices array to platform for userProfile
      // This ensures surveys and cashback APIs get device filtering
      if (devices) {
        const devicesArray = Array.isArray(devices) ? devices : [devices];
        if (
          devicesArray.includes("android") &&
          devicesArray.includes("iphone")
        ) {
          userProfile.platform = "mobile"; // Both platforms
        } else if (devicesArray.includes("android")) {
          userProfile.platform = "android";
        } else if (devicesArray.includes("iphone")) {
          userProfile.platform = "ios"; // or "iphone"
        } else if (devicesArray.includes("ipad")) {
          userProfile.platform = "ipad";
        } else {
          userProfile.platform = "mobile"; // Default to mobile
        }
        // console.log(
        //   `📱 Admin request: Using platform "${
        //     userProfile.platform
        //   }" for devices: ${devicesArray.join(", ")}`
        // );
      }

      // Get offers - also pass devices directly for general offers API
      const utilityParams = {
        userId: "admin-preview",
        userProfile: userProfile,
        type: type || "all",
        category: "all",
        devices: queryParams.devices, // Pass devices for shopping/magic receipts
      };
      // console.log(
      //   "🟡 [ADMIN BACKEND ROUTE] Calling bitlabsNonGames.getNonGameOffers with:",
      //   utilityParams
      // );

      const result = await bitlabsNonGames.getNonGameOffers(utilityParams);

      // console.log("🟡 [ADMIN BACKEND ROUTE] Received result from utility:", {
      //   success: result.success,
      //   totalOffers: result.totalOffers || 0,
      //   surveysCount: result.categorized?.surveys?.length || 0,
      //   cashbackCount: result.categorized?.cashback?.length || 0,
      //   shoppingCount: result.categorized?.shopping?.length || 0,
      //   magicReceiptsCount: result.categorized?.magicReceipts?.length || 0,
      //   error: result.error,
      // });

      if (!result.success) {
        console.error(
          "🟡 [ADMIN BACKEND ROUTE] Error from utility:",
          result.error
        );
        return res.status(500).json({
          success: false,
          message: result.error || "Failed to fetch non-game offers",
          data: [],
        });
      }

      const responseData = {
        success: true,
        data: result.offers,
        categorized: result.categorized,
        breakdown: result.breakdown,
        total: result.totalOffers,
        estimatedEarnings: result.estimatedEarnings,
      };
      console.log("🟡 [ADMIN BACKEND ROUTE] Sending response to admin:", {
        success: responseData.success,
        total: responseData.total,
        surveysCount: responseData.categorized?.surveys?.length || 0,
      });
      res.json(responseData);
    } else if (sdk === "everflow") {
      // Everflow SDK support
      const everflowService = require("../services/everflow.service");

      if (!everflowService.isConfigured()) {
        return res.status(400).json({
          success: false,
          message: "Everflow API is not configured. Please set EVERFLOW_API_KEY in environment variables.",
        });
      }

      // Build query parameters for Everflow
      const queryParams = {};
      
      // Map type to Everflow offer_status if needed
      if (type && type !== "all") {
        // Everflow uses offer_status field, but we'll filter after fetching
        queryParams.offer_status = "active";
      }

      // Add country filter if provided
      if (country) {
        queryParams.country = country;
      }

      try {
        const result = await everflowService.getOffers(queryParams);

        if (!result.success) {
          return res.status(500).json({
            success: false,
            message: result.error || "Failed to fetch Everflow offers",
            data: [],
          });
        }

        // Filter by type if specified
        let filteredOffers = result.data || [];
        if (type && type !== "all") {
          filteredOffers = filteredOffers.filter((offer) => {
            const offerType = offer.offerType || offer.type || "other";
            return offerType === type;
          });
        }

        // Categorize offers
        const categorized = {
          surveys: [],
          cashback: [],
          shopping: [],
          magicReceipts: [],
          other: [],
        };

        filteredOffers.forEach((offer) => {
          const offerType = offer.offerType || offer.type || "other";
          const categoryKey = offerType === "magic_receipt" ? "magicReceipts" : offerType;
          if (categorized[categoryKey]) {
            categorized[categoryKey].push(offer);
          } else {
            categorized.other.push(offer);
          }
        });

        const responseData = {
          success: true,
          data: filteredOffers,
          categorized: categorized,
          breakdown: {
            surveys: categorized.surveys.length,
            cashback: categorized.cashback.length,
            shopping: categorized.shopping.length,
            magicReceipts: categorized.magicReceipts.length,
            other: categorized.other.length,
          },
          total: filteredOffers.length,
          estimatedEarnings: filteredOffers.reduce(
            (sum, o) => sum + (o.coinReward || o.reward?.coins || 0),
            0
          ),
        };

        res.json(responseData);
      } catch (error) {
        console.error("Error fetching Everflow offers:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch Everflow offers",
          error: error.message,
          data: [],
        });
      }
    } else {
      res.status(404).json({
        success: false,
        message: `Non-game offers are only available from Bitlabs or Everflow SDK. Received: ${sdk}`,
      });
    }
  } catch (error) {
    console.error("Error while fetching non-game offers:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching non-game offers.",
      error: error.message,
    });
  }
});

/**
 * Delete/Unsync a configured non-gaming offer
 * DELETE /api/admin/game-offers/non-game-offers/configured/:id
 */
router.delete(
  "/non-game-offers/configured/:id",
  adminAuth,
  async (req, res) => {
    try {
      const SurveyOffer = require("../models/SurveyOffer");
      const NonGameOffer = require("../models/NonGameOffer");

      // Try to find in SurveyOffer first (surveys)
      let offer = await SurveyOffer.findById(req.params.id);

      if (offer) {
        await SurveyOffer.findByIdAndDelete(req.params.id);
        return res.json({
          success: true,
          message: "Survey offer removed successfully",
        });
      }

      // If not found, try NonGameOffer (cashback, shopping, magic receipts)
      offer = await NonGameOffer.findById(req.params.id);

      if (offer) {
        await NonGameOffer.findByIdAndDelete(req.params.id);
        return res.json({
          success: true,
          message: "Non-game offer removed successfully",
        });
      }

      // Not found in either model
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    } catch (error) {
      console.error("Error deleting offer:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete offer",
        error: error.message,
      });
    }
  }
);

/**
 * Sync BitLab non-gaming offers to database
 * Surveys → SurveyOffer model
 * Cashback, Magic Receipts, Shopping → NonGameOffer model
 * POST /api/admin/game-offers/non-game-offers/sync/bitlabs
 * Body: {
 *   offerIds: ['survey_123', 'cashback_456', ...], // Optional: specific offers to sync
 *   offerType: 'all' | 'survey' | 'cashback' | 'shopping' | 'magic_receipt', // Optional
 *   autoActivate: true // Auto set status to 'live'
 * }
 */
router.post("/non-game-offers/sync/bitlabs", adminAuth, async (req, res) => {
  try {
    const SurveySDK = require("../models/SurveySDK");
    const SurveyOffer = require("../models/SurveyOffer");
    const NonGameOffer = require("../models/NonGameOffer");
    const bitlabsNonGames = require("../utils/bitlabs-non-games");

    // Get or create BitLab SDK
    let bitlabSDK = await SurveySDK.findOne({ name: { $regex: /bitlab/i } });
    if (!bitlabSDK) {
      // Create BitLab SDK if doesn't exist
      bitlabSDK = new SurveySDK({
        name: "bitlabs",
        displayName: "BitLab",
        apiKey: process.env.BITLABS_API_TOKEN || "",
        baseUrl: process.env.BITLABS_BASE_URL || "https://api.bitlabs.ai",
        isActive: true,
        createdBy: req.user.userId,
      });
      await bitlabSDK.save();
    }

    const {
      offerIds,
      offerType = "all",
      autoActivate = true,
      devices,
      country, // Add country support for syncing
      targetAudience, // Array of { offerId, targetAudience: { age: [], gender: [] } }
    } = req.body;

    // Build userProfile with country and device support
    // CRITICAL: Offers are often country-specific!
    const userProfile = {};
    if (country) {
      userProfile.country = country;
      // console.log(
      //   `🌍 Sync request: Using country "${country}" for BitLabs offers`
      // );
    } else {
      // console.log(
      //   `⚠️ Sync request: No country specified. Will default to "US" in utility function.`
      // );
    }

    // Convert devices array to platform for userProfile
    // This ensures surveys and cashback APIs get device filtering
    if (devices && devices.length > 0) {
      const devicesArray = Array.isArray(devices) ? devices : [devices];
      if (devicesArray.includes("android") && devicesArray.includes("iphone")) {
        userProfile.platform = "mobile"; // Both platforms
      } else if (devicesArray.includes("android")) {
        userProfile.platform = "android";
      } else if (devicesArray.includes("iphone")) {
        userProfile.platform = "ios";
      } else if (devicesArray.includes("ipad")) {
        userProfile.platform = "ipad";
      } else {
        userProfile.platform = "mobile"; // Default to mobile
      }
      // console.log(
      //   `📱 Sync request: Using platform "${
      //     userProfile.platform
      //   }" for devices: ${devicesArray.join(", ")}`
      // );
    }

    // Fetch offers from BitLab
    const result = await bitlabsNonGames.getNonGameOffers({
      userId: "admin-preview",
      userProfile: userProfile,
      type: offerType,
      category: "all",
      devices: devices, // Pass devices filter to BitLab API
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || "Failed to fetch offers from BitLab",
        error: result.error,
      });
    }

    const allOffers = [];

    // Collect all offers by type
    if (offerType === "all" || offerType === "survey") {
      const surveys = result.categorized.surveys || [];

      allOffers.push(
        ...surveys.map((o) => ({
          ...o,
          offerType: "survey",
        }))
      );
    }
    if (offerType === "all" || offerType === "cashback") {
      allOffers.push(
        ...(result.categorized.cashback || []).map((o) => ({
          ...o,
          offerType: "cashback",
        }))
      );
    }
    if (offerType === "all" || offerType === "shopping") {
      allOffers.push(
        ...(result.categorized.shopping || []).map((o) => ({
          ...o,
          offerType: "shopping",
        }))
      );
    }
    if (offerType === "all" || offerType === "magic_receipt") {
      allOffers.push(
        ...(result.categorized.magicReceipts || []).map((o) => ({
          ...o,
          offerType: "magic_receipt",
        }))
      );
    }

    // Filter by offerIds if provided
    // For cashback: ID is merchant_id (number or string)
    // For shopping/magic receipts: ID might be product_id or anchor
    // For surveys: ID is surveyId or id
    const offersToSync =
      offerIds && offerIds.length > 0
        ? allOffers.filter((o) => {
            // Get all possible ID formats for this offer
            const offerId = o.id || o.surveyId || o.offerId || o.externalId;
            const merchantId = o.merchant_id?.toString();
            const productId = o.product_id?.toString();
            const anchor = o.anchor?.toString(); // Add anchor for magic receipts and shopping

            // Convert offerIds to strings for comparison
            const offerIdsStr = offerIds.map((id) => id?.toString());

            // Check if any ID matches (normalize all to strings)
            const matches =
              offerIdsStr.includes(offerId?.toString()) ||
              (merchantId && offerIdsStr.includes(merchantId)) ||
              (productId && offerIdsStr.includes(productId)) ||
              (anchor && offerIdsStr.includes(anchor)); // Check anchor for magic receipts/shopping

            return matches;
          })
        : allOffers;

    let syncedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const offer of offersToSync) {
      try {
        // For cashback: use merchant_id as externalId
        // For shopping/magic receipts: use product_id or anchor
        // For surveys: use id, surveyId, or offerId
        let externalId;
        if (offer.offerType === "cashback") {
          externalId =
            offer.merchant_id?.toString() ||
            offer.id ||
            offer.offerId ||
            offer.externalId;
        } else if (
          offer.offerType === "shopping" ||
          offer.offerType === "magic_receipt"
        ) {
          externalId =
            offer.product_id?.toString() ||
            offer.anchor ||
            offer.id ||
            offer.offerId ||
            offer.externalId;
        } else {
          externalId =
            offer.id || offer.surveyId || offer.offerId || offer.externalId;
        }

        if (!externalId) {
          skippedCount++;
          continue;
        }

        // Determine which model to use based on offer type
        const isSurvey = offer.offerType === "survey";
        const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;

        // Find target audience for this offer if provided
        const offerTargetAudience = targetAudience?.find(
          (t) =>
            t.offerId === offer.id ||
            t.offerId === offer.surveyId ||
            t.offerId === offer.offerId ||
            t.offerId === externalId
        );
        const selectedAges = offerTargetAudience?.targetAudience?.age || [];
        const selectedGenders =
          offerTargetAudience?.targetAudience?.gender || [];

        // Check if already exists
        const existing = await OfferModel.findOne({
          sdkId: bitlabSDK._id,
          externalId: externalId,
        });

        // For cashback, magic receipts, and shopping: Preserve raw Bitlabs structure
        // For surveys: Use normalized offer data
        const isCashback = offer.offerType === "cashback";
        const isMagicReceipt =
          offer.offerType === "magic_receipt" ||
          offer.offerType === "magic-receipts" ||
          offer.offerType === "magicReceipts";
        const isShopping = offer.offerType === "shopping";
        const normalizedOffer = offer;

        // Extract coinReward - use userRewardCoins (20% of value) for user reward
        // But store the full value in metadata for reference
        let coinReward = 0;
        let publisherValue = 0;
        let userRewardCoins = 0;
        let userRewardXP = 0;

        if (isCashback) {
          // For cashback: Extract from raw Bitlabs structure
          // Cashback doesn't have 'value' field like surveys, so use cashback percentage
          const cashbackValue = parseFloat(normalizedOffer.cashback) || 0;
          publisherValue = cashbackValue; // Use cashback as base value
          userRewardCoins = Math.round(cashbackValue * 0.2); // 20% margin
          userRewardXP = Math.round(userRewardCoins * 0.5); // 50% of coins as XP
          coinReward = userRewardCoins;
        } else if (isMagicReceipt || isShopping) {
          // For magic receipts and shopping: Extract from total_points (sum of all events)
          // Both have events array with total_points
          const totalPoints = parseFloat(normalizedOffer.total_points) || 0;
          publisherValue = totalPoints; // Use total_points as base value
          userRewardCoins = Math.round(totalPoints * 0.2); // 20% margin
          userRewardXP = Math.round(userRewardCoins * 0.5); // 50% of coins as XP
          coinReward = userRewardCoins;
        } else {
          // For surveys and other offers: Use existing logic
          publisherValue = parseFloat(normalizedOffer.value) || 0;
          userRewardCoins =
            normalizedOffer.userRewardCoins ||
            normalizedOffer.reward?.coins ||
            0;
          userRewardXP =
            normalizedOffer.userRewardXP || normalizedOffer.reward?.xp || 0;
          coinReward = userRewardCoins;
        }

        // Extract and store category - NonGameOffer model expects a string (enum), not an object
        // For cashback: use primary_category as string
        // For shopping/magic receipts: use first category from categories array or category.name
        let categoryString = "other"; // Default to "other" (valid enum value)

        if (isCashback) {
          // Cashback offers have primary_category as a string
          const primaryCategory = normalizedOffer.primary_category || "";
          // Map to valid enum values
          if (primaryCategory) {
            const categoryLower = primaryCategory.toLowerCase();
            // Map common categories to enum values
            if (
              categoryLower.includes("finance") ||
              categoryLower.includes("banking")
            ) {
              categoryString = "finance";
            } else if (
              categoryLower.includes("shopping") ||
              categoryLower.includes("retail") ||
              categoryLower.includes("clothing") ||
              categoryLower.includes("accessories") ||
              categoryLower.includes("fashion") ||
              categoryLower.includes("store") ||
              categoryLower.includes("merchant")
            ) {
              categoryString = "shopping";
            } else if (
              categoryLower.includes("entertainment") ||
              categoryLower.includes("music") ||
              categoryLower.includes("video")
            ) {
              categoryString = "entertainment";
            } else if (
              categoryLower.includes("technology") ||
              categoryLower.includes("tech") ||
              categoryLower.includes("software")
            ) {
              categoryString = "technology";
            } else if (
              categoryLower.includes("health") ||
              categoryLower.includes("fitness") ||
              categoryLower.includes("medical")
            ) {
              categoryString = "health";
            } else if (
              categoryLower.includes("travel") ||
              categoryLower.includes("hotel") ||
              categoryLower.includes("flight")
            ) {
              categoryString = "travel";
            } else if (
              categoryLower.includes("education") ||
              categoryLower.includes("learning") ||
              categoryLower.includes("course")
            ) {
              categoryString = "education";
            } else {
              categoryString = "other";
            }
          }
        } else if (isMagicReceipt || isShopping) {
          // Shopping/magic receipts have categories array or category object
          const categoryName =
            normalizedOffer.categories?.[0] ||
            normalizedOffer.category?.name ||
            normalizedOffer.category ||
            "";
          if (categoryName) {
            const categoryLower = categoryName.toLowerCase();
            // Map to valid enum values (same logic as cashback)
            if (
              categoryLower.includes("finance") ||
              categoryLower.includes("banking")
            ) {
              categoryString = "finance";
            } else if (
              categoryLower.includes("shopping") ||
              categoryLower.includes("retail") ||
              categoryLower.includes("clothing") ||
              categoryLower.includes("accessories") ||
              categoryLower.includes("fashion") ||
              categoryLower.includes("store") ||
              categoryLower.includes("merchant")
            ) {
              categoryString = "shopping";
            } else if (
              categoryLower.includes("entertainment") ||
              categoryLower.includes("music") ||
              categoryLower.includes("video")
            ) {
              categoryString = "entertainment";
            } else if (
              categoryLower.includes("technology") ||
              categoryLower.includes("tech") ||
              categoryLower.includes("software")
            ) {
              categoryString = "technology";
            } else if (
              categoryLower.includes("health") ||
              categoryLower.includes("fitness") ||
              categoryLower.includes("medical")
            ) {
              categoryString = "health";
            } else if (
              categoryLower.includes("travel") ||
              categoryLower.includes("hotel") ||
              categoryLower.includes("flight")
            ) {
              categoryString = "travel";
            } else if (
              categoryLower.includes("education") ||
              categoryLower.includes("learning") ||
              categoryLower.includes("course")
            ) {
              categoryString = "education";
            } else {
              categoryString = "other";
            }
          }
        } else {
          // For surveys and other offers: use existing category logic
          if (normalizedOffer.category) {
            if (typeof normalizedOffer.category === "string") {
              const categoryLower = normalizedOffer.category.toLowerCase();
              // Map to valid enum values
              if (
                [
                  "finance",
                  "shopping",
                  "entertainment",
                  "technology",
                  "health",
                  "travel",
                  "education",
                  "other",
                ].includes(categoryLower)
              ) {
                categoryString = categoryLower;
              } else {
                categoryString = "other";
              }
            } else if (typeof normalizedOffer.category === "object") {
              const categoryName = normalizedOffer.category.name || "";
              const categoryLower = categoryName.toLowerCase();
              if (
                [
                  "finance",
                  "shopping",
                  "entertainment",
                  "technology",
                  "health",
                  "travel",
                  "education",
                  "other",
                ].includes(categoryLower)
              ) {
                categoryString = categoryLower;
              } else {
                categoryString = "other";
              }
            }
          }
        }

        // Allow offers with 0 coins to show raw API values
        // (Previously skipped offers with coinReward < 1)

        // Determine offer type - default based on which model we're using
        const defaultOfferType = isSurvey
          ? "survey"
          : offer.offerType || "other";

        // 🔍 DEBUG: Log offer data for surveys before saving
        if (isSurvey || offer.offerType === "survey") {
          // console.log(`\n🔍 SYNC: Preparing to save Survey ${externalId}`);
          // console.log(`   coinReward: ${coinReward}`);
          // console.log(`   offer.value: ${offer.value}`);
          // console.log(`   offer.cpi: ${offer.cpi}`);
          // console.log(`   offer.cr: ${offer.cr} (Conversion Rate)`);
          // console.log(`   offer.loi: ${offer.loi} (Length of Interview)`);
          // console.log(`   Category string: ${categoryString}`);
          // console.log(
          //   `   publisherRevenue will be: cpi=${
          //     parseFloat(offer.cpi) || 0
          //   }, value=${parseFloat(offer.value) || 0}`
          // );
          // console.log(
          //   `   bitlabsData will store: cpi=${parseFloat(offer.cpi) || 0}, cr=${
          //     parseFloat(offer.cr) || 0
          //   }, loi=${parseFloat(offer.loi) || offer.estimatedTime || 0}`
          // );
        }

        // Store ALL normalized offer fields in the same format
        // For cashback: Preserve exact Bitlabs API structure in metadata

        const offerData = {
          sdkId: bitlabSDK._id,
          externalId: externalId,
          title: isCashback
            ? normalizedOffer.merchant_name || "Untitled Cashback"
            : isMagicReceipt || isShopping
            ? normalizedOffer.anchor ||
              normalizedOffer.product_name ||
              (isMagicReceipt ? "Untitled Magic Receipt" : "Untitled Shopping")
            : normalizedOffer.title || normalizedOffer.name || "Untitled Offer",
          description: normalizedOffer.description || "",
          category: categoryString, // Store as string (enum value) - MUST be one of: finance, shopping, entertainment, technology, health, travel, education, other
          offerType: normalizedOffer.offerType || defaultOfferType,
          coinReward: coinReward, // User reward coins (20% of value)
          estimatedTime: isCashback
            ? 1 // Cashback doesn't have estimated time, but model requires min 1
            : isMagicReceipt || isShopping
            ? Math.max(
                1,
                Math.round((normalizedOffer.session_hours || 0) / 60) ||
                  normalizedOffer.estimatedTime ||
                  1
              ) // Ensure minimum of 1
            : Math.max(
                1,
                normalizedOffer.estimatedTime ||
                  normalizedOffer.duration ||
                  normalizedOffer.loi ||
                  5
              ), // Ensure minimum of 1
          status: autoActivate ? "live" : "paused",
          targetAudience: {
            age:
              selectedAges.length === 0 || selectedAges.includes("all")
                ? [] // Empty array means all ages
                : selectedAges.filter((a) => a !== "all"),
            gender:
              selectedGenders.length === 0 || selectedGenders.includes("all")
                ? [] // Empty array means all genders
                : selectedGenders.filter((g) => g !== "all"),
            countries: isCashback
              ? normalizedOffer.country_code
                ? [normalizedOffer.country_code]
                : []
              : isMagicReceipt || isShopping
              ? normalizedOffer.country_code
                ? [normalizedOffer.country_code]
                : []
              : normalizedOffer.countries || normalizedOffer.country
              ? [normalizedOffer.country]
              : [],
            minXP: normalizedOffer.minXP || 0,
          },
          metadata: {
            // Store all normalized offer fields in the same format
            // ⚠️ IMPORTANT: externalUrl is stored for REFERENCE ONLY (applies to ALL offer types).
            //
            // INDUSTRIAL-LEVEL BEST PRACTICE (Based on Bitlabs Official Documentation):
            // - Click URLs are user-specific and contain session IDs linked to X-User-Id
            // - URLs expire and cannot be reused across users
            // - When users fetch offers (surveys, cashback, magic receipts, shopping),
            //   fresh URLs MUST be generated with their X-User-Id
            // - This ensures proper tracking: Bitlabs knows which user clicked/completed
            // - Callbacks will include correct userId matching the user who clicked
            //
            // Implementation:
            // - Admin sync stores offer ID (externalId) + metadata (title, reward, etc.)
            // - User fetch calls Bitlabs API with user's X-User-Id to get fresh URLs
            // - See: /api/non-game-offers/* routes for user-side implementation
            // - Applies to: surveys, cashback, magic receipts, shopping offers
            //
            // Reference: BITLABS_INDUSTRIAL_SOLUTION.md
            externalUrl:
              normalizedOffer.clickUrl ||
              normalizedOffer.surveyUrl ||
              normalizedOffer.url ||
              normalizedOffer.click_url ||
              "",
            surveyUrl:
              normalizedOffer.surveyUrl || normalizedOffer.clickUrl || "",
            deepLink: normalizedOffer.deepLink || "",
            supportUrl: normalizedOffer.supportUrl || "",
            thumbnail: isCashback
              ? normalizedOffer.images?.cardImage || ""
              : isMagicReceipt || isShopping
              ? normalizedOffer.creatives?.icon ||
                normalizedOffer.icon_url ||
                normalizedOffer.icon ||
                ""
              : normalizedOffer.icon || normalizedOffer.banner,
            priority: normalizedOffer.priority || 0,

            // Store complete reward object
            reward: normalizedOffer.reward || null,

            // User reward fields (calculated with 20% margin)
            userRewardCoins: userRewardCoins, // User gets 20% of value as coins
            userRewardXP: userRewardXP, // User gets 50% of coins as XP

            // Store publisher revenue data (cpi = USD payment, value = points received)
            publisherRevenue: {
              cpi: parseFloat(normalizedOffer.cpi) || 0, // USD payment from Bitlabs
              value: publisherValue, // Full value from Bitlabs (what publisher receives)
              currency: "USD",
            },

            // For cashback and magic receipts: Store complete raw Bitlabs API structure
            // For surveys: Store normalized Bitlabs fields
            ...(isCashback
              ? {
                  // CASHBACK: Store exact Bitlabs API structure (same keys and values)
                  rawBitlabsData: {
                    cashback: normalizedOffer.cashback || "0",
                    click_url: normalizedOffer.click_url || "",
                    country_code: normalizedOffer.country_code || "",
                    currency: normalizedOffer.currency || "USD",
                    description: normalizedOffer.description || "",
                    flat_payout: normalizedOffer.flat_payout || false,
                    images: normalizedOffer.images || {},
                    merchant_id: normalizedOffer.merchant_id || 0,
                    merchant_name: normalizedOffer.merchant_name || "",
                    original_cashback: normalizedOffer.original_cashback || "0",
                    primary_category: normalizedOffer.primary_category || "",
                    rank: normalizedOffer.rank || 0,
                    reward_delay_days: normalizedOffer.reward_delay_days || 0,
                    terms: normalizedOffer.terms || [],
                    tier_mappings: normalizedOffer.tier_mappings || [],
                    up_to: normalizedOffer.up_to || false,
                  },
                }
              : isMagicReceipt || isShopping
              ? {
                  // MAGIC RECEIPTS & SHOPPING: Store exact Bitlabs API structure (same keys and values)
                  rawBitlabsData: {
                    anchor: normalizedOffer.anchor || "",
                    app_metadata: normalizedOffer.app_metadata || {},
                    categories: normalizedOffer.categories || [],
                    click_url: normalizedOffer.click_url || "",
                    confirmation_time: normalizedOffer.confirmation_time || "",
                    creatives: normalizedOffer.creatives || {},
                    description: normalizedOffer.description || "",
                    disclaimer: normalizedOffer.disclaimer || "",
                    epc: normalizedOffer.epc || "0",
                    events: normalizedOffer.events || [],
                    funnel_id: normalizedOffer.funnel_id || "",
                    icon_url: normalizedOffer.icon_url || "",
                    id: normalizedOffer.id || 0,
                    impression_url: normalizedOffer.impression_url || "",
                    is_game: normalizedOffer.is_game || false,
                    is_sticky: normalizedOffer.is_sticky || false,
                    lowest_cap_left: normalizedOffer.lowest_cap_left || null,
                    mobile_verification_required:
                      normalizedOffer.mobile_verification_required || false,
                    offer_expires_at: normalizedOffer.offer_expires_at || null,
                    pending_time: normalizedOffer.pending_time || 0,
                    product_id: normalizedOffer.product_id || "",
                    product_name: normalizedOffer.product_name || "",
                    requirements: normalizedOffer.requirements || "",
                    session_hours: normalizedOffer.session_hours || 0,
                    stats: normalizedOffer.stats || {},
                    support_url: normalizedOffer.support_url || "",
                    things_to_know: normalizedOffer.things_to_know || [],
                    total_points: normalizedOffer.total_points || "0",
                    web_to_mobile: normalizedOffer.web_to_mobile || false,
                    web_to_mobile_devices:
                      normalizedOffer.web_to_mobile_devices || [],
                  },
                }
              : {
                  // SURVEYS: Preserve ALL Bitlabs fields in the same format
                  bitlabsData: {
                    // Core Bitlabs fields - ensure proper parsing (preserve 0 values)
                    cpi:
                      normalizedOffer.cpi !== undefined &&
                      normalizedOffer.cpi !== null
                        ? parseFloat(normalizedOffer.cpi)
                        : 0, // Cost per install (USD payment to publisher)
                    cr:
                      normalizedOffer.cr !== undefined &&
                      normalizedOffer.cr !== null
                        ? parseFloat(normalizedOffer.cr)
                        : 0, // Conversion rate (0-1, e.g., 0.078 = 7.8%)
                    loi:
                      normalizedOffer.loi !== undefined &&
                      normalizedOffer.loi !== null
                        ? parseFloat(normalizedOffer.loi)
                        : normalizedOffer.estimatedTime || 0, // Length of interview (minutes)
                    value: publisherValue, // Full value from Bitlabs (what publisher receives)
                    rating: normalizedOffer.rating || 0, // Survey rating
                    country: normalizedOffer.country || null, // Survey country
                    language: normalizedOffer.language || null, // Survey language
                    tags: normalizedOffer.tags || [], // Survey tags

                    // Additional normalized fields
                    estimatedTime: normalizedOffer.estimatedTime || 0,
                    confirmationTime: normalizedOffer.confirmationTime || "",
                    pendingTime: normalizedOffer.pendingTime || 0,
                    offerExpiresAt: normalizedOffer.offerExpiresAt || null,
                    sessionHours: normalizedOffer.sessionHours || 0,
                    isSticky: normalizedOffer.isSticky || false,
                    isAvailable: normalizedOffer.isAvailable !== false,
                    mobileVerificationRequired:
                      normalizedOffer.mobileVerificationRequired || false,
                    webToMobile: normalizedOffer.webToMobile || false,
                    webToMobileDevices:
                      normalizedOffer.webToMobileDevices || [],
                    thingsToKnow: normalizedOffer.thingsToKnow || [],
                    requirements: normalizedOffer.requirements || "",
                    provider: normalizedOffer.provider || "bitlabs",
                    sdkProvider: normalizedOffer.sdkProvider || "bitlabs",
                  },

                  // Store complete normalized offer for reference (all fields)
                  normalizedOffer: normalizedOffer, // Store the complete normalized object
                }),
          },
          updatedBy: req.user.userId,
        };

        if (existing) {
          // Update existing
          console.log(
            `🔄 [ADMIN BACKEND SYNC] Updating existing ${offer.offerType} offer:`,
            externalId
          );
          Object.assign(existing, offerData);
          await existing.save();
          updatedCount++;
          console.log(
            `✅ [ADMIN BACKEND SYNC] Updated ${offer.offerType} offer:`,
            externalId
          );
        } else {
          // Create new
          console.log(
            `➕ [ADMIN BACKEND SYNC] Creating new ${offer.offerType} offer:`,
            externalId
          );
          const newOffer = new OfferModel({
            ...offerData,
            createdBy: req.user.userId,
          });
          await newOffer.save();
          syncedCount++;
          console.log(
            `✅ [ADMIN BACKEND SYNC] Created ${offer.offerType} offer:`,
            externalId
          );
        }
      } catch (error) {
        console.error(
          `❌ [ADMIN BACKEND SYNC] Error saving ${offer.offerType} offer:`,
          {
            externalId:
              offer.id || offer.surveyId || offer.offerId || offer.externalId,
            error: error.message,
            stack: error.stack,
          }
        );
        errors.push({
          offerId: offer.id || offer.surveyId,
          error: error.message,
        });
      }
    }

    // Update SDK analytics
    bitlabSDK.analytics.totalOffers = syncedCount + updatedCount;
    bitlabSDK.analytics.lastSyncAt = new Date();
    await bitlabSDK.save();

    // console.log("🔵 [ADMIN BACKEND SYNC] Sync completed:", {
    //   syncedCount,
    //   updatedCount,
    //   skippedCount,
    //   errorCount: errors.length,
    //   totalProcessed: offersToSync.length,
    //   errors: errors.length > 0 ? errors.slice(0, 5) : "None",
    // });

    res.json({
      success: true,
      message: "Offers synced successfully",
      data: {
        syncedCount,
        updatedCount,
        skippedCount,
        errorCount: errors.length,
        totalProcessed: offersToSync.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error syncing BitLab offers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync offers",
      error: error.message,
    });
  }
});

/**
 * Seed games from segments JSON structure
 * POST /api/admin/game-offers/seed-games
 * Body: {
 *   segments: { gender -> ageRange -> uiSection -> [titles] },
 *   region: 'US',
 *   device: 'android'
 * }
 */
router.post("/seed-games", adminAuth, async (req, res) => {
  try {
    const { segments, region = "US", device = "android" } = req.body;

    if (!segments || typeof segments !== "object") {
      return res.status(400).json({
        success: false,
        message: "segments object is required in request body",
      });
    }

    const besitosService = require("../services/besitos.service");

    // Helper to normalize titles for matching
    const normalizeTitle = (title = "") => {
      return String(title)
        .toLowerCase()
        .replace(/®|\u00ae/g, "")
        .replace(/[^a-z0-9\s:-]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const stripHtml = (html = "") => {
      return String(html)
        .replace(/<[^>]*>/g, "")
        .trim();
    };

    // Fetch all Besitos offers once
    console.log(`Fetching Besitos offers for ${device}/${region}...`);
    let offersPayload;
    try {
      offersPayload = await besitosService.getOffers({
        platform: device === "ios" ? "iOS" : "Android",
        country: region,
      });
    } catch (e) {
      console.error("Failed to fetch Besitos offers:", e);
      return res.status(503).json({
        success: false,
        message: "Failed to fetch offers from Besitos API",
        error: e.message || "Service unavailable",
      });
    }

    const offers = Array.isArray(offersPayload?.data) ? offersPayload.data : [];
    if (offers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No offers found from Besitos API",
      });
    }

    console.log(`Found ${offers.length} Besitos offers`);

    // Build a normalized lookup map
    const offerMap = new Map();
    offers.forEach((offer) => {
      const norm = normalizeTitle(offer.title || offer.name);
      if (norm) {
        offerMap.set(norm, offer);
      }
    });

    // Process segments
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      matched: [],
      unmatched: [],
    };

    for (const [genderKey, ageRanges] of Object.entries(segments)) {
      const gender = normalizeGender(genderKey);

      for (const [ageRangeKey, uiSections] of Object.entries(ageRanges)) {
        for (const [uiSectionKey, titles] of Object.entries(uiSections)) {
          if (!Array.isArray(titles)) continue;

          for (const title of titles) {
            const norm = normalizeTitle(title);
            const external = offerMap.get(norm);

            if (!external) {
              results.unmatched.push({
                title,
                gender,
                ageRange: ageRangeKey,
                uiSection: uiSectionKey,
              });
              results.skipped++;
              continue;
            }

            results.matched.push({ title, gameId: external.id });

            // Build game data
            const gameData = {
              gameId: external.id,
              title: external.title || external.name || title,
              description:
                stripHtml(external.description || "") ||
                "No description available",
              category:
                Array.isArray(external.categories) &&
                external.categories[0]?.name
                  ? external.categories[0].name
                  : external.category || "General",

              sdkProvider: "besitos",
              countries: [region],
              xptrRules: "default",
              platform: device === "ios" ? "iOS" : "Android",
              status: "active",

              rewards: {
                coins: 50,
                xp: 100,
              },

              metadata: {
                genre:
                  Array.isArray(external.categories) &&
                  external.categories[0]?.name
                    ? external.categories[0].name
                    : external.category || "General",
                thumbnail: {
                  url:
                    external.large_image ||
                    external.image ||
                    external.square_image ||
                    "",
                  dimensions: { width: 512, height: 512 },
                  altText: `${external.title || title} thumbnail`,
                },
                images: {
                  icon: external.square_image || external.image || "",
                  banner: external.large_image || external.image || "",
                  screenshots: [],
                },
                packageName: external.bundle_id || "",
                developer: "",
                rating: 4.0,
                downloads: "1M+",
                size: "",
                version: "",
                lastUpdated: new Date(),
                ageRating: "12+",
              },

              gameDetails: {
                id: external.id || "",
                name: external.title || external.name || title,
                description: stripHtml(external.description || ""),
                image: external.image || external.large_image || "",
                square_image: external.square_image || "",
                large_image: external.large_image || external.image || "",
                category:
                  Array.isArray(external.categories) &&
                  external.categories[0]?.name
                    ? external.categories[0].name
                    : external.category || "",
                downloadUrl: external.url || "",
              },

              // Store complete raw data from Besitos API
              besitosRawData: external,

              uiSection: normalizeSegmentValue(uiSectionKey),
              gender: gender,
              ageGroup: normalizeSegmentValue(ageRangeKey),
              ageGroups: [normalizeSegmentValue(ageRangeKey)],
              createdBy: req.user.userId,
            };

            try {
              // Atomic upsert by (gameId, gender, uiSection, ageGroup)
              const filter = {
                gameId: external.id,
                gender: gender,
                uiSection: normalizeSegmentValue(uiSectionKey),
                ageGroup: normalizeSegmentValue(ageRangeKey),
              };
              const update = {
                $set: {
                  // mutable/always-updated fields
                  title: gameData.title,
                  description: gameData.description,
                  category: gameData.category,
                  sdkProvider: gameData.sdkProvider,
                  // Countries field removed
                  xptrRules: gameData.xptrRules,
                  platform: gameData.platform,
                  status: gameData.status,
                  rewards: gameData.rewards,
                  metadata: gameData.metadata,
                  gameDetails: gameData.gameDetails,
                  // Store complete raw data from Besitos API
                  besitosRawData: gameData.besitosRawData,
                  uiSection: normalizeSegmentValue(uiSectionKey),
                  gender: gender,
                  ageGroup: normalizeSegmentValue(ageRangeKey),
                  ageGroups: [normalizeSegmentValue(ageRangeKey)],
                },
                $setOnInsert: {
                  createdBy: req.user.userId,
                },
              };
              const result = await Game.updateOne(filter, update, {
                upsert: true,
              });
              if (result.upsertedCount && result.upsertedCount > 0) {
                results.created++;
              } else if (result.modifiedCount && result.modifiedCount > 0) {
                results.updated++;
              } else {
                // Matched but no changes (already up-to-date)
                results.skipped++;
              }
            } catch (err) {
              console.error(
                `Error upserting game ${external.id}:`,
                err.message
              );
              results.errors.push({
                title,
                gameId: external.id,
                error: err.message,
              });
            }
          }
        }
      }
    }

    console.log("Seed complete:", results);

    res.json({
      success: true,
      message: "Game seeding completed",
      data: {
        summary: {
          totalProcessed: results.created + results.updated + results.skipped,
          created: results.created,
          updated: results.updated,
          skipped: results.skipped,
          errors: results.errors.length,
        },
        matched: results.matched.length,
        unmatched: results.unmatched,
        errors: results.errors,
      },
    });
  } catch (error) {
    console.error("Error seeding games:", error);
    res.status(500).json({
      success: false,
      message: "Failed to seed games",
      error: error.message,
    });
  }
});

module.exports = router;

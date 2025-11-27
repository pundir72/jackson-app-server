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
    } = req.query;

    let query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
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
    console.log({ id });
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

// Create new game with file uploads
router.post(
  "/games",
  adminAuth,
  upload.fields([{ name: "gameThumbnail", maxCount: 1 }]),
  async (req, res) => {
    try {
      // Fetch external details based on SDK provider
      const sdkProvider = req.body.sdkProvider || "besitos";
      let external = null;

      if (sdkProvider === "besitos") {
        req.query.offer_id = req.body.gameId;
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
          !ext ||
          ext.success !== true ||
          !Array.isArray(ext.data) ||
          ext.data.length === 0
        ) {
          return res.status(404).json({
            success: false,
            message:
              "External game not found for the provided gameId in Besitos",
            error: "EXTERNAL_GAME_NOT_FOUND",
          });
        }
        external = ext.data[0];
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

        console.log(`Looking for Bitlabs game with ID: ${gameIdToFind}`);

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
            console.log(`Trying query: ${JSON.stringify(queryParams)}`);
            offers = await bitlabsOfferCache.getOffers(queryParams);
            console.log(
              `Found ${offers.length} offers with query: ${JSON.stringify(
                queryParams
              )}`
            );

            // Search in current offers
            external = offers.find(matchesGameId);

            if (external) {
              console.log(
                `✅ Found game in Bitlabs: ${JSON.stringify({
                  id: external.id,
                  gameId: external.gameId,
                  title: external.title,
                })}`
              );
              found = true;
              break;
            }

            // If not found, try refreshing cache for this query
            console.log(
              `Game not found in cache, refreshing for query: ${JSON.stringify(
                queryParams
              )}`
            );
            const refreshedOffers = await bitlabsOfferCache.refreshOffers(
              queryParams
            );
            console.log(`Refreshed ${refreshedOffers.length} offers`);

            external = refreshedOffers.find(matchesGameId);

            if (external) {
              console.log(
                `✅ Found game after refresh: ${JSON.stringify({
                  id: external.id,
                  gameId: external.gameId,
                  title: external.title,
                })}`
              );
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

      const gameData = {
        gameId: req.body.gameId,
        title: req.body.title,
        description: req.body.description,
        sdkProvider: req.body.sdkProvider,
        countries: parsedCountries,
        xptrRules: req.body.xptrRules,
        rewards: {
          xp: req.body.rewardXP ? parseFloat(req.body.rewardXP) : 0,
          coins: req.body.rewardCoins ? parseFloat(req.body.rewardCoins) : 0,
        },
        defaultTaskCount: req.body.defaultTaskCount
          ? parseInt(req.body.defaultTaskCount)
          : 0,
        xpTier: req.body.xpTier ? parseInt(req.body.xpTier) : 1,
        isDefaultFallback: req.body.isDefaultFallback === "true",
        ageGroups: parsedAgeGroups,
        gender: targetGender,
        marketingChannel: req.body.marketingChannel,
        campaignName: req.body.campaignName,
        tierRestrictions: {
          minTier: req.body.tier || "free",
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
      const update = {
        $set: {
          title: gameData.title,
          description: gameData.description,
          sdkProvider: gameData.sdkProvider,
          countries: gameData.countries,
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
        },
        $setOnInsert: {
          createdBy: req.user.userId,
        },
      };

      const upserted = await Game.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
      });

      res.status(201).json({
        success: true,
        message: "Game created/updated successfully",
        data: upserted,
      });
    } catch (error) {
      console.error("Error creating game:", error);

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
      const { id } = req.params;

      // Find existing game
      const existingGame = await Game.findById(id);
      if (!existingGame) {
        return res.status(404).json({
          success: false,
          message: "Game not found",
        });
      }

      // Build update data
      const updateData = {
        updatedBy: req.user.userId,
        updatedAt: new Date(),
      };

      // Update basic fields if provided
      if (req.body.gameId) updateData.gameId = req.body.gameId;
      if (req.body.title) updateData.title = req.body.title;
      if (req.body.description) updateData.description = req.body.description;
      if (req.body.sdkProvider) updateData.sdkProvider = req.body.sdkProvider;
      if (req.body.countries)
        updateData.countries = JSON.parse(req.body.countries);
      if (req.body.xptrRules) updateData.xptrRules = req.body.xptrRules;
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
      if (req.body.defaultTaskCount)
        updateData.defaultTaskCount = parseInt(req.body.defaultTaskCount);
      if (req.body.isActive !== undefined)
        updateData.isActive = req.body.isActive === "true";
      if (req.body.isDefaultFallback !== undefined)
        updateData.isDefaultFallback = req.body.isDefaultFallback === "true";
      if (req.body.isAdSupported !== undefined)
        updateData.isAdSupported = req.body.isAdSupported === "true";

      // Update rewards
      if (req.body.rewardXP || req.body.rewardCoins) {
        updateData.rewards = {
          xp: req.body.rewardXP
            ? parseFloat(req.body.rewardXP)
            : existingGame.rewards?.xp || 0,
          coins: req.body.rewardCoins
            ? parseFloat(req.body.rewardCoins)
            : existingGame.rewards?.coins || 0,
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

      const game = await Game.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      });

      res.json({
        success: true,
        message: "Game updated successfully",
        data: game,
      });
    } catch (error) {
      console.error("Error updating game:", error);

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
    const { page = 1, limit = 100, search = "", excludeBonus = "false" } = req.query;

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
        'gameBonusTasks.gameId': gameId,
        'gameBonusTasks.isEnabled': true
      });
      
      if (rule) {
        const gameBonusConfig = rule.gameBonusTasks.find(
          config => config.gameId.toString() === gameId && config.isEnabled
        );
        
        if (gameBonusConfig && gameBonusConfig.bonusTasks.length > 0) {
          const bonusTaskIds = gameBonusConfig.bonusTasks.map(bt => bt.taskId);
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
    const user = await User.findById(req.user.userId).select('role email firstName lastName');
    res.json({
      success: true,
      message: "Admin access confirmed",
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error checking admin access",
      error: error.message
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
        .populate('xpTier', 'tierName xpMin xpMax')
        .populate('createdBy', 'firstName lastName email')
        .populate('updatedBy', 'firstName lastName email')
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      GameDisplayRule.countDocuments()
    ]);

    // Add status label to each rule
    const rulesWithStatus = rules.map(rule => ({
      ...rule,
      status: rule.isEnabled ? 'Active' : 'Inactive'
    }));

    res.json({
      success: true,
      data: rulesWithStatus,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
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
      .populate('xpTier', 'tierName xpMin xpMax tierColor bgColor borderColor')
      .populate('createdBy', 'firstName lastName email')
      .populate('updatedBy', 'firstName lastName email');

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
        status: rule.isEnabled ? 'Active' : 'Inactive'
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
    body("userMilestones").isArray({ min: 1 }).withMessage("At least one user milestone is required"),
    body("userMilestones.*").isIn(['first_time_user', 'returning_user', 'xp_tier', 'membership_tier']).withMessage("Invalid milestone type"),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        if (req.body.userMilestones && req.body.userMilestones.includes('xp_tier') && !value) {
          throw new Error('XP Tier is required when "XP Tier" milestone is selected');
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .custom((value, { req }) => {
        if (req.body.userMilestones && req.body.userMilestones.includes('membership_tier') && !value) {
          throw new Error('Membership Tier is required when "Membership Tier" milestone is selected');
        }
        return true;
      }),
    body("maxGamesToShow")
      .isNumeric()
      .withMessage("Max games to show must be numeric"),
    body("isEnabled").optional().isBoolean().withMessage("Enabled status must be boolean"),
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

      const ruleData = {
        ...req.body,
        createdBy: req.user.userId,
      };

      // Check for duplicate rule
      const duplicate = await GameDisplayRule.findDuplicate(ruleData);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A rule with these conditions already exists.",
          duplicateRuleId: duplicate._id,
          duplicateRule: duplicate,
          shouldRedirectToEdit: true
        });
      }

      const rule = new GameDisplayRule(ruleData);
      await rule.save();

      // Populate references for response
      await rule.populate('xpTier', 'tierName xpMin xpMax');
      await rule.populate('createdBy', 'firstName lastName email');

      res.status(201).json({
        success: true,
        message: "Display rule created successfully",
        data: {
          ...rule.toObject(),
          status: rule.isEnabled ? 'Active' : 'Inactive'
        },
      });
    } catch (error) {
      // Handle unique constraint violation (duplicate ruleName)
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message: "A rule with this name already exists.",
          error: "Duplicate rule name"
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
    body("ruleName").optional().trim().notEmpty().withMessage("Rule name cannot be empty"),
    body("userMilestones").optional().isArray({ min: 1 }).withMessage("At least one user milestone is required"),
    body("userMilestones.*").optional().isIn(['first_time_user', 'returning_user', 'xp_tier', 'membership_tier']).withMessage("Invalid milestone type"),
    body("xpTier")
      .optional()
      .custom((value, { req }) => {
        const milestones = req.body.userMilestones;
        if (milestones && milestones.includes('xp_tier') && !value) {
          throw new Error('XP Tier is required when "XP Tier" milestone is selected');
        }
        return true;
      }),
    body("membershipTier")
      .optional()
      .custom((value, { req }) => {
        const milestones = req.body.userMilestones;
        if (milestones && milestones.includes('membership_tier') && !value) {
          throw new Error('Membership Tier is required when "Membership Tier" milestone is selected');
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
      const finalMilestones = updateData.userMilestones || existingRule.userMilestones;
      
      // Clear conditional fields if their milestones are removed
      if (finalMilestones && !finalMilestones.includes('xp_tier')) {
        updateData.xpTier = null;
      }
      if (finalMilestones && !finalMilestones.includes('membership_tier')) {
        updateData.membershipTier = null;
      }

      // Check for duplicate rule (excluding current rule)
      const ruleDataForCheck = {
        ...existingRule.toObject(),
        ...updateData,
        userMilestones: finalMilestones,
        xpTier: updateData.xpTier !== undefined ? updateData.xpTier : (finalMilestones.includes('xp_tier') ? existingRule.xpTier : null),
        membershipTier: updateData.membershipTier !== undefined ? updateData.membershipTier : (finalMilestones.includes('membership_tier') ? existingRule.membershipTier : null),
        segmentOverrides: updateData.segmentOverrides !== undefined ? updateData.segmentOverrides : existingRule.segmentOverrides
      };

      const duplicate = await GameDisplayRule.findDuplicate(ruleDataForCheck, id);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A rule with these conditions already exists.",
          duplicateRuleId: duplicate._id,
          duplicateRule: duplicate,
          shouldRedirectToEdit: true
        });
      }

      const rule = await GameDisplayRule.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).populate('xpTier', 'tierName xpMin xpMax')
        .populate('updatedBy', 'firstName lastName email');

      res.json({
        success: true,
        message: "Display rule updated successfully",
        data: {
          ...rule.toObject(),
          status: rule.isEnabled ? 'Active' : 'Inactive'
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

    if (confirm !== 'true') {
      return res.status(400).json({
        success: false,
        message: "Deletion requires confirmation. Add ?confirm=true to the URL.",
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
        ruleName: rule.ruleName
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

// Get task progression rule for a specific game
router.get("/progression-rules/game/:gameId", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;

    const rule = await TaskProgressionRule.findByGame(gameId)
      .populate('gameId', 'title gameId')
      .populate('postThresholdTasks.taskId', 'name description completionRule rewardType rewardValue order')
      .lean();

    if (!rule) {
      return res.json({
        success: true,
        data: null,
        message: "No progression rule configured for this game"
      });
    }

    // Format response
    const formattedData = {
      gameId: rule.gameId._id || rule.gameId,
      gameTitle: rule.gameId.title || null,
      gameGameId: rule.gameId.gameId || null,
      minimumEventThreshold: rule.minimumEventThreshold,
      postThresholdTasks: rule.postThresholdTasks
        .filter(pt => pt.isEnabled)
        .sort((a, b) => a.order - b.order)
        .map(pt => ({
          taskId: pt.taskId._id || pt.taskId,
          order: pt.order,
          name: pt.taskId.name || null,
          description: pt.taskId.description || null,
          completionRule: pt.taskId.completionRule || null,
          rewardType: pt.taskId.rewardType || null,
          rewardValue: pt.taskId.rewardValue || null,
          requiredXpTier: pt.requiredXpTier,
          requiredMembershipTier: pt.requiredMembershipTier,
          isEnabled: pt.isEnabled
        })),
      isActive: rule.isActive,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    };

    res.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error("Error getting progression rule for game:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get progression rule",
      error: error.message,
    });
  }
});

// Create or update task progression rule for a game
router.post(
  "/progression-rules/game/:gameId",
  adminAuth,
  [
    body("minimumEventThreshold")
      .isInt({ min: 1 })
      .withMessage("Minimum event threshold must be at least 1"),
    body("postThresholdTasks")
      .optional()
      .isArray()
      .withMessage("Post threshold tasks must be an array"),
    body("postThresholdTasks.*.taskId")
      .optional()
      .isMongoId()
      .withMessage("Invalid task ID"),
    body("postThresholdTasks.*.order")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Order must be at least 1"),
    body("postThresholdTasks.*.requiredXpTier")
      .optional()
      .isIn(['junior', 'mid', 'senior', null])
      .withMessage("Invalid XP tier"),
    body("postThresholdTasks.*.requiredMembershipTier")
      .optional()
      .isIn(['bronze', 'gold', 'platinum', null])
      .withMessage("Invalid membership tier"),
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
      const { minimumEventThreshold, postThresholdTasks = [] } = req.body;

      // Verify game exists
      const game = await Game.findById(gameId);
      if (!game) {
        return res.status(404).json({
          success: false,
          message: "Game not found",
        });
      }

      // Validate post threshold tasks if provided
      if (postThresholdTasks.length > 0) {
        // Check for duplicate task IDs
        const taskIds = postThresholdTasks.map(pt => pt.taskId.toString());
        const uniqueTaskIds = [...new Set(taskIds)];
        if (taskIds.length !== uniqueTaskIds.length) {
          return res.status(400).json({
            success: false,
            message: "Duplicate task IDs are not allowed",
          });
        }

        // Validate that all task IDs exist and belong to this game
        const existingTasks = await GameTask.find({
          _id: { $in: taskIds },
          gameId: gameId
        });

        if (existingTasks.length !== taskIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more task IDs are invalid or do not belong to this game",
          });
        }
      }

      // Find or create rule
      let rule = await TaskProgressionRule.findByGame(gameId);

      if (rule) {
        // Update existing rule
        rule.minimumEventThreshold = minimumEventThreshold;
        rule.postThresholdTasks = postThresholdTasks.map(pt => ({
          taskId: pt.taskId,
          order: pt.order,
          requiredXpTier: pt.requiredXpTier || null,
          requiredMembershipTier: pt.requiredMembershipTier || null,
          isEnabled: pt.isEnabled !== undefined ? pt.isEnabled : true
        }));
        rule.updatedBy = req.user.userId;
        rule.updatedAt = new Date();
      } else {
        // Create new rule
        rule = new TaskProgressionRule({
          gameId: gameId,
          minimumEventThreshold: minimumEventThreshold,
          postThresholdTasks: postThresholdTasks.map(pt => ({
            taskId: pt.taskId,
            order: pt.order,
            requiredXpTier: pt.requiredXpTier || null,
            requiredMembershipTier: pt.requiredMembershipTier || null,
            isEnabled: pt.isEnabled !== undefined ? pt.isEnabled : true
          })),
          createdBy: req.user.userId,
        });
      }

      // Validate configuration
      if (!rule.isValidConfiguration()) {
        return res.status(400).json({
          success: false,
          message: "Invalid configuration. Please check your post threshold tasks setup.",
        });
      }

      await rule.save();

      // Populate before returning
      await rule.populate('gameId', 'title gameId');
      await rule.populate('postThresholdTasks.taskId', 'name description completionRule rewardType rewardValue order');

      // Format response
      const formattedData = {
        gameId: rule.gameId._id || rule.gameId,
        gameTitle: rule.gameId.title || null,
        gameGameId: rule.gameId.gameId || null,
        minimumEventThreshold: rule.minimumEventThreshold,
        postThresholdTasks: rule.postThresholdTasks
          .filter(pt => pt.isEnabled)
          .sort((a, b) => a.order - b.order)
          .map(pt => ({
            taskId: pt.taskId._id || pt.taskId,
            order: pt.order,
            name: pt.taskId.name || null,
            description: pt.taskId.description || null,
            completionRule: pt.taskId.completionRule || null,
            rewardType: pt.taskId.rewardType || null,
            rewardValue: pt.taskId.rewardValue || null,
            requiredXpTier: pt.requiredXpTier,
            requiredMembershipTier: pt.requiredMembershipTier,
            isEnabled: pt.isEnabled
          })),
        isActive: rule.isActive
      };

      res.json({
        success: true,
        message: rule.isNew ? "Progression rule created successfully" : "Progression rule updated successfully",
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

// Delete task progression rule for a game
router.delete("/progression-rules/game/:gameId", adminAuth, async (req, res) => {
  try {
    const { gameId } = req.params;
    const { confirm } = req.query;

    if (confirm !== "true") {
      return res.status(400).json({
        success: false,
        message: "Please confirm deletion by adding ?confirm=true to the URL",
      });
    }

    const rule = await TaskProgressionRule.findByGame(gameId);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "Progression rule not found for this game",
      });
    }

    rule.isActive = false;
    rule.updatedBy = req.user.userId;
    rule.updatedAt = new Date();
    await rule.save();

    res.json({
      success: true,
      message: "Progression rule deleted successfully",
      data: {
        id: rule._id,
        gameId: rule.gameId,
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
      .populate('gameBonusTasks.gameId', 'title gameId')
      .populate('gameBonusTasks.bonusTasks.taskId', 'name description completionRule rewardType rewardValue')
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
      'gameBonusTasks.gameId': gameId,
      'gameBonusTasks.isEnabled': true
    })
      .populate('gameBonusTasks.gameId', 'title gameId')
      .populate('gameBonusTasks.bonusTasks.taskId', 'name description completionRule rewardType rewardValue')
      .lean();

    if (!rule) {
      return res.json({
        success: true,
        data: null,
        message: "No bonus tasks configured for this game"
      });
    }

    const gameBonusConfig = rule.gameBonusTasks.find(
      config => config.gameId._id.toString() === gameId && config.isEnabled
    );

    if (!gameBonusConfig) {
      return res.json({
        success: true,
        data: null,
        message: "No bonus tasks configured for this game"
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
        .filter(bt => bt.isEnabled)
        .sort((a, b) => a.order - b.order)
        .map(bt => ({
          taskId: bt.taskId._id || bt.taskId,
          order: bt.order,
          name: bt.taskId.name || null,
          description: bt.taskId.description || null,
          completionRule: bt.taskId.completionRule || null,
          rewardType: bt.taskId.rewardType || null,
          rewardValue: bt.taskId.rewardValue || null,
          unlockCondition: bt.unlockCondition,
          isEnabled: bt.isEnabled
        })),
      isEnabled: gameBonusConfig.isEnabled
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
        if (req.body.gameOverrides !== undefined) {
          rule.gameOverrides = req.body.gameOverrides;
        }
        if (req.body.xpTierOverrides !== undefined) {
          rule.xpTierOverrides = req.body.xpTierOverrides;
        }
        rule.updatedBy = req.user.userId;
        rule.updatedAt = new Date();
      } else {
        rule = new WelcomeBonusTimer({
          unlockTimeHours: req.body.unlockTimeHours || 24,
          completionDeadlineDays: req.body.completionDeadlineDays || 7,
          gameOverrides: req.body.gameOverrides || [],
          xpTierOverrides: req.body.xpTierOverrides || [],
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
    body("bonusTasks")
      .isArray({ max: 3 })
      .withMessage("Maximum 3 bonus tasks allowed"),
    body("bonusTasks.*.taskId")
      .isMongoId()
      .withMessage("Invalid task ID"),
    body("bonusTasks.*.order")
      .isInt({ min: 1, max: 3 })
      .withMessage("Order must be between 1 and 3"),
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
      const { minimumEventThreshold, bonusTasks } = req.body;

      // Validate at least 1 task
      if (!bonusTasks || bonusTasks.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one bonus task is required",
        });
      }

      // Validate bonus tasks
      if (bonusTasks.length > 3) {
        return res.status(400).json({
          success: false,
          message: "Maximum 3 bonus tasks allowed",
        });
      }

      // Validate that order values are unique and sequential
      const orders = bonusTasks.map(bt => bt.order).sort();
      const expectedOrders = [1, 2, 3].slice(0, bonusTasks.length);
      if (JSON.stringify(orders) !== JSON.stringify(expectedOrders)) {
        return res.status(400).json({
          success: false,
          message: "Bonus tasks must have sequential order (1, 2, 3)",
        });
      }

      // Validate no duplicate task IDs
      const taskIdsForDuplicateCheck = bonusTasks.map(bt => bt.taskId);
      const uniqueTaskIds = [...new Set(taskIdsForDuplicateCheck.map(id => id.toString()))];
      if (taskIdsForDuplicateCheck.length !== uniqueTaskIds.length) {
        return res.status(400).json({
          success: false,
          message: "Duplicate task IDs are not allowed. Each task can only be selected once.",
        });
      }

      // Validate that all task IDs exist
      const taskIds = bonusTasks.map(bt => bt.taskId);
      const existingTasks = await GameTask.find({ 
        _id: { $in: taskIds },
        gameId: gameId
      });
      
      if (existingTasks.length !== taskIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more task IDs are invalid or do not belong to this game",
        });
      }

      // Find or create active rule
      let rule = await WelcomeBonusTimer.findOne({ isActive: true });
      
      if (!rule) {
        rule = new WelcomeBonusTimer({
          unlockTimeHours: 24,
          completionDeadlineDays: 7,
          createdBy: req.user.userId,
        });
      }

      // Find existing game bonus task configuration
      const existingGameIndex = rule.gameBonusTasks.findIndex(
        config => config.gameId.toString() === gameId
      );

      const bonusTasksData = bonusTasks.map(bt => ({
        taskId: bt.taskId,
        order: bt.order,
        unlockCondition: "Unlock this Bonus Task after Minimum Event Threshold is met.",
        isEnabled: true
      }));

      if (existingGameIndex >= 0) {
        // Update existing configuration
        rule.gameBonusTasks[existingGameIndex].minimumEventThreshold = minimumEventThreshold;
        rule.gameBonusTasks[existingGameIndex].bonusTasks = bonusTasksData;
        rule.gameBonusTasks[existingGameIndex].isEnabled = true;
        rule.gameBonusTasks[existingGameIndex].updatedAt = new Date();
      } else {
        // Add new configuration
        rule.gameBonusTasks.push({
          gameId: gameId,
          minimumEventThreshold: minimumEventThreshold,
          bonusTasks: bonusTasksData,
          isEnabled: true
        });
      }

      rule.updatedBy = req.user.userId;
      rule.updatedAt = new Date();

      // Validate configuration
      if (!rule.isValidConfiguration()) {
        return res.status(400).json({
          success: false,
          message: "Invalid configuration. Please check your bonus tasks setup.",
        });
      }

      await rule.save();

      // Populate before returning
      await rule.populate('gameBonusTasks.gameId', 'title gameId');
      await rule.populate('gameBonusTasks.bonusTasks.taskId', 'name description completionRule rewardType rewardValue');

      const gameBonusConfig = rule.gameBonusTasks.find(
        config => config.gameId._id.toString() === gameId
      );

      // Format response for frontend
      const formattedData = {
        gameId: gameBonusConfig.gameId._id || gameBonusConfig.gameId,
        gameTitle: gameBonusConfig.gameId.title || null,
        gameGameId: gameBonusConfig.gameId.gameId || null,
        minimumEventThreshold: gameBonusConfig.minimumEventThreshold,
        completionDeadlineHours: 24, // Fixed 24 hours
        taskLogic: "sequential", // Always sequential
        bonusTasks: gameBonusConfig.bonusTasks
          .filter(bt => bt.isEnabled)
          .sort((a, b) => a.order - b.order)
          .map(bt => ({
            taskId: bt.taskId._id || bt.taskId,
            order: bt.order,
            name: bt.taskId.name || null,
            description: bt.taskId.description || null,
            completionRule: bt.taskId.completionRule || null,
            rewardType: bt.taskId.rewardType || null,
            rewardValue: bt.taskId.rewardValue || null,
            unlockCondition: bt.unlockCondition,
            isEnabled: bt.isEnabled
          })),
        isEnabled: gameBonusConfig.isEnabled
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
        config => config.gameId.toString() === gameId
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
      { id: "silver", name: "Silver" },
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

      // Find BitLab SDK
      const bitlabSDK = await SurveySDK.findOne({
        name: { $regex: /bitlab/i },
      });

      if (!bitlabSDK) {
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

      // Build base query
      const baseQuery = {
        sdkId: bitlabSDK._id,
      };

      if (status !== "all") {
        baseQuery.status = status;
      }

      // Fetch from both models based on offerType
      let allOffers = [];

      if (offerType === "all" || offerType === "survey") {
        // Get surveys from SurveyOffer
        const surveyQuery = { ...baseQuery, offerType: "survey" };
        const surveys = await SurveyOffer.find(surveyQuery)
          .populate("sdkId", "name displayName")
          .sort({ createdAt: -1 })
          .lean();
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
        const nonGameOffers = await NonGameOffer.find(nonGameQuery)
          .populate("sdkId", "name displayName")
          .sort({ createdAt: -1 })
          .lean();
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
          configuredOffers: allOffers.map((offer) => ({
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
            metadata: offer.metadata,
            createdAt: offer.createdAt,
            updatedAt: offer.updatedAt,
          })),
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
        console.log(
          `🌍 Admin request: Using country "${country}" for non-game offers`
        );
      } else {
        console.log(
          `⚠️ Admin request: No country specified. Will default to "US" in utility function.`
        );
        console.log(
          `   To test with India-targeted offers, add ?country=IN to the request URL`
        );
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
        console.log(
          `📱 Admin request: Using platform "${
            userProfile.platform
          }" for devices: ${devicesArray.join(", ")}`
        );
      }

      // Get offers - also pass devices directly for general offers API
      const result = await bitlabsNonGames.getNonGameOffers({
        userId: "admin-preview",
        userProfile: userProfile,
        type: type || "all",
        category: "all",
        devices: queryParams.devices, // Pass devices for shopping/magic receipts
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error || "Failed to fetch non-game offers",
          data: [],
        });
      }

      res.json({
        success: true,
        data: result.offers,
        categorized: result.categorized,
        breakdown: result.breakdown,
        total: result.totalOffers,
        estimatedEarnings: result.estimatedEarnings,
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Non-game offers are only available from Bitlabs SDK.",
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
    } = req.body;

    // Build userProfile with country and device support
    // CRITICAL: Offers are often country-specific!
    const userProfile = {};
    if (country) {
      userProfile.country = country;
      console.log(
        `🌍 Sync request: Using country "${country}" for BitLabs offers`
      );
    } else {
      console.log(
        `⚠️ Sync request: No country specified. Will default to "US" in utility function.`
      );
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
      console.log(
        `📱 Sync request: Using platform "${
          userProfile.platform
        }" for devices: ${devicesArray.join(", ")}`
      );
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
      allOffers.push(
        ...(result.categorized.surveys || []).map((o) => ({
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
    const offersToSync =
      offerIds && offerIds.length > 0
        ? allOffers.filter((o) =>
            offerIds.includes(o.id || o.surveyId || o.offerId)
          )
        : allOffers;

    let syncedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];

    for (const offer of offersToSync) {
      try {
        const externalId =
          offer.id || offer.surveyId || offer.offerId || offer.externalId;
        if (!externalId) {
          skippedCount++;
          continue;
        }

        // Determine which model to use based on offer type
        const isSurvey = offer.offerType === "survey";
        const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;

        // Check if already exists
        const existing = await OfferModel.findOne({
          sdkId: bitlabSDK._id,
          externalId: externalId,
        });

        // Extract proper values from offer data
        let coinReward = 0;

        if (typeof offer.reward === "object") {
          // Try to get coins from reward object
          coinReward = offer.reward?.coins || 0;

          // If coins is 0, try to use payout field as fallback
          if (coinReward === 0 && offer.reward?.payout) {
            coinReward = parseFloat(offer.reward.payout) || 0;
          }
        } else {
          coinReward = offer.reward || 0;
        }

        const category =
          typeof offer.category === "object"
            ? offer.category?.name_internal || offer.category?.name || "other"
            : offer.category || "other";

        // Map category names to valid enum values
        const categoryMap = {
          General: "other",
          Other: "other",
          Finance: "finance",
          Shopping: "shopping",
          Entertainment: "entertainment",
          Technology: "technology",
          Health: "health",
          Travel: "travel",
          Education: "education",
        };
        const mappedCategory = categoryMap[category] || category.toLowerCase();

        // Allow offers with 0 coins to show raw API values
        // (Previously skipped offers with coinReward < 1)

        // Determine offer type - default based on which model we're using
        const defaultOfferType = isSurvey
          ? "survey"
          : offer.offerType || "other";

        const offerData = {
          sdkId: bitlabSDK._id,
          externalId: externalId,
          title: offer.title || offer.name || "Untitled Offer",
          description: offer.description || "",
          category: mappedCategory,
          offerType: offer.offerType || defaultOfferType,
          coinReward: coinReward,
          estimatedTime: offer.estimatedTime || offer.duration || 5,
          status: autoActivate ? "live" : "paused",
          targetAudience: {
            countries: offer.countries || [],
            minXP: offer.minXP || 0,
          },
          metadata: {
            externalUrl: offer.clickUrl || offer.surveyUrl || offer.url,
            thumbnail: offer.icon || offer.banner,
            priority: offer.priority || 0,
          },
          updatedBy: req.user.userId,
        };

        if (existing) {
          // Update existing
          Object.assign(existing, offerData);
          await existing.save();
          updatedCount++;
        } else {
          // Create new
          const newOffer = new OfferModel({
            ...offerData,
            createdBy: req.user.userId,
          });
          await newOffer.save();
          syncedCount++;
        }
      } catch (error) {
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
      const gender = genderKey.toLowerCase();

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

              uiSection: uiSectionKey,
              gender: gender,
              ageGroup: ageRangeKey,
              ageGroups: [ageRangeKey],
              createdBy: req.user.userId,
            };

            try {
              // Atomic upsert by (gameId, gender, uiSection, ageGroup)
              const filter = {
                gameId: external.id,
                gender: gender,
                uiSection: uiSectionKey,
                ageGroup: ageRangeKey,
              };
              const update = {
                $set: {
                  // mutable/always-updated fields
                  title: gameData.title,
                  description: gameData.description,
                  category: gameData.category,
                  sdkProvider: gameData.sdkProvider,
                  countries: gameData.countries,
                  xptrRules: gameData.xptrRules,
                  platform: gameData.platform,
                  status: gameData.status,
                  rewards: gameData.rewards,
                  metadata: gameData.metadata,
                  gameDetails: gameData.gameDetails,
                  uiSection: uiSectionKey,
                  gender: gender,
                  ageGroup: ageRangeKey,
                  ageGroups: [ageRangeKey],
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

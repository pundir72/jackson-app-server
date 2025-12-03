/**
 * Non-Game Offers Routes
 * Handles surveys, magic receipts, cashback, and shopping offers
 * @module routes/non-game-offers
 */

const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const bitlabsNonGames = require("../utils/bitlabs-non-games");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

// Helper function to calculate age from dateOfBirth or ageRange
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

// Helper function to get user age (from dateOfBirth or ageRange)
function getUserAge(user) {
  if (user.dateOfBirth) {
    const age = calculateAge(user.dateOfBirth);
    if (age !== null) return age;
  }
  // Fallback to ageRange if dateOfBirth is not available
  if (user.onboarding?.ageRange) {
    const ageRange = user.onboarding.ageRange;
    if (ageRange.includes("-")) {
      const [min, max] = ageRange.split("-").map(Number);
      return Math.floor((min + max) / 2); // Use midpoint as approximate age
    }
  }
  // Default fallback
  return 25;
}

// Helper function to get user gender
function getUserGender(user) {
  return user.onboarding?.gender || "other";
}

// Helper function to get admin-configured offers
async function getAdminConfiguredOffers(offerType, userProfile) {
  try {
    const SurveySDK = require("../models/SurveySDK");
    const SurveyOffer = require("../models/SurveyOffer");
    const NonGameOffer = require("../models/NonGameOffer");

    // Find BitLab SDK
    const bitlabSDK = await SurveySDK.findOne({ name: { $regex: /bitlab/i } });

    if (!bitlabSDK) {
      return [];
    }

    let allOffers = [];

    // Handle "all" type - fetch from both models
    if (offerType === "all") {
      // Fetch surveys from SurveyOffer
      const surveyQuery = {
        sdkId: bitlabSDK._id,
        offerType: "survey",
        status: "live",
      };
      const surveys = await SurveyOffer.find(surveyQuery)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      // Fetch non-gaming offers from NonGameOffer
      const nonGameQuery = {
        sdkId: bitlabSDK._id,
        status: "live",
      };
      const nonGameOffers = await NonGameOffer.find(nonGameQuery)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();

      allOffers = [...surveys, ...nonGameOffers];
    } else {
      // Determine which model to use based on offerType
      const isSurvey = offerType === "survey" || offerType === "surveys";
      const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;

      // Build query
      const query = {
        sdkId: bitlabSDK._id,
        status: "live",
      };

      if (!isSurvey) {
        // Map type for NonGameOffer (surveys handled separately)
        const typeMap = {
          cashback: "cashback",
          shopping: "shopping",
          magic_receipt: "magic_receipt",
          "magic-receipts": "magic_receipt",
          magicReceipts: "magic_receipt",
        };
        query.offerType = typeMap[offerType] || offerType;
      } else {
        query.offerType = "survey";
      }

      // Get configured offers
      allOffers = await OfferModel.find(query)
        .populate("sdkId", "name displayName")
        .sort({ createdAt: -1 })
        .lean();
    }

    // Filter by user eligibility
    const eligibleOffers = allOffers
      .filter((offer) => {
        // Determine which model to use for eligibility check
        const isSurvey = offer.offerType === "survey";
        const OfferModel = isSurvey ? SurveyOffer : NonGameOffer;
        const offerDoc = new OfferModel(offer);
        return offerDoc.isEligibleForUser(userProfile);
      })
      .map((offer) => {
        // Map to BitLab API format
        const mappedOffer = {
          id: offer.externalId,
          surveyId: offer.externalId,
          offerId: offer.externalId,
          title: offer.title,
          name: offer.title,
          description: offer.description || "",
          category: offer.category || "other",
          type: offer.offerType,
          icon: offer.metadata?.thumbnail || "",
          banner: offer.metadata?.thumbnail || "",
          reward: {
            coins: offer.coinReward || 0,
            currency: "points",
            xp: Math.round((offer.coinReward || 0) * 0.5),
          },
          estimatedTime: offer.estimatedTime || 5,
          duration: offer.estimatedTime || 5,
          clickUrl: offer.metadata?.externalUrl || "",
          surveyUrl: offer.metadata?.externalUrl || "",
          url: offer.metadata?.externalUrl || "",
          isAvailable: offer.status === "live",
          provider: "bitlabs",
          source: "admin_configured",
        };

        return mappedOffer;
      });

    return eligibleOffers;
  } catch (error) {
    console.error("Error getting admin-configured offers:", error);
    return [];
  }
}

/**
 * GET /api/non-game-offers
 * Get all non-game offers (surveys, magic receipts, cashback, shopping)
 * Checks admin-configured offers first, then falls back to BitLab API
 */
router.get("/", protect, async (req, res) => {
  try {
    const {
      type = "all",
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
    };

    let offers = [];
    let categorized = {
      surveys: [],
      cashback: [],
      shopping: [],
      magicReceipts: [],
      other: [],
    };
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers first
    if (useAdminConfig === "true") {
      try {
        // Map type to offerType
        const typeMap = {
          all: "all",
          survey: "survey",
          surveys: "survey",
          cashback: "cashback",
          shopping: "shopping",
          magic_receipt: "magic_receipt",
          "magic-receipts": "magic_receipt",
          magicReceipts: "magic_receipt",
        };

        const offerType = typeMap[type] || "all";
        const adminOffers = await getAdminConfiguredOffers(
          offerType,
          userProfile
        );

        if (adminOffers.length > 0) {
          // Group by type
          adminOffers.forEach((offer) => {
            const offerTypeKey =
              offer.type === "magic_receipt"
                ? "magicReceipts"
                : offer.type === "magic-receipts"
                ? "magicReceipts"
                : offer.type || "other";
            if (categorized[offerTypeKey]) {
              categorized[offerTypeKey].push(offer);
            } else {
              categorized.other.push(offer);
            }
          });

          // Flatten all offers
          offers = adminOffers;
          source = "admin_configured";
        }
      } catch (configError) {
        console.error("Error fetching admin-configured offers:", configError);
        // Fall through to BitLab API
      }
    }

    // Step 2: Fallback to BitLab API if no admin config or if explicitly requested
    if (offers.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getNonGameOffers({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        type,
        category,
      });

      if (result.success) {
        offers = result.offers || [];
        categorized = result.categorized || categorized;
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = offers.slice(startIndex, endIndex);

    // Calculate totals
    const totalOffers = offers.length;
    const estimatedEarnings = offers.reduce(
      (sum, o) => sum + (o.reward?.coins || 0),
      0
    );

    res.json({
      success: true,
      data: {
        offers: paginatedOffers,
        categorized: categorized,
        breakdown: {
          surveys: categorized.surveys?.length || 0,
          cashback: categorized.cashback?.length || 0,
          shopping: categorized.shopping?.length || 0,
          magicReceipts: categorized.magicReceipts?.length || 0,
          other: categorized.other?.length || 0,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalOffers,
          pages: Math.ceil(totalOffers / parseInt(limit)),
        },
        type: type || "all",
        category: category || "all",
        totalOffers: totalOffers,
        estimatedEarnings: estimatedEarnings,
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting non-game offers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get non-game offers",
    });
  }
});

/**
 * GET /api/non-game-offers/surveys
 * Get survey offers (checks admin-configured offers first, then BitLab API)
 */
router.get("/surveys", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
    };

    let surveys = [];
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers (SurveyOffer model)
    if (useAdminConfig === "true") {
      try {
        const SurveySDK = require("../models/SurveySDK");
        const SurveyOffer = require("../models/SurveyOffer");

        // Find BitLab SDK
        const bitlabSDK = await SurveySDK.findOne({
          name: { $regex: /bitlab/i },
        });

        if (bitlabSDK) {
          // Get admin-configured surveys
          const configuredOffers = await SurveyOffer.find({
            sdkId: bitlabSDK._id,
            offerType: "survey",
            status: "live",
          });

          // Filter by user eligibility
          const eligibleOffers = configuredOffers
            .filter((offer) => offer.isEligibleForUser(userProfile))
            .map((offer) => ({
              id: offer.externalId,
              surveyId: offer.externalId,
              title: offer.title,
              description: offer.description,
              category: offer.category,
              icon: offer.metadata?.thumbnail,
              banner: offer.metadata?.thumbnail,
              reward: {
                coins: offer.coinReward,
                currency: "points",
                xp: Math.round(offer.coinReward * 0.5),
              },
              estimatedTime: offer.estimatedTime,
              clickUrl: offer.metadata?.externalUrl,
              surveyUrl: offer.metadata?.externalUrl,
              isAvailable: offer.status === "live",
              provider: "bitlabs",
              source: "admin_configured",
            }));

          if (eligibleOffers.length > 0) {
            surveys = eligibleOffers;
            source = "admin_configured";
          }
        }
      } catch (configError) {
        console.error("Error fetching admin-configured offers:", configError);
        // Fall through to BitLab API
      }
    }

    // Step 2: Fallback to BitLab API if no admin config or if explicitly requested
    if (surveys.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getSurveys({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        category,
      });

      if (result.success && result.categorized?.surveys) {
        surveys = result.categorized.surveys.map((s) => ({
          ...s,
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedSurveys = surveys.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        surveys: paginatedSurveys,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: surveys.length,
          pages: Math.ceil(surveys.length / parseInt(limit)),
        },
        totalSurveys: surveys.length,
        estimatedEarnings: surveys.reduce(
          (sum, s) => sum + (s.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting surveys:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get surveys",
    });
  }
});

/**
 * GET /api/non-game-offers/magic-receipts
 * Get magic receipt offers
 */
router.get("/magic-receipts", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
    };

    let magicReceipts = [];
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers
    if (useAdminConfig === "true") {
      try {
        const adminOffers = await getAdminConfiguredOffers(
          "magic_receipt",
          userProfile
        );
        if (adminOffers.length > 0) {
          magicReceipts = adminOffers;
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "Error fetching admin-configured magic receipts:",
          configError
        );
      }
    }

    // Step 2: Fallback to BitLab API
    if (magicReceipts.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getMagicReceipts({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        category,
      });

      if (result.success && result.categorized?.magicReceipts) {
        magicReceipts = result.categorized.magicReceipts.map((m) => ({
          ...m,
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = magicReceipts.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        magicReceipts: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: magicReceipts.length,
          pages: Math.ceil(magicReceipts.length / parseInt(limit)),
        },
        totalMagicReceipts: magicReceipts.length,
        estimatedEarnings: magicReceipts.reduce(
          (sum, m) => sum + (m.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting magic receipts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get magic receipts",
    });
  }
});

/**
 * GET /api/non-game-offers/cashback
 * Get cashback offers
 */
router.get("/cashback", protect, async (req, res) => {
  try {
    const {
      category = "all",
      page = 1,
      limit = 20,
      useAdminConfig = "true",
    } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const userProfile = {
      age: getUserAge(user),
      gender: getUserGender(user),
      country: user.location?.current?.country || "US",
      language: user.preferences?.language || "en",
      xp: user.xp?.current || 0,
      deviceType: "mobile",
    };

    let cashbackOffers = [];
    let source = "bitlab_direct";

    // Step 1: Check admin-configured offers
    if (useAdminConfig === "true") {
      try {
        const adminOffers = await getAdminConfiguredOffers(
          "cashback",
          userProfile
        );
        if (adminOffers.length > 0) {
          cashbackOffers = adminOffers;
          source = "admin_configured";
        }
      } catch (configError) {
        console.error(
          "Error fetching admin-configured cashback offers:",
          configError
        );
      }
    }

    // Step 2: Fallback to BitLab API
    if (cashbackOffers.length === 0 || useAdminConfig === "false") {
      const result = await bitlabsNonGames.getCashbackOffers({
        userId: user._id.toString(),
        userProfile: {
          ...userProfile,
          platform: "mobile",
          osVersion: "iOS 15.0",
          appVersion: "1.0.0",
          deviceModel: "iPhone 13",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
        category,
      });

      if (result.success && result.categorized?.cashback) {
        cashbackOffers = result.categorized.cashback.map((c) => ({
          ...c,
          source: "bitlab_direct",
        }));
        source = "bitlab_direct";
      }
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = cashbackOffers.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        cashback: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: cashbackOffers.length,
          pages: Math.ceil(cashbackOffers.length / parseInt(limit)),
        },
        totalCashback: cashbackOffers.length,
        estimatedEarnings: cashbackOffers.reduce(
          (sum, c) => sum + (c.reward?.coins || 0),
          0
        ),
        source: source,
      },
    });
  } catch (error) {
    console.error("Error getting cashback offers:", error);

    // Return more detailed error information
    const statusCode = error.status || error.response?.status || 500;
    const errorMessage = error.message || "Failed to get cashback offers";

    // HTTP 428 means cashback feature not enabled
    if (statusCode === 428) {
      return res.status(428).json({
        success: false,
        error: {
          message: "Cashback feature is not enabled in BitLabs Dashboard",
          details:
            error.data?.error?.details || error.data || error.response?.data,
          traceId: error.data?.trace_id,
          statusCode: 428,
          suggestion:
            "Please enable cashback feature in your BitLabs Publisher Dashboard",
        },
      });
    }

    res.status(statusCode).json({
      success: false,
      error: {
        message: errorMessage,
        details: error.data || error.response?.data,
        statusCode: statusCode,
      },
    });
  }
});

/**
 * GET /api/non-game-offers/shopping
 * Get shopping offers
 */
router.get("/shopping", protect, async (req, res) => {
  try {
    const { category = "all", page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.userId).select(
      "xp vip profile location preferences"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const result = await bitlabsNonGames.getShoppingOffers({
      userId: user._id.toString(),
      userProfile: {
        age: getUserAge(user),
        gender: getUserGender(user),
        country: user.location?.current?.country || "US",
        language: user.preferences?.language || "en",
        platform: "mobile",
        osVersion: "iOS 15.0",
        appVersion: "1.0.0",
        deviceModel: "iPhone 13",
        userAgent: req.headers["user-agent"],
        ip: req.ip || req.connection.remoteAddress,
      },
      category,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to fetch shopping offers",
      });
    }

    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedOffers = result.categorized.shopping.slice(
      startIndex,
      endIndex
    );

    res.json({
      success: true,
      data: {
        shopping: paginatedOffers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.categorized.shopping.length,
          pages: Math.ceil(
            result.categorized.shopping.length / parseInt(limit)
          ),
        },
        totalShopping: result.categorized.shopping.length,
        estimatedEarnings: result.categorized.shopping.reduce(
          (sum, s) => sum + (s.reward?.coins || 0),
          0
        ),
      },
    });
  } catch (error) {
    console.error("Error getting shopping offers:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get shopping offers",
    });
  }
});

/**
 * POST /api/non-game-offers/click
 * Track offer click
 */
router.post("/click", protect, async (req, res) => {
  try {
    const { offerId, offerType } = req.body;
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: "offerId is required",
      });
    }

    const result = await bitlabsNonGames.trackOfferClick({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || "other",
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Failed to track offer click",
      });
    }

    res.json({
      success: true,
      data: {
        trackingId: result.trackingId,
        message: result.message,
      },
    });
  } catch (error) {
    console.error("Error tracking offer click:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track offer click",
    });
  }
});

/**
 * POST /api/non-game-offers/complete
 * Track offer completion and award rewards
 */
router.post("/complete", protect, async (req, res) => {
  try {
    const { offerId, offerType, completionData, reward } = req.body;
    const user = await User.findById(req.user.userId).select("wallet xp");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (!offerId) {
      return res.status(400).json({
        success: false,
        error: "offerId is required",
      });
    }

    // Track completion
    const trackingResult = await bitlabsNonGames.trackCompletion({
      userId: user._id.toString(),
      offerId,
      offerType: offerType || "other",
      completionData,
      reward,
    });

    if (!trackingResult.success) {
      return res.status(500).json({
        success: false,
        error: trackingResult.error || "Failed to track offer completion",
      });
    }

    // Award rewards if provided
    const finalReward = reward || trackingResult.reward || 0;
    if (finalReward > 0) {
      const coins = Math.round(finalReward);
      const baseXp = Math.round(finalReward * 0.5);

      // Update user wallet and XP
      user.wallet.balance = (user.wallet.balance || 0) + coins;
      user.wallet.lastUpdated = new Date();

      const { finalXP, multiplier: tierMultiplier } =
        await applyTierMultiplierToXP(user, baseXp);

      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;

      // Create transaction record
      const transaction = new Transaction({
        user: user._id,
        type: "credit",
        amount: coins,
        description: `Non-game offer completed - ${offerType || "offer"}`,
        status: "completed",
        referenceId: offerId,
      });

      await Promise.all([user.save(), transaction.save()]);

      res.json({
        success: true,
        data: {
          message: "Offer completed successfully!",
          reward: {
            coins,
            xp: finalXP,
          },
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
        },
      });
    } else {
      res.json({
        success: true,
        data: {
          message: "Offer completion tracked",
          reward: {
            coins: 0,
            xp: 0,
          },
        },
      });
    }
  } catch (error) {
    console.error("Error tracking offer completion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track offer completion",
    });
  }
});

/**
 * POST /api/non-game-offers/callback/bitlabs
 * Webhook endpoint for Bitlabs callbacks
 */
router.post("/callback/bitlabs", async (req, res) => {
  try {
    const { signature, ...callbackData } = req.body;

    // Verify callback signature
    const verification = await bitlabsNonGames.verifyCallback({
      callbackData,
      signature,
    });

    if (!verification.success || !verification.isValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid callback signature",
      });
    }

    // Process callback data
    const { userId, offerId, reward, status, value } = callbackData;

    if (userId && offerId && status === "completed") {
      // Find user and award reward
      const user = await User.findById(userId).select("wallet xp");
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Determine reward amount:
      // 1. Check if admin-configured survey exists (use coinReward from database)
      // 2. Use 'value' from callback (what Bitlabs gives publisher)
      // 3. Fallback to 'reward' from callback
      let coins = 0;

      try {
        const SurveySDK = require("../models/SurveySDK");
        const SurveyOffer = require("../models/SurveyOffer");

        const bitlabSDK = await SurveySDK.findOne({
          name: { $regex: /bitlab/i },
        });

        if (bitlabSDK) {
          const configuredOffer = await SurveyOffer.findOne({
            sdkId: bitlabSDK._id,
            externalId: offerId,
            offerType: "survey",
            status: "live",
          });

          if (configuredOffer) {
            // Use admin-configured reward (may be adjusted from original 'value')
            coins = configuredOffer.coinReward || 0;
            console.log(
              `✅ Using admin-configured reward: ${coins} coins for survey ${offerId}`
            );
          }
        }
      } catch (configError) {
        console.error("Error checking admin-configured offer:", configError);
      }

      // If no admin config, use Bitlabs callback data
      if (coins === 0) {
        // Priority: 'value' field (what Bitlabs gives publisher)
        if (value) {
          coins = parseFloat(value) || 0;
          console.log(
            `✅ Using 'value' from callback: ${coins} coins for survey ${offerId}`
          );
        } else if (reward) {
          // Fallback to 'reward' field
          coins = Math.round(reward);
          console.log(
            `✅ Using 'reward' from callback: ${coins} coins for survey ${offerId}`
          );
        }
      }

      if (coins > 0) {
        const xp = Math.round(coins * 0.5); // 50% of coins as XP

        user.wallet.balance = (user.wallet.balance || 0) + coins;
        user.wallet.lastUpdated = new Date();

        const { finalXP } = await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        const transaction = new Transaction({
          user: user._id,
          type: "credit",
          amount: coins,
          description: `Bitlabs survey completed - ${offerId}`,
          status: "completed",
          referenceId: offerId,
        });

        await Promise.all([user.save(), transaction.save()]);

        console.log(
          `✅ Rewarded user ${userId}: ${coins} coins + ${xp} XP for survey ${offerId}`
        );
      } else {
        console.warn(
          `⚠️ No reward amount found for survey ${offerId} - callback data:`,
          callbackData
        );
      }
    }

    res.json({
      success: true,
      message: "Callback processed successfully",
    });
  } catch (error) {
    console.error("Error processing Bitlabs callback:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process callback",
    });
  }
});

module.exports = router;

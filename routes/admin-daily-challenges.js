const express = require("express");
const router = express.Router();
const { body, validationResult, query } = require("express-validator");
const mongoose = require("mongoose");

// Import models
const DailyChallenge = require("../models/DailyChallenge");
const BonusDay = require("../models/BonusDay");
const ChallengePauseRule = require("../models/ChallengePauseRule");
const XPMultiplier = require("../models/XPMultiplier");
const StreakBonusConfig = require("../models/StreakBonusConfig");

// Import streak route to clear cache
const streakRouter = require("../routes/streak");

// Import services
const besitosController = require("../controllers/besitos.controller");

// Admin authentication middleware
const { adminAuth } = require("../middleware/adminAuth");

// ==================== HELPER FUNCTIONS ====================

/**
 * Check if two challenges have overlapping segments
 * Returns true if segments overlap (same countries, age range, gender, or XP range)
 * Returns false if segments are different (no overlap)
 */
function doSegmentsOverlap(challenge1, challenge2) {
  const audience1 = challenge1.targetAudience || {};
  const audience2 = challenge2.targetAudience || {};

  // Helper: Check if two arrays have any common elements
  const arraysOverlap = (arr1, arr2) => {
    if (!arr1 || arr1.length === 0) return true; // Empty means all (overlaps with everything)
    if (!arr2 || arr2.length === 0) return true; // Empty means all (overlaps with everything)
    return arr1.some(item => arr2.includes(item));
  };

  // Helper: Check if two ranges overlap
  const rangesOverlap = (min1, max1, min2, max2) => {
    // If no range specified (null/undefined), it means all (overlaps with everything)
    if (min1 === null || min1 === undefined) return true;
    if (min2 === null || min2 === undefined) return true;
    
    // Normalize max values (null means no upper limit, treat as Infinity)
    const max1Val = max1 === null || max1 === undefined ? Infinity : max1;
    const max2Val = max2 === null || max2 === undefined ? Infinity : max2;
    
    // Ranges overlap if: min1 <= max2 AND min2 <= max1
    return min1 <= max2Val && min2 <= max1Val;
  };

  // Check countries overlap
  const countries1 = audience1.countries || [];
  const countries2 = audience2.countries || [];
  if (!arraysOverlap(countries1, countries2)) {
    return false; // Different countries, no overlap
  }

  // Check age range overlap
  const ageRange1 = audience1.ageRange || {};
  const ageRange2 = audience2.ageRange || {};
  const ageMin1 = ageRange1.min;
  const ageMax1 = ageRange1.max;
  const ageMin2 = ageRange2.min;
  const ageMax2 = ageRange2.max;
  
  // If neither has age range specified, they both target all ages (overlap)
  // If one has no age range, it targets all ages (overlaps with any range)
  // If both have age ranges, check if they overlap
  const hasAgeRange1 = ageMin1 !== undefined || ageMax1 !== undefined;
  const hasAgeRange2 = ageMin2 !== undefined || ageMax2 !== undefined;
  
  if (hasAgeRange1 && hasAgeRange2) {
    // Both have age ranges - check if they overlap
    const min1 = ageMin1 || 13; // Default min age
    const max1 = ageMax1 || 100; // Default max age
    const min2 = ageMin2 || 13;
    const max2 = ageMax2 || 100;
    
    if (!rangesOverlap(min1, max1, min2, max2)) {
      return false; // Different age ranges, no overlap
    }
  }
  // If only one has age range or neither has age range, they overlap (empty means all ages)

  // Check gender overlap
  const genders1 = audience1.gender || [];
  const genders2 = audience2.gender || [];
  if (!arraysOverlap(genders1, genders2)) {
    return false; // Different genders, no overlap
  }

  // Check XP range overlap
  const minXP1 = audience1.minXP;
  const maxXP1 = audience1.maxXP;
  const minXP2 = audience2.minXP;
  const maxXP2 = audience2.maxXP;
  
  // Check if challenges have XP restrictions
  // minXP of 0 or undefined means no lower limit, maxXP of null/undefined means no upper limit
  const hasXPRange1 = (minXP1 !== undefined && minXP1 > 0) || (maxXP1 !== undefined && maxXP1 !== null);
  const hasXPRange2 = (minXP2 !== undefined && minXP2 > 0) || (maxXP2 !== undefined && maxXP2 !== null);
  
  // If both have XP ranges, check if they overlap
  if (hasXPRange1 && hasXPRange2) {
    const xpMin1 = minXP1 || 0;
    const xpMax1 = maxXP1 === null || maxXP1 === undefined ? Infinity : maxXP1;
    const xpMin2 = minXP2 || 0;
    const xpMax2 = maxXP2 === null || maxXP2 === undefined ? Infinity : maxXP2;
    
    if (!rangesOverlap(xpMin1, xpMax1, xpMin2, xpMax2)) {
      return false; // Different XP ranges, no overlap
    }
  }
  // If only one has XP range or neither has XP range, they overlap (empty means all XP)

  // All segments overlap (or are empty, which means all users)
  return true;
}

// ==================== DAILY CHALLENGES MANAGEMENT ====================

// Get daily challenges (List View)
router.get(
  "/challenges",
  adminAuth,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("startDate")
      .optional()
      .isISO8601()
      .withMessage("Start date must be valid ISO 8601 date"),
    query("endDate")
      .optional()
      .isISO8601()
      .withMessage("End date must be valid ISO 8601 date"),
    query("type")
      .optional()
      .isIn([
        "spin",
        "game",
        "survey",
        "referral",
        "watch_ad",
        "social_share",
        "app_install",
        "quiz",
        "custom",
      ])
      .withMessage("Invalid challenge type"),
    query("status")
      .optional()
      .isIn(["scheduled", "live", "completed", "expired", "draft"])
      .withMessage("Invalid status"),
    query("search")
      .optional()
      .isString()
      .withMessage("Search must be a string"),
    query("country")
      .optional()
      .isString()
      .withMessage("Country must be a string"),
    query("minAge")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum age must be a non-negative integer"),
    query("maxAge")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum age must be a non-negative integer"),
    query("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be male, female, or other"),
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
        startDate,
        endDate,
        type,
        status,
        search,
        country,
        minAge,
        maxAge,
        gender,
      } = req.query;

      let query = {};

      // Date range filter
      if (startDate || endDate) {
        query.challengeDate = {};
        if (startDate) query.challengeDate.$gte = new Date(startDate);
        if (endDate) query.challengeDate.$lte = new Date(endDate);
      } else {
        // Default to current month if no date range specified
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        query.challengeDate = {
          $gte: startOfMonth,
          $lte: endOfMonth,
        };
      }

      // Type filter
      if (type) {
        query.type = type;
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Search filter
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Country filter
      if (country) {
        // Only match challenges that explicitly have the country in their countries array
        // Ensure the countries array exists, is not empty, and contains the selected country
        query.$and = query.$and || [];
        query.$and.push(
          { "targetAudience.countries": { $exists: true } },
          { "targetAudience.countries": { $ne: [] } },
          { "targetAudience.countries": country }
        );
      }

      // Age range filter
      if (minAge !== undefined || maxAge !== undefined) {
        // Match challenges where the age range overlaps with the filter
        // Challenge matches if: challenge.minAge <= filter.maxAge AND challenge.maxAge >= filter.minAge
        const ageConditions = [];
        if (minAge !== undefined && maxAge !== undefined) {
          // Both min and max specified - find challenges that overlap
          ageConditions.push({
            $or: [
              // Challenge has no age restriction (defaults)
              {
                $and: [
                  { "targetAudience.ageRange.min": { $exists: false } },
                  { "targetAudience.ageRange.max": { $exists: false } },
                ],
              },
              // Challenge age range overlaps with filter range
              {
                $and: [
                  {
                    $or: [
                      { "targetAudience.ageRange.min": { $exists: false } },
                      { "targetAudience.ageRange.min": { $lte: parseInt(maxAge) } },
                    ],
                  },
                  {
                    $or: [
                      { "targetAudience.ageRange.max": { $exists: false } },
                      { "targetAudience.ageRange.max": { $gte: parseInt(minAge) } },
                    ],
                  },
                ],
              },
            ],
          });
        } else if (minAge !== undefined) {
          // Only min age specified - find challenges where maxAge >= minAge
          ageConditions.push({
            $or: [
              { "targetAudience.ageRange.max": { $exists: false } },
              { "targetAudience.ageRange.max": { $gte: parseInt(minAge) } },
            ],
          });
        } else if (maxAge !== undefined) {
          // Only max age specified - find challenges where minAge <= maxAge
          ageConditions.push({
            $or: [
              { "targetAudience.ageRange.min": { $exists: false } },
              { "targetAudience.ageRange.min": { $lte: parseInt(maxAge) } },
            ],
          });
        }
        if (ageConditions.length > 0) {
          query.$and = query.$and || [];
          query.$and.push(...ageConditions);
        }
      }

      // Gender filter
      if (gender) {
        // Only match challenges that explicitly have the gender in their gender array
        // Ensure the gender array exists, is not empty, and contains the selected gender
        query.$and = query.$and || [];
        query.$and.push(
          { "targetAudience.gender": { $exists: true } },
          { "targetAudience.gender": { $ne: [] } },
          { "targetAudience.gender": gender }
        );
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [challenges, total] = await Promise.all([
        DailyChallenge.find(query)
          .sort({ challengeDate: 1, "metadata.priority": -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .lean(),
        DailyChallenge.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          challenges,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Error getting daily challenges:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get daily challenges",
        error: error.message,
      });
    }
  }
);

// Get daily challenges (Calendar View)
router.get(
  "/challenges/calendar",
  adminAuth,
  [
    query("year")
      .optional()
      .isInt({ min: 2020, max: 2030 })
      .withMessage("Year must be between 2020 and 2030"),
    query("month")
      .optional()
      .isInt({ min: 0, max: 11 })
      .withMessage("Month must be between 0 and 11"),
    query("type")
      .optional()
      .isIn([
        "spin",
        "game",
        "survey",
        "referral",
        "watch_ad",
        "social_share",
        "app_install",
        "quiz",
        "custom",
      ])
      .withMessage("Invalid challenge type"),
    query("status")
      .optional()
      .isIn(["scheduled", "live", "completed", "expired", "draft"])
      .withMessage("Invalid status"),
    query("country")
      .optional()
      .isString()
      .withMessage("Country must be a string"),
    query("minAge")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum age must be a non-negative integer"),
    query("maxAge")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum age must be a non-negative integer"),
    query("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be male, female, or other"),
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

      const { year, month, type, status, country, minAge, maxAge, gender } = req.query;
      const currentDate = new Date();
      const targetYear = year ? parseInt(year) : currentDate.getFullYear();
      const targetMonth = month ? parseInt(month) : currentDate.getMonth();

      let filters = {};
      if (type) filters.type = type;
      if (status) filters.status = status;
      if (country) {
        // Only match challenges that explicitly have the country in their countries array
        filters.$and = filters.$and || [];
        filters.$and.push(
          { "targetAudience.countries": { $exists: true } },
          { "targetAudience.countries": { $ne: [] } },
          { "targetAudience.countries": country }
        );
      }
      
      // Age range filter
      if (minAge !== undefined || maxAge !== undefined) {
        const ageConditions = [];
        if (minAge !== undefined && maxAge !== undefined) {
          ageConditions.push({
            $or: [
              {
                $and: [
                  { "targetAudience.ageRange.min": { $exists: false } },
                  { "targetAudience.ageRange.max": { $exists: false } },
                ],
              },
              {
                $and: [
                  {
                    $or: [
                      { "targetAudience.ageRange.min": { $exists: false } },
                      { "targetAudience.ageRange.min": { $lte: parseInt(maxAge) } },
                    ],
                  },
                  {
                    $or: [
                      { "targetAudience.ageRange.max": { $exists: false } },
                      { "targetAudience.ageRange.max": { $gte: parseInt(minAge) } },
                    ],
                  },
                ],
              },
            ],
          });
        } else if (minAge !== undefined) {
          ageConditions.push({
            $or: [
              { "targetAudience.ageRange.max": { $exists: false } },
              { "targetAudience.ageRange.max": { $gte: parseInt(minAge) } },
            ],
          });
        } else if (maxAge !== undefined) {
          ageConditions.push({
            $or: [
              { "targetAudience.ageRange.min": { $exists: false } },
              { "targetAudience.ageRange.min": { $lte: parseInt(maxAge) } },
            ],
          });
        }
        if (ageConditions.length > 0) {
          filters.$and = filters.$and || [];
          filters.$and.push(...ageConditions);
        }
      }
      
      if (gender) {
        // Only match challenges that explicitly have the gender in their gender array
        filters.$and = filters.$and || [];
        filters.$and.push(
          { "targetAudience.gender": { $exists: true } },
          { "targetAudience.gender": { $ne: [] } },
          { "targetAudience.gender": gender }
        );
      }

      const challenges = await DailyChallenge.getCalendarView(
        targetYear,
        targetMonth,
        filters
      );

      // Group challenges by date for calendar display
      const calendarData = {};
      challenges.forEach((challenge) => {
        const dateKey = challenge.challengeDate.toISOString().split("T")[0];
        if (!calendarData[dateKey]) {
          calendarData[dateKey] = [];
        }
        calendarData[dateKey].push(challenge.getDisplayData());
      });

      res.json({
        success: true,
        data: {
          year: targetYear,
          month: targetMonth,
          calendarData,
          totalChallenges: challenges.length,
        },
      });
    } catch (error) {
      console.error("Error getting calendar view:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get calendar view",
        error: error.message,
      });
    }
  }
);

// Get specific daily challenge
router.get("/challenges/:id", adminAuth, async (req, res) => {
  try {
    const challenge = await DailyChallenge.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: "Daily challenge not found",
      });
    }

    res.json({
      success: true,
      data: challenge,
    });
  } catch (error) {
    console.error("Error getting daily challenge:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get daily challenge",
      error: error.message,
    });
  }
});

// Create new daily challenge
router.post(
  "/challenges",
  adminAuth,
  [
    body("challengeDate")
      .isISO8601()
      .withMessage("Challenge date must be valid ISO 8601 date"),
    body("title").notEmpty().withMessage("Title is required"),
    body("type")
      .isIn([
        "spin",
        "game",
        "survey",
        "referral",
        "watch_ad",
        "social_share",
        "app_install",
        "quiz",
        "custom",
      ])
      .withMessage("Invalid challenge type"),
    body("coinReward")
      .isInt({ min: 0 })
      .withMessage("Coin reward must be a non-negative integer"),
    body("xpReward")
      .isInt({ min: 0 })
      .withMessage("XP reward must be a non-negative integer"),
    body("claimType")
      .isIn(["watch_ad", "auto", "manual", "social_action"])
      .withMessage("Invalid claim type"),
    // Timer-based game configuration
    body("requirements.timeLimit")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Time limit (minutes) must be a non-negative integer"),
    body("scheduling.startTime")
      .optional()
      .isISO8601()
      .withMessage("Start time must be valid ISO 8601 date"),
    body("scheduling.endTime")
      .optional()
      .isISO8601()
      .withMessage("End time must be valid ISO 8601 date"),
    body("gameId")
      .optional()
      .isString()
      .withMessage("Game ID must be a string"),
    body("sdkProvider")
      .optional()
      .isString()
      .withMessage("SDK Provider must be a string"),
    // Target audience / segmentation (optional; age/country/gender only)
    body("targetAudience.countries")
      .optional()
      .isArray()
      .withMessage("Countries must be an array of country codes"),
    body("targetAudience.countries.*")
      .optional()
      .isString()
      .withMessage("Country code must be a string"),
    body("targetAudience.ageRange.min")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum age must be a non-negative integer"),
    body("targetAudience.ageRange.max")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum age must be a non-negative integer"),
    body("targetAudience.gender")
      .optional()
      .isArray()
      .withMessage("Gender must be an array"),
    body("targetAudience.gender.*")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Invalid gender value"),
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

      // Additional validation: for Game type, ensure timeLimit is provided
      if (req.body.type === "game") {
        const timeLimit =
          req.body.requirements && req.body.requirements.timeLimit;
        if (
          timeLimit === undefined ||
          timeLimit === null ||
          Number.isNaN(Number(timeLimit)) ||
          Number(timeLimit) <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Time-based Game challenges require a positive timeLimit (minutes)",
          });
        }
      }

      // Normalize provided date to UTC start-of-day to avoid timezone drift
      const rawDate = new Date(req.body.challengeDate);
      const normalizedStart = new Date(
        Date.UTC(
          rawDate.getUTCFullYear(),
          rawDate.getUTCMonth(),
          rawDate.getUTCDate(),
          0,
          0,
          0,
          0
        )
      );
      const normalizedEnd = new Date(
        Date.UTC(
          rawDate.getUTCFullYear(),
          rawDate.getUTCMonth(),
          rawDate.getUTCDate(),
          23,
          59,
          59,
          999
        )
      );

      const challengeData = {
        ...req.body,
        // store canonical UTC start-of-day
        challengeDate: normalizedStart,
        createdBy: req.user.userId,
      };

      // Auto-set scheduling times if not provided or if they don't match challenge date
      if (
        !req.body.scheduling ||
        !req.body.scheduling.startTime ||
        !req.body.scheduling.endTime
      ) {
        challengeData.scheduling = {
          startTime: normalizedStart,
          endTime: normalizedEnd,
        };
      }
      
      // Ensure challenge is visible and has correct status for immediate visibility
      // If status is not explicitly set, default to "live" for today's challenges, "scheduled" for future
      if (!req.body.status) {
        const now = new Date();
        if (normalizedStart <= now && normalizedEnd >= now) {
          // Challenge is for today - set to "live" for immediate visibility
          challengeData.status = "live";
        } else {
          // Challenge is for future - set to "scheduled"
          challengeData.status = "scheduled";
        }
      }
      
      // Ensure isVisible is true for immediate visibility (unless explicitly set to false)
      if (req.body.isVisible === undefined) {
        challengeData.isVisible = true;
      }

      // Fetch gameDetails from Besitos API if gameId and sdkProvider are provided
      if (req.body.gameId && req.body.sdkProvider === "besitos") {
        try {
          // Create a mock request object for besitos controller
          const mockReq = {
            query: { offer_id: req.body.gameId },
          };

          // Create a mock response object to capture the data
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

          const cap = captureGame();
          await besitosController.getOffers(mockReq, cap.res);
          const ext = cap.get();

          if (
            ext &&
            ext.success === true &&
            Array.isArray(ext.data) &&
            ext.data.length > 0
          ) {
            const external = ext.data[0];

            // Map external details into gameDetails snapshot (same as Game model)
            challengeData.gameDetails = {
              id: external.id || "",
              name: external.title || external.name || challengeData.title,
              description: external.description || challengeData.description,
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
          } else {
            // Create fallback gameDetails with the provided challenge data
            challengeData.gameDetails = {
              id: challengeData.gameId || "",
              name: challengeData.title || "",
              description: challengeData.description || "",
              image: "",
              square_image: "",
              large_image: "",
              category: "",
              downloadUrl: "",
            };
          }
        } catch (error) {
          console.warn(
            "Failed to fetch gameDetails from Besitos:",
            error.message
          );
          // Create fallback gameDetails if API call fails
          challengeData.gameDetails = {
            id: challengeData.gameId || "",
            name: challengeData.title || "",
            description: challengeData.description || "",
            image: "",
            square_image: "",
            large_image: "",
            category: "",
            downloadUrl: "",
          };
        }
      }

      // Check for existing challenges on the same date with overlapping segments
      // Multiple challenges are allowed for the same date if they target different segments
      const existingChallenges = await DailyChallenge.find({
        challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
        status: { $in: ["scheduled", "live"] },
      });

      // Check if any existing challenge has overlapping segments with the new challenge
      for (const existingChallenge of existingChallenges) {
        if (doSegmentsOverlap(challengeData, existingChallenge)) {
          return res.status(409).json({
            success: false,
            message: "A daily challenge with overlapping segments already exists for the selected date. Multiple challenges are allowed only if they target different user segments (countries, age range, gender, or XP range).",
            data: { existingChallengeId: existingChallenge._id },
          });
        }
      }

      const challenge = new DailyChallenge(challengeData);
      await challenge.save();

      // Populate the response
      await challenge.populate("createdBy", "name email");

      res.status(201).json({
        success: true,
        message: "Daily challenge created successfully",
        data: challenge,
      });
    } catch (error) {
      console.error("Error creating daily challenge:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create daily challenge",
        error: error.message,
      });
    }
  }
);

// Update daily challenge
router.put(
  "/challenges/:id",
  adminAuth,
  [
    body("title").optional().notEmpty().withMessage("Title cannot be empty"),
    body("type")
      .optional()
      .isIn([
        "spin",
        "game",
        "survey",
        "referral",
        "watch_ad",
        "social_share",
        "app_install",
        "quiz",
        "custom",
      ])
      .withMessage("Invalid challenge type"),
    body("coinReward")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Coin reward must be a non-negative integer"),
    body("xpReward")
      .optional()
      .isInt({ min: 0 })
      .withMessage("XP reward must be a non-negative integer"),
    body("claimType")
      .optional()
      .isIn(["watch_ad", "auto", "manual", "social_action"])
      .withMessage("Invalid claim type"),
    body("status")
      .optional()
      .isIn(["scheduled", "live", "completed", "expired", "draft"])
      .withMessage("Invalid status"),
    body("gameId")
      .optional()
      .isString()
      .withMessage("Game ID must be a string"),
    body("sdkProvider")
      .optional()
      .isString()
      .withMessage("SDK Provider must be a string"),
    // Timer-based game configuration
    body("requirements.timeLimit")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Time limit (minutes) must be a non-negative integer"),
    // Target audience / segmentation (optional; age/country/gender only)
    body("targetAudience.countries")
      .optional()
      .isArray()
      .withMessage("Countries must be an array of country codes"),
    body("targetAudience.countries.*")
      .optional()
      .isString()
      .withMessage("Country code must be a string"),
    body("targetAudience.ageRange.min")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Minimum age must be a non-negative integer"),
    body("targetAudience.ageRange.max")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maximum age must be a non-negative integer"),
    body("targetAudience.gender")
      .optional()
      .isArray()
      .withMessage("Gender must be an array"),
    body("targetAudience.gender.*")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Invalid gender value"),
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

      // If the type is being set/changed to game, ensure timeLimit is present
      const nextType = req.body.type;
      if (nextType === "game") {
        const timeLimit =
          req.body.requirements && req.body.requirements.timeLimit;
        if (
          timeLimit === undefined ||
          timeLimit === null ||
          Number.isNaN(Number(timeLimit)) ||
          Number(timeLimit) <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Time-based Game challenges require a positive timeLimit (minutes)",
          });
        }
      }

      const updateData = {
        ...req.body,
        updatedBy: req.user.userId,
      };

      let normalizedStart = null;
      let normalizedEnd = null;

      // Auto-set scheduling times if challengeDate is being updated
      if (req.body.challengeDate) {
        const rawDate = new Date(req.body.challengeDate);
        normalizedStart = new Date(
          Date.UTC(
            rawDate.getUTCFullYear(),
            rawDate.getUTCMonth(),
            rawDate.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
        normalizedEnd = new Date(
          Date.UTC(
            rawDate.getUTCFullYear(),
            rawDate.getUTCMonth(),
            rawDate.getUTCDate(),
            23,
            59,
            59,
            999
          )
        );

        updateData.challengeDate = normalizedStart;
        updateData.scheduling = {
          startTime: normalizedStart,
          endTime: normalizedEnd,
        };
        
        // Ensure challenge is visible and has correct status for immediate visibility
        // If status is not explicitly being updated, auto-set based on date
        if (!req.body.status) {
          const now = new Date();
          if (normalizedStart <= now && normalizedEnd >= now) {
            // Challenge is for today - set to "live" for immediate visibility
            updateData.status = "live";
          } else {
            // Challenge is for future - set to "scheduled"
            updateData.status = "scheduled";
          }
        }
        
        // Ensure isVisible is true for immediate visibility (unless explicitly set to false)
        if (req.body.isVisible === undefined) {
          updateData.isVisible = true;
        }
      }

      // If the date is being changed, check for overlapping segments with other challenges on that date
      if (normalizedStart && normalizedEnd) {
        // Get the current challenge to merge with updateData
        const currentChallenge = await DailyChallenge.findById(req.params.id);
        if (!currentChallenge) {
          return res.status(404).json({
            success: false,
            message: "Daily challenge not found",
          });
        }

        // Create merged challenge data (what the challenge will be after update)
        const mergedChallengeData = {
          ...currentChallenge.toObject(),
          ...updateData,
          targetAudience: updateData.targetAudience || currentChallenge.targetAudience,
        };

        const conflictingChallenges = await DailyChallenge.find({
          _id: { $ne: req.params.id },
          challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
          status: { $in: ["scheduled", "live"] },
        });

        // Check if any existing challenge has overlapping segments with the updated challenge
        for (const conflictingChallenge of conflictingChallenges) {
          if (doSegmentsOverlap(mergedChallengeData, conflictingChallenge)) {
            return res.status(409).json({
              success: false,
              message: "A daily challenge with overlapping segments already exists for the selected date. Multiple challenges are allowed only if they target different user segments (countries, age range, gender, or XP range).",
              data: { existingChallengeId: conflictingChallenge._id },
            });
          }
        }
      }

      // Fetch gameDetails from Besitos API if gameId and sdkProvider are provided
      if (req.body.gameId && req.body.sdkProvider === "besitos") {
        try {
          // Create a mock request object for besitos controller
          const mockReq = {
            query: { offer_id: req.body.gameId },
          };

          // Create a mock response object to capture the data
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

          const cap = captureGame();
          await besitosController.getOffers(mockReq, cap.res);
          const ext = cap.get();

          if (
            ext &&
            ext.success === true &&
            Array.isArray(ext.data) &&
            ext.data.length > 0
          ) {
            const external = ext.data[0];

            // Map external details into gameDetails snapshot (same as Game model)
            updateData.gameDetails = {
              id: external.id || "",
              name: external.title || external.name || updateData.title,
              description: external.description || updateData.description,
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
          } else {
            // Create fallback gameDetails with the provided challenge data
            updateData.gameDetails = {
              id: updateData.gameId || "",
              name: updateData.title || "",
              description: updateData.description || "",
              image: "",
              square_image: "",
              large_image: "",
              category: "",
              downloadUrl: "",
            };
          }
        } catch (error) {
          console.warn(
            "Failed to fetch gameDetails from Besitos:",
            error.message
          );
          // Create fallback gameDetails if API call fails
          updateData.gameDetails = {
            id: updateData.gameId || "",
            name: updateData.title || "",
            description: updateData.description || "",
            image: "",
            square_image: "",
            large_image: "",
            category: "",
            downloadUrl: "",
          };
        }
      }

      const challenge = await DailyChallenge.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!challenge) {
        return res.status(404).json({
          success: false,
          message: "Daily challenge not found",
        });
      }

      res.json({
        success: true,
        message: "Daily challenge updated successfully",
        data: challenge,
      });
    } catch (error) {
      console.error("Error updating daily challenge:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update daily challenge",
        error: error.message,
      });
    }
  }
);

// Delete daily challenge
router.delete("/challenges/:id", adminAuth, async (req, res) => {
  try {
    const challenge = await DailyChallenge.findByIdAndDelete(req.params.id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: "Daily challenge not found",
      });
    }

    res.json({
      success: true,
      message: "Daily challenge deleted successfully",
      data: { id: challenge._id, title: challenge.title },
    });
  } catch (error) {
    console.error("Error deleting daily challenge:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete daily challenge",
      error: error.message,
    });
  }
});

// Toggle challenge visibility
router.patch("/challenges/:id/visibility", adminAuth, async (req, res) => {
  try {
    const challenge = await DailyChallenge.findById(req.params.id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        message: "Daily challenge not found",
      });
    }

    challenge.isVisible = !challenge.isVisible;
    challenge.updatedBy = req.user.userId;
    await challenge.save();

    res.json({
      success: true,
      message: `Challenge ${
        challenge.isVisible ? "shown" : "hidden"
      } successfully`,
      data: { isVisible: challenge.isVisible },
    });
  } catch (error) {
    console.error("Error toggling challenge visibility:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle challenge visibility",
      error: error.message,
    });
  }
});

// ==================== BONUS DAY CONFIGURATION ====================

// Get bonus days
router.get("/bonus-days", adminAuth, async (req, res) => {
  try {
    // Allow filtering by isActive via query parameter, default to all
    const { isActive } = req.query;
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true' || isActive === true;
    }
    
    const bonusDays = await BonusDay.find(query)
      .sort({ dayNumber: 1 })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.json({
      success: true,
      data: bonusDays,
    });
  } catch (error) {
    console.error("Error getting bonus days:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bonus days",
      error: error.message,
    });
  }
});

// Get specific bonus day
router.get("/bonus-days/:dayNumber", adminAuth, async (req, res) => {
  try {
    const bonusDay = await BonusDay.findByDayNumber(
      parseInt(req.params.dayNumber)
    );

    if (!bonusDay) {
      return res.status(404).json({
        success: false,
        message: "Bonus day not found",
      });
    }

    res.json({
      success: true,
      data: bonusDay,
    });
  } catch (error) {
    console.error("Error getting bonus day:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bonus day",
      error: error.message,
    });
  }
});

// Create/Update bonus day
router.put(
  "/bonus-days/:dayNumber",
  adminAuth,
  [
    body("title").notEmpty().withMessage("Title is required"),
    body("primaryReward.type")
      .isIn([
        "coins",
        "xp",
        "giftcard",
        "premium_features",
        "bonus_spins",
        "vip_access",
      ])
      .withMessage("Invalid primary reward type"),
    body("primaryReward.value")
      .isInt({ min: 0 })
      .withMessage("Primary reward value must be a non-negative integer"),
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

      const dayNumber = parseInt(req.params.dayNumber);
      
      // Check if bonus day already exists
      const existingBonusDay = await BonusDay.findOne({ dayNumber });
      
      const updateData = {
        ...req.body,
        dayNumber,
        updatedBy: req.user.userId,
      };
      
      // Set createdBy if it's a new document (required field)
      if (!existingBonusDay) {
        updateData.createdBy = req.user.userId;
      }

      const bonusDay = await BonusDay.findOneAndUpdate(
        { dayNumber },
        updateData,
        { new: true, upsert: true, runValidators: true }
      );

      res.json({
        success: true,
        message: "Bonus day configuration saved successfully",
        data: bonusDay,
      });
    } catch (error) {
      console.error("Error saving bonus day:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save bonus day configuration",
        error: error.message,
      });
    }
  }
);

// Delete bonus day
router.delete("/bonus-days/:id", adminAuth, async (req, res) => {
  try {
    const bonusDay = await BonusDay.findById(req.params.id);
    
    if (!bonusDay) {
      return res.status(404).json({
        success: false,
        message: "Bonus day not found",
      });
    }

    await BonusDay.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: "Bonus day deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting bonus day:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete bonus day",
      error: error.message,
    });
  }
});

// Preview bonus day notification/banner
router.post(
  "/bonus-days/:dayNumber/preview",
  adminAuth,
  [
    body("previewType")
      .isIn(["notification", "banner"])
      .withMessage("Preview type must be notification or banner"),
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

      const bonusDay = await BonusDay.findByDayNumber(
        parseInt(req.params.dayNumber)
      );

      if (!bonusDay) {
        return res.status(404).json({
          success: false,
          message: "Bonus day not found",
        });
      }

      const { previewType } = req.body;
      let previewData = {};

      if (previewType === "notification") {
        previewData = {
          type: "notification",
          title: bonusDay.notification.title || bonusDay.title,
          message: bonusDay.notification.message || bonusDay.description,
          imageUrl: bonusDay.notification.imageUrl,
          actionText: bonusDay.notification.actionText,
          reward: bonusDay.primaryReward,
        };
      } else if (previewType === "banner") {
        previewData = {
          type: "banner",
          title: bonusDay.banner.title || bonusDay.title,
          subtitle: bonusDay.banner.subtitle || bonusDay.description,
          imageUrl: bonusDay.banner.imageUrl,
          backgroundColor: bonusDay.banner.backgroundColor,
          textColor: bonusDay.banner.textColor,
          position: bonusDay.banner.position,
          reward: bonusDay.primaryReward,
        };
      }

      res.json({
        success: true,
        data: previewData,
      });
    } catch (error) {
      console.error("Error previewing bonus day:", error);
      res.status(500).json({
        success: false,
        message: "Failed to preview bonus day",
        error: error.message,
      });
    }
  }
);

// ==================== 30-DAY STREAK BONUS CONFIGURATION ====================

// Get 30-day streak bonus configuration
router.get("/streak-bonus-config", adminAuth, async (req, res) => {
  try {
    const config = await StreakBonusConfig.getConfig();
    
    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Error getting streak bonus config:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get streak bonus configuration",
      error: error.message,
    });
  }
});

// Update 30-day streak bonus configuration
router.put(
  "/streak-bonus-config",
  adminAuth,
  [
    body("milestones")
      .isArray({ min: 4, max: 4 })
      .withMessage("Must have exactly 4 milestones"),
    body("milestones.*.day")
      .isIn([7, 14, 21, 30])
      .withMessage("Milestone day must be 7, 14, 21, or 30"),
    body("milestones.*.active")
      .isBoolean()
      .withMessage("Active must be a boolean"),
    body("milestones.*.rewards")
      .isArray({ min: 1, max: 2 })
      .withMessage("At least one reward is required, maximum 2 rewards allowed per milestone (Coins and XP)"),
    body("milestones.*.rewards.*.type")
      .isIn(["coins", "xp"])
      .withMessage("Reward type must be coins or xp"),
    body("milestones.*.rewards.*.value")
      .isInt({ min: 0 })
      .withMessage("Reward value must be a non-negative integer"),
    body("milestones.*.claimMode")
      .isIn(["auto", "watch_ad"])
      .withMessage("Claim mode must be auto or watch_ad"),
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

      // Validate that all required days are present
      const providedDays = req.body.milestones.map(m => m.day).sort((a, b) => a - b);
      const requiredDays = [7, 14, 21, 30];
      if (JSON.stringify(providedDays) !== JSON.stringify(requiredDays)) {
        return res.status(400).json({
          success: false,
          message: "Must include exactly one milestone for each day: 7, 14, 21, 30",
        });
      }

      // Get or create config
      let config = await StreakBonusConfig.findOne();
      
      if (!config) {
        config = new StreakBonusConfig({
          milestones: req.body.milestones,
          updatedBy: req.user.userId,
        });
      } else {
        config.milestones = req.body.milestones;
        config.updatedBy = req.user.userId;
      }

      await config.save();

      // Clear streak config cache so changes take effect immediately
      if (streakRouter.clearStreakConfigCache) {
        streakRouter.clearStreakConfigCache();
      }

      res.json({
        success: true,
        message: "30-day streak bonus configuration updated successfully",
        data: config,
      });
    } catch (error) {
      console.error("Error updating streak bonus config:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update streak bonus configuration",
        error: error.message,
      });
    }
  }
);

// ==================== CHALLENGE PAUSE RULES ====================

// Get challenge pause rules
router.get("/pause-rules", adminAuth, async (req, res) => {
  try {
    const pauseRules = await ChallengePauseRule.findActive()
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.json({
      success: true,
      data: pauseRules,
    });
  } catch (error) {
    console.error("Error getting pause rules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get pause rules",
      error: error.message,
    });
  }
});

// Get specific pause rule
router.get("/pause-rules/:id", adminAuth, async (req, res) => {
  try {
    const pauseRule = await ChallengePauseRule.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!pauseRule) {
      return res.status(404).json({
        success: false,
        message: "Pause rule not found",
      });
    }

    res.json({
      success: true,
      data: pauseRule,
    });
  } catch (error) {
    console.error("Error getting pause rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get pause rule",
      error: error.message,
    });
  }
});

// Create pause rule
router.post(
  "/pause-rules",
  adminAuth,
  [
    body("ruleName").notEmpty().withMessage("Rule name is required"),
    body("actionOnMiss")
      .isIn([
        "pause_streak",
        "reset_streak",
        "grace_period",
        "fallback_reward",
        "no_action",
      ])
      .withMessage("Invalid action on miss"),
    body("graceDays")
      .optional()
      .isInt({ min: 0, max: 7 })
      .withMessage("Grace days must be between 0 and 7"),
    body("impactOnXP")
      .optional()
      .isBoolean()
      .withMessage("Impact on XP must be boolean"),
    body("resetCoins")
      .optional()
      .isBoolean()
      .withMessage("Reset coins must be boolean"),
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

      const pauseRule = new ChallengePauseRule(ruleData);
      await pauseRule.save();

      res.status(201).json({
        success: true,
        message: "Pause rule created successfully",
        data: pauseRule,
      });
    } catch (error) {
      console.error("Error creating pause rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create pause rule",
        error: error.message,
      });
    }
  }
);

// Update pause rule
router.put(
  "/pause-rules/:id",
  adminAuth,
  [
    body("ruleName")
      .optional()
      .notEmpty()
      .withMessage("Rule name cannot be empty"),
    body("actionOnMiss")
      .optional()
      .isIn([
        "pause_streak",
        "reset_streak",
        "grace_period",
        "fallback_reward",
        "no_action",
      ])
      .withMessage("Invalid action on miss"),
    body("graceDays")
      .optional()
      .isInt({ min: 0, max: 7 })
      .withMessage("Grace days must be between 0 and 7"),
    body("impactOnXP")
      .optional()
      .isBoolean()
      .withMessage("Impact on XP must be boolean"),
    body("resetCoins")
      .optional()
      .isBoolean()
      .withMessage("Reset coins must be boolean"),
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

      const updateData = {
        ...req.body,
        updatedBy: req.user.userId,
      };

      const pauseRule = await ChallengePauseRule.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!pauseRule) {
        return res.status(404).json({
          success: false,
          message: "Pause rule not found",
        });
      }

      res.json({
        success: true,
        message: "Pause rule updated successfully",
        data: pauseRule,
      });
    } catch (error) {
      console.error("Error updating pause rule:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update pause rule",
        error: error.message,
      });
    }
  }
);

// Delete pause rule
router.delete("/pause-rules/:id", adminAuth, async (req, res) => {
  try {
    const pauseRule = await ChallengePauseRule.findByIdAndDelete(req.params.id);

    if (!pauseRule) {
      return res.status(404).json({
        success: false,
        message: "Pause rule not found",
      });
    }

    res.json({
      success: true,
      message: "Pause rule deleted successfully",
      data: { id: pauseRule._id, ruleName: pauseRule.ruleName },
    });
  } catch (error) {
    console.error("Error deleting pause rule:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete pause rule",
      error: error.message,
    });
  }
});

// Toggle pause rule status
router.patch("/pause-rules/:id/status", adminAuth, async (req, res) => {
  try {
    const pauseRule = await ChallengePauseRule.findById(req.params.id);

    if (!pauseRule) {
      return res.status(404).json({
        success: false,
        message: "Pause rule not found",
      });
    }

    pauseRule.isActive = !pauseRule.isActive;
    pauseRule.updatedBy = req.user.userId;
    await pauseRule.save();

    res.json({
      success: true,
      message: `Pause rule ${
        pauseRule.isActive ? "activated" : "deactivated"
      } successfully`,
      data: { isActive: pauseRule.isActive },
    });
  } catch (error) {
    console.error("Error toggling pause rule status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle pause rule status",
      error: error.message,
    });
  }
});

// ==================== XP MULTIPLIER SETUP (Tier-Based) ====================

// Get XP multipliers (all, both active and inactive)
router.get("/xp-multipliers", adminAuth, async (req, res) => {
  try {
    const xpMultipliers = await XPMultiplier.find({ tier: { $exists: true } })
      .sort({ tier: 1 })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    res.json({
      success: true,
      data: xpMultipliers,
    });
  } catch (error) {
    console.error("Error getting XP multipliers:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get XP multipliers",
      error: error.message,
    });
  }
});

// Get specific XP multiplier
router.get("/xp-multipliers/:id", adminAuth, async (req, res) => {
  try {
    const xpMultiplier = await XPMultiplier.findById(req.params.id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!xpMultiplier) {
      return res.status(404).json({
        success: false,
        message: "XP multiplier not found",
      });
    }

    res.json({
      success: true,
      data: xpMultiplier,
    });
  } catch (error) {
    console.error("Error getting XP multiplier:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get XP multiplier",
      error: error.message,
    });
  }
});

// Create XP multiplier (tier-based)
router.post(
  "/xp-multipliers",
  adminAuth,
  [
    body("tier")
      .isIn(["JUNIOR", "MID", "SENIOR"])
      .withMessage("Tier must be one of JUNIOR, MID, SENIOR"),
    body("multiplier")
      .isFloat({ min: 0.01, max: 10.0 })
      .withMessage("Multiplier must be greater than 0 and at most 10.0"),
    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("Active status must be boolean"),
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

      const { tier, multiplier, isActive } = req.body;

      // Prevent duplicate tier configuration
      const existing = await XPMultiplier.findOne({ tier });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `A multiplier for tier ${tier} already exists`,
        });
      }

      const multiplierData = {
        tier,
        multiplier,
        isActive: typeof isActive === "boolean" ? isActive : true,
        createdBy: req.user.userId,
        // Reset legacy/advanced fields to safe defaults
        conditions: {},
        scheduling: {},
        vipOverlay: {},
        metadata: {},
      };

      const xpMultiplier = new XPMultiplier(multiplierData);
      await xpMultiplier.save();

      res.status(201).json({
        success: true,
        message: "XP multiplier created successfully",
        data: xpMultiplier,
      });
    } catch (error) {
      console.error("Error creating XP multiplier:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create XP multiplier",
        error: error.message,
      });
    }
  }
);

// Update XP multiplier
router.put(
  "/xp-multipliers/:id",
  adminAuth,
  [
    body("tier")
      .optional()
      .isIn(["JUNIOR", "MID", "SENIOR"])
      .withMessage("Tier must be one of JUNIOR, MID, SENIOR"),
    body("multiplier")
      .optional()
      .isFloat({ min: 0.01, max: 10.0 })
      .withMessage("Multiplier must be greater than 0 and at most 10.0"),
    body("isActive")
      .optional()
      .isBoolean()
      .withMessage("Active status must be boolean"),
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

      const { tier, multiplier, isActive } = req.body;

      // If tier is being changed, ensure no duplicate
      if (tier) {
        const existing = await XPMultiplier.findOne({
          _id: { $ne: req.params.id },
          tier,
        });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: `A multiplier for tier ${tier} already exists`,
          });
        }
      }

      const updateData = {
        updatedBy: req.user.userId,
      };

      if (tier) updateData.tier = tier;
      if (typeof multiplier === "number") updateData.multiplier = multiplier;
      if (typeof isActive === "boolean") updateData.isActive = isActive;

      const xpMultiplier = await XPMultiplier.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!xpMultiplier) {
        return res.status(404).json({
          success: false,
          message: "XP multiplier not found",
        });
      }

      res.json({
        success: true,
        message: "XP multiplier updated successfully",
        data: xpMultiplier,
      });
    } catch (error) {
      console.error("Error updating XP multiplier:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update XP multiplier",
        error: error.message,
      });
    }
  }
);

// Delete XP multiplier
router.delete("/xp-multipliers/:id", adminAuth, async (req, res) => {
  try {
    const xpMultiplier = await XPMultiplier.findByIdAndDelete(req.params.id);

    if (!xpMultiplier) {
      return res.status(404).json({
        success: false,
        message: "XP multiplier not found",
      });
    }

    res.json({
      success: true,
      message: "XP multiplier deleted successfully",
      data: { id: xpMultiplier._id, tier: xpMultiplier.tier },
    });
  } catch (error) {
    console.error("Error deleting XP multiplier:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete XP multiplier",
      error: error.message,
    });
  }
});

// Toggle XP multiplier status
router.patch("/xp-multipliers/:id/status", adminAuth, async (req, res) => {
  try {
    const xpMultiplier = await XPMultiplier.findById(req.params.id);

    if (!xpMultiplier) {
      return res.status(404).json({
        success: false,
        message: "XP multiplier not found",
      });
    }

    xpMultiplier.isActive = !xpMultiplier.isActive;
    xpMultiplier.updatedBy = req.user.userId;
    await xpMultiplier.save();

    res.json({
      success: true,
      message: `XP multiplier ${
        xpMultiplier.isActive ? "activated" : "deactivated"
      } successfully`,
      data: { isActive: xpMultiplier.isActive },
    });
  } catch (error) {
    console.error("Error toggling XP multiplier status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle XP multiplier status",
      error: error.message,
    });
  }
});

module.exports = router;

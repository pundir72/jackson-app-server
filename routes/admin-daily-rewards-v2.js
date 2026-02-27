/**
 * Admin Daily Rewards V2 Routes
 * Extended configuration (reward types, weekly multipliers, etc.)
 */

const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const { adminAuth } = require("../middleware/adminAuth");
const DailyRewardConfigV2 = require("../models/DailyRewardConfigV2");
const DailyRewardProgress = require("../models/DailyRewardProgress");
const {
  getISOWeekKey,
  getWeekBoundsUtc,
} = require("../utils/dailyRewardHelpersV2");

// ==================== REWARD CONFIGURATION V2 ====================

router.get("/config", adminAuth, async (req, res) => {
  try {
    // First try to find active config
    let config = await DailyRewardConfigV2.findOne({ isActive: true }).sort({
      version: -1,
    });

    // If no active config, return the most recent one (even if inactive)
    if (!config) {
      config = await DailyRewardConfigV2.findOne().sort({
        updatedAt: -1,
        createdAt: -1,
      });
    }

    if (!config) {
      return res.json({
        success: true,
        data: null,
        message: "No V2 configuration found. Please create one.",
      });
    }

    res.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("Error getting daily reward V2 config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get V2 configuration",
    });
  }
});

router.get("/configs", adminAuth, async (req, res) => {
  try {
    const configs = await DailyRewardConfigV2.find().sort({
      version: -1,
      createdAt: -1,
    });

    res.json({
      success: true,
      data: configs,
    });
  } catch (error) {
    console.error("Error listing V2 configs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list V2 configurations",
    });
  }
});

router.post(
  "/config",
  adminAuth,
  [
    body("version")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Version must be a positive integer"),
    body("days")
      .isArray({ min: 7, max: 7 })
      .withMessage("Must provide exactly 7 days"),
    body("days.*.dayNumber")
      .isInt({ min: 1, max: 7 })
      .withMessage("Day number must be 1-7"),
    body("days.*.rewardType")
      .optional()
      .isIn(["Coins", "XP", "Both"])
      .withMessage("Reward type must be Coins, XP, or Both"),
    body("days.*.coinValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Coin value must be non-negative"),
    body("days.*.xpValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("XP value must be non-negative"),
    body("bigReward.enabled").optional().isBoolean(),
    body("bigReward.rewardType").optional().isIn(["Coins", "XP", "Both"]),
    body("bigReward.coinValue").optional().isFloat({ min: 0 }),
    body("bigReward.xpValue").optional().isFloat({ min: 0 }),
    body("weeklyMultiplier.enabled").optional().isBoolean(),
    body("weeklyMultiplier.week2").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.week3").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.week4").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.additionalWeeks").optional().isArray(),
    body("weeklyMultiplier.additionalWeeks.*.weekNumber")
      .optional()
      .isInt({ min: 5 }),
    body("weeklyMultiplier.additionalWeeks.*.multiplier")
      .optional()
      .isFloat({ min: 1.0 }),
    body("weeklyMultiplier.roundingRule")
      .optional()
      .isIn(["Round Nearest", "Round Down"]),
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
        version,
        days,
        bigReward,
        fallbackReward,
        weeklyMultiplier,
        isActive,
      } = req.body;

      if (!days || days.length !== 7) {
        return res.status(400).json({
          success: false,
          error: "Must provide exactly 7 days",
        });
      }

      const dayNumbers = days.map((d) => d.dayNumber).sort();
      if (dayNumbers.join(",") !== "1,2,3,4,5,6,7") {
        return res.status(400).json({
          success: false,
          error: "Must provide exactly days 1-7 with unique dayNumber values",
        });
      }

      // Validate each day based on rewardType
      for (const day of days) {
        const rewardType = day.rewardType || "Both";

        if (rewardType === "Coins" || rewardType === "Both") {
          const coinValue =
            day.coinValue !== undefined ? day.coinValue : day.coins;
          if (coinValue === undefined || coinValue === null || coinValue < 0) {
            return res.status(400).json({
              success: false,
              error: `Day ${day.dayNumber}: Coin value is required when reward type is Coins or Both`,
            });
          }
        }

        if (rewardType === "XP" || rewardType === "Both") {
          const xpValue = day.xpValue !== undefined ? day.xpValue : day.xp;
          if (xpValue === undefined || xpValue === null || xpValue < 0) {
            return res.status(400).json({
              success: false,
              error: `Day ${day.dayNumber}: XP value is required when reward type is XP or Both`,
            });
          }
        }
      }

      // Validate Day-1 when active
      if (isActive !== false) {
        const day1 = days.find((d) => d.dayNumber === 1);
        if (!day1 || day1.active === false) {
          return res.status(400).json({
            success: false,
            error:
              "Day-1 must be configured and active if Daily Reward V2 is ON",
          });
        }
      }

      // Validate Big Reward when enabled
      if (bigReward && bigReward.enabled !== false) {
        const bigRewardType = bigReward.rewardType || "Both";

        if (bigRewardType === "Coins" || bigRewardType === "Both") {
          const coinValue =
            bigReward.coinValue !== undefined
              ? bigReward.coinValue
              : bigReward.coins;
          if (coinValue === undefined || coinValue === null || coinValue < 0) {
            return res.status(400).json({
              success: false,
              error:
                "Big Reward coin value is required when Big Reward Type is Coins or Both",
            });
          }
        }

        if (bigRewardType === "XP" || bigRewardType === "Both") {
          const xpValue =
            bigReward.xpValue !== undefined ? bigReward.xpValue : bigReward.xp;
          if (xpValue === undefined || xpValue === null || xpValue < 0) {
            return res.status(400).json({
              success: false,
              error:
                "Big Reward XP value is required when Big Reward Type is XP or Both",
            });
          }
        }
      }

      // Validate Weekly Multiplier
      if (weeklyMultiplier && weeklyMultiplier.enabled) {
        if (!weeklyMultiplier.week2 || weeklyMultiplier.week2 < 1.0) {
          return res.status(400).json({
            success: false,
            error:
              "Week 2 multiplier is required and must be >= 1.0 when Weekly Multiplier is enabled",
          });
        }

        if (!weeklyMultiplier.roundingRule) {
          return res.status(400).json({
            success: false,
            error:
              "Rounding rule is required when Weekly Multiplier is enabled",
          });
        }

        // Validate additionalWeeks if provided
        if (
          weeklyMultiplier.additionalWeeks &&
          Array.isArray(weeklyMultiplier.additionalWeeks)
        ) {
          // CRITICAL FIX: Check for duplicate weekNumbers within the current request
          // This prevents duplicate weekNumbers in the same submission
          // But allows re-adding after deletion (since we only check current request, not existing config)
          const weekNumbers = weeklyMultiplier.additionalWeeks
            .map((w) => w && w.weekNumber ? parseInt(w.weekNumber) : null)
            .filter((num) => num !== null);
          
          const uniqueWeekNumbers = [...new Set(weekNumbers)];
          if (weekNumbers.length !== uniqueWeekNumbers.length) {
            const duplicates = weekNumbers.filter((num, index) => weekNumbers.indexOf(num) !== index);
            return res.status(400).json({
              success: false,
              error: `Duplicate week numbers are not allowed in additional weeks. Found duplicate: Week ${duplicates[0]}`,
            });
          }

          // Validate each week entry
          for (const week of weeklyMultiplier.additionalWeeks) {
            if (!week.weekNumber || week.weekNumber < 5) {
              return res.status(400).json({
                success: false,
                error: `Additional week number must be >= 5, got ${week.weekNumber}`,
              });
            }
            if (!week.multiplier || week.multiplier < 1.0) {
              return res.status(400).json({
                success: false,
                error: `Week ${week.weekNumber} multiplier must be >= 1.0`,
              });
            }
          }
        }
      }

      // Deactivate old configs if setting this as active (V2 scope only)
      if (isActive !== false) {
        await DailyRewardConfigV2.updateMany(
          { isActive: true },
          { $set: { isActive: false } }
        );
      }

      // Ensure additionalWeeks is properly formatted (array of objects with weekNumber and multiplier)
      let formattedWeeklyMultiplier = weeklyMultiplier || { enabled: false };
      if (
        formattedWeeklyMultiplier.enabled &&
        formattedWeeklyMultiplier.additionalWeeks
      ) {
        // Filter out invalid entries and ensure proper formatting
        const validWeeks = formattedWeeklyMultiplier.additionalWeeks
          .filter((w) => w && w.weekNumber && w.multiplier)
          .map((w) => ({
            weekNumber: parseInt(w.weekNumber) || w.weekNumber,
            multiplier: parseFloat(w.multiplier) || w.multiplier,
          }));

        // CRITICAL FIX: Remove duplicates after formatting (safety check)
        // This ensures no duplicate weekNumbers even if validation above missed something
        const seenWeekNumbers = new Set();
        const uniqueWeeks = validWeeks.filter((w) => {
          if (seenWeekNumbers.has(w.weekNumber)) {
            console.warn(`Duplicate weekNumber ${w.weekNumber} detected after formatting, removing duplicate`);
            return false;
          }
          seenWeekNumbers.add(w.weekNumber);
          return true;
        });

        formattedWeeklyMultiplier = {
          ...formattedWeeklyMultiplier,
          additionalWeeks: uniqueWeeks,
        };
        console.log(
          "Formatted weeklyMultiplier with additionalWeeks:",
          JSON.stringify(formattedWeeklyMultiplier, null, 2)
        );
      }

      const config = new DailyRewardConfigV2({
        version: version || 1,
        days,
        bigReward: bigReward || {},
        fallbackReward: fallbackReward || {},
        weeklyMultiplier: formattedWeeklyMultiplier,
        isActive: isActive !== false,
        updatedBy: req.user.userId,
      });

      await config.save();

      res.status(201).json({
        success: true,
        message: "V2 configuration saved successfully",
        data: config,
      });
    } catch (error) {
      console.error("Error saving V2 config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to save V2 configuration",
        message: error.message,
      });
    }
  }
);

// PUT /api/admin/v2/daily-rewards/config/:id - Update existing config
router.put(
  "/config/:id",
  adminAuth,
  [
    body("version")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Version must be a positive integer"),
    body("days")
      .optional()
      .isArray({ min: 7, max: 7 })
      .withMessage("Must provide exactly 7 days"),
    body("days.*.dayNumber")
      .optional()
      .isInt({ min: 1, max: 7 })
      .withMessage("Day number must be 1-7"),
    body("days.*.rewardType")
      .optional()
      .isIn(["Coins", "XP", "Both"])
      .withMessage("Reward type must be Coins, XP, or Both"),
    body("days.*.coinValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Coin value must be non-negative"),
    body("days.*.xpValue")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("XP value must be non-negative"),
    body("bigReward.enabled").optional().isBoolean(),
    body("bigReward.rewardType").optional().isIn(["Coins", "XP", "Both"]),
    body("bigReward.coinValue").optional().isFloat({ min: 0 }),
    body("bigReward.xpValue").optional().isFloat({ min: 0 }),
    body("weeklyMultiplier.enabled").optional().isBoolean(),
    body("weeklyMultiplier.week2").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.week3").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.week4").optional().isFloat({ min: 1.0 }),
    body("weeklyMultiplier.additionalWeeks").optional().isArray(),
    body("weeklyMultiplier.additionalWeeks.*.weekNumber")
      .optional()
      .isInt({ min: 5 }),
    body("weeklyMultiplier.additionalWeeks.*.multiplier")
      .optional()
      .isFloat({ min: 1.0 }),
    body("weeklyMultiplier.roundingRule")
      .optional()
      .isIn(["Round Nearest", "Round Down"]),
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

      const config = await DailyRewardConfigV2.findById(req.params.id);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: "V2 configuration not found",
        });
      }

      const {
        version,
        days,
        bigReward,
        fallbackReward,
        weeklyMultiplier,
        isActive,
      } = req.body;

      // Validate days if provided
      if (days) {
        if (days.length !== 7) {
          return res.status(400).json({
            success: false,
            error: "Must provide exactly 7 days",
          });
        }

        const dayNumbers = days.map((d) => d.dayNumber).sort();
        if (dayNumbers.join(",") !== "1,2,3,4,5,6,7") {
          return res.status(400).json({
            success: false,
            error: "Must provide exactly days 1-7 with unique dayNumber values",
          });
        }

        // Validate each day based on rewardType
        for (const day of days) {
          const rewardType = day.rewardType || "Both";

          if (rewardType === "Coins" || rewardType === "Both") {
            const coinValue =
              day.coinValue !== undefined ? day.coinValue : day.coins;
            if (coinValue === undefined || coinValue === null || coinValue < 0) {
              return res.status(400).json({
                success: false,
                error: `Day ${day.dayNumber}: Coin value is required when reward type is Coins or Both`,
              });
            }
          }

          if (rewardType === "XP" || rewardType === "Both") {
            const xpValue = day.xpValue !== undefined ? day.xpValue : day.xp;
            if (xpValue === undefined || xpValue === null || xpValue < 0) {
              return res.status(400).json({
                success: false,
                error: `Day ${day.dayNumber}: XP value is required when reward type is XP or Both`,
              });
            }
          }
        }

        // Validate Day-1 when active
        if (isActive !== false) {
          const day1 = days.find((d) => d.dayNumber === 1);
          if (!day1 || day1.active === false) {
            return res.status(400).json({
              success: false,
              error:
                "Day-1 must be configured and active if Daily Reward V2 is ON",
            });
          }
        }
      }

      // Validate Big Reward when enabled
      if (bigReward && bigReward.enabled !== false) {
        const bigRewardType = bigReward.rewardType || "Both";

        if (bigRewardType === "Coins" || bigRewardType === "Both") {
          const coinValue =
            bigReward.coinValue !== undefined
              ? bigReward.coinValue
              : bigReward.coins;
          if (coinValue === undefined || coinValue === null || coinValue < 0) {
            return res.status(400).json({
              success: false,
              error:
                "Big Reward coin value is required when Big Reward Type is Coins or Both",
            });
          }
        }

        if (bigRewardType === "XP" || bigRewardType === "Both") {
          const xpValue =
            bigReward.xpValue !== undefined ? bigReward.xpValue : bigReward.xp;
          if (xpValue === undefined || xpValue === null || xpValue < 0) {
            return res.status(400).json({
              success: false,
              error:
                "Big Reward XP value is required when Big Reward Type is XP or Both",
            });
          }
        }
      }

      // Validate Weekly Multiplier
      if (weeklyMultiplier && weeklyMultiplier.enabled) {
        if (!weeklyMultiplier.week2 || weeklyMultiplier.week2 < 1.0) {
          return res.status(400).json({
            success: false,
            error:
              "Week 2 multiplier is required and must be >= 1.0 when Weekly Multiplier is enabled",
          });
        }

        if (!weeklyMultiplier.roundingRule) {
          return res.status(400).json({
            success: false,
            error:
              "Rounding rule is required when Weekly Multiplier is enabled",
          });
        }

        // Validate additionalWeeks if provided
        if (
          weeklyMultiplier.additionalWeeks &&
          Array.isArray(weeklyMultiplier.additionalWeeks)
        ) {
          // Check for duplicate weekNumbers
          const weekNumbers = weeklyMultiplier.additionalWeeks
            .map((w) => w && w.weekNumber ? parseInt(w.weekNumber) : null)
            .filter((num) => num !== null);
          
          const uniqueWeekNumbers = [...new Set(weekNumbers)];
          if (weekNumbers.length !== uniqueWeekNumbers.length) {
            const duplicates = weekNumbers.filter((num, index) => weekNumbers.indexOf(num) !== index);
            return res.status(400).json({
              success: false,
              error: `Duplicate week numbers are not allowed in additional weeks. Found duplicate: Week ${duplicates[0]}`,
            });
          }

          // Validate each week entry
          for (const week of weeklyMultiplier.additionalWeeks) {
            if (!week.weekNumber || week.weekNumber < 5) {
              return res.status(400).json({
                success: false,
                error: `Additional week number must be >= 5, got ${week.weekNumber}`,
              });
            }
            if (!week.multiplier || week.multiplier < 1.0) {
              return res.status(400).json({
                success: false,
                error: `Week ${week.weekNumber} multiplier must be >= 1.0`,
              });
            }
          }
        }
      }

      // Update fields
      if (version !== undefined) config.version = version;
      if (days) config.days = days;
      if (bigReward !== undefined) config.bigReward = bigReward;
      if (fallbackReward !== undefined) config.fallbackReward = fallbackReward;
      if (weeklyMultiplier !== undefined) {
        // Format additionalWeeks properly
        let formattedWeeklyMultiplier = weeklyMultiplier;
        if (
          formattedWeeklyMultiplier.enabled &&
          formattedWeeklyMultiplier.additionalWeeks
        ) {
          const validWeeks = formattedWeeklyMultiplier.additionalWeeks
            .filter((w) => w && w.weekNumber && w.multiplier)
            .map((w) => ({
              weekNumber: parseInt(w.weekNumber) || w.weekNumber,
              multiplier: parseFloat(w.multiplier) || w.multiplier,
            }));

          const seenWeekNumbers = new Set();
          const uniqueWeeks = validWeeks.filter((w) => {
            if (seenWeekNumbers.has(w.weekNumber)) {
              return false;
            }
            seenWeekNumbers.add(w.weekNumber);
            return true;
          });

          formattedWeeklyMultiplier = {
            ...formattedWeeklyMultiplier,
            additionalWeeks: uniqueWeeks,
          };
        }
        config.weeklyMultiplier = formattedWeeklyMultiplier;
      }
      if (isActive !== undefined) {
        // If activating this config, deactivate others
        if (isActive && !config.isActive) {
          await DailyRewardConfigV2.updateMany(
            { _id: { $ne: config._id }, isActive: true },
            { $set: { isActive: false } }
          );
        }
        
        // If deactivating, also deactivate all nested features
        if (isActive === false) {
          // Deactivate all days and their claimableOnLoginOnly
          if (config.days && config.days.length > 0) {
            config.days = config.days.map(day => ({
              ...day,
              active: false,
              claimableOnLoginOnly: false
            }));
          }
          
          // Deactivate big reward
          if (config.bigReward) {
            config.bigReward.enabled = false;
          }
          
          // Deactivate weekly multiplier
          if (config.weeklyMultiplier) {
            config.weeklyMultiplier.enabled = false;
          }
        }
        
        config.isActive = isActive;
      }

      config.updatedBy = req.user.userId;
      await config.save();

      res.json({
        success: true,
        message: "V2 configuration updated successfully",
        data: config,
      });
    } catch (error) {
      console.error("Error updating V2 config:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update V2 configuration",
        message: error.message,
      });
    }
  }
);

router.patch("/config/:id/toggle", adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfigV2.findById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: "V2 configuration not found",
      });
    }

    const newActiveState = !config.isActive;
    
    if (newActiveState) {
      // If activating, deactivate other configs
      await DailyRewardConfigV2.updateMany(
        { _id: { $ne: config._id }, isActive: true },
        { $set: { isActive: false } }
      );
    } else {
      // If deactivating, also deactivate all nested features
      if (config.days && config.days.length > 0) {
        config.days = config.days.map(day => ({
          ...day,
          active: false,
          claimableOnLoginOnly: false
        }));
      }
      
      if (config.bigReward) {
        config.bigReward.enabled = false;
      }
      
      if (config.weeklyMultiplier) {
        config.weeklyMultiplier.enabled = false;
      }
    }

    config.isActive = newActiveState;
    config.updatedBy = req.user.userId;
    await config.save();

    res.json({
      success: true,
      message: `V2 configuration ${
        config.isActive ? "activated" : "deactivated"
      }`,
      data: {
        id: config._id,
        isActive: config.isActive,
      },
    });
  } catch (error) {
    console.error("Error toggling V2 config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle V2 configuration",
    });
  }
});

router.delete("/config/:id", adminAuth, async (req, res) => {
  try {
    const config = await DailyRewardConfigV2.findById(req.params.id);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: "V2 configuration not found",
      });
    }

    if (config.isActive) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete active V2 configuration. Deactivate it first.",
      });
    }

    await config.deleteOne();

    res.json({
      success: true,
      message: "V2 configuration deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting V2 config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete V2 configuration",
    });
  }
});

// Reuse user progress & summary endpoints for analytics (same as V1)

router.get("/users/:userId/week", adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const weekKey = getISOWeekKey(date);

    const progress = await DailyRewardProgress.findOne({ userId, weekKey });

    if (!progress) {
      return res.json({
        success: true,
        data: null,
        message: "No progress found for this week",
      });
    }

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    console.error("Error getting user week progress V2:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user progress V2",
    });
  }
});

router.get("/users/:userId/history", adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { weeks = 10 } = req.query;

    const history = await DailyRewardProgress.find({ userId })
      .sort({ weekStart: -1 })
      .limit(parseInt(weeks));

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("Error getting user history V2:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user history V2",
    });
  }
});

router.get("/summary", adminAuth, async (req, res) => {
  try {
    const weekKey = req.query.weekKey || getISOWeekKey(new Date());

    const stats = await DailyRewardProgress.aggregate([
      { $match: { weekKey } },
      {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          bigRewardsGranted: {
            $sum: { $cond: ["$bigRewardGranted", 1, 0] },
          },
          perfectWeeks: {
            $sum: { $cond: ["$bigRewardEligible", 1, 0] },
          },
        },
      },
    ]);

    const dayStats = await DailyRewardProgress.aggregate([
      { $match: { weekKey } },
      { $unwind: "$days" },
      {
        $group: {
          _id: "$days.dayNumber",
          claimed: {
            $sum: { $cond: [{ $eq: ["$days.status", "claimed"] }, 1, 0] },
          },
          missed: {
            $sum: { $cond: [{ $eq: ["$days.status", "missed"] }, 1, 0] },
          },
          totalUsers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        weekKey,
        overall: stats[0] || {
          totalUsers: 0,
          bigRewardsGranted: 0,
          perfectWeeks: 0,
        },
        perDay: dayStats,
      },
    });
  } catch (error) {
    console.error("Error getting summary V2:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get summary V2",
    });
  }
});

module.exports = router;

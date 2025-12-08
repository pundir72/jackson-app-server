/**
 * Besitos Controller
 * Handles business logic for Besitos API integration
 * @module controllers/besitos
 */

const besitosService = require("../services/besitos.service");
const User = require("../models/User");
const Game = require("../models/Game");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const {
  getUserXpTier,
  getUserMembershipTier,
} = require("../utils/taskProgression");
const winston = require("winston");

// Create logger instance
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

/**
 * Get available offers
 * @route GET /api/besitos/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} category - Category filter
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Besitos offers", {
      userId: req.user?.id,
      queryParams,
    });

    const data = await besitosService.getOffers(queryParams);

    res.json({
      success: true,
      data: data?.data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos offers", {
      error: error.message,
      userId: req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch offers",
        code: "BESITOS_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Get user data from Besitos
 * @route GET /api/besitos/user-data/:userId
 * @param {string} userId - User ID
 * @access Private (requires authentication)
 */
exports.getUserData = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate that user can only access their own data (unless admin)
    // if (req.user.id !== userId) {
    //     return res.status(403).json({
    //         success: false,
    //         error: {
    //             message: 'Unauthorized to access this user data',
    //             code: 'FORBIDDEN'
    //         }
    //     });
    // }

    logger.info("Fetching Besitos user data", {
      requesterId: req.user?.id,
      targetUserId: userId,
    });

    // Fetch data from Besitos API
    const besitosResponse = await besitosService.getUserData(userId);

    // Handle different response structures from Besitos API
    // Response might be: { data: {...} } or directly the data object
    const besitosData = besitosResponse.data || besitosResponse;

    // Get user from database to apply progression rules
    const user = await User.findById(userId)
      .select("taskProgression games tasks xp vip")
      .lean();

    if (!user) {
      // If user not found in our DB, return besitos data as-is
      return res.json({
        success: true,
        data: besitosData,
        timestamp: new Date().toISOString(),
      });
    }

    // Build user profile for progression rule matching
    const gamesDownloaded = user.games?.length || 0;
    const membershipTier = getUserMembershipTier(user);
    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get user-based progression rule
    const progressionRuleLean = await TaskProgressionRule.findBestMatchForUser(
      userProfile
    );

    // Convert lean document to Mongoose instance if found (needed for instance methods like canUnlockTask)
    let progressionRule = null;
    if (progressionRuleLean) {
      progressionRule = new TaskProgressionRule(progressionRuleLean);
      console.log(
        `✅ Found progression rule: ${progressionRule.ruleName} (XP Tier: ${progressionRule.xpTier}, First Batch: ${progressionRule.firstBatchSize}, Next Batch: ${progressionRule.nextBatchSize})`
      );
    } else {
      console.log(
        `⚠️ No progression rule found for user (XP: ${userProfile.xp}, Games: ${userProfile.gamesPlayed}, Membership: ${userProfile.membershipTier})`
      );
    }

    // Get user's task progression data (convert Map to object if needed)
    const userTaskProgression = user.taskProgression || {};
    let taskProgressionMap = {};

    // Convert Map to object if it's a Map
    if (userTaskProgression instanceof Map) {
      for (const [key, value] of userTaskProgression.entries()) {
        taskProgressionMap[key] = value;
      }
    } else if (typeof userTaskProgression === "object") {
      taskProgressionMap = userTaskProgression;
    }

    // Process in_progress games to apply batch-based progression
    // Handle both structures: besitosData.in_progress or besitosData.data.in_progress
    const inProgressGames =
      besitosData.in_progress || besitosData.data?.in_progress || [];

    if (Array.isArray(inProgressGames) && inProgressGames.length > 0) {
      for (const game of inProgressGames) {
        // Find matching game in our database
        const gameDoc = await Game.findOne({
          gameId: game.id,
          sdkProvider: "besitos",
        }).lean();

        // If game not found in database, skip progression (game needs to be synced first)
        if (!gameDoc) {
          console.log(
            `⚠️ Game not found in database for besitos game ID: ${game.id}. Skipping progression.`
          );
          continue;
        }

        if (game.goals && Array.isArray(game.goals)) {
          const gameIdString = gameDoc._id.toString();

          // Get progression from database, or initialize from besitos goals
          let progression = taskProgressionMap[gameIdString];

          // Count sequential completed tasks from besitos goals
          // Sort goals by position to ensure sequential counting
          const sortedGoals = [...game.goals].sort((a, b) => {
            const posA = a.position || 0;
            const posB = b.position || 0;
            return posA - posB;
          });

          // Count sequential completions (tasks must be completed in order)
          let sequentialCompletedCount = 0;
          for (let i = 0; i < sortedGoals.length; i++) {
            if (sortedGoals[i].completed === true) {
              sequentialCompletedCount++;
            } else {
              // Stop counting if we hit an incomplete task (sequential requirement)
              break;
            }
          }

          // Use database progression if available, otherwise use besitos count
          let completedTasksCount =
            progression?.completedTasks || sequentialCompletedCount;

          // If no progression exists, initialize it
          if (!progression) {
            progression = {
              completedTasks: completedTasksCount,
              thresholdReached: false,
              rewardTransferred: false,
              coinBoxBalance: 0,
            };
          } else {
            // Use the maximum between database count and sequential besitos count
            progression.completedTasks = Math.max(
              progression.completedTasks || 0,
              sequentialCompletedCount
            );
            completedTasksCount = progression.completedTasks;
          }

          // Apply batch-based unlocking logic to each goal
          game.goals = game.goals.map((goal, index) => {
            const taskOrder = goal.position || index + 1;
            let isUnlocked = true;
            let unlockReason = "";
            let isLocked = false;

            // If goal is already completed, it's always unlocked
            if (goal.completed === true) {
              isUnlocked = true;
              unlockReason = "Completed";
              isLocked = false;
            } else if (progressionRule) {
              // Apply batch-based logic for incomplete goals
              const unlockCheck = progressionRule.canUnlockTask(
                completedTasksCount,
                taskOrder,
                progression.rewardTransferred || false
              );

              isUnlocked = unlockCheck.canUnlock;
              unlockReason = unlockCheck.reason || "";
              isLocked = !isUnlocked;
            }

            // Add progression information to goal
            return {
              ...goal,
              // Progression info
              progression: {
                isUnlocked: isUnlocked,
                isLocked: isLocked,
                unlockReason: unlockReason,
                batchNumber: progressionRule
                  ? taskOrder <= progressionRule.firstBatchSize
                    ? 1
                    : Math.ceil(
                        (taskOrder - progressionRule.firstBatchSize) /
                          progressionRule.nextBatchSize
                      ) + 1
                  : null,
              },
            };
          });

          // Update threshold status based on completed tasks
          if (
            progressionRule &&
            completedTasksCount >= progressionRule.firstBatchSize
          ) {
            progression.thresholdReached = true;
          }

          // Add game-level progression information
          game.taskProgression = {
            hasProgressionRule: !!progressionRule,
            firstBatchSize: progressionRule?.firstBatchSize || null,
            nextBatchSize: progressionRule?.nextBatchSize || null,
            maxBatches: progressionRule?.maxBatches || null,
            completedTasks: completedTasksCount,
            thresholdReached: progression.thresholdReached,
            rewardTransferred: progression.rewardTransferred || false,
            coinBoxBalance: progression.coinBoxBalance || 0,
            canTransfer:
              progression.thresholdReached &&
              !progression.rewardTransferred &&
              (progression.coinBoxBalance || 0) > 0,
          };
        }
      }
    }

    // Process available games to show progression info (if user has started them)
    // Handle both structures: besitosData.available or besitosData.data.available
    const availableGames =
      besitosData.available || besitosData.data?.available || [];

    if (Array.isArray(availableGames) && availableGames.length > 0) {
      for (const game of availableGames) {
        const gameDoc = await Game.findOne({
          gameId: game.id,
          sdkProvider: "besitos",
        }).lean();

        if (gameDoc) {
          const gameIdString = gameDoc._id.toString();
          const progression = taskProgressionMap[gameIdString];

          if (progression) {
            // User has started this game, add progression info
            game.taskProgression = {
              hasProgressionRule: !!progressionRule,
              completedTasks: progression.completedTasks || 0,
              thresholdReached: progression.thresholdReached || false,
              rewardTransferred: progression.rewardTransferred || false,
              coinBoxBalance: progression.coinBoxBalance || 0,
            };
          }
        }
      }
    }

    // Add user XP tier to response
    const userXpTier = getUserXpTier(user);

    // Ensure we're returning the correct structure
    const responseData = besitosData.data || besitosData;
    responseData.userXpTier = userXpTier;

    // Calculate total downloaded games from database
    const totalDownloadedGames = user.games?.length || 0;

    // Count games by status from besitos data
    const availableGamesCount = (
      besitosData.available ||
      besitosData.data?.available ||
      []
    ).length;
    const inProgressGamesCount = (
      besitosData.in_progress ||
      besitosData.data?.in_progress ||
      []
    ).length;
    const completedGamesCount = (
      besitosData.completed ||
      besitosData.data?.completed ||
      []
    ).length;

    // Add games summary to response
    responseData.totalDownloadedGames = totalDownloadedGames;
    responseData.gamesSummary = {
      total: totalDownloadedGames,
      available: availableGamesCount,
      inProgress: inProgressGamesCount,
      completed: completedGamesCount,
    };

    res.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos user data", {
      error: error.message,
      userId: req.params.userId,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch user data",
        code: "BESITOS_USER_DATA_ERROR",
      },
    });
  }
};

/**
 * Get conversions data (Admin only)
 * @route GET /api/besitos/conversions
 * @query {string} from - Start date (YYYY-MM-DD)
 * @query {string} to - End date (YYYY-MM-DD)
 * @query {string} status - Conversion status filter
 * @access Private (Admin only)
 */
exports.getConversions = async (req, res) => {
  try {
    // Admin-only check
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          message: "Admin access required",
          code: "ADMIN_ONLY",
        },
      });
    }

    const queryParams = req.query;

    logger.info("Fetching Besitos conversions", {
      adminId: req.user?.id,
      queryParams,
    });

    const data = await besitosService.getConversions(queryParams);

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos conversions", {
      error: error.message,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch conversions",
        code: "BESITOS_CONVERSIONS_ERROR",
      },
    });
  }
};

/**
 * Get surveys wall for user
 * @route GET /api/besitos/surveys/:userId
 * @param {string} userId - User ID
 * @query {string} platform - Platform filter
 * @access Private (requires authentication)
 */
exports.getSurveysWall = async (req, res) => {
  try {
    const { userId } = req.params;
    const queryParams = req.query;

    // Validate that user can only access their own surveys (unless admin)
    // if (req.user.id !== userId && req.user.role !== 'admin') {
    //     return res.status(403).json({
    //         success: false,
    //         error: {
    //             message: 'Unauthorized to access this user surveys',
    //             code: 'FORBIDDEN'
    //         }
    //     });
    // }

    logger.info("Fetching Besitos surveys wall", {
      requesterId: req.user?.id,
      targetUserId: userId,
      queryParams,
    });

    const data = await besitosService.getSurveysWall(userId, queryParams);

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos surveys wall", {
      error: error.message,
      userId: req.params.userId,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch surveys",
        code: "BESITOS_SURVEYS_ERROR",
      },
    });
  }
};

/**
 * Get user profiling questions
 * @route GET /api/besitos/user-profiling/:userId
 * @param {string} userId - User ID
 * @access Private (requires authentication)
 */
exports.getUserProfiling = async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate that user can only access their own profiling (unless admin)
    if (req.user.id !== userId && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: {
          message: "Unauthorized to access this user profiling",
          code: "FORBIDDEN",
        },
      });
    }

    logger.info("Fetching Besitos user profiling", {
      requesterId: req.user?.id,
      targetUserId: userId,
    });

    const data = await besitosService.getUserProfiling(userId);

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos user profiling", {
      error: error.message,
      userId: req.params.userId,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch user profiling",
        code: "BESITOS_PROFILING_ERROR",
      },
    });
  }
};

/**
 * Get messenger/upcoming goals
 * @route GET /api/besitos/messenger
 * @access Private (requires authentication)
 */
exports.getMessenger = async (req, res) => {
  try {
    logger.info("Fetching Besitos messenger data", {
      userId: req.user?.id,
    });

    const data = await besitosService.getMessenger(req.user?.id);

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Besitos messenger", {
      error: error.message,
      userId: req.user?.id,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch messenger data",
        code: "BESITOS_MESSENGER_ERROR",
      },
    });
  }
};

/**
 * Submit conversion/postback
 * @route POST /api/besitos/conversion
 * @body {Object} conversionData - Conversion data
 * @access Private (requires authentication)
 */
exports.submitConversion = async (req, res) => {
  try {
    const conversionData = {
      ...req.body,
      userId: req.user.id,
      timestamp: new Date().toISOString(),
    };

    logger.info("Submitting Besitos conversion", {
      userId: req.user?.id,
      conversionData,
    });

    const data = await besitosService.submitConversion(conversionData);

    res.json({
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error submitting Besitos conversion", {
      error: error.message,
      userId: req.user?.id,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to submit conversion",
        code: "BESITOS_CONVERSION_ERROR",
      },
    });
  }
};

/**
 * Health check
 * @route GET /api/besitos/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
  try {
    const health = await besitosService.healthCheck();

    res.json({
      success: true,
      data: health,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Health check failed",
        code: "HEALTH_CHECK_ERROR",
      },
    });
  }
};

/**
 * Besitos Controller
 * Handles business logic for Besitos API integration
 * @module controllers/besitos
 */

const besitosService = require("../services/besitos.service");
const User = require("../models/User");
const Game = require("../models/Game");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");
const {
  getUserXpTier,
  getUserMembershipTier,
} = require("../utils/taskProgression");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

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

    logger.info("Besitos user-data request received", {
      requesterId: req.user?.id,
      targetUserId: userId,
    });

    // Fetch data from Besitos API
    const besitosResponse = await besitosService.getUserData(userId);

    // Handle different response structures from Besitos API
    // Response might be: { data: {...} } or directly the data object
    const besitosData = besitosResponse.data || besitosResponse;
    logger.info("Besitos user-data response summary", {
      targetUserId: userId,
      responseKeys:
        besitosResponse && typeof besitosResponse === "object"
          ? Object.keys(besitosResponse)
          : "non_object_response",
      dataKeys:
        besitosData && typeof besitosData === "object"
          ? Object.keys(besitosData)
          : "non_object_data",
      inProgressCount:
        besitosData?.in_progress?.length ||
        besitosData?.data?.in_progress?.length ||
        0,
      completedCount:
        besitosData?.completed?.length ||
        besitosData?.data?.completed?.length ||
        0,
    });

    // Get user from database to apply progression rules
    const user = await User.findById(userId)
      .select("taskProgression games tasks xp vip")
      .lean();

    if (!user) {
      // If user not found in our DB, return besitos data as-is
      logger.warn("Besitos user-data: user not found in local DB", {
        targetUserId: userId,
      });
      // Return same structure as Bitlabs API (raw data, no wrapper) for frontend compatibility
      return res.json(besitosData);
    }
    logger.info("Besitos user-data local DB summary", {
      targetUserId: userId,
      localGamesCount: user.games?.length || 0,
      localTasksCount: user.tasks?.length || 0,
      localXp: user.xp?.current || 0,
      localVipTier: user.vip?.tier || user.vip?.level || "free",
    });

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

    // Get user's games sorted by download order (oldest first) for bonus task eligibility
    const userGames = user.games || [];
    const sortedGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    // Get WelcomeBonusTimer configuration for bonus tasks
    console.log("=== BONUS RULE FETCHING START ===");
    const bonusRule = await WelcomeBonusTimer.findOne({
      isActive: true,
      "gameBonusTasks.bonusTasks.0": { $exists: true },
      "gameBonusTasks.isEnabled": true,
    })
      .populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue"
      )
      .lean();

    if (bonusRule) {
      console.log("✅ Bonus rule found:", {
        maxGamesWithBonusTasks: bonusRule.maxGamesWithBonusTasks,
        maxBonusTasksPerGame: bonusRule.maxBonusTasksPerGame,
        gameBonusTasksCount: bonusRule.gameBonusTasks?.length || 0,
      });
    } else {
      console.log("⚠️ No active bonus rule found with enabled gameBonusTasks");
    }

    const maxGamesWithBonus = bonusRule?.maxGamesWithBonusTasks || 3;
    const eligibleGameIdsForBonus = sortedGames
      .slice(0, maxGamesWithBonus)
      .map((g) => String(g.gameId));

    console.log("Eligible games for bonus tasks:", {
      maxGamesWithBonus,
      totalUserGames: sortedGames.length,
      eligibleGameIds: eligibleGameIdsForBonus,
      sortedGamesOrder: sortedGames.map((g, idx) => ({
        position: idx + 1,
        gameId: String(g.gameId),
        installedAt: g.installedAt || g.date || g.firstPlayed,
      })),
    });
    console.log("=== BONUS RULE FETCHING END ===");

    // Get user's completed tasks and unlock timestamps for bonus tasks
    const userTasks = user.tasks || [];
    const bonusTaskUnlocks = {};
    userTasks.forEach((t) => {
      if (t.isBonusTask && t.unlockedAt) {
        bonusTaskUnlocks[t.taskId] = t.unlockedAt;
      }
    });

    // Process in_progress games to apply batch-based progression and bonus tasks
    // Handle both structures: besitosData.in_progress or besitosData.data.in_progress
    const inProgressGames =
      besitosData.in_progress || besitosData.data?.in_progress || [];
    const inProgressIds = Array.isArray(inProgressGames)
      ? inProgressGames.map((g) => g?.id).filter(Boolean)
      : [];
    logger.info("Besitos user-data in-progress details", {
      targetUserId: userId,
      inProgressCount: inProgressIds.length,
      inProgressIds,
    });
    if (inProgressIds.length > 0) {
      logger.info("Besitos in-progress ID list", {
        targetUserId: userId,
        ids: inProgressIds,
      });
    }

    if (Array.isArray(inProgressGames) && inProgressGames.length > 0) {
      for (const game of inProgressGames) {
        // Find matching game in our database
        const gameDoc = await Game.findOne({
          sdkProvider: "Besitos",
          $or: [
            { gameId: game.id },
            { "gameDetails.id": game.id },
            { "gameDetails.offer_id": game.id },
            { "metadata.externalId": game.id },
          ],
        }).lean();

        // If game not found in database, skip progression (game needs to be synced first)
        if (!gameDoc) {
          console.log(
            `⚠️ Game not found in database for besitos game ID: ${game.id}. Checked gameId/gameDetails.id/gameDetails.offer_id/metadata.externalId. Skipping progression.`
          );
          continue;
        }

        const gameIdString = gameDoc._id.toString();
        const currentGameIdString = String(gameDoc._id);

        // Check if this game is eligible for bonus tasks (in first N games)
        const isEligibleForBonus = eligibleGameIdsForBonus.some((id) => {
          if (id === currentGameIdString) return true;
          if (
            mongoose.Types.ObjectId.isValid(id) &&
            mongoose.Types.ObjectId.isValid(currentGameIdString)
          ) {
            return id === currentGameIdString;
          }
          return false;
        });

        console.log(
          "\n=== BONUS RULE CHECK FOR GAME:",
          gameDoc.title || game.id,
          "==="
        );
        console.log("Game ID (DB):", currentGameIdString);
        console.log("Is Eligible for Bonus:", isEligibleForBonus);
        console.log("Has Bonus Rule:", !!bonusRule);
        console.log(
          "Has gameBonusTasks:",
          !!(bonusRule?.gameBonusTasks?.length > 0)
        );

        // Get user's game data for bonus task calculations
        const userGame = userGames.find((g) => {
          const gId = String(g.gameId);
          return (
            gId === currentGameIdString ||
            gId === gameIdString ||
            (mongoose.Types.ObjectId.isValid(gId) &&
              mongoose.Types.ObjectId.isValid(currentGameIdString) &&
              gId === currentGameIdString)
          );
        });

        if (game.goals && Array.isArray(game.goals)) {
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

          // Add game-level progression information with full rule details
          game.taskProgression = {
            hasProgressionRule: !!progressionRule,
            ruleId: progressionRule?._id || progressionRuleLean?._id || null,
            ruleName:
              progressionRule?.ruleName ||
              progressionRuleLean?.ruleName ||
              null,
            appliedMilestones:
              progressionRule?.userMilestones ||
              progressionRuleLean?.userMilestones ||
              null,
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
            canUnlockNextTasks:
              progression.thresholdReached && progression.rewardTransferred,
          };

          // Add bonus task information if game is eligible
          if (isEligibleForBonus && bonusRule && bonusRule.gameBonusTasks) {
            console.log("✅ Game is eligible - checking for bonus config...");
            // Get the first enabled gameBonusTasks config as global template
            const gameBonusConfig = bonusRule.gameBonusTasks.find(
              (config) =>
                config.isEnabled &&
                config.bonusTasks &&
                config.bonusTasks.length > 0
            );

            if (gameBonusConfig) {
              console.log("✅ Bonus config found for game:", {
                gameId: gameBonusConfig.gameId,
                minimumEventThreshold: gameBonusConfig.minimumEventThreshold,
                completionDeadlineHours:
                  gameBonusConfig.completionDeadlineHours,
                bonusTasksCount: gameBonusConfig.bonusTasks?.length || 0,
              });
              const userInternalEvents = userGame?.playCount || 0;
              const minimumEventThreshold =
                gameBonusConfig.minimumEventThreshold;
              const completionDeadlineHours =
                gameBonusConfig.completionDeadlineHours || 24;

              // Get game download/install time
              const gameDownloadTime =
                userGame?.installedAt ||
                userGame?.firstPlayed ||
                userGame?.date ||
                new Date();

              // Get Task 1 unlock time (this will be the start time for the shared deadline)
              const firstTask = gameBonusConfig.bonusTasks
                .filter((bt) => bt.isEnabled)
                .sort((a, b) => a.order - b.order)[0];
              const firstTaskId = firstTask
                ? (firstTask.taskId._id || firstTask.taskId).toString()
                : null;
              const firstTaskUnlockTime = firstTaskId
                ? bonusTaskUnlocks[firstTaskId] || null
                : null;

              // Calculate shared deadline: All tasks share the same deadline starting from Task 1 unlock time
              let sharedDeadlineStartTime = firstTaskUnlockTime;
              if (!sharedDeadlineStartTime && firstTaskId) {
                // Task 1 will unlock now, so set the start time
                sharedDeadlineStartTime = new Date();
              }

              // Format bonus tasks with unlock status
              const formattedBonusTasks = gameBonusConfig.bonusTasks
                .filter((bt) => bt.isEnabled)
                .sort((a, b) => a.order - b.order)
                .map((bt, index) => {
                  const taskId = bt.taskId._id || bt.taskId;
                  const taskIdString = taskId.toString();
                  const userTask = userTasks.find(
                    (t) => t.taskId === taskIdString
                  );
                  const isCompleted = userTask?.completed || false;
                  const completedAt = userTask?.completedAt || null;

                  // Calculate unlock status based on ACTUAL completion
                  let isUnlocked = false;
                  let unlockReason = "";
                  let unlockTime = bonusTaskUnlocks[taskIdString] || null;

                  if (index === 0) {
                    // Task 1: Unlocks immediately (check if already unlocked or unlock now)
                    if (!unlockTime) {
                      // First time viewing - unlock it
                      isUnlocked = true;
                      unlockTime = new Date();
                      unlockReason = "Unlocks immediately";
                      // Update shared deadline start time
                      if (!sharedDeadlineStartTime) {
                        sharedDeadlineStartTime = unlockTime;
                      }
                    } else {
                      isUnlocked = true;
                      unlockReason = "Unlocked";
                    }
                  } else {
                    // Task 2 and 3: Require previous task completion AND event threshold
                    const previousTask = gameBonusConfig.bonusTasks.find(
                      (t) => t.order === bt.order - 1
                    );
                    const previousTaskId =
                      previousTask?.taskId._id || previousTask?.taskId;
                    const previousTaskIdString = previousTaskId.toString();
                    const previousUserTask = userTasks.find(
                      (t) => t.taskId === previousTaskIdString
                    );
                    const previousTaskCompleted =
                      previousUserTask?.completed || false;
                    const eventThresholdMet =
                      userInternalEvents >= minimumEventThreshold;

                    if (unlockTime) {
                      // Already unlocked
                      isUnlocked = true;
                      unlockReason = "Unlocked";
                    } else if (previousTaskCompleted && eventThresholdMet) {
                      // Should unlock now
                      isUnlocked = true;
                      unlockTime = new Date();
                      unlockReason =
                        "Previous task completed and event threshold met";
                    } else if (!previousTaskCompleted) {
                      unlockReason = `Complete Bonus Task ${
                        bt.order - 1
                      } first`;
                    } else if (!eventThresholdMet) {
                      unlockReason = `Reach ${minimumEventThreshold} internal events (current: ${userInternalEvents})`;
                    }
                  }

                  // Calculate shared completion deadline: All tasks share the same deadline
                  // Deadline starts from when Task 1 unlocks (sharedDeadlineStartTime)
                  const completionDeadline = sharedDeadlineStartTime
                    ? new Date(
                        sharedDeadlineStartTime.getTime() +
                          completionDeadlineHours * 60 * 60 * 1000
                      )
                    : null;
                  const now = new Date();
                  const isExpired = completionDeadline
                    ? now > completionDeadline
                    : false;
                  const timeRemaining = completionDeadline
                    ? Math.max(0, completionDeadline.getTime() - now.getTime())
                    : null;

                  return {
                    taskId: taskIdString,
                    order: bt.order,
                    name: bt.taskId.name || null,
                    description: bt.taskId.description || null,
                    completionRule: bt.taskId.completionRule || null,
                    rewardType: bt.taskId.rewardType || null,
                    rewardValue: bt.taskId.rewardValue || null,
                    unlockCondition:
                      bt.unlockCondition ||
                      "Unlock this Bonus Task after Minimum Event Threshold is met.",
                    isUnlocked: isUnlocked,
                    isCompleted: isCompleted,
                    completedAt: completedAt,
                    isExpired: isExpired,
                    unlockReason: unlockReason,
                    unlockTime: unlockTime,
                    completionDeadlineHours: completionDeadlineHours,
                    completionDeadline: completionDeadline,
                    timeRemaining: timeRemaining,
                    minimumEventThreshold: minimumEventThreshold,
                    userInternalEvents: userInternalEvents,
                  };
                });

              // Add bonus tasks info to game
              game.bonusTasks = {
                hasBonusTasks: true,
                isEligible: true,
                minimumEventThreshold: minimumEventThreshold,
                completionDeadlineHours: completionDeadlineHours,
                taskLogic: "sequential",
                bonusTasks: formattedBonusTasks,
                userProgress: {
                  internalEvents: userInternalEvents,
                  eventThresholdMet:
                    userInternalEvents >= minimumEventThreshold,
                  gameDownloadTime: gameDownloadTime,
                },
                maxGamesWithBonusTasks: maxGamesWithBonus,
                userDownloadOrder:
                  sortedGames.findIndex(
                    (g) => String(g.gameId) === currentGameIdString
                  ) + 1,
              };
              console.log("✅ Bonus tasks added to game:", {
                bonusTasksCount: formattedBonusTasks.length,
                unlockedCount: formattedBonusTasks.filter((bt) => bt.isUnlocked)
                  .length,
                completedCount: formattedBonusTasks.filter(
                  (bt) => bt.isCompleted
                ).length,
              });
            } else {
              // Game is eligible but no bonus config found
              console.log(
                "⚠️ Game is eligible but no enabled gameBonusConfig found"
              );
              game.bonusTasks = {
                hasBonusTasks: false,
                isEligible: true,
                bonusTasks: [],
                message: "No bonus tasks configured",
              };
            }
          } else {
            // Game is not eligible for bonus tasks
            if (!isEligibleForBonus) {
              console.log(
                `❌ Game not eligible: Not in first ${maxGamesWithBonus} games`
              );
            } else if (!bonusRule) {
              console.log("❌ No bonus rule found");
            } else if (
              !bonusRule.gameBonusTasks ||
              bonusRule.gameBonusTasks.length === 0
            ) {
              console.log("❌ Bonus rule has no gameBonusTasks configured");
            }
            game.bonusTasks = {
              hasBonusTasks: false,
              isEligible: false,
              bonusTasks: [],
              message: `Bonus tasks are only available for your first ${maxGamesWithBonus} downloaded games`,
              maxGamesWithBonusTasks: maxGamesWithBonus,
            };
          }
          console.log("=== END BONUS RULE CHECK FOR GAME ===\n");
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
            // User has started this game, add progression info with full rule details
            game.taskProgression = {
              hasProgressionRule: !!progressionRule,
              ruleId: progressionRule?._id || progressionRuleLean?._id || null,
              ruleName:
                progressionRule?.ruleName ||
                progressionRuleLean?.ruleName ||
                null,
              appliedMilestones:
                progressionRule?.userMilestones ||
                progressionRuleLean?.userMilestones ||
                null,
              firstBatchSize: progressionRule?.firstBatchSize || null,
              nextBatchSize: progressionRule?.nextBatchSize || null,
              maxBatches: progressionRule?.maxBatches || null,
              completedTasks: progression.completedTasks || 0,
              thresholdReached: progression.thresholdReached || false,
              rewardTransferred: progression.rewardTransferred || false,
              coinBoxBalance: progression.coinBoxBalance || 0,
              canTransfer:
                progression.thresholdReached &&
                !progression.rewardTransferred &&
                (progression.coinBoxBalance || 0) > 0,
              canUnlockNextTasks:
                progression.thresholdReached && progression.rewardTransferred,
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

    // Add task progression rule information to response (global rule applied to user)
    if (progressionRule || progressionRuleLean) {
      responseData.taskProgressionRule = {
        ruleId: progressionRule?._id || progressionRuleLean?._id || null,
        ruleName:
          progressionRule?.ruleName || progressionRuleLean?.ruleName || null,
        appliedMilestones:
          progressionRule?.userMilestones ||
          progressionRuleLean?.userMilestones ||
          null,
        firstBatchSize:
          progressionRule?.firstBatchSize ||
          progressionRuleLean?.firstBatchSize ||
          null,
        nextBatchSize:
          progressionRule?.nextBatchSize ||
          progressionRuleLean?.nextBatchSize ||
          null,
        maxBatches:
          progressionRule?.maxBatches ||
          progressionRuleLean?.maxBatches ||
          null,
        priority:
          progressionRule?.priority || progressionRuleLean?.priority || null,
      };
    } else {
      responseData.taskProgressionRule = null;
    }

    // Return same structure as Bitlabs API (raw data, no wrapper) for frontend compatibility
    // Frontend can use same code for both Besitos and Bitlabs responses
    res.json(responseData);
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

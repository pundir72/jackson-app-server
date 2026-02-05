const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");
const Game = require("../models/Game");
const Transaction = require("../models/Transaction");
const besitosService = require("../services/besitos.service");
const mongoose = require("mongoose");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

/**
 * GET /api/welcome-bonus-tasks
 * Get all welcome bonus tasks for user's downloaded games
 * Returns bonus tasks for games that user has downloaded and match the admin configuration
 */
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user from database (not lean - need to save)
    const user = await User.findById(userId).select("games tasks xp wallet");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get user's downloaded games from besitos API
    const besitosResponse = await besitosService.getUserData(userId);
    const besitosData = besitosResponse.data || besitosResponse;

    // Get all downloaded games (in_progress and completed)
    const inProgressGames =
      besitosData.in_progress || besitosData.data?.in_progress || [];
    const completedGames =
      besitosData.completed || besitosData.data?.completed || [];
    const downloadedGames = [...inProgressGames, ...completedGames];

    // Create sets for faster lookup
    const inProgressGameIds = new Set(inProgressGames.map((g) => g.id));
    const completedGameIds = new Set(completedGames.map((g) => g.id));

    console.log(
      `[Welcome Bonus Tasks] User has ${downloadedGames.length} downloaded games`,
    );
    console.log(
      `[Welcome Bonus Tasks] Downloaded game IDs:`,
      downloadedGames.map((g) => g.id),
    );

    // Get WelcomeBonusTimer configuration with game bonus tasks
    const bonusRule = await WelcomeBonusTimer.findOne({ isActive: true })
      .populate("gameBonusTasks.gameId", "title gameId sdkProvider gameDetails")
      .populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue besitosGoalId goalId",
      )
      .lean();

    if (
      !bonusRule ||
      !bonusRule.gameBonusTasks ||
      bonusRule.gameBonusTasks.length === 0
    ) {
      console.log(
        `[Welcome Bonus Tasks] No bonus rule or gameBonusTasks found`,
      );
      return res.json({
        success: true,
        data: {
          games: [],
          message: "No bonus tasks configured",
        },
      });
    }

    console.log(
      `[Welcome Bonus Tasks] Bonus rule found with ${bonusRule.gameBonusTasks.length} game configurations`,
    );
    console.log(
      `[Welcome Bonus Tasks] Configured game IDs:`,
      bonusRule.gameBonusTasks.map((c) => String(c.gameId._id || c.gameId)),
    );

    // Get user's completed tasks for bonus tasks
    const userTasks = user.tasks || [];
    const userTaskMap = {};
    userTasks.forEach((task) => {
      if (task.taskId) {
        userTaskMap[task.taskId.toString()] = {
          completed: task.completed || false,
          completedAt: task.completedAt || task.date || null,
          unlockedAt: task.unlockedAt || null,
        };
      }
    });

    // Get user's games sorted by download order (oldest first)
    const userGames = user.games || [];
    console.log(
      `[Welcome Bonus Tasks] User has ${userGames.length} games in user.games`,
    );
    console.log(
      `[Welcome Bonus Tasks] User game IDs:`,
      userGames.map((g) => String(g.gameId)),
    );

    const sortedGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    const maxGamesWithBonus = bonusRule.maxGamesWithBonusTasks || 3;

    // Build eligible game IDs from bonus configuration gameGameId (real game IDs)
    const configuredGameIds = bonusRule.gameBonusTasks
      .filter(config => config.isEnabled && config.bonusTasks && config.bonusTasks.length > 0)
      .map(config => config.gameId?.gameId)
      .filter(gameGameId => gameGameId); // Remove null/undefined

    console.log(
      `[Welcome Bonus Tasks] Configured real game IDs from admin:`,
      configuredGameIds,
    );

    // Build a map of configs for quick lookup
    const configMap = {};
    bonusRule.gameBonusTasks.forEach(config => {
      if (config.isEnabled && config.bonusTasks && config.bonusTasks.length > 0) {
        const gameGameId = config.gameId?.gameId;
        if (gameGameId) {
          configMap[gameGameId] = config;
        }
      }
    });

    console.log(
      `[Welcome Bonus Tasks] Built config map with ${Object.keys(configMap).length} games`,
    );
    console.log(
      `[Welcome Bonus Tasks] Downloaded games matching bonus config:`,
      downloadedGames.filter(g => configuredGameIds.includes(g.id)).map(g => ({
        gameGameId: g.id,
        title: g.title || "N/A",
      })),
    );

    // Match downloaded games with bonus task configurations
    const gamesWithBonusTasks = [];

    // Track rewards awarded in this request to avoid duplicates
    const rewardsAwarded = [];

    // Get user's current XP for tier multiplier
    const userXp = user.xp?.current || 0;

    for (const downloadedGame of downloadedGames) {
      console.log(
        `[Welcome Bonus Tasks] Processing downloaded game: ${downloadedGame.title} (ID: ${downloadedGame.id})`,
      );

      // Find bonus task configuration for this game FIRST by gameGameId (Besitos game ID)
      // This is the PRIMARY matching method - match directly by gameGameId from admin config
      const gameBonusConfig = bonusRule.gameBonusTasks.find((config) => {
        if (
          !config.isEnabled ||
          !config.bonusTasks ||
          config.bonusTasks.length === 0
        ) {
          return false;
        }

        // PRIMARY MATCH: Match by gameGameId (Besitos game ID from populated game document)
        // This is config.gameId?.gameId which should match downloadedGame.id
        const gameGameId = config.gameId?.gameId || null;
        if (gameGameId && gameGameId === downloadedGame.id) {
          console.log(
            `[Welcome Bonus Tasks] ✅ Matched by gameGameId: ${gameGameId} === ${downloadedGame.id}`,
          );
          return true;
        }

        return false;
      });

      // If no bonus config found by gameGameId, skip this game
      if (!gameBonusConfig) {
        console.log(
          `[Welcome Bonus Tasks] ⚠️ No bonus config found for game: ${downloadedGame.title} (Besitos ID: ${downloadedGame.id})`,
        );
        console.log(
          `[Welcome Bonus Tasks] Available configs (gameGameId):`,
          bonusRule.gameBonusTasks.map((c) => ({
            gameGameId: c.gameId?.gameId || "N/A",
            configGameId: String(c.gameId._id || c.gameId),
            gameTitle: c.gameId?.title || "N/A",
            isEnabled: c.isEnabled,
            hasTasks: !!(c.bonusTasks && c.bonusTasks.length > 0),
            matches: c.gameId?.gameId === downloadedGame.id ? "✅ MATCH" : "❌",
          })),
        );
        continue;
      }

      console.log(
        `[Welcome Bonus Tasks] ✅ Bonus config found for game: ${downloadedGame.title} with ${gameBonusConfig.bonusTasks.length} tasks`,
      );

      // Try to find game in database (optional - for additional data)
      const gameDoc = await Game.findOne({
        gameId: downloadedGame.id,
        sdkProvider: "besitos",
      }).lean();

      const gameIdString = gameDoc ? gameDoc._id.toString() : null;
      if (gameDoc) {
        console.log(
          `[Welcome Bonus Tasks] ✅ Game found in DB: ${gameDoc.title} (DB ID: ${gameIdString}, Besitos ID: ${downloadedGame.id})`,
        );
      } else {
        console.log(
          `[Welcome Bonus Tasks] ⚠️ Game not in DB but has bonus config: ${downloadedGame.title} (Besitos ID: ${downloadedGame.id})`,
        );
      }

      // Check eligibility: Only show games that match bonus config gameGameId
      let isEligibleForBonus = false;

      // Check if this downloaded game ID exists in configured game IDs (real game IDs)
      if (configuredGameIds.includes(downloadedGame.id)) {
        isEligibleForBonus = true;
        console.log(
          `[Welcome Bonus Tasks] ✅ Game ${downloadedGame.title} (${downloadedGame.id}) matches bonus config`,
        );
      } else {
        console.log(
          `[Welcome Bonus Tasks] ⚠️ Game ${downloadedGame.title} (${downloadedGame.id}) not in bonus config`,
        );
      }

      if (!isEligibleForBonus) {
        console.log(
          `[Welcome Bonus Tasks] ⚠️ Game ${downloadedGame.title} not eligible (no bonus config found)`,
        );
        continue;
      }

      // Limit to maxGamesWithBonus
      if (gamesWithBonusTasks.length >= maxGamesWithBonus) {
        console.log(
          `[Welcome Bonus Tasks] Reached max games limit (${maxGamesWithBonus}), stopping`,
        );
        break;
      }

      // Limit to maxGamesWithBonus
      if (gamesWithBonusTasks.length >= maxGamesWithBonus) {
        console.log(
          `[Welcome Bonus Tasks] Reached max games limit (${maxGamesWithBonus}), stopping`,
        );
        break;
      }

      if (!gameBonusConfig) {
        console.log(
          `[Welcome Bonus Tasks] ⚠️ No bonus config found for game: ${downloadedGame.title}`,
        );
        console.log(
          `[Welcome Bonus Tasks] Looking for: DB ID=${gameIdString}, Besitos ID=${downloadedGame.id}`,
        );
        console.log(
          `[Welcome Bonus Tasks] Available configs:`,
          bonusRule.gameBonusTasks.map((c) => ({
            configGameId: String(c.gameId._id || c.gameId),
            populatedGameId: c.gameId?.gameId || "N/A",
            gameTitle: c.gameId?.title || "N/A",
            isEnabled: c.isEnabled,
            hasTasks: !!(c.bonusTasks && c.bonusTasks.length > 0),
          })),
        );
        continue;
      }

      console.log(
        `[Welcome Bonus Tasks] ✅ Bonus config found for game: ${downloadedGame.title} with ${gameBonusConfig.bonusTasks.length} tasks`,
      );

      // Get user's game data for bonus task calculations
      const userGame = userGames.find((g) => {
        const gId = String(g.gameId);
        return (
          gId === gameIdString ||
          (mongoose.Types.ObjectId.isValid(gId) &&
            mongoose.Types.ObjectId.isValid(gameIdString) &&
            gId === gameIdString)
        );
      });

      // Count completed goals for event threshold
      const completedGoalsCount = (downloadedGame.goals && Array.isArray(downloadedGame.goals))
        ? downloadedGame.goals.filter(goal => goal.completed === true).length
        : 0;
      
      const userInternalEvents = completedGoalsCount; // Use completed goals count as events
      const minimumEventThreshold = gameBonusConfig.minimumEventThreshold;
      const completionDeadlineHours =
        gameBonusConfig.completionDeadlineHours || 24;

      // Get game download/install time
      const gameDownloadTime =
        userGame?.installedAt ||
        userGame?.firstPlayed ||
        userGame?.date ||
        new Date();

      // --- PART 1: CALCULATE THE SINGLE SHARED DEADLINE ---
      let sharedDeadlineStartTime = null;
      const hoursAllowed = gameBonusConfig.completionDeadlineHours || 24;

      if (downloadedGame.goals && Array.isArray(downloadedGame.goals)) {
        // Find the absolute first goal ever completed for this game
        const completedGoals = downloadedGame.goals
          .filter((goal) => goal.completed === true && goal.completed_datetime)
          .sort((a, b) => new Date(a.completed_datetime) - new Date(b.completed_datetime));

        if (completedGoals.length > 0) {
          // Handle different datetime formats - keep original format for response
          const datetimeStr = completedGoals[0].completed_datetime;
          sharedDeadlineStartTime = datetimeStr.includes(' ') 
            ? new Date(datetimeStr.replace(' ', 'T') + 'Z') // Convert "2026-02-04 03:57:20" to ISO format
            : new Date(datetimeStr);
          console.log(`[Welcome Bonus] Timer started at: ${sharedDeadlineStartTime}`);
        } else {
          console.log(`[Welcome Bonus] No goals completed yet. Timer pending.`);
        }
      }

      // Calculate the one and only deadline for this game
      const gameDeadline = sharedDeadlineStartTime
        ? new Date(sharedDeadlineStartTime.getTime() + hoursAllowed * 60 * 60 * 1000)
        : null;

      // Helper function to format datetime in "YYYY-MM-DD HH:MM:SS" format
      const formatDateTime = (date) => {
        if (!date) return null;
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      const now = new Date();
      // --- END PART 1 ---

      // Format bonus tasks with unlock status
      // CRITICAL: Use Promise.all with map to handle async operations properly
      const bonusTasksToProcess = gameBonusConfig.bonusTasks
        .filter((bt) => bt.isEnabled)
        .sort((a, b) => a.order - b.order);

      const formattedBonusTasks = await Promise.all(
        bonusTasksToProcess.map(async (bt, index) => {
          const taskId = bt.taskId._id || bt.taskId;
          const taskIdString = taskId.toString();
          const userTask = userTaskMap[taskIdString];

          // Check completion from user tasks first
          let isCompleted = userTask?.completed || false;
          let completedAt = userTask?.completedAt || null;

          // Also check completion from Besitos API goals
          // Match by: 1) goal_id (besitosGoalId), 2) goal name/text
          let matchingGoal = null;
          const taskBesitosGoalId =
            bt.taskId?.besitosGoalId || bt.taskId?.goalId || null;
          const taskName = bt.taskId?.name || null;

          if (downloadedGame.goals && Array.isArray(downloadedGame.goals)) {
            // PRIMARY MATCH: Match by goal_id (besitosGoalId)
            if (taskBesitosGoalId) {
              matchingGoal = downloadedGame.goals.find(
                (goal) =>
                  (goal.goal_id === taskBesitosGoalId ||
                    goal.id === taskBesitosGoalId) &&
                  goal.completed === true,
              );
            }

            // SECONDARY MATCH: Match by goal name/text (case-insensitive)
            if (!matchingGoal && taskName) {
              const normalizedTaskName = taskName.toLowerCase().trim();
              matchingGoal = downloadedGame.goals.find((goal) => {
                const goalText = (goal.text || goal.name || "")
                  .toLowerCase()
                  .trim();
                // Exact match or contains key phrases
                const isMatch =
                  goalText === normalizedTaskName ||
                  (normalizedTaskName.includes("installed") &&
                    goalText.includes("installed")) ||
                  (normalizedTaskName.includes("install") &&
                    goalText.includes("install")) ||
                  (normalizedTaskName.includes("reach level") &&
                    goalText.includes("reach level") &&
                    normalizedTaskName.replace(/\D/g, "") ===
                      goalText.replace(/\D/g, "")); // Match level numbers
                return isMatch && goal.completed === true;
              });
              if (matchingGoal) {
                console.log(
                  `[Welcome Bonus Tasks] ✅ Matched by name: "${taskName}" === "${matchingGoal.text || matchingGoal.name}"`,
                );
              }
            }
          }

          if (matchingGoal) {
            isCompleted = true;
            // Use Besitos completion datetime if available
            if (matchingGoal.completed_datetime && !completedAt) {
              completedAt = matchingGoal.completed_datetime;
            }
            console.log(
              `[Welcome Bonus Tasks] ✅ Task ${bt.order} (${taskName || "Unknown"}) completed via Besitos API (goal_id: ${matchingGoal.goal_id || matchingGoal.id}, text: ${matchingGoal.text || "N/A"})`,
            );

            // Update user task status in database if not already completed
            if (!userTask || !userTask.completed) {
              // Ensure user.tasks array exists
              if (!user.tasks) {
                user.tasks = [];
              }

              // Find or create user task
              const existingUserTaskIndex = user.tasks.findIndex(
                (t) =>
                  t.taskId &&
                  (t.taskId.toString() === taskIdString ||
                    String(t.taskId) === taskIdString),
              );

              const completedDateTime = matchingGoal.completed_datetime
                ? new Date(matchingGoal.completed_datetime)
                : new Date();

              if (existingUserTaskIndex >= 0) {
                // Update existing task
                user.tasks[existingUserTaskIndex].completed = true;
                user.tasks[existingUserTaskIndex].completedAt =
                  completedDateTime;
                if (!user.tasks[existingUserTaskIndex].date) {
                  user.tasks[existingUserTaskIndex].date = completedDateTime;
                }
                console.log(
                  `[Welcome Bonus Tasks] 📝 Updated user task status for task ${bt.order} (${taskName || "Unknown"})`,
                );
              } else {
                // Create new task entry
                user.tasks.push({
                  taskId: mongoose.Types.ObjectId.isValid(taskId)
                    ? taskId
                    : mongoose.Types.ObjectId(taskIdString),
                  completed: true,
                  completedAt: completedDateTime,
                  date: completedDateTime,
                });
                console.log(
                  `[Welcome Bonus Tasks] 📝 Created new user task entry for task ${bt.order} (${taskName || "Unknown"})`,
                );
              }
            }
          }

          // Calculate unlock status based on ACTUAL completion
          let isUnlocked = false;
          let unlockReason = "";
          let unlockTime = userTask?.unlockedAt || null;

          if (index === 0) {
            // Task 1: Unlocks only when event threshold is met
            const eventThresholdMet = userInternalEvents >= minimumEventThreshold;
            
            if (unlockTime) {
              // Already unlocked
              isUnlocked = true;
              unlockReason = "Unlocked";
            } else if (eventThresholdMet) {
              // Threshold met - unlock now
              isUnlocked = true;
              unlockTime = new Date();
              unlockReason = "Event threshold met";
            } else {
              // Threshold not met - keep locked
              isUnlocked = false;
              unlockReason = `Complete ${minimumEventThreshold} events first (current: ${userInternalEvents})`;
            }
          } else {
            // Task 2 and 3: Require previous task completion AND event threshold
            const previousTask = gameBonusConfig.bonusTasks.find(
              (t) => t.order === bt.order - 1,
            );
            const previousTaskId =
              previousTask?.taskId._id || previousTask?.taskId;
            const previousTaskIdString = previousTaskId.toString();
            const previousUserTask = userTaskMap[previousTaskIdString];
            let previousTaskCompleted = previousUserTask?.completed || false;

            // Also check previous task completion from Besitos API goals
            // Match by: 1) goal_id, 2) goal name/text
            const previousTaskBesitosGoalId =
              previousTask?.taskId?.besitosGoalId ||
              previousTask?.taskId?.goalId ||
              null;
            const previousTaskName = previousTask?.taskId?.name || null;

            if (downloadedGame.goals && Array.isArray(downloadedGame.goals)) {
              let previousMatchingGoal = null;

              // PRIMARY: Match by goal_id
              if (previousTaskBesitosGoalId) {
                previousMatchingGoal = downloadedGame.goals.find(
                  (goal) =>
                    (goal.goal_id === previousTaskBesitosGoalId ||
                      goal.id === previousTaskBesitosGoalId) &&
                    goal.completed === true,
                );
              }

              // SECONDARY: Match by name/text
              if (!previousMatchingGoal && previousTaskName) {
                const normalizedTaskName = previousTaskName
                  .toLowerCase()
                  .trim();
                previousMatchingGoal = downloadedGame.goals.find((goal) => {
                  const goalText = (goal.text || goal.name || "")
                    .toLowerCase()
                    .trim();
                  const isMatch =
                    goalText === normalizedTaskName ||
                    (normalizedTaskName.includes("installed") &&
                      goalText.includes("installed")) ||
                    (normalizedTaskName.includes("install") &&
                      goalText.includes("install")) ||
                    (normalizedTaskName.includes("reach level") &&
                      goalText.includes("reach level") &&
                      normalizedTaskName.replace(/\D/g, "") ===
                        goalText.replace(/\D/g, ""));
                  return isMatch && goal.completed === true;
                });
              }

              if (previousMatchingGoal) {
                previousTaskCompleted = true;
              }
            }
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
              unlockReason = "Previous task completed and event threshold met";
            } else if (!previousTaskCompleted) {
              unlockReason = `Complete Bonus Task ${bt.order - 1} first`;
            } else if (!eventThresholdMet) {
              unlockReason = `Reach ${minimumEventThreshold} internal events (current: ${userInternalEvents})`;
            }
          }

            // USE THE SHARED DEADLINE HERE
            // A task is expired if now > deadline OR if it was completed AFTER the deadline
            const isExpired = gameDeadline ? (completedAt ? new Date(completedAt) > gameDeadline : now > gameDeadline) : false;

            // Format completedAt in original format
            const formattedCompletedAt = completedAt ? formatDateTime(completedAt) : null;

          // Reward eligibility is per-game, not per-task
          // We'll check if ALL tasks are completed after processing all tasks
          let rewardEligible = false;
          let rewardAwarded = false;
          let rewardInfo = null;

          return {
            taskId: taskIdString,
            order: bt.order,
            name: bt.taskId?.name || null,
            description: bt.taskId?.description || null,
            completionRule: bt.taskId?.completionRule || null,
            rewardType: bt.taskId?.rewardType || null,
            rewardValue: bt.taskId?.rewardValue || null,
            unlockCondition:
              bt.unlockCondition ||
              "Unlock this Bonus Task after Minimum Event Threshold is met.",
            isUnlocked: isUnlocked,
            isCompleted: isCompleted,
            completedAt: formattedCompletedAt,
            isExpired: isExpired,
            unlockReason: unlockReason,
            unlockTime: unlockTime ? formatDateTime(unlockTime) : null,
            completionDeadlineHours: completionDeadlineHours,
            completionDeadline: formatDateTime(gameDeadline),
            timeRemaining: gameDeadline ? Math.max(0, gameDeadline.getTime() - now.getTime()) : null,
            minimumEventThreshold: minimumEventThreshold,
            userInternalEvents: userInternalEvents,
            // Format unlockTime
            unlockTime: unlockTime ? formatDateTime(unlockTime) : null,
            // Reward information
            rewardEligible: rewardEligible,
            rewardAwarded: rewardAwarded,
            reward: rewardInfo,
          };
        }),
      );

      // --- PART 3: REWARD ELIGIBILITY ---
      const allTasksCompleted = formattedBonusTasks.every((task) => task.isCompleted);

      // All tasks must be completed AND their completion time must be <= the shared game deadline
      const allTasksCompletedWithinDeadline =
        allTasksCompleted &&
        gameDeadline &&
        formattedBonusTasks.every((task) => {
          if (!task.completedAt) return false;
          return new Date(task.completedAt) <= gameDeadline;
        });

      // Award reward only if ALL tasks are completed within deadline
      if (allTasksCompletedWithinDeadline) {
        // Check if reward was already awarded for this game (check transaction log by gameId)
        const existingGameReward = await Transaction.findOne({
          user: userId,
          "metadata.gameId": gameIdString,
          "metadata.rewardType": "welcome_bonus_task_game",
        });

        if (!existingGameReward) {
          // Initialize wallet and XP if needed
          if (!user.wallet) user.wallet = { balance: 0 };
          if (!user.xp) user.xp = { current: 0, total: 0 };

          // Award coins: 100 total per game
          const coinsReward = 100;
          user.wallet.balance = (user.wallet.balance || 0) + coinsReward;
          user.wallet.lastUpdated = new Date();

          // Award XP with tier multiplier: 20 total per game
          const xpReward = 20;
          const xpResult = await applyTierMultiplierToXP(user, xpReward);
          const finalXP = xpResult.finalXP;
          user.xp.current = (user.xp.current || 0) + finalXP;
          user.xp.total = (user.xp.total || 0) + finalXP;

          // Create transaction for coins
          const coinsTransaction = new Transaction({
            user: userId,
            type: "credit",
            balanceType: "coins",
            amount: coinsReward,
            description: `Welcome Bonus Reward - ${downloadedGame.title || gameDoc.title} - All ${formattedBonusTasks.length} tasks completed`,
            status: "completed",
            referenceId: `WELCOME-BONUS-GAME-${gameIdString}-${Date.now()}`,
            metadata: {
              source: "welcome_bonus_task_game",
              gameId: gameIdString,
              gameTitle: downloadedGame.title || gameDoc.title,
              rewardType: "welcome_bonus_task_game",
              totalTasks: formattedBonusTasks.length,
              completedTasks: formattedBonusTasks.filter((t) => t.isCompleted)
                .length,
              completedAt: new Date(),
              completedWithinDeadline: true,
              rewards: {
                coins: coinsReward,
                xp: { original: xpReward, final: finalXP },
              },
            },
          });
          await coinsTransaction.save();

          // Create transaction for XP
          const xpTransaction = new Transaction({
            user: userId,
            type: "credit",
            balanceType: "xp",
            amount: finalXP,
            description: `Welcome Bonus Reward - ${downloadedGame.title || gameDoc.title} - All ${formattedBonusTasks.length} tasks completed`,
            status: "completed",
            referenceId: `WELCOME-BONUS-GAME-XP-${gameIdString}-${Date.now()}`,
            metadata: {
              source: "welcome_bonus_task_game",
              gameId: gameIdString,
              gameTitle: downloadedGame.title || gameDoc.title,
              rewardType: "welcome_bonus_task_game",
              totalTasks: formattedBonusTasks.length,
              completedTasks: formattedBonusTasks.filter((t) => t.isCompleted)
                .length,
              completedAt: new Date(),
              completedWithinDeadline: true,
              rewards: {
                coins: coinsReward,
                xp: { original: xpReward, final: finalXP },
              },
            },
          });
          await xpTransaction.save();

          rewardsAwarded.push({
            gameId: gameIdString,
            gameTitle: downloadedGame.title || gameDoc.title,
            coins: coinsReward,
            xp: finalXP,
            totalTasks: formattedBonusTasks.length,
          });

          console.log(
            `[Welcome Bonus Tasks] ✅ Awarded game reward for ${downloadedGame.title}: ${coinsReward} coins + ${finalXP} XP (all ${formattedBonusTasks.length} tasks completed)`,
          );

          // Update reward info for all tasks to show they're eligible
          formattedBonusTasks.forEach((task) => {
            task.rewardEligible = true;
            task.rewardAwarded = true;
            task.reward = {
              coins: coinsReward,
              xp: finalXP,
              xpOriginal: xpReward,
              awardedAt: new Date(),
              gameReward: true, // Indicates this is a game-level reward
            };
          });
        } else {
          // Reward already awarded - update task reward info
          formattedBonusTasks.forEach((task) => {
            task.rewardEligible = true;
            task.rewardAwarded = false;
            task.reward = {
              coins: 100,
              xp: existingGameReward.metadata?.rewards?.xp?.final || 20,
              alreadyAwarded: true,
              awardedAt: existingGameReward.createdAt,
              gameReward: true,
            };
          });
          console.log(
            `[Welcome Bonus Tasks] ⚠️ Game reward already awarded for ${downloadedGame.title}`,
          );
        }
      } else if (allTasksCompleted) {
        // All tasks completed but after deadline - mark as not eligible
        formattedBonusTasks.forEach((task) => {
          task.rewardEligible = false;
          task.rewardAwarded = false;
        });
        console.log(
          `[Welcome Bonus Tasks] ❌ All tasks completed for ${downloadedGame.title} but after deadline`,
        );
      }

      // Check if game should be filtered out
      // Filter condition: game is expired AND has no incomplete tasks (no tasks or all tasks completed)
      const isExpiredGame = gameDeadline ? now > gameDeadline : false;
      const hasIncompleteTasks = formattedBonusTasks.some(task => !task.isCompleted);
      const hasNoTasks = formattedBonusTasks.length === 0;
      
      // Skip this game if expired (regardless of task status)
      if (isExpiredGame) {
        console.log(
          `[Welcome Bonus Tasks] 🚫 Filtering out expired game: ${downloadedGame.title}`
        );
        continue;
      }

      // Add game with bonus tasks
      gamesWithBonusTasks.push({
        gameId: gameIdString,
        gameTitle: downloadedGame.title || gameDoc.title,
        gameGameId: downloadedGame.id || gameDoc.gameId,
        gameImage: downloadedGame.image || downloadedGame.square_image || null,
        gameStatus: inProgressGameIds.has(downloadedGame.id)
          ? "in_progress"
          : "completed",
        minimumEventThreshold: minimumEventThreshold,
        completionDeadlineHours: completionDeadlineHours,
        taskLogic: "sequential",
        // ADD THESE TO THE TOP LEVEL - format datetimes
        completionDeadline: formatDateTime(gameDeadline),
        isExpired: isExpiredGame,
        timerStartedAt: formatDateTime(sharedDeadlineStartTime),
        bonusTasks: formattedBonusTasks,
        userProgress: {
          internalEvents: userInternalEvents,
          eventThresholdMet: userInternalEvents >= minimumEventThreshold,
          gameDownloadTime: formatDateTime(gameDownloadTime),
        },
        maxGamesWithBonusTasks: maxGamesWithBonus,
        userDownloadOrder:
          sortedGames.findIndex((g) => String(g.gameId) === gameIdString) + 1,
      });
    }

    // Save user if any rewards were awarded or task statuses were updated
    // Check if user object was modified (Mongoose tracks this automatically)
    const hasRewards = rewardsAwarded.length > 0;
    const hasTaskUpdates = user.isModified && user.isModified("tasks");

    if (hasRewards || hasTaskUpdates) {
      await user.save();
      if (hasRewards) {
        console.log(
          `[Welcome Bonus Tasks] Saved user with ${rewardsAwarded.length} rewards awarded`,
        );
      }
      if (hasTaskUpdates) {
        const completedTasksCount =
          user.tasks?.filter((t) => t.completed).length || 0;
        console.log(
          `[Welcome Bonus Tasks] Saved user with updated task statuses (${completedTasksCount} completed tasks from Besitos goals)`,
        );
      }
    }

    // Calculate total rewards summary
    const totalRewards = {
      coins: rewardsAwarded.reduce((sum, r) => sum + r.coins, 0),
      xp: rewardsAwarded.reduce((sum, r) => sum + r.xp, 0),
      tasksCompleted: rewardsAwarded.length,
    };

    // Debug information (only include in development or when games are empty)
    const debugInfo =
      gamesWithBonusTasks.length === 0
        ? {
            downloadedGamesCount: downloadedGames.length,
            downloadedGameIds: downloadedGames.map((g) => g.id),
            userGamesCount: userGames.length,
            userGameIds: userGames.map((g) => String(g.gameId)),
            configuredGameIds: configuredGameIds,
            bonusConfigCount: bonusRule?.gameBonusTasks?.length || 0,
            bonusConfigGameIds:
              bonusRule?.gameBonusTasks?.map((c) =>
                String(c.gameId._id || c.gameId),
              ) || [],
          }
        : null;

    const response = {
      success: true,
      data: {
        games: gamesWithBonusTasks,
        totalGames: gamesWithBonusTasks.length,
        maxGamesWithBonusTasks: maxGamesWithBonus,
        rewards: {
          totalCoins: totalRewards.coins,
          totalXP: totalRewards.xp,
          tasksRewarded: totalRewards.tasksCompleted,
          rewardsAwarded: rewardsAwarded,
        },
        userBalance: {
          coins: user.wallet?.balance || 0,
          xp: user.xp?.current || 0,
        },
      },
    };

    // Add debug info if games are empty
    if (debugInfo) {
      response.data.debug = debugInfo;
      console.log(
        `[Welcome Bonus Tasks] ⚠️ No games returned. Debug info:`,
        JSON.stringify(debugInfo, null, 2),
      );
    }

    res.json(response);
  } catch (error) {
    console.error("Error getting welcome bonus tasks:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get welcome bonus tasks",
      message: error.message,
    });
  }
});

module.exports = router;

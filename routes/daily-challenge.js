/**
 * Daily Challenge Routes (User-Facing)
 * Implements calendar view, today's challenge, game selection, and completion
 * @module routes/daily-challenge
 */

const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const protect = require("../middleware/auth");
const DailyChallenge = require("../models/DailyChallenge");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const User = require("../models/User");
const Game = require("../models/Game");
const Transaction = require("../models/Transaction");
const BesitosConversion = require("../models/BesitosConversion");
const SpinWheelLog = require("../models/SpinWheelLog");
const SpinWheelReward = require("../models/SpinWheelReward");
const SpinWheelConfig = require("../models/SpinWheelConfig");
const BonusDay = require("../models/BonusDay");
const besitosService = require("../services/besitos.service");
const besitosController = require("../controllers/besitos.controller");
const bitlabsService = require("../services/bitlabs.service");
const { trackActivity } = require("../middleware/activityTracker");
const streakRouter = require("./streak");
const getStreakConfig = streakRouter.getStreakConfig;
const getMilestoneReward = streakRouter.getMilestoneReward;
const XPTier = require("../models/XPTier");

// Helper function to parse accessBenefits multiplier (e.g., "1.5x" -> 1.5)
function parseAccessBenefitsMultiplier(accessBenefits) {
  if (!accessBenefits || typeof accessBenefits !== "string") {
    return 1.0;
  }
  const match = accessBenefits.match(/(\d+\.?\d*)x/i);
  if (match && match[1]) {
    return parseFloat(match[1]) || 1.0;
  }
  return 1.0;
}

// Helper function to get user's accessBenefits multiplier from XPTier (same as daily rewards)
async function getAccessBenefitsMultiplier(userXp) {
  try {
    // Find matching tier
    const tier = await XPTier.findByXpValue(userXp);

    if (tier && tier.accessBenefits) {
      const multiplier = parseAccessBenefitsMultiplier(tier.accessBenefits);
      return multiplier;
    }
  } catch (error) {
    console.error("Error getting accessBenefits multiplier:", error);
  }
  return 1.0;
}

// ==================== CALENDAR VIEW ====================

/**
 * @route   GET /api/daily-challenge/calendar
 * @desc    Get calendar view of daily challenges for user
 * @query   {number} year - Year (default: current year)
 * @query   {number} month - Month 0-11 (default: current month)
 * @access  Private
 */
router.get("/calendar", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const currentDate = new Date();
    const year = req.query.year
      ? parseInt(req.query.year)
      : currentDate.getFullYear();
    const month = req.query.month
      ? parseInt(req.query.month)
      : currentDate.getMonth();

    const user = await User.findById(userId).select("streak");

    // Get start and end dates for the month
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all challenges for the month
    const challenges = await DailyChallenge.find({
      challengeDate: {
        $gte: startDate,
        $lte: endDate,
      },
      isVisible: true,
    }).sort({ challengeDate: 1 });

    // Get user's progress for the month
    const userProgress = await UserChallengeProgress.find({
      userId,
      challengeDate: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    // Create a map of progress by date
    const progressMap = {};
    userProgress.forEach((progress) => {
      const dateKey = progress.challengeDate.toISOString().split("T")[0];
      progressMap[dateKey] = progress;
    });

    // Get user's streak data
    const streakData = user.streak || {};
    const completedTasks = streakData.completedTasks || [];

    // Build calendar data
    const calendarDays = [];
    const daysInMonth = endDate.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);
      const dateKey = date.toISOString().split("T")[0];
      const dayTimestamp = date.getTime();
      const todayTimestamp = today.getTime();

      // Determine day state
      const isToday = dayTimestamp === todayTimestamp;
      const isFuture = dayTimestamp > todayTimestamp;
      const isPast = dayTimestamp < todayTimestamp;
      const isCompleted =
        completedTasks.includes(dateKey) ||
        (progressMap[dateKey] && progressMap[dateKey].status === "completed");
      const isMissed = isPast && !isCompleted;

      // Find challenge for this date
      const challenge = challenges.find((c) => {
        const challengeDate = new Date(c.challengeDate);
        challengeDate.setHours(0, 0, 0, 0);
        return challengeDate.getTime() === dayTimestamp;
      });

      // Get user progress for this date
      const progress = progressMap[dateKey];

      // Build day data
      const dayData = {
        day: day,
        date: dateKey,
        dayOfWeek: date.getDay(), // 0 = Sunday
        isToday,
        isFuture,
        isPast,
        isCompleted,
        isMissed,
        isLocked: isFuture || isMissed,
        isClickable: isToday,
        challenge: challenge
          ? {
              id: challenge._id,
              title: challenge.title,
              type: challenge.type,
              coinReward: challenge.coinReward,
              xpReward: challenge.xpReward,
              gameId: challenge.gameId,
              sdkProvider: challenge.sdkProvider,
              gameDetails: challenge.gameDetails || {},
              hasGame: !!challenge.assignedGame?.gameId,
              hasSdkTask: challenge.sdkTask?.provider !== "none",
            }
          : null,
        progress: progress
          ? {
              status: progress.status,
              percentage: progress.progress?.percentage || 0,
              rewardsEarned: progress.rewardsEarned,
            }
          : null,
        // Milestone flags
        isMilestone: [5, 10, 20, 30].includes(
          streakData.current >= day ? day : 0
        ),
      };

      calendarDays.push(dayData);
    }

    res.json({
      success: true,
      data: {
        year,
        month,
        monthName: startDate.toLocaleString("default", { month: "long" }),
        today: today.toISOString().split("T")[0],
        calendarDays,
        streak: {
          current: streakData.current || 0,
          milestones: [5, 10, 20, 30],
          nextMilestone:
            [5, 10, 20, 30].find((m) => m > (streakData.current || 0)) || 30,
        },
      },
    });
  } catch (error) {
    console.error("Error getting calendar:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get calendar data",
    });
  }
});

// ==================== GAME SELECTION ====================

/**
 * @route   GET /api/daily-challenge/available-games
 * @desc    Get available games for today's challenge
 * @access  Private
 */
router.get("/available-games", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    // Normalize today's date to UTC start-of-day (matching admin creation logic)
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // Get today's challenge using UTC dates and status filter
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
      "scheduling.startTime": { $lte: now },
      "scheduling.endTime": { $gte: now },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No challenge available for today",
      });
    }

    // If challenge has gameId and sdkProvider, return the game details
    if (challenge.gameId && challenge.sdkProvider) {
      return res.json({
        success: true,
        data: {
          challengeId: challenge._id,
          games: [
            {
              id: challenge.gameId,
              title: challenge.gameDetails?.name || challenge.title,
              description:
                challenge.gameDetails?.description || challenge.description,
              image: challenge.gameDetails?.image || "",
              square_image: challenge.gameDetails?.square_image || "",
              large_image: challenge.gameDetails?.large_image || "",
              category: challenge.gameDetails?.category || "",
              downloadUrl: challenge.gameDetails?.downloadUrl || "",
              sdkProvider: challenge.sdkProvider,
            },
          ],
        },
      });
    }

    // If challenge has assigned games, return them
    if (challenge.assignedGame?.gameId) {
      const game = await Game.findById(challenge.assignedGame.gameId);
      return res.json({
        success: true,
        data: {
          challengeId: challenge._id,
          games: [
            {
              id: game._id,
              title: game.title,
              description: game.description,
              image: game.metadata?.imageUrl || game.gameDetails?.image || "",
              square_image: game.gameDetails?.square_image || "",
              large_image: game.gameDetails?.large_image || "",
              category:
                game.metadata?.genre || game.gameDetails?.category || "",
              downloadUrl: game.gameDetails?.downloadUrl || "",
              sdkProvider: game.sdkProvider,
            },
          ],
        },
      });
    }

    res.status(404).json({
      success: false,
      error: "No games available for this challenge",
    });
  } catch (error) {
    console.error("Error getting available games:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get available games",
    });
  }
});

// ==================== BESITOS VERIFICATION ====================

/**
 * @route   POST /api/daily-challenge/verify-besitos-download
 * @desc    Verify Besitos game download and completion for daily challenge
 * @access  Private
 */
router.post("/verify-besitos-download", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        error: "Challenge ID is required",
      });
    }

    // Get the challenge
    const challenge = await DailyChallenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "Challenge not found",
      });
    }

    // Verify this is a Besitos challenge
    if (challenge.sdkProvider !== "besitos" || !challenge.gameId) {
      return res.status(400).json({
        success: false,
        error: "This is not a Besitos game challenge",
      });
    }

    // Get user's progress for this challenge
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );

    let progress = await UserChallengeProgress.findOne({
      userId,
      challengeId,
      challengeDate: normalizedStart,
    });

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: "No progress found for this challenge",
      });
    }

    // Check if already verified
    if (progress.progress?.metadata?.gameDownloadVerified) {
      return res.json({
        success: true,
        data: {
          verified: true,
          alreadyVerified: true,
          verifiedAt: progress.progress.metadata.downloadVerifiedAt,
          message: "Game download already verified",
        },
      });
    }

    // Call Besitos API to check user's data
    try {
      const besitosResponse = await besitosService.getUserData(userId);
      
      if (!besitosResponse || !besitosResponse.data) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch Besitos user data",
        });
      }

      const offersData = besitosResponse.data;
      
      // Check for in_progress games
      const inProgressGames = offersData.in_progress || [];
      
      if (inProgressGames.length === 0) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: "No in-progress games found",
            inProgressGames: [],
          },
        });
      }

      // Find the specific game by matching the challenge gameId with offer id
      const targetGame = inProgressGames.find(game => 
        game.id === challenge.gameId || 
        game.bundle_id === challenge.gameId ||
        game.id?.toString() === challenge.gameId?.toString()
      );

      if (!targetGame) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: `Game with ID ${challenge.gameId} not found in in-progress games`,
            inProgressGames: inProgressGames.map(game => ({
              id: game.id,
              title: game.title,
              bundleId: game.bundle_id
            })),
          },
        });
      }

      // Check if the game has completed goals
      const goals = targetGame.goals || [];
      const completedGoals = goals.filter(goal => goal.completed === true && goal.completed_datetime);
      
      if (completedGoals.length === 0) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: "No completed goals found for this game",
            gameInfo: {
              id: targetGame.id,
              title: targetGame.title,
              totalGoals: goals.length,
              completedGoals: 0
            },
          },
        });
      }

      // Get the first completed goal (usually the install goal)
      const firstCompletedGoal = completedGoals[0];
      const completionDatetime = new Date(firstCompletedGoal.completed_datetime);
      
      // Verify the completion date matches today's challenge date
      const completionDate = new Date(completionDatetime);
      completionDate.setUTCHours(0, 0, 0, 0);
      const challengeDate = new Date(normalizedStart);
      
      const isDateMatch = completionDate.getTime() === challengeDate.getTime();
      
      // Also check if any goal was completed within the last 24 hours (for same-day verification)
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const hasRecentCompletion = completedGoals.some(goal => {
        const goalTime = new Date(goal.completed_datetime);
        return goalTime >= twentyFourHoursAgo;
      });

      if (!isDateMatch && !hasRecentCompletion) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: `Game completion date (${completionDate.toISOString().split('T')[0]}) does not match challenge date (${challengeDate.toISOString().split('T')[0]}) and no recent completion found`,
            completionDate: completionDate.toISOString(),
            challengeDate: challengeDate.toISOString(),
            goals: goals,
          },
        });
      }

      // Calculate progress percentage based on completed goals
      const progressPercentage = Math.round((completedGoals.length / goals.length) * 100);

      // Update progress with verification
      const verificationData = {
        gameDownloadVerified: true,
        downloadVerifiedAt: new Date().toISOString(),
        besitosOfferId: challenge.gameId,
        gameTitle: targetGame.title,
        bundleId: targetGame.bundle_id,
        firstCompletedGoalId: firstCompletedGoal.goal_id,
        firstCompletedGoalText: firstCompletedGoal.text,
        firstCompletedGoalDatetime: firstCompletedGoal.completed_datetime,
        totalGoals: goals.length,
        completedGoals: completedGoals.length,
        progressPercentage: progressPercentage,
        verificationDate: new Date().toISOString(),
        goalsSummary: goals.map(goal => ({
          goalId: goal.goal_id,
          text: goal.text,
          completed: goal.completed,
          completedDatetime: goal.completed_datetime,
          amount: goal.amount
        }))
      };

      // Update progress metadata
      if (!progress.progress) {
        progress.progress = {};
      }
      if (!progress.progress.metadata) {
        progress.progress.metadata = {};
      }

      Object.assign(progress.progress.metadata, verificationData);

      // Mark progress as started if not already
      if (progress.status === "not_started" || progress.status === "viewed") {
        await progress.markStarted();
      }

      // Update progress percentage based on completed goals
      progress.progress.percentage = progressPercentage;
      progress.progress.currentStep = completedGoals.length;
      progress.progress.totalSteps = goals.length;

      // If all goals are completed, mark as completed
      if (completedGoals.length === goals.length && goals.length > 0) {
        progress.progress.percentage = 100;
        await progress.markCompleted();
      }

      await progress.save();

      // Update challenge analytics
      await challenge.updateAnalytics("started");

      return res.json({
        success: true,
        data: {
          verified: true,
          verificationData,
          message: "Game download verified successfully",
          progress: {
            status: progress.status,
            percentage: progress.progress?.percentage || 0,
            metadata: progress.progress?.metadata || {},
          },
          gameInfo: {
            id: targetGame.id,
            title: targetGame.title,
            totalGoals: goals.length,
            completedGoals: completedGoals.length,
            progressPercentage: progressPercentage,
            allGoalsCompleted: completedGoals.length === goals.length
          }
        },
      });

    } catch (besitosError) {
      console.error("Besitos API error:", besitosError);
      return res.status(500).json({
        success: false,
        error: "Failed to verify with Besitos API",
        details: besitosError.message,
      });
    }

  } catch (error) {
    console.error("Error verifying Besitos download:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify game download",
    });
  }
});

// ==================== BITLABS VERIFICATION ====================

/**
 * @route   POST /api/daily-challenge/verify-bitlabs-download
 * @desc    Verify Bitlabs game download and completion for daily challenge
 * @access  Private
 */
router.post("/verify-bitlabs-download", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { challengeId } = req.body;

    if (!challengeId) {
      return res.status(400).json({
        success: false,
        error: "Challenge ID is required",
      });
    }

    // Get the challenge
    const challenge = await DailyChallenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "Challenge not found",
      });
    }

    // Verify this is a Bitlabs challenge
    if (challenge.sdkProvider !== "bitlabs" || !challenge.gameId) {
      return res.status(400).json({
        success: false,
        error: "This is not a Bitlabs game challenge",
      });
    }

    // Get user's progress for this challenge
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );

    let progress = await UserChallengeProgress.findOne({
      userId,
      challengeId,
      challengeDate: normalizedStart,
    });

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: "No progress found for this challenge",
      });
    }

    // Check if already verified
    if (progress.progress?.metadata?.gameDownloadVerified) {
      return res.json({
        success: true,
        data: {
          verified: true,
          alreadyVerified: true,
          verifiedAt: progress.progress.metadata.downloadVerifiedAt,
          message: "Game download already verified",
        },
      });
    }

    // Call Bitlabs API to check user's offer history
    try {
      const bitlabsResponse = await bitlabsService.getUserOfferHistory(userId, challenge.gameId);
      
      if (!bitlabsResponse.success || !bitlabsResponse.data) {
        return res.status(500).json({
          success: false,
          error: "Failed to fetch Bitlabs offer history",
        });
      }

      const offerData = bitlabsResponse.data;
      
      // Check for completed events
      const events = offerData.events || [];
      const completedEvents = events.filter(event => event.status === "completed");
      
      if (completedEvents.length === 0) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: "No completed events found for this game",
            events: events,
          },
        });
      }

      // Find the first completed event (usually the install event)
      const firstCompletedEvent = completedEvents[0];
      const eventTimestamp = new Date(firstCompletedEvent.timestamp);
      
      // Verify the event date matches today's challenge date
      const eventDate = new Date(eventTimestamp);
      eventDate.setUTCHours(0, 0, 0, 0);
      const challengeDate = new Date(normalizedStart);
      
      const isDateMatch = eventDate.getTime() === challengeDate.getTime();
      
      if (!isDateMatch) {
        return res.json({
          success: true,
          data: {
            verified: false,
            message: `Game completion date (${eventDate.toISOString().split('T')[0]}) does not match challenge date (${challengeDate.toISOString().split('T')[0]})`,
            eventDate: eventDate.toISOString(),
            challengeDate: challengeDate.toISOString(),
            events: events,
          },
        });
      }

      // Update progress with verification
      const verificationData = {
        gameDownloadVerified: true,
        downloadVerifiedAt: new Date().toISOString(),
        bitlabsOfferId: challenge.gameId,
        completedEventId: firstCompletedEvent.uuid,
        completedEventName: firstCompletedEvent.name,
        completedEventTimestamp: firstCompletedEvent.timestamp,
        totalCompletedEvents: completedEvents.length,
        verificationDate: new Date().toISOString(),
      };

      // Update progress metadata
      if (!progress.progress) {
        progress.progress = {};
      }
      if (!progress.progress.metadata) {
        progress.progress.metadata = {};
      }

      Object.assign(progress.progress.metadata, verificationData);

      // Mark progress as started if not already
      if (progress.status === "not_started" || progress.status === "viewed") {
        await progress.markStarted();
      }

      // For game challenges with time requirements, set initial progress
      if (challenge.requirements?.timeLimit) {
        progress.progress.percentage = 10; // Initial progress after download
        progress.progress.currentStep = 1;
        progress.progress.totalSteps = 2; // Download + play time
      }

      await progress.save();

      // Update challenge analytics
      await challenge.updateAnalytics("started");

      return res.json({
        success: true,
        data: {
          verified: true,
          verificationData,
          message: "Game download verified successfully",
          progress: {
            status: progress.status,
            percentage: progress.progress?.percentage || 0,
            metadata: progress.progress?.metadata || {},
          },
        },
      });

    } catch (bitlabsError) {
      console.error("Bitlabs API error:", bitlabsError);
      return res.status(500).json({
        success: false,
        error: "Failed to verify with Bitlabs API",
        details: bitlabsError.message,
      });
    }

  } catch (error) {
    console.error("Error verifying Bitlabs download:", error);
    res.status(500).json({
      success: false,
      error: "Failed to verify game download",
    });
  }
});

// ==================== GAME CHALLENGE OPERATIONS ====================

/**
 * @route   POST /api/daily-challenge/start
 * @desc    Start a game challenge (user clicks play game)
 * @access  Private
 */
// router.post("/start", protect, async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { challengeId } = req.body;

//     if (!challengeId) {
//       return res.status(400).json({
//         success: false,
//         error: "Challenge ID is required",
//       });
//     }

//     // Get the challenge
//     const challenge = await DailyChallenge.findById(challengeId);
//     if (!challenge) {
//       return res.status(404).json({
//         success: false,
//         error: "Challenge not found",
//       });
//     }

//     // Verify this is a game challenge
//     if (challenge.type !== "game" && challenge.type !== "sdk_game") {
//       return res.status(400).json({
//         success: false,
//         error: "This is not a game challenge",
//       });
//     }

//     // Get today's date (normalized)
//     const today = new Date();
//     const normalizedStart = new Date(
//       Date.UTC(
//         today.getUTCFullYear(),
//         today.getUTCMonth(),
//         today.getUTCDate(),
//         0,
//         0,
//         0,
//         0
//       )
//     );

//     // Get user's progress for this challenge
//     let progress = await UserChallengeProgress.findOne({
//       userId,
//       challengeId,
//       challengeDate: normalizedStart,
//     });

//     if (!progress) {
//       // Create progress if it doesn't exist
//       progress = await UserChallengeProgress.getOrCreateTodayChallenge(
//         userId,
//         challengeId,
//         normalizedStart
//       );
//     }

//     // Check if already started
//     if (progress.status === "started" || progress.status === "in_progress") {
//       return res.json({
//         success: true,
//         data: {
//           alreadyStarted: true,
//           message: "Challenge already started",
//           progress: {
//             status: progress.status,
//             percentage: progress.progress?.percentage || 0,
//             startedAt: progress.startedAt,
//             timeRemaining: calculateTimeRemaining(progress, challenge),
//           },
//         },
//       });
//     }

//     // Mark progress as started
//     await progress.markStarted();
    
//     // If this is a game challenge, trigger automatic verification after a delay
//     if (challenge.sdkProvider) {
//       // Set a flag to trigger verification on next check
//       if (!progress.progress) {
//         progress.progress = {};
//       }
//       if (!progress.progress.metadata) {
//         progress.progress.metadata = {};
//       }
//       progress.progress.metadata.gameStarted = true;
//       progress.progress.metadata.gameStartedAt = new Date().toISOString();
//       await progress.save();
//     }

//     // Update challenge analytics
//     await challenge.updateAnalytics("started");

//     // Calculate time remaining
//     const timeRemaining = calculateTimeRemaining(progress, challenge);

//     res.json({
//       success: true,
//       data: {
//         message: "Challenge started successfully",
//         progress: {
//           status: progress.status,
//           percentage: progress.progress?.percentage || 0,
//           startedAt: progress.startedAt,
//           timeRemaining: timeRemaining,
//           metadata: progress.progress?.metadata || {},
//         },
//         gameInfo: challenge.type === "game" ? {
//           timeLimit: challenge.requirements?.timeLimit,
//           needsVerification: !!challenge.sdkProvider,
//           gameDownloadVerified: progress.progress?.metadata?.gameDownloadVerified || false,
//         } : null,
//         timer: {
//           timeRemaining: timeRemaining,
//           hours: Math.floor(timeRemaining / (1000 * 60 * 60)),
//           minutes: Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)),
//           seconds: Math.floor((timeRemaining % (1000 * 60)) / 1000),
//           formatted: formatTimeRemaining(timeRemaining),
//         },
//       },
//     });

//   } catch (error) {
//     console.error("Error starting challenge:", error);
//     res.status(500).json({
//       success: false,
//       error: "Failed to start challenge",
//     });
//   }
// });

/**
 * Helper function to calculate time remaining for a challenge
 */
function calculateTimeRemaining(progress, challenge) {
  const now = new Date();
  const isCompleted = progress.status === "completed";
  
  if (isCompleted) {
    return 0;
  }

  const isGameChallenge = challenge.type === "game" || challenge.type === "sdk_game";
  const gameDownloadVerified = progress.progress?.metadata?.gameDownloadVerified || false;
  const downloadVerifiedAt = progress.progress?.metadata?.downloadVerifiedAt;
  
  if (isGameChallenge && !gameDownloadVerified) {
    // Game challenge waiting for download - show full day duration
    const challengeEndTime = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    return Math.max(0, challengeEndTime - now);
  } else if (isGameChallenge && gameDownloadVerified) {
    // Game challenge with verified download - use timeLimit
    const timerStartTime = downloadVerifiedAt ? new Date(downloadVerifiedAt) : progress.startedAt;
    const timerDuration = challenge.requirements?.timeLimit 
      ? challenge.requirements.timeLimit * 60 * 1000 
      : 24 * 60 * 60 * 1000;
    const timerEndTime = new Date(timerStartTime.getTime() + timerDuration);
    return Math.max(0, timerEndTime - now);
  } else {
    // Non-game challenge - use challenge end time
    const challengeEndTime = challenge.scheduling?.endTime || new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    return Math.max(0, challengeEndTime - now);
  }
}

/**
 * Helper function to format time remaining
 */
function formatTimeRemaining(milliseconds) {
  if (milliseconds <= 0) return "00:00:00";
  
  const hours = Math.floor(milliseconds / (1000 * 60 * 60));
  const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);
  
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * @route   POST /api/daily-challenge/complete
 * @desc    Mark a game challenge as completed (user finishes required play time)
 * @access  Private
 */
// router.post("/complete", protect, async (req, res) => {
//   try {
//     console.log("🎮 DAILY CHALLENGE COMPLETE - Starting validation");
//     const userId = req.user.userId;
//     const { challengeId } = req.body;
    
//     console.log("📝 Request data:", { userId, challengeId });

//     if (!challengeId) {
//       console.log("❌ Missing challenge ID");
//       return res.status(400).json({
//         success: false,
//         error: "Challenge ID is required",
//       });
//     }

//     // Get the challenge
//     const challenge = await DailyChallenge.findById(challengeId);
//     console.log("🔍 Challenge found:", { 
//       id: challenge?._id, 
//       type: challenge?.type, 
//       sdkProvider: challenge?.sdkProvider,
//       title: challenge?.title 
//     });
    
//     if (!challenge) {
//       console.log("❌ Challenge not found");
//       return res.status(404).json({
//         success: false,
//         error: "Challenge not found",
//       });
//     }

//     // Verify this is a game challenge
//     if (challenge.type !== "game" && challenge.type !== "sdk_game") {
//       console.log("❌ Not a game challenge:", challenge.type);
//       return res.status(400).json({
//         success: false,
//         error: "This is not a game challenge",
//       });
//     }

//     // Get user's progress for this challenge
//     const today = new Date();
//     const normalizedStart = new Date(
//       Date.UTC(
//         today.getUTCFullYear(),
//         today.getUTCMonth(),
//         today.getUTCDate(),
//         0,
//         0,
//         0,
//         0
//       )
//     );

//     console.log("📅 Looking for progress with date:", normalizedStart.toISOString());

//     console.log("🚀 DEBUG: Using new progress search logic");
//     console.log("🗓️ Date handling analysis:");
//     console.log("   Current time:", new Date().toISOString());
//     console.log("   Normalized start (UTC midnight):", normalizedStart.toISOString());
//     console.log("   Normalized start (date only):", normalizedStart.toISOString().split('T')[0]);
    
//     // First try exact date match
//     console.log("\n📍 SEARCH 1 - Exact date match:");
//     console.log("   Query:", { userId, challengeId, challengeDate: normalizedStart });
//     let progress = await UserChallengeProgress.findOne({
//       userId,
//       challengeId,
//       challengeDate: normalizedStart,
//     });
    
//     console.log("   Result found:", !!progress);
//     console.log("   Progress date if found:", progress?.challengeDate?.toISOString());

//     // If not found, try to find recent progress for this user/challenge (last 7 days)
//     if (!progress) {
//       console.log("\n🔍 SEARCH 2 - Recent progress (last 7 days):");
//       const sevenDaysAgo = new Date(normalizedStart);
//       sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
//       console.log("   Seven days ago:", sevenDaysAgo.toISOString());
//       console.log("   Query:", { 
//         userId, 
//         challengeId, 
//         challengeDate: { $gte: sevenDaysAgo } 
//       });
      
//       progress = await UserChallengeProgress.findOne({
//         userId,
//         challengeId,
//         challengeDate: { $gte: sevenDaysAgo }
//       }).sort({ challengeDate: -1 }); // Get most recent
      
//       console.log("   Result found:", !!progress);
//       if (progress) {
//         console.log("   Progress date:", progress.challengeDate.toISOString());
//         console.log("   Progress date (date only):", progress.challengeDate.toISOString().split('T')[0]);
//         console.log("   Progress time:", progress.challengeDate.toISOString().split('T')[1]);
        
//         // Check if it's same date but different time
//         const progressDateOnly = progress.challengeDate.toISOString().split('T')[0];
//         const searchDateOnly = normalizedStart.toISOString().split('T')[0];
//         console.log("   Same date but different time?", progressDateOnly === searchDateOnly);
//       } else {
//         console.log("   ❌ No recent progress found either");
//       }
//     }

//     console.log("📊 Progress found:", { 
//       found: !!progress, 
//       status: progress?.status,
//       hasProgress: !!progress?.progress,
//       hasMetadata: !!progress?.progress?.metadata 
//     });

//     // DEBUG: Let's check if progress exists for this user/challenge with any date
//     const anyProgress = await UserChallengeProgress.findOne({
//       userId,
//       challengeId
//     });
//     console.log("🔍 DEBUG - Any progress for this user/challenge:", {
//       found: !!anyProgress,
//       challengeDate: anyProgress?.challengeDate,
//       status: anyProgress?.status
//     });

//     // DEBUG: Let's check all progress for this user today
//     const todayAllProgress = await UserChallengeProgress.find({
//       userId,
//       challengeDate: normalizedStart
//     });
//     console.log("🔍 DEBUG - All user progress for today:", {
//       count: todayAllProgress.length,
//       challenges: todayAllProgress.map(p => ({
//         challengeId: p.challengeId,
//         status: p.status
//       }))
//     });

//     if (!progress) {
//       console.log("❌ No progress found for this challenge");
//       return res.status(404).json({
//         success: false,
//         error: "No progress found for this challenge",
//       });
//     }

//     // Check if already completed
//     if (progress.status === "completed") {
//       console.log("✅ Challenge already completed at:", progress.completedAt);
//       return res.json({
//         success: true,
//         data: {
//           alreadyCompleted: true,
//           message: "Challenge already completed",
//           progress: {
//             status: progress.status,
//             percentage: 100,
//             completedAt: progress.completedAt,
//             rewardsEarned: progress.rewardsEarned,
//           },
//         },
//       });
//     }

//     // GAME VALIDATION DEBUG - Check all relevant fields
//     console.log("🎮 GAME DOWNLOAD VALIDATION - STEP BY STEP:");
//     console.log("================================================");
    
//     // Step 1: Check challenge properties
//     console.log("📋 STEP 1 - Challenge Properties:");
//     console.log("   Challenge type:", challenge.type);
//     console.log("   SDK Provider:", challenge.sdkProvider);
//     console.log("   Has SDK provider:", !!challenge.sdkProvider);
    
//     // Step 2: Check progress structure
//     console.log("\n📊 STEP 2 - Progress Structure:");
//     console.log("   Has progress object:", !!progress.progress);
//     console.log("   Has metadata object:", !!progress.progress?.metadata);
//     console.log("   Full metadata:", JSON.stringify(progress.progress?.metadata, null, 2));
    
//     // Step 3: Extract validation variables with detailed checks
//     console.log("\n🔍 STEP 3 - Extracting Validation Variables:");
    
//     const metadata = progress.progress?.metadata || {};
//     console.log("   Raw metadata object:", metadata);
    
//     const gameDownloadVerified = metadata.gameDownloadVerified || false;
//     console.log("   gameDownloadVerified extraction:");
//     console.log("     metadata.gameDownloadVerified:", metadata.gameDownloadVerified);
//     console.log("     fallback to false:", !metadata.gameDownloadVerified);
//     console.log("     final value:", gameDownloadVerified);
    
//     const downloadVerifiedAt = metadata.downloadVerifiedAt;
//     console.log("   downloadVerifiedAt:", downloadVerifiedAt);
//     console.log("     type:", typeof downloadVerifiedAt);
//     console.log("     is valid date:", downloadVerifiedAt instanceof Date);
    
//     const needsVerification = metadata.needsVerification;
//     console.log("   needsVerification:", needsVerification);
    
//     const verificationProvider = metadata.verificationProvider;
//     console.log("   verificationProvider:", verificationProvider);
    
//     // Step 4: Validation logic breakdown
//     console.log("\n🛡️ STEP 4 - VALIDATION LOGIC BREAKDOWN:");
//     console.log("   Condition 1 - !gameDownloadVerified:", !gameDownloadVerified, "(gameDownloadVerified =", gameDownloadVerified, ")");
//     console.log("   Condition 2 - challenge.sdkProvider exists:", !!challenge.sdkProvider, "(value =", challenge.sdkProvider, ")");
//     console.log("   Combined condition (!gameDownloadVerified && challenge.sdkProvider):", !gameDownloadVerified && challenge.sdkProvider);
    
//     // Step 5: Decision making
//     console.log("\n⚖️ STEP 5 - VALIDATION DECISION:");
//     if (!gameDownloadVerified && challenge.sdkProvider) {
//       console.log("❌ DECISION: BLOCK COMPLETION");
//       console.log("   Reason: Game download not verified AND SDK provider required");
//       console.log("   User action needed: Download/verify game first");
      
//       console.log("\n📤 SENDING BLOCKED RESPONSE:");
//       const blockedResponse = {
//         success: false,
//         error: "Please download game first to complete this challenge",
//         requiresAction: true,
//         challengeType: "game",
//         requiredAction: {
//           endpoint: "Play selected game",
//           description: "Play game for required time before completing",
//           message: "You must play the selected game first. The game must be played for the required duration.",
//         },
//       };
//       console.log("   Response:", JSON.stringify(blockedResponse, null, 2));
      
//       return res.status(400).json(blockedResponse);
//     } else {
//       console.log("✅ DECISION: ALLOW COMPLETION");
//       if (!gameDownloadVerified) {
//         console.log("   Reason: No SDK provider required");
//       } else {
//         console.log("   Reason: Game download already verified");
//       }
//     }
    
//     console.log("\n🎯 GAME VALIDATION COMPLETE - Proceeding to completion");

//     // Mark as completed
//     console.log("🏆 Marking challenge as completed");
//     await progress.markCompleted();
//     console.log("✅ Challenge marked as completed at:", progress.completedAt);

//     // Update challenge analytics
//     console.log("📈 Updating challenge analytics");
//     await challenge.updateAnalytics("completed");
//     console.log("✅ Analytics updated");

//     // Get user for streak update
//     console.log("🔥 Updating user streak");
//     const user = await User.findById(userId);
//     if (user && user.streak) {
//       const today = new Date().toISOString().split("T")[0];
//       console.log("   Current streak:", user.streak.current);
//       console.log("   Today's date:", today);
//       console.log("   Already completed today:", user.streak.completedTasks.includes(today));
      
//       if (!user.streak.completedTasks.includes(today)) {
//         user.streak.completedTasks.push(today);
//         user.streak.current = (user.streak.current || 0) + 1;
//         await user.save();
//         console.log("✅ Streak updated to:", user.streak.current);
//       } else {
//         console.log("ℹ️ Today already counted in streak");
//       }
//     } else {
//       console.log("⚠️ No user or streak data found");
//     }

//     console.log("🎉 SENDING SUCCESS RESPONSE");
//     const responseData = {
//       message: "Challenge completed successfully",
//       progress: {
//         status: "completed",
//         percentage: 100,
//         completedAt: progress.completedAt,
//         rewardsEarned: progress.rewardsEarned,
//         rewardsClaimed: progress.rewardsClaimed,
//       },
//       rewards: {
//         coins: challenge.coinReward || 0,
//         xp: challenge.xpReward || 0,
//         canClaim: !progress.rewardsClaimed,
//       },
//       nextAction: progress.rewardsClaimed ? null : {
//         type: "claim_rewards",
//         label: "Claim Your Rewards",
//         description: "Complete this challenge by claiming your earned rewards",
//       },
//     };
    
//     console.log("📦 Response data:", JSON.stringify(responseData, null, 2));
    
//     res.json({
//       success: true,
//       data: responseData,
//     });

//   } catch (error) {
//     console.error("💥 DAILY CHALLENGE COMPLETE - ERROR:");
//     console.error("   Error message:", error.message);
//     console.error("   Error stack:", error.stack);
//     console.error("   Request data:", { userId, challengeId });
//     res.status(500).json({
//       success: false,
//       error: "Failed to complete challenge",
//     });
//   }
// });

// ==================== CRUD OPERATIONS ====================

/**
 * @route   POST /api/daily-challenge/create
 * @desc    Create a new daily challenge (user-created)
 * @access  Private
 */
router.post("/create", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      title,
      description,
      type = "custom",
      coinReward = 0,
      xpReward = 0,
      claimType = "manual",
      gameId,
      sdkProvider,
      challengeDate,
    } = req.body;

    // Validate required fields
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: "Title and description are required",
      });
    }

    // Set challenge date to today if not provided
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = challengeDate ? new Date(challengeDate) : today;

    // Normalize date to UTC start-of-day
    const normalizedStart = new Date(
      Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    const challengeData = {
      title,
      description,
      type,
      coinReward,
      xpReward,
      claimType,
      gameId,
      sdkProvider,
      challengeDate: normalizedStart,
      scheduling: {
        startTime: normalizedStart,
        endTime: normalizedEnd,
      },
      isVisible: true,
      status: "scheduled",
      createdBy: userId,
    };

    // Fetch gameDetails if gameId and sdkProvider are provided
    if (gameId && sdkProvider === "besitos") {
      try {
        const mockReq = { query: { offer_id: gameId } };
        const captureGame = () => {
          let payload = null;
          return {
            res: {
              json: (data) => {
                payload = data;
              },
              status: (code) => ({
                json: (data) => {
                  payload = { ...data, statusCode: code };
                },
              }),
            },
            get: () => payload,
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
    } else if (gameId && sdkProvider === "bitlabs") {
      // Add Bitlabs game details fetching
      try {
        const bitlabsController = require("../controllers/bitlabs.controller");
        const mockReq = { query: { is_game: "true" } };
        const captureGame = () => {
          let payload = null;
          return {
            res: {
              json: (data) => {
                payload = data;
              },
              status: (code) => ({
                json: (data) => {
                  payload = { ...data, statusCode: code };
                },
              }),
            },
            get: () => payload,
          };
        };
        const cap = captureGame();
        await bitlabsController.getOffers(mockReq, cap.res);
        const ext = cap.get();

        if (
          ext &&
          ext.success === true &&
          Array.isArray(ext.data) &&
          ext.data.length > 0
        ) {
          // Find the specific game by ID
          const external = ext.data.find(offer => 
            offer.id?.toString() === gameId.toString() || 
            offer.offerId?.toString() === gameId.toString()
          );

          if (external) {
            challengeData.gameDetails = {
              id: external.id || external.offerId || "",
              name: external.title || external.anchor || external.product_name || challengeData.title,
              description: external.description || challengeData.description,
              image: external.image || external.large_image || "",
              square_image: external.square_image || "",
              large_image: external.large_image || external.image || "",
              category: Array.isArray(external.categories) && external.categories[0]
                ? external.categories[0]
                : external.category || "",
              downloadUrl: external.url || external.downloadUrl || "",
            };
          } else {
            console.warn(`Game with ID ${gameId} not found in Bitlabs offers`);
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
        } else {
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
          "Failed to fetch gameDetails from Bitlabs:",
          error.message
        );
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

    const challenge = await DailyChallenge.create(challengeData);

    res.status(201).json({
      success: true,
      message: "Challenge created successfully",
      data: challenge.getDisplayData(),
    });
  } catch (error) {
    console.error("Error creating challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create challenge",
    });
  }
});

// ==================== TODAY'S CHALLENGE ====================

/**
 * @route   GET /api/daily-challenge/today
 * @desc    Get today's challenge with countdown timer
 * @access  Private
 */
router.get("/today", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    // Normalize today's date to UTC start-of-day (matching admin creation logic)
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    const user = await User.findById(userId).select(
      "xp age dateOfBirth location vip onboarding social"
    );

    console.log("Querying for challenge:", {
      normalizedStart: normalizedStart.toISOString(),
      normalizedEnd: normalizedEnd.toISOString(),
      now: now.toISOString(),
    });

    // Find today's challenge - use UTC dates and filter by status
    // If challengeDate matches today, the challenge should be available as long as it hasn't ended
    const query = {
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] }, // Exclude expired, draft, completed
      // Only check that challenge hasn't ended - if challengeDate is today, it should be available
      "scheduling.endTime": { $gte: now }, // Challenge should not have ended
    };

    console.log("DEBUG - Query object:", JSON.stringify(query, null, 2));

    // First, let's check if there are any challenges matching just the date
    const challengesByDate = await DailyChallenge.find({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
    }).lean();
    console.log(
      `DEBUG - Challenges found by date only: ${challengesByDate.length}`
    );
    if (challengesByDate.length > 0) {
      challengesByDate.forEach((ch, idx) => {
        console.log(`DEBUG - Challenge ${idx + 1}:`, {
          id: ch._id,
          title: ch.title,
          challengeDate: ch.challengeDate,
          isVisible: ch.isVisible,
          status: ch.status,
          schedulingStartTime: ch.scheduling?.startTime,
          schedulingEndTime: ch.scheduling?.endTime,
          targetAudience: ch.targetAudience,
        });
      });
    }

    const challenge = await DailyChallenge.findOne(query)
      .sort({ "scheduling.startTime": -1 }) // Prefer challenges that started most recently
      .populate("assignedGame.gameId");

    console.log(
      "DEBUG - Challenge found after full query:",
      challenge
        ? {
            id: challenge._id,
            title: challenge.title,
            status: challenge.status,
            isVisible: challenge.isVisible,
            challengeDate: challenge.challengeDate,
            schedulingStartTime: challenge.scheduling?.startTime,
            schedulingEndTime: challenge.scheduling?.endTime,
          }
        : "NO CHALLENGE FOUND"
    );

    if (!challenge) {
      // Debug why challenge wasn't found
      console.log("DEBUG - Checking why challenge wasn't found:");

      // Check visibility filter
      const visibleChallenges = challengesByDate.filter(
        (ch) => ch.isVisible === true
      );
      console.log(
        `DEBUG - Challenges with isVisible=true: ${visibleChallenges.length}`
      );

      // Check status filter
      const statusChallenges = challengesByDate.filter((ch) =>
        ["scheduled", "live"].includes(ch.status)
      );
      console.log(
        `DEBUG - Challenges with status=scheduled/live: ${statusChallenges.length}`
      );

      // Check endTime filter
      const endTimeChallenges = challengesByDate.filter((ch) => {
        const endTime = ch.scheduling?.endTime;
        return endTime && new Date(endTime) >= now;
      });
      console.log(
        `DEBUG - Challenges with endTime >= now: ${endTimeChallenges.length}`
      );

      return res.json({
        success: true,
        data: {
          hasChallenge: false,
          message: "No challenge available for today",
        },
      });
    }

    // Get user's numeric age from dateOfBirth, age field, or ageRange
    let userAge = null;
    if (user.dateOfBirth) {
      // Calculate age from dateOfBirth
      const today = new Date();
      const birthDate = new Date(user.dateOfBirth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }
      userAge = age;
    } else if (user.age && typeof user.age === "number") {
      // Use direct age field if available
      userAge = user.age;
    } else if (user.onboarding?.ageRange) {
      // Extract numeric age from ageRange string (e.g., "18-25" -> 21)
      const ageRange = user.onboarding.ageRange;
      if (ageRange.includes("-")) {
        const [min, max] = ageRange.split("-").map(Number);
        if (!isNaN(min) && !isNaN(max)) {
          userAge = Math.floor((min + max) / 2); // Use midpoint as approximate age
        }
      } else if (ageRange.includes("+")) {
        // Handle "65+" format
        const min = parseInt(ageRange.replace("+", ""));
        if (!isNaN(min)) {
          userAge = min + 5; // Use min + 5 as approximate for "65+"
        }
      }
    }

    console.log("DEBUG - User profile for access check:", {
      userId: userId,
      userXP: user.xp?.current || 0,
      userAge: userAge,
      userCountry: user.location?.current?.country,
      userGender: user.onboarding?.gender,
      challengeTargetAudience: challenge.targetAudience,
    });

    // Check if user can access this challenge
    // Skip age/gender restrictions if user has Google ID
    const hasGoogleId = !!user.social?.googleId;

    console.log("🔍 [GET /today] Google ID check:", {
      userId,
      hasGoogleId,
      googleId: user.social?.googleId || null,
      willSkipAgeGenderRestrictions: hasGoogleId,
    });

    const canAccess = challenge.canUserAccess({
      xp: user.xp?.current || 0,
      age: userAge, // Use calculated age
      country: user.location?.current?.country,
      gender: user.onboarding?.gender,
      hasGoogleId: hasGoogleId, // Pass flag to skip restrictions
    });

    console.log("DEBUG - User canAccess result:", canAccess);

    if (!canAccess) {
      console.log(
        "DEBUG - Challenge filtered out due to targetAudience restrictions"
      );
      return res.json({
        success: true,
        data: {
          hasChallenge: false,
          message: "This challenge is not available for you",
        },
      });
    }

    // Get or create user's progress for today (use normalized start date)
    let progress = await UserChallengeProgress.getOrCreateTodayChallenge(
      userId,
      challenge._id,
      normalizedStart
    );

    // Mark as viewed if not yet viewed
    if (progress.status === "not_started") {
      await progress.markViewed();
      await challenge.updateAnalytics("view");
    }

    // Calculate time remaining (use challenge's endTime or normalized end of day, whichever is earlier)
    const isCompleted = progress.status === "completed";
    const challengeEndTime = challenge.scheduling.endTime || normalizedEnd;
    
    // Determine if this is a game-related challenge
    const isGameChallenge = challenge.type === "game" || challenge.type === "sdk_game";

    // For game challenges with SDK provider, auto-trigger verification if not yet verified
    if (isGameChallenge && challenge.sdkProvider && !progress.progress?.metadata?.gameDownloadVerified) {
      // Don't auto-verify here, just add flags for frontend
      if (!progress.progress) {
        progress.progress = {};
      }
      if (!progress.progress.metadata) {
        progress.progress.metadata = {};
      }
      progress.progress.metadata.needsVerification = true;
      progress.progress.metadata.verificationProvider = challenge.sdkProvider;
      await progress.save();
    }
    
    // For game challenges: Timer starts only after game download verification
    let timeRemaining;
    if (isGameChallenge && !isCompleted) {
      const gameDownloadVerified = progress.progress?.metadata?.gameDownloadVerified || false;
      const downloadVerifiedAt = progress.progress?.metadata?.downloadVerifiedAt;
      
      if (!gameDownloadVerified) {
        // Timer hasn't started yet - show challenge waiting for download
        timeRemaining = Math.max(0, challengeEndTime - now);
      } else {
        // Timer started after download verification - use configured timeLimit
        const timerStartTime = downloadVerifiedAt ? new Date(downloadVerifiedAt) : now;
        const timerDuration = challenge.requirements?.timeLimit 
          ? challenge.requirements.timeLimit * 60 * 1000 // Convert minutes to milliseconds
          : 24 * 60 * 60 * 1000; // Default 24 hours if no time limit
        const timerEndTime = new Date(timerStartTime.getTime() + timerDuration);
        
        // Use the earlier of challenge end time or timer end time
        const effectiveEndTime = timerEndTime < new Date(challengeEndTime) ? timerEndTime : new Date(challengeEndTime);
        timeRemaining = Math.max(0, effectiveEndTime - now);
      }
    } else {
      // Non-game challenges or completed challenges
      timeRemaining = isCompleted ? 0 : Math.max(0, challengeEndTime - now);
    }

    // Calculate countdown in hours, minutes, seconds
    const hours = isCompleted
      ? 0
      : Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = isCompleted
      ? 0
      : Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = isCompleted
      ? 0
      : Math.floor((timeRemaining % (1000 * 60)) / 1000);

    // Determine the active game (priority: selectedGame > assignedGame > gameId/gameDetails)
    // ONLY for game-related challenge types
    let activeGame = null;
    let gameName = null;

    // Populate game data for game-related challenge types
    // (isGameChallenge already declared above)

    if (isGameChallenge) {
      if (progress.selectedGame?.gameId) {
        // User has selected a game
        const selectedGameDoc = await Game.findById(
          progress.selectedGame.gameId
        ).lean();
        if (selectedGameDoc) {
          activeGame = {
            id: selectedGameDoc._id,
            name: selectedGameDoc.title,
            gameId: selectedGameDoc.gameId,
            iconUrl: selectedGameDoc.metadata?.iconUrl,
            deepLink: selectedGameDoc.metadata?.deepLink,
            isRequired: false,
            isSelected: true,
            selectedAt: progress.selectedGame.selectedAt,
          };
          gameName = selectedGameDoc.title;
        }
      } else if (challenge.assignedGame?.gameId) {
        // Challenge has an assigned game
        activeGame = {
          id: challenge.assignedGame.gameId._id,
          name: challenge.assignedGame.gameId.title,
          gameId: challenge.assignedGame.gameId.gameId,
          iconUrl: challenge.assignedGame.gameId.metadata?.iconUrl,
          deepLink: challenge.assignedGame.gameId.metadata?.deepLink,
          isRequired: challenge.assignedGame.isRequired,
          isSelected: false,
        };
        gameName = challenge.assignedGame.gameId.title;
      } else if (challenge.gameId && challenge.gameDetails?.name) {
        // Challenge has gameId and gameDetails
        let deepLink = challenge.gameDetails.downloadUrl;
        let iconUrl =
          challenge.gameDetails.image || challenge.gameDetails.square_image || "";
        // For Bitlabs: if icon or link missing, fetch from same source as admin (getPublisherOffers) to get image and URL
        if (
          challenge.sdkProvider === "bitlabs" &&
          challenge.gameId &&
          (!iconUrl || !deepLink)
        ) {
          try {
            const publisherResult = await bitlabsService.getPublisherOffers({
              country: "US",
              devices: ["android", "iphone"],
              is_game: "true",
              type: "game",
            });
            const offers = Array.isArray(publisherResult?.data)
              ? publisherResult.data
              : [];
            const offerId = challenge.gameId.toString();
            const offer = offers.find(
              (o) =>
                (o.id && o.id.toString() === offerId) ||
                (o.offerId && o.offerId.toString() === offerId)
            );
            if (offer) {
              if (!iconUrl) {
                iconUrl =
                  offer.creatives?.icon ||
                  offer.creatives?.images?.["275x275"] ||
                  offer.creatives?.images?.["400x400"] ||
                  offer.icon_url ||
                  "";
              }
              if (!deepLink) {
                deepLink =
                  offer.continue_url ||
                  offer.click_url ||
                  offer.clickUrl ||
                  offer.deepLink ||
                  "";
              }
            }
          } catch (err) {
            console.warn(
              "[GET /today] Bitlabs enrich icon/deepLink failed:",
              err.message
            );
          }
        }
        // Add user ID to deepLink for bitlabs games (matches discover route behavior)
        if (challenge.sdkProvider === "bitlabs" && deepLink) {
          deepLink = deepLink
            .replace(/users\/[^/]+/, `users/${userId}`)
            .replace(/user_id=[^&]+/, `user_id=${userId}`)
            .replace(/aff_id=[^&]+/, `aff_id=${userId}`);
          if (
            !deepLink.includes(`users/${userId}`) &&
            !deepLink.includes(`user_id=${userId}`)
          ) {
            const separator = deepLink.includes("?") ? "&" : "?";
            deepLink += `${separator}user_id=${userId}`;
          }
        }
        activeGame = {
          id: challenge.gameId,
          name: challenge.gameDetails.name,
          gameId: challenge.gameId,
          iconUrl: iconUrl,
          deepLink: deepLink || "",
          isRequired: false,
          isSelected: false,
        };
        gameName = challenge.gameDetails.name;
      }
    }

    // Clean description to prevent UI breaks (remove excessive whitespace, limit length)
    const cleanDescription = challenge.description
      ? challenge.description.trim().replace(/\s+/g, " ").substring(0, 500)
      : null;

    // Ensure progress data is properly structured
    const progressObj = progress.progress || {};
    const isProgressCompleted = progress.status === "completed";
    const progressData = {
      status: progress.status || "not_started",
      percentage: progressObj.percentage ?? 0,
      currentStep: progressObj.currentStep ?? 0,
      totalSteps: progressObj.totalSteps ?? 1,
      startedAt: progress.startedAt || null,
      completedAt: progress.completedAt || null,
      rewardsEarned: progress.rewardsEarned || {
        coins: 0,
        xp: 0,
        bonusCoins: 0,
        bonusXP: 0,
      },
      rewardsClaimed: progress.rewardsClaimed || false,
      // Explicit completion flag - frontend should ONLY show success indicators if this is true
      isCompleted: isProgressCompleted,
      // Additional validation flags to help frontend determine UI state
      canShowSuccess: isProgressCompleted && progress.rewardsClaimed,
      requiresAction:
        !isProgressCompleted &&
        (progress.status === "started" || progress.status === "in_progress"),
    };

    // Generate user-friendly status messages
    const getStatusMessage = () => {
      if (isProgressCompleted) {
        if (progress.rewardsClaimed) {
          return "Completed! Rewards claimed.";
        }
        return "Completed! Claim your rewards.";
      }
      if (progress.status === "in_progress" || progress.status === "started") {
        return "In Progress";
      }
      return "Not Started";
    };

    const getStatusDescription = () => {
      if (isProgressCompleted) {
        return "Great job! You've completed today's challenge.";
      }
      if (progress.status === "in_progress" || progress.status === "started") {
        if (isGameChallenge && !activeGame) {
          return "Please select a game to continue.";
        }
        if (isGameChallenge && challenge.requirements?.timeLimit) {
          const timeLimit = challenge.requirements.timeLimit;
          const playTime = progress.progress?.metadata?.playTimeMinutes || 0;
          return `Play for ${timeLimit} minutes to complete. Current: ${Math.floor(
            playTime
          )} min`;
        }
        return "Complete the required actions to finish.";
      }
      if (isGameChallenge && !activeGame) {
        return "Select a game to start this challenge.";
      }
      return "Start the challenge to begin earning rewards.";
    };

    const getActionButtonLabel = () => {
      if (isProgressCompleted) {
        if (!progress.rewardsClaimed) {
          return challenge.claimType === "watch_ad"
            ? "Watch Ad to Claim Rewards"
            : "Claim Rewards";
        }
        return "Completed";
      }
      if (progress.status === "in_progress" || progress.status === "started") {
        if (isGameChallenge && !progress.progress?.metadata?.gameDownloadVerified) {
          return progress.progress?.metadata?.timerReverted 
            ? "Start Timer" 
            : "Verify Download";
        }
        if (isGameChallenge && progress.progress?.metadata?.gameDownloadVerified && challenge.requirements?.timeLimit) {
          return "Mark as Complete";
        }
        return "Mark as Complete";
      }
      if (isGameChallenge && !activeGame) {
        return "Select Game";
      }
      return "Start Challenge";
    };

    // Calculate tier-multiplied XP for display (using same logic as daily rewards)
    const baseXP = challenge.xpReward || 0;
    let finalXP = baseXP;
    let tierMultiplier = 1.0;
    let userTier = null;

    if (baseXP > 0) {
      const currentXp = user.xp?.current || 0;

      // Use same logic as daily rewards - get multiplier from XPTier.accessBenefits
      tierMultiplier = await getAccessBenefitsMultiplier(currentXp);
      finalXP = Math.round(baseXP * tierMultiplier);

      // Get tier name for display
      const tier = await XPTier.findByXpValue(currentXp);
      userTier = tier ? tier.tierName : null;

      console.log("🔍 [GET /today] Tier multiplier calculation:", {
        userId,
        challengeId: challenge._id,
        baseXP,
        finalXP,
        tierMultiplier,
        userTier,
        currentXp,
      });
    }

    // Build user-friendly response
    const responseData = {
      hasChallenge: true,
      challenge: {
        id: challenge._id,
        title: challenge.title || "Daily Challenge",
        description:
          cleanDescription || "Complete this challenge to earn rewards!",
        type: challenge.type,
        typeLabel:
          challenge.type === "game"
            ? "Game Challenge"
            : challenge.type === "spin"
            ? "Spin Challenge"
            : challenge.type === "survey"
            ? "Survey Challenge"
            : challenge.type === "watch_ad"
            ? "Watch Ad Challenge"
            : "Daily Challenge",
        instructions: challenge.content?.instructions || null,
        mediaUrl: challenge.content?.mediaUrl || null,
        coinReward: challenge.coinReward || 0,
        xpReward: challenge.xpReward || 0,
        claimType: challenge.claimType || "auto",
        claimTypeLabel:
          challenge.claimType === "auto"
            ? "Auto Claim"
            : challenge.claimType === "watch_ad"
            ? "Watch Ad to Claim"
            : "Manual Claim",
        // Game information - ONLY for game-related challenge types
        ...(isGameChallenge && {
          game: activeGame,
          gameName: gameName, // Single game name field for UI
          needsGameSelection:
            !activeGame && !challenge.assignedGame?.isRequired,
          gameSelectionLabel: activeGame
            ? `Selected: ${gameName}`
            : challenge.assignedGame?.isRequired
            ? "Game is required"
            : "Select a game to play",
          // Legacy fields for backward compatibility (deprecated)
          gameId: challenge.gameId || null,
          sdkProvider: challenge.sdkProvider || null,
          hasSdkTask: challenge.sdkTask?.provider !== "none",
          sdkTask:
            challenge.sdkTask?.provider !== "none"
              ? {
                  provider: challenge.sdkTask.provider,
                  taskId: challenge.sdkTask.taskId,
                  offerId: challenge.sdkTask.offerId,
                }
              : null,
        }),
        // Challenge type-specific requirements/configuration
        requirements: challenge.requirements || null,
        // User-friendly requirement descriptions
        requirementDescription:
          isGameChallenge && challenge.requirements?.timeLimit
            ? `Play for ${challenge.requirements.timeLimit} minutes`
            : null,
      },
      progress: {
        ...progressData,
        statusMessage: getStatusMessage(),
        statusDescription: getStatusDescription(),
        // User-friendly progress display
        progressLabel: isProgressCompleted
          ? "100% Complete"
          : progressData.percentage > 0
          ? `${Math.round(progressData.percentage)}% Complete`
          : "0% Complete",
        // Formatted rewards display
        rewardsEarnedLabel:
          progressData.rewardsEarned.coins > 0 ||
          progressData.rewardsEarned.xp > 0
            ? `${progressData.rewardsEarned.coins} coins, ${progressData.rewardsEarned.xp} XP`
            : "0 coins, 0 XP",
      },
      rewards: {
        coins: challenge.coinReward || 0,
        baseXP: baseXP, // Base XP before tier multiplier
        xp: finalXP, // Final XP after tier multiplier (what user will actually receive)
        totalCoins: challenge.coinReward || 0,
        totalXP: finalXP, // Show final XP with tier multiplier
        tierMultiplier: tierMultiplier, // Show the multiplier being applied
        userTier: userTier, // Show user's current tier
        // User-friendly reward labels
        coinsLabel:
          challenge.coinReward > 0
            ? `${challenge.coinReward} Coins`
            : "No Coins",
        xpLabel:
          finalXP > 0
            ? tierMultiplier > 1.0
              ? `${finalXP} XP (${baseXP} × ${tierMultiplier}x)`
              : `${finalXP} XP`
            : "No XP",
        rewardsLabel:
          challenge.coinReward > 0 && finalXP > 0
            ? tierMultiplier > 1.0
              ? `${challenge.coinReward} coins, ${finalXP} XP (${baseXP} × ${tierMultiplier}x)`
              : `${challenge.coinReward} coins, ${finalXP} XP`
            : challenge.coinReward > 0
            ? `${challenge.coinReward} coins`
            : finalXP > 0
            ? tierMultiplier > 1.0
              ? `${finalXP} XP (${baseXP} × ${tierMultiplier}x)`
              : `${finalXP} XP`
            : "No rewards",
      },
        countdown: {
          timeRemaining, // milliseconds (0 if completed)
          hours,
          minutes,
          seconds,
          formatted: isCompleted
            ? "00:00:00"
            : `${hours.toString().padStart(2, "0")}:${minutes
                .toString()
                .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
          endsAt: challengeEndTime.toISOString(),
          // Add server timestamp to help client sync timer
          serverTime: now.toISOString(),
          // Indicate if timer should be stopped
          isCompleted: isCompleted,
          isActive: !isCompleted,
          // For game challenges: indicate timer status
          ...(isGameChallenge && {
            gameDownloadVerified: progress.progress?.metadata?.gameDownloadVerified || false,
            downloadVerifiedAt: progress.progress?.metadata?.downloadVerifiedAt || null,
            timerWaitingForDownload: !progress.progress?.metadata?.gameDownloadVerified,
            timerStarted: progress.progress?.metadata?.gameDownloadVerified || false,
            gameTimerDuration: challenge.requirements?.timeLimit, // Show the actual game timer duration
            gameTimerType: progress.progress?.metadata?.gameDownloadVerified ? 'countdown' : 'waiting',
          }),
          // User-friendly time labels
          timeRemainingLabel: isCompleted
            ? "Challenge Ended"
            : isGameChallenge && !progress.progress?.metadata?.gameDownloadVerified
            ? (progress.progress?.metadata?.timerReverted 
                ? "Please download game to start challenge timer" 
                : `Download ${activeGame?.name || 'game'} to start ${challenge.requirements?.timeLimit || 60} minute timer`)
            : isGameChallenge && progress.progress?.metadata?.gameDownloadVerified && challenge.requirements?.timeLimit
            ? `${minutes}m ${seconds}s remaining`
            : hours > 0
            ? `${hours}h ${minutes}m remaining`
            : minutes > 0
            ? `${minutes}m ${seconds}s remaining`
            : `${seconds}s remaining`,
          urgencyLevel: hours < 1 ? "high" : hours < 3 ? "medium" : "low",
        },
      actions: {
        // Game-specific actions - ONLY for game-related challenge types
        ...(isGameChallenge && {
          canSelectGame:
            !challenge.assignedGame?.isRequired &&
            !progress.selectedGame?.gameId &&
            progress.status !== "completed",
          canPlay: !!activeGame && progress.status !== "completed",
          selectGameLabel: "Select a Game",
          playGameLabel: activeGame ? `Play ${gameName}` : "Select Game First",
        }),
        // Challenge type-specific actions
        ...(challenge.type === "spin" && {
          canSpin: progress.status !== "completed",
          spinLabel: "Spin the Wheel",
        }),
        ...(challenge.type === "watch_ad" && {
          canWatchAd: progress.status !== "completed",
          watchAdLabel: "Watch Ad",
        }),
        ...(challenge.type === "survey" && {
          canStartSurvey: progress.status !== "completed",
          startSurveyLabel: "Start Survey",
        }),
        // Common actions for all challenge types
        canComplete:
          progress.status === "in_progress" || progress.status === "started",
        canClaimRewards:
          progress.status === "completed" && !progress.rewardsClaimed,
        // User-friendly action labels
        primaryActionLabel: getActionButtonLabel(),
        primaryActionEnabled:
          !isProgressCompleted ||
          (!progress.rewardsClaimed && challenge.claimType !== "watch_ad"),
        claimRewardsLabel:
          challenge.claimType === "watch_ad"
            ? "Watch Ad to Claim"
            : "Claim Rewards",
      },
      // Helpful hints and tips
      hints: {
        showHint:
          !isProgressCompleted &&
          (progress.status === "not_started" || progress.status === "started"),
        hintText:
          isGameChallenge && !activeGame
            ? "💡 Select a game from the list to start playing"
            : isGameChallenge && !progress.progress?.metadata?.gameDownloadVerified
            ? (progress.progress?.metadata?.timerReverted
                ? "💡 Please download the game first. Timer has been reset to wait for download verification."
                : `💡 Download and play ${activeGame?.name || 'the game'} to start the ${challenge.requirements?.timeLimit || 60}-minute challenge timer`)
            : isGameChallenge && progress.progress?.metadata?.gameDownloadVerified && challenge.requirements?.timeLimit
            ? `💡 Keep playing for ${challenge.requirements.timeLimit} minutes total. Time remaining: ${Math.max(0, Math.floor((progress.progress?.metadata?.gameTimerRemaining || 0) / 60000))} minutes`
            : isGameChallenge
            ? "💡 Download the game to complete this challenge"
            : challenge.type === "spin"
            ? "💡 Spin the wheel to complete this challenge"
            : challenge.type === "watch_ad"
            ? "💡 Watch an ad to complete this challenge"
            : challenge.type === "survey"
            ? "💡 Complete the survey to earn rewards"
            : "💡 Follow the instructions to complete this challenge",
      },
    };

    res.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Error getting today challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get today's challenge",
    });
  }
});

/**
 * @route   GET /api/daily-challenge/:id
 * @desc    Get a specific daily challenge by ID
 * @access  Private
 */
router.get("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const challenge = await DailyChallenge.findById(id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "Challenge not found",
      });
    }

    // Check if user can access this challenge
    const isOwner = challenge.createdBy.toString() === userId;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    res.json({
      success: true,
      data: challenge.getDisplayData(),
    });
  } catch (error) {
    console.error("Error getting challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get challenge",
    });
  }
});

/**
 * @route   PUT /api/daily-challenge/:id
 * @desc    Update a daily challenge
 * @access  Private
 */
router.put("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    const challenge = await DailyChallenge.findById(id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "Challenge not found",
      });
    }

    // Check if user can update this challenge
    const isOwner = challenge.createdBy.toString() === userId;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // Auto-update scheduling if challengeDate is being updated
    if (updateData.challengeDate) {
      const rawDate = new Date(updateData.challengeDate);
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

      updateData.scheduling = {
        startTime: normalizedStart,
        endTime: normalizedEnd,
      };
    }

    // Fetch gameDetails if gameId and sdkProvider are provided
    if (updateData.gameId && updateData.sdkProvider === "besitos") {
      try {
        const mockReq = { query: { offer_id: updateData.gameId } };
        const captureGame = () => {
          let payload = null;
          return {
            res: {
              json: (data) => {
                payload = data;
              },
              status: (code) => ({
                json: (data) => {
                  payload = { ...data, statusCode: code };
                },
              }),
            },
            get: () => payload,
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
    } else if (updateData.gameId && updateData.sdkProvider === "bitlabs") {
      // Add Bitlabs game details fetching for update
      try {
        const bitlabsController = require("../controllers/bitlabs.controller");
        const mockReq = { query: { is_game: "true" } };
        const captureGame = () => {
          let payload = null;
          return {
            res: {
              json: (data) => {
                payload = data;
              },
              status: (code) => ({
                json: (data) => {
                  payload = { ...data, statusCode: code };
                },
              }),
            },
            get: () => payload,
          };
        };
        const cap = captureGame();
        await bitlabsController.getOffers(mockReq, cap.res);
        const ext = cap.get();

        if (
          ext &&
          ext.success === true &&
          Array.isArray(ext.data) &&
          ext.data.length > 0
        ) {
          // Find the specific game by ID
          const external = ext.data.find(offer => 
            offer.id?.toString() === updateData.gameId.toString() || 
            offer.offerId?.toString() === updateData.gameId.toString()
          );

          if (external) {
            updateData.gameDetails = {
              id: external.id || external.offerId || "",
              name: external.title || external.anchor || external.product_name || updateData.title,
              description: external.description || updateData.description,
              image: external.image || external.large_image || "",
              square_image: external.square_image || "",
              large_image: external.large_image || external.image || "",
              category: Array.isArray(external.categories) && external.categories[0]
                ? external.categories[0]
                : external.category || "",
              downloadUrl: external.url || external.downloadUrl || "",
            };
          } else {
            console.warn(`Game with ID ${updateData.gameId} not found in Bitlabs offers`);
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
        } else {
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
          "Failed to fetch gameDetails from Bitlabs:",
          error.message
        );
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

    const updatedChallenge = await DailyChallenge.findByIdAndUpdate(
      id,
      { ...updateData, updatedBy: userId },
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Challenge updated successfully",
      data: updatedChallenge.getDisplayData(),
    });
  } catch (error) {
    console.error("Error updating challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update challenge",
    });
  }
});

/**
 * @route   DELETE /api/daily-challenge/:id
 * @desc    Delete a daily challenge
 * @access  Private
 */
router.delete("/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const challenge = await DailyChallenge.findById(id);

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "Challenge not found",
      });
    }

    // Check if user can delete this challenge
    const isOwner = challenge.createdBy.toString() === userId;
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // Check if challenge is already started by users
    const hasProgress = await UserChallengeProgress.findOne({
      challengeId: id,
    });
    if (hasProgress) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete challenge that has been started by users",
      });
    }

    await DailyChallenge.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Challenge deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete challenge",
    });
  }
});

/**
 * @route   GET /api/daily-challenge/my-challenges
 * @desc    Get user's own challenges
 * @access  Private
 */
router.get("/my-challenges", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10, status, type } = req.query;

    const query = { createdBy: userId };
    if (status) query.status = status;
    if (type) query.type = type;

    const challenges = await DailyChallenge.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select(
        "title description type coinReward xpReward status challengeDate createdAt"
      );

    const total = await DailyChallenge.countDocuments(query);

    res.json({
      success: true,
      data: {
        challenges: challenges.map((challenge) => challenge.getDisplayData()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting user challenges:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user challenges",
    });
  }
});

// ==================== GAME SELECTION ====================

/**
 * @route   POST /api/daily-challenge/select-game
 * @desc    Select a game for today's challenge
 * @body    {string} gameId - Game ID to select
 * @access  Private
 */
router.post("/select-game", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { gameId } = req.body;

    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: "Game ID is required",
      });
    }

    const now = new Date();

    // Normalize today's date to UTC start-of-day (matching admin creation logic)
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
      "scheduling.startTime": { $lte: now },
      "scheduling.endTime": { $gte: now },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No challenge available for today",
      });
    }

    // Check if game selection is allowed
    if (challenge.assignedGame?.isRequired) {
      return res.status(400).json({
        success: false,
        error:
          "This challenge has a required game, you cannot select a different one",
      });
    }

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Game not found",
      });
    }

    // Get user's progress
    let progress = await UserChallengeProgress.getUserChallengeForDate(
      userId,
      normalizedStart
    );

    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(
        userId,
        challenge._id,
        normalizedStart
      );
    }

    // Check if challenge already completed
    if (progress.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Challenge already completed",
      });
    }

    // Select the game
    await progress.selectGame(gameId);

    res.json({
      success: true,
      message: "Game selected successfully",
      data: {
        selectedGame: {
          id: game._id,
          title: game.title,
          iconUrl: game.metadata?.iconUrl,
          deepLink: game.metadata?.deepLink,
        },
        canPlayNow: true,
      },
    });
  } catch (error) {
    console.error("Error selecting game:", error);
    res.status(500).json({
      success: false,
      error: "Failed to select game",
    });
  }
});

// ==================== START CHALLENGE ====================

/**
 * @route   POST /api/daily-challenge/start
 * @desc    Start today's challenge
 * @access  Private
 */
router.post("/start", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { gameId, sdkProvider } = req.body;
    const now = new Date();

    // Normalize today's date to UTC start-of-day (matching admin creation logic)
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // Get today's challenge using UTC dates and status filter
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
      "scheduling.startTime": { $lte: now },
      "scheduling.endTime": { $gte: now },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No challenge available for today",
      });
    }

    // Get user's progress
    let progress = await UserChallengeProgress.getUserChallengeForDate(
      userId,
      normalizedStart
    );

    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(
        userId,
        challenge._id,
        normalizedStart
      );
    }

    // If user provides gameId in request, use it
    if (gameId && sdkProvider) {
      progress.selectedGame = {
        gameId: gameId,
        sdkProvider: sdkProvider,
        selectedAt: new Date(),
      };
      await progress.save();
    }

    // Check if game is available
    const hasGame =
      challenge.gameId ||
      challenge.assignedGame?.gameId ||
      progress.selectedGame?.gameId;
    if (!hasGame && challenge.type === "game") {
      return res.status(400).json({
        success: false,
        error: "Please provide a gameId in the request body",
      });
    }

    // Mark as started
    await progress.markStarted();
    await challenge.updateAnalytics("start");

    // Get the game to play
    let gameToPlay = null;
    if (challenge.gameId) {
      // Use challenge's own gameId and gameDetails
      gameToPlay = {
        _id: challenge.gameId,
        title: challenge.gameDetails?.name || challenge.title,
        metadata: {
          deepLink: challenge.gameDetails?.downloadUrl,
          packageName: challenge.gameId,
        },
      };
    } else if (challenge.assignedGame?.gameId) {
      gameToPlay = challenge.assignedGame.gameId;
    } else if (progress.selectedGame?.gameId) {
      gameToPlay = await Game.findById(progress.selectedGame.gameId);
    }

    // For Bitlabs games: use same Bitlabs function as admin route (getPublisherOffers), match offer, get URL and game title, then add userId
    let deepLink = gameToPlay?.metadata?.deepLink;
    let gameTitleFromOffer = null; // Use Bitlabs offer title (game name) instead of challenge/user title
    const packageName = gameToPlay?.metadata?.packageName ?? gameToPlay?._id;
    if (
      challenge.type === "game" &&
      gameToPlay &&
      challenge.sdkProvider === "bitlabs" &&
      challenge.gameId
    ) {
      const offerId = challenge.gameId.toString();
      // Same function as admin GET /api/admin/game-offers/games/by-sdk/bitlabs
      const publisherResult = await bitlabsService.getPublisherOffers({
        country: "US",
        devices: ["android", "iphone"],
        is_game: "true",
        type: "game",
      });
      const offers = Array.isArray(publisherResult?.data) ? publisherResult.data : [];
      const offer = offers.find(
        (o) =>
          (o.id && o.id.toString() === offerId) ||
          (o.offerId && o.offerId.toString() === offerId)
      );
      if (offer) {
        gameTitleFromOffer = offer.anchor || offer.title || offer.name || offer.product_name || null;
        deepLink =
          offer.continue_url ||
          offer.click_url ||
          offer.clickUrl ||
          offer.deepLink ||
          offer.deep_link ||
          "";
      }
      console.log("[DAILY-CHALLENGE START] Bitlabs (same as admin: getPublisherOffers):", {
        offerId,
        userId,
        offersCount: offers.length,
        found: !!offer,
        deepLink: deepLink || "(none)",
      });
      // Attach userId to redirect link for attribution
      if (deepLink) {
        deepLink = deepLink
          .replace(/users\/[^/]+/, `users/${userId}`)
          .replace(/user_id=[^&]+/, `user_id=${userId}`)
          .replace(/aff_id=[^&]+/, `aff_id=${userId}`);
        if (!deepLink.includes(`users/${userId}`) && !deepLink.includes(`user_id=${userId}`)) {
          const separator = deepLink.includes("?") ? "&" : "?";
          deepLink += `${separator}user_id=${userId}`;
        }
      }
    } else if (gameToPlay?.metadata?.deepLink) {
      deepLink = gameToPlay.metadata.deepLink;
    }

    // Only return game info for game type challenges
    const responseData = {
      success: true,
      message: "Challenge started",
      data: {
        challengeId: challenge._id,
        status: progress.status,
        sdkTask:
          challenge.sdkTask?.provider !== "none" ? challenge.sdkTask : null,
      },
    };

    // Only include game info for game type challenges (use game title from Bitlabs offer when available, not challenge/user title)
    if (challenge.type === "game" && gameToPlay) {
      responseData.data.game = {
        id: gameToPlay._id,
        title: gameTitleFromOffer || gameToPlay.title,
        deepLink: deepLink || "",
        packageName: packageName || gameToPlay._id,
      };
    }

    res.json(responseData);
  } catch (error) {
    console.error("Error starting challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start challenge",
    });
  }
});

// ==================== SPIN FOR DAILY CHALLENGE ====================

/**
 * @route   POST /api/daily-challenge/spin
 * @desc    Spin the wheel for a daily challenge (bypasses spin wheel eligibility checks)
 * @access  Private
 */
router.post("/spin", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    // Normalize today's date to UTC start-of-day
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // Get today's challenge - must be spin type
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
      type: "spin",
      "scheduling.startTime": { $lte: now },
      "scheduling.endTime": { $gte: now },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No spin challenge available for today",
      });
    }

    // Get user's progress
    const progress = await UserChallengeProgress.getUserChallengeForDate(
      userId,
      normalizedStart
    );

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: "Challenge not started. Please start the challenge first.",
      });
    }

    if (progress.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Challenge already completed",
      });
    }

    // Check if already spun today for this challenge
    const existingSpin = await SpinWheelLog.findOne({
      user: userId,
      createdAt: { $gte: normalizedStart, $lte: normalizedEnd },
    });

    if (existingSpin) {
      return res.json({
        success: true,
        message: "You have already spun today for this challenge",
        data: {
          spinId: existingSpin._id,
          reward: {
            id: existingSpin.reward,
            name: existingSpin.rewardName,
            type: existingSpin.rewardType,
            amount: existingSpin.rewardAmount,
          },
          createdAt: existingSpin.createdAt,
        },
      });
    }

    // Get user and spin wheel config
    const user = await User.findById(userId).select("wallet xp vip");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Get spin wheel config (for reward selection, but bypass eligibility)
    let config;
    try {
      config = await SpinWheelConfig.findOne({ isActive: true }).lean();
      if (!config) {
        // Use default config
        config = {
          spinMode: "free",
          vipMultipliers: {
            bronze: 1.2,
            gold: 1.5,
            platinum: 2.0,
          },
        };
      }
    } catch (error) {
      console.error("Error getting spin wheel config:", error);
      config = {
        spinMode: "free",
        vipMultipliers: {},
      };
    }

    const userTier = user.vip?.level || "Bronze";

    // Get all active rewards (bypass tier eligibility for daily challenge)
    const allRewards = await SpinWheelReward.find({ isActive: true }).lean();

    if (allRewards.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No rewards available",
      });
    }

    // Select reward by probability (same logic as regular spin)
    const totalProbability = allRewards.reduce(
      (sum, r) => sum + (r.probability || 0),
      0
    );

    let selectedReward;
    if (totalProbability <= 0) {
      // Fallback: equal probability for all rewards
      const randomIndex = Math.floor(Math.random() * allRewards.length);
      selectedReward = allRewards[randomIndex];
    } else {
      // Weighted random selection
      const random = Math.random() * totalProbability;
      let cumulative = 0;

      for (const reward of allRewards) {
        const prob = reward.probability || 0;
        cumulative += prob;
        if (random < cumulative) {
          selectedReward = reward;
          break;
        }
      }

      // Safety fallback
      if (!selectedReward) {
        selectedReward = allRewards[allRewards.length - 1];
      }
    }

    // Apply VIP multiplier if applicable
    const vipMultiplier =
      config.vipMultipliers?.[userTier.toLowerCase()] || 1.0;

    let finalAmount;
    if (selectedReward.type === "coins" || selectedReward.type === "xp") {
      finalAmount = Math.floor(selectedReward.amount * vipMultiplier);
    } else {
      finalAmount = selectedReward.amount;
    }

    // Create spin log
    const spinId = `SPIN-DC-${Date.now()}-${Math.floor(
      Math.random() * 100000
    )}`;
    const spinLog = new SpinWheelLog({
      user: userId,
      spinId: spinId,
      reward: selectedReward._id,
      rewardName: selectedReward.name,
      rewardType: selectedReward.type,
      rewardAmount: finalAmount,
      vipMultiplier:
        selectedReward.type === "coins" || selectedReward.type === "xp"
          ? vipMultiplier
          : 1.0,
      spinMode: config.spinMode || "free",
      userTier: userTier,
      isWin: true,
    });

    // For free spins, automatically credit the reward
    let coinsEarned = 0;
    let xpEarned = 0;
    let transaction = null;

    if (
      config.spinMode === "free" ||
      !config.spinMode ||
      config.spinMode !== "ad_based"
    ) {
      if (selectedReward.type === "coins" || selectedReward.type === "coin") {
        coinsEarned = finalAmount;
        user.wallet.balance += coinsEarned;
        user.wallet.lastUpdated = new Date();

        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "coins",
          amount: coinsEarned,
          description: `Daily Challenge Spin - ${selectedReward.name} (${coinsEarned} coins)`,
          status: "completed",
          referenceId: spinLog.spinId,
        });
        await transaction.save();
        spinLog.transactionId = transaction._id;
      } else if (selectedReward.type === "xp" || selectedReward.type === "XP") {
        xpEarned = finalAmount;
        user.xp.current += xpEarned;
        user.xp.total += xpEarned;

        transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: "xp",
          amount: xpEarned,
          description: `Daily Challenge Spin - ${selectedReward.name} (${xpEarned} XP)`,
          status: "completed",
          referenceId: spinLog.spinId,
        });
        await transaction.save();
        spinLog.transactionId = transaction._id;
      }
    }

    // Update user spin count
    user.spinCount = (user.spinCount || 0) + 1;
    user.lastSpinAt = new Date();
    await user.save();

    // Save spin log
    await spinLog.save();

    console.log("✅ [POST /daily-challenge/spin] Spin completed:", {
      userId,
      challengeId: challenge._id,
      spinLogId: spinLog._id,
      rewardType: selectedReward.type,
      rewardAmount: finalAmount,
    });

    // Update reward stats
    await SpinWheelReward.findByIdAndUpdate(selectedReward._id, {
      $inc: { "stats.totalWins": 1 },
      $set: { "stats.lastWon": new Date() },
    });

    // Mark daily challenge progress as completed in UserChallengeProgress (same collection used for admin "Daily Challenges Completed" count)
    if (
      config.spinMode === "free" ||
      !config.spinMode ||
      config.spinMode !== "ad_based"
    ) {
      await progress.markCompleted({
        coins: coinsEarned,
        xp: xpEarned,
        bonusCoins: 0,
        bonusXP: 0,
      });
      await progress.claimRewards();
      const accountOverviewService = require("../utils/accountOverview");
      await accountOverviewService.incrementChallengesCompletedCounter(userId);
    }

    res.json({
      success: true,
      message: "Spin completed for daily challenge",
      data: {
        spinId: spinLog._id,
        challengeId: challenge._id,
        reward: {
          id: selectedReward._id,
          name: selectedReward.name,
          type: selectedReward.type,
          amount: finalAmount,
          baseAmount: selectedReward.amount,
          icon: selectedReward.icon,
          color: selectedReward.color,
          metadata: selectedReward.metadata,
        },
        vipMultiplier,
        userTier,
        status: config.spinMode === "ad_based" ? "pending" : "completed",
        message:
          config.spinMode === "ad_based"
            ? "Watch video ad to claim your reward!"
            : "Reward credited successfully!",
        ...(config.spinMode !== "ad_based" && {
          coinsEarned,
          xpEarned,
          newBalance: user.wallet.balance,
          newXP: user.xp.current,
        }),
      },
    });
  } catch (error) {
    console.error("Error spinning for daily challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to spin for daily challenge",
    });
  }
});

// ==================== COMPLETE CHALLENGE ====================

/**
 * @route   POST /api/daily-challenge/complete
 * @desc    Complete today's challenge and claim rewards
 * @body    {string} conversionId - Optional Besitos conversion ID
 * @access  Private
 */
router.post("/complete", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { conversionId, adWatched } = req.body; // adWatched indicates if ad was watched for watch_ad claim type
    // Be tolerant: mobile clients sometimes send "true"/"1" as strings
    const adWatchedFlag =
      adWatched === true ||
      adWatched === "true" ||
      adWatched === 1 ||
      adWatched === "1";
    // Debug matching for game verification (Bitlabs/Besitos) in /complete.
    // Kept ON by default, but output is capped to small samples to avoid log spam.
    const DEBUG_GAME_MATCH = process.env.DC_GAME_DEBUG !== "0";

    const now = new Date();

    // Normalize today's date to UTC start-of-day (matching admin creation logic)
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );
    const todayStr = normalizedStart.toISOString().split("T")[0];

    const user = await User.findById(userId).select("wallet xp streak badges");

    // Get today's challenge using UTC dates and status filter
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
      "scheduling.startTime": { $lte: now },
      "scheduling.endTime": { $gte: now },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No challenge available for today",
      });
    }

    // Get user's progress
    const progress = await UserChallengeProgress.getUserChallengeForDate(
      userId,
      normalizedStart
    );

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: "Challenge not started",
      });
    }

    // Check if already completed today
    if (progress.status === "completed") {
      return res.status(400).json({
        success: false,
        error: "Challenge already completed today",
      });
    }

    // Note: We do NOT hard-block here anymore.
    // For Bitlabs/Besitos game challenges, /complete will attempt to verify download inline
    // (via the existing game validation switch below) when needed.

    // ========== VALIDATE USER ACTUALLY PERFORMED THE REQUIRED ACTION ==========
    let actionValidated = false;
    let validationError = null;

    switch (challenge.type) {
      case "spin":
        // Verify user actually spun the wheel today
        // Use normalizedStart and normalizedEnd to ensure UTC date matching
        const userIdObjectId = mongoose.Types.ObjectId.isValid(userId)
          ? new mongoose.Types.ObjectId(userId)
          : userId;

        console.log("🔍 [POST /complete] Spin validation check:", {
          userId,
          userIdObjectId: userIdObjectId.toString(),
          challengeId: challenge._id,
          challengeType: challenge.type,
          normalizedStart: normalizedStart.toISOString(),
          normalizedEnd: normalizedEnd.toISOString(),
        });

        // Try query with both string and ObjectId userId to handle any format issues
        const spinLog = await SpinWheelLog.findOne({
          $or: [{ user: userId }, { user: userIdObjectId }],
          createdAt: {
            $gte: normalizedStart,
            $lte: normalizedEnd,
          },
        }).sort({ createdAt: -1 });

        console.log("🔍 [POST /complete] Spin log query result:", {
          userId,
          spinLogFound: !!spinLog,
          spinLogId: spinLog?._id,
          spinLogCreatedAt: spinLog?.createdAt?.toISOString(),
          spinLogUser: spinLog?.user?.toString(),
          query: {
            user: userId,
            createdAt: {
              $gte: normalizedStart.toISOString(),
              $lte: normalizedEnd.toISOString(),
            },
          },
        });

        // Check for ANY spins for this user (to diagnose if it's a user ID issue)
        const anySpinsCount = await SpinWheelLog.countDocuments({
          $or: [{ user: userId }, { user: userIdObjectId }],
        });

        // Also check with just string userId (in case ObjectId conversion is the issue)
        const stringOnlyCount = await SpinWheelLog.countDocuments({
          user: userId,
        });

        // Also check with ObjectId only
        const objectIdOnlyCount = await SpinWheelLog.countDocuments({
          user: userIdObjectId,
        });

        // Also check all recent spins for debugging
        const allRecentSpins = await SpinWheelLog.find({
          $or: [{ user: userId }, { user: userIdObjectId }],
        })
          .sort({ createdAt: -1 })
          .limit(5)
          .select("createdAt user")
          .lean();

        // Also try a raw query to see all spins in the database (for debugging)
        const allSpinsSample = await SpinWheelLog.find({})
          .sort({ createdAt: -1 })
          .limit(3)
          .select("user createdAt")
          .lean();

        console.log("🔍 [POST /complete] Recent spins for user:", {
          userId,
          totalRecentSpins: allRecentSpins.length,
          anySpinsCount,
          stringOnlyCount,
          objectIdOnlyCount,
          recentSpins: allRecentSpins.map((spin) => ({
            id: spin._id,
            createdAt: spin.createdAt?.toISOString(),
            user: spin.user?.toString(),
            userType: typeof spin.user,
            isToday:
              spin.createdAt >= normalizedStart &&
              spin.createdAt <= normalizedEnd,
          })),
          allSpinsSample: allSpinsSample.map((spin) => ({
            user: spin.user?.toString(),
            createdAt: spin.createdAt?.toISOString(),
            matchesUserId:
              spin.user?.toString() === userId ||
              spin.user?.toString() === userIdObjectId.toString(),
          })),
        });

        if (!spinLog) {
          // Provide more helpful error message with clear instructions
          if (anySpinsCount === 0) {
            validationError =
              "Please spin the wheel first to complete this challenge. Call POST /api/daily-challenge/spin before completing.";
          } else {
            validationError =
              "Please spin the wheel today to complete this challenge. You have spun before, but not today. Call POST /api/daily-challenge/spin first.";
          }
          console.log("❌ [POST /complete] Spin validation failed:", {
            userId,
            error: validationError,
            anySpinsCount,
            normalizedStart: normalizedStart.toISOString(),
            normalizedEnd: normalizedEnd.toISOString(),
            requiredAction:
              "Call POST /api/daily-challenge/spin before completing",
          });
        } else {
          actionValidated = true;
          console.log("✅ [POST /complete] Spin validation passed:", {
            userId,
            spinLogId: spinLog._id,
            spinLogCreatedAt: spinLog.createdAt?.toISOString(),
          });
        }
        break;

      case "sdk_game":
      case "game":
        // FIXED: Proper game download verification for Bitlab and Bestios
        // Verify game was downloaded by checking third-party API data
        const gameId =
          challenge.assignedGame?.gameId ||
          challenge.gameId ||
          progress.selectedGame?.gameId;

        if (!gameId) {
          validationError = "Game not selected or assigned for this challenge";
        } else {
          // Get game ID string for comparison
          const gameIdString = gameId.toString ? gameId.toString() : gameId;
          let gameDownloaded = false;
          let gameData = null; // For Besitos
          let gameHistory = null; // For Bitlabs

          // Check based on SDK provider
          const providerLower = (challenge.sdkProvider || "").toLowerCase();
          const progressDownloadVerified =
            progress.progress?.metadata?.gameDownloadVerified === true;

          console.log("🎮 [DC /complete] Game validation start:", {
            userId,
            challengeId: challenge._id?.toString?.() || challenge._id,
            provider: providerLower,
            gameIdString,
            progressDownloadVerified,
            hasProgressMetadata: !!progress.progress?.metadata,
            downloadVerifiedAt: progress.progress?.metadata?.downloadVerifiedAt || null,
          });
          if (DEBUG_GAME_MATCH) {
            console.log("🧩 [DC /complete] GameId sources:", {
              assignedGameId: challenge.assignedGame?.gameId?.toString?.() || null,
              challengeGameId: challenge.gameId?.toString?.() || null,
              selectedGameId: progress.selectedGame?.gameId?.toString?.() || null,
            });
          }

          // If we've already verified download via the dedicated verify endpoints,
          // we still need to fetch data to validate first goal/event completion
          // So we'll fetch the data anyway for validation purposes
          if (providerLower === "bitlabs") {
            // For Bitlab: Verify game was downloaded by matching game ID from third-party API
            try {
              const bitlabsService = require("../services/bitlabs.service");
              const userHistory = await bitlabsService.getUserOfferHistory(userId, gameIdString);
              
              if (userHistory && userHistory.data) {
                console.log("🔍 [DC /complete] Bitlabs history received:", {
                  hasData: !!userHistory.data,
                  dataType: Array.isArray(userHistory.data) ? "array" : typeof userHistory.data,
                  hasEvents: !!userHistory.data?.events,
                  eventsCount: Array.isArray(userHistory.data?.events)
                    ? userHistory.data.events.length
                    : undefined,
                });
                // Check if the specific game appears in user's offer history
                // (Bitlabs payloads sometimes use id or offerId)
                const matchesBitlabsOffer = (offer) => {
                  const idStr = offer?.id?.toString?.() || offer?.id;
                  const offerIdStr = offer?.offerId?.toString?.() || offer?.offerId;
                  return (
                    idStr?.toString?.() === gameIdString ||
                    offerIdStr?.toString?.() === gameIdString
                  );
                };

                const bitlabsOffers = Array.isArray(userHistory.data)
                  ? userHistory.data
                  : [userHistory.data];

                const gameHistoryIndex = bitlabsOffers.findIndex(matchesBitlabsOffer);
                gameHistory =
                  gameHistoryIndex >= 0 ? bitlabsOffers[gameHistoryIndex] : null;
                
                const bitlabsMatchOn = gameHistory
                  ? (gameHistory?.id?.toString?.() === gameIdString
                      ? "id"
                      : gameHistory?.offerId?.toString?.() === gameIdString
                      ? "offerId"
                      : "unknown")
                  : null;
                
                console.log("🔍 [DC /complete] Bitlabs match result:", {
                  gameIdString,
                  matched: !!gameHistory,
                  matchedIndex: gameHistoryIndex >= 0 ? gameHistoryIndex : null,
                  matchedId: gameHistory?.id?.toString?.() || null,
                  matchedOfferId: gameHistory?.offerId?.toString?.() || null,
                  matchOn: bitlabsMatchOn,
                  status: gameHistory?.status || null,
                  approved_conversions: gameHistory?.approved_conversions,
                  eventsCount: Array.isArray(gameHistory?.events)
                    ? gameHistory.events.length
                    : undefined,
                });

                if (DEBUG_GAME_MATCH) {
                  const sampleLimit = 25;
                  const offersSample = bitlabsOffers.slice(0, sampleLimit).map((o) => ({
                    id: o?.id?.toString?.() || o?.id || null,
                    offerId: o?.offerId?.toString?.() || o?.offerId || null,
                    anchor: o?.anchor || o?.title || null,
                    status: o?.status || null,
                  }));

                  const matchCounts = bitlabsOffers.reduce(
                    (acc, o) => {
                      const idStr = o?.id?.toString?.() || o?.id;
                      const offerIdStr = o?.offerId?.toString?.() || o?.offerId;
                      if (idStr?.toString?.() === gameIdString) acc.id++;
                      if (offerIdStr?.toString?.() === gameIdString) acc.offerId++;
                      return acc;
                    },
                    { id: 0, offerId: 0 }
                  );

                  console.log("🧩 [DC /complete] Bitlabs matching summary:", {
                    offersCount: bitlabsOffers.length,
                    gameIdString,
                    matchCounts,
                    sampleLimit,
                    offersSample,
                  });
                }

                // Game is considered downloaded if it exists in history and has some activity
                // OR if we already have saved verification
                gameDownloaded = progressDownloadVerified || !!(gameHistory && (
                  gameHistory.status === "installed" ||
                  gameHistory.status === "completed" ||
                  (gameHistory.events && gameHistory.events.length > 0) ||
                  gameHistory.approved_conversions > 0
                ));
                
                if (progressDownloadVerified && !gameHistory) {
                  console.log("✅ [DC /complete] Using saved download verification flag, but fetching data for goal validation.");
                }
              }
            } catch (error) {
              console.error("Error verifying Bitlab game download:", error);
              validationError = "Failed to verify game download from Bitlab";
            }
          } else if (providerLower === "besitos") {
            // For Bestios: Verify game was downloaded by matching user ID
            try {
              const besitosService = require("../services/besitos.service");
              const userData = await besitosService.getUserData(userId);

              // Besitos has been observed returning either:
              // - { data: { available, in_progress, completed, ... }, status, trace_id, ... }
              // - { available, in_progress, completed, ... } (no nested .data)
              const topLevelKeys =
                userData && typeof userData === "object"
                  ? Object.keys(userData).slice(0, 30)
                  : [];
              const nestedKeys =
                userData?.data && typeof userData.data === "object"
                  ? Object.keys(userData.data).slice(0, 30)
                  : [];

              console.log("🔍 [DC /complete] Besitos raw response shape:", {
                isNull: userData == null,
                type: typeof userData,
                topLevelKeys,
                hasNestedData: !!userData?.data,
                nestedKeys,
              });

              const offersPayload =
                userData?.data &&
                (Array.isArray(userData.data.available) ||
                  Array.isArray(userData.data.in_progress) ||
                  Array.isArray(userData.data.completed))
                  ? userData.data
                  : userData;

              if (offersPayload && typeof offersPayload === "object") {
                console.log("🔍 [DC /complete] Besitos offers payload extracted:", {
                  payloadKeys: Object.keys(offersPayload).slice(0, 30),
                  availableCount: Array.isArray(offersPayload.available)
                    ? offersPayload.available.length
                    : 0,
                  inProgressCount: Array.isArray(offersPayload.in_progress)
                    ? offersPayload.in_progress.length
                    : 0,
                  completedCount: Array.isArray(offersPayload.completed)
                    ? offersPayload.completed.length
                    : 0,
                });

                // Check if the specific game appears in user's data (offers, completed, in_progress)
                const userOffers = [
                  ...(offersPayload.available || []),
                  ...(offersPayload.in_progress || []),
                  ...(offersPayload.completed || []),
                ];

                const matchesBesitosOffer = (offer) => {
                  const idStr = offer?.id?.toString?.() || offer?.id;
                  const offerIdStr = offer?.offer_id?.toString?.() || offer?.offer_id;
                  const bundleIdStr = offer?.bundle_id?.toString?.() || offer?.bundle_id;
                  return (
                    idStr?.toString?.() === gameIdString ||
                    offerIdStr?.toString?.() === gameIdString ||
                    bundleIdStr?.toString?.() === gameIdString
                  );
                };

                const besitosMatchIndex = userOffers.findIndex(matchesBesitosOffer);
                gameData = besitosMatchIndex >= 0 ? userOffers[besitosMatchIndex] : null;
                
                const besitosMatchOn = gameData
                  ? (gameData?.id?.toString?.() === gameIdString
                      ? "id"
                      : gameData?.offer_id?.toString?.() === gameIdString
                      ? "offer_id"
                      : gameData?.bundle_id?.toString?.() === gameIdString
                      ? "bundle_id"
                      : "unknown")
                  : null;
                
                console.log("🔍 [DC /complete] Besitos match result:", {
                  gameIdString,
                  matched: !!gameData,
                  matchedIndex: besitosMatchIndex >= 0 ? besitosMatchIndex : null,
                  matchedId: gameData?.id?.toString?.() || null,
                  matchedOfferId: gameData?.offer_id?.toString?.() || null,
                  bundleId: gameData?.bundle_id || null,
                  title: gameData?.title || gameData?.name || null,
                  matchOn: besitosMatchOn,
                });

                if (DEBUG_GAME_MATCH) {
                  const sampleLimit = 25;
                  const offersSample = userOffers.slice(0, sampleLimit).map((o) => ({
                    id: o?.id?.toString?.() || o?.id || null,
                    offer_id: o?.offer_id?.toString?.() || o?.offer_id || null,
                    bundle_id: o?.bundle_id?.toString?.() || o?.bundle_id || null,
                    title: o?.title || o?.name || null,
                  }));

                  const matchCounts = userOffers.reduce(
                    (acc, o) => {
                      const idStr = o?.id?.toString?.() || o?.id;
                      const offerIdStr = o?.offer_id?.toString?.() || o?.offer_id;
                      const bundleIdStr = o?.bundle_id?.toString?.() || o?.bundle_id;
                      if (idStr?.toString?.() === gameIdString) acc.id++;
                      if (offerIdStr?.toString?.() === gameIdString) acc.offer_id++;
                      if (bundleIdStr?.toString?.() === gameIdString) acc.bundle_id++;
                      return acc;
                    },
                    { id: 0, offer_id: 0, bundle_id: 0 }
                  );

                  console.log("🧩 [DC /complete] Besitos matching summary:", {
                    offersCount: userOffers.length,
                    gameIdString,
                    matchCounts,
                    sampleLimit,
                    offersSample,
                  });
                }

                // Game is considered downloaded if it exists in user's data
                // OR if we already have saved verification
                gameDownloaded = progressDownloadVerified || !!gameData;
                
                if (progressDownloadVerified && !gameData) {
                  console.log("✅ [DC /complete] Using saved download verification flag, but fetching data for goal validation.");
                }
              }
            } catch (error) {
              console.error("Error verifying Bestios game download:", error);
              validationError = "Failed to verify game download from Bestios";
            }
          } else {
            // Fallback: Check user's local game database
            const userWithGames = await User.findById(userId).select("games");
            gameDownloaded = userWithGames?.games?.some((g) => {
              const userGameId = g.gameId?.toString ? g.gameId.toString() : g.gameId;
              return userGameId === gameIdString;
            });
          }

          console.log("🎮 [DC /complete] Game download check result:", {
            provider: providerLower,
            gameIdString,
            gameDownloaded,
            validationError: validationError || null,
          });

          if (!gameDownloaded) {
            validationError = "Please download the game first to complete this challenge";
          } else {
            // NEW VALIDATION: Check first goal/event completion and date matching
            let firstGoalCompleted = false;
            let completionDateMatch = false;
            let validationDetails = {};

            if (providerLower === "besitos") {
              if (!gameData) {
                validationError = "Game data not found in Besitos response. Please ensure the game is installed.";
                console.log("❌ [DC /complete] Besitos validation failed: gameData is null");
              } else {
              // For Besitos: Check first goal (install goal) is completed
              const goals = gameData.goals || [];
              const firstGoal = goals.find(g => g.position === 1 || g.goal_id?.endsWith("_0"));
              
              console.log("🔍 [DC /complete] Besitos first goal validation:", {
                gameIdPresent: !!gameData,
                gameId: gameData?.id || null,
                totalGoals: goals.length,
                firstGoalFound: !!firstGoal,
                firstGoalId: firstGoal?.goal_id || null,
                firstGoalText: firstGoal?.text || null,
                firstGoalCompleted: firstGoal?.completed === true,
                firstGoalCompletedDatetime: firstGoal?.completed_datetime || null,
              });

              if (firstGoal) {
                firstGoalCompleted = firstGoal.completed === true;
                
                if (firstGoalCompleted && firstGoal.completed_datetime) {
                  // Extract date only (ignore time) from completed_datetime
                  // Format: "2026-01-31 02:09:35" -> "2026-01-31"
                  const completedDateStr = firstGoal.completed_datetime.split(" ")[0];
                  const challengeDateStr = normalizedStart.toISOString().split("T")[0];
                  
                  completionDateMatch = completedDateStr === challengeDateStr;
                  
                  console.log("🔍 [DC /complete] Besitos date validation:", {
                    completedDatetime: firstGoal.completed_datetime,
                    completedDateOnly: completedDateStr,
                    challengeDateOnly: challengeDateStr,
                    dateMatch: completionDateMatch,
                  });
                }
              }

              validationDetails = {
                gameIdPresent: !!gameData,
                firstGoalCompleted,
                completionDateMatch,
                firstGoalCompletedDatetime: firstGoal?.completed_datetime || null,
              };
              }
            } else if (providerLower === "bitlabs") {
              if (!gameHistory) {
                validationError = "Game history not found in Bitlabs response. Please ensure the game is installed.";
                console.log("❌ [DC /complete] Bitlabs validation failed: gameHistory is null");
              } else {
              // For Bitlabs: Check first event (install event) is completed
              const events = gameHistory.events || [];
              const firstEvent = events.find(e => e.type_id === 1 || e.name?.toLowerCase().includes("install"));
              
              console.log("🔍 [DC /complete] Bitlabs first event validation:", {
                gameIdPresent: !!gameHistory,
                gameId: gameHistory?.id || null,
                totalEvents: events.length,
                firstEventFound: !!firstEvent,
                firstEventName: firstEvent?.name || null,
                firstEventStatus: firstEvent?.status || null,
                firstEventCompleted: firstEvent?.status === "completed",
                firstEventTimestamp: firstEvent?.timestamp || null,
              });

              if (firstEvent) {
                firstGoalCompleted = firstEvent.status === "completed";
                
                if (firstGoalCompleted && firstEvent.timestamp) {
                  // Extract date only (ignore time) from timestamp
                  const completedDate = new Date(firstEvent.timestamp);
                  const completedDateStr = completedDate.toISOString().split("T")[0];
                  const challengeDateStr = normalizedStart.toISOString().split("T")[0];
                  
                  completionDateMatch = completedDateStr === challengeDateStr;
                  
                  console.log("🔍 [DC /complete] Bitlabs date validation:", {
                    eventTimestamp: firstEvent.timestamp,
                    completedDateOnly: completedDateStr,
                    challengeDateOnly: challengeDateStr,
                    dateMatch: completionDateMatch,
                  });
                }
              }

              validationDetails = {
                gameIdPresent: !!gameHistory,
                firstGoalCompleted,
                completionDateMatch,
                firstEventTimestamp: firstEvent?.timestamp || null,
              };
              }
            } else {
              // For non-SDK games or other providers, just check download
              validationDetails = {
                gameIdPresent: gameDownloaded,
                firstGoalCompleted: true, // Skip goal validation for non-SDK games
                completionDateMatch: true, // Skip date validation for non-SDK games
              };
            }

            console.log("🎮 [DC /complete] Game completion validation result:", {
              provider: providerLower,
              gameIdString,
              gameDownloaded,
              ...validationDetails,
              validationPassed: gameDownloaded && firstGoalCompleted && completionDateMatch,
            });

            // Validate: Game must be downloaded AND (for SDK providers) first goal/event completed AND date matches
            const isSdkProvider = providerLower === "bitlabs" || providerLower === "besitos";
            const needsGoalValidation = isSdkProvider && gameDownloaded;
            
            if (needsGoalValidation && !firstGoalCompleted) {
              validationError = "Please complete the first goal/event (install) to complete this challenge";
            } else if (needsGoalValidation && !completionDateMatch) {
              validationError = "The game installation must be completed today to complete this challenge";
            } else {
              // All validations passed
              actionValidated = true;
              
              // Persist download verification
              if (providerLower === "bitlabs" || providerLower === "besitos") {
                if (!progress.progress) progress.progress = {};
                if (!progress.progress.metadata) progress.progress.metadata = {};
                if (progress.progress.metadata.gameDownloadVerified !== true) {
                  progress.progress.metadata.gameDownloadVerified = true;
                }
                if (!progress.progress.metadata.downloadVerifiedAt) {
                  progress.progress.metadata.downloadVerifiedAt = new Date().toISOString();
                }
                progress.progress.metadata.verificationProvider = providerLower;
                await progress.save();
                console.log("✅ [DC /complete] Saved download verification to progress metadata.");
              }

              // Update progress to 100%
              await progress.updateProgress({
                percentage: 100,
                metadata: {
                  ...progress.progress?.metadata,
                  gameDownloadVerified: true,
                  downloadVerifiedAt: new Date().toISOString(),
                }
              });
            }

            /* COMMENTED OUT: Playtime validation - no longer required
            // Additional verification: Check if game was played today
            const userWithGames = await User.findById(userId).select("games");
            const gamePlayed = userWithGames?.games?.find((g) => {
              const userGameId = g.gameId?.toString ? g.gameId.toString() : g.gameId;
              return userGameId === gameIdString;
            });

            let isPlayedToday = false;
            let actualPlayTime = 0;

            if (gamePlayed) {
              // Check if game was played today
              const lastPlayedDate = new Date(gamePlayed.lastPlayed);
              const todayStart = new Date(normalizedStart);
              isPlayedToday = lastPlayedDate >= todayStart;

              // Calculate actual play time
              const playTimeMinutes = progress.progress?.metadata?.playTimeMinutes || 0;
              const gameTotalDurationMinutes = gamePlayed.totalDuration
                ? Math.floor((gamePlayed.totalDuration || 0) / 60)
                : 0;

              // Calculate today's play time
              let todayPlayTimeMinutes = 0;
              if (gamePlayed.firstPlayed && gamePlayed.lastPlayed) {
                const firstPlayed = new Date(gamePlayed.firstPlayed);
                const lastPlayed = new Date(gamePlayed.lastPlayed);
                const todayStart = new Date(normalizedStart);

                if (firstPlayed >= todayStart && lastPlayed >= todayStart) {
                  const timeDiffMinutes = (lastPlayed - firstPlayed) / (1000 * 60);
                  todayPlayTimeMinutes = Math.min(timeDiffMinutes, 480);
                }
              }

              actualPlayTime = Math.max(playTimeMinutes, gameTotalDurationMinutes, todayPlayTimeMinutes);
            }

            if (challenge.requirements?.timeLimit) {
              // Time requirement: Must play for required time
              const requiredMinutes = challenge.requirements.timeLimit;

              if (!isPlayedToday && actualPlayTime === 0) {
                validationError = `Please play the game today for at least ${requiredMinutes} minutes to complete this challenge`;
              } else if (actualPlayTime < requiredMinutes) {
                validationError = `Please play the game for at least ${requiredMinutes} minutes to complete this challenge. Current play time: ${Math.floor(actualPlayTime)} minutes`;
              } else {
                actionValidated = true;
                // Start timer after successful verification
                await progress.updateProgress({
                  percentage: 100,
                  metadata: {
                    ...progress.progress?.metadata,
                    gameDownloadVerified: true,
                    downloadVerifiedAt: new Date().toISOString(),
                    playTimeMinutes: actualPlayTime,
                  }
                });
              }
            } else {
              // No time requirement - just need download verification
              actionValidated = true;
              // Start timer after successful verification
              await progress.updateProgress({
                percentage: 100,
                metadata: {
                  ...progress.progress?.metadata,
                  gameDownloadVerified: true,
                  downloadVerifiedAt: new Date().toISOString(),
                }
              });
            }
            */
          }
        }

        /*
        // ORIGINAL STRICT VALIDATION (commented out):
        // Verify game was played for required time
        const gameId =
          challenge.assignedGame?.gameId ||
          challenge.gameId ||
          progress.selectedGame?.gameId;

        if (!gameId) {
          validationError = "Game not selected or assigned for this challenge";
        } else {
          // Get game ID string for comparison
          const gameIdString = gameId.toString ? gameId.toString() : gameId;

          // Check if game was actually played today by checking user's game history
          const userWithGames = await User.findById(userId).select("games");
          const gamePlayed = userWithGames?.games?.find((g) => {
            const userGameId = g.gameId?.toString
              ? g.gameId.toString()
              : g.gameId;
            return userGameId === gameIdString;
          });

          // STRICT VALIDATION: Game must be played, not just downloaded
          if (!gamePlayed || !gamePlayed.lastPlayed) {
            validationError =
              "Please play the game first to complete this challenge";
          } else {
            // Check if game was played today
            const lastPlayedDate = new Date(gamePlayed.lastPlayed);
            const todayStart = new Date(normalizedStart);
            const isPlayedToday = lastPlayedDate >= todayStart;

            if (!isPlayedToday) {
              validationError =
                "Please play the game today to complete this challenge";
            } else if (challenge.requirements?.timeLimit) {
              // TIME REQUIREMENT: Must play for the required time
              // Check if minimum play time was met - REQUIRED for completion
              const requiredMinutes = challenge.requirements.timeLimit;

              // Get play time from progress metadata (updated by app when user plays)
              const playTimeMinutes =
                progress.progress?.metadata?.playTimeMinutes || 0;

              // Also check game's totalDuration if available (in seconds, convert to minutes)
              // Note: totalDuration might be cumulative across all sessions, so we need to check today's play time
              const gameTotalDurationMinutes = gamePlayed.totalDuration
                ? Math.floor((gamePlayed.totalDuration || 0) / 60)
                : 0;

              // Calculate play time today from firstPlayed and lastPlayed if both exist and are today
              let todayPlayTimeMinutes = 0;
              if (gamePlayed.firstPlayed && gamePlayed.lastPlayed) {
                const firstPlayed = new Date(gamePlayed.firstPlayed);
                const lastPlayed = new Date(gamePlayed.lastPlayed);
                const todayStart = new Date(normalizedStart);

                // Only calculate if both timestamps are today
                if (firstPlayed >= todayStart && lastPlayed >= todayStart) {
                  const timeDiffMinutes =
                    (lastPlayed - firstPlayed) / (1000 * 60);
                  // Cap at reasonable maximum (e.g., 8 hours = 480 minutes) to prevent abuse
                  todayPlayTimeMinutes = Math.min(timeDiffMinutes, 480);
                }
              }

              // Use the maximum of all sources, but STRICTLY require play time tracking
              const actualPlayTime = Math.max(
                playTimeMinutes,
                gameTotalDurationMinutes,
                todayPlayTimeMinutes
              );

              // STRICT VALIDATION: Require actual play time tracking
              // Reject if no play time is tracked at all
              if (
                playTimeMinutes === 0 &&
                gameTotalDurationMinutes === 0 &&
                todayPlayTimeMinutes === 0
              ) {
                validationError = `Please play the game for at least ${requiredMinutes} minutes. Play time must be tracked to complete this challenge. Use the update-progress endpoint to report your play time.`;
              } else if (actualPlayTime < requiredMinutes) {
                validationError = `Please play the game for at least ${requiredMinutes} minutes to complete this challenge. Current play time: ${Math.floor(
                  actualPlayTime
                )} minutes`;
              } else {
                actionValidated = true;
              }
            } else {
              // No time requirement - but still require game to be actually played
              // Check if game has been played (not just downloaded) by verifying playCount or progress
              const hasActualPlay =
                gamePlayed.playCount > 0 ||
                (gamePlayed.progress !== undefined &&
                  gamePlayed.progress > 0) ||
                (gamePlayed.level !== undefined && gamePlayed.level > 1) ||
                (gamePlayed.firstPlayed &&
                  gamePlayed.lastPlayed &&
                  new Date(gamePlayed.lastPlayed).getTime() >
                    new Date(gamePlayed.firstPlayed).getTime() + 60000); // At least 1 minute difference

              if (!hasActualPlay) {
                validationError =
                  "Please actually play the game (not just download) to complete this challenge";
              } else {
                actionValidated = true;
              }
            }
          }
        }
        */
        break;

      case "survey":
        // Verify SDK task was completed (for survey challenges)
        if (challenge.sdkTask?.provider !== "none") {
          if (!progress.sdkTaskProgress?.taskCompleted) {
            validationError =
              "Please complete the survey first to complete this challenge";
          } else {
            actionValidated = true;
          }
        } else {
          // For non-SDK surveys, check if survey was completed
          // This would need to be tracked separately - for now, allow if started
          if (!progress.startedAt) {
            validationError = "Please start the survey first";
          } else {
            actionValidated = true;
          }
        }
        break;

      case "watch_ad":
        // Verify ad was watched (tracked via progress metadata or separate ad log)
        const progressAdWatched = progress.progress?.metadata?.adWatched || false;
        if (!progressAdWatched) {
          validationError =
            "Please watch the ad first to complete this challenge";
        } else {
          actionValidated = true;
        }
        break;

      case "referral":
        // Verify referral was made (check referral records)
        // This would need referral tracking - for now, require at least started
        if (!progress.startedAt) {
          validationError = "Please start the referral process first";
        } else {
          // In a real implementation, check if referral was actually completed
          actionValidated = true; // Placeholder - needs proper referral validation
        }
        break;

      case "social_share":
      case "app_install":
      case "quiz":
      case "custom":
        // For other types, at minimum require challenge to be started
        if (!progress.startedAt) {
          validationError = "Please start the challenge first";
        } else {
          // Check progress percentage - should be at least some progress
          const progressPercentage = progress.progress?.percentage || 0;
          if (progressPercentage < 50) {
            validationError =
              "Please complete the required actions to finish this challenge";
          } else {
            actionValidated = true;
          }
        }
        break;

      default:
        validationError = `Challenge type "${challenge.type}" is not supported`;
    }

    // Reject completion if action was not validated
    if (!actionValidated) {
      // Build helpful response based on challenge type
      const errorResponse = {
        success: false,
        error:
          validationError ||
          "Please complete the required action before marking challenge as complete",
        requiresAction: true,
        challengeType: challenge.type,
      };

      // Add specific guidance for spin challenges
      if (challenge.type === "spin") {
        errorResponse.requiredAction = {
          endpoint: "POST /api/daily-challenge/spin",
          description: "Spin the wheel before completing this challenge",
          message:
            "You must spin the wheel first. Call POST /api/daily-challenge/spin, then retry this endpoint.",
        };
      }

      // Add specific guidance for game challenges
      if (challenge.type === "game") {
        errorResponse.requiredAction = {
          endpoint: "Play the selected game",
          description: "Play the game for the required time before completing",
          message:
            "You must play the selected game first. The game must be played for the required duration.",
        };
      }

      return res.status(400).json(errorResponse);
    }

    // Calculate rewards (with potential VIP bonuses)
    let coinReward = challenge.coinReward;
    let xpReward = challenge.xpReward;
    let bonusCoins = 0;
    let bonusXP = 0;

    // Apply VIP multipliers
    if (user.vip?.isActive) {
      const vipLevel = user.vip.level;
      if (vipLevel === "gold") {
        bonusXP = Math.floor(xpReward * 0.5); // 50% bonus
      } else if (vipLevel === "platinum") {
        bonusXP = Math.floor(xpReward); // 100% bonus
        bonusCoins = Math.floor(coinReward * 0.25); // 25% bonus
      }
    }

    const totalCoins = coinReward + bonusCoins;
    const baseXP = xpReward + bonusXP;

    // Check claim type to determine if rewards should be credited immediately or pending
    const claimType = challenge.claimType || "auto";
    // HARDCODE: Treat watch_ad like auto-claim (always credit immediately, no pending state).
    // This matches the requested behavior: rewards are never pending for ad-based daily rewards.
    const adWasWatched =
      claimType === "watch_ad"
        ? true
        : adWatchedFlag === true || progress.progress?.metadata?.adWatched === true;
    const shouldCreditImmediately = claimType !== "manual"; // only manual remains non-immediate

    // Use same logic as daily rewards - get multiplier from XPTier.accessBenefits
    const currentXp = user.xp?.current || 0;
    const tierMultiplier = await getAccessBenefitsMultiplier(currentXp);
    const finalXP = Math.round(baseXP * tierMultiplier);

    // Get tier name for display
    const tier = await XPTier.findByXpValue(currentXp);
    const userTier = tier ? tier.tierName : null;

    console.log("✅ [POST /complete] Tier multiplier applied:", {
      userId,
      challengeId: challenge._id,
      baseXP,
      finalXP,
      tierMultiplier,
      userTier,
      currentXp,
    });

    // Update user wallet and XP only if claim type allows immediate credit
    if (shouldCreditImmediately) {
      user.wallet.balance = (user.wallet.balance || 0) + totalCoins;
      user.xp.current = (user.xp.current || 0) + finalXP;
      user.xp.total = (user.xp.total || 0) + finalXP;
    }
    // If not crediting immediately, rewards remain pending until claimed via separate endpoint

    // Update streak
    const streak = user.streak || {};
    if (!streak.completedTasks) streak.completedTasks = [];

    let newStreak = streak.current || 0;
    let milestoneRewardEarned = null;
    let bonusDayRewardEarned = null;

    // ADM-DR-027 FIX: Check for gaps in streak before incrementing
    // If user missed a day (gap in completedTasks), reset streak based on resetRule
    if (!streak.completedTasks.includes(todayStr)) {
      // Check if there's a gap (yesterday not completed)
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // ADM-DR-027 FIX: If yesterday is not completed, check resetRule
      if (!streak.completedTasks.includes(yesterdayStr) && streak.current > 0) {
        // Gap detected - check if reset is enabled
        // Get bonus day resetRule to determine if streak should reset
        const bonusDayForReset = await BonusDay.findOne({
          isActive: true,
          "conditions.minStreak": { $lte: streak.current },
        }).sort({ dayNumber: -1 }); // Get highest bonus day that applies
        
        if (bonusDayForReset && bonusDayForReset.resetRule) {
          const resetRule = bonusDayForReset.resetRule;
          
          // ADM-DR-027 FIX: Apply reset rule
          if (resetRule.onMiss !== false) { // Default: true (reset on miss)
            if (resetRule.gracePeriod > 0) {
              // Grace period - check if we're still within grace period
              const missedDays = streak.missedDays || 0;
              if (missedDays < resetRule.gracePeriod) {
                // Still in grace period - don't reset, just track missed day
                streak.missedDays = missedDays + 1;
                streak.current = streak.current; // Keep current streak
              } else {
                // Grace period exhausted - reset streak
                streak.current = 0;
                streak.completedTasks = []; // Clear completed tasks
                streak.missedDays = 0;
                streak.resetAt = now;
                streak.resetReason = 'missed_day_grace_period_exhausted';
              }
            } else {
              // No grace period - reset immediately
              streak.current = 0;
              streak.completedTasks = []; // ADM-DR-027 FIX: Clear completed tasks on reset
              streak.missedDays = 0;
              streak.resetAt = now;
              streak.resetReason = 'missed_day_immediate_reset';
            }
          }
          // If onMiss is false, don't reset - continue from current streak
        } else {
          // No bonus day config found - apply default reset behavior
          streak.current = 0;
          streak.completedTasks = []; // ADM-DR-027 FIX: Clear completed tasks on reset
          streak.resetAt = now;
          streak.resetReason = 'missed_day_default_reset';
        }
      }
      
      // Add today to completed tasks and increment streak
      streak.completedTasks.push(todayStr);
      newStreak = (streak.current || 0) + 1;
      streak.current = newStreak;
      streak.lastUpdated = new Date();
      streak.lastTaskType = "challenge";
      streak.missedDays = 0; // Reset missed days counter when completing a task
      user.streak = streak;

      // Check for milestone rewards
      try {
        const STREAK_CONFIG = await getStreakConfig();
        const milestoneReward = getMilestoneReward(newStreak, STREAK_CONFIG);

        if (
          milestoneReward &&
          milestoneReward.rewards &&
          milestoneReward.rewards.length > 0
        ) {
          const rewardsEarned = [];

          // Award all rewards for this milestone
          for (const reward of milestoneReward.rewards) {
            if (reward.type === "coins") {
              user.wallet.balance = (user.wallet.balance || 0) + reward.value;
            } else if (reward.type === "xp") {
              // Use same logic as daily rewards for milestone XP
              const milestoneTierMultiplier = await getAccessBenefitsMultiplier(
                user.xp?.current || 0
              );
              const milestoneXP = Math.round(
                reward.value * milestoneTierMultiplier
              );
              user.xp.current = (user.xp.current || 0) + milestoneXP;
              user.xp.total = (user.xp.total || 0) + milestoneXP;
            }

            // Create transaction record for each reward
            const milestoneTransaction = new Transaction({
              user: userId,
              type: "credit",
              balanceType: reward.type === "coins" ? "coins" : "xp",
              amount: reward.value,
              description: `Streak Milestone Reward - Day ${newStreak} - ${
                reward.type === "coins" ? "Coins" : "XP"
              }`,
              status:
                milestoneReward.claimMode === "auto" ? "completed" : "pending",
              referenceId: `STREAK-${newStreak}-${reward.type}-${Date.now()}`,
              metadata: {
                milestoneDay: newStreak,
                rewardType: reward.type,
                rewardValue: reward.value,
                claimMode: milestoneReward.claimMode,
                source: "daily_challenge",
              },
            });

            await milestoneTransaction.save();
            rewardsEarned.push({ type: reward.type, value: reward.value });
          }

          milestoneRewardEarned = {
            day: newStreak,
            rewards: rewardsEarned,
            claimMode: milestoneReward.claimMode,
            requiresAd: milestoneReward.claimMode === "watch_ad",
          };
        }
      } catch (error) {
        console.error("Error awarding milestone reward:", error);
        // Continue even if milestone reward fails
      }

      // Check for Bonus Day rewards (separate from streak milestones)
      try {
        // CRITICAL FIX: Get completed tasks to verify all required days are completed
        const completedTasks = user.streak?.completedTasks || [];
        
        // Get user profile for eligibility check
        const userProfile = {
          currentStreak: newStreak,
          country: user.country || null,
          userSegment: user.userSegment || "all",
          completedTasks: completedTasks, // CRITICAL: Pass completed tasks for verification
        };

        // ADM-DR-028 FIX: Find bonus day for this streak milestone
        // CRITICAL: Use findOne with sort to get the most recent active bonus day for this dayNumber
        // This prevents showing both old and new bonus days when admin edits (e.g., Day-2 to Day-3)
        // findOne with isActive: true ensures deleted bonus days don't appear
        const bonusDay = await BonusDay.findOne({
          dayNumber: newStreak,
          isActive: true,
          "conditions.minStreak": { $lte: newStreak },
        }).sort({ updatedAt: -1 }); // ADM-DR-028 FIX: Get most recently updated bonus day to avoid duplicates

        // CRITICAL FIX: Only award bonus if all required days are completed
        // isEligibleForUser now checks requiresCompletion and verifies all days are completed
        if (bonusDay) {
          const isEligible = bonusDay.isEligibleForUser(userProfile);
          console.log(`[BONUS-REWARD] Checking Bonus Day ${bonusDay.dayNumber} (minStreak: ${bonusDay.conditions.minStreak}):`, {
            currentStreak: newStreak,
            requiresCompletion: bonusDay.conditions.requiresCompletion !== false,
            completedTasksCount: completedTasks.length,
            isEligible: isEligible,
            completedTasks: completedTasks.slice(0, 5) // First 5 for debugging
          });
          
          if (isEligible) {
            // Check if bonus day reward was already claimed (track in user's metadata or transactions)
            const existingBonusDayTransaction = await Transaction.findOne({
              user: userId,
              "metadata.bonusDayNumber": newStreak,
              "metadata.source": "bonus_day",
            });

            if (!existingBonusDayTransaction) {
              // Award primary reward
              const primaryReward = bonusDay.primaryReward;
              if (primaryReward && primaryReward.type && primaryReward.value) {
                const bonusRewardsEarned = [];

                if (primaryReward.type === "coins") {
                  user.wallet.balance =
                    (user.wallet.balance || 0) + primaryReward.value;
                  bonusRewardsEarned.push({
                    type: "coins",
                    value: primaryReward.value,
                  });
                } else if (primaryReward.type === "xp") {
                  const { finalXP: bonusXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
                    user,
                    primaryReward.value
                  );
                  user.xp.current = (user.xp.current || 0) + bonusXP;
                  user.xp.total = (user.xp.total || 0) + bonusXP;
                  bonusRewardsEarned.push({
                    type: "xp",
                    value: primaryReward.value,
                    finalValue: bonusXP, // ADM-DR-027 FIX: Include final XP after tier multiplier
                    tierMultiplier: tierMultiplier,
                  });
                }

                // ADM-DR-027 FIX: Create transaction record with correct amount (final XP for XP rewards, base value for coins)
                const transactionAmount = primaryReward.type === "xp" 
                  ? bonusXP  // Use final XP after tier multiplier
                  : primaryReward.value; // Use base value for coins
                
                const bonusDayTransaction = new Transaction({
                  user: userId,
                  type: "credit",
                  balanceType: primaryReward.type === "coins" ? "coins" : "xp",
                  amount: transactionAmount, // ADM-DR-027 FIX: Use final amount (after tier multiplier for XP)
                  description: `Bonus Day Reward - Day ${newStreak} - ${bonusDay.title}`,
                  status: "completed",
                  referenceId: `BONUS-DAY-${newStreak}-${Date.now()}`,
                  metadata: {
                    bonusDayNumber: newStreak,
                    bonusDayId: bonusDay._id,
                    bonusDayTitle: bonusDay.title,
                    rewardType: primaryReward.type,
                    rewardValue: primaryReward.value, // Base value
                    finalRewardValue: transactionAmount, // ADM-DR-027 FIX: Final value (after tier multiplier)
                    tierMultiplier: primaryReward.type === "xp" ? tierMultiplier : 1.0, // ADM-DR-027 FIX: Include tier multiplier
                    source: "bonus_day",
                  },
                });

                await bonusDayTransaction.save();

                // Update bonus day analytics
                await bonusDay.updateAnalytics("claimed", 1);

                bonusDayRewardEarned = {
                  day: newStreak,
                  title: bonusDay.title,
                  rewards: bonusRewardsEarned,
                  bonusDayId: bonusDay._id,
                };
                
                console.log(`[BONUS-REWARD] ✅ Bonus Day ${newStreak} reward granted:`, bonusDayRewardEarned);
              } else {
                console.log(`[BONUS-REWARD] ⚠️ Bonus Day ${newStreak} has no valid primary reward`);
              }
            } else {
              console.log(`[BONUS-REWARD] ⚠️ Bonus Day ${newStreak} reward already claimed (transaction exists)`);
            }
          } else {
            console.log(`[BONUS-REWARD] ❌ Bonus Day ${newStreak} NOT eligible - requirements not met`);
          }
        } else {
          console.log(`[BONUS-REWARD] ℹ️ No Bonus Day found for streak ${newStreak}`);
        }
      } catch (error) {
        console.error("Error awarding bonus day reward:", error);
        // Continue even if bonus day reward fails
      }
    }

    await user.save();

    // Mark progress as completed (store base XP before tier multiplier)
    await progress.markCompleted({
      coins: coinReward,
      xp: xpReward,
      bonusCoins,
      bonusXP,
    });
    
    // CRITICAL: Increment continuous challenges completed counter (not daily-based)
    // Counter resets only after milestone completion
    const accountOverviewService = require('../utils/accountOverview');
    await accountOverviewService.incrementChallengesCompletedCounter(userId);
    
    // Only mark rewards as claimed if we actually credited them now.
    // For watch_ad claimType, rewards may remain pending until /claim-reward is called.
    if (shouldCreditImmediately) {
      await progress.claimRewards();
    }

    // Update challenge analytics (log final XP after tier multiplier)
    await challenge.updateAnalytics("complete", {
      coins: totalCoins,
      xp: finalXP,
    });

    // Create transaction record
    let linkedGameObjectId =
      challenge.assignedGame?.gameId &&
      typeof challenge.assignedGame.gameId === "object"
        ? challenge.assignedGame.gameId._id || challenge.assignedGame.gameId
        : challenge.assignedGame?.gameId || null;

    let linkedGameCode =
      challenge.gameId ||
      challenge.gameDetails?.id ||
      (typeof progress.selectedGame?.gameId === "string"
        ? progress.selectedGame.gameId
        : null);

    if (!linkedGameCode && linkedGameObjectId) {
      const linkedGameDoc = await Game.findById(linkedGameObjectId).select(
        "gameId"
      );
      if (linkedGameDoc?.gameId) {
        linkedGameCode = linkedGameDoc.gameId;
      }
    }

    const transactionMetadata = {
      challengeId: challenge._id,
      challengeType: challenge.type,
      claimType: claimType,
      baseXp: baseXP,
      xpEarned: finalXP,
      bonusCoins,
      bonusXP,
      tierMultiplier,
      requiresAd: false,
      adWatched: adWasWatched || false,
      source: "daily_challenge", // Required for claim-reward endpoint
    };

    if (linkedGameCode) {
      transactionMetadata.gameId = linkedGameCode;
    }
    if (linkedGameObjectId) {
      transactionMetadata.gameRef = linkedGameObjectId;
    }

    // Transaction log always created with status "completed" (pending commented out)
    // const transactionStatus = shouldCreditImmediately ? "completed" : "pending";
    const transactionStatus = "completed";
    const baseReferenceId = `DAILY-CHALLENGE-${challenge._id}-${Date.now()}`;

    // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
    const hasCoins = totalCoins > 0;
    const hasXP = shouldCreditImmediately && finalXP > 0;
    let primaryAmount = 0;
    let primaryBalanceType = "coins";

    if (hasCoins && hasXP) {
      // Both rewards - use coins as primary
      primaryAmount = totalCoins;
      primaryBalanceType = "coins";
    } else if (hasCoins) {
      // Only coins
      primaryAmount = totalCoins;
      primaryBalanceType = "coins";
    } else if (hasXP) {
      // Only XP
      primaryAmount = finalXP;
      primaryBalanceType = "xp";
    }

    // Add coins and XP to metadata for single transaction log
    transactionMetadata.coins = totalCoins;
    transactionMetadata.xp = shouldCreditImmediately ? finalXP : 0;
    transactionMetadata.finalXp = shouldCreditImmediately ? finalXP : 0;

    // Create single transaction with both coins and XP in metadata
    const transaction = new Transaction({
      user: userId,
      type: "credit",
      balanceType: primaryBalanceType,
      amount: primaryAmount,
      description: `Daily Challenge: ${challenge.title}`,
      status: transactionStatus,
      referenceId: baseReferenceId,
      game: linkedGameObjectId,
      gameId: linkedGameCode,
      metadata: transactionMetadata,
    });

    await transaction.save();

    // Get configured streak milestones for display
    let configuredMilestones = [7, 14, 21, 30]; // Default fallback
    try {
      const STREAK_CONFIG = await getStreakConfig();
      configuredMilestones = STREAK_CONFIG.milestones || configuredMilestones;
    } catch (error) {
      console.error("Error getting streak config for display:", error);
    }

    const milestoneReached = configuredMilestones.find((m) => m === newStreak);

    // userTier is already calculated above using XPTier (same as daily rewards)

    // Timer should be stopped after completion
    const challengeEndTime = challenge.scheduling.endTime || normalizedEnd;
    const completedAt = progress.completedAt || now;

    res.json({
      success: true,
      message: "Challenge completed successfully!",
      data: {
        challenge: {
          id: challenge._id,
          status: "completed",
          completedAt: completedAt.toISOString(),
        },
        rewards: {
          coins: coinReward,
          baseXP: baseXP, // Base XP before multiplier
          xp: shouldCreditImmediately ? finalXP : 0, // Only show XP if credited
          bonusCoins,
          bonusXP,
          totalCoins: shouldCreditImmediately ? totalCoins : 0, // Only show coins if credited
          totalXP: shouldCreditImmediately ? finalXP : 0, // Only show XP if credited
          tierMultiplier: tierMultiplier, // Show the multiplier that was applied
          tier: userTier,
          claimType: claimType,
          status: transactionStatus, // Show if reward is completed or pending
          requiresAd: false,
          adWatched: adWasWatched || false,
        },
        newBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current,
        },
        streak: {
          current: newStreak,
          milestoneReached: milestoneReached || null,
          nextMilestone:
            configuredMilestones.find((m) => m > newStreak) || null,
          milestoneReward: milestoneRewardEarned,
          bonusDayReward: bonusDayRewardEarned || null,
        },
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
        },
        countdown: {
          timeRemaining: 0, // Timer stopped
          hours: 0,
          minutes: 0,
          seconds: 0,
          formatted: "00:00:00",
          endsAt: challengeEndTime.toISOString(),
          isCompleted: true,
          isActive: false,
        },
      },
    });
  } catch (error) {
    console.error("Error completing challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete challenge",
    });
  }
});

// ==================== CLAIM PENDING REWARD ====================

/**
 * @route   POST /api/daily-challenge/claim-reward
 * @desc    Claim pending reward after watching ad (for watch_ad claim type)
 * @body    {string} transactionId - Transaction ID of pending reward
 * @access  Private
 */
router.post("/claim-reward", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: "Transaction ID is required",
      });
    }

    // Find the pending transaction
    const transaction = await Transaction.findOne({
      _id: transactionId,
      user: userId,
      status: "pending",
      $or: [
        {
          "metadata.source": "daily_challenge",
          "metadata.claimType": "watch_ad",
        },
        { "metadata.source": "daily_challenge" },
      ],
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Pending reward not found or already claimed",
      });
    }

    // If the underlying challenge requires manual claiming by an admin,
    // reject user-initiated claim attempts.
    try {
      const challengeForTxn = await DailyChallenge.findById(
        transaction.metadata?.challengeId
      ).select("claimType");
      if (challengeForTxn && challengeForTxn.claimType === "manual") {
        return res.status(403).json({
          success: false,
          error:
            "This challenge requires manual claim handling by an administrator. You cannot claim this reward via the API.",
        });
      }
    } catch (err) {
      console.warn("Unable to verify challenge claimType:", err && err.message);
      // If we can't verify, fallthrough to normal checks (safer to allow admin override later)
    }

    // Verify ad was watched (check metadata or request body)
    const { adWatched } = req.body;
    if (!adWatched && !transaction.metadata?.adWatched) {
      return res.status(400).json({
        success: false,
        error: "Ad must be watched before claiming reward",
        requiresAd: true,
      });
    }

    // Get user and challenge
    const user = await User.findById(userId).select("wallet xp");
    const challenge = await DailyChallenge.findById(
      transaction.metadata?.challengeId
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Credit the rewards
    const coins = transaction.amount;
    const xp = transaction.metadata?.xpEarned || 0;

    user.wallet.balance = (user.wallet.balance || 0) + coins;
    user.xp.current = (user.xp.current || 0) + xp;
    user.xp.total = (user.xp.total || 0) + xp;

    // Update transaction status
    transaction.status = "completed";
    transaction.metadata = {
      ...transaction.metadata,
      adWatched: true,
      claimedAt: new Date().toISOString(),
    };

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      success: true,
      message: "Reward claimed successfully",
      data: {
        coins,
        xp,
        newBalance: {
          coins: user.wallet.balance,
          xp: user.xp.current,
        },
        transaction: {
          id: transaction._id,
          status: transaction.status,
        },
      },
    });
  } catch (error) {
    console.error("Error claiming pending reward:", error);
    res.status(500).json({
      success: false,
      error: "Failed to claim reward",
    });
  }
});

// ==================== UPDATE PROGRESS ====================

/**
 * @route   PUT /api/daily-challenge/update-progress
 * @desc    Update daily challenge progress (e.g., game play time)
 * @body    {number} playTimeMinutes - Minutes played (for game challenges)
 * @body    {number} percentage - Progress percentage (0-100)
 * @body    {object} metadata - Additional progress metadata
 * @access  Private
 */
router.put("/update-progress", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { playTimeMinutes, percentage, metadata } = req.body;
    const now = new Date();

    // Normalize today's date to UTC start-of-day
    const today = new Date();
    const normalizedStart = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        0,
        0,
        0,
        0
      )
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999
      )
    );

    // Get today's challenge
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] },
    });

    if (!challenge) {
      return res.status(404).json({
        success: false,
        error: "No challenge available for today",
      });
    }

    // Get user's progress
    let progress = await UserChallengeProgress.getUserChallengeForDate(
      userId,
      normalizedStart
    );

    if (!progress) {
      return res.status(400).json({
        success: false,
        error: "Challenge not started. Please start the challenge first.",
      });
    }

    // Update progress metadata
    if (!progress.progress.metadata) {
      progress.progress.metadata = {};
    }

    // Update play time if provided (for game challenges)
    if (playTimeMinutes !== undefined && playTimeMinutes !== null) {
      const currentPlayTime = progress.progress.metadata.playTimeMinutes || 0;
      // Only update if new value is greater (prevent decreasing)
      progress.progress.metadata.playTimeMinutes = Math.max(
        currentPlayTime,
        Number(playTimeMinutes) || 0
      );
    }

    // Update percentage if provided
    if (percentage !== undefined && percentage !== null) {
      await progress.updateProgress(Number(percentage));
    } else if (playTimeMinutes !== undefined) {
      // Auto-update percentage based on play time if timeLimit exists
      if (challenge.requirements?.timeLimit && challenge.type === "game") {
        const requiredMinutes = challenge.requirements.timeLimit;
        const currentPlayTime = progress.progress.metadata.playTimeMinutes || 0;
        const progressPercentage = Math.min(
          100,
          Math.floor((currentPlayTime / requiredMinutes) * 100)
        );
        await progress.updateProgress(progressPercentage);
      }
    }

    // Merge additional metadata
    if (metadata && typeof metadata === "object") {
      progress.progress.metadata = {
        ...progress.progress.metadata,
        ...metadata,
        lastUpdated: now.toISOString(),
      };
    }

    await progress.save();

    res.json({
      success: true,
      message: "Progress updated successfully",
      data: {
        progress: {
          percentage: progress.progress.percentage,
          playTimeMinutes: progress.progress.metadata?.playTimeMinutes || 0,
          status: progress.status,
        },
      },
    });
  } catch (error) {
    console.error("Error updating progress:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update progress",
    });
  }
});

// ==================== USER HISTORY ====================

/**
 * @route   GET /api/daily-challenge/history
 * @desc    Get user's challenge history
 * @query   {number} limit - Number of records (default: 30)
 * @access  Private
 */
router.get("/history", protect, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 30;

    const history = await UserChallengeProgress.getUserHistory(userId, limit);

    res.json({
      success: true,
      data: {
        history,
        total: history.length,
      },
    });
  } catch (error) {
    console.error("Error getting history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get challenge history",
    });
  }
});

// ==================== USER STATS ====================

/**
 * @route   GET /api/daily-challenge/stats
 * @desc    Get user's challenge statistics
 * @access  Private
 */
router.get("/stats", protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    const stats = await UserChallengeProgress.getUserStats(userId);

    // Transform stats into readable format
    const statsMap = {};
    let totalChallenges = 0;
    let totalCompleted = 0;
    let totalCoins = 0;
    let totalXP = 0;

    stats.forEach((stat) => {
      statsMap[stat._id] = {
        count: stat.count,
        coins: stat.totalCoins + stat.totalBonusCoins,
        xp: stat.totalXP + stat.totalBonusXP,
      };
      totalChallenges += stat.count;
      if (stat._id === "completed") {
        totalCompleted = stat.count;
        totalCoins = stat.totalCoins + stat.totalBonusCoins;
        totalXP = stat.totalXP + stat.totalBonusXP;
      }
    });

    const completionRate =
      totalChallenges > 0
        ? ((totalCompleted / totalChallenges) * 100).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: {
        totalChallenges,
        totalCompleted,
        completionRate: parseFloat(completionRate),
        totalCoinsEarned: totalCoins,
        totalXPEarned: totalXP,
        byStatus: statsMap,
      },
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get challenge statistics",
    });
  }
});

module.exports = router;

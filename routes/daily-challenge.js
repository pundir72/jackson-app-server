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
const { trackActivity } = require("../middleware/activityTracker");
const streakRouter = require("./streak");
const getStreakConfig = streakRouter.getStreakConfig;
const getMilestoneReward = streakRouter.getMilestoneReward;
const XPTier = require("../models/XPTier");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

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
          streakData.current >= day ? day : 0,
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
          error.message,
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    const user = await User.findById(userId).select(
      "xp age dateOfBirth location vip onboarding social",
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
      `DEBUG - Challenges found by date only: ${challengesByDate.length}`,
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
        : "NO CHALLENGE FOUND",
    );

    if (!challenge) {
      // Debug why challenge wasn't found
      console.log("DEBUG - Checking why challenge wasn't found:");

      // Check visibility filter
      const visibleChallenges = challengesByDate.filter(
        (ch) => ch.isVisible === true,
      );
      console.log(
        `DEBUG - Challenges with isVisible=true: ${visibleChallenges.length}`,
      );

      // Check status filter
      const statusChallenges = challengesByDate.filter((ch) =>
        ["scheduled", "live"].includes(ch.status),
      );
      console.log(
        `DEBUG - Challenges with status=scheduled/live: ${statusChallenges.length}`,
      );

      // Check endTime filter
      const endTimeChallenges = challengesByDate.filter((ch) => {
        const endTime = ch.scheduling?.endTime;
        return endTime && new Date(endTime) >= now;
      });
      console.log(
        `DEBUG - Challenges with endTime >= now: ${endTimeChallenges.length}`,
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
        "DEBUG - Challenge filtered out due to targetAudience restrictions",
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
      normalizedStart,
    );

    // Mark as viewed if not yet viewed
    if (progress.status === "not_started") {
      await progress.markViewed();
      await challenge.updateAnalytics("view");
    }

    // Calculate time remaining (use challenge's endTime or normalized end of day, whichever is earlier)
    // If challenge is completed, timer should stop (timeRemaining = 0)
    const isCompleted = progress.status === "completed";
    const challengeEndTime = challenge.scheduling.endTime || normalizedEnd;
    const timeRemaining = isCompleted ? 0 : Math.max(0, challengeEndTime - now);

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

    // Only populate game data for game-related challenge types
    const isGameChallenge =
      challenge.type === "game" || challenge.type === "sdk_game";

    if (isGameChallenge) {
      if (progress.selectedGame?.gameId) {
        // User has selected a game
        const selectedGameDoc = await Game.findById(
          progress.selectedGame.gameId,
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
        activeGame = {
          id: challenge.gameId,
          name: challenge.gameDetails.name,
          gameId: challenge.gameId,
          iconUrl:
            challenge.gameDetails.image || challenge.gameDetails.square_image,
          deepLink: challenge.gameDetails.downloadUrl,
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
            playTime,
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
        // User-friendly time labels
        timeRemainingLabel: isCompleted
          ? "Challenge Ended"
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
            : isGameChallenge && challenge.requirements?.timeLimit
              ? `💡 Play the selected game for ${challenge.requirements.timeLimit} minutes to complete`
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
          0,
        ),
      );
      const normalizedEnd = new Date(
        Date.UTC(
          rawDate.getUTCFullYear(),
          rawDate.getUTCMonth(),
          rawDate.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
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
          error.message,
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
      { new: true, runValidators: true },
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
        "title description type coinReward xpReward status challengeDate createdAt",
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
      normalizedStart,
    );

    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(
        userId,
        challenge._id,
        normalizedStart,
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
      normalizedStart,
    );

    if (!progress) {
      progress = await UserChallengeProgress.getOrCreateTodayChallenge(
        userId,
        challenge._id,
        normalizedStart,
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

    // Only include game info for game type challenges
    if (challenge.type === "game" && gameToPlay) {
      responseData.data.game = {
        id: gameToPlay._id,
        title: gameToPlay.title,
        deepLink: gameToPlay.metadata?.deepLink,
        packageName: gameToPlay.metadata?.packageName,
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
      normalizedStart,
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
      0,
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
      Math.random() * 100000,
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

    // Increment account overview challenges completed counter
    try {
      const accountOverviewService = require('../utils/accountOverview');
      await accountOverviewService.incrementChallengesCompletedCounter(userId);
    } catch (overviewErr) {
      console.error('[ACCOUNT-OVERVIEW] Failed to increment challenges counter after spin:', overviewErr);
    }

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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    const todayStr = normalizedStart.toISOString().split("T")[0];

    const user = await User.findById(userId).select("wallet xp streak badges vip");

    // VIP BENEFIT: Check if user has active VIP subscription
    // Query VIPSubscription collection directly with multiple fallback checks
    const VIPSubscription = require("../models/VIPSubscription");
    
    // Try multiple ways to find active subscription
    let activeSubscription = null;
    
    // Method 1: Use static method
    try {
      activeSubscription = await VIPSubscription.getActiveSubscription(userId);
    } catch (error) {
      console.log("⚠️ [VIP CHECK] getActiveSubscription failed:", error.message);
    }
    
    // Method 2: Direct query if method 1 failed
    if (!activeSubscription) {
      try {
        activeSubscription = await VIPSubscription.findOne({
          userId: userId,
          status: 'active',
          endDate: { $gt: new Date() }
        });
      } catch (error) {
        console.log("⚠️ [VIP CHECK] Direct query failed:", error.message);
      }
    }
    
    // Method 3: Try with ObjectId conversion
    if (!activeSubscription) {
      try {
        const mongoose = require('mongoose');
        const userObjectId = mongoose.Types.ObjectId.isValid(userId) 
          ? new mongoose.Types.ObjectId(userId) 
          : userId;
        
        activeSubscription = await VIPSubscription.findOne({
          userId: userObjectId,
          status: 'active',
          endDate: { $gt: new Date() }
        });
      } catch (error) {
        console.log("⚠️ [VIP CHECK] ObjectId query failed:", error.message);
      }
    }
    
    const hasActiveVIP = activeSubscription && activeSubscription.isActive();
    
    // FALLBACK: If no subscription found, check user.vip field as last resort
    const hasUserVipActive = !hasActiveVIP && user.vip?.isActive === true && 
                             user.vip?.expires && 
                             new Date(user.vip.expires) > new Date();
    
    const finalHasActiveVIP = hasActiveVIP || hasUserVipActive;
    
    // Log VIP check for debugging
    console.log("💎 [VIP CHECK]", {
      userId,
      userIdType: typeof userId,
      hasUserVipField: !!user.vip,
      userVipIsActive: user.vip?.isActive,
      userVipExpires: user.vip?.expires,
      hasActiveSubscription: !!activeSubscription,
      subscriptionId: activeSubscription?._id?.toString(),
      subscriptionStatus: activeSubscription?.status,
      subscriptionEndDate: activeSubscription?.endDate,
      subscriptionIsActiveMethod: activeSubscription ? activeSubscription.isActive() : null,
      hasUserVipActive,
      finalHasActiveVIP
    });

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
      normalizedStart,
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

      case "game": {
        /**
         * Completion is validated against play time reported for TODAY'S
         * challenge, held in progress.progress.metadata.playTimeMinutes and
         * written by PUT /api/daily-challenge/update-progress.
         *
         * This replaces a temporary override that set actionValidated = true
         * unconditionally, letting anyone claim a game challenge reward without
         * playing. It also replaces the strict validation that sat commented
         * out beneath it, which read user.games[].totalDuration - a field the
         * strict User schema does not define, so it was always undefined - and
         * inferred play time from a firstPlayed/lastPlayed span, which measures
         * elapsed wall-clock rather than play and is trivially inflated.
         *
         * Challenge-scoped, app-reported minutes are the only trustworthy
         * signal we currently have, so they are the only one used.
         *
         * NOTE: no app reports play time yet, so game challenges cannot be
         * completed until that lands. That is deliberate - failing closed is
         * correct, and there are currently no game-type challenges configured.
         */
        const requiredMinutes = Number(challenge.requirements?.timeLimit) || 0;
        const reportedMinutes =
          Number(progress.progress?.metadata?.playTimeMinutes) || 0;

        if (!requiredMinutes) {
          validationError =
            "This challenge has no play time requirement configured. Please contact support.";
        } else if (reportedMinutes <= 0) {
          validationError = `Please play the game for at least ${requiredMinutes} minutes. Play time must be tracked to complete this challenge.`;
        } else if (reportedMinutes < requiredMinutes) {
          validationError = `Please play the game for at least ${requiredMinutes} minutes to complete this challenge. Current play time: ${Math.floor(
            reportedMinutes
          )} minutes`;
        } else {
          actionValidated = true;
        }
        break;
      }

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
        const adWatched = progress.progress?.metadata?.adWatched || false;
        if (!adWatched) {
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

    // Apply VIP multipliers based on active subscription tier
    if (finalHasActiveVIP && activeSubscription) {
      const vipTier = activeSubscription.tier;
      if (vipTier === "gold") {
        bonusXP = Math.floor(xpReward * 0.5); // 50% bonus
      } else if (vipTier === "platinum") {
        bonusXP = Math.floor(xpReward); // 100% bonus
        bonusCoins = Math.floor(coinReward * 0.25); // 25% bonus
      }
      
      console.log("💎 [VIP MULTIPLIER]", {
        vipTier,
        baseXP: xpReward,
        bonusXP,
        baseCoins: coinReward,
        bonusCoins
      });
    } else if (finalHasActiveVIP && user.vip) {
      // Fallback to user.vip if subscription not found
      const vipLevel = user.vip.level;
      if (vipLevel === "gold") {
        bonusXP = Math.floor(xpReward * 0.5); // 50% bonus
      } else if (vipLevel === "platinum") {
        bonusXP = Math.floor(xpReward); // 100% bonus
        bonusCoins = Math.floor(coinReward * 0.25); // 25% bonus
      }
      
      console.log("💎 [VIP MULTIPLIER - FALLBACK]", {
        vipLevel,
        baseXP: xpReward,
        bonusXP,
        baseCoins: coinReward,
        bonusCoins
      });
    }

    const totalCoins = coinReward + bonusCoins;
    const baseXP = xpReward + bonusXP;

    // Check claim type to determine if rewards should be credited immediately or pending
    let claimType = challenge.claimType || "auto";
    
    // VIP OVERRIDE: If user has active VIP, force claimType to "auto"
    if (finalHasActiveVIP) {
      claimType = "auto";
      console.log("💎 [VIP OVERRIDE] Forcing claimType to 'auto' for VIP member");
    }
    
    const adWasWatched =
      adWatched === true || progress.progress?.metadata?.adWatched === true;
    
    // Simplified logic - auto always credits immediately
    const shouldCreditImmediately = claimType === "auto";
    
    console.log("💎 [SHOULD CREDIT CHECK]", {
      userId,
      originalClaimType: challenge.claimType || "auto",
      finalClaimType: claimType,
      finalHasActiveVIP,
      vipOverrideApplied: finalHasActiveVIP && challenge.claimType !== "auto",
      FINAL_shouldCreditImmediately: shouldCreditImmediately
    });
    
    console.log("💎 [VIP CHECK] Claim type evaluation:", {
      userId,
      claimType,
      adWasWatched,
      finalHasActiveVIP,
      vipLevel: finalHasActiveVIP && activeSubscription ? activeSubscription.tier : (finalHasActiveVIP && user.vip ? user.vip.level : null),
      vipExpires: finalHasActiveVIP && activeSubscription ? activeSubscription.endDate : (user.vip?.expires || null),
      shouldCreditImmediately
    });

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
      const yesterdayStr = yesterday.toISOString().split("T")[0];

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
          if (resetRule.onMiss !== false) {
            // Default: true (reset on miss)
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
                streak.resetReason = "missed_day_grace_period_exhausted";
              }
            } else {
              // No grace period - reset immediately
              streak.current = 0;
              streak.completedTasks = []; // ADM-DR-027 FIX: Clear completed tasks on reset
              streak.missedDays = 0;
              streak.resetAt = now;
              streak.resetReason = "missed_day_immediate_reset";
            }
          }
          // If onMiss is false, don't reset - continue from current streak
        } else {
          // No bonus day config found - apply default reset behavior
          streak.current = 0;
          streak.completedTasks = []; // ADM-DR-027 FIX: Clear completed tasks on reset
          streak.resetAt = now;
          streak.resetReason = "missed_day_default_reset";
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
                user.xp?.current || 0,
              );
              const milestoneXP = Math.round(
                reward.value * milestoneTierMultiplier,
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
    }

    // CRITICAL FIX: Check for Bonus Day rewards OUTSIDE the first-completion-of-day block
    // This ensures bonus day rewards are checked on EVERY challenge completion, not just the first one
    try {
      // Get current streak (either newly incremented or existing)
      const currentStreak = user.streak?.current || 0;
      
      console.log("🎁 [BONUS DAY CHECK] Starting bonus day check:", {
        userId,
        currentStreak,
        challengeId: challenge._id
      });
      
      // CRITICAL FIX: Get completed tasks to verify all required days are completed
      const completedTasks = user.streak?.completedTasks || [];

      // Get user profile for eligibility check
      const userProfile = {
        currentStreak: currentStreak,
        country: user.country || null,
        userSegment: user.userSegment || "all",
        completedTasks: completedTasks, // CRITICAL: Pass completed tasks for verification
      };

      // ADM-DR-028 FIX: Find bonus day for this streak milestone
      // CRITICAL: Use findOne with sort to get the most recent active bonus day for this dayNumber
      // This prevents showing both old and new bonus days when admin edits (e.g., Day-2 to Day-3)
      // findOne with isActive: true ensures deleted bonus days don't appear
      const bonusDay = await BonusDay.findOne({
        dayNumber: currentStreak,
        isActive: true,
        "conditions.minStreak": { $lte: currentStreak },
      }).sort({ updatedAt: -1 }); // ADM-DR-028 FIX: Get most recently updated bonus day to avoid duplicates

      console.log("🎁 [BONUS DAY CHECK] Bonus day query result:", {
        userId,
        currentStreak,
        bonusDayFound: !!bonusDay,
        bonusDayId: bonusDay?._id,
        bonusDayTitle: bonusDay?.title,
        bonusDayNumber: bonusDay?.dayNumber
      });

      // CRITICAL FIX: Only award bonus if all required days are completed
      // isEligibleForUser now checks requiresCompletion and verifies all days are completed
      if (bonusDay) {
        const isEligible = bonusDay.isEligibleForUser(userProfile);
        console.log("🎁 [BONUS DAY CHECK] Eligibility check:", {
          userId,
          currentStreak,
          isEligible,
          userProfile,
          bonusDayConditions: bonusDay.conditions
        });
      }
      
      if (bonusDay && bonusDay.isEligibleForUser(userProfile)) {
        // Check if bonus day reward was already claimed (track in user's metadata or transactions)
        const existingBonusDayTransaction = await Transaction.findOne({
          user: userId,
          "metadata.bonusDayNumber": currentStreak,
          "metadata.source": "bonus_day",
        });

        console.log("🎁 [BONUS DAY CHECK] Duplicate check:", {
          userId,
          currentStreak,
          existingTransaction: !!existingBonusDayTransaction,
          existingTransactionId: existingBonusDayTransaction?._id
        });

        if (!existingBonusDayTransaction) {
          console.log("🎁 [BONUS DAY AWARD] Starting bonus day reward award:", {
            userId,
            currentStreak,
            bonusDayId: bonusDay._id,
            primaryReward: bonusDay.primaryReward
          });
          
          // Award primary reward
          const primaryReward = bonusDay.primaryReward;
          if (primaryReward && primaryReward.type && primaryReward.value) {
            const bonusRewardsEarned = [];

            if (primaryReward.type === "coins") {
              const oldBalance = user.wallet.balance || 0;
              user.wallet.balance = oldBalance + primaryReward.value;
              console.log("🎁 [BONUS DAY AWARD] Coins awarded:", {
                userId,
                oldBalance,
                amount: primaryReward.value,
                newBalance: user.wallet.balance
              });
              bonusRewardsEarned.push({
                type: "coins",
                value: primaryReward.value,
              });
            } else if (primaryReward.type === "xp") {
              const oldXP = user.xp.current || 0;
              const { finalXP: bonusXP, multiplier: tierMultiplier } =
                await applyTierMultiplierToXP(user, primaryReward.value);
              user.xp.current = (user.xp.current || 0) + bonusXP;
              user.xp.total = (user.xp.total || 0) + bonusXP;
              console.log("🎁 [BONUS DAY AWARD] XP awarded:", {
                userId,
                oldXP,
                baseXP: primaryReward.value,
                tierMultiplier,
                finalXP: bonusXP,
                newXP: user.xp.current
              });
              bonusRewardsEarned.push({
                type: "xp",
                value: primaryReward.value,
                finalValue: bonusXP, // ADM-DR-027 FIX: Include final XP after tier multiplier
                tierMultiplier: tierMultiplier,
              });
            }

            // ADM-DR-027 FIX: Create transaction record with correct amount (final XP for XP rewards, base value for coins)
            const transactionAmount =
              primaryReward.type === "xp"
                ? bonusRewardsEarned[0].finalValue // Use final XP after tier multiplier
                : primaryReward.value; // Use base value for coins

            console.log("🎁 [BONUS DAY TRANSACTION] Creating transaction:", {
              userId,
              primaryRewardType: primaryReward.type,
              primaryRewardValue: primaryReward.value,
              transactionAmount,
              balanceType: primaryReward.type === "coins" ? "coins" : "xp",
              bonusRewardsEarned
            });

            const bonusDayTransaction = new Transaction({
              user: userId,
              type: "credit",
              balanceType: primaryReward.type === "coins" ? "coins" : "xp",
              amount: transactionAmount, // ADM-DR-027 FIX: Use final amount (after tier multiplier for XP)
              description: `Bonus Day Reward - Day ${currentStreak} - ${bonusDay.title}`,
              status: "completed",
              referenceId: `BONUS-DAY-${currentStreak}-${Date.now()}`,
              metadata: {
                bonusDayNumber: currentStreak,
                bonusDayId: bonusDay._id,
                bonusDayTitle: bonusDay.title,
                rewardType: primaryReward.type,
                rewardValue: primaryReward.value, // Base value
                finalRewardValue: transactionAmount, // ADM-DR-027 FIX: Final value (after tier multiplier)
                tierMultiplier:
                  primaryReward.type === "xp" ? bonusRewardsEarned[0].tierMultiplier : 1.0, // ADM-DR-027 FIX: Include tier multiplier
                source: "bonus_day",
              },
            });

            await bonusDayTransaction.save();
            
            console.log("🎁 [BONUS DAY AWARD] Transaction created:", {
              userId,
              transactionId: bonusDayTransaction._id,
              amount: transactionAmount,
              balanceType: bonusDayTransaction.balanceType,
              status: bonusDayTransaction.status,
              referenceId: bonusDayTransaction.referenceId
            });

            // Update bonus day analytics
            await bonusDay.updateAnalytics("claimed", 1);

            bonusDayRewardEarned = {
              day: currentStreak,
              title: bonusDay.title,
              rewards: bonusRewardsEarned,
              bonusDayId: bonusDay._id,
            };
            
            console.log("🎁 [BONUS DAY AWARD] Bonus day reward completed successfully:", {
              userId,
              currentStreak,
              bonusDayRewardEarned
            });
          } else {
            console.log("⚠️ [BONUS DAY AWARD] Primary reward invalid:", {
              userId,
              currentStreak,
              primaryReward
            });
          }
        } else {
          console.log("ℹ️ [BONUS DAY CHECK] Bonus day reward already claimed, skipping");
        }
      } else {
        console.log("ℹ️ [BONUS DAY CHECK] No eligible bonus day found:", {
          userId,
          currentStreak,
          bonusDayFound: !!bonusDay,
          isEligible: bonusDay ? bonusDay.isEligibleForUser(userProfile) : false
        });
      }
    } catch (error) {
      console.error("❌ [BONUS DAY ERROR] Error awarding bonus day reward:", {
        userId,
        currentStreak: user.streak?.current,
        error: error.message,
        stack: error.stack
      });
      // Continue even if bonus day reward fails
    }

    await user.save();

    // Mark progress as completed (store base XP before tier multiplier)
    await progress.markCompleted({
      coins: coinReward,
      xp: xpReward,
      bonusCoins,
      bonusXP,
    });
    await progress.claimRewards();

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
      const linkedGameDoc =
        await Game.findById(linkedGameObjectId).select("gameId");
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
      requiresAd: claimType === "watch_ad" && !adWasWatched && !hasActiveVIP, // VIP members don't require ad
      adWatched: adWasWatched || false,
      vipBenefitUsed: finalHasActiveVIP && claimType === "watch_ad" && !adWasWatched, // Track VIP benefit usage
      vipLevel: finalHasActiveVIP && activeSubscription ? activeSubscription.tier : (finalHasActiveVIP && user.vip ? user.vip.level : null),
      vipSubscriptionId: finalHasActiveVIP && activeSubscription ? activeSubscription._id : null,
      source: "daily_challenge", // Required for claim-reward endpoint
    };

    if (linkedGameCode) {
      transactionMetadata.gameId = linkedGameCode;
    }
    if (linkedGameObjectId) {
      transactionMetadata.gameRef = linkedGameObjectId;
    }

    // CRITICAL FIX: Transaction status must match whether rewards were actually credited
    // If shouldCreditImmediately is false (manual claim type), transaction should be "pending"
    // until user claims via /claim-reward endpoint
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

    // Increment account overview challenges completed counter (real-time progress update)
    try {
      const accountOverviewService = require('../utils/accountOverview');
      await accountOverviewService.incrementChallengesCompletedCounter(userId);
    } catch (overviewErr) {
      console.error('[ACCOUNT-OVERVIEW] Failed to increment challenges counter:', overviewErr);
      // Non-blocking — challenge completion still succeeds
    }

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
          requiresAd: claimType === "watch_ad" && !adWasWatched,
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
        transaction.metadata?.challengeId,
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
      transaction.metadata?.challengeId,
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
        0,
      ),
    );
    const normalizedEnd = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
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
      normalizedStart,
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
        Number(playTimeMinutes) || 0,
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
          Math.floor((currentPlayTime / requiredMinutes) * 100),
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

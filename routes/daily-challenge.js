/**
 * Daily Challenge Routes (User-Facing)
 * Implements calendar view, today's challenge, game selection, and completion
 * @module routes/daily-challenge
 */

const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const DailyChallenge = require("../models/DailyChallenge");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const User = require("../models/User");
const Game = require("../models/Game");
const Transaction = require("../models/Transaction");
const BesitosConversion = require("../models/BesitosConversion");
const besitosService = require("../services/besitos.service");
const { trackActivity } = require("../middleware/activityTracker");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const streakRouter = require("./streak");
const getStreakConfig = streakRouter.getStreakConfig;
const getMilestoneReward = streakRouter.getMilestoneReward;

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

    const user = await User.findById(userId).select("xp age location vip onboarding.gender");

    console.log("Querying for challenge:", {
      normalizedStart: normalizedStart.toISOString(),
      normalizedEnd: normalizedEnd.toISOString(),
      now: now.toISOString(),
    });

    // Find today's challenge - use UTC dates and filter by status
    const challenge = await DailyChallenge.findOne({
      challengeDate: { $gte: normalizedStart, $lte: normalizedEnd },
      isVisible: true,
      status: { $in: ["scheduled", "live"] }, // Exclude expired, draft, completed
      "scheduling.startTime": { $lte: now }, // Challenge should have started
      "scheduling.endTime": { $gte: now }, // Challenge should not have ended
    }).populate("assignedGame.gameId");

    if (!challenge) {
      return res.json({
        success: true,
        data: {
          hasChallenge: false,
          message: "No challenge available for today",
        },
      });
    }

    // Check if user can access this challenge
    const canAccess = challenge.canUserAccess({
      xp: user.xp?.current || 0,
      age: user.age,
      country: user.location?.current?.country,
      gender: user.onboarding?.gender,
    });

    if (!canAccess) {
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
    const challengeEndTime = challenge.scheduling.endTime || normalizedEnd;
    const timeRemaining = Math.max(0, challengeEndTime - now);

    // Calculate countdown in hours, minutes, seconds
    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
    );
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

    // Build response
    const responseData = {
      hasChallenge: true,
      challenge: {
        id: challenge._id,
        title: challenge.title,
        description: challenge.description,
        type: challenge.type,
        instructions: challenge.content?.instructions,
        mediaUrl: challenge.content?.mediaUrl,
        coinReward: challenge.coinReward,
        xpReward: challenge.xpReward,
        claimType: challenge.claimType,
        gameId: challenge.gameId,
        sdkProvider: challenge.sdkProvider,
        gameDetails: challenge.gameDetails || {},
        assignedGame: challenge.assignedGame?.gameId
          ? {
              id: challenge.assignedGame.gameId._id,
              title: challenge.assignedGame.gameId.title,
              iconUrl: challenge.assignedGame.gameId.metadata?.iconUrl,
              deepLink: challenge.assignedGame.gameId.metadata?.deepLink,
              isRequired: challenge.assignedGame.isRequired,
            }
          : null,
        hasSdkTask: challenge.sdkTask?.provider !== "none",
        sdkTask:
          challenge.sdkTask?.provider !== "none"
            ? {
                provider: challenge.sdkTask.provider,
                taskId: challenge.sdkTask.taskId,
                offerId: challenge.sdkTask.offerId,
              }
            : null,
      },
      progress: {
        status: progress.status,
        percentage: progress.progress?.percentage || 0,
        selectedGame: progress.selectedGame?.gameId
          ? {
              id: progress.selectedGame.gameId,
              selectedAt: progress.selectedGame.selectedAt,
            }
          : null,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        rewardsEarned: progress.rewardsEarned,
        rewardsClaimed: progress.rewardsClaimed,
      },
      countdown: {
        timeRemaining, // milliseconds
        hours,
        minutes,
        seconds,
        formatted: `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        endsAt: challengeEndTime.toISOString(),
      },
      actions: {
        canSelectGame:
          !challenge.assignedGame?.isRequired &&
          !progress.selectedGame?.gameId &&
          progress.status !== "completed",
        canPlay:
          (challenge.gameId ||
            challenge.assignedGame?.gameId ||
            progress.selectedGame?.gameId) &&
          progress.status !== "completed",
        canComplete:
          progress.status === "in_progress" || progress.status === "started",
        canClaimRewards:
          progress.status === "completed" && !progress.rewardsClaimed,
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

    res.json({
      success: true,
      message: "Challenge started",
      data: {
        challengeId: challenge._id,
        status: progress.status,
        game: gameToPlay
          ? {
              id: gameToPlay._id,
              title: gameToPlay.title,
              deepLink: gameToPlay.metadata?.deepLink,
              packageName: gameToPlay.metadata?.packageName,
            }
          : null,
        sdkTask:
          challenge.sdkTask?.provider !== "none" ? challenge.sdkTask : null,
      },
    });
  } catch (error) {
    console.error("Error starting challenge:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start challenge",
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
    const { conversionId } = req.body;

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

    // Update user wallet and XP (apply tier multiplier to XP)
    user.wallet.balance = (user.wallet.balance || 0) + totalCoins;

    const { finalXP, multiplier: tierMultiplier } = await applyTierMultiplierToXP(
      user,
      baseXP
    );

    user.xp.current = (user.xp.current || 0) + finalXP;
    user.xp.total = (user.xp.total || 0) + finalXP;

    // Update streak
    const streak = user.streak || {};
    if (!streak.completedTasks) streak.completedTasks = [];

    let newStreak = streak.current || 0;
    let milestoneRewardEarned = null;

    if (!streak.completedTasks.includes(todayStr)) {
      streak.completedTasks.push(todayStr);
      newStreak = (streak.current || 0) + 1;
      streak.current = newStreak;
      streak.lastUpdated = new Date();
      streak.lastTaskType = "challenge";
      user.streak = streak;

      // Check for milestone rewards
      try {
        const STREAK_CONFIG = await getStreakConfig();
        const milestoneReward = getMilestoneReward(newStreak, STREAK_CONFIG);
        
        if (milestoneReward && milestoneReward.rewards && milestoneReward.rewards.length > 0) {
          const rewardsEarned = [];
          
          // Award all rewards for this milestone
          for (const reward of milestoneReward.rewards) {
            if (reward.type === 'coins') {
              user.wallet.balance = (user.wallet.balance || 0) + reward.value;
            } else if (reward.type === 'xp') {
              const { finalXP: milestoneXP } = await applyTierMultiplierToXP(user, reward.value);
              user.xp.current = (user.xp.current || 0) + milestoneXP;
              user.xp.total = (user.xp.total || 0) + milestoneXP;
            }
            
            // Create transaction record for each reward
            const milestoneTransaction = new Transaction({
              user: userId,
              type: 'credit',
              balanceType: reward.type === 'coins' ? 'coins' : 'xp',
              amount: reward.value,
              description: `Streak Milestone Reward - Day ${newStreak} - ${reward.type === 'coins' ? 'Coins' : 'XP'}`,
              status: milestoneReward.claimMode === 'auto' ? 'completed' : 'pending',
              referenceId: `STREAK-${newStreak}-${reward.type}-${Date.now()}`,
              metadata: {
                milestoneDay: newStreak,
                rewardType: reward.type,
                rewardValue: reward.value,
                claimMode: milestoneReward.claimMode,
                source: 'daily_challenge'
              }
            });
            
            await milestoneTransaction.save();
            rewardsEarned.push({ type: reward.type, value: reward.value });
          }
          
          milestoneRewardEarned = {
            day: newStreak,
            rewards: rewardsEarned,
            claimMode: milestoneReward.claimMode,
            requiresAd: milestoneReward.claimMode === 'watch_ad'
          };
        }
      } catch (error) {
        console.error('Error awarding milestone reward:', error);
        // Continue even if milestone reward fails
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
      baseXp: baseXP,
      xpEarned: finalXP,
      bonusCoins,
      bonusXP,
      tierMultiplier,
    };

    if (linkedGameCode) {
      transactionMetadata.gameId = linkedGameCode;
    }
    if (linkedGameObjectId) {
      transactionMetadata.gameRef = linkedGameObjectId;
    }

    const transaction = new Transaction({
      user: userId,
      type: "credit",
      amount: totalCoins,
      balanceType: "coins",
      description: `Daily Challenge: ${challenge.title}`,
      status: "completed",
      referenceId: `DAILY-CHALLENGE-${challenge._id}-${Date.now()}`,
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
      console.error('Error getting streak config for display:', error);
    }
    
    const milestoneReached = configuredMilestones.find((m) => m === newStreak);

    res.json({
      success: true,
      message: "Challenge completed successfully!",
      data: {
        rewards: {
          coins: coinReward,
          xp: xpReward,
          bonusCoins,
          bonusXP,
          totalCoins,
          totalXP,
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
        },
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
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

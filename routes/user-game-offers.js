const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");

/**
 * GET /welcome-bonus-timer
 * Returns welcome bonus timer info for the authenticated user.
 * Query params:
 *  - gameId (optional): if provided, returns game-specific unlock times and bonus tasks
 */
router.get("/welcome-bonus-timer", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("signup createdAt xp games")
      .lean();
    if (!user)
      return res.status(404).json({ success: false, error: "User not found" });

    const config = await WelcomeBonusTimer.getActiveRule();
    if (!config || !config.isActive) {
      return res.json({
        success: true,
        data: {
          isActive: false,
          message: "Welcome bonus not configured or disabled",
        },
      });
    }

    // Determine user's registration time (when countdown should start)
    const signupAt =
      user.signup && user.signup.at
        ? new Date(user.signup.at)
        : user.createdAt
        ? new Date(user.createdAt)
        : user._id && user._id.getTimestamp
        ? user._id.getTimestamp()
        : new Date();

    const userXp =
      user.xp && (user.xp.current || user.xp.total)
        ? user.xp.current || user.xp.total
        : 0;
    const gameId = req.query.gameId;

    let unlockTimeHours,
      completionDeadlineDays,
      timerInfo = null,
      gameBonusTasks = null;

    if (gameId) {
      // Use game-specific calculation when gameId provided
      try {
        unlockTimeHours = config.calculateUnlockTime(gameId, userXp);
        completionDeadlineDays = config.calculateCompletionDeadline(
          gameId,
          userXp
        );
        timerInfo = config.getTimerInfo(gameId, userXp, signupAt);
        gameBonusTasks = config.getBonusTasksForGame(gameId);
      } catch (e) {
        // Fallback to defaults if any error
        unlockTimeHours =
          config.getUnlockTimeForXpTier(userXp) || config.unlockTimeHours;
        completionDeadlineDays =
          config.getCompletionDeadlineForXpTier(userXp) ||
          config.completionDeadlineDays;
      }
    } else {
      // No gameId: use XP-tier or default values
      unlockTimeHours =
        config.getUnlockTimeForXpTier(userXp) || config.unlockTimeHours;
      completionDeadlineDays =
        config.getCompletionDeadlineForXpTier(userXp) ||
        config.completionDeadlineDays;

      const unlockTime = new Date(
        signupAt.getTime() + unlockTimeHours * 60 * 60 * 1000
      );
      const completionDeadline = new Date(
        unlockTime.getTime() + completionDeadlineDays * 24 * 60 * 60 * 1000
      );
      const now = new Date();

      timerInfo = {
        startedAt: signupAt,
        unlockTime,
        completionDeadline,
        isUnlocked: now >= unlockTime,
        isExpired: now > completionDeadline,
        timeUntilUnlock: Math.max(0, unlockTime.getTime() - now.getTime()),
        timeUntilExpiry: Math.max(
          0,
          completionDeadline.getTime() - now.getTime()
        ),
        unlockTimeHours,
        completionDeadlineDays,
      };
    }

    const payload = {
      isActive: !!config.isActive,
      metadata: config.metadata || {},
      maxGamesWithBonusTasks: config.maxGamesWithBonusTasks,
      maxBonusTasksPerGame: config.maxBonusTasksPerGame,
      timer: timerInfo,
      gameId: gameId || null,
      gameBonusTasks: gameBonusTasks || null,
    };

    // If bonus has expired, return simple expired message
    if (timerInfo && timerInfo.isExpired) {
      return res.json({
        success: true,
        data: {
          isActive: false,
          message: "Bonus expired",
          expiredAt: timerInfo.completionDeadline,
          startedAt: timerInfo.startedAt,
        },
      });
    }

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error("Error in user welcome-bonus-timer:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to get welcome bonus timer" });
  }
});

module.exports = router;

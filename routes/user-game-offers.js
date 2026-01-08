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
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

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

    // Prepare context for the toJSON transform
    const userContext = {
      gameId,
      userXp,
      gameDownloadTime: signupAt,
    };
    
    // The toJSON method on the model will now calculate the timer dynamically
    const payload = config.toJSON({ userContext });

    // Add game-specific bonus tasks if a gameId is provided
    payload.gameBonusTasks = gameId ? config.getBonusTasksForGame(gameId) : null;
    payload.gameId = gameId || null;

    // If bonus has expired, return a simplified expired message
    if (payload.timer && payload.timer.isExpired) {
      return res.json({
        success: true,
        data: {
          isActive: false,
          message: "Bonus expired",
          expiredAt: payload.timer.completionDeadline,
          startedAt: payload.timer.startedAt,
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

const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const SwipeUndoLog = require("../models/SwipeUndoLog");
const User = require("../models/User");
const logger = require("../utils/logger");

const UNDO_LIMITS = { Free: 1, Bronze: 6, Gold: 8, Platinum: 12 };

router.post("/undo-usage", protect, async (req, res) => {
  try {
    const {
      gameId,
      gameTitle,
      undoCount,
      maxUndoLimit,
      tier,
      restoredFromIndex,
    } = req.body;

    // Validate required fields
    if (undoCount === undefined || undoCount === null) {
      return res.status(400).json({
        success: false,
        error: { message: "undoCount is required", statusCode: 400 },
      });
    }
    if (maxUndoLimit === undefined || maxUndoLimit === null) {
      return res.status(400).json({
        success: false,
        error: { message: "maxUndoLimit is required", statusCode: 400 },
      });
    }
    if (!tier) {
      return res.status(400).json({
        success: false,
        error: { message: "tier is required", statusCode: 400 },
      });
    }

    const validTiers = ["Free", "Bronze", "Gold", "Platinum"];
    if (!validTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `tier must be one of: ${validTiers.join(", ")}`,
          statusCode: 400,
        },
      });
    }

    // userId is extracted from the verified Bearer token — never from request body
    const userId = req.user.userId;

    await SwipeUndoLog.create({
      userId,
      gameId: gameId || null,
      gameTitle: gameTitle || null,
      undoCount,
      maxUndoLimit,
      tier,
      restoredFromIndex:
        restoredFromIndex !== undefined ? restoredFromIndex : null,
    });

    logger.info("Swipe undo usage tracked", {
      userId,
      gameId,
      tier,
      undoCount,
      maxUndoLimit,
    });

    return res.status(200).json({
      success: true,
      message: "Undo usage tracked",
    });
  } catch (error) {
    logger.error("Error tracking swipe undo usage", {
      error: error.message,
      userId: req.user?.userId,
    });

    return res.status(500).json({
      success: false,
      error: { message: "Server error", statusCode: 500 },
    });
  }
});

router.get("/undo-usage", protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's real VIP tier from DB
    const user = await User.findById(userId).select("vip").lean();
    const rawLevel = user?.vip?.level || "free";

    // Normalize to match UNDO_LIMITS keys: "bronze" → "Bronze"
    const tierKey =
      rawLevel.charAt(0).toUpperCase() + rawLevel.slice(1).toLowerCase();
    const maxUndoLimit = UNDO_LIMITS[tierKey] ?? UNDO_LIMITS.Free;

    // Count undo documents created today — 1 POST = 1 undo used (source of truth)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const undoCount = await SwipeUndoLog.countDocuments({
      userId,
      createdAt: { $gte: startOfDay },
    });

    const remaining = maxUndoLimit - undoCount;

    return res.status(200).json({
      success: true,
      data: {
        tier: tierKey,
        undoCount,
        maxUndoLimit,
        remaining: remaining >= 0 ? remaining : 0,
      },
    });
  } catch (error) {
    logger.error("Error fetching swipe undo usage", {
      error: error.message,
      userId: req.user?.userId,
    });
    return res.status(500).json({
      success: false,
      error: { message: "Server error", statusCode: 500 },
    });
  }
});

module.exports = router;

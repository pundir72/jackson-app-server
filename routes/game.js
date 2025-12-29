const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const protect = require("../middleware/auth");
const User = require("../models/User");
const Game = require("../models/Game");
const Transaction = require("../models/Transaction");
const GameTask = require("../models/GameTask");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const XPTier = require("../models/XPTier");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const {
  getUserXpTier,
  getUserMembershipTier,
  meetsXpTierRequirement,
  meetsMembershipTierRequirement,
} = require("../utils/taskProgression");
const besitosController = require("../controllers/besitos.controller");
const { trackAchievements } = require("../utils/achievements");

/**
 * Calculate stepwise XP reward for a task
 * Task 1: Base XP
 * Task 2: Base XP × Multiplier
 * Task 3: Task 2 XP × Multiplier
 * Task N: Task (N-1) XP × Multiplier
 * @param {Number} taskNumber - 1-based task number (Task 1, Task 2, etc.)
 * @param {Number} baseXP - Base XP for Task 1
 * @param {Number} multiplier - Stepwise multiplier
 * @returns {Number} - Calculated XP for this task
 */
function calculateStepwiseXP(taskNumber, baseXP, multiplier) {
  if (taskNumber <= 1) {
    return baseXP;
  }
  // Task N = Base XP × (Multiplier ^ (N-1))
  return baseXP * Math.pow(multiplier, taskNumber - 1);
}
// Get user's games (downloaded/installed games list)
router.get("/", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    const user = await User.findById(req.user.userId).select("games");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const gamesArr = Array.isArray(user.games) ? user.games.slice() : [];
    gamesArr.sort(
      (a, b) =>
        new Date(b.installedAt || b.date || 0) -
        new Date(a.installedAt || a.date || 0)
    );

    const start = (pageNum - 1) * pageSize;
    const slice = gamesArr.slice(start, start + pageSize);

    // Enrich with game metadata from Game collection
    const enriched = await Promise.all(
      slice.map(async (g) => {
        let meta = null;
        try {
          meta = await Game.findOne({ gameId: g.gameId })
            .select(
              "title description category uiSection gender ageGroup metadata gameDetails rewards"
            )
            .lean();
        } catch (_) {}

        return {
          gameId: g.gameId,
          offerId: g.offerId || null,
          installedAt: g.installedAt || g.date || null,
          status: g.status || "installed",
          completed: g.completed || false,
          progress: g.progress || 0,
          score: g.score || 0,
          playCount: g.playCount || 0,
          lastPlayed: g.lastPlayed || null,
          level: g.level || 1,
          // Game metadata
          title: meta?.title || null,
          description: meta?.description || null,
          category: meta?.category || null,
          uiSection: meta?.uiSection || null,
          gender: meta?.gender || null,
          ageGroup: meta?.ageGroup || null,
          rewards: meta?.rewards || { coins: 0, xp: 0 },
          icon:
            meta?.metadata?.thumbnail?.url ||
            meta?.gameDetails?.square_image ||
            meta?.gameDetails?.image ||
            "",
          gameDetails: meta?.gameDetails || null,
        };
      })
    );

    res.json({
      success: true,
      data: {
        games: enriched,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total: gamesArr.length,
          pages: Math.ceil(gamesArr.length / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Error getting user games:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// Start new game
router.post("/start", protect, async (req, res) => {
  try {
    const { gameId } = req.body;

    const user = await User.findById(req.user.userId);

    // Add new game
    user.games.push({
      gameId,
      score: 0,
      completed: false,
      progress: 0,
      date: new Date(),
    });

    await user.save();

    res.json({
      message: "Game started successfully",
      game: user.games[user.games.length - 1],
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Update game score
router.put("/score", protect, async (req, res) => {
  try {
    const { gameId, score } = req.body;

    const user = await User.findById(req.user.userId);

    // Find game and update score
    const game = user.games.find((g) => g.gameId === gameId);
    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    game.score = score;
    // Update progress based on score (assuming 100 is max score)
    game.progress = Math.min(100, Math.max(0, (score / 100) * 100));
    await user.save();

    // Track achievements for game score updates
    setImmediate(async () => {
      try {
        await trackAchievements(req.user.userId, "games", {
          score: score,
          gameId: gameId,
          category: "game_score",
        });
      } catch (error) {
        console.error("Error tracking game score achievements:", error);
      }
    });

    res.json({
      message: "Score updated successfully",
      game,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Complete game
router.put("/complete", protect, async (req, res) => {
  try {
    const { gameId } = req.body;

    const user = await User.findById(req.user.userId);

    // Find game and mark as completed
    const game = user.games.find((g) => g.gameId === gameId);
    if (!game) {
      return res.status(404).json({ message: "Game not found" });
    }

    game.completed = true;
    // Set progress to 100% when game is completed
    game.progress = 100;
    await user.save();

    // Track achievements for game completion
    setImmediate(async () => {
      try {
        await trackAchievements(req.user.userId, "games", {
          completed: true,
          gameId: gameId,
          category: "game_completion",
        });
      } catch (error) {
        console.error("Error tracking game completion achievements:", error);
      }
    });

    res.json({
      message: "Game completed successfully",
      game,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Track a game install/download (internal tracking, not Besitos)
router.post("/install", protect, async (req, res) => {
  try {
    const { gameId, offerId } = req.body;
    if (!gameId) {
      return res
        .status(400)
        .json({ success: false, message: "gameId is required" });
    }

    const user = await User.findById(req.user.userId).select("games");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const idx = Array.isArray(user.games)
      ? user.games.findIndex((g) => String(g.gameId) === String(gameId))
      : -1;
    if (idx >= 0) {
      user.games[idx].installedAt = new Date();
      if (offerId) user.games[idx].offerId = offerId;
      user.games[idx].status = "installed";
    } else {
      user.games = user.games || [];
      user.games.push({
        gameId,
        offerId,
        installedAt: new Date(),
        status: "installed",
      });
    }

    await user.save();

    // Invalidate profile cache so GET /api/profile reflects latest games
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(req.user.userId);
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after game installation:",
        e.message
      );
    }

    return res.json({ success: true, message: "Game installation recorded" });
  } catch (error) {
    console.error("Error recording game installation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record installation",
      error: error.message,
    });
  }
});

// Get downloaded/installed games history
router.get("/downloads", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    const user = await User.findById(req.user.userId).select("games");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const gamesArr = Array.isArray(user.games) ? user.games.slice() : [];
    gamesArr.sort(
      (a, b) => new Date(b.installedAt || 0) - new Date(a.installedAt || 0)
    );

    const start = (pageNum - 1) * pageSize;
    const slice = gamesArr.slice(start, start + pageSize);

    // Enrich minimal metadata from Game collection if possible
    const enriched = await Promise.all(
      slice.map(async (g) => {
        let meta = null;
        try {
          meta = await Game.findOne({ gameId: g.gameId })
            .select(
              "title category uiSection gender ageGroup metadata.thumbnail gameDetails"
            )
            .lean();
        } catch (_) {}
        return {
          gameId: g.gameId,
          offerId: g.offerId || null,
          installedAt: g.installedAt || null,
          status: g.status || "installed",
          title: meta?.title || null,
          category: meta?.category || null,
          uiSection: meta?.uiSection || null,
          gender: meta?.gender || null,
          ageGroup: meta?.ageGroup || null,
          icon:
            meta?.metadata?.thumbnail?.url ||
            meta?.gameDetails?.square_image ||
            meta?.gameDetails?.image ||
            "",
        };
      })
    );

    res.json({
      success: true,
      data: {
        downloads: enriched,
        pagination: {
          page: pageNum,
          limit: pageSize,
          total: gamesArr.length,
          pages: Math.ceil(gamesArr.length / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching downloads:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch downloads",
      error: error.message,
    });
  }
});

// Credit earned XP and coins to the authenticated user
router.post("/earn", protect, async (req, res) => {
  try {
    const { gameId, offerId, coins = 0, xp = 0, reason } = req.body;
    const coinsNum = Number(coins);
    const baseXpNum = Number(xp);

    if (isNaN(coinsNum) || coinsNum < 0 || isNaN(baseXpNum) || baseXpNum < 0) {
      return res.status(400).json({
        success: false,
        message: "coins and xp must be non-negative numbers",
      });
    }

    // basic per-call cap to avoid accidental large credits
    if (coinsNum > 100000 || baseXpNum > 100000) {
      return res
        .status(400)
        .json({ success: false, message: "coins/xp exceed per-call cap" });
    }

    const user = await User.findById(req.user.userId).select("wallet xp games");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Update wallet balance (coins)
    user.wallet = user.wallet || {};
    user.wallet.balance = Number(user.wallet.balance || 0) + coinsNum;
    user.wallet.lastUpdated = new Date();

    // Update xp object (current + total) with tier-based multiplier
    user.xp = user.xp || {};
    const { finalXP, multiplier: tierMultiplier } =
      await applyTierMultiplierToXP(user, baseXpNum);
    user.xp.current = Number(user.xp.current || 0) + finalXP;
    user.xp.total = Number(user.xp.total || 0) + finalXP;

    // Optional lightweight history on user.games entry if present
    if (gameId && Array.isArray(user.games)) {
      const idx = user.games.findIndex(
        (g) => String(g.gameId) === String(gameId)
      );
      if (idx >= 0) {
        user.games[idx].lastEarnedAt = new Date();
        user.games[idx].lastEarned = {
          coins: coinsNum,
          xp: finalXP,
          baseXp: baseXpNum,
          tierMultiplier,
          offerId: offerId || null,
          reason: reason || null,
        };
      }
    }

    // Find Game document to get ObjectId for proper linking (if gameId provided)
    let gameDoc = null;
    if (gameId) {
      gameDoc = await Game.findOne({ gameId: gameId }).select("_id").lean();
    }

    // Create transaction record for revenue tracking
    const transaction = new Transaction({
      user: user._id,
      type: "credit",
      amount: coinsNum,
      balanceType: "coins",
      description: gameId
        ? `Game earnings - ${gameId}`
        : `Manual game earnings${reason ? ` - ${reason}` : ""}`,
      status: "completed",
      referenceId: `GAME-EARN-${gameId || "manual"}-${Date.now()}`,
      gameId: gameId || null,
      game: gameDoc?._id || null,
      metadata: {
        gameId: gameId || null,
        offerId: offerId || null,
        reason: reason || null,
        source: "game_earn",
        xpEarned: finalXP,
        baseXp: baseXpNum,
        tierMultiplier,
      },
    });

    await Promise.all([user.save(), transaction.save()]);

    // Track achievements for game earnings
    setImmediate(async () => {
      try {
        await trackAchievements(req.user.userId, "wallet", {
          coins: coinsNum,
          xp: finalXP,
          category: "game_earn",
          gameId: gameId,
          reason: reason,
        });

        // Also track XP achievements
        await trackAchievements(req.user.userId, "xp", {
          xp: xpNum,
          category: "game_earn",
        });
      } catch (error) {
        console.error("Error tracking game earn achievements:", error);
      }
    });

    return res.json({
      success: true,
      data: {
        wallet: { balance: user.wallet.balance },
        xp: { current: user.xp.current, total: user.xp.total },
      },
    });
  } catch (error) {
    console.error("Error crediting earnings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to credit earnings",
      error: error.message,
    });
  }
});

/**
 * GET /api/game/discover
 * Query games for user by uiSection, ageGroup, gender
 * Applies Game Display Rules, Bonus Task eligibility, and Task Progression Rules
 * Query params: uiSection, ageGroup, gender, page=1, limit=20, country (optional)
 */
router.get("/discover", protect, async (req, res) => {
  try {
    console.log("=== GAME DISCOVER START ===");
    console.log("Raw Query Params:", req.query);

    const {
      uiSection,
      ageGroup,
      gender,
      tier, // XP tier filter (Junior, Mid, Senior)
      membership, // Membership tier filter (free, bronze, gold, platinum)
      page = 1,
      limit = 20,
      country,
    } = req.query;

    console.log("Parsed Query Params:", {
      uiSection: uiSection || "NOT PROVIDED",
      ageGroup: ageGroup || "NOT PROVIDED",
      gender: gender || "NOT PROVIDED",
      tier: tier || "NOT PROVIDED",
      membership: membership || "NOT PROVIDED",
      page: page,
      limit: limit,
      country: country || "NOT PROVIDED",
    });

    const userId = req.user.userId;
    console.log("User ID from JWT token:", userId);
    console.log("Tracking activity for user:", userId, "on route:", req.path);

    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    // Calculate user profile for display rules
    const gamesDownloaded =
      user.games?.filter((g) => {
        return (
          g.installedAt || g.status === "installed" || (g.date && !g.completed)
        );
      }).length || 0;

    // Get user's VIP tier
    let membershipTier = "free";
    if (user.vip?.tier) {
      membershipTier = user.vip.tier;
    } else if (user.vip?.level && user.vip.level !== "free") {
      membershipTier = user.vip.level;
    }

    // Build user profile for display rules
    const userProfile = {
      age:
        user.profile?.age ||
        (user.onboarding?.ageRange
          ? parseInt(user.onboarding.ageRange.split("-")[0])
          : null) ||
        25,
      gender:
        user.profile?.gender || user.onboarding?.gender || gender || "other",
      country:
        user.location?.current?.country ||
        user.location?.country ||
        country ||
        "US",
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get active display rules and apply to user
    const GameDisplayRule = require("../models/GameDisplayRule");
    const activeRules = await GameDisplayRule.findActive()
      .populate("xpTier", "tierName xpMin xpMax")
      .lean();

    // Find matching display rule
    let matchingRule = null;
    let maxGamesFromRule = null;
    for (const rule of activeRules) {
      const ruleModel = new GameDisplayRule(rule);
      const result = await ruleModel.applyToUser(userProfile);
      if (result) {
        if (
          !matchingRule ||
          (rule.metadata?.priority || 0) >
            (matchingRule.metadata?.priority || 0)
        ) {
          matchingRule = rule;
          maxGamesFromRule = result.maxGames;
        }
      }
    }

    // Build base filter
    const filter = { isActive: true };
    if (uiSection) filter.uiSection = uiSection;

    // Check if user has Google ID (can login with Google - may not have age/gender)
    const isGoogleUser = !!user.social?.googleId;

    // If user logged in with Google, fetch all age groups and all genders
    // Otherwise, apply ageGroup and gender filters as normal
    if (!isGoogleUser) {
      if (ageGroup) filter.ageGroups = { $in: [ageGroup] };
      // Gender filter: match specific gender OR "Any"/"all" (which applies to all genders)
      // Normalize gender values: handle case-insensitive matching and "Any"/"all" equivalence
      if (gender) {
        const normalizedGender = gender.toLowerCase();
        // Map common variations: "all" -> "Any", lowercase -> capitalized
        const genderVariations = [
          normalizedGender, // original lowercase
          normalizedGender.charAt(0).toUpperCase() + normalizedGender.slice(1), // Capitalized
          normalizedGender.toUpperCase(), // UPPERCASE
        ];

        // Add "Any" or "all" for games that apply to all genders
        if (normalizedGender === "all" || normalizedGender === "any") {
          genderVariations.push("Any", "all", "ANY", "any");
        } else {
          // For specific genders, also include "Any" and "all" to match games for all genders
          genderVariations.push("Any", "all", "ANY", "any");
        }

        // Use case-insensitive regex matching
        filter.gender = {
          $in: genderVariations.filter((v, i, arr) => arr.indexOf(v) === i), // Remove duplicates
        };
      }
    } else {
      // For Google users, don't filter by ageGroup or gender to show all games
      console.log("=== GOOGLE USER DETECTED ===");
      console.log("Google user detected - fetching all age groups and genders");
      console.log(
        "Filter before Google user logic:",
        JSON.stringify(
          { isActive: true, uiSection: uiSection || "NOT SET" },
          null,
          2
        )
      );
    }

    // XP Tier filter (Junior, Mid, Senior)
    if (tier) {
      const normalizedTier =
        tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
      // Filter games that have this tier in their xpTiers array
      // Also include games with no xpTiers specified (available to all tiers)
      filter.$or = filter.$or || [];
      filter.$or.push(
        {
          xpTiers: {
            $in: [normalizedTier, tier, tier.toLowerCase(), tier.toUpperCase()],
          },
        },
        { xpTiers: { $exists: false } },
        { xpTiers: { $size: 0 } }
      );
    }

    // Membership tier filter (free, bronze, gold, platinum)
    // Filter games where the membership tier is within the allowed range
    if (membership) {
      const normalizedMembership = membership.toLowerCase();
      const tierOrder = ["free", "bronze", "gold", "platinum"];
      const membershipIndex = tierOrder.indexOf(normalizedMembership);

      if (membershipIndex !== -1) {
        // Include games with no tier restrictions OR where membership tier is allowed
        // Games with tierRestrictions.minTier <= membership <= tierRestrictions.maxTier
        const membershipFilter = {
          $or: [
            // Games with no tier restrictions (available to all)
            { tierRestrictions: { $exists: false } },
            { "tierRestrictions.minTier": { $exists: false } },
            { "tierRestrictions.maxTier": { $exists: false } },
            // Games where minTier allows this membership level or lower
            // This is a simplified filter - full validation happens in post-query filtering
            {
              $or: tierOrder.slice(0, membershipIndex + 1).map((tier) => ({
                "tierRestrictions.minTier": tier,
              })),
            },
          ],
        };

        if (filter.$and) {
          filter.$and.push(membershipFilter);
        } else {
          filter.$and = [membershipFilter];
        }

        console.log("Membership filter applied:", normalizedMembership);
      } else {
        console.log(
          "Invalid membership tier:",
          normalizedMembership,
          "- skipping filter"
        );
      }
    }

    // Note: countries field was removed, so we skip country filter from Game model

    console.log("=== FILTER ANALYSIS ===");
    console.log("Query Params Used in Filter:", {
      uiSection: uiSection || "NOT PROVIDED",
      ageGroup: ageGroup || "NOT PROVIDED",
      gender: gender || "NOT PROVIDED",
      tier: tier || "NOT PROVIDED",
      membership: membership || "NOT PROVIDED",
    });
    console.log("User Profile (Actual):", {
      gender: userProfile.gender,
      age: userProfile.age,
      country: userProfile.country,
    });
    console.log("User Login Method:", {
      provider: user.social?.provider || "local",
      hasGoogleId: !!user.social?.googleId,
      isGoogleUser: isGoogleUser,
    });
    console.log("⚠️ MISMATCH CHECK:");
    if (gender && gender !== userProfile.gender) {
      console.log(
        `  ⚠️ Gender mismatch: Query="${gender}" vs User="${userProfile.gender}"`
      );
    }
    if (ageGroup) {
      const [minAge, maxAge] = ageGroup.split("-").map(Number);
      if (userProfile.age < minAge || userProfile.age > maxAge) {
        console.log(
          `  ⚠️ Age mismatch: Query="${ageGroup}" vs User age="${userProfile.age}"`
        );
      }
    }
    console.log("Database Filter:", JSON.stringify(filter, null, 2));
    console.log("User Profile:", JSON.stringify(userProfile, null, 2));
    console.log(
      "Matching Display Rule:",
      matchingRule
        ? {
            ruleId: matchingRule._id,
            ruleName: matchingRule.ruleName,
            maxGames: maxGamesFromRule,
          }
        : "None"
    );

    // Check what games exist in database with different filters
    console.log("=== DATABASE GAME COUNTS ===");
    const totalActiveGames = await Game.countDocuments({ isActive: true });
    console.log(`Total active games: ${totalActiveGames}`);

    if (uiSection) {
      const uiSectionCount = await Game.countDocuments({
        isActive: true,
        uiSection,
      });
      console.log(`Games with uiSection="${uiSection}": ${uiSectionCount}`);
    }
    if (ageGroup) {
      const ageGroupCount = await Game.countDocuments({
        isActive: true,
        ageGroup,
      });
      console.log(`Games with ageGroup="${ageGroup}": ${ageGroupCount}`);
    }
    if (gender) {
      const genderCount = await Game.countDocuments({ isActive: true, gender });
      console.log(`Games with gender="${gender}": ${genderCount}`);
    }

    // Additional debugging for Google users
    if (isGoogleUser) {
      console.log("=== GOOGLE USER DEBUGGING ===");

      // Check games with null/undefined ageGroup
      const gamesWithNullAge = await Game.countDocuments({
        isActive: true,
        uiSection: uiSection || undefined,
        $or: [
          { ageGroup: null },
          { ageGroup: { $exists: false } },
          { ageGroup: "" },
        ],
      });
      console.log(
        `Games with NULL/empty ageGroup (uiSection="${
          uiSection || "any"
        }"): ${gamesWithNullAge}`
      );

      // Check games with "all" gender
      const gamesWithAllGender = await Game.countDocuments({
        isActive: true,
        uiSection: uiSection || undefined,
        gender: "all",
      });
      console.log(
        `Games with gender="all" (uiSection="${
          uiSection || "any"
        }"): ${gamesWithAllGender}`
      );

      // Check games matching the exact filter that will be used
      const filterForGoogle = { isActive: true };
      if (uiSection) filterForGoogle.uiSection = uiSection;
      const gamesMatchingFilter = await Game.find(filterForGoogle).lean();
      console.log(
        `Games matching Google user filter (isActive: true${
          uiSection ? `, uiSection: "${uiSection}"` : ""
        }): ${gamesMatchingFilter.length}`
      );

      if (gamesMatchingFilter.length > 0) {
        console.log(
          "All games matching filter:",
          gamesMatchingFilter.map((g) => ({
            _id: g._id,
            title: g.title,
            gameId: g.gameId,
            isActive: g.isActive,
            uiSection: g.uiSection,
            ageGroup: g.ageGroup,
            gender: g.gender,
          }))
        );
      }

      // Check all active games with this uiSection (if provided)
      if (uiSection) {
        const allUiSectionGames = await Game.find({
          isActive: true,
          uiSection: uiSection,
        }).lean();
        console.log(
          `All active games with uiSection="${uiSection}": ${allUiSectionGames.length}`
        );
        if (allUiSectionGames.length > 0) {
          console.log(
            "Games breakdown:",
            allUiSectionGames.map((g) => ({
              title: g.title,
              ageGroup: g.ageGroup || "NULL",
              gender: g.gender || "NULL",
            }))
          );
        }
      }

      console.log("=== END GOOGLE USER DEBUGGING ===");
    }

    // Check games matching user profile instead
    const userProfileFilter = { isActive: true };
    if (uiSection) userProfileFilter.uiSection = uiSection;
    // Use user's actual gender if query param doesn't match
    if (userProfile.gender && userProfile.gender !== "other") {
      userProfileFilter.gender = userProfile.gender;
    }
    // Try to match ageGroup based on user's age
    if (userProfile.age) {
      let matchedAgeGroup = null;
      if (userProfile.age >= 13 && userProfile.age <= 17)
        matchedAgeGroup = "13-17";
      else if (userProfile.age >= 18 && userProfile.age <= 24)
        matchedAgeGroup = "18-24";
      else if (userProfile.age >= 25 && userProfile.age <= 34)
        matchedAgeGroup = "25-34";
      else if (userProfile.age >= 35 && userProfile.age <= 44)
        matchedAgeGroup = "35-44";
      else if (userProfile.age >= 45 && userProfile.age <= 54)
        matchedAgeGroup = "45-54";
      else if (userProfile.age >= 55 && userProfile.age <= 64)
        matchedAgeGroup = "55-64";
      else if (userProfile.age >= 65) matchedAgeGroup = "65+";

      if (matchedAgeGroup) {
        userProfileFilter.ageGroup = matchedAgeGroup;
        console.log(
          `Matched ageGroup="${matchedAgeGroup}" for user age=${userProfile.age}`
        );
      }
    }

    const userProfileGamesCount = await Game.countDocuments(userProfileFilter);
    console.log(`Games matching user profile filter: ${userProfileGamesCount}`);
    console.log("=== END FILTER ANALYSIS ===");

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

    // Get all matching games first (before pagination)
    console.log("Querying games from database with filter...");
    console.log("Final filter being used:", JSON.stringify(filter, null, 2));
    let allGames = await Game.find(filter).sort({ createdAt: -1 }).lean();
    console.log(`✅ Found ${allGames.length} games matching filter`);

    if (userProfileGamesCount > 0 && allGames.length === 0) {
      console.log(
        "⚠️ WARNING: Games exist for user profile but not for query params!"
      );
      console.log(
        "User Profile Filter:",
        JSON.stringify(userProfileFilter, null, 2)
      );
    }

    if (isGoogleUser) {
      console.log("=== GOOGLE USER: GAMES FOUND ===");
      console.log(`Total games found for Google user: ${allGames.length}`);
      if (allGames.length > 0) {
        console.log(
          "All games details:",
          allGames.map((g) => ({
            _id: g._id,
            gameId: g.gameId,
            title: g.title,
            isActive: g.isActive,
            uiSection: g.uiSection,
            gender: g.gender || "NULL",
            ageGroup: g.ageGroup || "NULL",
          }))
        );
      } else {
        console.log("⚠️ WARNING: No games found for Google user!");
        console.log("Filter used:", JSON.stringify(filter, null, 2));
      }
      console.log("=== END GOOGLE USER: GAMES FOUND ===");
    }

    if (allGames.length > 0) {
      console.log(
        "Sample games:",
        allGames.slice(0, 3).map((g) => ({
          _id: g._id,
          gameId: g.gameId,
          title: g.title,
          isActive: g.isActive,
          uiSection: g.uiSection,
          gender: g.gender,
          ageGroup: g.ageGroup,
          rewards: g.rewards,
          xpTier: g.xpTier,
        }))
      );
    } else {
      // If no games found, show what games exist with similar filters
      console.log("=== DEBUGGING: No games found, checking alternatives ===");
      const gamesWithoutGender = await Game.find({
        isActive: true,
        uiSection: uiSection || undefined,
        ageGroup: ageGroup || undefined,
      })
        .limit(5)
        .lean();
      if (gamesWithoutGender.length > 0) {
        console.log(
          `Found ${gamesWithoutGender.length} games without gender filter:`,
          gamesWithoutGender.map((g) => ({
            gameId: g.gameId,
            title: g.title,
            gender: g.gender,
            ageGroup: g.ageGroup,
            uiSection: g.uiSection,
          }))
        );
      }

      const gamesWithUserGender = await Game.find({
        isActive: true,
        gender: userProfile.gender,
        uiSection: uiSection || undefined,
      })
        .limit(5)
        .lean();
      if (gamesWithUserGender.length > 0) {
        console.log(
          `Found ${gamesWithUserGender.length} games with user's gender (${userProfile.gender}):`,
          gamesWithUserGender.map((g) => ({
            gameId: g.gameId,
            title: g.title,
            gender: g.gender,
            ageGroup: g.ageGroup,
            uiSection: g.uiSection,
          }))
        );
      }
    }

    // Apply display rule limit if rule matches AND uiSection is "Swipe"
    // Display rules only apply to Swipe section games for all users
    if (
      maxGamesFromRule &&
      uiSection &&
      uiSection.toLowerCase() === "swipe" &&
      allGames.length > maxGamesFromRule
    ) {
      console.log(
        `Applying display rule limit (Swipe section only): ${allGames.length} -> ${maxGamesFromRule}`
      );
      allGames = allGames.slice(0, maxGamesFromRule);
    } else if (
      maxGamesFromRule &&
      uiSection &&
      uiSection.toLowerCase() !== "swipe"
    ) {
      console.log(
        `Display rule limit NOT applied: uiSection is "${uiSection}" (only applies to Swipe section)`
      );
    }

    // Get user's XP tier from admin configuration (XPTier model)
    console.log("=== FETCHING USER XP TIER FROM ADMIN CONFIG ===");
    const userXp = user.xp?.current || 0;
    console.log("User XP:", userXp);

    // Fetch XP tier from admin configuration
    let userXpTierDoc = null;
    let userXpTier = "junior"; // fallback

    try {
      userXpTierDoc = await XPTier.findByXpValue(userXp);
      if (userXpTierDoc) {
        // Map tier names to lowercase for matching
        const tierNameMap = {
          Junior: "junior",
          Middle: "mid",
          Senior: "senior",
        };
        userXpTier =
          tierNameMap[userXpTierDoc.tierName] ||
          userXpTierDoc.tierName.toLowerCase();
        console.log("✅ User XP Tier from Admin Config:", {
          tierName: userXpTierDoc.tierName,
          tierKey: userXpTier,
          xpMin: userXpTierDoc.xpMin,
          xpMax: userXpTierDoc.xpMax,
          xpRange: userXpTierDoc.xpRange,
        });
      } else {
        console.log("⚠️ No XP tier found in admin config, using fallback");
        // Fallback to old method
        userXpTier = getUserXpTier(user);
      }
    } catch (error) {
      console.error("Error fetching XP tier from admin config:", error);
      // Fallback to old method
      userXpTier = getUserXpTier(user);
      console.log("Using fallback XP tier:", userXpTier);
    }

    // Get user's membership tier
    const userMembershipTier = getUserMembershipTier(user) || "free";
    console.log("User Membership Tier:", userMembershipTier);
    console.log("=== END FETCHING USER TIERS ===");

    // Filter games by XP tier and VIP tier requirements (before pagination)
    console.log("=== APPLYING XP TIER AND MEMBERSHIP TIER VALIDATION ===");
    console.log("User XP Tier:", userXpTier);
    console.log("User Membership Tier:", userMembershipTier);

    const filteredGames = allGames.filter((g) => {
      let passesXpTier = true;
      let passesMembershipTier = true;

      // Check XP tier requirement
      if (g.xpTiers && Array.isArray(g.xpTiers) && g.xpTiers.length > 0) {
        // Game has XP tier requirements - check if user's tier matches
        // Normalize tier names for comparison
        const normalizeTierName = (tier) => {
          const tierMap = {
            Junior: "junior",
            Middle: "mid",
            Senior: "senior",
            junior: "junior",
            mid: "mid",
            senior: "senior",
          };
          return tierMap[tier] || tier.toLowerCase();
        };

        const userTierNormalized = normalizeTierName(userXpTier);
        const gameTiersNormalized = g.xpTiers.map((tier) =>
          normalizeTierName(tier)
        );

        passesXpTier = gameTiersNormalized.includes(userTierNormalized);

        if (!passesXpTier) {
          console.log(
            `❌ Game ${g.gameId} (${
              g.title
            }) filtered out: XP tier mismatch (required: ${g.xpTiers.join(
              ", "
            )}, user: ${userXpTier})`
          );
        } else {
          console.log(
            `✅ Game ${g.gameId} (${
              g.title
            }) passes XP tier check (user: ${userXpTier}, game allows: ${g.xpTiers.join(
              ", "
            )})`
          );
        }
      } else {
        // Game has no XP tier restrictions - available to all tiers
        console.log(
          `✅ Game ${g.gameId} (${g.title}) has no XP tier restrictions - available to all`
        );
      }

      // Check VIP/membership tier requirement
      if (g.tierRestrictions) {
        const minTier = (g.tierRestrictions.minTier || "free").toLowerCase();
        const maxTier = (
          g.tierRestrictions.maxTier || "platinum"
        ).toLowerCase();
        const userTierLower = userMembershipTier.toLowerCase();

        // Tier hierarchy: free < bronze < gold < platinum
        const tierOrder = ["free", "bronze", "gold", "platinum"];
        const userTierIndex = tierOrder.indexOf(userTierLower);
        const minTierIndex = tierOrder.indexOf(minTier);
        const maxTierIndex = tierOrder.indexOf(maxTier);

        // User must have tier >= minTier and <= maxTier
        if (userTierIndex < minTierIndex || userTierIndex > maxTierIndex) {
          passesMembershipTier = false;
          console.log(
            `❌ Game ${g.gameId} (${g.title}) filtered out: Membership tier mismatch (required: ${minTier}-${maxTier}, user: ${userMembershipTier})`
          );
        } else {
          console.log(
            `✅ Game ${g.gameId} (${g.title}) passes membership tier check (user: ${userMembershipTier}, game allows: ${minTier}-${maxTier})`
          );
        }
      } else {
        // Game has no membership tier restrictions - available to all tiers
        console.log(
          `✅ Game ${g.gameId} (${g.title}) has no membership tier restrictions - available to all`
        );
      }

      return passesXpTier && passesMembershipTier;
    });

    console.log(
      `Games after XP/Membership tier filtering: ${filteredGames.length} (from ${allGames.length})`
    );
    console.log("=== END XP TIER AND MEMBERSHIP TIER VALIDATION ===");

    // Update allGames with filtered results
    allGames = filteredGames;

    // Apply pagination
    const total = allGames.length;
    const paginatedGames = allGames.slice(
      (pageNum - 1) * pageSize,
      pageNum * pageSize
    );
    console.log(
      `Pagination: page ${pageNum}, size ${pageSize}, total ${total}, showing ${paginatedGames.length} games`
    );

    if (isGoogleUser) {
      console.log("=== GOOGLE USER: PAGINATION DEBUG ===");
      console.log(`Before pagination: ${allGames.length} games`);
      console.log(`After pagination: ${paginatedGames.length} games`);
      console.log(`Page: ${pageNum}, Page Size: ${pageSize}`);
      console.log(
        `Games being returned:`,
        paginatedGames.map((g) => ({
          title: g.title,
          gameId: g.gameId,
          ageGroup: g.ageGroup || "NULL",
          gender: g.gender || "NULL",
        }))
      );
      console.log("=== END GOOGLE USER: PAGINATION DEBUG ===");
    }

    // Get user's first N games for bonus task eligibility
    const userGames = user.games || [];
    const sortedUserGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    // Get maxGamesWithBonusTasks from WelcomeBonusTimer config
    const bonusRule = await WelcomeBonusTimer.findOne({
      isActive: true,
    }).lean();
    const maxGamesWithBonus = bonusRule?.maxGamesWithBonusTasks || 3;
    const eligibleGameIdsForBonus = sortedUserGames
      .slice(0, maxGamesWithBonus)
      .map((g) => String(g.gameId));

    // Get user-based task progression rule (applies to user, not specific game)
    console.log("=== FETCHING TASK PROGRESSION RULE ===");
    console.log("User Profile for Progression Rule:", {
      xp: userProfile.xp,
      gamesPlayed: userProfile.gamesPlayed,
      membershipTier: userProfile.membershipTier,
      age: userProfile.age,
      gender: userProfile.gender,
      country: userProfile.country,
    });

    const progressionRule = await TaskProgressionRule.findBestMatchForUser(
      userProfile
    );

    if (progressionRule) {
      console.log("✅ Task Progression Rule Found:", {
        ruleName: progressionRule.ruleName,
        firstBatchSize: progressionRule.firstBatchSize,
        nextBatchSize: progressionRule.nextBatchSize,
        maxBatches: progressionRule.maxBatches,
      });
    } else {
      console.log("⚠️ No Task Progression Rule found for user");
      console.log("This means taskProgression will be null in response");
    }
    console.log("=== END FETCHING TASK PROGRESSION RULE ===");

    // Get user's task progression data (Map becomes object with lean())
    const userTaskProgression = user.taskProgression || {};

    // Enrich games with additional information
    const games = await Promise.all(
      paginatedGames.map(async (g) => {
        const gameIdString = String(g._id);

        // Check if game is eligible for bonus tasks
        const isEligibleForBonus = eligibleGameIdsForBonus.some((id) => {
          if (id === gameIdString) return true;
          if (
            mongoose.Types.ObjectId.isValid(id) &&
            mongoose.Types.ObjectId.isValid(gameIdString)
          ) {
            return id === gameIdString;
          }
          return false;
        });

        // Get user's progression data for this game (taskProgression is a Map in schema, becomes object with lean)
        const gameProgression = userTaskProgression[gameIdString] || {};
        const completedTasks = gameProgression.completedTasks || 0;
        const thresholdReached = gameProgression.thresholdReached || false;
        const rewardTransferred = gameProgression.rewardTransferred || false;

        // Calculate progression status
        let progressionStatus = null;
        if (progressionRule) {
          // Check if first batch is completed (threshold reached)
          const firstBatchCompleted =
            completedTasks >= progressionRule.firstBatchSize;
          const canUnlockNextBatches = firstBatchCompleted && rewardTransferred;

          progressionStatus = {
            hasProgressionRule: true,
            firstBatchSize: progressionRule.firstBatchSize,
            nextBatchSize: progressionRule.nextBatchSize,
            maxBatches: progressionRule.maxBatches,
            completedTasks: completedTasks,
            thresholdReached: thresholdReached, // First batch completed
            rewardTransferred: rewardTransferred,
            canUnlockNextTasks: canUnlockNextBatches,
          };
        }

        return {
          gameId: g.gameId,
          title: g.title,
          description: g.description,
          category: g.category,
          uiSection: g.uiSection,
          gender: g.gender,
          ageGroup: g.ageGroup,
          rewards: g.rewards,
          icon:
            g.metadata?.thumbnail?.url ||
            g.gameDetails?.square_image ||
            g.gameDetails?.image ||
            "",
          images: {
            icon: g.metadata?.images?.icon || g.gameDetails?.square_image || "",
            banner:
              g.metadata?.images?.banner || g.gameDetails?.large_image || "",
          },
          details: g.gameDetails || {},
          besitosRawData: g.besitosRawData || null,
          xpRewardConfig: g.xpRewardConfig || { baseXP: 0, multiplier: 1.0 },
          _id: g._id,
          // User's XP tier
          userXpTier: userXpTier,
          // Bonus task eligibility - check if this game is in user's downloaded games
          bonusTasks: (() => {
            const userGameMatch = sortedUserGames.findIndex((ug) => {
              const ugGameId = String(ug.gameId);
              // Match by _id (MongoDB ID) or gameId (external game ID)
              return (
                ugGameId === gameIdString ||
                ugGameId === String(g._id) ||
                ugGameId === String(g.gameId) ||
                (mongoose.Types.ObjectId.isValid(ugGameId) &&
                  mongoose.Types.ObjectId.isValid(gameIdString) &&
                  ugGameId === gameIdString)
              );
            });

            return {
              eligible: isEligibleForBonus,
              maxGamesWithBonus: maxGamesWithBonus,
              userDownloadOrder: userGameMatch >= 0 ? userGameMatch + 1 : null,
            };
          })(),
          // Task progression rule info
          taskProgression: progressionStatus,
        };
      })
    );

    const uiSections = await Game.distinct("uiSection");

    console.log(`✅ Returning ${games.length} games to client`);
    console.log("Response Summary:", {
      totalGames: total,
      returnedGames: games.length,
      hasDisplayRule: !!matchingRule,
      maxGamesFromRule: maxGamesFromRule,
    });
    console.log("=== GAME DISCOVER END ===");

    res.json({
      success: true,
      data: games,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
      uiSections,
      // User's XP tier (also included in each game object)
      userXpTier: userXpTier,
      // Display rule info
      displayRule: matchingRule
        ? {
            ruleId: matchingRule._id,
            ruleName: matchingRule.ruleName,
            maxGames: maxGamesFromRule,
            appliedMilestones: matchingRule.userMilestones,
          }
        : null,
    });
  } catch (error) {
    console.error("=== ERROR FETCHING DISCOVER GAMES ===");
    console.error("Error:", error);
    console.error("Error Stack:", error.stack);
    console.error("Error Message:", error.message);
    console.error("Query Params:", req.query);
    console.error("User ID:", req.user?.userId);
    console.error("=== END ERROR ===");
    res.status(500).json({
      success: false,
      message: "Failed to fetch games",
      error: error.message,
    });
  }
});

// Get single game by ID (supports both MongoDB _id and gameId string)
router.get("/get-game-by-id/:id", protect, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Try to find by MongoDB _id first
    let game = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      game = await Game.findById(id)
        .select(
          "gameId title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards"
        )
        .lean();
    }

    // If not found by _id, try to find by gameId
    if (!game) {
      game = await Game.findOne({ gameId: id })
        .select(
          "gameId title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards"
        )
        .lean();
    }

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get user's game data if this game is in their downloaded games
    const user = await User.findById(userId).select("games").lean();
    const userGame = user?.games?.find(
      (g) => String(g.gameId) === String(game.gameId)
    );

    // If game is from Besitos, get external details
    if (game.sdkProvider === "besitos") {
      const externalId = game.gameDetails?.id;
      if (!externalId) {
        return res.status(400).json({
          success: false,
          message: "Missing external game id for besitos mapping",
        });
      }

      // Try to get from Besitos
      try {
        req.query.offer_id = externalId;
        const captureResponse = () => {
          let payload = null;
          let statusCode = 200;
          return {
            res: {
              status(code) {
                statusCode = code;
                return this;
              },
              json(obj) {
                payload = obj;
                return this;
              },
            },
            get() {
              return { payload, statusCode };
            },
          };
        };
        const cap = captureResponse();
        await besitosController.getOffers(req, cap.res);
        const result = cap.get();

        if (
          result.statusCode === 200 &&
          result.payload?.success &&
          result.payload?.data?.length > 0
        ) {
          const besitosGame = result.payload.data[0];
          return res.json({
            success: true,
            data: {
              ...game,
              gameDetails: {
                ...game.gameDetails,
                ...besitosGame,
              },
              userGame: userGame || null,
              isDownloaded: !!userGame,
            },
          });
        }
      } catch (besitosError) {
        console.error("Error fetching from Besitos:", besitosError);
        // Fall through to return game data without Besitos details
      }
    }

    res.json({
      success: true,
      data: {
        ...game,
        userGame: userGame || null,
        isDownloaded: !!userGame,
      },
    });
  } catch (error) {
    console.error("Error while fetching game:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while fetching the game.",
      error: error.message,
    });
  }
});

// Get single downloaded game by gameId (from user's downloaded games)
router.get("/downloaded/:gameId", protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId).select("games");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find game in user's downloaded games
    const userGame = user.games?.find(
      (g) => String(g.gameId) === String(gameId)
    );
    if (!userGame) {
      return res.status(404).json({
        success: false,
        message: "Game not found in your downloaded games",
      });
    }

    // Get full game metadata
    const game = await Game.findOne({ gameId })
      .select(
        "title description category uiSection gender ageGroup metadata gameDetails sdkProvider rewards"
      )
      .lean();

    // Enrich with game metadata
    const enrichedGame = {
      gameId: userGame.gameId,
      offerId: userGame.offerId || null,
      installedAt: userGame.installedAt || userGame.date || null,
      status: userGame.status || "installed",
      completed: userGame.completed || false,
      progress: userGame.progress || 0,
      score: userGame.score || 0,
      playCount: userGame.playCount || 0,
      lastPlayed: userGame.lastPlayed || null,
      level: userGame.level || 1,
      firstPlayed: userGame.firstPlayed || null,
      completedAt: userGame.completedAt || null,
      // Game metadata
      title: game?.title || null,
      description: game?.description || null,
      category: game?.category || null,
      uiSection: game?.uiSection || null,
      gender: game?.gender || null,
      ageGroup: game?.ageGroup || null,
      rewards: game?.rewards || { coins: 0, xp: 0 },
      icon:
        game?.metadata?.thumbnail?.url ||
        game?.gameDetails?.square_image ||
        game?.gameDetails?.image ||
        "",
      gameDetails: game?.gameDetails || null,
      sdkProvider: game?.sdkProvider || null,
    };

    res.json({
      success: true,
      data: enrichedGame,
    });
  } catch (error) {
    console.error("Error getting downloaded game:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get downloaded game",
      error: error.message,
    });
  }
});

// ==================== GAME TASKS ENDPOINTS ====================

// Get normal tasks for a game (excluding bonus tasks)
router.get("/:gameId/tasks", protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get user data to check if game is in first 3 (for bonus tasks exclusion)
    const user = await User.findById(userId)
      .select("games tasks taskProgression xp vip")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userGames = user?.games || [];
    const sortedGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    // Get maxGamesWithBonusTasks from configuration (need to fetch rule first)
    const bonusRule = await WelcomeBonusTimer.findOne({
      isActive: true,
    }).lean();
    const maxGames = bonusRule?.maxGamesWithBonusTasks || 3;
    const eligibleGameIds = sortedGames
      .slice(0, maxGames)
      .map((g) => String(g.gameId));
    const currentGameIdString = String(gameId);
    const isInFirstThree = eligibleGameIds.some((id) => {
      if (id === currentGameIdString) return true;
      if (
        mongoose.Types.ObjectId.isValid(id) &&
        mongoose.Types.ObjectId.isValid(currentGameIdString)
      ) {
        return id === currentGameIdString;
      }
      return false;
    });

    // Get global bonus tasks configuration (only if game is in first 3)
    const rule = isInFirstThree
      ? await WelcomeBonusTimer.findOne({
          isActive: true,
          "gameBonusTasks.bonusTasks.0": { $exists: true },
          "gameBonusTasks.isEnabled": true,
        })
      : null;

    let query = { gameId: gameId, isActive: true };

    // Exclude bonus tasks from normal task list (only if game is in first 3)
    if (rule && isInFirstThree) {
      // Get the first enabled gameBonusTasks config as global template
      const gameBonusConfig = rule.gameBonusTasks.find(
        (config) =>
          config.isEnabled && config.bonusTasks && config.bonusTasks.length > 0
      );

      if (gameBonusConfig && gameBonusConfig.bonusTasks.length > 0) {
        const bonusTaskIds = gameBonusConfig.bonusTasks.map((bt) => bt.taskId);
        query._id = { $nin: bonusTaskIds };
      }
    }
    const completedTaskIds =
      user?.tasks?.filter((t) => t.completed).map((t) => t.taskId) || [];

    // Build user profile for progression rule matching
    const gamesDownloaded =
      user.games?.filter((g) => {
        return (
          g.installedAt || g.status === "installed" || (g.date && !g.completed)
        );
      }).length || 0;

    let membershipTier = "free";
    if (user.vip?.tier) {
      membershipTier = user.vip.tier;
    } else if (user.vip?.level && user.vip.level !== "free") {
      membershipTier = user.vip.level;
    }

    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get user-based progression rule (applies to user, not specific game)
    const progressionRule = await TaskProgressionRule.findBestMatchForUser(
      userProfile
    );

    // Get user's progression data for this game
    const gameIdString = gameId.toString();
    let progression = user?.taskProgression?.get?.(gameIdString);

    // If progression doesn't exist but rule exists, initialize from existing completed tasks
    if (!progression && progressionRule) {
      // Count all existing completed tasks for this game
      const allGameTasks = await GameTask.find({
        gameId: gameId,
        isActive: true,
      })
        .select("_id")
        .lean();
      const allGameTaskIds = allGameTasks.map((t) => t._id.toString());
      const completedGameTasks =
        user?.tasks?.filter(
          (t) => t.completed && allGameTaskIds.includes(t.taskId)
        ) || [];

      progression = {
        completedTasks: completedGameTasks.length,
        thresholdReached: false,
        rewardTransferred: false,
        coinBoxBalance: 0,
      };
    }

    // Fallback to default if still no progression
    if (!progression) {
      progression = {
        completedTasks: 0,
        thresholdReached: false,
        rewardTransferred: false,
        coinBoxBalance: 0,
      };
    }

    const completedTasksCount = progression.completedTasks || 0;
    const thresholdReached = progression.thresholdReached || false;
    const rewardTransferred = progression.rewardTransferred || false;

    // Fetch normal tasks
    const tasks = await GameTask.find(query)
      .sort({ order: 1, createdAt: 1 })
      .lean();

    // Get game's XP reward config for stepwise calculation
    const gameDoc = await Game.findById(gameId).select("xpRewardConfig").lean();
    const baseXP = gameDoc?.xpRewardConfig?.baseXP || 0;
    const multiplier = gameDoc?.xpRewardConfig?.multiplier || 1.0;
    const hasStepwiseConfig = baseXP > 0;

    // Format tasks with completion status and unlock status
    const formattedTasks = tasks.map((task, index) => {
      const taskNumber = index + 1; // 1-based task number
      // Calculate stepwise XP if configured
      let calculatedRewardValue = task.rewardValue || 0;
      if (task.rewardType === "xp" && hasStepwiseConfig) {
        calculatedRewardValue = calculateStepwiseXP(
          taskNumber,
          baseXP,
          multiplier
        );
      }
      const taskIdString = task._id.toString();
      const isCompleted = completedTaskIds.includes(taskIdString);

      // Determine unlock status
      let isUnlocked = true;
      let unlockReason = "";

      // If task is already completed, it's always unlocked
      if (isCompleted) {
        isUnlocked = true;
        unlockReason = "Completed";
      } else if (progressionRule) {
        // Use the new batch-based canUnlockTask method
        const taskOrder = index + 1; // 1-based task order
        const unlockCheck = progressionRule.canUnlockTask(
          completedTasksCount,
          taskOrder,
          rewardTransferred
        );
        isUnlocked = unlockCheck.canUnlock;
        unlockReason = unlockCheck.reason || "Unlocked";
      } else {
        // No progression rule - simple sequential unlock
        if (index === 0) {
          isUnlocked = true;
          unlockReason = "First task";
        } else {
          // Check if previous task is completed
          const previousTask = tasks[index - 1];
          const previousTaskCompleted = completedTaskIds.includes(
            previousTask._id.toString()
          );
          if (!previousTaskCompleted) {
            isUnlocked = false;
            unlockReason = "Complete previous task first";
          } else {
            isUnlocked = true;
            unlockReason = "Unlocked";
          }
        }
      }

      return {
        _id: task._id,
        name: task.name,
        description: task.description,
        completionRule: task.completionRule,
        rewardType: task.rewardType,
        rewardValue: calculatedRewardValue, // Use calculated value
        baseRewardValue: task.rewardValue, // Original value from task
        order: task.order,
        taskNumber: taskNumber,
        isCompleted: isCompleted,
        isBonusTask: false,
        isUnlocked: isUnlocked,
        unlockReason: unlockReason,
        stepwiseApplied: task.rewardType === "xp" && hasStepwiseConfig,
      };
    });

    res.json({
      success: true,
      data: {
        tasks: formattedTasks,
        totalTasks: formattedTasks.length,
      },
    });
  } catch (error) {
    console.error("Error getting game tasks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get game tasks",
      error: error.message,
    });
  }
});

// Get bonus tasks for a game with unlock status
router.get("/:gameId/bonus-tasks", protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get user data
    const user = await User.findById(userId).select("games tasks").lean();
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user's game data
    const userGame = user.games?.find((g) => {
      // Try to match by MongoDB _id if gameId is ObjectId
      if (mongoose.Types.ObjectId.isValid(gameId)) {
        return g.gameId === gameId || String(g.gameId) === String(gameId);
      }
      return String(g.gameId) === String(gameId);
    });

    if (!userGame) {
      return res.status(404).json({
        success: false,
        message: "Game not found in user's games",
      });
    }

    // NEW: Check if this game is in user's first 3 downloaded games
    const userGames = user.games || [];
    // Sort by installedAt/date (oldest first) to get download order
    const sortedGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    // Get global bonus tasks configuration first to get maxGamesWithBonusTasks
    const rule = await WelcomeBonusTimer.findOne({
      isActive: true,
      "gameBonusTasks.bonusTasks.0": { $exists: true }, // Has at least one bonus task
      "gameBonusTasks.isEnabled": true,
    })
      .populate(
        "gameBonusTasks.bonusTasks.taskId",
        "name description completionRule rewardType rewardValue"
      )
      .lean();

    // Get maxGamesWithBonusTasks from configuration
    const maxGames = rule?.maxGamesWithBonusTasks || 3;
    const eligibleGames = sortedGames.slice(0, maxGames);
    const eligibleGameIds = eligibleGames.map((g) => String(g.gameId));

    // Check if current game is in eligible games
    const currentGameIdString = String(gameId);
    const isInFirstThree = eligibleGameIds.some((id) => {
      // Handle both string and ObjectId comparisons
      if (id === currentGameIdString) return true;
      if (
        mongoose.Types.ObjectId.isValid(id) &&
        mongoose.Types.ObjectId.isValid(currentGameIdString)
      ) {
        return id === currentGameIdString;
      }
      return false;
    });

    if (!isInFirstThree) {
      // Game is not in eligible games - no bonus tasks
      return res.json({
        success: true,
        data: {
          hasBonusTasks: false,
          bonusTasks: [],
          message: `Bonus tasks are only available for your first ${maxGames} downloaded games`,
          isEligible: false,
          maxGamesWithBonusTasks: maxGames,
          userDownloadOrder: sortedGames.map((g, idx) => ({
            gameId: String(g.gameId),
            position: idx + 1,
            installedAt: g.installedAt || g.date || g.firstPlayed,
          })),
        },
      });
    }

    if (!rule || !rule.gameBonusTasks || rule.gameBonusTasks.length === 0) {
      return res.json({
        success: true,
        data: {
          hasBonusTasks: false,
          bonusTasks: [],
          message: "No bonus tasks configured",
        },
      });
    }

    // Get maxBonusTasksPerGame from configuration
    const maxTasksPerGame = rule?.maxBonusTasksPerGame || 3;

    // Get the first enabled gameBonusTasks config as global template
    const gameBonusConfig = rule.gameBonusTasks.find(
      (config) =>
        config.isEnabled && config.bonusTasks && config.bonusTasks.length > 0
    );

    if (
      !gameBonusConfig ||
      !gameBonusConfig.bonusTasks ||
      gameBonusConfig.bonusTasks.length === 0
    ) {
      return res.json({
        success: true,
        data: {
          hasBonusTasks: false,
          bonusTasks: [],
          message: "No bonus tasks configured",
        },
      });
    }

    // Get user's completed tasks and unlock timestamps
    const userTasks = user.tasks || [];
    const completedTaskIds = userTasks
      .filter((t) => t.completed)
      .map((t) => t.taskId.toString());

    // Get bonus task unlock timestamps from user's tasks
    const bonusTaskUnlocks = {};
    userTasks.forEach((t) => {
      if (t.isBonusTask && t.unlockedAt) {
        bonusTaskUnlocks[t.taskId] = t.unlockedAt;
      }
    });

    // Calculate user's internal events (this should be tracked separately - using playCount as placeholder)
    // TODO: Replace with actual internal events tracking
    const userInternalEvents = userGame.playCount || 0;
    const minimumEventThreshold = gameBonusConfig.minimumEventThreshold;
    const completionDeadlineHours =
      gameBonusConfig.completionDeadlineHours || 24;

    // Get game download/install time
    const gameDownloadTime =
      userGame.installedAt ||
      userGame.firstPlayed ||
      userGame.date ||
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
    // If Task 1 hasn't unlocked yet, we'll set it when Task 1 unlocks
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
        const userTask = userTasks.find((t) => t.taskId === taskIdString);
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
          const previousTaskCompleted = previousUserTask?.completed || false;
          const eventThresholdMet = userInternalEvents >= minimumEventThreshold;

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

        // Calculate shared completion deadline: All tasks share the same deadline
        // Deadline starts from when Task 1 unlocks (sharedDeadlineStartTime)
        const completionDeadline = sharedDeadlineStartTime
          ? new Date(
              sharedDeadlineStartTime.getTime() +
                completionDeadlineHours * 60 * 60 * 1000
            )
          : null;
        const now = new Date();
        const isExpired = completionDeadline ? now > completionDeadline : false;
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

    // Save unlock timestamps for newly unlocked tasks
    const userDoc = await User.findById(userId);
    let needsSave = false;

    formattedBonusTasks.forEach((bt) => {
      if (bt.isUnlocked && bt.unlockTime && !bonusTaskUnlocks[bt.taskId]) {
        // Newly unlocked - save the unlock timestamp
        const existingTask = userDoc.tasks.find((t) => t.taskId === bt.taskId);
        if (existingTask) {
          existingTask.unlockedAt = bt.unlockTime;
          existingTask.isBonusTask = true;
          existingTask.gameId = gameId;
        } else {
          if (!userDoc.tasks) {
            userDoc.tasks = [];
          }
          userDoc.tasks.push({
            taskId: bt.taskId,
            type: "bonus",
            completed: false,
            isBonusTask: true,
            gameId: gameId,
            unlockedAt: bt.unlockTime,
          });
        }
        needsSave = true;
      }
    });

    if (needsSave) {
      await userDoc.save();
    }

    res.json({
      success: true,
      data: {
        hasBonusTasks: true,
        gameId: gameId,
        minimumEventThreshold: minimumEventThreshold,
        completionDeadlineHours: completionDeadlineHours,
        taskLogic: "sequential",
        bonusTasks: formattedBonusTasks,
        userProgress: {
          internalEvents: userInternalEvents,
          eventThresholdMet: userInternalEvents >= minimumEventThreshold,
          gameDownloadTime: gameDownloadTime,
        },
      },
    });
  } catch (error) {
    console.error("Error getting bonus tasks:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get bonus tasks",
      error: error.message,
    });
  }
});

// Complete a game task (normal or bonus)
router.post("/:gameId/tasks/:taskId/complete", protect, async (req, res) => {
  try {
    const { gameId, taskId } = req.params;
    const userId = req.user.userId;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Verify task exists and belongs to game
    const task = await GameTask.findOne({
      _id: taskId,
      gameId: gameId,
      isActive: true,
    });
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found or inactive",
      });
    }

    // Get all tasks for this game to determine task number for stepwise XP calculation
    const allTasks = await GameTask.find({ gameId: gameId, isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();

    const taskIndex = allTasks.findIndex(
      (t) => t._id.toString() === taskId.toString()
    );
    const taskNumber = taskIndex + 1; // 1-based task number

    // Calculate stepwise XP if game has XP reward config
    let calculatedXP = task.rewardValue || 0;
    if (
      task.rewardType === "xp" &&
      game.xpRewardConfig &&
      game.xpRewardConfig.baseXP > 0
    ) {
      calculatedXP = calculateStepwiseXP(
        taskNumber,
        game.xpRewardConfig.baseXP,
        game.xpRewardConfig.multiplier || 1.0
      );
    }

    // Get user data
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if task is already completed
    const existingTask = user.tasks?.find(
      (t) => t.taskId === taskId.toString()
    );
    if (existingTask && existingTask.completed) {
      return res.status(400).json({
        success: false,
        message: "Task already completed",
      });
    }

    // Build user profile for progression rule matching
    const gamesDownloaded =
      user.games?.filter((g) => {
        return (
          g.installedAt || g.status === "installed" || (g.date && !g.completed)
        );
      }).length || 0;

    let membershipTier = "free";
    if (user.vip?.tier) {
      membershipTier = user.vip.tier;
    } else if (user.vip?.level && user.vip.level !== "free") {
      membershipTier = user.vip.level;
    }

    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get user-based progression rule (applies to user, not specific game)
    const progressionRule = await TaskProgressionRule.findBestMatchForUser(
      userProfile
    );

    // Check if task is unlocked before allowing completion
    if (progressionRule) {
      const gameIdString = gameId.toString();
      const progression = user.taskProgression?.get(gameIdString) || {
        completedTasks: 0,
        thresholdReached: false,
        rewardTransferred: false,
        coinBoxBalance: 0,
      };

      const completedTasksCount = progression.completedTasks || 0;
      const rewardTransferred = progression.rewardTransferred || false;

      // Check if this is a post-threshold task with tier requirements
      const postThresholdTask = progressionRule.postThresholdTasks.find(
        (pt) => pt.taskId.toString() === taskId.toString() && pt.isEnabled
      );

      if (postThresholdTask) {
        // Post-threshold task - check all unlock conditions
        const unlockCheck = progressionRule.canUnlockTask(
          user,
          taskId.toString(),
          completedTasksCount,
          rewardTransferred
        );

        if (!unlockCheck.canUnlock) {
          return res.status(403).json({
            success: false,
            message: unlockCheck.reason || "Task is locked",
            unlockReason: unlockCheck.reason,
          });
        }
      } else {
        // Regular task - check sequential unlock
        // Get all tasks for this game to check previous tasks
        const allTasks = await GameTask.find({ gameId: gameId, isActive: true })
          .sort({ order: 1, createdAt: 1 })
          .lean();

        const taskIndex = allTasks.findIndex(
          (t) => t._id.toString() === taskId.toString()
        );
        if (taskIndex > 0) {
          // Check if all previous tasks are completed
          const completedTaskIds =
            user.tasks?.filter((t) => t.completed).map((t) => t.taskId) || [];
          for (let i = 0; i < taskIndex; i++) {
            const prevTaskId = allTasks[i]._id.toString();
            if (!completedTaskIds.includes(prevTaskId)) {
              return res.status(403).json({
                success: false,
                message: "Complete all previous tasks first",
                unlockReason: "Complete all previous tasks first",
              });
            }
          }

          // Use the new batch-based canUnlockTask method
          const taskOrder = taskIndex + 1; // 1-based task order
          const unlockCheck = progressionRule.canUnlockTask(
            completedTasksCount,
            taskOrder,
            rewardTransferred
          );

          if (!unlockCheck.canUnlock) {
            return res.status(403).json({
              success: false,
              message: unlockCheck.reason || "Task is locked",
              unlockReason: unlockCheck.reason || "Task is locked",
            });
          }
        }
      }
    }

    // Get user's progression data for this game
    const gameIdString = gameId.toString();
    if (!user.taskProgression) {
      user.taskProgression = new Map();
    }
    const progression = user.taskProgression.get(gameIdString) || {
      completedTasks: 0,
      thresholdReached: false,
      rewardTransferred: false,
      coinBoxBalance: 0,
    };

    // Check if this game is in user's first 3 downloaded games for bonus tasks
    const userGames = user.games || [];
    const sortedGames = [...userGames].sort((a, b) => {
      const dateA = new Date(a.installedAt || a.date || a.firstPlayed || 0);
      const dateB = new Date(b.installedAt || b.date || b.firstPlayed || 0);
      return dateA - dateB; // Oldest first
    });

    // Get maxGamesWithBonusTasks from configuration
    const bonusRule = await WelcomeBonusTimer.findOne({
      isActive: true,
    }).lean();
    const maxGames = bonusRule?.maxGamesWithBonusTasks || 3;
    const eligibleGameIds = sortedGames
      .slice(0, maxGames)
      .map((g) => String(g.gameId));
    const currentGameIdString = String(gameId);
    const isInFirstThree = eligibleGameIds.some((id) => {
      if (id === currentGameIdString) return true;
      if (
        mongoose.Types.ObjectId.isValid(id) &&
        mongoose.Types.ObjectId.isValid(currentGameIdString)
      ) {
        return id === currentGameIdString;
      }
      return false;
    });

    // Get global bonus tasks configuration (only if game is in first 3)
    const rule = isInFirstThree
      ? await WelcomeBonusTimer.findOne({
          isActive: true,
          "gameBonusTasks.bonusTasks.0": { $exists: true },
          "gameBonusTasks.isEnabled": true,
        })
          .populate("gameBonusTasks.bonusTasks.taskId")
          .lean()
      : null;

    let isBonusTask = false;
    let bonusTaskOrder = null;
    let nextBonusTaskUnlocked = false;
    let nextBonusTaskId = null;

    if (rule && isInFirstThree) {
      // Get the first enabled gameBonusTasks config as global template
      const gameBonusConfig = rule.gameBonusTasks.find(
        (config) =>
          config.isEnabled && config.bonusTasks && config.bonusTasks.length > 0
      );

      if (gameBonusConfig) {
        const bonusTask = gameBonusConfig.bonusTasks.find(
          (bt) => (bt.taskId._id || bt.taskId).toString() === taskId.toString()
        );

        if (bonusTask) {
          isBonusTask = true;
          bonusTaskOrder = bonusTask.order;

          // Check if next bonus task should unlock
          const maxTasks = bonusRule?.maxBonusTasksPerGame || 3;
          if (bonusTaskOrder < maxTasks) {
            const nextBonusTask = gameBonusConfig.bonusTasks.find(
              (bt) => bt.order === bonusTaskOrder + 1
            );

            if (nextBonusTask) {
              // Get user's game data for event threshold check
              const userGame = user.games?.find((g) => {
                if (mongoose.Types.ObjectId.isValid(gameId)) {
                  return (
                    g.gameId === gameId || String(g.gameId) === String(gameId)
                  );
                }
                return String(g.gameId) === String(gameId);
              });

              const userInternalEvents = userGame?.playCount || 0;
              const minimumEventThreshold =
                gameBonusConfig.minimumEventThreshold;
              const eventThresholdMet =
                userInternalEvents >= minimumEventThreshold;

              // Next task unlocks if event threshold is met
              if (eventThresholdMet) {
                nextBonusTaskUnlocked = true;
                nextBonusTaskId = (
                  nextBonusTask.taskId._id || nextBonusTask.taskId
                ).toString();

                // Actually unlock the next bonus task by saving unlock timestamp
                const nextTaskIdString = nextBonusTaskId;
                const existingNextTask = user.tasks?.find(
                  (t) => t.taskId === nextTaskIdString
                );
                const unlockTime = new Date();

                if (existingNextTask) {
                  if (!existingNextTask.unlockedAt) {
                    existingNextTask.unlockedAt = unlockTime;
                    existingNextTask.isBonusTask = true;
                    existingNextTask.gameId = gameId;
                  }
                } else {
                  if (!user.tasks) {
                    user.tasks = [];
                  }
                  user.tasks.push({
                    taskId: nextTaskIdString,
                    type: "bonus",
                    completed: false,
                    isBonusTask: true,
                    gameId: gameId,
                    unlockedAt: unlockTime,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Mark task as completed in user's tasks array
    if (existingTask) {
      existingTask.completed = true;
      existingTask.completedAt = new Date();
      existingTask.date = new Date();
      if (isBonusTask) {
        existingTask.isBonusTask = true;
        existingTask.gameId = gameId;
      }
    } else {
      if (!user.tasks) {
        user.tasks = [];
      }
      user.tasks.push({
        taskId: taskId.toString(),
        type: isBonusTask ? "bonus" : "normal",
        completed: true,
        completedAt: new Date(),
        xpReward:
          task.rewardType === "xp" ? calculatedXP : task.rewardValue || 0,
        date: new Date(),
        isBonusTask: isBonusTask,
        gameId: gameId,
      });
    }

    // Handle Task Progression Rules and Coin Box
    // Note: progressionRule already declared at line 1011
    let coinBoxAccumulated = false;
    let thresholdReached = false;

    if (progressionRule && !isBonusTask) {
      // Initialize task progression if needed
      if (!user.taskProgression) {
        user.taskProgression = new Map();
      }

      const gameIdString = gameId.toString();
      let progression = user.taskProgression.get(gameIdString);

      // If progression doesn't exist, initialize it
      if (!progression) {
        // Count all existing completed tasks for this game to initialize properly
        // This handles cases where a rule is added after tasks are already completed
        const allGameTasks = await GameTask.find({
          gameId: gameId,
          isActive: true,
        })
          .select("_id")
          .lean();
        const allGameTaskIds = allGameTasks.map((t) => t._id.toString());
        const completedGameTasks =
          user.tasks?.filter(
            (t) => t.completed && allGameTaskIds.includes(t.taskId)
          ) || [];

        progression = {
          completedTasks: completedGameTasks.length,
          thresholdReached: false,
          rewardTransferred: false,
          coinBoxBalance: 0,
          coinBoxTransferredAt: null,
        };
      }

      // Increment completed tasks count
      progression.completedTasks = (progression.completedTasks || 0) + 1;

      // Check if first batch (threshold) is reached
      if (progression.completedTasks >= progressionRule.firstBatchSize) {
        progression.thresholdReached = true;
        thresholdReached = true;
      }

      // If threshold not reached or reward not transferred, accumulate in coin box
      if (!progression.thresholdReached || !progression.rewardTransferred) {
        if (task.rewardType === "coins") {
          progression.coinBoxBalance =
            (progression.coinBoxBalance || 0) + (task.rewardValue || 0);
          coinBoxAccumulated = true;
        }
      }

      // Save progression
      user.taskProgression.set(gameIdString, progression);
    }

    // Award rewards (to wallet if not in coin box, XP always to wallet)
    // Use calculated XP if stepwise multiplier is configured, otherwise use task.rewardValue
    if (task.rewardType === "xp") {
      user.xp.current = (user.xp.current || 0) + calculatedXP;
      user.xp.total = (user.xp.total || 0) + calculatedXP;

      // Update task record with calculated XP
      if (existingTask) {
        existingTask.xpReward = calculatedXP;
      } else {
        const newTask = user.tasks[user.tasks.length - 1];
        if (newTask) {
          newTask.xpReward = calculatedXP;
        }
      }
    } else if (task.rewardType === "coins") {
      // Only add to wallet if not accumulating in coin box
      if (!coinBoxAccumulated) {
        user.wallet.balance =
          (user.wallet.balance || 0) + (task.rewardValue || 0);
        user.wallet.lastUpdated = new Date();

        // Create transaction record for revenue tracking
        let gameDoc = null;
        if (gameId) {
          gameDoc = await Game.findById(gameId).select("_id gameId").lean();
        }

        const transaction = new Transaction({
          user: user._id,
          type: "credit",
          amount: task.rewardValue || 0,
          balanceType: "coins",
          description: `Game task completed - ${gameId || "unknown"}`,
          status: "completed",
          referenceId: `GAME-TASK-${
            gameId || "unknown"
          }-${taskId}-${Date.now()}`,
          gameId: gameDoc?.gameId || gameId || null,
          game: gameDoc?._id || gameId || null,
          metadata: {
            gameId: gameDoc?.gameId || gameId || null,
            taskId: taskId,
            taskType: isBonusTask ? "bonus" : "normal",
            rewardType: task.rewardType,
            source: "game_task_completion",
          },
        });

        await transaction.save();
      }
    }

    await user.save();

    // Prepare response
    const response = {
      success: true,
      message: "Task completed successfully",
      data: {
        taskId: taskId,
        taskName: task.name,
        isBonusTask: isBonusTask,
        reward: {
          type: task.rewardType,
          value: task.rewardType === "xp" ? calculatedXP : task.rewardValue,
          baseValue: task.rewardValue, // Original task value
          calculatedValue:
            task.rewardType === "xp" ? calculatedXP : task.rewardValue,
          taskNumber: taskNumber,
          stepwiseApplied:
            task.rewardType === "xp" &&
            game.xpRewardConfig &&
            game.xpRewardConfig.baseXP > 0,
        },
        nextBonusTaskUnlocked: nextBonusTaskUnlocked,
        coinBoxAccumulated: coinBoxAccumulated,
        thresholdReached: thresholdReached,
      },
    };

    // Add coin box info if applicable
    if (progressionRule && !isBonusTask) {
      const gameIdString = gameId.toString();
      const progression = user.taskProgression?.get(gameIdString);
      if (progression) {
        response.data.coinBox = {
          balance: progression.coinBoxBalance || 0,
          thresholdReached: progression.thresholdReached || false,
          rewardTransferred: progression.rewardTransferred || false,
          canTransfer:
            progression.thresholdReached &&
            !progression.rewardTransferred &&
            progression.coinBoxBalance > 0,
        };
      }
    }

    if (nextBonusTaskUnlocked && nextBonusTaskId) {
      response.data.nextBonusTask = {
        taskId: nextBonusTaskId,
        message: "Next bonus task unlocked! You have 24 hours to complete it.",
      };
    } else if (
      isBonusTask &&
      bonusTaskOrder < (bonusRule?.maxBonusTasksPerGame || 3)
    ) {
      // Get user's game data for event threshold info
      const userGame = user.games?.find((g) => {
        if (mongoose.Types.ObjectId.isValid(gameId)) {
          return g.gameId === gameId || String(g.gameId) === String(gameId);
        }
        return String(g.gameId) === String(gameId);
      });

      const userInternalEvents = userGame?.playCount || 0;
      const gameBonusConfig = rule.gameBonusTasks.find(
        (config) =>
          config.gameId.toString() === gameId.toString() && config.isEnabled
      );
      const minimumEventThreshold = gameBonusConfig?.minimumEventThreshold || 0;

      response.data.nextBonusTask = {
        message: `Reach ${minimumEventThreshold} internal events to unlock next bonus task (current: ${userInternalEvents})`,
      };
    }

    res.json(response);
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete task",
      error: error.message,
    });
  }
});

// Get My Coin Box status for a game
router.get("/:gameId/coin-box", protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get user data
    const user = await User.findById(userId).select(
      "taskProgression wallet games xp vip"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build user profile for progression rule matching
    const gamesDownloaded =
      user.games?.filter((g) => {
        return (
          g.installedAt || g.status === "installed" || (g.date && !g.completed)
        );
      }).length || 0;

    let membershipTier = "free";
    if (user.vip?.tier) {
      membershipTier = user.vip.tier;
    } else if (user.vip?.level && user.vip.level !== "free") {
      membershipTier = user.vip.level;
    }

    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get user-based progression rule (applies to user, not specific game)
    const rule = await TaskProgressionRule.findBestMatchForUser(userProfile);

    if (!rule) {
      return res.json({
        success: true,
        data: {
          hasProgressionRule: false,
          coinBoxBalance: 0,
          thresholdReached: false,
          rewardTransferred: false,
          canTransfer: false,
          minimumEventThreshold: null,
          completedTasks: 0,
        },
      });
    }

    // Get user's progression data for this game
    const gameIdString = gameId.toString();
    const progression = user.taskProgression?.get(gameIdString) || {
      completedTasks: 0,
      thresholdReached: false,
      rewardTransferred: false,
      coinBoxBalance: 0,
      coinBoxTransferredAt: null,
    };

    const completedTasks = progression.completedTasks || 0;
    const thresholdReached = progression.thresholdReached || false;
    const rewardTransferred = progression.rewardTransferred || false;
    const coinBoxBalance = progression.coinBoxBalance || 0;

    // Check if user can transfer
    const canTransfer =
      thresholdReached && !rewardTransferred && coinBoxBalance > 0;

    res.json({
      success: true,
      data: {
        hasProgressionRule: true,
        gameId: gameId,
        minimumEventThreshold: rule.minimumEventThreshold,
        completedTasks: completedTasks,
        thresholdReached: thresholdReached,
        rewardTransferred: rewardTransferred,
        coinBoxBalance: coinBoxBalance,
        canTransfer: canTransfer,
        progress: {
          completed: completedTasks,
          required: rule.minimumEventThreshold,
          percentage: Math.min(
            100,
            Math.round((completedTasks / rule.minimumEventThreshold) * 100)
          ),
        },
      },
    });
  } catch (error) {
    console.error("Error getting coin box status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get coin box status",
      error: error.message,
    });
  }
});

// Transfer rewards from My Coin Box to wallet
router.post("/:gameId/coin-box/transfer", protect, async (req, res) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    // Verify game exists
    const game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    // Get user data
    const user = await User.findById(userId).select(
      "taskProgression wallet games xp vip"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Build user profile for progression rule matching
    const gamesDownloaded =
      user.games?.filter((g) => {
        return (
          g.installedAt || g.status === "installed" || (g.date && !g.completed)
        );
      }).length || 0;

    let membershipTier = "free";
    if (user.vip?.tier) {
      membershipTier = user.vip.tier;
    } else if (user.vip?.level && user.vip.level !== "free") {
      membershipTier = user.vip.level;
    }

    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier,
    };

    // Get user-based progression rule (applies to user, not specific game)
    const rule = await TaskProgressionRule.findBestMatchForUser(userProfile);

    if (!rule) {
      return res.status(404).json({
        success: false,
        message: "No progression rule configured for this user profile",
      });
    }

    // Get user's progression data for this game
    const gameIdString = gameId.toString();
    if (!user.taskProgression) {
      user.taskProgression = new Map();
    }

    const progression = user.taskProgression.get(gameIdString) || {
      completedTasks: 0,
      thresholdReached: false,
      rewardTransferred: false,
      coinBoxBalance: 0,
      coinBoxTransferredAt: null,
    };

    // Check if threshold (first batch) is reached
    if (!progression.thresholdReached) {
      return res.status(400).json({
        success: false,
        message: `Threshold not reached. Complete ${
          rule.firstBatchSize
        } tasks first (current: ${progression.completedTasks || 0})`,
        progress: {
          completed: progression.completedTasks || 0,
          required: rule.firstBatchSize,
          remaining: rule.firstBatchSize - (progression.completedTasks || 0),
        },
      });
    }

    // Check if already transferred
    if (progression.rewardTransferred) {
      return res.status(400).json({
        success: false,
        message: "Rewards have already been transferred",
        transferredAt: progression.coinBoxTransferredAt,
      });
    }

    // Check if there's balance to transfer
    const coinBoxBalance = progression.coinBoxBalance || 0;
    if (coinBoxBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: "No rewards to transfer",
      });
    }

    // Transfer to wallet (atomic operation)
    const previousWalletBalance = user.wallet.balance || 0;
    user.wallet.balance = previousWalletBalance + coinBoxBalance;
    user.wallet.lastUpdated = new Date();

    // Update progression
    progression.rewardTransferred = true;
    progression.coinBoxTransferredAt = new Date();
    // Clear coin box balance after transfer
    progression.coinBoxBalance = 0;
    user.taskProgression.set(gameIdString, progression);

    // Create transaction record for revenue tracking
    let gameDoc = null;
    if (gameId) {
      gameDoc = await Game.findById(gameId).select("_id gameId").lean();
    }

    const transaction = new Transaction({
      user: user._id,
      type: "credit",
      amount: coinBoxBalance,
      balanceType: "coins",
      description: `Coin box transfer - ${gameId || "unknown"}`,
      status: "completed",
      referenceId: `COIN-BOX-${gameId || "unknown"}-${Date.now()}`,
      gameId: gameDoc?.gameId || gameId || null,
      game: gameDoc?._id || gameId || null,
      metadata: {
        gameId: gameDoc?.gameId || gameId || null,
        source: "coin_box_transfer",
        coinBoxBalance: coinBoxBalance,
        thresholdReached: progression.thresholdReached,
      },
    });

    await Promise.all([user.save(), transaction.save()]);

    // Log successful transfer
    console.log(
      `[Coin Box Transfer] User ${userId} transferred ${coinBoxBalance} coins from game ${gameId}`,
      {
        userId,
        gameId,
        transferredAmount: coinBoxBalance,
        previousBalance: previousWalletBalance,
        newBalance: user.wallet.balance,
        transactionId: transaction._id,
      }
    );

    res.json({
      success: true,
      message: "Rewards transferred successfully",
      data: {
        transferredAmount: coinBoxBalance,
        previousWalletBalance: previousWalletBalance,
        newWalletBalance: user.wallet.balance,
        transferredAt: progression.coinBoxTransferredAt,
        transactionId: transaction._id,
      },
    });
  } catch (error) {
    console.error("[Coin Box Transfer Error]", {
      userId: req.user?.userId,
      gameId: req.params?.gameId,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      success: false,
      message: "Failed to transfer rewards",
      error:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message,
    });
  }
});

module.exports = router;

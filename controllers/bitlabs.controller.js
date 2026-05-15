/**
 * Bitlabs Controller
 * Handles business logic for Bitlabs API integration
 * @module controllers/bitlabs
 */

const bitlabsService = require("../services/bitlabs.service");
const User = require("../models/User");
const Game = require("../models/Game");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const WelcomeBonusTimer = require("../models/WelcomeBonusTimer");
const ConversionSettings = require("../models/ConversionSettings");
const {
  getUserXpTier,
  getUserMembershipTier,
} = require("../utils/taskProgression");
const mongoose = require("mongoose");
const winston = require("winston");
const { buildSnapshot, getCoinsPerDollar, buildBitlabsSnapshotFromOffer } = require("../utils/snapshotGameOffer");

function getEventPoints(event) {
  return parseInt(event.promised_points || event.points) || 0;
}

function getEventPayout(event) {
  return parseFloat(event.payout) || 0;
}

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
 * @route GET /api/bitlabs/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} category - Category filter
 * @query {string} type - Offer type (game, survey, etc.)
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    // If called from admin endpoint for games, filter for games only
    // The admin endpoint /games/by-sdk/bitlabs expects game offers
    const isGameRequest =
      req.path?.includes("by-sdk") || queryParams.is_game === "true";

    logger.info("Fetching Bitlabs offers", {
      userId: req.user?.id,
      queryParams,
      isGameRequest,
    });

    // Check if Bitlabs is configured
    if (!bitlabsService.isConfigured()) {
      console.warn(
        "⚠️ Bitlabs API is not configured. Missing BITLABS_API_TOKEN or BITLABS_BASE_URL.",
      );
      return res.json({
        success: true,
        data: [],
        total: 0,
        timestamp: new Date().toISOString(),
        warning:
          "Bitlabs API is not configured. Please set BITLABS_API_TOKEN and BITLABS_BASE_URL environment variables.",
      });
    }

    // Admin game list: use Publisher API for full catalog (not user-specific started offers)
    const usePublisherCatalog =
      queryParams.usePublisherCatalog === "true" ||
      queryParams.usePublisherCatalog === true;
    let data;
    if (isGameRequest && usePublisherCatalog) {
      const { usePublisherCatalog: _, ...paramsForPublisher } = queryParams;
      data = await bitlabsService.getPublisherOffers({
        ...paramsForPublisher,
        is_game: "true",
        type: "game",
      });
    } else {
      // Use getGameOffers if this is a game request, otherwise use getOffers
      data = isGameRequest
        ? await bitlabsService.getGameOffers(queryParams)
        : await bitlabsService.getOffers(queryParams);
    }

    // Transform BitLabs game offers to match frontend expectations (similar to Besitos format)
    let transformedData = data?.data || [];
    if (isGameRequest && Array.isArray(transformedData)) {
      transformedData = transformedData.map((offer) => {
        // Use total_points to calculate amount in USD (1000 points ≈ $1)
        const totalPoints = parseFloat(offer.total_points) || 0;

        // Calculate amount in USD from total_points
        // 1000 Bitlabs points ≈ $1 USD
        const amount = totalPoints > 0 ? totalPoints / 1000 : 0;

        // Extract device info from categories (BitLabs uses categories like "iPhone", "iPad", "Android")
        const categories = offer.categories || [];
        const devices = [];
        let devicePlatform = null;

        if (categories.includes("iPhone") || categories.includes("iPad")) {
          devices.push("iphone", "ipad");
          devicePlatform = "ios";
        }
        if (categories.includes("Android") || categories.includes("CPE")) {
          devices.push("android");
          if (!devicePlatform) devicePlatform = "android";
        }

        // If no devices found in categories, use query params or default to all
        if (devices.length === 0) {
          if (queryParams.device_platform) {
            const platform = queryParams.device_platform.toLowerCase();
            if (platform === "ios" || platform === "iphone") {
              devices.push("iphone");
              devicePlatform = "ios";
            } else if (platform === "android") {
              devices.push("android");
              devicePlatform = "android";
            }
          } else {
            // Default to both if no info available
            devices.push("android", "iphone");
          }
        }

        // Extract CPI from the first payable event (type_id: 1 = Install)
        let cpiValue = 0;
        if (Array.isArray(offer.events)) {
          const installEvent = offer.events.find((e) => e.type_id === 1);
          if (installEvent && installEvent.payout) {
            cpiValue = parseFloat(installEvent.payout) || 0;
          }
        }

        return {
          ...offer,
          // Map anchor to title for frontend compatibility
          title:
            offer.anchor ||
            offer.title ||
            offer.product_name ||
            "Untitled Game",
          // Add amount field for frontend (in USD)
          amount: amount,
          // Add CPI field for frontend (first task payout from Install event)
          cpi: cpiValue,
          // Ensure id is a string for frontend compatibility
          id: offer.id?.toString() || offer.offerId?.toString() || "",
          // Add description if missing
          description: offer.description || "",
          // Add device/platform info for filtering
          devices: devices,
          device_platform:
            devicePlatform || queryParams.device_platform || null,
        };
      });
    }

    // Include restriction reason in response if present
    const response = {
      success: true,
      data: transformedData,
      total: transformedData.length,
      timestamp: data?.timestamp || new Date().toISOString(),
    };

    // Add restriction reason if present (helps debug empty results)
    if (data?.restrictionReason) {
      response.restrictionReason = data.restrictionReason;
      response.warning =
        "Bitlabs API returned restriction reason. Check restrictionReason field for details.";
    }

    res.json(response);
  } catch (error) {
    logger.error("Error fetching Bitlabs offers", {
      error: error.message,
      userId: req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch offers",
        code: "BITLABS_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Get game offers specifically
 * @route GET /api/bitlabs/game-offers
 * @query {string} platform - Platform filter
 * @query {string} country - Country code filter
 * @access Private (requires authentication)
 */
exports.getGameOffers = async (req, res) => {
  try {
    const queryParams = req.query;

    logger.info("Fetching Bitlabs game offers", {
      userId: req.user?.id,
      queryParams,
    });

    const data = await bitlabsService.getGameOffers(queryParams);

    res.json({
      success: true,
      data: data?.data || [],
      total: data?.total || 0,
      timestamp: data?.timestamp || new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching Bitlabs game offers", {
      error: error.message,
      userId: req.user?.id,
      queryParams: req.query,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch game offers",
        code: "BITLABS_GAME_OFFERS_ERROR",
      },
    });
  }
};

/**
 * Get all downloaded games with full details (two-step: list → per-offer details)
 * Step 1: GET /v1/client/user/history?filter=offers
 * Step 2: GET /v1/client/user/history/offers/{offerId} for each
 * Returns same format as getUserOfferHistory (in_progress, available, completed)
 * @route GET /api/bitlabs/my-games/:userId
 */
exports.getMyGames = async (req, res) => {
  try {
    const { userId } = req.params;

    logger.info("Fetching Bitlabs my-games (two-step)", { targetUserId: userId });

    // ── Step 1 & 2: fetch all downloaded games with full event details ──
    const offers = await bitlabsService.getUserDownloadedGamesWithDetails(userId);
    console.log(`[MY-GAMES] Two-step fetch complete: ${offers.length} offers`);

    // ── Load user from DB (same as getUserOfferHistory) ──
    const user = await User.findById(userId)
      .select("taskProgression games tasks xp vip")
      .lean();

    if (!user) {
      return res.json({
        data: { in_progress: [], available: [], completed: [],
          userXpTier: null, totalDownloadedGames: 0,
          gamesSummary: { total: 0, available: 0, inProgress: 0, completed: 0 },
          taskProgressionRule: null },
        status: "success",
        trace_id: `bitlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }

    if (offers.length === 0) {
      return res.json({
        data: { in_progress: [], available: [], completed: [],
          userXpTier: getUserXpTier(user), totalDownloadedGames: user.games?.length || 0,
          gamesSummary: { total: 0, available: 0, inProgress: 0, completed: 0 },
          taskProgressionRule: null },
        status: "success",
        trace_id: `bitlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
    }

    // ── Progression rule (same as getUserOfferHistory) ──
    const gamesDownloaded = user.games?.length || 0;
    const membershipTier  = getUserMembershipTier(user);
    const userProfile     = { xp: user.xp?.current || 0, gamesPlayed: gamesDownloaded, membershipTier: membershipTier ?? "free" };

    const progressionRuleLean = await TaskProgressionRule.findBestMatchForUser(userProfile);
    let progressionRule = null;
    if (progressionRuleLean) {
      progressionRule = new TaskProgressionRule(progressionRuleLean);
    }

    // ── Task progression map ──
    const userTaskProgression = user.taskProgression || {};
    let taskProgressionMap = {};
    if (userTaskProgression instanceof Map) {
      for (const [k, v] of userTaskProgression.entries()) taskProgressionMap[k] = v;
    } else {
      taskProgressionMap = userTaskProgression;
    }

    // ── Sorted games for bonus eligibility ──
    const userGames   = user.games || [];
    const sortedGames = [...userGames].sort((a, b) => {
      return new Date(a.installedAt || a.date || 0) - new Date(b.installedAt || b.date || 0);
    });

    // ── Bonus rule ──
    const bonusRule = await WelcomeBonusTimer.findOne({
      isActive: true,
      "gameBonusTasks.bonusTasks.0": { $exists: true },
      "gameBonusTasks.isEnabled": true,
    }).populate("gameBonusTasks.bonusTasks.taskId", "name description completionRule rewardType rewardValue").lean();

    const maxGamesWithBonus    = bonusRule?.maxGamesWithBonusTasks || 3;
    const eligibleGameIdsForBonus = sortedGames.slice(0, maxGamesWithBonus).map(g => String(g.gameId));

    const userTasks      = user.tasks || [];
    const bonusTaskUnlocks = {};
    userTasks.forEach(t => { if (t.isBonusTask && t.unlockedAt) bonusTaskUnlocks[t.taskId] = t.unlockedAt; });

    // ── Fetch conversion settings for coin reward calculation ──
    let coinsPerDollar = 100;
    try {
      const settings = await ConversionSettings.getActiveSettings("USD");
      console.log("[BITLABS CONVERSION] getActiveSettings('USD') returned:", JSON.stringify(settings, null, 2));
      if (settings?.coinsPerDollar) coinsPerDollar = settings.coinsPerDollar;
      console.log("[BITLABS CONVERSION] coinsPerDollar resolved to:", coinsPerDollar);
    } catch (err) {
      console.warn("[BITLABS CONVERSION] Could not fetch conversion settings, using default:", err.message);
    }

    // ── Process each offer through the SAME pipeline as getUserOfferHistory ──
    const offersWithoutGame = [];

    for (const offer of offers) {
      if (!offer) continue;
      const offerIdValue = offer.offer_id || offer.id || offer._id;
      if (!offerIdValue) continue;
      if (!offer.id) offer.id = offerIdValue;

      const offerIdStr = offer.id.toString();
      const offerIdNum = typeof offer.id === "number" ? offer.id : parseInt(offer.id, 10);

      const idConditions = [
        { gameId: offerIdStr }, { "gameDetails.id": offerIdStr },
        { "gameDetails.offer_id": offerIdStr }, { "metadata.externalId": offerIdStr },
      ];
      if (!Number.isNaN(offerIdNum)) {
        idConditions.push(
          { gameId: offerIdNum }, { "gameDetails.id": offerIdNum },
          { "gameDetails.offer_id": offerIdNum }, { "metadata.externalId": offerIdNum }
        );
      }
      let gameDoc = await Game.findOne({ sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] }, $or: idConditions }).lean();

      if (!gameDoc && offer.product_name) {
        const allBitlabs = await Game.find({ sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] } }).lean();
        const nameKey = String(offer.product_name).toLowerCase().trim();
        for (const g of allBitlabs) {
          if (g.gameDetails?.name && 
              (g.gameDetails.name.toLowerCase().trim().includes(nameKey) || nameKey.includes(g.gameDetails.name.toLowerCase().trim()))) {
            gameDoc = g;
            break;
          }
        }
      }

      if (!gameDoc) { offersWithoutGame.push(offer); continue; }

      offer.xpRewardConfig = gameDoc.xpRewardConfig || { baseXP: 0, multiplier: 1.0 };
      const gameIdString = gameDoc._id.toString();

      const isEligibleForBonus = eligibleGameIdsForBonus.some(id => id === gameIdString);
      const userGame = userGames.find(g => String(g.gameId) === gameIdString);

      // ── Snapshot handling: freeze offer at first-seen time ──
      let snapshotCoinRewardMap = null;
      let snapshotTotalCoins = null;
      const hasSnapshot = !!(userGame?.offerSnapshot?.goals?.length);
      console.log("[BITLABS MYGAMES SNAPSHOT] offerId=" + offer.id + " userGame found=" + !!userGame + " hasSnapshot=" + hasSnapshot + " offerSnapshot=" + (userGame?.offerSnapshot ? "exists" : "null"));

      if (hasSnapshot) {
        console.log("[BITLABS MYGAMES SNAPSHOT] USING FROZEN SNAPSHOT — goals:", JSON.stringify(userGame.offerSnapshot.goals));
        snapshotCoinRewardMap = new Map();
        userGame.offerSnapshot.goals.forEach((sg) => {
          if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
          snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
        });
        snapshotTotalCoins = userGame.offerSnapshot.rewards?.coins;
      } else if (!userGame) {
        console.log("[BITLABS MYGAMES SNAPSHOT] NO userGame entry — creating first-seen snapshot");
        const snapCoinsPerDollar = await getCoinsPerDollar();
        console.log("[BITLABS MYGAMES SNAPSHOT] snapCoinsPerDollar resolved to:", snapCoinsPerDollar);
        const snapshot = buildSnapshot(gameDoc, snapCoinsPerDollar);
        console.log("[BITLABS MYGAMES SNAPSHOT] built snapshot:", JSON.stringify(snapshot));
        if (snapshot) {
          await User.findByIdAndUpdate(user._id, {
            $push: {
              games: {
                gameId: gameDoc._id,
                provider: "bitlabs",
                installedAt: new Date(),
                offerSnapshot: snapshot,
              }
            }
          });
          snapshotCoinRewardMap = new Map();
          snapshot.goals.forEach((sg) => {
            if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
            snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
          });
          snapshotTotalCoins = snapshot.rewards?.coins;
          console.log("[BITLABS MYGAMES SNAPSHOT] Created new snapshot, snapshotTotalCoins=" + snapshotTotalCoins);
        }
      } else {
        console.log("[BITLABS MYGAMES SNAPSHOT] userGame exists but NO snapshot or empty goals — rebuilding snapshot from live offer data");
        const snapCoinsPerDollar = await getCoinsPerDollar();
        const snapshot = buildBitlabsSnapshotFromOffer(offer, snapCoinsPerDollar);
        if (snapshot && snapshot.goals.length > 0) {
          await User.updateOne(
            { _id: user._id, "games.gameId": gameDoc._id },
            { $set: { "games.$.offerSnapshot": snapshot } }
          );
          snapshotCoinRewardMap = new Map();
          snapshot.goals.forEach((sg) => {
            if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
            snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
          });
          snapshotTotalCoins = snapshot.rewards?.coins;
          console.log("[BITLABS MYGAMES SNAPSHOT] Rebuilt snapshot, snapshotTotalCoins=" + snapshotTotalCoins);
        } else {
          console.log("[BITLABS MYGAMES SNAPSHOT] Could not rebuild snapshot from live offer data — using LIVE conversion coinsPerDollar=" + coinsPerDollar);
        }
      }

      if (offer.events && Array.isArray(offer.events)) {
        let progression = taskProgressionMap[gameIdString];
        const payableEvents = offer.events.filter(e => e.payable === true);
        const sortedEvents  = [...payableEvents].sort((a, b) => {
          const diff = (a.type_id || 999) - (b.type_id || 999);
          return diff !== 0 ? diff : (a.name || "").localeCompare(b.name || "");
        });

        let sequentialCompletedCount = 0;
        for (const ev of sortedEvents) {
          if (ev.status === "completed" || ev.approved_conversions > 0) sequentialCompletedCount++;
          else break;
        }

        let completedTasksCount = progression?.completedTasks || sequentialCompletedCount;
        if (!progression) {
          progression = { completedTasks: completedTasksCount, thresholdReached: false, rewardTransferred: false, coinBoxBalance: 0 };
        } else {
          progression.completedTasks = Math.max(progression.completedTasks || 0, sequentialCompletedCount);
          completedTasksCount = progression.completedTasks;
        }

        // Calculate coin rewards per event (proportional based on points)
        const totalPoints = parseFloat(gameDoc.besitosRawData?.total_points || offer.total_points) || 0;
        const amount = totalPoints > 0 ? totalPoints / 1000 : 0;
        const liveTotalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;
        const totalCoins = snapshotTotalCoins ?? liveTotalCoins;
        console.log(`[BITLABS MYGAMES] offerId=${offer.id} amount=${amount} totalPoints=${totalPoints} liveCoinsPerDollar=${coinsPerDollar} liveTotalCoins=${liveTotalCoins} snapshotTotalCoins=${snapshotTotalCoins ?? "null"} finalTotalCoins=${totalCoins} source=${snapshotTotalCoins != null ? "SNAPSHOT" : "LIVE"}`);

        offer.events = offer.events.map((event, index) => {
          const eventPoints = getEventPoints(event);
          const eventId = event.uuid || event.hash || `event-${index}`;
          const liveCoinReward = totalPoints > 0 && eventPoints > 0
            ? Math.round((eventPoints / totalPoints) * totalCoins)
            : 0;
          const snapshotCoin = snapshotCoinRewardMap?.get(eventId) ?? snapshotCoinRewardMap?.get(`pos-${index + 1}`);
          const coinReward = snapshotCoin ?? liveCoinReward;
          console.log(`[BITLABS MYGAMES EVENT] name="${event.name}" eventId=${eventId} points=${eventPoints} liveCoinReward=${liveCoinReward} snapshotCoin=${snapshotCoin ?? "N/A"} final=${coinReward} source=${snapshotCoin != null ? "SNAPSHOT" : "LIVE"}`);

          if (!event.payable) return { ...event, coinReward };
          const taskOrder   = sortedEvents.findIndex(e => e.uuid === event.uuid) + 1 || index + 1;
          const isCompleted = event.status === "completed" || event.approved_conversions > 0;
          let isUnlocked = true, unlockReason = "", isLocked = false;
          if (isCompleted) {
            unlockReason = "Completed";
          } else if (progressionRule) {
            const check = progressionRule.canUnlockTask(completedTasksCount, taskOrder, progression.rewardTransferred || false);
            isUnlocked   = check.canUnlock;
            unlockReason = check.reason || "";
            isLocked     = !isUnlocked;
          }
          return { ...event, coinReward, progression: {
            isUnlocked, isLocked, unlockReason,
            batchNumber: progressionRule
              ? taskOrder <= progressionRule.firstBatchSize ? 1
                : (progressionRule.nextBatchSize && progressionRule.nextBatchSize > 0
                    ? Math.ceil((taskOrder - progressionRule.firstBatchSize) / progressionRule.nextBatchSize) + 1
                    : null)
              : null
          }};
        });

        // Add totalCoins to offer for frontend
        offer.totalCoins = totalCoins;

        if (progressionRule && completedTasksCount >= (progressionRule.firstBatchSize || 0)) {
          progression.thresholdReached = true;
        }

        offer.taskProgression = {
          hasProgressionRule: !!progressionRule,
          ruleId: progressionRule?._id || progressionRuleLean?._id || null,
          ruleName: progressionRule?.ruleName || progressionRuleLean?.ruleName || null,
          appliedMilestones: progressionRule?.userMilestones || progressionRuleLean?.userMilestones || null,
          firstBatchSize: progressionRule?.firstBatchSize || null,
          nextBatchSize:  progressionRule?.nextBatchSize  || null,
          maxBatches:     progressionRule?.maxBatches     || null,
          completedTasks: completedTasksCount,
          thresholdReached:  progression.thresholdReached,
          rewardTransferred: progression.rewardTransferred || false,
          coinBoxBalance:    progression.coinBoxBalance    || 0,
          canTransfer:       progression.thresholdReached && !progression.rewardTransferred && (progression.coinBoxBalance || 0) > 0,
          canUnlockNextTasks: progression.thresholdReached && (progressionRule?.nextBatchSize === 0 || progressionRule?.nextBatchSize == null || progression.rewardTransferred),
        };
      }

      // ── Bonus tasks ──
      if (isEligibleForBonus && bonusRule?.gameBonusTasks) {
        const gameBonusConfig = bonusRule.gameBonusTasks.find(c => c.isEnabled && c.bonusTasks?.length > 0);
        if (gameBonusConfig) {
          const userInternalEvents     = userGame?.playCount || 0;
          const minimumEventThreshold  = gameBonusConfig.minimumEventThreshold;
          const completionDeadlineHours = gameBonusConfig.completionDeadlineHours || 24;
          const gameDownloadTime       = userGame?.installedAt || userGame?.firstPlayed || userGame?.date || new Date();

          const firstTask       = gameBonusConfig.bonusTasks.filter(bt => bt.isEnabled).sort((a,b) => a.order - b.order)[0];
          const firstTaskId     = firstTask ? (firstTask.taskId._id || firstTask.taskId).toString() : null;
          let sharedDeadlineStartTime = firstTaskId ? (bonusTaskUnlocks[firstTaskId] || null) : null;
          if (!sharedDeadlineStartTime && firstTaskId) sharedDeadlineStartTime = new Date();

          const formattedBonusTasks = gameBonusConfig.bonusTasks.filter(bt => bt.isEnabled).sort((a,b) => a.order - b.order).map((bt, index) => {
            const taskId     = (bt.taskId._id || bt.taskId).toString();
            const userTask   = userTasks.find(t => t.taskId === taskId);
            const isCompleted = userTask?.completed || false;
            let isUnlocked = false, unlockReason = "", unlockTime = bonusTaskUnlocks[taskId] || null;

            if (index === 0) {
              isUnlocked   = true;
              if (!unlockTime) unlockTime = new Date();
              unlockReason = unlockTime ? "Unlocked" : "Unlocks immediately";
              if (!sharedDeadlineStartTime) sharedDeadlineStartTime = unlockTime;
            } else {
              const prevTask   = gameBonusConfig.bonusTasks.find(t => t.order === bt.order - 1);
              const prevId     = (prevTask?.taskId._id || prevTask?.taskId).toString();
              const prevDone   = userTasks.find(t => t.taskId === prevId)?.completed || false;
              const thresholdMet = userInternalEvents >= minimumEventThreshold;
              if (unlockTime)                           { isUnlocked = true; unlockReason = "Unlocked"; }
              else if (prevDone && thresholdMet)        { isUnlocked = true; unlockTime = new Date(); unlockReason = "Previous task completed and event threshold met"; }
              else if (!prevDone)                       { unlockReason = `Complete Bonus Task ${bt.order - 1} first`; }
              else                                      { unlockReason = `Reach ${minimumEventThreshold} internal events (current: ${userInternalEvents})`; }
            }

            const completionDeadline = sharedDeadlineStartTime
              ? new Date(sharedDeadlineStartTime.getTime() + completionDeadlineHours * 3600000) : null;
            const now = new Date();
            const isExpired      = completionDeadline ? now > completionDeadline : false;
            const timeRemaining  = completionDeadline ? Math.max(0, completionDeadline.getTime() - now.getTime()) : null;

            return { taskId, order: bt.order, isUnlocked, isCompleted, completedAt: userTask?.completedAt || null,
              unlockTime, unlockReason, isExpired, timeRemaining,
              completionDeadline: completionDeadline?.toISOString() || null,
              task: { name: bt.taskId?.name || null, description: bt.taskId?.description || null,
                rewardType: bt.taskId?.rewardType || null, rewardValue: bt.taskId?.rewardValue || null } };
          });

          offer.bonusTasks = {
            hasBonusTasks: true, isEligible: true,
            minimumEventThreshold, completionDeadlineHours, taskLogic: "sequential",
            bonusTasks: formattedBonusTasks,
            userProgress: { internalEvents: userInternalEvents,
              eventThresholdMet: userInternalEvents >= minimumEventThreshold, gameDownloadTime },
            maxGamesWithBonusTasks: maxGamesWithBonus,
            userDownloadOrder: sortedGames.findIndex(g => String(g.gameId) === gameIdString) + 1,
          };
        } else {
          offer.bonusTasks = { hasBonusTasks: false, isEligible: true, bonusTasks: [], message: "No bonus tasks configured" };
        }
      } else {
        offer.bonusTasks = { hasBonusTasks: false, isEligible: false, bonusTasks: [],
          message: `Bonus tasks are only available for your first ${maxGamesWithBonus} downloaded games`,
          maxGamesWithBonusTasks: maxGamesWithBonus };
      }
    }

    // ── Process offers without matching game doc ──
    for (const offer of offersWithoutGame) {
      if (!offer?.id) continue;
      const payableEvents   = offer.events?.filter(e => e.payable === true) || [];
      const completedEvents = payableEvents.filter(e => e.status === "completed" || e.approved_conversions > 0);
      offer.taskProgression = {
        hasProgressionRule: false, ruleId: null, ruleName: null, appliedMilestones: null,
        firstBatchSize: null, nextBatchSize: null, maxBatches: null,
        completedTasks: completedEvents.length, thresholdReached: false,
        rewardTransferred: false, coinBoxBalance: 0, canTransfer: false, canUnlockNextTasks: false,
      };
      offer.bonusTasks = { hasBonusTasks: false, isEligible: false, bonusTasks: [], message: "Game not found in database" };
      // Calculate coin rewards for offers without game doc
      const totalPoints = parseFloat(offer.total_points) || 0;
      const amount = totalPoints > 0 ? totalPoints / 1000 : 0;
      const totalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;
      if (offer.events) {
        offer.events = offer.events.map(e => {
          const eventPoints = getEventPoints(e);
          const coinReward = e.payable !== false && totalPoints > 0 && eventPoints > 0
            ? Math.round((eventPoints / totalPoints) * totalCoins)
            : 0;
          return e.payable ? { ...e, coinReward, progression: { isUnlocked: true, isLocked: false, unlockReason: "No progression rules applied", batchNumber: null } } : { ...e, coinReward };
        });
        offer.totalCoins = totalCoins;
      }
    }

    // ── Categorize ──
    const allProcessed    = [...offers.filter(o => o?.id && !offersWithoutGame.includes(o)), ...offersWithoutGame];
    const inProgressOffers = [], availableOffers = [], completedOffers = [];

    for (const offer of allProcessed) {
      if (!offer?.id) continue;
      const payableEvents   = offer.events?.filter(e => e.payable === true) || [];
      const completedEvents = payableEvents.filter(e => e.status === "completed" || e.approved_conversions > 0);
      const isCompleted     = payableEvents.length > 0 && completedEvents.length === payableEvents.length;
      const hasStarted      = completedEvents.length > 0;
      if (isCompleted)        completedOffers.push(offer);
      else if (hasStarted)    inProgressOffers.push(offer);
      else                    availableOffers.push(offer);
    }

    const userXpTier = getUserXpTier(user);

    return res.json({
      data: {
        in_progress: inProgressOffers,
        available:   availableOffers,
        completed:   completedOffers,
        userXpTier,
        totalDownloadedGames: user.games?.length || 0,
        gamesSummary: { total: user.games?.length || 0, available: availableOffers.length, inProgress: inProgressOffers.length, completed: completedOffers.length },
        taskProgressionRule: progressionRule || progressionRuleLean ? {
          ruleId:            progressionRule?._id            || progressionRuleLean?._id            || null,
          ruleName:          progressionRule?.ruleName        || progressionRuleLean?.ruleName        || null,
          appliedMilestones: progressionRule?.userMilestones  || progressionRuleLean?.userMilestones  || null,
          firstBatchSize:    progressionRule?.firstBatchSize  || progressionRuleLean?.firstBatchSize  || null,
          nextBatchSize:     progressionRule?.nextBatchSize   || progressionRuleLean?.nextBatchSize   || null,
          maxBatches:        progressionRule?.maxBatches      || progressionRuleLean?.maxBatches      || null,
          priority:          progressionRule?.priority        || progressionRuleLean?.priority        || null,
        } : null,
      },
      status: "success",
      trace_id: `bitlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

  } catch (error) {
    logger.error("Error fetching Bitlabs my-games", { error: error.message, userId: req.params.userId });
    res.status(error.status || 500).json({
      success: false,
      error: { message: error.message || "Failed to fetch my games", code: "BITLABS_MY_GAMES_ERROR" }
    });
  }
};

/**
 * Get user offer history with admin-configured progression rules
 * Applies same logic as Besitos user-data endpoint
 * @route GET /api/bitlabs/user-history/:userId
 * @route GET /api/bitlabs/user-history/:userId/:offerId
 * @param {string} userId - User ID
 * @param {string} offerId - Optional offer ID for specific offer
 * @access Private
 */
exports.getUserOfferHistory = async (req, res) => {
  try {
    const { userId, offerId } = req.params;

    logger.info("Fetching Bitlabs user offer history", {
      targetUserId: userId,
      offerId: offerId || "all",
    });

    // Fetch raw Bitlabs data
    const bitlabsResult = await bitlabsService.getUserOfferHistory(
      userId,
      offerId,
    );

    // Debug logging
    // console.log("🔵 [BITLABS CONTROLLER] Raw Bitlabs result:", {
    //   hasData: !!bitlabsResult?.data,
    //   hasId: !!bitlabsResult?.id,
    //   isArray: Array.isArray(bitlabsResult),
    //   isArrayData: Array.isArray(bitlabsResult?.data),
    //   keys: bitlabsResult ? Object.keys(bitlabsResult) : [],
    //   offerId: offerId,
    // });

    // Extract the actual offer data from Bitlabs response
    // Bitlabs returns: { data: {...}, status: "success", trace_id: "..." }
    // Or directly: { id: ..., ... } for single offer
    let bitlabsData = bitlabsResult?.data || bitlabsResult;

    // If bitlabsData is still wrapped, try to extract it
    if (bitlabsData && typeof bitlabsData === "object" && bitlabsData.data) {
      bitlabsData = bitlabsData.data;
    }

    // console.log("🔵 [BITLABS CONTROLLER] Extracted bitlabsData:", {
    //   hasId: !!bitlabsData?.id,
    //   bitlabsDataId: bitlabsData?.id,
    //   bitlabsDataIdType: bitlabsData?.id != null ? typeof bitlabsData.id : "n/a",
    //   isArray: Array.isArray(bitlabsData),
    //   keys: bitlabsData ? Object.keys(bitlabsData) : [],
    // });

    // Get user from database to apply progression rules
    const user = await User.findById(userId)
      .select("taskProgression games tasks xp vip")
      .lean();

    // Fetch conversion settings for coin reward calculation
    let coinsPerDollar = 100;
    try {
      const settings = await ConversionSettings.getActiveSettings("USD");
      if (settings?.coinsPerDollar) coinsPerDollar = settings.coinsPerDollar;
    } catch (err) {
      console.warn("Could not fetch conversion settings, using default:", err.message);
    }

    if (!user) {
      // If user not found in our DB, return bitlabs data in Besitos format
      logger.warn("Bitlabs user-history: user not found in local DB", {
        targetUserId: userId,
      });

      // Transform to Besitos structure even without user data
      const offers = offerId
        ? bitlabsData && typeof bitlabsData === "object" && bitlabsData.id
          ? [bitlabsData]
          : []
        : Array.isArray(bitlabsData)
          ? bitlabsData
          : [];

      const inProgressOffers = [];
      const availableOffers = [];
      const completedOffers = [];

      for (const offer of offers) {
        if (!offer || !offer.id) continue;
        const payableEvents =
          offer.events?.filter((e) => e.payable === true) || [];
        const completedEvents = payableEvents.filter(
          (e) => e.status === "completed" || e.approved_conversions > 0,
        );
        const isCompleted =
          payableEvents.length > 0 &&
          completedEvents.length === payableEvents.length;
        const hasStarted = completedEvents.length > 0;

        if (isCompleted) {
          completedOffers.push(offer);
        } else if (hasStarted) {
          inProgressOffers.push(offer);
        } else {
          availableOffers.push(offer);
        }
      }

      const responseData = {
        in_progress: inProgressOffers,
        available: availableOffers,
        completed: completedOffers,
        userXpTier: null,
        totalDownloadedGames: 0,
        gamesSummary: {
          total: 0,
          available: availableOffers.length,
          inProgress: inProgressOffers.length,
          completed: completedOffers.length,
        },
        taskProgressionRule: null,
      };

      return res.json({
        data: responseData,
        status: "success",
        trace_id: `bitlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      });
    }

    logger.info("Bitlabs user-history local DB summary", {
      targetUserId: userId,
      localGamesCount: user.games?.length || 0,
      localTasksCount: user.tasks?.length || 0,
      localXp: user.xp?.current || 0,
      localVipTier: user.vip?.tier || user.vip?.level || "free",
    });

    // Build user profile for progression rule matching (same as Besitos: treat null membership as "free" so rules for free tier can match)
    const gamesDownloaded = user.games?.length || 0;
    const membershipTier = getUserMembershipTier(user);
    const userProfile = {
      xp: user.xp?.current || 0,
      gamesPlayed: gamesDownloaded,
      membershipTier: membershipTier ?? "free",
    };

    // Get user-based progression rule
    const progressionRuleLean =
      await TaskProgressionRule.findBestMatchForUser(userProfile);

    // Convert lean document to Mongoose instance if found
    let progressionRule = null;
    if (progressionRuleLean) {
      progressionRule = new TaskProgressionRule(progressionRuleLean);
      console.log(
        `✅ Found progression rule: ${progressionRule.ruleName} (XP Tier: ${progressionRule.xpTier}, First Batch: ${progressionRule.firstBatchSize}, Next Batch: ${progressionRule.nextBatchSize})`,
      );
    } else {
      console.log(
        `⚠️ No progression rule found for user (XP: ${userProfile.xp}, Games: ${userProfile.gamesPlayed}, Membership: ${userProfile.membershipTier})`,
      );
    }

    // Get user's task progression data
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
        "name description completionRule rewardType rewardValue",
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

    // Process Bitlabs offer data
    // Bitlabs returns single offer object when offerId is provided, or array of offers
    let offers = [];
    if (offerId) {
      // Single offer - wrap in array for processing
      // Check multiple possible structures
      if (bitlabsData && typeof bitlabsData === "object") {

        // KEY FIX: Use BitLabs official `started_at` field to check if user actually started this game.
        // Per BitLabs docs: started_at is null if user never interacted with the offer.
        const startedAt = bitlabsData.started_at || bitlabsData.data?.started_at || null;
        const completedEvents = bitlabsData.completed_events || bitlabsData.data?.completed_events || 0;
        const hasPendingConversions = bitlabsData.has_pending_conversions || bitlabsData.data?.has_pending_conversions || false;
        const userHasStarted = startedAt !== null || completedEvents > 0 || hasPendingConversions;

        console.log(`[MY-GAMES] offerId=${offerId} | started_at=${startedAt} | completed_events=${completedEvents} | has_pending=${hasPendingConversions} | userHasStarted=${userHasStarted}`);

        if (!userHasStarted) {
          console.log(`[MY-GAMES] EXCLUDED offerId=${offerId} — started_at is null, user never started this game`);
          // Return empty My Games — user has not downloaded/started this game
          offers = [];
        } else if (bitlabsData.id) {
          // Direct offer object with id
          offers = [bitlabsData];
        } else if (bitlabsData.data && bitlabsData.data.id) {
          // Nested in data property
          offers = [bitlabsData.data];
        } else if (Object.keys(bitlabsData).length > 0) {
          // Might be an offer object without explicit id check - include it anyway
          // Bitlabs offers should have at least some properties
          console.log(
            "⚠️ [BITLABS CONTROLLER] Single offer without explicit id, but has properties:",
            Object.keys(bitlabsData),
          );
          offers = [bitlabsData];
        }
      }
      // console.log("🔵 [BITLABS CONTROLLER] Single offer extraction result:", {
      //   offersCount: offers.length,
      //   hasOffer: offers.length > 0,
      //   offerId: offers[0]?.id,
      // });
    } else {
      // Multiple offers - could be array or object with data array
      if (Array.isArray(bitlabsData)) {
        offers = bitlabsData;
      } else if (bitlabsData && Array.isArray(bitlabsData.data)) {
        offers = bitlabsData.data;
      } else if (
        bitlabsData &&
        typeof bitlabsData === "object" &&
        bitlabsData.offers
      ) {
        // Some APIs return { offers: [...] }
        offers = Array.isArray(bitlabsData.offers) ? bitlabsData.offers : [];
      }
      // console.log("🔵 [BITLABS CONTROLLER] Multiple offers extraction result:", {
      //   offersCount: offers.length,
      // });
    }

    // console.log("🔵 [BITLABS CONTROLLER] Final offers array:", {
    //   count: offers.length,
    //   firstOfferId: offers[0]?.id,
    //   firstOfferIdType: offers[0]?.id != null ? typeof offers[0].id : "n/a",
    //   firstOfferKeys: offers[0] ? Object.keys(offers[0]) : [],
    //   routeOfferIdParam: offerId || "none (all offers)",
    // });

    // Track offers that need to be processed without game matching
    const offersWithoutGame = [];

    // console.log("🔵 [BITLABS CONTROLLER] Starting to process offers:", {
    //   totalOffers: offers.length,
    // });

    for (const offer of offers) {
      if (!offer) {
        console.log("⚠️ [BITLABS CONTROLLER] Skipping null/undefined offer");
        continue;
      }

      // Check for id field - Bitlabs might use 'id' or 'offer_id'; use route param if single-offer response has no id
      const offerIdValue =
        offer.id || offer.offer_id || offer._id || (offerId && String(offerId));
      // console.log("🔵 [BITLABS CONTROLLER] Offer id resolution:", {
      //   "offer.id": offer.id,
      //   "offer.offer_id": offer.offer_id,
      //   "offer._id": offer._id,
      //   "route offerId param": offerId || "n/a",
      //   resolvedOfferIdValue: offerIdValue,
      //   resolvedType: offerIdValue != null ? typeof offerIdValue : "n/a",
      // });
      if (!offerIdValue) {
        console.log("⚠️ [BITLABS CONTROLLER] Skipping offer without id:", {
          keys: Object.keys(offer),
          offer: JSON.stringify(offer).substring(0, 200),
        });
        continue;
      }

      // Normalize the id for consistency
      if (!offer.id) {
        offer.id = offerIdValue;
      }

      // console.log("🔵 [BITLABS CONTROLLER] Processing offer:", {
      //   offerId: offer.id,
      //   anchor: offer.anchor || offer.name || "n/a",
      //   hasEvents: !!offer.events,
      //   eventsCount: offer.events?.length || 0,
      // });

      // Normalize offer id to string and number (DB may store either)
      const offerIdStr = offer.id.toString();
      const offerIdNum =
        typeof offer.id === "number" ? offer.id : parseInt(offer.id, 10);

      // Find matching game in our database (sdkProvider may be "Bitlabs" or "bitlabs")
      // Match both string and number id - admin may store gameId/gameDetails.id as either
      const idConditions = [
        { gameId: offerIdStr },
        { "gameDetails.id": offerIdStr },
        { "gameDetails.offer_id": offerIdStr },
        { "metadata.externalId": offerIdStr },
      ];
      if (!Number.isNaN(offerIdNum)) {
        idConditions.push(
          { gameId: offerIdNum },
          { "gameDetails.id": offerIdNum },
          { "gameDetails.offer_id": offerIdNum },
          { "metadata.externalId": offerIdNum },
        );
      }
      const gameQuery = {
        sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] },
        $or: idConditions,
      };
      // console.log("🔵 [BITLABS CONTROLLER] Game lookup query:", {
      //   offerIdStr,
      //   offerIdNum: Number.isNaN(offerIdNum) ? "NaN" : offerIdNum,
      //   idConditionsCount: idConditions.length,
      //   querySummary: JSON.stringify(gameQuery),
      // });
      let gameDoc = await Game.findOne(gameQuery).lean();

      if (!gameDoc && offer.product_name) {
        const allBitlabs = await Game.find({ sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] } }).lean();
        const nameKey = String(offer.product_name).toLowerCase().trim();
        for (const g of allBitlabs) {
          if (g.gameDetails?.name && 
              (g.gameDetails.name.toLowerCase().trim().includes(nameKey) || nameKey.includes(g.gameDetails.name.toLowerCase().trim()))) {
            gameDoc = g;
            break;
          }
        }
      }

      // If game not found in database, mark for later processing without progression rules
      if (!gameDoc) {
        console.warn(
          `⚠️ [BITLABS CONTROLLER] Game not found for offer ID: ${offer.id} (str: "${offerIdStr}", num: ${offerIdNum}). Will include without progression rules.`,
        );
        // Debug: show what Bitlabs games exist in DB (sample)
        const bitlabsGamesCount = await Game.countDocuments({
          sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] },
        });
        const bitlabsGamesSample = await Game.find({
          sdkProvider: { $in: ["Bitlabs", "bitlabs", "BitLabs", "BITLABS"] },
        })
          .select(
            "gameId gameDetails.id gameDetails.offer_id metadata.externalId sdkProvider title",
          )
          .limit(5)
          .lean();

        offersWithoutGame.push(offer);
        continue;
      }

      // Each game has its own admin XP (different games can have different baseXP/multiplier) - same as Besitos user-data
      offer.xpRewardConfig = gameDoc.xpRewardConfig || {
        baseXP: 0,
        multiplier: 1.0,
      };

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
        gameDoc.title || offer.id,
        "===",
      );
      console.log("Game ID (DB):", currentGameIdString);
      console.log("Is Eligible for Bonus:", isEligibleForBonus);

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

      // ── Snapshot handling: freeze offer at first-seen time ──
      let snapshotCoinRewardMap = null;
      let snapshotTotalCoins = null;
      const hasSnapshot = !!(userGame?.offerSnapshot?.goals?.length);
      console.log("[BITLABS USERHISTORY SNAPSHOT] offerId=" + offer.id + " userGame found=" + !!userGame + " hasSnapshot=" + hasSnapshot);

      if (hasSnapshot) {
        console.log("[BITLABS USERHISTORY SNAPSHOT] USING FROZEN SNAPSHOT — goals:", JSON.stringify(userGame.offerSnapshot.goals));
        snapshotCoinRewardMap = new Map();
        userGame.offerSnapshot.goals.forEach((sg) => {
          if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
          snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
        });
        snapshotTotalCoins = userGame.offerSnapshot.rewards?.coins;
      } else if (!userGame) {
        console.log("[BITLABS USERHISTORY SNAPSHOT] NO userGame entry — creating first-seen snapshot");
        const snapCoinsPerDollar = await getCoinsPerDollar();
        const snapshot = buildSnapshot(gameDoc, snapCoinsPerDollar);
        console.log("[BITLABS USERHISTORY SNAPSHOT] built snapshot:", JSON.stringify(snapshot));
        if (snapshot) {
          await User.findByIdAndUpdate(user._id, {
            $push: {
              games: {
                gameId: gameDoc._id,
                provider: "bitlabs",
                installedAt: new Date(),
                offerSnapshot: snapshot,
              }
            }
          });
          snapshotCoinRewardMap = new Map();
          snapshot.goals.forEach((sg) => {
            if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
            snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
          });
          snapshotTotalCoins = snapshot.rewards?.coins;
          console.log("[BITLABS USERHISTORY SNAPSHOT] Created new snapshot, snapshotTotalCoins=" + snapshotTotalCoins);
        }
      } else {
        console.log("[BITLABS USERHISTORY SNAPSHOT] userGame exists but NO snapshot — rebuilding snapshot from live offer data");
        const snapCoinsPerDollar = await getCoinsPerDollar();
        const snapshot = buildBitlabsSnapshotFromOffer(offer, snapCoinsPerDollar);
        if (snapshot && snapshot.goals.length > 0) {
          await User.updateOne(
            { _id: user._id, "games.gameId": gameDoc._id },
            { $set: { "games.$.offerSnapshot": snapshot } }
          );
          snapshotCoinRewardMap = new Map();
          snapshot.goals.forEach((sg) => {
            if (sg.goalId) snapshotCoinRewardMap.set(sg.goalId, sg.coinReward);
            snapshotCoinRewardMap.set(`pos-${sg.position}`, sg.coinReward);
          });
          snapshotTotalCoins = snapshot.rewards?.coins;
          console.log("[BITLABS USERHISTORY SNAPSHOT] Rebuilt snapshot, snapshotTotalCoins=" + snapshotTotalCoins);
        } else {
          console.log("[BITLABS USERHISTORY SNAPSHOT] Could not rebuild snapshot from live offer data — using LIVE conversion coinsPerDollar=" + coinsPerDollar);
        }
      }

      // Process events (Bitlabs equivalent of goals/tasks)
      if (offer.events && Array.isArray(offer.events)) {
        // Get progression from database, or initialize from bitlabs events
        let progression = taskProgressionMap[gameIdString];

        // Filter payable events (these are the tasks we track)
        const payableEvents = offer.events.filter((e) => e.payable === true);

        // Sort events by type_id (1 = Install, 2+ = Steps/Levels)
        const sortedEvents = [...payableEvents].sort((a, b) => {
          const typeA = a.type_id || 999;
          const typeB = b.type_id || 999;
          if (typeA !== typeB) return typeA - typeB;
          // If same type_id, sort by name or uuid
          return (a.name || a.uuid || "").localeCompare(b.name || b.uuid || "");
        });

        // Count sequential completed events (events must be completed in order)
        let sequentialCompletedCount = 0;
        for (let i = 0; i < sortedEvents.length; i++) {
          const eventStatus = sortedEvents[i].status;
          if (
            eventStatus === "completed" ||
            sortedEvents[i].approved_conversions > 0
          ) {
            sequentialCompletedCount++;
          } else {
            // Stop counting if we hit an incomplete event (sequential requirement)
            break;
          }
        }

        // Use database progression if available, otherwise use bitlabs count
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
          // Use the maximum between database count and sequential bitlabs count
          progression.completedTasks = Math.max(
            progression.completedTasks || 0,
            sequentialCompletedCount,
          );
          completedTasksCount = progression.completedTasks;
        }

        // Calculate coin rewards per event (proportional based on points)
        const totalPoints = parseFloat(gameDoc.besitosRawData?.total_points || offer.total_points) || 0;
        const amount = totalPoints > 0 ? totalPoints / 1000 : 0;
        const liveTotalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;
        const totalCoins = snapshotTotalCoins ?? liveTotalCoins;
        console.log(`[BITLABS USERHISTORY] offerId=${offer.id} amount=${amount} totalPoints=${totalPoints} liveCoinsPerDollar=${coinsPerDollar} liveTotalCoins=${liveTotalCoins} snapshotTotalCoins=${snapshotTotalCoins ?? "null"} finalTotalCoins=${totalCoins} source=${snapshotTotalCoins != null ? "SNAPSHOT" : "LIVE"}`);

        offer.events = offer.events.map((event, index) => {
          const eventPoints = getEventPoints(event);
          const eventId = event.uuid || event.hash || `event-${index}`;
          const liveCoinReward = totalPoints > 0 && eventPoints > 0
            ? Math.round((eventPoints / totalPoints) * totalCoins)
            : 0;
          const snapshotCoin = snapshotCoinRewardMap?.get(eventId) ?? snapshotCoinRewardMap?.get(`pos-${index + 1}`);
          const coinReward = snapshotCoin ?? liveCoinReward;
          console.log(`[USERHISTORY BITLABS EVENT] name="${event.name}" eventId=${eventId} points=${eventPoints} liveCoinReward=${liveCoinReward} snapshotCoin=${snapshotCoin ?? "N/A"} final=${coinReward} source=${snapshotCoin != null ? "SNAPSHOT" : "LIVE"}`);

          // Only apply progression to payable events
          if (!event.payable) {
            return { ...event, coinReward };
          }

          // Find event order in payable events list
          const eventOrder =
            sortedEvents.findIndex((e) => e.uuid === event.uuid) + 1;
          const taskOrder = eventOrder || index + 1;

          let isUnlocked = true;
          let unlockReason = "";
          let isLocked = false;

          // If event is already completed, it's always unlocked
          const isCompleted =
            event.status === "completed" || event.approved_conversions > 0;
          if (isCompleted) {
            isUnlocked = true;
            unlockReason = "Completed";
            isLocked = false;
          } else if (progressionRule) {
            // Apply batch-based logic for incomplete events
            const unlockCheck = progressionRule.canUnlockTask(
              completedTasksCount,
              taskOrder,
              progression.rewardTransferred || false,
            );

            isUnlocked = unlockCheck.canUnlock;
            unlockReason = unlockCheck.reason || "";
            isLocked = !isUnlocked;
          }

          // Add progression information to event
          return {
            ...event,
            coinReward,
            // Progression info
            progression: {
              isUnlocked: isUnlocked,
              isLocked: isLocked,
              unlockReason: unlockReason,
              batchNumber: progressionRule
                ? taskOrder <= progressionRule.firstBatchSize
                  ? 1
                  : progressionRule.nextBatchSize && progressionRule.nextBatchSize > 0
                    ? Math.ceil((taskOrder - progressionRule.firstBatchSize) / progressionRule.nextBatchSize) + 1
                    : null
                : null,
            },
          };
        });

        // Add totalCoins to offer for frontend
        offer.totalCoins = totalCoins;

        // Update threshold status based on completed tasks
        if (
          progressionRule &&
          completedTasksCount >= progressionRule.firstBatchSize
        ) {
          progression.thresholdReached = true;
        }

        // Add game-level progression information with full rule details
        offer.taskProgression = {
          hasProgressionRule: !!progressionRule,
          ruleId: progressionRule?._id || progressionRuleLean?._id || null,
          ruleName:
            progressionRule?.ruleName || progressionRuleLean?.ruleName || null,
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
            progression.thresholdReached && (progressionRule?.nextBatchSize === 0 || progressionRule?.nextBatchSize == null || progression.rewardTransferred),
        };

        // Add bonus task information if game is eligible
        if (isEligibleForBonus && bonusRule && bonusRule.gameBonusTasks) {
          console.log("✅ Game is eligible - checking for bonus config...");
          // Get the first enabled gameBonusTasks config as global template
          const gameBonusConfig = bonusRule.gameBonusTasks.find(
            (config) =>
              config.isEnabled &&
              config.bonusTasks &&
              config.bonusTasks.length > 0,
          );

          if (gameBonusConfig) {
            console.log("✅ Bonus config found for game:", {
              gameId: gameBonusConfig.gameId,
              minimumEventThreshold: gameBonusConfig.minimumEventThreshold,
              completionDeadlineHours: gameBonusConfig.completionDeadlineHours,
              bonusTasksCount: gameBonusConfig.bonusTasks?.length || 0,
            });
            const userInternalEvents = userGame?.playCount || 0;
            const minimumEventThreshold = gameBonusConfig.minimumEventThreshold;
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
                  (t) => t.taskId === taskIdString,
                );
                const isCompleted = userTask?.completed || false;
                const completedAt = userTask?.completedAt || null;

                // Calculate unlock status based on ACTUAL completion
                let isUnlocked = false;
                let unlockReason = "";
                let unlockTime = bonusTaskUnlocks[taskIdString] || null;

                if (index === 0) {
                  // Task 1: Unlocks immediately
                  if (!unlockTime) {
                    isUnlocked = true;
                    unlockTime = new Date();
                    unlockReason = "Unlocks immediately";
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
                    (t) => t.order === bt.order - 1,
                  );
                  const previousTaskId =
                    previousTask?.taskId._id || previousTask?.taskId;
                  const previousTaskIdString = previousTaskId.toString();
                  const previousUserTask = userTasks.find(
                    (t) => t.taskId === previousTaskIdString,
                  );
                  const previousTaskCompleted =
                    previousUserTask?.completed || false;
                  const eventThresholdMet =
                    userInternalEvents >= minimumEventThreshold;

                  if (unlockTime) {
                    isUnlocked = true;
                    unlockReason = "Unlocked";
                  } else if (previousTaskCompleted && eventThresholdMet) {
                    isUnlocked = true;
                    unlockTime = new Date();
                    unlockReason =
                      "Previous task completed and event threshold met";
                  } else if (!previousTaskCompleted) {
                    unlockReason = `Complete Bonus Task ${bt.order - 1} first`;
                  } else if (!eventThresholdMet) {
                    unlockReason = `Reach ${minimumEventThreshold} internal events (current: ${userInternalEvents})`;
                  }
                }

                // Calculate shared completion deadline
                const completionDeadline = sharedDeadlineStartTime
                  ? new Date(
                      sharedDeadlineStartTime.getTime() +
                        completionDeadlineHours * 60 * 60 * 1000,
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

            // Add bonus tasks info to offer
            offer.bonusTasks = {
              hasBonusTasks: true,
              isEligible: true,
              minimumEventThreshold: minimumEventThreshold,
              completionDeadlineHours: completionDeadlineHours,
              taskLogic: "sequential",
              bonusTasks: formattedBonusTasks,
              userProgress: {
                internalEvents: userInternalEvents,
                eventThresholdMet: userInternalEvents >= minimumEventThreshold,
                gameDownloadTime: gameDownloadTime,
              },
              maxGamesWithBonusTasks: maxGamesWithBonus,
              userDownloadOrder:
                sortedGames.findIndex(
                  (g) => String(g.gameId) === currentGameIdString,
                ) + 1,
            };
            console.log("✅ Bonus tasks added to offer:", {
              bonusTasksCount: formattedBonusTasks.length,
              unlockedCount: formattedBonusTasks.filter((bt) => bt.isUnlocked)
                .length,
              completedCount: formattedBonusTasks.filter((bt) => bt.isCompleted)
                .length,
            });
          } else {
            offer.bonusTasks = {
              hasBonusTasks: false,
              isEligible: true,
              bonusTasks: [],
              message: "No bonus tasks configured",
            };
          }
        } else {
          offer.bonusTasks = {
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

    // Add user XP tier to response
    const userXpTier = getUserXpTier(user);

    // Process offers without matching games (add basic structure, no progression rules)
    for (const offer of offersWithoutGame) {
      if (!offer || !offer.id) continue;

      // Add basic progression structure (no rules applied)
      const payableEvents =
        offer.events?.filter((e) => e.payable === true) || [];
      const completedEvents = payableEvents.filter(
        (e) => e.status === "completed" || e.approved_conversions > 0,
      );

      // Add basic taskProgression structure
      offer.taskProgression = {
        hasProgressionRule: false,
        ruleId: null,
        ruleName: null,
        appliedMilestones: null,
        firstBatchSize: null,
        nextBatchSize: null,
        maxBatches: null,
        completedTasks: completedEvents.length,
        thresholdReached: false,
        rewardTransferred: false,
        coinBoxBalance: 0,
        canTransfer: false,
        canUnlockNextTasks: false,
      };

      // Add basic bonusTasks structure
      offer.bonusTasks = {
        hasBonusTasks: false,
        isEligible: false,
        bonusTasks: [],
        message: "Game not found in database - progression rules unavailable",
      };

      // Add basic progression to events (all unlocked since no rules)
      if (offer.events && Array.isArray(offer.events)) {
        const totalPoints = parseFloat(offer.total_points) || 0;
        const amount = parseFloat(offer.amount) || 0;
        const totalCoins = totalPoints > 0 && amount > 0 ? Math.round(amount * coinsPerDollar) : 0;
        offer.events = offer.events.map((event) => {
          const eventPoints = parseInt(event.points) || 0;
          const coinReward = totalPoints > 0 && eventPoints > 0
            ? Math.round((eventPoints / totalPoints) * totalCoins)
            : 0;
          if (!event.payable) return { ...event, coinReward };
          return {
            ...event,
            coinReward,
            progression: {
              isUnlocked: true,
              isLocked: false,
              unlockReason: "No progression rules applied",
              batchNumber: null,
            },
          };
        });
        offer.totalCoins = totalCoins;
      }
    }

    // Combine all processed offers (with and without game matching)
    // Offers with game matching are already in the offers array (modified in place)
    // Offers without game matching are in offersWithoutGame (now processed)
    // Filter out offers that are in offersWithoutGame from the original offers array
    const offersWithGame = offers.filter(
      (o) => o && o.id && !offersWithoutGame.includes(o),
    );
    const allProcessedOffers = [...offersWithGame, ...offersWithoutGame];

    // Transform Bitlabs offers to match Besitos structure: in_progress, available, completed
    // Organize offers by completion status (same as Besitos)
    const inProgressOffers = [];
    const availableOffers = [];
    const completedOffers = [];

    for (const offer of allProcessedOffers) {
      if (!offer || !offer.id) continue;

      // Check if offer is completed (all payable events completed)
      const payableEvents =
        offer.events?.filter((e) => e.payable === true) || [];
      const completedEvents = payableEvents.filter(
        (e) => e.status === "completed" || e.approved_conversions > 0,
      );
      const isCompleted =
        payableEvents.length > 0 &&
        completedEvents.length === payableEvents.length;

      // Check if offer has been started (at least one event completed)
      const hasStarted = completedEvents.length > 0;

      if (isCompleted) {
        completedOffers.push(offer);
      } else if (hasStarted) {
        inProgressOffers.push(offer);
      } else {
        availableOffers.push(offer);
      }
    }

    // Build response data matching Besitos structure exactly
    const responseData = {
      in_progress: inProgressOffers,
      available: availableOffers,
      completed: completedOffers,
      userXpTier: userXpTier,
      totalDownloadedGames: user.games?.length || 0,
      gamesSummary: {
        total: user.games?.length || 0,
        available: availableOffers.length,
        inProgress: inProgressOffers.length,
        completed: completedOffers.length,
      },
      taskProgressionRule:
        progressionRule || progressionRuleLean
          ? {
              ruleId: progressionRule?._id || progressionRuleLean?._id || null,
              ruleName:
                progressionRule?.ruleName ||
                progressionRuleLean?.ruleName ||
                null,
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
                progressionRule?.priority ||
                progressionRuleLean?.priority ||
                null,
            }
          : null,
    };

    // Return same structure as Besitos: { data: {...}, status: "success", trace_id: "..." }
    // Frontend can use same code for both Besitos and Bitlabs responses
    res.json({
      data: responseData,
      status: "success",
      trace_id: `bitlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });
  } catch (error) {
    logger.error("Error fetching Bitlabs user offer history", {
      error: error.message,
      userId: req.params.userId,
      offerId: req.params.offerId,
    });

    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Failed to fetch user offer history",
        code: "BITLABS_USER_HISTORY_ERROR",
      },
    });
  }
};

/**
 * Health check
 * @route GET /api/bitlabs/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
  try {
    const health = await bitlabsService.healthCheck();

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

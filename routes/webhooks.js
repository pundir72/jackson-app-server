/**
 * Webhook Routes
 * Handle callbacks from third-party services (Besitos, BitLabs, etc.)
 * @module routes/webhooks
 */

const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const config = require("../config/config");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const BesitosConversion = require("../models/BesitosConversion");
const EverflowConversion = require("../models/EverflowConversion");
const DailyChallenge = require("../models/DailyChallenge");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const AdjustCallback = require("../models/AdjustCallback");
const Game = require("../models/Game");
const GameTask = require("../models/GameTask");
const TaskProgressionRule = require("../models/TaskProgressionRule");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");
const {
  getUserXpTier,
  getUserMembershipTier,
} = require("../utils/taskProgression");
const streakRouter = require("./streak");
const getStreakConfig = streakRouter.getStreakConfig;
const getMilestoneReward = streakRouter.getMilestoneReward;

/**
 * @route   POST /api/webhooks/besitos/conversion
 * @desc    Handle Besitos conversion webhook
 * @body    {string} userId - User ID
 * @body    {string} offerId - Offer ID
 * @body    {string} conversionId - Conversion ID from Besitos
 * @body    {string} status - Conversion status
 * @body    {number} rewardAmount - Reward amount
 * @access  Public (but should verify signature in production)
 */
router.post("/besitos/conversion", async (req, res) => {
  try {
    const {
      userId,
      offerId,
      conversionId,
      status,
      rewardAmount,
      taskId,
      metadata,
    } = req.body;

    console.log("Besitos webhook received:", {
      userId,
      offerId,
      conversionId,
      status,
    });

    // Validate required fields
    if (!userId || !offerId || !status) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, offerId, status",
      });
    }

    // Find the user
    const user = await User.findById(userId).select("wallet xp streak");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Create or update Besitos conversion record
    let conversion = await BesitosConversion.findOne({ conversionId });

    if (!conversion) {
      conversion = new BesitosConversion({
        userId,
        besitosUserId: metadata?.besitosUserId || userId,
        offerId,
        offerName: metadata?.offerName || "Unknown Offer",
        offerType: metadata?.offerType || "other",
        conversionId,
        conversionStatus: status,
        rewardAmount: rewardAmount || 0,
        eventTimestamp: new Date(),
        metadata: metadata || {},
      });
    } else {
      conversion.conversionStatus = status;
      if (status === "completed") {
        conversion.completedAt = new Date();
      }
    }

    await conversion.save();

    // If conversion is completed, check if it's part of a daily challenge
    if (status === "completed") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find today's challenge with this SDK task
      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: "live",
        "sdkTask.provider": "besitos",
        "sdkTask.offerId": offerId,
      });

      if (challenge) {
        // Get user's progress for this challenge
        let progress = await UserChallengeProgress.getUserChallengeForDate(
          userId,
          today
        );

        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            userId,
            challenge._id,
            today
          );
        }

        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: taskId || conversionId,
          conversionId: conversion._id,
        };

        // Mark challenge as completed
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward,
        });

        // Credit user rewards (apply tier multiplier to XP)
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp = challenge.xpReward;
        const { finalXP, multiplier: tierMultiplier } =
          await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        // Update streak
        const todayStr = today.toISOString().split("T")[0];
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
            const milestoneReward = getMilestoneReward(
              newStreak,
              STREAK_CONFIG
            );

            if (
              milestoneReward &&
              milestoneReward.rewards &&
              milestoneReward.rewards.length > 0
            ) {
              const rewardsEarned = [];

              // Award all rewards for this milestone
              for (const reward of milestoneReward.rewards) {
                if (reward.type === "coins") {
                  user.wallet.balance =
                    (user.wallet.balance || 0) + reward.value;
                } else if (reward.type === "xp") {
                  const { finalXP: milestoneXP } =
                    await applyTierMultiplierToXP(user, reward.value);
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
                    milestoneReward.claimMode === "auto"
                      ? "completed"
                      : "pending",
                  referenceId: `STREAK-${newStreak}-${
                    reward.type
                  }-${Date.now()}`,
                  metadata: {
                    milestoneDay: newStreak,
                    rewardType: reward.type,
                    rewardValue: reward.value,
                    claimMode: milestoneReward.claimMode,
                    source: "besitos_webhook",
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

        await user.save();

        // Mark rewards as claimed
        await progress.claimRewards();

        // Update challenge analytics
        await challenge.updateAnalytics("complete", {
          coins: challenge.coinReward,
          xp: finalXP,
        });

        // Create transaction record
        const transaction = new Transaction({
          user: userId,
          type: "credit",
          amount: challenge.coinReward,
          description: `Daily Challenge (Besitos): ${challenge.title}`,
          status: "completed",
          metadata: {
            challengeId: challenge._id,
            conversionId: conversion._id,
            offerId,
            source: "besitos_webhook",
          },
          referenceId: `BESITOS-CHALLENGE-${challenge._id}-${Date.now()}`,
        });

        await transaction.save();

        // Update conversion with credits
        await conversion.creditRewards(challenge.coinReward, baseXp);

        console.log(
          `Daily challenge completed via Besitos webhook for user ${userId}`
        );
      }
    }

    res.json({
      success: true,
      message: "Webhook processed successfully",
      data: {
        conversionId: conversion._id,
        status: conversion.conversionStatus,
        challengeCompleted: conversion.isCredited,
      },
    });
  } catch (error) {
    console.error("Error processing Besitos webhook:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process webhook",
      message: error.message,
    });
  }
});

/**
 * Verify Besitos postback verifier hash
 * @param {Object} queryParams - All query parameters from the request
 * @param {string} receivedVerifier - The verifier hash from Besitos
 * @returns {boolean} Whether the verifier is valid
 */
function verifyBesitosHash(queryParams, receivedVerifier) {
  console.log("\n--- Hash Verification Details ---");
  const secret = config.BESITOS_WEBHOOK_SECRET;
  console.log("Secret Key Configured:", secret ? "YES" : "NO");
  console.log("Secret Key Length:", secret ? secret.length : 0);
  console.log(
    "Secret Key (first 10 chars):",
    secret ? secret.substring(0, 10) + "..." : "N/A"
  );

  if (!secret) {
    console.warn(
      "⚠️ BESITOS_WEBHOOK_SECRET not configured, skipping verification"
    );
    return true; // Allow if not configured
  }

  if (!receivedVerifier) {
    console.warn("⚠️ No verifier provided in Besitos postback");
    return false;
  }

  console.log(
    "Received Verifier (first 20 chars):",
    receivedVerifier.substring(0, 20) + "..."
  );
  console.log("Received Verifier Length:", receivedVerifier.length);

  // Remove verifier from params for hash calculation
  const { verifier, ...paramsToHash } = queryParams;
  console.log(
    "Parameters to hash (excluding verifier):",
    Object.keys(paramsToHash).sort()
  );

  // Sort parameters alphabetically and create hash string
  const sortedKeys = Object.keys(paramsToHash).sort();
  const hashString = sortedKeys
    .map((key) => `${key}=${paramsToHash[key]}`)
    .join("&");

  console.log("Hash String:", hashString);
  console.log("Hash String Length:", hashString.length);

  // Calculate hash using SHA256 HMAC
  const calculatedHash = crypto
    .createHmac("sha256", secret)
    .update(hashString)
    .digest("hex");

  console.log(
    "Calculated Hash (first 20 chars):",
    calculatedHash.substring(0, 20) + "..."
  );
  console.log("Calculated Hash Length:", calculatedHash.length);
  console.log(
    "Received Verifier (first 20 chars):",
    receivedVerifier.substring(0, 20) + "..."
  );

  const isValid = calculatedHash === receivedVerifier;
  console.log("Hash Match:", isValid ? "✅ MATCH" : "❌ MISMATCH");

  if (!isValid) {
    console.warn("❌ Besitos verifier hash mismatch!");
    console.warn("Calculated Hash:", calculatedHash);
    console.warn("Received Verifier:", receivedVerifier);
    console.warn("Hash String Used:", hashString);
    console.warn("Secret Key Used:", secret);
  } else {
    console.log("✅ Hash verification successful!");
  }

  return isValid;
}

/**
 * @route   GET /api/webhooks/besitos/postback
 * @desc    Handle Besitos conversion postback (GET request)
 * @query   {string} user_id - User ID from Besitos (case-insensitive)
 * @query   {string} transaction_id - Transaction ID (unique)
 * @query   {string} reward - Reward amount in USD
 * @query   {string} payout - Payout amount in USD
 * @query   {string} offer_id - Offer ID (for games)
 * @query   {string} offer_name - Offer name (for games)
 * @query   {string} note - Conversion note/description
 * @query   {string} reward_local_currency - Reward in local currency
 * @query   {string} goal_id - Goal ID (if API enabled)
 * @query   {string} verifier - Hash verifier for security
 * @query   {string} type - Type: "offer", "survey", or "deal"
 * @query   {string} survey_id - Survey ID (if type is survey)
 * @query   {string} deal_id - Deal ID (if type is deal)
 * @query   {string} deal_name - Deal name (if type is deal)
 * @query   {string} reverse - "1" if reversal, otherwise not sent
 * @query   {string} info - Optional info parameter from your URL
 * @access  Public (but verifier should be verified)
 */
router.get("/besitos/postback", async (req, res) => {
  try {
    console.log("\n=== BESITOS POSTBACK START ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request Method:", req.method);
    console.log("Request URL:", req.originalUrl);
    console.log("Request IP:", req.ip);

    const {
      user_id,
      transaction_id,
      reward,
      payout,
      offer_id,
      offer_name,
      note,
      reward_local_currency,
      goal_id,
      verifier,
      type,
      survey_id,
      deal_id,
      deal_name,
      reverse,
      info,
    } = req.query;

    console.log("\n--- All Query Parameters ---");
    console.log("Raw Query Params:", JSON.stringify(req.query, null, 2));
    console.log("\n--- Parsed Parameters ---");
    console.log("user_id:", user_id);
    console.log("transaction_id:", transaction_id);
    console.log("reward:", reward);
    console.log("payout:", payout);
    console.log("offer_id:", offer_id);
    console.log("offer_name:", offer_name);
    console.log("deal_id:", deal_id);
    console.log("deal_name:", deal_name);
    console.log("survey_id:", survey_id);
    console.log("type:", type);
    console.log("goal_id:", goal_id);
    console.log("note:", note);
    console.log("reward_local_currency:", reward_local_currency);
    console.log("reverse:", reverse);
    console.log("info:", info);
    console.log("verifier:", verifier ? "***PRESENT***" : "MISSING");
    console.log("hasVerifier:", !!verifier);

    // Verify the verifier hash for security
    console.log("\n--- Verifier Hash Verification ---");
    console.log(
      "Secret Key (from config):",
      config.BESITOS_WEBHOOK_SECRET ? "***CONFIGURED***" : "NOT CONFIGURED"
    );
    console.log(
      "Secret Key Length:",
      config.BESITOS_WEBHOOK_SECRET ? config.BESITOS_WEBHOOK_SECRET.length : 0
    );

    if (verifier) {
      console.log("Verifier received:", verifier.substring(0, 20) + "...");
      const isValid = verifyBesitosHash(req.query, verifier);
      console.log(
        "Verifier validation result:",
        isValid ? "✅ VALID" : "❌ INVALID"
      );

      if (!isValid) {
        console.error("❌ Invalid Besitos verifier hash - REJECTING REQUEST");
        // Still return 200 to prevent retries, but log the error
        return res.status(200).json({
          success: false,
          error: "Invalid verifier hash",
        });
      } else {
        console.log("✅ Verifier hash is valid - proceeding with request");
      }
    } else {
      console.warn(
        "⚠️ Besitos postback received without verifier - proceeding without verification"
      );
    }

    // Check if this is a reversal
    const isReversal = reverse === "1";

    // Determine offer ID and name based on type
    const finalOfferId = offer_id || deal_id || survey_id;
    const finalOfferName = offer_name || deal_name || "Unknown Offer";
    const offerType =
      type || (survey_id ? "survey" : deal_id ? "deal" : "game");

    // Find user by user_id (case-insensitive per Besitos docs)
    console.log("\n--- User Lookup ---");
    console.log("Searching for user_id:", user_id);

    // Try to find by MongoDB _id first, then by besitos userId
    let user = null;

    // Try direct ID match first
    try {
      console.log("Attempting direct MongoDB _id lookup...");
      user = await User.findById(user_id).select("wallet xp streak");
      if (user) {
        console.log("✅ User found by MongoDB _id:", user._id);
      } else {
        console.log("❌ User not found by MongoDB _id");
      }
    } catch (e) {
      console.log(
        "⚠️ MongoDB _id lookup failed (not a valid ObjectId):",
        e.message
      );
      // Not a valid ObjectId, continue to search
    }

    // If not found, search by besitos userId (case-insensitive)
    if (!user) {
      console.log("Attempting besitos.userId lookup (case-insensitive)...");
      user = await User.findOne({
        $or: [
          { "besitos.userId": { $regex: new RegExp(`^${user_id}$`, "i") } },
          { _id: { $regex: new RegExp(`^${user_id}$`, "i") } },
        ],
      }).select("wallet xp streak");

      if (user) {
        console.log("✅ User found by besitos.userId:", user._id);
        console.log("User besitos.userId:", user.besitos?.userId);
      } else {
        console.log("❌ User not found by besitos.userId");
      }
    }

    if (!user) {
      console.error(
        "❌ User not found for Besitos postback - user_id:",
        user_id
      );
      console.log("=== BESITOS POSTBACK END (USER NOT FOUND) ===\n");
      // Still return 200 to prevent Besitos from retrying
      return res.status(200).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("✅ User found successfully");
    console.log("User ID:", user._id);
    console.log("User Wallet Balance:", user.wallet?.balance || 0);
    console.log("User XP:", user.xp?.current || 0);

    // Create or update Besitos conversion record
    console.log("\n--- Conversion Record Processing ---");
    console.log("Transaction ID:", transaction_id);

    // Use transaction_id as unique identifier
    let conversion = await BesitosConversion.findOne({
      conversionId: transaction_id,
    });

    if (conversion) {
      console.log("✅ Existing conversion found:", conversion._id);
      console.log("Current conversion status:", conversion.conversionStatus);
    } else {
      console.log("📝 Creating new conversion record...");
    }

    if (!conversion) {
      conversion = new BesitosConversion({
        userId: user._id,
        besitosUserId: user_id,
        offerId: finalOfferId,
        offerName: finalOfferName,
        offerType:
          offerType === "survey"
            ? "survey"
            : offerType === "deal"
            ? "app_install"
            : "game",
        conversionId: transaction_id,
        conversionStatus: isReversal ? "reversed" : "completed",
        rewardAmount: parseFloat(reward) || 0,
        revenue: {
          amount: parseFloat(payout) || 0,
          currency: "USD",
        },
        rewardCurrency: "coins",
        eventTimestamp: new Date(),
        notes: note,
        metadata: {
          rewardLocalCurrency: parseFloat(reward_local_currency) || 0,
          goalId: goal_id,
          info: info,
          type: type,
          survey_id: survey_id,
          deal_id: deal_id,
          isReversal: isReversal,
        },
      });
    } else {
      // Update existing conversion (handle reversals)
      if (isReversal) {
        conversion.conversionStatus = "reversed";
        conversion.metadata = conversion.metadata || {};
        conversion.metadata.isReversal = true;
      } else {
        conversion.conversionStatus = "completed";
        conversion.completedAt = new Date();
      }
    }

    await conversion.save();
    console.log("✅ Conversion record saved:", conversion._id);
    console.log("Conversion Status:", conversion.conversionStatus);
    console.log("Reward Amount:", conversion.rewardAmount);
    console.log("Revenue Amount:", conversion.revenue?.amount);

    // If conversion is completed (not reversed), process rewards
    if (!isReversal && conversion.conversionStatus === "completed") {
      console.log("\n--- Processing Rewards (Not a Reversal) ---");
      // Check if it's part of a daily challenge
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: "live",
        "sdkTask.provider": "besitos",
        "sdkTask.offerId": finalOfferId,
      });

      if (challenge) {
        // Get user's progress for this challenge
        let progress = await UserChallengeProgress.getUserChallengeForDate(
          user._id,
          today
        );

        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            user._id,
            challenge._id,
            today
          );
        }

        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: goal_id || transaction_id,
          conversionId: conversion._id,
        };

        // Mark challenge as completed
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward,
        });

        // Credit user rewards (apply tier multiplier to XP)
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp = challenge.xpReward;
        const { finalXP, multiplier: tierMultiplier } =
          await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        // Update streak
        const todayStr = today.toISOString().split("T")[0];
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
            const milestoneReward = getMilestoneReward(
              newStreak,
              STREAK_CONFIG
            );

            if (
              milestoneReward &&
              milestoneReward.rewards &&
              milestoneReward.rewards.length > 0
            ) {
              const rewardsEarned = [];

              // Award all rewards for this milestone
              for (const reward of milestoneReward.rewards) {
                if (reward.type === "coins") {
                  user.wallet.balance =
                    (user.wallet.balance || 0) + reward.value;
                } else if (reward.type === "xp") {
                  const { finalXP: milestoneXP } =
                    await applyTierMultiplierToXP(user, reward.value);
                  user.xp.current = (user.xp.current || 0) + milestoneXP;
                  user.xp.total = (user.xp.total || 0) + milestoneXP;
                }

                // Create transaction record for each reward
                const milestoneTransaction = new Transaction({
                  user: user._id,
                  type: "credit",
                  balanceType: reward.type === "coins" ? "coins" : "xp",
                  amount: reward.value,
                  description: `Streak Milestone Reward - Day ${newStreak} - ${
                    reward.type === "coins" ? "Coins" : "XP"
                  }`,
                  status:
                    milestoneReward.claimMode === "auto"
                      ? "completed"
                      : "pending",
                  referenceId: `STREAK-${newStreak}-${
                    reward.type
                  }-${Date.now()}`,
                  metadata: {
                    milestoneDay: newStreak,
                    rewardType: reward.type,
                    rewardValue: reward.value,
                    claimMode: milestoneReward.claimMode,
                    source: "besitos_postback",
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

        await user.save();
        await progress.claimRewards();
        await challenge.updateAnalytics("complete", {
          coins: challenge.coinReward,
          xp: finalXP,
        });

        // Create single transaction record for coins and XP
        const baseReferenceId = `BESITOS-CHALLENGE-${challenge._id}-${Date.now()}`;
        
        // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
        const hasCoins = challenge.coinReward > 0;
        const hasXP = finalXP > 0;
        let primaryAmount = 0;
        let primaryBalanceType = "coins";

        if (hasCoins && hasXP) {
          // Both rewards - use coins as primary
          primaryAmount = challenge.coinReward;
          primaryBalanceType = "coins";
        } else if (hasCoins) {
          // Only coins
          primaryAmount = challenge.coinReward;
          primaryBalanceType = "coins";
        } else if (hasXP) {
          // Only XP
          primaryAmount = finalXP;
          primaryBalanceType = "xp";
        }

        const transaction = new Transaction({
          user: user._id,
          type: "credit",
          balanceType: primaryBalanceType,
          amount: primaryAmount,
          description: `Daily Challenge (Besitos): ${challenge.title}`,
          status: "completed",
          metadata: {
            challengeId: challenge._id,
            conversionId: conversion._id,
            offerId: finalOfferId,
            source: "besitos_postback",
            coins: challenge.coinReward || 0,
            xp: finalXP || 0,
            baseXp: baseXp,
            xpEarned: finalXP,
            finalXp: finalXP,
            tierMultiplier: tierMultiplier,
          },
          referenceId: baseReferenceId,
        });

        await transaction.save();
        await conversion.creditRewards(challenge.coinReward, baseXp);

        console.log("✅ Daily challenge completed via Besitos postback");
        console.log("User ID:", user._id);
        console.log("Final Wallet Balance:", user.wallet.balance);
        console.log("Final XP:", user.xp.current);
      } else {
        console.log("ℹ️ No matching daily challenge found for this offer");

        // Process as regular game task completion if goal_id is provided
        if (goal_id && finalOfferId && offerType === "game") {
          console.log("\n--- Processing Game Task Completion ---");
          console.log("Goal ID:", goal_id);
          console.log("Offer ID:", finalOfferId);

          try {
            // Find the game by offerId (besitos game ID)
            const game = await Game.findOne({
              gameId: finalOfferId,
              sdkProvider: "besitos",
            }).lean();

            if (game) {
              console.log("✅ Game found:", game._id, game.title);

              // Find the task by goal_id - check multiple possible formats
              const task = await GameTask.findOne({
                gameId: game._id,
                $or: [
                  { besitosGoalId: goal_id },
                  { "besitosRawData.goal_id": goal_id },
                  { name: { $regex: new RegExp(goal_id, "i") } },
                ],
              }).lean();

              if (task) {
                console.log("✅ Task found:", task._id, task.name);

                // Get full user with taskProgression
                const fullUser = await User.findById(user._id).select(
                  "taskProgression games tasks xp vip wallet"
                );

                // Build user profile for progression rule matching
                const gamesDownloaded = fullUser.games?.length || 0;
                const membershipTier = getUserMembershipTier(fullUser);
                const userProfile = {
                  xp: fullUser.xp?.current || 0,
                  gamesPlayed: gamesDownloaded,
                  membershipTier: membershipTier,
                };

                // Get user-based progression rule
                const progressionRule =
                  await TaskProgressionRule.findBestMatchForUser(userProfile);

                const gameIdString = game._id.toString();
                const taskIdString = task._id.toString();

                // Initialize task progression if needed
                if (!fullUser.taskProgression) {
                  fullUser.taskProgression = new Map();
                }

                let progression = fullUser.taskProgression.get(gameIdString);
                if (!progression) {
                  // Count existing completed tasks for this game
                  const completedGameTasks =
                    fullUser.tasks?.filter(
                      (t) => t.completed && String(t.gameId) === gameIdString
                    ) || [];

                  progression = {
                    completedTasks: completedGameTasks.length,
                    thresholdReached: false,
                    rewardTransferred: false,
                    coinBoxBalance: 0,
                  };
                }

                // Check if task is already completed
                const existingTask = fullUser.tasks?.find(
                  (t) => String(t.taskId) === taskIdString && t.completed
                );

                if (!existingTask) {
                  // Mark task as completed
                  if (!fullUser.tasks) {
                    fullUser.tasks = [];
                  }

                  const taskRecord = {
                    taskId: task._id,
                    gameId: game._id,
                    completed: true,
                    completedAt: new Date(),
                    rewardType: task.rewardType || "coins",
                    rewardValue:
                      task.rewardValue || conversion.rewardAmount || 0,
                  };

                  fullUser.tasks.push(taskRecord);

                  // Increment completed tasks count
                  progression.completedTasks =
                    (progression.completedTasks || 0) + 1;

                  // Check if first batch (threshold) is reached
                  if (
                    progressionRule &&
                    progression.completedTasks >= progressionRule.firstBatchSize
                  ) {
                    progression.thresholdReached = true;
                    console.log("✅ First batch threshold reached!");
                  }

                  // Calculate reward amount
                  const rewardAmount =
                    task.rewardValue || conversion.rewardAmount || 0;

                  // Apply coin box logic if progression rule exists
                  if (progressionRule && task.rewardType === "coins") {
                    // If threshold not reached or reward not transferred, accumulate in coin box
                    if (
                      !progression.thresholdReached ||
                      !progression.rewardTransferred
                    ) {
                      progression.coinBoxBalance =
                        (progression.coinBoxBalance || 0) + rewardAmount;
                      console.log("💰 Reward added to coin box:", rewardAmount);
                      console.log(
                        "💰 Coin box balance:",
                        progression.coinBoxBalance
                      );
                    } else {
                      // Add directly to wallet if threshold reached and transferred
                      fullUser.wallet.balance =
                        (fullUser.wallet.balance || 0) + rewardAmount;
                      fullUser.wallet.lastUpdated = new Date();
                      console.log("💰 Reward added to wallet:", rewardAmount);
                    }
                  } else if (task.rewardType === "coins") {
                    // No progression rule - add directly to wallet
                    fullUser.wallet.balance =
                      (fullUser.wallet.balance || 0) + rewardAmount;
                    fullUser.wallet.lastUpdated = new Date();
                    console.log(
                      "💰 Reward added to wallet (no progression rule):",
                      rewardAmount
                    );
                  }

                  // Handle XP rewards (always go to wallet)
                  if (task.rewardType === "xp") {
                    const xpAmount = task.rewardValue || 0;
                    const { finalXP } = await applyTierMultiplierToXP(
                      fullUser,
                      xpAmount
                    );
                    fullUser.xp.current = (fullUser.xp.current || 0) + finalXP;
                    fullUser.xp.total = (fullUser.xp.total || 0) + finalXP;
                    console.log("⭐ XP added:", finalXP);
                  }

                  // Save progression
                  fullUser.taskProgression.set(gameIdString, progression);

                  // Create transaction record
                  const transaction = new Transaction({
                    user: fullUser._id,
                    type: "credit",
                    amount: task.rewardType === "coins" ? rewardAmount : 0,
                    balanceType: task.rewardType === "coins" ? "coins" : "xp",
                    description: `Game task completed via Besitos - ${game.title} - ${task.name}`,
                    status: "completed",
                    referenceId: `BESITOS-TASK-${gameIdString}-${taskIdString}-${Date.now()}`,
                    gameId: game.gameId,
                    game: game._id,
                    metadata: {
                      gameId: game.gameId,
                      taskId: taskIdString,
                      goalId: goal_id,
                      conversionId: conversion._id,
                      source: "besitos_webhook",
                      coinBoxAccumulated:
                        progressionRule &&
                        !progression.thresholdReached &&
                        task.rewardType === "coins",
                    },
                  });

                  await transaction.save();
                  await fullUser.save();

                  console.log("✅ Task completion processed successfully");
                  console.log("Completed tasks:", progression.completedTasks);
                  console.log(
                    "Threshold reached:",
                    progression.thresholdReached
                  );
                  console.log("Coin box balance:", progression.coinBoxBalance);
                } else {
                  console.log("ℹ️ Task already completed, skipping");
                }
              } else {
                console.log("⚠️ Task not found for goal_id:", goal_id);
              }
            } else {
              console.log("⚠️ Game not found for offer_id:", finalOfferId);
            }
          } catch (error) {
            console.error("❌ Error processing game task completion:", error);
            // Continue processing even if task completion fails
          }
        }
      }
    } else {
      console.log("\n--- Skipping Rewards (Reversal or Not Completed) ---");
      console.log("Is Reversal:", isReversal);
      console.log("Conversion Status:", conversion.conversionStatus);
    }

    // Always return 200 OK to Besitos (they retry on errors)
    console.log("\n--- Final Response ---");
    console.log("Status: SUCCESS");
    console.log("Response: Postback processed successfully");
    console.log("=== BESITOS POSTBACK END (SUCCESS) ===\n");

    res.status(200).json({
      success: true,
      message: "Postback processed successfully",
    });
  } catch (error) {
    console.error("\n❌ ERROR PROCESSING BESITOS POSTBACK");
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.log("=== BESITOS POSTBACK END (ERROR) ===\n");

    // Still return 200 to prevent Besitos from retrying
    res.status(200).json({
      success: false,
      error: "Failed to process postback",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/webhooks/bitlabs/completion
 * @desc    Handle BitLabs survey completion webhook
 * @body    {string} userId - User ID
 * @body    {string} surveyId - Survey ID
 * @body    {string} status - Completion status
 * @body    {number} reward - Reward amount
 * @access  Public (but should verify signature in production)
 */
router.post("/bitlabs/completion", async (req, res) => {
  try {
    const { userId, surveyId, status, reward, metadata } = req.body;

    // BitLabs webhook received

    // Validate required fields
    if (!userId || !surveyId || !status) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, surveyId, status",
      });
    }

    if (status === "completed") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find today's challenge with this survey
      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: "live",
        "sdkTask.provider": "bitlabs",
        "sdkTask.taskId": surveyId,
      });

      if (challenge) {
        const user = await User.findById(userId).select("wallet xp streak");
        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        let progress = await UserChallengeProgress.getUserChallengeForDate(
          userId,
          today
        );

        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            userId,
            challenge._id,
            today
          );
        }

        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: surveyId,
        };

        // Complete the challenge (store base XP)
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward,
        });

        // CRITICAL: Increment continuous challenges completed counter (not daily-based)
        const accountOverviewService = require('../utils/accountOverview');
        await accountOverviewService.incrementChallengesCompletedCounter(userId);

        // Credit user (apply tier multiplier to XP)
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp2 = challenge.xpReward;
        const { finalXP: finalXP2, multiplier: tierMultiplier2 } =
          await applyTierMultiplierToXP(user, baseXp2);

        user.xp.current = (user.xp.current || 0) + finalXP2;
        user.xp.total = (user.xp.total || 0) + finalXP2;

        // Update streak
        const todayStr = today.toISOString().split("T")[0];
        const streak = user.streak || {};
        if (!streak.completedTasks) streak.completedTasks = [];

        let newStreak = streak.current || 0;
        let milestoneRewardEarned = null;

        if (!streak.completedTasks.includes(todayStr)) {
          streak.completedTasks.push(todayStr);
          newStreak = (streak.current || 0) + 1;
          streak.current = newStreak;
          streak.lastUpdated = new Date();
          user.streak = streak;

          // Check for milestone rewards
          try {
            const STREAK_CONFIG = await getStreakConfig();
            const milestoneReward = getMilestoneReward(
              newStreak,
              STREAK_CONFIG
            );

            if (
              milestoneReward &&
              milestoneReward.rewards &&
              milestoneReward.rewards.length > 0
            ) {
              const rewardsEarned = [];

              // Award all rewards for this milestone
              for (const reward of milestoneReward.rewards) {
                if (reward.type === "coins") {
                  user.wallet.balance =
                    (user.wallet.balance || 0) + reward.value;
                } else if (reward.type === "xp") {
                  const { finalXP: milestoneXP } =
                    await applyTierMultiplierToXP(user, reward.value);
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
                    milestoneReward.claimMode === "auto"
                      ? "completed"
                      : "pending",
                  referenceId: `STREAK-${newStreak}-${
                    reward.type
                  }-${Date.now()}`,
                  metadata: {
                    milestoneDay: newStreak,
                    rewardType: reward.type,
                    rewardValue: reward.value,
                    claimMode: milestoneReward.claimMode,
                    source: "bitlabs_webhook",
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

        await user.save();
        await progress.claimRewards();
        await challenge.updateAnalytics("complete", {
          coins: challenge.coinReward,
          xp: finalXP2,
        });

        // Create single transaction record for coins and XP
        const baseReferenceId = `BITLABS-CHALLENGE-${challenge._id}-${Date.now()}`;
        
        // Determine primary balance type and amount (use coins if both exist, otherwise use whichever exists)
        const hasCoins = challenge.coinReward > 0;
        const hasXP = finalXP2 > 0;
        let primaryAmount = 0;
        let primaryBalanceType = "coins";

        if (hasCoins && hasXP) {
          // Both rewards - use coins as primary
          primaryAmount = challenge.coinReward;
          primaryBalanceType = "coins";
        } else if (hasCoins) {
          // Only coins
          primaryAmount = challenge.coinReward;
          primaryBalanceType = "coins";
        } else if (hasXP) {
          // Only XP
          primaryAmount = finalXP2;
          primaryBalanceType = "xp";
        }

        const transaction = new Transaction({
          user: userId,
          type: "credit",
          balanceType: primaryBalanceType,
          amount: primaryAmount,
          description: `Daily Challenge (BitLabs): ${challenge.title}`,
          status: "completed",
          metadata: {
            challengeId: challenge._id,
            surveyId: surveyId,
            source: "bitlabs_webhook",
            coins: challenge.coinReward || 0,
            xp: finalXP2 || 0,
            baseXp: baseXp2,
            xpEarned: finalXP2,
            finalXp: finalXP2,
            tierMultiplier: tierMultiplier2,
          },
          referenceId: baseReferenceId,
        });

        await transaction.save();

        console.log(
          `Daily challenge completed via BitLabs webhook for user ${userId}`
        );
      }
    }

    res.json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("Error processing BitLabs webhook:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process webhook",
    });
  }
});

/**
 * @route   POST /api/webhooks/adjust/callback
 * @desc    Handle Adjust raw data export callbacks
 * @access  Public (Adjust sends data to this endpoint)
 * @body    Adjust callback data (varies by activity type)
 * @note    Documentation: https://help.adjust.com/en/article/raw-data-exports
 *
 * Adjust sends raw data for various activities:
 * - Impressions, Clicks, Installs, Sessions
 * - In-app events, Reattributions
 * - ATT status updates, SKAdNetwork data
 * - Updated attributions, Ad spend
 * - Erased users (GDPR), Ad revenue
 * - Subscriptions, Uninstalls, Reinstalls
 * - Rejected installs/reattributions
 */
router.all("/adjust/callback", async (req, res) => {
  try {
    // Handle both POST (JSON body) and GET (query parameters)
    // Client configured GET with query params: ?click_label=abc&network=facebook...
    const callbackData = req.method === 'GET' ? req.query : req.body;
    
    console.log(`Adjus callback received via ${req.method}:`, callbackData);
    console.log("Adjust callback received:", {
      method: req.method,
      activityKind: callbackData.activity_kind || callbackData.activityKind,
      appToken: callbackData.app_token || callbackData.appToken,
      clickLabel: callbackData.click_label || callbackData.clickLabel,
      network: callbackData.network,
      timestamp: new Date().toISOString(),
    });

    // Determine activity kind
    const activityKind =
      callbackData.activity_kind || callbackData.activityKind || "unknown";

    // Extract common fields
    const adjustCallback = new AdjustCallback({
      activityKind: activityKind,
      appToken: callbackData.app_token || callbackData.appToken,
      trackerToken: callbackData.tracker_token || callbackData.trackerToken,
      trackerName: callbackData.tracker_name || callbackData.trackerName,
      network: callbackData.network,
      campaign: callbackData.campaign,
      adgroup: callbackData.adgroup,
      creative: callbackData.creative,
      clickLabel: callbackData.click_label || callbackData.clickLabel,

      // Device identifiers
      idfa: callbackData.idfa,
      idfv: callbackData.idfv,
      gpsAdid: callbackData.gps_adid || callbackData.gpsAdid,
      fireAdid: callbackData.fire_adid || callbackData.fireAdid,
      oaid: callbackData.oaid,
      webUuid: callbackData.web_uuid || callbackData.webUuid,
      androidId: callbackData.android_id || callbackData.androidId,

      // Adjust user ID
      adjustUserId:
        callbackData.adid ||
        callbackData.adjustId ||
        callbackData.user_id ||
        callbackData.userId,

      // Event information (for in-app events)
      eventToken: callbackData.event_token || callbackData.eventToken,
      eventName: callbackData.event_name || callbackData.eventName,
      revenue: callbackData.revenue ? Number(callbackData.revenue) : null,
      currency: callbackData.currency,
      callbackParams:
        callbackData.callback_params || callbackData.callbackParams,
      partnerParams: callbackData.partner_params || callbackData.partnerParams,

      // Timestamps
      clickTime:
        callbackData.click_time || callbackData.clickTime
          ? new Date(callbackData.click_time || callbackData.clickTime)
          : null,
      installTime:
        callbackData.install_time || callbackData.installTime
          ? new Date(callbackData.install_time || callbackData.installTime)
          : null,
      eventTime:
        callbackData.event_time || callbackData.eventTime
          ? new Date(callbackData.event_time || callbackData.eventTime)
          : null,
      createdAtAdjust:
        callbackData.created_at || callbackData.createdAt
          ? new Date(callbackData.created_at || callbackData.createdAt)
          : new Date(),

      // Attribution information
      attributionType:
        callbackData.attribution_type || callbackData.attributionType,
      attributionWindow:
        callbackData.attribution_window || callbackData.attributionWindow,
      isOrganic:
        callbackData.is_organic ||
        callbackData.isOrganic === true ||
        callbackData.isOrganic === "true",
      isReattribution:
        callbackData.is_reattribution ||
        callbackData.isReattribution === true ||
        callbackData.isReattribution === "true",

      // Location information
      country: callbackData.country,
      region: callbackData.region,
      city: callbackData.city,
      ipAddress: callbackData.ip_address || callbackData.ipAddress || req.ip,
      userAgent:
        callbackData.user_agent ||
        callbackData.userAgent ||
        req.headers["user-agent"],

      // Platform information
      platform: callbackData.platform,
      osVersion: callbackData.os_version || callbackData.osVersion,
      appVersion: callbackData.app_version || callbackData.appVersion,
      deviceType: callbackData.device_type || callbackData.deviceType,
      deviceName: callbackData.device_name || callbackData.deviceName,

      // SKAdNetwork information (iOS)
      skadnetworkConversionValue:
        callbackData.skadnetwork_conversion_value ||
        callbackData.skadnetworkConversionValue,
      skadnetworkCoarseValue:
        callbackData.skadnetwork_coarse_value ||
        callbackData.skadnetworkCoarseValue,
      skadnetworkLockWindow:
        callbackData.skadnetwork_lock_window ||
        callbackData.skadnetworkLockWindow,
      skadnetworkPostbackSequenceIndex:
        callbackData.skadnetwork_postback_sequence_index ||
        callbackData.skadnetworkPostbackSequenceIndex,
      skPayload: callbackData.sk_payload || callbackData.skPayload,
      skVersion: callbackData.sk_version || callbackData.skVersion,
      skNetworkId: callbackData.sk_network_id || callbackData.skNetworkId,
      skCampaignId: callbackData.sk_campaign_id || callbackData.skCampaignId,
      skFidelityType:
        callbackData.sk_fidelity_type || callbackData.skFidelityType,
      nonce: callbackData.nonce,

      // Additional timestamps
      installedAt:
        callbackData.installed_at || callbackData.installedAt
          ? new Date(callbackData.installed_at || callbackData.installedAt)
          : null,
      impressionTime:
        callbackData.impression_time || callbackData.impressionTime
          ? new Date(callbackData.impression_time || callbackData.impressionTime)
          : null,
      uninstallTime:
        callbackData.uninstall_time || callbackData.uninstallTime
          ? new Date(callbackData.uninstall_time || callbackData.uninstallTime)
          : null,

      // Attribution details
      matchType: callbackData.match_type || callbackData.matchType,

      // Platform details
      osName: callbackData.os_name || callbackData.osName,
      deviceManufacturer:
        callbackData.device_manufacturer || callbackData.deviceManufacturer,
      store: callbackData.store,

      // iOS ATT
      attStatus:
        callbackData.att_status || callbackData.attStatus
          ? Number(callbackData.att_status || callbackData.attStatus)
          : null,

      // Reporting revenue
      reportingRevenue:
        callbackData.reporting_revenue || callbackData.reportingRevenue
          ? Number(callbackData.reporting_revenue || callbackData.reportingRevenue)
          : null,

      // Publisher parameter
      publisherParameter:
        callbackData.publisher_parameter || callbackData.publisherParameter,

      // Subscription information
      subscriptionPeriod:
        callbackData.subscription_period || callbackData.subscriptionPeriod,
      subscriptionState:
        callbackData.subscription_state || callbackData.subscriptionState,
      subscriptionProductId:
        callbackData.subscription_product_id ||
        callbackData.subscriptionProductId,

      // Cost/Ad Spend Data (from Adjust callbacks)
      costAmount: callbackData.cost_amount ? Number(callbackData.cost_amount) : null,
      costCurrency: callbackData.cost_currency || callbackData.costCurrency || null,
      costType: callbackData.cost_type || callbackData.costType || null,

      // Store raw data
      rawData: callbackData,
    });

    // Try to find user by device identifiers or Adjust user ID
    // Note: Adjust user ID can be stored in user metadata or we can match by device identifiers
    // For now, we'll store the Adjust user ID in the callback and process it later
    // You can enhance this by storing adjustUserId in User.metadata if needed

    // Save callback
    await adjustCallback.save();

    // Process based on activity kind
    setImmediate(async () => {
      try {
        await processAdjustCallback(adjustCallback);
        adjustCallback.processed = true;
        adjustCallback.processedAt = new Date();
        await adjustCallback.save();
      } catch (error) {
        console.error("Error processing Adjust callback:", error);
        adjustCallback.processingError = error.message;
        await adjustCallback.save();
      }
    });

    // Always return 200 OK to Adjust (they retry on errors)
    res.status(200).json({
      success: true,
      message: "Callback received and queued for processing",
      callbackId: adjustCallback._id,
    });
  } catch (error) {
    console.error("Error processing Adjust callback:", error);
    // Still return 200 to prevent Adjust from retrying
    res.status(200).json({
      success: false,
      error: "Callback received but processing failed",
      message: error.message,
    });
  }
});

/**
 * Process Adjust callback based on activity kind
 * @param {Object} callback - AdjustCallback document
 */
async function processAdjustCallback(callback) {
  switch (callback.activityKind) {
    case "install":
      await processInstall(callback);
      break;
    case "event":
      await processEvent(callback);
      break;
    case "session":
      await processSession(callback);
      break;
    case "ad_revenue":
      await processAdRevenue(callback);
      break;
    case "reattribution":
      await processReattribution(callback);
      break;
    case "uninstall":
      await processUninstall(callback);
      break;
    case "reinstall":
      await processReinstall(callback);
      break;
    default:
      console.log(
        `No specific processing for activity kind: ${callback.activityKind}`
      );
  }
}

/**
 * Process install callback
 */
async function processInstall(callback) {
  let user;

  // Bug 2 Fix: Try to find user by userId first, then by adjustUserId
  if (callback.userId) {
    user = await User.findById(callback.userId);
  }

  // If not found by userId, try to find by adjustUserId in metadata or AdjustCallback
  if (!user && callback.adjustUserId) {
    // First check if any user has this adjustUserId in metadata
    user = await User.findOne({ 'metadata.adjust.userId': callback.adjustUserId });

    // If found, link the userId to this AdjustCallback
    if (user) {
      callback.userId = user._id;
      await callback.save();
      console.log(`Linked AdjustCallback ${callback._id} to user ${user._id} via adjustUserId`);
    }
  }

  // If still not found, try to find by adjustUserId in other AdjustCallback records
  if (!user && callback.adjustUserId) {
    const existingCallback = await AdjustCallback.findOne({
      adjustUserId: callback.adjustUserId,
      userId: { $exists: true, $ne: null }
    }).sort({ createdAt: -1 });

    if (existingCallback && existingCallback.userId) {
      user = await User.findById(existingCallback.userId);
      if (user) {
        callback.userId = user._id;
        await callback.save();
        console.log(`Linked AdjustCallback ${callback._id} to user ${user._id} via existing callback`);
      }
    }
  }

  if (user) {
    // Store Adjust user ID in metadata
    if (!user.metadata) {
      user.metadata = {};
    }
    if (!user.metadata.adjust) {
      user.metadata.adjust = {};
    }
    user.metadata.adjust.userId = callback.adjustUserId;

    // Store attribution information in metadata
    user.metadata.adjust.attribution = {
      trackerToken: callback.trackerToken,
      trackerName: callback.trackerName,
      network: callback.network,
      campaign: callback.campaign,
      adgroup: callback.adgroup,
      creative: callback.creative,
      isOrganic: callback.isOrganic,
      installTime: callback.installTime || callback.createdAtAdjust,
    };

    // Update device information if available
    if (callback.platform) {
      user.device.type = callback.platform;
    }
    if (callback.deviceType) {
      user.device.model = callback.deviceType;
    }
    if (callback.osVersion) {
      user.device.os = callback.osVersion;
    }
    user.device.lastUpdated = new Date();

    await user.save();
    console.log(`Processed Adjust install for user ${user._id}`);
  } else {
    console.log(`No user found for AdjustCallback ${callback._id} with adjustUserId: ${callback.adjustUserId}`);
  }
}

/**
 * Process in-app event callback
 */
async function processEvent(callback) {
  // Events are already tracked via S2S API, but we can log them here
  console.log(
    `Adjust event received: ${callback.eventName || callback.eventToken}`,
    {
      userId: callback.userId,
      revenue: callback.revenue,
      currency: callback.currency,
    }
  );

  // You can add additional processing here if needed
  // e.g., update user analytics, trigger notifications, etc.
}

/**
 * Process session callback
 */
async function processSession(callback) {
  // Log session for analytics
  console.log(
    `Adjust session received for user ${
      callback.userId || callback.adjustUserId
    }`
  );

  // You can add session tracking logic here
}

/**
 * Process ad revenue callback
 */
async function processAdRevenue(callback) {
  // Ad revenue is already tracked via S2S API, but we can log it here
  console.log(`Adjust ad revenue received:`, {
    userId: callback.userId,
    revenue: callback.revenue,
    currency: callback.currency,
    network: callback.network,
  });
}

/**
 * Process reattribution callback
 */
async function processReattribution(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Initialize metadata if needed
      if (!user.metadata) {
        user.metadata = {};
      }
      if (!user.metadata.adjust) {
        user.metadata.adjust = {};
      }
      if (!user.metadata.adjust.attribution) {
        user.metadata.adjust.attribution = {};
      }

      // Update attribution information
      user.metadata.adjust.attribution.trackerToken = callback.trackerToken;
      user.metadata.adjust.attribution.trackerName = callback.trackerName;
      user.metadata.adjust.attribution.network = callback.network;
      user.metadata.adjust.attribution.campaign = callback.campaign;
      user.metadata.adjust.attribution.isReattribution = true;
      user.metadata.adjust.attribution.reattributionTime =
        callback.createdAtAdjust;

      await user.save();
      console.log(`Processed Adjust reattribution for user ${callback.userId}`);
    }
  }
}

/**
 * Process uninstall callback
 */
async function processUninstall(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Mark user as uninstalled
      if (!user.metadata) {
        user.metadata = {};
      }
      user.metadata.uninstalled = true;
      user.metadata.uninstalledAt = callback.createdAtAdjust || new Date();

      await user.save();
      console.log(`Processed Adjust uninstall for user ${callback.userId}`);
    }
  }
}

/**
 * Process reinstall callback
 */
async function processReinstall(callback) {
  if (callback.userId) {
    const user = await User.findById(callback.userId);
    if (user) {
      // Mark user as reinstalled
      if (user.metadata && user.metadata.uninstalled) {
        user.metadata.uninstalled = false;
        user.metadata.reinstalled = true;
        user.metadata.reinstalledAt = callback.createdAtAdjust || new Date();

        await user.save();
        console.log(`Processed Adjust reinstall for user ${callback.userId}`);
      }
    }
  }
}

/**
 * @route   POST /api/webhooks/everflow/postback
 * @desc    Handle Everflow conversion postback (POST request)
 * @body    {Object} - Everflow postback data
 * @access  Public (but should verify signature in production)
 */
router.post("/everflow/postback", async (req, res) => {
  try {
    console.log("\n=== EVERFLOW POSTBACK START ===");
    console.log("Everflow postback received:", JSON.stringify(req.body, null, 2));
    console.log("Headers:", JSON.stringify(req.headers, null, 2));

    const postbackData = req.body;

    // Extract key fields from Everflow postback
    // Everflow postback structure: uses sub_id1, sub_id2, etc. for user tracking
    // Reference: https://developers.everflow.io/docs/affiliate/postbacks/
    const {
      transaction_id,
      offer_id,
      network_id,
      advertiser_id,
      conversion_id,
      goal_id,
      user_id,
      sub_id1,        // Everflow uses sub_id1 for user tracking
      sub_id2,         // Additional tracking parameter
      sub_id3,         // Additional tracking parameter
      revenue,
      payout,
      currency,
      status,
      event_timestamp,
      conversion_status,
      ip,
      user_agent,
      country,
      offer_name,
      ...additionalData
    } = postbackData;

    // Validate required fields
    if (!transaction_id && !conversion_id) {
      console.warn("⚠️ Everflow postback missing transaction_id/conversion_id");
      return res.status(400).json({
        success: false,
        error: "Missing required fields: transaction_id or conversion_id",
      });
    }

    // Verify webhook signature if configured
    // Everflow signature verification method (check documentation for exact method)
    if (config.EVERFLOW_WEBHOOK_SECRET) {
      const signature = req.headers["x-everflow-signature"] || 
                       req.headers["x-signature"] || 
                       req.headers["x-eflow-signature"] ||
                       req.body.signature;
      
      if (signature) {
        const crypto = require("crypto");
        
        // Everflow may use different signature methods:
        // Method 1: HMAC SHA256 of request body
        const bodyString = typeof postbackData === "string" 
          ? postbackData 
          : JSON.stringify(postbackData);
        
        const expectedSignature = crypto
          .createHmac("sha256", config.EVERFLOW_WEBHOOK_SECRET)
          .update(bodyString)
          .digest("hex");

        // Compare signatures (case-insensitive for some implementations)
        if (signature.toLowerCase() !== expectedSignature.toLowerCase() && 
            signature !== expectedSignature) {
          console.error("❌ Everflow postback signature verification failed");
          console.error("   Expected:", expectedSignature);
          console.error("   Received:", signature);
          return res.status(401).json({
            success: false,
            error: "Invalid signature",
          });
        }
        
        console.log("✅ Everflow postback signature verified");
      } else {
        console.warn("⚠️ Everflow postback received without signature - proceeding without verification");
      }
    } else {
      console.warn("⚠️ EVERFLOW_WEBHOOK_SECRET not configured, skipping verification");
    }

    // Find user by Everflow tracking parameters
    // Everflow uses sub_id1, sub_id2, sub_id3 for user tracking
    // sub_id1 is typically used for user ID
    let user = null;
    
    // Priority 1: Try sub_id1 (primary user tracking parameter)
    if (sub_id1) {
      // sub_id1 should contain our user's MongoDB ObjectId
      if (require("mongoose").Types.ObjectId.isValid(sub_id1)) {
        user = await User.findById(sub_id1);
      } else {
        // If not ObjectId, try as string match in metadata
        user = await User.findOne({
          "metadata.everflow.sub_id1": sub_id1,
        });
      }
    }
    
    // Priority 2: Try user_id from postback
    if (!user && user_id) {
      // Try to find user by Everflow user_id stored in metadata
      user = await User.findOne({
        "metadata.everflow.userId": user_id,
      });
      
      // Also try direct ObjectId if user_id is valid ObjectId
      if (!user && require("mongoose").Types.ObjectId.isValid(user_id)) {
        user = await User.findById(user_id);
      }
    }
    
    // Priority 3: Try to extract from transaction_id or conversion_id (existing conversion)
    if (!user && transaction_id) {
      // Check if we have a conversion record with this transaction_id
      const existingConversion = await EverflowConversion.findOne({
        everflowTransactionId: transaction_id,
      });
      if (existingConversion && existingConversion.userId) {
        user = await User.findById(existingConversion.userId);
      }
    }
    
    // Priority 4: Try conversion_id
    if (!user && conversion_id) {
      const existingConversion = await EverflowConversion.findOne({
        conversionId: conversion_id,
      });
      if (existingConversion && existingConversion.userId) {
        user = await User.findById(existingConversion.userId);
      }
    }

    if (!user) {
      console.warn("⚠️ User not found for Everflow postback - transaction_id:", transaction_id);
      // Still save the conversion for later processing
      const conversion = new EverflowConversion({
        userId: new require("mongoose").Types.ObjectId(), // Placeholder
        everflowTransactionId: transaction_id,
        offerId: offer_id || "unknown",
        offerName: additionalData.offer_name || "Unknown Offer",
        networkId: network_id,
        advertiserId: advertiser_id,
        conversionId: conversion_id || transaction_id,
        postbackId: goal_id,
        conversionStatus: conversion_status || status || "pending",
        rewardAmount: payout || revenue || 0,
        revenue: {
          amount: revenue || payout || 0,
          currency: currency || "USD",
        },
        eventTimestamp: event_timestamp ? new Date(event_timestamp) : new Date(),
        metadata: {
          ip,
          userAgent: user_agent,
          country,
          additionalData,
        },
        notes: "User not found - pending user association",
      });

      await conversion.save();
      return res.status(200).json({
        success: true,
        message: "Postback received but user not found - saved for later processing",
        conversionId: conversion._id,
      });
    }

    console.log("✅ User found:", user._id.toString());

    // Create or update Everflow conversion record
    let conversion = await EverflowConversion.findOne({
      $or: [
        { everflowTransactionId: transaction_id },
        { conversionId: conversion_id || transaction_id },
      ],
    });

    if (!conversion) {
      conversion = new EverflowConversion({
        userId: user._id,
        everflowTransactionId: transaction_id,
        offerId: offer_id || "unknown",
        offerName: additionalData.offer_name || additionalData.offer_name || "Unknown Offer",
        networkId: network_id,
        advertiserId: advertiser_id,
        conversionId: conversion_id || transaction_id,
        postbackId: goal_id,
        conversionStatus: conversion_status || status || "pending",
        rewardAmount: payout || revenue || 0,
        revenue: {
          amount: revenue || payout || 0,
          currency: currency || "USD",
        },
        eventTimestamp: event_timestamp ? new Date(event_timestamp) : new Date(),
        metadata: {
          ip,
          userAgent: user_agent,
          country,
          additionalData,
        },
      });
    } else {
      // Update existing conversion
      conversion.conversionStatus = conversion_status || status || conversion.conversionStatus;
      if (conversion_status === "approved" || status === "approved" || conversion_status === "completed" || status === "completed") {
        conversion.completedAt = new Date();
      }
      if (revenue || payout) {
        conversion.revenue = {
          amount: revenue || payout || 0,
          currency: currency || conversion.revenue?.currency || "USD",
        };
      }
    }

    await conversion.save();
    console.log("✅ Conversion record saved:", conversion._id);

    // If conversion is completed/approved, process rewards
    const isCompleted = conversion.conversionStatus === "completed" || 
                        conversion.conversionStatus === "approved" ||
                        status === "approved" ||
                        status === "completed";

    if (isCompleted && !conversion.isCredited) {
      console.log("\n--- Processing Everflow Rewards ---");
      
      // Check if it's part of a daily challenge
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: "live",
        "sdkTask.provider": "everflow",
        "sdkTask.offerId": offer_id,
      });

      if (challenge) {
        // Get user's progress for this challenge
        let progress = await UserChallengeProgress.getUserChallengeForDate(
          user._id,
          today
        );

        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            user._id,
            challenge._id,
            today
          );
        }

        // Update SDK task progress
        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: transaction_id || conversion_id,
          conversionId: conversion._id,
        };

        // Mark challenge as completed
        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward,
        });

        // CRITICAL: Increment continuous challenges completed counter (not daily-based)
        const accountOverviewService = require('../utils/accountOverview');
        await accountOverviewService.incrementChallengesCompletedCounter(user._id);

        // Credit user rewards
        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp = challenge.xpReward;
        const { finalXP } = await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        await user.save();

        // Mark conversion as credited
        await conversion.creditRewards(challenge.coinReward, finalXP);

        console.log(
          `✅ Daily challenge completed via Everflow webhook for user ${user._id}`
        );
      } else {
        // No challenge: Everflow fixed reward — 30 coins and 10 XP per conversion
        const coinsToCredit = 30;
        const xpToCredit = 10;

        user.wallet.balance = (user.wallet.balance || 0) + coinsToCredit;
        const { finalXP } = await applyTierMultiplierToXP(user, xpToCredit);
        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        await user.save();

        // Create transaction record
        const transaction = new Transaction({
          userId: user._id,
          type: "credit",
          amount: coinsToCredit,
          currency: "coins",
          description: `Everflow conversion - ${conversion.offerName}`,
          referenceId: transaction_id || conversion_id,
          metadata: {
            source: "everflow_webhook",
            conversionId: conversion._id,
            offerId: offer_id,
            revenue: revenue || payout || 0,
          },
        });
        await transaction.save();

        // Mark conversion as credited
        await conversion.creditRewards(coinsToCredit, finalXP);

        console.log(
          `✅ Rewards credited via Everflow webhook: ${coinsToCredit} coins, ${finalXP} XP`
        );
      }
    }

    console.log("=== EVERFLOW POSTBACK END ===\n");

    res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: {
        conversionId: conversion._id,
        status: conversion.conversionStatus,
        credited: conversion.isCredited,
      },
    });
  } catch (error) {
    console.error("❌ Error processing Everflow webhook:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process webhook",
      message: error.message,
    });
  }
});

/**
 * Shared function to process Everflow postback
 */
async function processEverflowPostback(postbackData, req, res) {
  try {
    // Extract key fields from Everflow postback
    // Everflow uses sub_id1, sub_id2, etc. for user tracking
    const {
      transaction_id,
      offer_id,
      network_id,
      advertiser_id,
      conversion_id,
      goal_id,
      user_id,
      sub_id1,        // Primary user tracking parameter
      sub_id2,
      sub_id3,
      revenue,
      payout,
      currency,
      status,
      event_timestamp,
      conversion_status,
      ip,
      user_agent,
      country,
      offer_name,
      ...additionalData
    } = postbackData;

    // Validate required fields
    if (!transaction_id && !conversion_id) {
      console.warn("⚠️ Everflow postback missing transaction_id/conversion_id");
      return res.status(400).json({
        success: false,
        error: "Missing required fields: transaction_id or conversion_id",
      });
    }

    // Verify webhook signature if configured (same as above)
    if (config.EVERFLOW_WEBHOOK_SECRET) {
      const signature = req.headers["x-everflow-signature"] || 
                       req.headers["x-signature"] || 
                       req.headers["x-eflow-signature"] ||
                       postbackData.signature;
      
      if (signature) {
        const crypto = require("crypto");
        const bodyString = typeof postbackData === "string" 
          ? postbackData 
          : JSON.stringify(postbackData);
        
        const expectedSignature = crypto
          .createHmac("sha256", config.EVERFLOW_WEBHOOK_SECRET)
          .update(bodyString)
          .digest("hex");

        if (signature.toLowerCase() !== expectedSignature.toLowerCase() && 
            signature !== expectedSignature) {
          console.error("❌ Everflow postback signature verification failed");
          return res.status(401).json({
            success: false,
            error: "Invalid signature",
          });
        }
        
        console.log("✅ Everflow postback signature verified");
      } else {
        console.warn("⚠️ Everflow postback received without signature - proceeding without verification");
      }
    } else {
      console.warn("⚠️ EVERFLOW_WEBHOOK_SECRET not configured, skipping verification");
    }

    // Find user by Everflow user_id (sub_id1), sub_id1, or transaction metadata
    // Everflow sends user ID as sub_id1 in postback
    let user = null;
    const everflowUserId = user_id || sub_id1 || postbackData.sub_id_1;
    
    if (everflowUserId) {
      // Try multiple lookup methods:
      // 1. Direct user ID if sub_id1 is our internal user ID
      try {
        user = await User.findById(everflowUserId);
      } catch (e) {
        // Not a valid ObjectId, try other methods
      }
      
      // 2. Find by Everflow user_id stored in metadata
      if (!user) {
        user = await User.findOne({
          "metadata.everflow.userId": everflowUserId,
        });
      }
      
      // 3. Find by sub_id1 in metadata
      if (!user) {
        user = await User.findOne({
          "metadata.everflow.sub_id1": everflowUserId,
        });
      }
    }

    if (!user && transaction_id) {
      const existingConversion = await EverflowConversion.findOne({
        everflowTransactionId: transaction_id,
      });
      if (existingConversion) {
        user = await User.findById(existingConversion.userId);
      }
    }

    if (!user) {
      console.warn("⚠️ User not found for Everflow postback - transaction_id:", transaction_id);
      const conversion = new EverflowConversion({
        userId: new require("mongoose").Types.ObjectId(),
        everflowTransactionId: transaction_id,
        offerId: offer_id || "unknown",
        offerName: offer_name || "Unknown Offer",
        networkId: network_id,
        advertiserId: advertiser_id,
        conversionId: conversion_id || transaction_id,
        postbackId: goal_id,
        conversionStatus: conversion_status || status || "pending",
        rewardAmount: payout || revenue || 0,
        revenue: {
          amount: revenue || payout || 0,
          currency: currency || "USD",
        },
        eventTimestamp: event_timestamp ? new Date(event_timestamp) : new Date(),
        metadata: {
          ip,
          userAgent: user_agent,
          country,
          additionalData,
        },
        notes: "User not found - pending user association",
      });

      await conversion.save();
      return res.status(200).json({
        success: true,
        message: "Postback received but user not found - saved for later processing",
        conversionId: conversion._id,
      });
    }

    console.log("✅ User found:", user._id.toString());

    let conversion = await EverflowConversion.findOne({
      $or: [
        { everflowTransactionId: transaction_id },
        { conversionId: conversion_id || transaction_id },
      ],
    });

    if (!conversion) {
      conversion = new EverflowConversion({
        userId: user._id,
        everflowTransactionId: transaction_id,
        offerId: offer_id || "unknown",
        offerName: offer_name || "Unknown Offer",
        networkId: network_id,
        advertiserId: advertiser_id,
        conversionId: conversion_id || transaction_id,
        postbackId: goal_id,
        conversionStatus: conversion_status || status || "pending",
        rewardAmount: payout || revenue || 0,
        revenue: {
          amount: revenue || payout || 0,
          currency: currency || "USD",
        },
        eventTimestamp: event_timestamp ? new Date(event_timestamp) : new Date(),
        metadata: {
          ip,
          userAgent: user_agent,
          country,
          additionalData,
        },
      });
    } else {
      conversion.conversionStatus = conversion_status || status || conversion.conversionStatus;
      if (conversion_status === "approved" || status === "approved" || conversion_status === "completed" || status === "completed") {
        conversion.completedAt = new Date();
      }
      if (revenue || payout) {
        conversion.revenue = {
          amount: revenue || payout || 0,
          currency: currency || conversion.revenue?.currency || "USD",
        };
      }
    }

    await conversion.save();
    console.log("✅ Conversion record saved:", conversion._id);

    const isCompleted = conversion.conversionStatus === "completed" || 
                        conversion.conversionStatus === "approved" ||
                        status === "approved" ||
                        status === "completed";

    if (isCompleted && !conversion.isCredited) {
      console.log("\n--- Processing Everflow Rewards ---");
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const challenge = await DailyChallenge.findOne({
        challengeDate: today,
        isVisible: true,
        status: "live",
        "sdkTask.provider": "everflow",
        "sdkTask.offerId": offer_id,
      });

      if (challenge) {
        let progress = await UserChallengeProgress.getUserChallengeForDate(
          user._id,
          today
        );

        if (!progress) {
          progress = await UserChallengeProgress.getOrCreateTodayChallenge(
            user._id,
            challenge._id,
            today
          );
        }

        progress.sdkTaskProgress = {
          taskStarted: true,
          taskCompleted: true,
          externalTaskId: transaction_id || conversion_id,
          conversionId: conversion._id,
        };

        await progress.markCompleted({
          coins: challenge.coinReward,
          xp: challenge.xpReward,
        });

        // CRITICAL: Increment continuous challenges completed counter (not daily-based)
        const accountOverviewService = require('../utils/accountOverview');
        await accountOverviewService.incrementChallengesCompletedCounter(user._id);

        user.wallet.balance = (user.wallet.balance || 0) + challenge.coinReward;
        const baseXp = challenge.xpReward;
        const { finalXP } = await applyTierMultiplierToXP(user, baseXp);

        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        await user.save();
        await conversion.creditRewards(challenge.coinReward, finalXP);

        console.log(
          `✅ Daily challenge completed via Everflow webhook for user ${user._id}`
        );
      } else {
        // Everflow fixed reward: 30 coins and 10 XP per conversion
        const coinsToCredit = 30;
        const xpToCredit = 10;

        user.wallet.balance = (user.wallet.balance || 0) + coinsToCredit;
        const { finalXP } = await applyTierMultiplierToXP(user, xpToCredit);
        user.xp.current = (user.xp.current || 0) + finalXP;
        user.xp.total = (user.xp.total || 0) + finalXP;

        await user.save();

        const transaction = new Transaction({
          userId: user._id,
          type: "credit",
          amount: coinsToCredit,
          currency: "coins",
          description: `Everflow conversion - ${conversion.offerName}`,
          referenceId: transaction_id || conversion_id,
          metadata: {
            source: "everflow_webhook",
            conversionId: conversion._id,
            offerId: offer_id,
            revenue: revenue || payout || 0,
          },
        });
        await transaction.save();
        await conversion.creditRewards(coinsToCredit, finalXP);

        console.log(
          `✅ Rewards credited via Everflow webhook: ${coinsToCredit} coins, ${finalXP} XP`
        );
      }
    }

    console.log("=== EVERFLOW POSTBACK END ===\n");

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
      data: {
        conversionId: conversion._id,
        status: conversion.conversionStatus,
        credited: conversion.isCredited,
      },
    });
  } catch (error) {
    console.error("❌ Error processing Everflow postback:", error);
    throw error;
  }
}

/**
 * @route   POST /api/webhooks/everflow/postback
 * @desc    Handle Everflow conversion postback (POST request)
 * @body    {Object} - Everflow postback data
 * @access  Public (but should verify signature in production)
 */
// REMOVED DUPLICATE - Using the first implementation at line 1603

/**
 * @route   GET /api/webhooks/everflow/postback
 * @desc    Handle Everflow conversion postback (GET request - for URL-based postbacks)
 * @query   {string} transaction_id - Transaction ID
 * @query   {string} offer_id - Offer ID
 * @query   {string} status - Conversion status
 * @access  Public
 */
router.get("/everflow/postback", async (req, res) => {
  try {
    console.log("\n=== EVERFLOW GET POSTBACK START ===");
    console.log("Query params:", req.query);

    const postbackData = {
      transaction_id: req.query.transaction_id,
      offer_id: req.query.offer_id,
      network_id: req.query.network_id,
      conversion_id: req.query.conversion_id,
      goal_id: req.query.goal_id,
      user_id: req.query.user_id,
      sub_id1: req.query.sub_id1 || req.query.sub_id_1, // Everflow user tracking
      sub_id2: req.query.sub_id2 || req.query.sub_id_2,
      sub_id3: req.query.sub_id3 || req.query.sub_id_3,
      revenue: req.query.revenue ? parseFloat(req.query.revenue) : null,
      payout: req.query.payout ? parseFloat(req.query.payout) : null,
      currency: req.query.currency || "USD",
      status: req.query.status,
      conversion_status: req.query.conversion_status || req.query.status,
      event_timestamp: req.query.event_timestamp,
      ip: req.ip || req.connection.remoteAddress,
      user_agent: req.headers["user-agent"],
      country: req.query.country,
      offer_name: req.query.offer_name,
    };

    await processEverflowPostback(postbackData, req, res);
  } catch (error) {
    console.error("❌ Error processing Everflow GET postback:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process webhook",
    });
  }
});

module.exports = router;

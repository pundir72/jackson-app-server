/**
 * AppLovin MAX Routes
 * Handle rewarded ad tracking and reward crediting
 * @module routes/applovin
 */

const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const config = require("../config/config");
const AppLovinRewardedAd = require("../models/AppLovinRewardedAd");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const DailyChallenge = require("../models/DailyChallenge");
const UserChallengeProgress = require("../models/UserChallengeProgress");
const { applyTierMultiplierToXP } = require("../utils/xpTierMultiplier");

/**
 * @route   GET /api/applovin/config
 * @desc    Get AppLovin MAX SDK configuration for frontend
 * @access  Protected
 */
router.get("/config", protect, async (req, res) => {
  try {
    if (!config.APPLOVIN_MAX_SDK_KEY) {
      return res.status(400).json({
        success: false,
        error: "AppLovin MAX SDK key is not configured",
      });
    }

    res.json({
      success: true,
      data: {
        sdkKey: config.APPLOVIN_MAX_SDK_KEY,
        adUnitId: "rewarded", // Default ad unit ID, can be configured per placement
        supportedNetworks: [
          "Facebook",
          "Google AdMob",
          "Digital Turbine",
          "Inmobi",
          "Mintegral",
          "Bidmachine",
          "Liftoff/Vungle",
          "Pangle",
          "Moloco",
          "Google Ad Manager",
        ],
        placement: "rewarded",
      },
    });
  } catch (error) {
    console.error("Error getting AppLovin config:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get AppLovin configuration",
    });
  }
});

/**
 * @route   POST /api/applovin/rewarded-ad/load
 * @desc    Track when a rewarded ad is loaded
 * @body    {string} adUnitId - Ad unit ID
 * @body    {string} placement - Ad placement (optional)
 * @access  Protected
 */
router.post("/rewarded-ad/load", protect, async (req, res) => {
  try {
    const { adUnitId = "rewarded", placement = "rewarded" } = req.body;

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Create ad load record
    const adRecord = new AppLovinRewardedAd({
      userId: user._id,
      adUnitId,
      placement,
      status: "loaded",
      loadedAt: new Date(),
      metadata: {
        platform: req.body.platform || "unknown",
        country: user.location?.current?.country || "US",
        deviceType: req.body.deviceType || "mobile",
        userAgent: req.headers["user-agent"],
        ip: req.ip || req.connection.remoteAddress,
        appVersion: req.body.appVersion,
        sdkVersion: req.body.sdkVersion,
      },
    });

    await adRecord.save();

    res.json({
      success: true,
      data: {
        adRecordId: adRecord._id,
        message: "Ad load tracked successfully",
      },
    });
  } catch (error) {
    console.error("Error tracking ad load:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track ad load",
    });
  }
});

/**
 * @route   POST /api/applovin/rewarded-ad/display
 * @desc    Track when a rewarded ad is displayed
 * @body    {string} adRecordId - Ad record ID from load
 * @access  Protected
 */
router.post("/rewarded-ad/display", protect, async (req, res) => {
  try {
    const { adRecordId } = req.body;

    if (!adRecordId) {
      return res.status(400).json({
        success: false,
        error: "adRecordId is required",
      });
    }

    const adRecord = await AppLovinRewardedAd.findOne({
      _id: adRecordId,
      userId: req.user.userId,
    });

    if (!adRecord) {
      return res.status(404).json({
        success: false,
        error: "Ad record not found",
      });
    }

    await adRecord.markDisplayed();

    res.json({
      success: true,
      data: {
        adRecordId: adRecord._id,
        status: adRecord.status,
        message: "Ad display tracked successfully",
      },
    });
  } catch (error) {
    console.error("Error tracking ad display:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track ad display",
    });
  }
});

/**
 * @route   POST /api/applovin/rewarded-ad/complete
 * @desc    Track rewarded ad completion and credit rewards
 * @body    {string} adRecordId - Ad record ID from load
 * @body    {Object} reward - Reward data from AppLovin
 * @body    {string} adNetwork - Ad network that served the ad
 * @body    {Object} metadata - Additional metadata
 * @access  Protected
 */
router.post("/rewarded-ad/complete", protect, async (req, res) => {
  try {
    const {
      adRecordId,
      reward,
      adNetwork,
      networkName,
      revenue,
      metadata = {},
    } = req.body;

    if (!adRecordId) {
      return res.status(400).json({
        success: false,
        error: "adRecordId is required",
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Find ad record
    const adRecord = await AppLovinRewardedAd.findOne({
      _id: adRecordId,
      userId: user._id,
    });

    if (!adRecord) {
      return res.status(404).json({
        success: false,
        error: "Ad record not found",
      });
    }

    // Update ad record with completion data
    adRecord.status = "completed";
    adRecord.completedAt = new Date();

    if (adNetwork) {
      adRecord.adNetwork = adNetwork;
    }

    if (networkName) {
      adRecord.metadata.networkName = networkName;
    }

    if (reward) {
      adRecord.rewardAmount = reward.amount || reward.amount || 0;
      adRecord.rewardCurrency = reward.currency || reward.label || "coins";
    }

    if (revenue) {
      adRecord.metadata.revenue = {
        amount: revenue.amount || revenue || 0,
        currency: revenue.currency || "USD",
      };
    }

    // Merge additional metadata
    if (metadata.platform) adRecord.metadata.platform = metadata.platform;
    if (metadata.country) adRecord.metadata.country = metadata.country;
    if (metadata.deviceType) adRecord.metadata.deviceType = metadata.deviceType;
    if (metadata.appVersion) adRecord.metadata.appVersion = metadata.appVersion;
    if (metadata.sdkVersion) adRecord.metadata.sdkVersion = metadata.sdkVersion;
    if (metadata.additionalData) {
      adRecord.metadata.additionalData = metadata.additionalData;
    }

    await adRecord.save();

    // Check if it's part of a daily challenge
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const challenge = await DailyChallenge.findOne({
      challengeDate: today,
      isVisible: true,
      status: "live",
      "sdkTask.provider": "applovin_max",
      "sdkTask.adUnitId": adRecord.adUnitId,
    });

    let coinsToCredit = 0;
    let xpToCredit = 0;

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
        externalTaskId: adRecord._id.toString(),
        adRecordId: adRecord._id,
      };

      // Mark challenge as completed
      await progress.markCompleted({
        coins: challenge.coinReward,
        xp: challenge.xpReward,
      });

      coinsToCredit = challenge.coinReward;
      xpToCredit = challenge.xpReward;

      console.log(
        `✅ Daily challenge completed via AppLovin MAX for user ${user._id}`
      );
    } else {
      // No challenge, use default rewards or reward from ad
      // Default: 100 coins per rewarded ad (adjust as needed)
      coinsToCredit = reward?.amount || 100;
      xpToCredit = Math.floor(coinsToCredit / 10); // 1 XP per 10 coins
    }

    // Credit rewards to user
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
      description: `AppLovin MAX rewarded ad - ${adRecord.adUnitId}`,
      referenceId: adRecord._id.toString(),
      metadata: {
        source: "applovin_max",
        adRecordId: adRecord._id,
        adUnitId: adRecord.adUnitId,
        adNetwork: adRecord.adNetwork,
        networkName: adRecord.metadata.networkName,
        revenue: adRecord.metadata.revenue?.amount || 0,
        challengeId: challenge?._id,
      },
    });
    await transaction.save();

    // Mark ad record as credited
    await adRecord.creditRewards(coinsToCredit, finalXP);

    console.log(
      `✅ Rewards credited via AppLovin MAX: ${coinsToCredit} coins, ${finalXP} XP`
    );

    res.json({
      success: true,
      data: {
        adRecordId: adRecord._id,
        status: adRecord.status,
        rewards: {
          coins: coinsToCredit,
          xp: finalXP,
        },
        newBalance: user.wallet.balance,
        newXP: user.xp.current,
        challengeCompleted: !!challenge,
        message: "Rewarded ad completed and rewards credited",
      },
    });
  } catch (error) {
    console.error("Error processing rewarded ad completion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process rewarded ad completion",
      message: error.message,
    });
  }
});

/**
 * @route   POST /api/applovin/rewarded-ad/failed
 * @desc    Track when a rewarded ad fails to load or display
 * @body    {string} adRecordId - Ad record ID (optional if creating new)
 * @body    {string} adUnitId - Ad unit ID
 * @body    {string} error - Error message
 * @body    {string} errorCode - Error code
 * @access  Protected
 */
router.post("/rewarded-ad/failed", protect, async (req, res) => {
  try {
    const { adRecordId, adUnitId = "rewarded", error, errorCode } = req.body;

    let adRecord;

    if (adRecordId) {
      adRecord = await AppLovinRewardedAd.findOne({
        _id: adRecordId,
        userId: req.user.userId,
      });
    }

    if (!adRecord) {
      // Create new failed record
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      adRecord = new AppLovinRewardedAd({
        userId: user._id,
        adUnitId,
        status: "failed",
        metadata: {
          platform: req.body.platform || "unknown",
          country: user.location?.current?.country || "US",
          deviceType: req.body.deviceType || "mobile",
          userAgent: req.headers["user-agent"],
          ip: req.ip || req.connection.remoteAddress,
        },
      });
    }

    await adRecord.markFailed({ message: error, code: errorCode });

    res.json({
      success: true,
      data: {
        adRecordId: adRecord._id,
        status: adRecord.status,
        message: "Ad failure tracked successfully",
      },
    });
  } catch (error) {
    console.error("Error tracking ad failure:", error);
    res.status(500).json({
      success: false,
      error: "Failed to track ad failure",
    });
  }
});

/**
 * @route   GET /api/applovin/rewarded-ad/history
 * @desc    Get user's rewarded ad history
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @access  Protected
 */
router.get("/rewarded-ad/history", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [ads, total] = await Promise.all([
      AppLovinRewardedAd.find({ userId: req.user.userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AppLovinRewardedAd.countDocuments({ userId: req.user.userId }),
    ]);

    res.json({
      success: true,
      data: {
        ads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Error getting ad history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get ad history",
    });
  }
});

/**
 * @route   GET /api/applovin/rewarded-ad/stats
 * @desc    Get user's rewarded ad statistics
 * @access  Protected
 */
router.get("/rewarded-ad/stats", protect, async (req, res) => {
  try {
    const stats = await AppLovinRewardedAd.getCompletionStats(req.user.userId);

    const totalCompleted = stats.find((s) => s._id === "completed")?.count || 0;
    const totalCoins = stats.reduce((sum, s) => sum + (s.totalCoins || 0), 0);
    const totalXP = stats.reduce((sum, s) => sum + (s.totalXP || 0), 0);

    res.json({
      success: true,
      data: {
        totalCompleted,
        totalCoins,
        totalXP,
        breakdown: stats,
      },
    });
  } catch (error) {
    console.error("Error getting ad stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get ad statistics",
    });
  }
});

module.exports = router;

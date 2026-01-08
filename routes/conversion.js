const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const ConversionSettings = require("../models/ConversionSettings");

// Conversion configuration
const CONVERSION_CONFIG = {
  minCoins: 100,
  maxCoins: 10000,
  taskTimeLimit: 5 * 60 * 1000, // 5 minutes in milliseconds
  conversionRates: {
    USD: 0.01, // 1 coin = $0.01
    INR: 0.83, // 1 coin = ₹0.83
    EUR: 0.009, // 1 coin = €0.009
  },
  adBonus: 0.1, // 10% bonus for ad-based conversion
};

// Get conversion rates
router.get("/rates", protect, async (req, res) => {
  try {
    const { currency = "USD" } = req.query;

    const rate =
      CONVERSION_CONFIG.conversionRates[currency] ||
      CONVERSION_CONFIG.conversionRates.USD;

    res.json({
      success: true,
      data: {
        currency,
        rate,
        minCoins: CONVERSION_CONFIG.minCoins,
        maxCoins: CONVERSION_CONFIG.maxCoins,
        adBonus: CONVERSION_CONFIG.adBonus,
      },
    });
  } catch (error) {
    console.error("Error getting conversion rates:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversion rates",
    });
  }
});

// Start 5-minute task-based conversion
router.post("/start-task", protect, async (req, res) => {
  try {
    const { coins, currency = "USD" } = req.body;

    if (
      !coins ||
      coins < CONVERSION_CONFIG.minCoins ||
      coins > CONVERSION_CONFIG.maxCoins
    ) {
      return res.status(400).json({
        success: false,
        error: `Coins must be between ${CONVERSION_CONFIG.minCoins} and ${CONVERSION_CONFIG.maxCoins}`,
      });
    }

    const user = await User.findById(req.user.userId).select("wallet");

    if (user.wallet.balance < coins) {
      return res.status(400).json({
        success: false,
        error: "Insufficient coin balance",
      });
    }

    // Create conversion session
    const conversionId = `CONV-${Date.now()}-${Math.floor(
      Math.random() * 100000
    )}`;
    const expiresAt = new Date(Date.now() + CONVERSION_CONFIG.taskTimeLimit);

    // Store conversion session in user's data
    if (!user.conversionSessions) {
      user.conversionSessions = [];
    }

    user.conversionSessions.push({
      id: conversionId,
      coins,
      currency,
      type: "task",
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    await user.save();

    res.json({
      success: true,
      data: {
        conversionId,
        coins,
        currency,
        expiresAt,
        timeLimit: CONVERSION_CONFIG.taskTimeLimit,
        message: "Complete a game task within 5 minutes to unlock conversion!",
      },
    });
  } catch (error) {
    console.error("Error starting task conversion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start task conversion",
    });
  }
});

// Complete task and unlock conversion
router.post("/complete-task", protect, async (req, res) => {
  try {
    const { conversionId, taskId } = req.body;

    if (!conversionId || !taskId) {
      return res.status(400).json({
        success: false,
        error: "Conversion ID and Task ID are required",
      });
    }

    const user = await User.findById(req.user.userId).select(
      "wallet conversionSessions"
    );

    // Find conversion session
    const session = user.conversionSessions.find((s) => s.id === conversionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Conversion session not found",
      });
    }

    if (session.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "Conversion session already processed",
      });
    }

    if (new Date() > session.expiresAt) {
      return res.status(400).json({
        success: false,
        error: "Conversion session expired",
      });
    }

    // Mark session as task completed
    session.status = "task_completed";
    session.taskId = taskId;
    session.taskCompletedAt = new Date();

    await user.save();

    res.json({
      success: true,
      data: {
        conversionId,
        status: "task_completed",
        message: "Task completed! You can now claim your conversion reward.",
      },
    });
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete task",
    });
  }
});

// Start ad-based conversion
router.post("/start-ad", protect, async (req, res) => {
  try {
    const { coins, currency = "USD" } = req.body;

    if (
      !coins ||
      coins < CONVERSION_CONFIG.minCoins ||
      coins > CONVERSION_CONFIG.maxCoins
    ) {
      return res.status(400).json({
        success: false,
        error: `Coins must be between ${CONVERSION_CONFIG.minCoins} and ${CONVERSION_CONFIG.maxCoins}`,
      });
    }

    const user = await User.findById(req.user.userId).select("wallet");

    if (user.wallet.balance < coins) {
      return res.status(400).json({
        success: false,
        error: "Insufficient coin balance",
      });
    }

    // Create conversion session
    const conversionId = `CONV-${Date.now()}-${Math.floor(
      Math.random() * 100000
    )}`;

    // Store conversion session in user's data
    if (!user.conversionSessions) {
      user.conversionSessions = [];
    }

    user.conversionSessions.push({
      id: conversionId,
      coins,
      currency,
      type: "ad",
      status: "pending",
      createdAt: new Date(),
    });

    await user.save();

    res.json({
      success: true,
      data: {
        conversionId,
        coins,
        currency,
        message: "Watch video ad to unlock conversion with bonus!",
      },
    });
  } catch (error) {
    console.error("Error starting ad conversion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to start ad conversion",
    });
  }
});

// Complete ad and unlock conversion
router.post("/complete-ad", protect, async (req, res) => {
  try {
    const { conversionId } = req.body;

    if (!conversionId) {
      return res.status(400).json({
        success: false,
        error: "Conversion ID is required",
      });
    }

    const user = await User.findById(req.user.userId).select(
      "wallet conversionSessions"
    );

    // Find conversion session
    const session = user.conversionSessions.find((s) => s.id === conversionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Conversion session not found",
      });
    }

    if (session.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "Conversion session already processed",
      });
    }

    // Mark session as ad completed
    session.status = "ad_completed";
    session.adCompletedAt = new Date();

    await user.save();

    res.json({
      success: true,
      data: {
        conversionId,
        status: "ad_completed",
        message:
          "Ad completed! You can now claim your conversion reward with bonus!",
      },
    });
  } catch (error) {
    console.error("Error completing ad:", error);
    res.status(500).json({
      success: false,
      error: "Failed to complete ad",
    });
  }
});

// Claim conversion reward
router.post("/claim", protect, async (req, res) => {
  try {
    const { conversionId } = req.body;

    if (!conversionId) {
      return res.status(400).json({
        success: false,
        error: "Conversion ID is required",
      });
    }

    const user = await User.findById(req.user.userId).select(
      "wallet conversionSessions"
    );

    // Find conversion session
    const session = user.conversionSessions.find((s) => s.id === conversionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: "Conversion session not found",
      });
    }

    if (!["task_completed", "ad_completed"].includes(session.status)) {
      return res.status(400).json({
        success: false,
        error: "Conversion not ready for claiming",
      });
    }

    // Calculate conversion amount
    const rate = CONVERSION_CONFIG.conversionRates[session.currency];
    let conversionAmount = session.coins * rate;

    // Apply ad bonus if applicable
    if (session.type === "ad") {
      conversionAmount *= 1 + CONVERSION_CONFIG.adBonus;
    }

    // Check if user has enough coins
    if (user.wallet.balance < session.coins) {
      return res.status(400).json({
        success: false,
        error: "Insufficient coin balance",
      });
    }

    // Deduct coins from wallet
    user.wallet.balance -= session.coins;
    user.wallet.lastUpdated = new Date();

    // Create transaction record
    const transaction = new Transaction({
      user: req.user.userId,
      type: "debit",
      amount: session.coins,
      description: `Coin conversion - ${session.coins} coins to ${session.currency}`,
      status: "completed",
      referenceId: conversionId,
    });

    // Mark session as claimed
    session.status = "claimed";
    session.claimedAt = new Date();
    session.conversionAmount = conversionAmount;

    await Promise.all([user.save(), transaction.save()]);

    res.json({
      success: true,
      data: {
        conversionId,
        coinsConverted: session.coins,
        currency: session.currency,
        conversionAmount: conversionAmount.toFixed(2),
        bonus: session.type === "ad" ? CONVERSION_CONFIG.adBonus * 100 : 0,
        newBalance: user.wallet.balance,
        message: "Conversion completed successfully!",
      },
    });
  } catch (error) {
    console.error("Error claiming conversion:", error);
    res.status(500).json({
      success: false,
      error: "Failed to claim conversion",
    });
  }
});

// Get conversion history
router.get("/history", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const user = await User.findById(req.user.userId).select(
      "conversionSessions"
    );

    if (!user.conversionSessions) {
      return res.json({
        success: true,
        data: {
          conversions: [],
          pagination: {
            page: 1,
            limit: parseInt(limit),
            total: 0,
            pages: 0,
          },
        },
      });
    }

    const conversions = user.conversionSessions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice((page - 1) * limit, page * limit);

    const total = user.conversionSessions.length;

    res.json({
      success: true,
      data: {
        conversions: conversions.map((conv) => ({
          id: conv.id,
          coins: conv.coins,
          currency: conv.currency,
          type: conv.type,
          status: conv.status,
          conversionAmount: conv.conversionAmount,
          createdAt: conv.createdAt,
          claimedAt: conv.claimedAt,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting conversion history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get conversion history",
    });
  }
});

router.get("/conversions/settings", protect, async (req, res) => {
  try {
    // Get conversion settings from database
    const settings = await ConversionSettings.getActiveSettings("USD");

    // Calculate conversion rate
    const conversionRate =
      settings.coinsPerDollar > 0 ? 1 / settings.coinsPerDollar : 0.01;

    const coinConversionRates = {
      USD: conversionRate,
    };

    // Format conversion rules - USD only
    const conversionRules = [
      {
        currency: settings.currency,
        currencySymbol: "$",
        conversionRule: `${settings.coinsPerUnit} Coins = $${settings.currencyAmount}`,
        coinsPerDollar: settings.coinsPerDollar,
        coinsPerUnit: settings.coinsPerUnit,
        currencyAmount: settings.currencyAmount,
        method: settings.paymentMethods || [
          "UPI",
          "Paytm",
          "Gift Card",
          "Bank Transfer",
          "PayPal",
        ],
        ruleSource: "System Configuration",
      },
    ];

    res.json({
      success: true,
      data: {
        conversionRules,
        defaultRule: {
          coinsPerDollar: settings.coinsPerDollar,
          minRedemption: settings.minRedemption,
          maxRedemption: settings.maxRedemption,
          defaultCurrency: settings.currency,
          conversionRates: coinConversionRates,
        },
      },
    });
  } catch (error) {
    console.error("Error getting conversion settings:", error);
    res.status(500).json({
      success: true, // Return success with defaults
      data: {
        conversionRules: [
          {
            currency: "USD",
            currencySymbol: "$",
            conversionRule: "500 Coins = $5",
            coinsPerDollar: 100,
            coinsPerUnit: 500,
            currencyAmount: 5,
            method: ["UPI", "Paytm", "Gift Card", "Bank Transfer", "PayPal"],
            ruleSource: "System Configuration",
          },
        ],
        defaultRule: {
          coinsPerDollar: 100,
          minRedemption: 100,
          maxRedemption: 10000,
          defaultCurrency: "USD",
        },
      },
    });
  }
});

module.exports = router;

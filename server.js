require("dotenv").config();
const Sentry = require("@sentry/node");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const config = require("./config/config");
const winston = require("winston");
const socketIo = require("socket.io");
const Redis = require("ioredis");
const passport = require("./config/passport");
require("./instrument.js");
const AWS_KEY = "AKIA1234567890EXAMPLE";

// Initialize Redis client
let redis;
try {
  redis = new Redis(config.REDIS_URL);
  redis.on("error", (error) => {
    // console.error("Redis connection error:", error);
    redis = null; // Set to null on connection error
  });
  redis.on("connect", () => {
    // console.log("Connected to Redis");
  });
} catch (error) {
  // console.error("Failed to connect to Redis:", error);
  redis = null; // Set to null if Redis is not available
}

// Log Redis status
if (redis) {
  console.log("Redis client initialized successfully");
} else {
  console.log("Redis client not available - continuing without Redis");
}

// Initialize Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// Express app
const app = express();

// Middleware setup
// Trust proxy headers so req.ip and req.ips work correctly behind proxies/CDNs
app.set("trust proxy", true);
app.use(cors());
app.use(helmet());

// Serve static files from uploads directory
app.use("/uploads", express.static("uploads"));

// Add security headers for static files
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
  next();
});
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
});

// Apply rate limiting to all routes
// app.use(apiLimiter);

// Initialize Passport
app.use(passport.initialize());

// Global Activity Tracking Middleware
const { globalActivityTracker } = require("./middleware/globalActivityTracker");
app.use(globalActivityTracker);

// MongoDB connection
mongoose
  .connect(config.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");

    // Create server
    const server = app
      .listen(config.PORT, () => {
        console.log(`Server is running on port ${config.PORT}`);
      })
      .on("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.error(
            `Port ${config.PORT} is already in use. Please try a different port or kill the process using this port.`
          );
          process.exit(1);
        } else {
          console.error("Server error:", error);
          process.exit(1);
        }
      });

    // Initialize Socket.io
    const io = socketIo(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST"],
      },
    });

    // Socket.io event handlers
    io.on("connection", (socket) => {
      console.log("New client connected");

      socket.on("join-room", (roomId) => {
        socket.join(roomId);
      });

      socket.on("leave-room", (roomId) => {
        socket.leave(roomId);
      });

      socket.on("disconnect", () => {
        console.log("Client disconnected");
      });
    });

    // Routes setup
    const authRoutes = require("./routes/auth");
    const onboardingRoutes = require("./routes/onboarding");
    const homeRoutes = require("./routes/home");
    const walletRoutes = require("./routes/wallet");
    const vipRoutes = require("./routes/vip");
    const payment = require("./routes/payment");
    const gameRoutes = require("./routes/game");
    const profileRoutes = require("./routes/profile");
    const dashboardRoutes = require("./routes/dashboard");
    const cashCoachRoutes = require("./routes/cashCoach");
    const adminCashCoachRoutes = require("./routes/admin-cash-coach");
    const adminRoutes = require("./routes/admin");
    const receiptsRoutes = require("./routes/receipts");
    const biometricRoutes = require("./routes/biometric");
    const locationRoutes = require("./routes/location");
    const disclosureRoutes = require("./routes/disclosure");
    const greetingRoutes = require("./routes/greeting");
    const spinRoutes = require("./routes/spin");
    const conversionRoutes = require("./routes/conversion");
    const withdrawalRoutes = require("./routes/withdrawal");
    const walletScreenRoutes = require("./routes/wallet-screen");
    const xpTierRoutes = require("./routes/xp-tier");
    const mostPlayedGamesRoutes = require("./routes/most-played-games");
    const welcomeOfferRoutes = require("./routes/welcome-offer");
    const raceRoutes = require("./routes/race");
    const surveyRoutes = require("./routes/surveys");
    const streakRoutes = require("./routes/streak");
    const navigationRoutes = require("./routes/navigation");
    const gameOffersRoutes = require("./routes/game-offers");
    const userGameOffersRoutes = require("./routes/user-game-offers");
    const payoutsRoutes = require("./routes/payouts");
    const fraudPreventionRoutes = require("./routes/fraud-prevention");
    const achievementRoutes = require("./routes/achievements");
    const leaderboardRoutes = require("./routes/leaderboard");
    const performanceRoutes = require("./routes/performance");
    const testRoutes = require("./routes/test");
    const accountOverviewRoutes = require("./routes/account-overview");
    const myGamesRoutes = require("./routes/my-games");
    const adFreeRoutes = require("./routes/ad-free");
    const temporaryAdFreeRoutes = require("./routes/temporary-ad-free");
    const adminRewardsRoutes = require("./routes/admin-rewards");
    const adminXPTierV2Routes = require("./routes/admin-xp-tier-v2");
    const adminXPDecayV2Routes = require("./routes/admin-xp-decay-v2");
    const adminGameOffersRoutes = require("./routes/admin-game-offers");
    const adminSurveysRoutes = require("./routes/admin-surveys");
    const adminDailyChallengesRoutes = require("./routes/admin-daily-challenges");
    const besitosRoutes = require("./routes/besitos");
    const bitlabsRoutes = require("./routes/bitlabs");
    const everflowRoutes = require("./routes/everflow");
    const nonGameOffersRoutes = require("./routes/non-game-offers");
    const dailyChallengeRoutes = require("./routes/daily-challenge");
    const webhookRoutes = require("./routes/webhooks");
    const applovinRoutes = require("./routes/applovin");
    const dailyRewardsRoutes = require("./routes/daily-rewards");
    const dailyRewardsV2Routes = require("./routes/daily-rewards-v2");
    const adminDailyRewardsRoutes = require("./routes/admin-daily-rewards");
    const adminDailyRewardsV2Routes = require("./routes/admin-daily-rewards-v2");
    const adminCreativesRoutes = require("./routes/admin-creatives");
    const adminTransactionsRoutes = require("./routes/admin-transactions");
    const adminSpinWheelRoutes = require("./routes/admin-spin-wheel");
    const adminPayoutsRoutes = require("./routes/admin-payouts");
    const referralRoutes = require("./routes/referral");
    const ticketsRoutes = require("./routes/tickets");
    const adminTicketsRoutes = require("./routes/admin-tickets");
    const dailyActivityRoutes = require("./routes/daily-activity");
    const securitySettingsRoutes = require("./routes/security-settings");
    const integrationRoutes = require("./routes/integration");
    const walkathonRoutes = require("./routes/walkathon");
    const adminWalkathonRoutes = require("./routes/admin-walkathon");
    const internalSurveyRoutes = require("./routes/internal-surveys");
    const adminInternalSurveyRoutes = require("./routes/admin-internal-surveys");
    const surveyWebviewRoutes = require("./routes/survey-webview");
    const vipMembershipRoutes = require("./routes/vip-membership");
    const adminVipManagementRoutes = require("./routes/admin-vip-management");
    const gameTipsRoutes = require("./routes/game-tips");
    const adminGameTipsRoutes = require("./routes/admin-game-tips");
    const zohoRoutes = require("./routes/zoho");
    const adjustRoutes = require("./routes/adjust");
    const adjustV2Routes = require("./routes/adjust-v2");
    const adminAdjustEventsRoutes = require("./routes/admin-adjust-events");
    const affiseRoutes = require("./routes/affise");

    // Initialize Firebase Admin SDK (for V2 S2S implementation)
    const { initializeFirebaseAdmin } = require("./utils/firebaseAdmin");
    initializeFirebaseAdmin();

    // API Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/onboarding", onboardingRoutes);
    app.use("/api/home", homeRoutes);
    app.use("/api/wallet", walletRoutes);
    app.use("/api/vip", vipRoutes);
    app.use("/api/payment", payment);
    app.use("/api/game", gameRoutes);
    app.use("/api/profile", profileRoutes);
    app.use("/api/dashboard", dashboardRoutes);
    app.use("/api/cash-coach", cashCoachRoutes);
    app.use("/api/admin/cash-coach", adminCashCoachRoutes);
    app.use("/api/admin", adminRoutes);
    app.use("/api/v1/receipts", receiptsRoutes);
    app.use("/api/biometric", biometricRoutes);
    app.use("/api/location", locationRoutes);
    app.use("/api/disclosure", disclosureRoutes);
    app.use("/api/greeting", greetingRoutes);
    app.use("/api/spin", spinRoutes);
    app.use("/api/conversion", conversionRoutes);
    app.use("/api/withdrawal", withdrawalRoutes);
    app.use("/api/wallet-screen", walletScreenRoutes);
    app.use("/api/xp-tier", xpTierRoutes);
    app.use("/api/most-played-games", mostPlayedGamesRoutes);
    app.use("/api/welcome-offer", welcomeOfferRoutes);
    app.use("/api/race", raceRoutes);
    app.use("/api/surveys", surveyRoutes);
    app.use("/api/streak", streakRoutes);
    app.use("/api/navigation", navigationRoutes);
    app.use("/api/game-offers", gameOffersRoutes);
    app.use("/api/user/game-offers", userGameOffersRoutes);
    app.use("/api/payouts", payoutsRoutes);
    app.use("/api/fraud-prevention", fraudPreventionRoutes);
    app.use("/api/achievements", achievementRoutes);
    app.use("/api/leaderboard", leaderboardRoutes);
    app.use("/api/performance", performanceRoutes);
    app.use("/api/test", testRoutes);
    app.use("/api/account-overview", accountOverviewRoutes);
    app.use("/api/my-games", myGamesRoutes);
    app.use("/api/ad-free", adFreeRoutes);
    app.use("/api/temporary-ad-free", temporaryAdFreeRoutes);
    app.use("/api/admin/rewards", adminRewardsRoutes);
    app.use("/api/admin/rewards", adminXPTierV2Routes);
    app.use("/api/admin/rewards", adminXPDecayV2Routes);
    app.use("/api/admin/game-offers", adminGameOffersRoutes);
    // Direct alias for display-rules - create wrapper router
    const displayRulesRouter = express.Router();
    displayRulesRouter.use((req, res, next) => {
      // Rewrite the path to include /display-rules prefix for the adminGameOffersRoutes
      // req.url might be '/' or '/:id' or '/:id?confirm=true', etc.
      const originalUrl = req.url;
      if (originalUrl === "/" || originalUrl === "") {
        req.url = "/display-rules";
      } else {
        req.url = "/display-rules" + originalUrl;
      }
      adminGameOffersRoutes(req, res, next);
    });
    app.use("/api/admin/display-rules", displayRulesRouter);
    app.use("/api/admin/surveys", adminSurveysRoutes);
    app.use("/api/admin/daily-challenges", adminDailyChallengesRoutes);
    app.use("/api/besitos", besitosRoutes);
    app.use("/api/bitlabs", bitlabsRoutes);
    app.use("/api/everflow", everflowRoutes);
    app.use("/api/affise", affiseRoutes);
    app.use("/api/adjust", adjustRoutes);
    app.use("/api/v2/adjust", adjustV2Routes);
    app.use("/api/admin/adjust-events", adminAdjustEventsRoutes);
    app.use("/api/non-game-offers", nonGameOffersRoutes);
    app.use("/api/daily-challenge", dailyChallengeRoutes);
    app.use("/api/webhooks", webhookRoutes);
    app.use("/api/applovin", applovinRoutes);
    app.use("/api/daily-rewards", dailyRewardsRoutes);
    app.use("/api/v2/daily-rewards", dailyRewardsV2Routes);
    app.use("/api/admin/daily-rewards", adminDailyRewardsRoutes);
    app.use("/api/admin/daily-rewards-v2", adminDailyRewardsV2Routes);
    app.use("/api/admin/creatives", adminCreativesRoutes);
    app.use("/api/admin/transactions", adminTransactionsRoutes);
    app.use("/api/admin/spin-wheel", adminSpinWheelRoutes);
    app.use("/api/admin/payouts", adminPayoutsRoutes);
    app.use("/api/referral", referralRoutes);
    app.use("/api/tickets", ticketsRoutes);
    app.use("/api/admin/tickets", adminTicketsRoutes);
    app.use("/api/daily-activity", dailyActivityRoutes);
    app.use("/api/security-settings", securitySettingsRoutes);
    app.use("/api/integration", integrationRoutes);
    app.use("/api/walkathon", walkathonRoutes);
    app.use("/api/admin/walkathon", adminWalkathonRoutes);
    app.use("/api/internal-surveys", internalSurveyRoutes);
    app.use("/api/admin/internal-surveys", adminInternalSurveyRoutes);
    app.use("/api/survey-webview", surveyWebviewRoutes);
    app.use("/api/vip/membership", vipMembershipRoutes);
    app.use("/api/admin/vip", adminVipManagementRoutes);
    app.use("/api/game-tips", gameTipsRoutes);
    app.use("/api/admin/game-tips", adminGameTipsRoutes);
    app.use("/api/zoho", zohoRoutes);

    // Error handling middleware
    app.use((err, req, res, next) => {
      logger.error(err.stack);

      // Check if error has a status code
      const statusCode = err.statusCode || 500;

      // Check if error has a message
      const message = err.message || "Internal Server Error";

      // Send error response
      res.status(statusCode).json({
        success: false,
        error: {
          message,
          statusCode,
          ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
        },
      });
    });

    app.get("/debug-sentry", function mainHandler(req, res) {
      throw new Error("My first Sentry error!");
    });

    Sentry.setupExpressErrorHandler(app);
    // Optional fallthrough error handler
    app.use(function onError(err, req, res, next) {
      // The error id is attached to `res.sentry` to be returned
      // and optionally displayed to the user for support.
      res.statusCode = 500;
      res.end(res.sentry + "\n");
    });

    // Graceful shutdown handling
    const shutdownGracefully = async (signal) => {
      console.log(`${signal} received, shutting down gracefully`);
      server.close(async () => {
        console.log("Server closed");
        try {
          await mongoose.connection.close();
          console.log("MongoDB connection closed");
        } catch (error) {
          console.error("Error closing MongoDB connection:", error);
        } finally {
          process.exit(0);
        }
      });
    };

    process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
    process.on("SIGINT", () => shutdownGracefully("SIGINT"));

    // Start scheduler for My Account Overview
    const scheduler = require("./utils/scheduler");
    scheduler.start();

    // Start walkathon scheduler
    const walkathonScheduler = require("./utils/walkathonScheduler");
    walkathonScheduler.initializeWalkathonScheduler();

    // Export for testing
    module.exports = {
      app,
      server,
      io,
      redis,
      logger,
    };

    // Server error handling
    server.on("error", (error) => {
      if (error.syscall !== "listen") {
        throw error;
      }

      const bind =
        typeof config.PORT === "string"
          ? `Pipe ${config.PORT}`
          : `Port ${config.PORT}`;

      // Handle specific listen errors with friendly messages
      switch (error.code) {
        case "EACCES":
          console.error(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case "EADDRINUSE":
          console.error(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

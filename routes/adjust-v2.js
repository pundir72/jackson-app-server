/**
 * Adjust S2S API Routes V2
 * Implements S2S event tracking with Firebase App Check, Firebase Auth, event validation, and campaign filtering
 * Based on client document requirements
 * @module routes/adjust-v2
 */

const express = require("express");
const router = express.Router();
// TODO: Uncomment when Firebase credentials are available
// const { verifyAppCheck } = require('../middleware/firebaseAppCheck');
// const { verifyFirebaseIdToken } = require('../middleware/firebaseAuth');
const {
  validateLevelEvent,
  validateEvent,
} = require("../middleware/eventValidation");
const { checkOfferwallCampaign } = require("../middleware/campaignFilter");
const adjustService = require("../services/adjust.service");
const User = require("../models/User");
const AdjustEventToken = require("../models/AdjustEventToken");
const config = require("../config/config");
const protect = require("../middleware/auth"); // Using existing JWT auth

/**
 * @route   POST /api/v2/adjust/report-event
 * @desc    Report S2S event to Adjust (V2 - with full security)
 * @access  Private (requires Firebase App Check + Firebase Auth)
 * @headers X-Firebase-AppCheck: <app-check-token>
 * @headers Authorization: Bearer <firebase-id-token>
 * @body    {string} eventType - Event type (e.g., 'level_complete', 'game_complete')
 * @body    {number} levelNumber - Level number (required for level_complete events)
 * @body    {string} eventToken - Adjust event token (required)
 * @body    {string} deviceId - Device identifier (gps_adid, idfa, etc.)
 * @body    {object} metadata - Additional event metadata (optional)
 * @body    {number} revenue - Revenue amount (optional)
 * @body    {string} currency - Currency code (optional, default: USD)
 * @body    {object} callbackParams - Callback parameters (optional)
 * @note    This endpoint implements the full security stack:
 *          - Firebase App Check verification
 *          - Firebase ID token verification
 *          - Event validation (level progression)
 *          - Campaign filtering (offerwall only)
 */
router.post(
  "/report-event",
  // TODO: Uncomment Firebase middleware when Firebase credentials are available
  // verifyAppCheck,              // Step 1: Verify App Check token
  // verifyFirebaseIdToken,       // Step 2: Verify Firebase ID token
  protect, // Temporarily using JWT auth instead of Firebase Auth
  // TODO: Uncomment validations when needed
  // checkOfferwallCampaign,      // Step 3: Check if user from offerwall campaign
  // validateEvent,               // Step 4: Validate event type and parameters
  // validateLevelEvent,          // Step 5: Validate level progression (if level event)
  async (req, res) => {
    console.log("\n" + "=".repeat(80));
    console.log(
      "🎯 [Adjust V2 Route] POST /api/v2/adjust/report-event - Request Received",
    );
    console.log("=".repeat(80));
    console.log("📅 [Adjust V2 Route] Timestamp:", new Date().toISOString());
    console.log("🌐 [Adjust V2 Route] Request Details:");
    console.log("   - Method:", req.method);
    console.log("   - URL:", req.originalUrl);
    console.log("   - Path:", req.path);
    console.log("   - IP:", req.ip);
    console.log("   - Headers:", {
      "content-type": req.headers["content-type"],
      authorization: req.headers["authorization"] ? "Bearer ***" : "NOT SET",
      "x-firebase-appcheck": req.headers["x-firebase-appcheck"]
        ? "SET"
        : "NOT SET",
      "user-agent": req.headers["user-agent"],
    });
    console.log("   - Body exists:", !!req.body);
    console.log("   - Body keys:", req.body ? Object.keys(req.body) : "N/A");
    console.log("   - Full body:", JSON.stringify(req.body, null, 2));

    try {
      const {
        eventType,
        levelNumber,
        eventToken,
        deviceId,
        deviceIdType,
        metadata = {},
        revenue,
        currency = "USD",
        callbackParams = {},
      } = req.body;

      console.log("\n📋 [Adjust V2 Route] Extracted request parameters:");
      console.log("   - eventType:", eventType || "NOT PROVIDED");
      console.log(
        "   - levelNumber:",
        levelNumber !== undefined ? levelNumber : "NOT PROVIDED",
      );
      console.log("   - eventToken:", eventToken || "NOT PROVIDED");
      console.log("   - deviceId:", deviceId || "NOT PROVIDED");
      console.log("   - metadata:", JSON.stringify(metadata, null, 2));
      console.log(
        "   - revenue:",
        revenue !== undefined ? revenue : "NOT PROVIDED",
      );
      console.log("   - currency:", currency);
      console.log(
        "   - callbackParams:",
        JSON.stringify(callbackParams, null, 2),
      );

      // Validate required fields
      console.log("\n✅ [Adjust V2 Route] Validating required fields...");
      if (!eventType) {
        console.error(
          "❌ [Adjust V2 Route] Validation FAILED: eventType is missing",
        );
        return res.status(400).json({
          success: false,
          error: "eventType is required",
          code: "EVENT_TYPE_MISSING",
        });
      }
      console.log("   ✅ eventType validation passed");

      if (!eventToken) {
        console.error(
          "❌ [Adjust V2 Route] Validation FAILED: eventToken is missing",
        );
        return res.status(400).json({
          success: false,
          error:
            "eventToken is required. Get event tokens from Adjust Dashboard or use GET /api/v2/adjust/events to see available tokens.",
          code: "EVENT_TOKEN_MISSING",
        });
      }
      console.log("   ✅ eventToken validation passed");

      // TODO: Uncomment event token validation when needed
      // Validate event token exists in database (optional check)
      // const eventTokenDoc = await AdjustEventToken.findByToken(eventToken);
      // if (eventTokenDoc && !eventTokenDoc.isActive) {
      //   return res.status(400).json({
      //     success: false,
      //     error: 'Event token is inactive',
      //     code: 'EVENT_TOKEN_INACTIVE'
      //   });
      // }

      // Get user info
      // TODO: When Firebase is enabled, use: req.user?.userId || req.firebaseUser?.uid
      const userId = req.user?.userId; // Using JWT auth for now
      // Get user document if not already attached
      let userDocument = req.userDocument;
      if (!userDocument && userId) {
        userDocument = await User.findById(userId);
      }

      console.log("\n🔍 [Adjust V2 Route] Starting event processing...");
      console.log(
        "📥 [Adjust V2 Route] Request Body:",
        JSON.stringify(req.body, null, 2),
      );
      console.log("👤 [Adjust V2 Route] User Info:");
      console.log("   - User ID:", userId);
      console.log("   - User Document exists:", !!userDocument);
      console.log("   - User Document ID:", userDocument?._id || "N/A");

      // Build device identifiers
      // Priority: provided deviceId > user deviceInfo > system device identifier
      console.log("\n📱 [Adjust V2 Route] Building device identifiers...");
      const deviceIds = {};

      console.log("   - Provided deviceId:", deviceId || "NOT PROVIDED");
      console.log("   - User document exists:", !!userDocument);
      console.log("   - User deviceInfo exists:", !!userDocument?.deviceInfo);

      // UUID format validator — Adjust requires gps_adid / idfa in xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx form
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (deviceId && deviceIdType !== "web_uuid" && deviceIdType !== "android_id") {
        // Use explicit type sent by frontend (set by @capacitor-community/advertising-id)
        console.log(`   - Using provided deviceId (type: ${deviceIdType || "unknown"})`);

        // Validate UUID format for adid types — Adjust rejects malformed UUIDs with 451
        if ((deviceIdType === "gps_adid" || deviceIdType === "idfa") && !UUID_REGEX.test(deviceId)) {
          console.error(`   - ❌ Invalid UUID format for ${deviceIdType}: ${deviceId}`);
          return res.status(400).json({
            success: false,
            error: `Invalid ${deviceIdType} format. Must be a valid UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).`,
            code: "INVALID_DEVICE_ID_FORMAT",
          });
        }

        if (deviceIdType === "gps_adid") {
          deviceIds.gps_adid = deviceId;
          console.log("   - Assigned as gps_adid (real Android GAID)");
        } else if (deviceIdType === "idfa") {
          deviceIds.idfa = deviceId;
          console.log("   - Assigned as idfa (real iOS IDFA)");
        } else {
          // Unknown type — use gps_adid as safe default for mobile
          deviceIds.gps_adid = deviceId;
          console.log("   - Assigned as gps_adid (unknown type fallback)");
        }
      } else if (userDocument?.deviceInfo) {
        console.log("   - Using device info from user profile");
        // Use device info from user profile
        const deviceInfo = userDocument.deviceInfo;
        console.log(
          "   - User deviceInfo:",
          JSON.stringify(deviceInfo, null, 2),
        );

        if (deviceInfo.idfa) {
          deviceIds.idfa = deviceInfo.idfa;
          console.log("   - Added idfa:", deviceInfo.idfa);
        }
        if (deviceInfo.gpsAdid) {
          deviceIds.gps_adid = deviceInfo.gpsAdid;
          console.log("   - Added gpsAdid:", deviceInfo.gpsAdid);
        }
        if (deviceInfo.fireAdid) {
          deviceIds.fire_adid = deviceInfo.fireAdid;
          console.log("   - Added fireAdid:", deviceInfo.fireAdid);
        }
        if (deviceInfo.oaid) {
          deviceIds.oaid = deviceInfo.oaid;
          console.log("   - Added oaid:", deviceInfo.oaid);
        }
        if (deviceInfo.webUuid) {
          deviceIds.web_uuid = deviceInfo.webUuid;
          console.log("   - Added webUuid:", deviceInfo.webUuid);
        }
        if (deviceInfo.idfv) {
          deviceIds.idfv = deviceInfo.idfv;
          console.log("   - Added idfv:", deviceInfo.idfv);
        }
        if (deviceInfo.androidId) {
          deviceIds.android_id = deviceInfo.androidId;
          console.log("   - Added androidId:", deviceInfo.androidId);
        }
      }

      console.log("   - Final deviceIds:", JSON.stringify(deviceIds, null, 2));
      console.log("   - Device IDs count:", Object.keys(deviceIds).length);

      // If no device ID resolved, log and continue — Adjust accepts S2S without device ID
      // (attribution will be weaker but won't corrupt other devices' data)
      if (Object.keys(deviceIds).length === 0) {
        console.warn("⚠️ [Adjust V2 Route] No device identifier available — sending event without device ID");
      }

      // Build event data for Adjust
      console.log("\n📦 [Adjust V2 Route] Building event data...");
      const eventData = {
        event_token: eventToken,
        s2s: "1", // Required for S2S requests
        ...deviceIds,
      };

      console.log("   - Base eventData:", JSON.stringify(eventData, null, 2));

      // Add revenue if provided
      if (revenue !== undefined && revenue !== null) {
        eventData.revenue = Number(revenue);
        eventData.currency = currency;
        console.log(
          "   - Added revenue:",
          eventData.revenue,
          eventData.currency,
        );
      } else {
        console.log("   - No revenue provided");
      }

      // Build callback parameters
      console.log("\n📋 [Adjust V2 Route] Building callback parameters...");
      const finalCallbackParams = {
        ...(userId && { userId: userId }),
        eventType: eventType,
        ...(levelNumber && { level: levelNumber }),
        ...(req.attribution && {
          campaign: req.attribution.campaign,
          network: req.attribution.network,
        }),
        ...callbackParams,
        ...metadata,
      };

      // Adjust requires all callback_params values to be strings (per Adjust S2S API docs)
      Object.keys(finalCallbackParams).forEach((key) => {
        if (finalCallbackParams[key] !== null && finalCallbackParams[key] !== undefined) {
          finalCallbackParams[key] = String(finalCallbackParams[key]);
        }
      });

      console.log(
        "   - Callback params:",
        JSON.stringify(finalCallbackParams, null, 2),
      );
      console.log("   - Has attribution:", !!req.attribution);
      console.log(
        "   - Attribution:",
        req.attribution ? JSON.stringify(req.attribution, null, 2) : "N/A",
      );

      // Pass raw JSON string — URLSearchParams in adjustService.sendEvent() handles URL-encoding.
      // Pre-encoding here causes double-encoding (%25 instead of %) which Adjust rejects.
      eventData.callback_params = JSON.stringify(finalCallbackParams);
      console.log(
        "   - callback_params (raw JSON):",
        eventData.callback_params,
      );

      console.log("\n📤 [Adjust V2 Route] Final eventData to send:");
      console.log("   - Full eventData:", JSON.stringify(eventData, null, 2));
      console.log("   - eventData keys:", Object.keys(eventData));
      console.log("   - event_token:", eventData.event_token);
      console.log("   - s2s:", eventData.s2s);
      console.log(
        "   - app_token will be added by service:",
        "Yes (from config)",
      );

      // Send event to Adjust S2S API
      console.log(
        "\n🚀 [Adjust V2 Route] Calling adjustService.sendEvent()...",
      );
      const adjustResult = await adjustService.sendEvent(eventData);

      console.log("\n📥 [Adjust V2 Route] Received result from adjustService:");
      console.log("   - adjustResult:", JSON.stringify(adjustResult, null, 2));
      console.log("   - adjustResult.success:", adjustResult.success);
      console.log("   - adjustResult.status:", adjustResult.status);
      console.log("   - adjustResult.data:", adjustResult.data);
      console.log("   - adjustResult.data type:", typeof adjustResult.data);
      console.log(
        "   - adjustResult.data is null?",
        adjustResult.data === null,
      );
      console.log(
        "   - adjustResult.data is undefined?",
        adjustResult.data === undefined,
      );
      console.log(
        "   - adjustResult.data is empty object?",
        adjustResult.data &&
          typeof adjustResult.data === "object" &&
          Object.keys(adjustResult.data).length === 0,
      );
      console.log(
        "   - adjustResult.data keys:",
        adjustResult.data ? Object.keys(adjustResult.data) : "N/A",
      );

      // TODO: Uncomment user progress update when needed
      // Update user progress if level event (optional - only if user exists)
      // if (eventType === 'level_complete' && levelNumber && userDocument) {
      //   try {
      //     if (!userDocument.progress) {
      //       userDocument.progress = {};
      //     }
      //     // Only update if new level is greater than current
      //     if (!userDocument.progress.lastLevel || levelNumber > userDocument.progress.lastLevel) {
      //       userDocument.progress.lastLevel = levelNumber;
      //       userDocument.progress.lastLevelCompletedAt = new Date();
      //       await userDocument.save();
      //     }
      //   } catch (updateError) {
      //     console.error('Error updating user progress:', updateError);
      //     // Don't fail the request if progress update fails
      //   }
      // }

      // Log successful event
      console.log("\n✅ [Adjust V2 Route] Event successfully sent to Adjust");
      console.log(`   - Event Type: ${eventType}`);
      console.log(`   - User ID: ${userId}`);
      console.log(`   - Level: ${levelNumber || "N/A"}`);
      console.log(`   - Campaign: ${req.attribution?.campaign || "N/A"}`);
      console.log(`   - Event Token: ${eventToken}`);
      console.log(`   - Adjust Status: ${adjustResult.status}`);
      console.log(
        `   - Adjust Response Data: ${JSON.stringify(adjustResult.data)}`,
      );

      const responseData = {
        success: true,
        message: "Event reported successfully",
        data: {
          eventType: eventType,
          level: levelNumber || null,
          adjustResponse: adjustResult.data,
          timestamp: new Date().toISOString(),
        },
      };

      console.log("\n📤 [Adjust V2 Route] Sending response to client:");
      console.log("   - Response status: 200");
      console.log("   - Response data:", JSON.stringify(responseData, null, 2));

      console.log("\n" + "=".repeat(80));
      console.log("✅ [Adjust V2 Route] Request completed successfully");
      console.log("=".repeat(80));
      console.log("📊 [Adjust V2 Route] Summary:");
      console.log("   - Event Type:", eventType);
      console.log("   - Event Token:", eventToken);
      console.log("   - User ID:", userId);
      console.log("   - Adjust Status:", adjustResult.status);
      console.log(
        "   - Adjust Response Empty?",
        !adjustResult.data || Object.keys(adjustResult.data).length === 0,
      );
      console.log(
        "   - Note: Empty Adjust response is normal (200 OK with {} body)",
      );
      console.log("=".repeat(80) + "\n");

      return res.status(200).json(responseData);
    } catch (error) {
      console.error("\n" + "=".repeat(80));
      console.error(
        "❌ [Adjust V2 Route] ERROR occurred in report-event handler",
      );
      console.error("=".repeat(80));
      console.error("🔍 [Adjust V2 Route] Error Details:");
      console.error("   - Error Type:", error.constructor.name);
      console.error("   - Error Message:", error.message);
      console.error("   - Error Status:", error.status || "N/A");
      console.error("   - Error Code:", error.code || "N/A");
      console.error("   - Error Stack:", error.stack);
      console.error(
        "   - Full Error Object:",
        JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
      );

      if (error.response) {
        console.error("   - Error Response Status:", error.response.status);
        console.error(
          "   - Error Response Data:",
          JSON.stringify(error.response.data, null, 2),
        );
      }

      console.error("Error reporting S2S event:", error);

      const errorResponse = {
        success: false,
        error: error.message || "Failed to report event",
        code: error.code || "EVENT_REPORT_ERROR",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      };

      console.error(
        "📤 [Adjust V2 Route] Sending error response:",
        JSON.stringify(errorResponse, null, 2),
      );

      return res.status(error.status || 500).json(errorResponse);
    }
  },
);

/**
 * @route   GET /api/v2/adjust/retention
 * @desc    Fetch (or create) the user's Adjust retention record.
 *          On the very first call the record is created (firstOpenAt = now),
 *          making this call idempotent and safe to call on every app open.
 *
 *          Response: { isFirstOpen, daysSinceFirstOpen, firedMilestones }
 *            isFirstOpen          — true only on the very first ever call for this account
 *            daysSinceFirstOpen   — full days elapsed since first open (0 on day of install)
 *            firedMilestones      — array of day numbers already marked, e.g. [1, 3, 7]
 * @access  Private
 */
router.get("/retention", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("adjustRetention")
      .lean();

    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const now = new Date();
    let isFirstOpen = false;

    if (!user.adjustRetention?.firstOpenAt) {
      // First ever app open for this account — record it
      await User.findByIdAndUpdate(req.user.userId, {
        $set: { "adjustRetention.firstOpenAt": now, "adjustRetention.firedMilestones": [] },
      });
      isFirstOpen = true;
    }

    const firstOpenAt    = user.adjustRetention?.firstOpenAt || now;
    const msElapsed      = now - new Date(firstOpenAt);
    const daysSinceFirstOpen = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
    const firedMilestones    = user.adjustRetention?.firedMilestones || [];

    console.log(`[Adjust Retention] GET — user: ${req.user.userId} | isFirstOpen: ${isFirstOpen} | days: ${daysSinceFirstOpen} | fired: [${firedMilestones.join(",")}]`);

    res.json({
      success: true,
      data: { isFirstOpen, daysSinceFirstOpen, firedMilestones },
    });
  } catch (error) {
    console.error("[Adjust Retention] GET error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch retention record" });
  }
});

/**
 * @route   POST /api/v2/adjust/retention/milestone
 * @desc    Mark a retention day milestone as fired for this user.
 *          Idempotent — re-marking an already-fired day is a no-op.
 * @body    { day: number }  e.g. { day: 7 }
 * @access  Private
 */
router.post("/retention/milestone", protect, async (req, res) => {
  try {
    const { day } = req.body;

    const validDays = [1, 3, 7, 14, 21, 31, 40, 60, 90];
    if (!day || !validDays.includes(Number(day))) {
      return res.status(400).json({
        success: false,
        error: `Invalid day. Must be one of: ${validDays.join(", ")}`,
      });
    }

    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { "adjustRetention.firedMilestones": Number(day) },
    });

    console.log(`[Adjust Retention] Milestone Day ${day} recorded — user: ${req.user.userId}`);

    res.json({ success: true, data: { day: Number(day), recorded: true } });
  } catch (error) {
    console.error("[Adjust Retention] POST milestone error:", error);
    res.status(500).json({ success: false, error: "Failed to record milestone" });
  }
});

/**
 * @route   GET /api/v2/adjust/counts
 * @desc    Return server-side cumulative milestone counts for this user.
 *          Frontend seeds its in-memory Adjust counters from this on every
 *          login / app open — ensures reinstalls start from the correct count.
 * @access  Private
 */
router.get("/counts", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select("surveys games withdrawals spinCount continuousProgress")
      .lean();

    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const surveysCompleted   = (user.surveys  || []).filter((s) => s.completed).length;
    const gamesDownloaded    = (user.games    || []).filter((g) => g.installedAt || g.status === "installed").length;
    const withdrawalsCount   = (user.withdrawals || []).length;
    const spinCount          = user.spinCount || 0;
    const challengesCompleted = user.continuousProgress?.challengesCompleted || 0;

    res.json({
      success: true,
      data: {
        surveysCompleted,
        gamesDownloaded,
        withdrawalsCount,
        spinCount,
        challengesCompleted,
      },
    });
  } catch (error) {
    console.error("[Adjust Counts] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch counts" });
  }
});

/**
 * @route   GET /api/v2/adjust/health
 * @desc    Health check for V2 S2S service
 * @access  Public
 */
router.get("/health", async (req, res) => {
  try {
    const { isFirebaseInitialized } = require("../utils/firebaseAdmin");
    const adjustHealth = await adjustService.healthCheck();

    res.json({
      success: true,
      data: {
        service: "Adjust S2S V2",
        firebaseConfigured: isFirebaseInitialized(),
        adjustConfigured: adjustHealth.configured,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Health check failed",
      message: error.message,
    });
  }
});

/**
 * @route   GET /api/v2/adjust/config
 * @desc    Get configuration info for client
 * @access  Private (requires Firebase Auth)
 */
router.get(
  "/config",
  // TODO: Uncomment when Firebase credentials are available
  // verifyFirebaseIdToken,
  protect, // Temporarily using JWT auth
  async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          version: "2.0",
          requiresAppCheck: true,
          requiresFirebaseAuth: true,
          allowedEventTypes: [
            "level_complete",
            "game_complete",
            "achievement_unlocked",
            "purchase",
            "ad_revenue",
            "session_start",
            "custom",
          ],
          offerwallCampaigns: process.env.OFFERWALL_CAMPAIGNS?.split(",") || [],
          allowLevelSkipping: process.env.ALLOW_LEVEL_SKIPPING === "true",
          allowOrganicUsers: process.env.ALLOW_ORGANIC_USERS === "true",
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get config",
        message: error.message,
      });
    }
  },
);

/**
 * @route   GET /api/v2/adjust/events
 * @desc    Get available Adjust event tokens (S2S events only)
 * @access  Private (requires Firebase Auth)
 * @query   category - Filter by category
 * @query   search - Search by name
 */
router.get(
  "/events",
  // TODO: Uncomment when Firebase credentials are available
  // verifyFirebaseIdToken,
  protect, // Temporarily using JWT auth
  async (req, res) => {
    try {
      const { category, search } = req.query;

      const query = { isS2S: true, isActive: true };

      if (category) {
        query.category = category;
      }

      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      const events = await AdjustEventToken.find(query)
        .select("token name category description")
        .sort({ name: 1 })
        .lean();

      res.json({
        success: true,
        data: {
          events,
          count: events.length,
          message:
            "These are the available S2S event tokens. Use the token field when calling /report-event.",
        },
      });
    } catch (error) {
      console.error("Error fetching Adjust events:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get events",
        message: error.message,
      });
    }
  },
);

module.exports = router;

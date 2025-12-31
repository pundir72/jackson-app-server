const express = require("express");
const router = express.Router();
const User = require("../models/User");
const protect = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

router.get("/status", protect, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Only select the fields we need to keep the query fast
    const user = await User.findById(userId).select(
      "disclosureAccepted location"
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Logic to determine if location is actually set
    const hasLocation = !!(
      user.location &&
      user.location.current &&
      user.location.current.latitude !== undefined
    );

    res.status(200).json({
      success: true,
      data: {
        disclosureAccepted: user.disclosureAccepted || false,
        locationCaptured: hasLocation,
        // We send these flags so the frontend can easily route the user
        needsDisclosure: !user.disclosureAccepted,
        needsLocation: user.disclosureAccepted && !hasLocation,
      },
    });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user status",
      error: error.message,
    });
  }
});

// Report location and IP (single endpoint for FE to call)
router.post("/report", protect, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, timestamp, country, city, ip } =
      req.body;
    const userId = req.user.userId;
    const ipCandidates = [
      req.headers["cf-connecting-ip"],
      req.headers["x-real-ip"],
      Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : req.headers["x-forwarded-for"]
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : null,
      req.ip,
    ].filter(Boolean);
    let ipAddress = ip || ipCandidates[0];
    if (ipAddress && ipAddress.startsWith("::ffff:"))
      ipAddress = ipAddress.replace("::ffff:", "");
    if (ipAddress === "::1") ipAddress = "127.0.0.1";
    // Basic coord validation
    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid latitude value" });
    }
    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid longitude value" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Ensure containers exist
    if (!user.location) {
      user.location = { current: {}, history: [] };
    }

    // Update current GPS
    if (latitude !== undefined && longitude !== undefined) {
      const current = {
        latitude,
        longitude,
        accuracy: accuracy || 0,
        country: country || undefined,
        city: city || undefined,
        ip: ipAddress,
        timestamp: timestamp || new Date(),
      };
      user.location.current = current;
      user.location.history.push(current);
      if (user.location.history.length > 100) {
        user.location.history = user.location.history.slice(-100);
      }
    }

    // Update last seen IP
    user.lastIp = ipAddress;

    await user.save();

    // Invalidate profile cache so GET /api/profile reflects latest IP/location
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(userId);
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after /report:",
        e.message
      );
    }

    res.status(200).json({
      success: true,
      message: "Location and IP reported successfully",
      data: {
        current: user.location.current,
        lastIp: user.lastIp,
      },
    });
  } catch (error) {
    console.error("Error reporting location:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to report location",
        error: error.message,
      });
  }
});

// Update location settings
// Removed /settings endpoint per requirements

// Get current location settings
// Removed settings getter per requirements

// IP-based location fallback
router.post("/ip-location", async (req, res) => {
  try {
    const { mobile, country, city, latitude, longitude } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    const update = {};

    // Capture and store IP as well
    const ipCandidates = [
      req.headers["cf-connecting-ip"],
      req.headers["x-real-ip"],
      Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : req.headers["x-forwarded-for"]
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : null,
      req.ip,
    ].filter(Boolean);
    let ipAddress = ipCandidates[0];
    if (ipAddress && ipAddress.startsWith("::ffff:"))
      ipAddress = ipAddress.replace("::ffff:", "");
    if (ipAddress === "::1") ipAddress = "127.0.0.1";
    update["lastIp"] = ipAddress;

    const user = await User.findOneAndUpdate({ mobile }, update, {
      upsert: true,
      new: true,
    });

    // Invalidate profile cache
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      if (user?._id) invalidateUserCaches(user._id.toString());
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after /ip-location:",
        e.message
      );
    }

    res.status(200).json({
      message: "IP updated successfully",
      lastIp: update.lastIp,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update IP location" });
  }
});

// Get location status for analytics
router.get("/analytics/:mobile", async (req, res) => {
  try {
    const { mobile } = req.params;
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      status: user.locationSettings.status,
      mode: user.locationSettings.mode,
      lastGrantedAt: user.locationSettings.lastGrantedAt,
      fallbackLocation: user.locationSettings.fallbackLocation.enabled,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics data" });
  }
});

// Update current location
router.post("/update", protect, async (req, res) => {
  try {
    const { latitude, longitude, accuracy, timestamp } = req.body;
    const userId = req.user.userId;

    const ipCandidates = [
      req.headers["cf-connecting-ip"],
      req.headers["x-real-ip"],
      Array.isArray(req.headers["x-forwarded-for"])
        ? req.headers["x-forwarded-for"][0]
        : req.headers["x-forwarded-for"]
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : null,
      req.ip,
    ].filter(Boolean);
    let ipAddress = ipCandidates[0];
    if (ipAddress && ipAddress.startsWith("::ffff:"))
      ipAddress = ipAddress.replace("::ffff:", "");
    if (ipAddress === "::1") ipAddress = "127.0.0.1";

    // Validate coordinates
    if (latitude && (latitude < -90 || latitude > 90)) {
      return res.status(400).json({ error: "Invalid latitude value" });
    }

    if (longitude && (longitude < -180 || longitude > 180)) {
      return res.status(400).json({ error: "Invalid longitude value" });
    }

    // Find user from MongoDB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Initialize location if it doesn't exist
    if (!user.location) {
      user.location = {
        current: {},
        history: [],
      };
    }

    // Update current location
    user.location.current = {
      latitude,
      longitude,
      accuracy: accuracy || 0,
      ip: ipAddress,
      timestamp: timestamp || new Date(),
    };

    // Add to history
    user.location.history.push({
      latitude,
      longitude,
      accuracy: accuracy || 0,
      ip: ipAddress,
      timestamp: timestamp || new Date(),
    });

    // Keep only last 100 locations in history
    if (user.location.history.length > 100) {
      user.location.history = user.location.history.slice(-100);
    }

    await user.save();

    // Also store last seen IP
    await User.findByIdAndUpdate(userId, {
      $set: { lastIp: ipAddress },
    });

    // Invalidate profile cache so latest IP appears in GET /api/profile
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(userId);
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after /update:",
        e.message
      );
    }

    // Log the location update
    console.log(
      `Location updated for user ${user.userId} (mobile: ${user.mobile}):`,
      {
        latitude,
        longitude,
        accuracy,
        timestamp: timestamp || new Date(),
      }
    );

    res.status(200).json({
      message: "Location updated successfully",
      location: user.location.current,
    });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
});

// Get location history
router.get("/history", protect, async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    const userId = req.user.userId;

    // Find user from MongoDB
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Filter history based on date range if provided
    let history = [...user.location.history];

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();

      history = history.filter((location) => {
        const locDate = new Date(location.timestamp);
        return locDate >= start && locDate <= end;
      });
    }

    // Sort by timestamp (newest first) and limit results
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    history = history.slice(0, parseInt(limit));

    res.status(200).json({
      history,
      total: history.length,
    });
  } catch (error) {
    console.error("Error fetching location history:", error);
    res.status(500).json({ error: "Failed to fetch location history" });
  }
});

module.exports = router;

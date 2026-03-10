const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const analytics = require("../utils/analytics");

// Constants
const MAX_VERIFICATION_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const LIVENESS_THRESHOLD = 0.8; // 80% confidence for liveness
const FACE_VERIFICATION_THRESHOLD = 0.7; // 70% confidence for face match

// 🔥 FIX: Mobile number normalization helper
// Normalizes mobile numbers to handle +91, 91, 919999988888, etc.
const normalizeMobile = (mobile) => {
  if (!mobile) return null;

  // Remove all non-digit characters except +
  let normalized = mobile.toString().trim();

  // Remove leading + if present
  if (normalized.startsWith("+")) {
    normalized = normalized.substring(1);
  }

  // For Indian numbers (+91), remove country code if present
  // If number starts with 91 and has 12 digits, remove leading 91
  if (normalized.startsWith("91") && normalized.length === 12) {
    normalized = normalized.substring(2);
  }

  // Return normalized number (should be 10 digits for Indian numbers)
  return normalized;
};

// 🔥 FIX: Helper to find user by mobile with normalization
const findUserByMobile = async (mobile) => {
  if (!mobile) return null;

  const normalized = normalizeMobile(mobile);

  // Try exact match first
  let user = await User.findOne({ mobile: normalized });

  // If not found, try with + prefix
  if (!user) {
    user = await User.findOne({ mobile: `+${normalized}` });
  }

  // If still not found, try with country code
  if (!user && normalized.length === 10) {
    user = await User.findOne({ mobile: `91${normalized}` });
    if (!user) {
      user = await User.findOne({ mobile: `+91${normalized}` });
    }
  }

  return user;
};

// Verify biometric
router.post("/verify", async (req, res) => {
  try {
    const { verificationData, deviceId, scanType } = req.body;

    // Extract JWT token from Authorization header (Bearer token)
    let token = req.header("Authorization");
    if (token && token.startsWith("Bearer ")) {
      token = token.replace("Bearer ", "");
    }

    // Fallback: try x-auth-token header
    if (!token) {
      token = req.header("x-auth-token");
    }

    // Fallback: try body token (for backward compatibility)
    if (!token) {
      token = req.body.token;
    }

    if (!token) {
      return res.status(400).json({
        error:
          "Token is required. Please provide JWT token in Authorization header as Bearer token.",
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(400).json({
        error: "Invalid or expired token",
        message: jwtError.message,
      });
    }

    // Check if decoded token has required fields
    if (!decoded.userId) {
      return res.status(400).json({ error: "Invalid token format" });
    }

    // Find user by userId from JWT token
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user account status allows authentication (only active users can use biometric auth)
    if (user.profile && user.profile.status !== "active") {
      const status = user.profile.status;
      const statusReason = user.profile.statusReason;

      let message =
        "Your account is not active. Please contact support for more information.";
      if (status === "suspended") {
        message =
          statusReason ||
          "Your account has been suspended. Please contact support for more information.";
      } else if (status === "paused") {
        message =
          statusReason ||
          "Your account has been paused. Please contact support for more information.";
      } else if (status === "inactive") {
        message =
          "Your account is inactive. Please contact support to reactivate your account.";
      }

      return res.status(403).json({
        error: "Account not active",
        message: message,
        accountStatus: status,
        statusReason: statusReason,
      });
    }

    // Check if user is locked out due to too many attempts
    if (
      user.biometric?.lockedUntil &&
      user.biometric.lockedUntil > new Date()
    ) {
      return res.status(403).json({
        error: "Account locked. Please try again later",
        unlockTime: user.biometric.lockedUntil,
      });
    }

    // Log verification attempt
    await analytics.log("face_verification_started", {
      userId: user._id,
      deviceId: deviceId,
      scanType: scanType || "os_face_id",
    });

    // Handle verification data (for third-party liveness checks)
    if (verificationData) {
      // TODO: Implement third-party liveness check verification
      const livenessScore = verificationData.livenessScore || 0;
      const faceMatchScore = verificationData.faceMatchScore || 0;

      if (livenessScore < LIVENESS_THRESHOLD) {
        return res.status(400).json({
          error: "Liveness check failed",
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD,
        });
      }

      if (faceMatchScore < FACE_VERIFICATION_THRESHOLD) {
        return res.status(400).json({
          error: "Face verification failed",
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD,
        });
      }
    }

    // Increment attempt counter
    const attempts = (user.biometric?.attempts || 0) + 1;

    // If too many attempts, lock the account
    if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCKOUT_DURATION);

      await User.findByIdAndUpdate(user._id, {
        $set: {
          "biometric.attempts": 0,
          "biometric.lockedUntil": lockUntil,
        },
      });

      return res.status(403).json({
        error: "Too many failed attempts. Account locked for 30 minutes",
        unlockTime: lockUntil,
      });
    }

    // Generate JWT token
    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "60d",
    });

    // 🔥 FIX: Ensure biometric object exists before updating
    // Initialize biometric object if it doesn't exist
    const update = {
      $set: {
        "biometric.setup": true,
        "biometric.type": "face_id",
        "biometric.attempts": attempts,
        "biometric.lastVerification": new Date(),
        "biometric.lastLogin": new Date(),
        "biometric.token": null,
        "biometric.tokenExpiresAt": null,
      },
    };

    // Update face verification status if applicable
    if (verificationData) {
      update.$set["biometric.faceVerification.verified"] = true;
      update.$set["biometric.faceVerification.confidenceScore"] =
        verificationData.faceMatchScore;
      update.$set["biometric.faceVerification.lastVerified"] = new Date();
      update.$set["biometric.livenessCheck.lastChecked"] = new Date();
      update.$set["biometric.livenessCheck.lastScore"] =
        verificationData.livenessScore;
      update.$set["biometric.livenessCheck.lastDeviceId"] = deviceId;
      update.$set["biometric.livenessCheck.lastScanType"] =
        scanType || "os_face_id";
    }

    // 🔥 FIX: Add logging before update
    console.log(
      `[BIOMETRIC-VERIFY] Updating user ${user._id} with:`,
      JSON.stringify(update, null, 2),
    );

    // 🔥 FIX: Use strict: false to allow saving fields not in schema
    const updateResult = await User.findByIdAndUpdate(user._id, update, {
      new: true,
      strict: false, // 🔥 CRITICAL: Allow saving fields not in schema
      runValidators: false,
    });

    // 🔥 FIX: Verify update was successful
    if (!updateResult) {
      console.error(`[BIOMETRIC-VERIFY] Failed to update user ${user._id}`);
      return res
        .status(500)
        .json({ error: "Failed to update biometric status" });
    }

    // 🔥 FIX: Log updated user for debugging
    const updatedUser = await User.findById(user._id);
    console.log(`[BIOMETRIC-VERIFY] User after update:`, {
      setup: updatedUser.biometric?.setup,
      type: updatedUser.biometric?.type,
      verified: updatedUser.biometric?.faceVerification?.verified,
    });

    // Invalidate profile cache so GET /api/profile reflects latest face verification status
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(user._id.toString());
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after face verification:",
        e.message,
      );
    }

    // Log successful verification
    await analytics.log("face_verified", {
      userId: user._id,
      deviceId: deviceId,
      scanType: scanType || "os_face_id",
      confidenceScore: verificationData?.faceMatchScore,
      livenessScore: verificationData?.livenessScore,
    });

    res.status(200).json({
      token: jwtToken,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        biometricType: updatedUser.biometric?.type || "face_id",
        faceVerified: verificationData ? true : false,
        confidenceScore: verificationData?.faceMatchScore,
      },
    });
  } catch (error) {
    console.error("Biometric verification error:", error);
    await analytics.log("face_verification_failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to verify biometric" });
  }
});

// Setup biometric
router.post("/setup", async (req, res) => {
  try {
    const { mobile, type, verificationData, deviceId } = req.body;

    // 🔥 FIX: Validate required fields
    if (!mobile || !["face_id", "fingerprint"].includes(type)) {
      return res.status(400).json({ error: "Invalid request parameters" });
    }

    if (!deviceId) {
      return res.status(400).json({ error: "Device ID is required" });
    }

    // 🔥 FIX: Extract and verify JWT token (same as /verify endpoint)
    let token = req.header("Authorization");
    if (token && token.startsWith("Bearer ")) {
      token = token.replace("Bearer ", "");
    }

    // Fallback: try x-auth-token header
    if (!token) {
      token = req.header("x-auth-token");
    }

    // Fallback: try body token (for backward compatibility)
    if (!token) {
      token = req.body.token;
    }

    // 🔥 FIX: Verify JWT token to ensure user is authenticated
    let decoded;
    if (token) {
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({
          error: "Invalid or expired token",
          message: jwtError.message,
        });
      }
    }

    // 🔥 FIX: Use normalized mobile lookup
    const user = await findUserByMobile(mobile);

    if (!user) {
      console.error(
        `[BIOMETRIC-SETUP] User not found for mobile: ${mobile} (normalized: ${normalizeMobile(mobile)})`,
      );
      return res.status(404).json({ error: "User not found" });
    }

    // 🔥 FIX: Verify token userId matches the user being updated (security check)
    if (decoded && decoded.userId && decoded.userId !== user._id.toString()) {
      return res.status(403).json({
        error: "Unauthorized: Token does not match user",
      });
    }

    // Check if user account status allows authentication
    if (user.profile && user.profile.status !== "active") {
      const status = user.profile.status;
      const statusReason = user.profile.statusReason;

      let message =
        "Your account is not active. Please contact support for more information.";
      if (status === "suspended") {
        message =
          statusReason ||
          "Your account has been suspended. Please contact support for more information.";
      } else if (status === "paused") {
        message =
          statusReason ||
          "Your account has been paused. Please contact support for more information.";
      } else if (status === "inactive") {
        message =
          "Your account is inactive. Please contact support to reactivate your account.";
      }

      return res.status(403).json({
        error: "Account not active",
        message: message,
        accountStatus: status,
        statusReason: statusReason,
      });
    }

    // 🔥 FIX: Log user found
    console.log(
      `[BIOMETRIC-SETUP] Found user ${user._id} with mobile: ${user.mobile}`,
    );

    // Log verification attempt
    await analytics.log("face_verification_started", {
      userId: user._id,
      deviceId: deviceId,
      scanType: type,
    });

    // Handle verification data (for third-party liveness checks)
    if (verificationData) {
      const livenessScore = verificationData.livenessScore || 0;
      const faceMatchScore = verificationData.faceMatchScore || 0;

      if (livenessScore < LIVENESS_THRESHOLD) {
        await analytics.log("face_verification_failed", {
          userId: user._id,
          error: "Liveness check failed",
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD,
        });
        return res.status(400).json({
          error: "Liveness check failed",
          score: livenessScore,
          threshold: LIVENESS_THRESHOLD,
        });
      }

      if (faceMatchScore < FACE_VERIFICATION_THRESHOLD) {
        await analytics.log("face_verification_failed", {
          userId: user._id,
          error: "Face verification failed",
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD,
        });
        return res.status(400).json({
          error: "Face verification failed",
          score: faceMatchScore,
          threshold: FACE_VERIFICATION_THRESHOLD,
        });
      }
    }

    // 🔥 FIX: Use save() method instead of findByIdAndUpdate for better reliability with nested objects
    // This ensures nested biometric fields are properly saved to the database
    console.log(
      `[BIOMETRIC-SETUP] Using save() method to ensure data persistence`,
    );
    console.log(
      `[BIOMETRIC-SETUP] Current user biometric state before update:`,
      {
        hasBiometric: !!user.biometric,
        hasFaceVerification: !!user.biometric?.faceVerification,
        hasLivenessCheck: !!user.biometric?.livenessCheck,
      },
    );

    // Fetch fresh user document
    const userDoc = await User.findById(user._id);
    if (!userDoc) {
      console.error(`[BIOMETRIC-SETUP] User not found: ${user._id}`);
      return res.status(404).json({ error: "User not found" });
    }

    // Initialize biometric object if it doesn't exist
    if (!userDoc.biometric) {
      userDoc.biometric = {
        enabled: false,
        attempts: 0,
      };
    }

    // Set top-level biometric fields
    userDoc.biometric.setup = true;
    userDoc.biometric.type = type;
    userDoc.biometric.lastSetupAt = new Date();
    userDoc.biometric.attempts = 0;
    userDoc.biometric.lockedUntil = null;

    // Initialize nested objects if they don't exist
    if (!userDoc.biometric.faceVerification) {
      userDoc.biometric.faceVerification = {};
    }
    if (!userDoc.biometric.livenessCheck) {
      userDoc.biometric.livenessCheck = {};
    }

    // Set nested verification fields
    if (verificationData) {
      userDoc.biometric.faceVerification.verified = true;
      userDoc.biometric.faceVerification.confidenceScore =
        verificationData.faceMatchScore || 1.0;
      userDoc.biometric.faceVerification.lastVerified = new Date();
      userDoc.biometric.faceVerification.verificationAttempts = 0;

      userDoc.biometric.livenessCheck.lastChecked = new Date();
      userDoc.biometric.livenessCheck.lastScore =
        verificationData.livenessScore || 1.0;
      userDoc.biometric.livenessCheck.lastDeviceId = deviceId;
      userDoc.biometric.livenessCheck.lastScanType = type;
    } else {
      // Initialize even without verificationData
      userDoc.biometric.faceVerification.verified = false;
      userDoc.biometric.faceVerification.verificationAttempts = 0;

      userDoc.biometric.livenessCheck.lastChecked = null;
      userDoc.biometric.livenessCheck.lastScore = null;
      userDoc.biometric.livenessCheck.lastDeviceId = deviceId || null;
      userDoc.biometric.livenessCheck.lastScanType = type || null;
    }

    // Log before save
    console.log(`[BIOMETRIC-SETUP] Saving user with biometric:`, {
      setup: userDoc.biometric.setup,
      type: userDoc.biometric.type,
      hasFaceVerification: !!userDoc.biometric.faceVerification,
      hasLivenessCheck: !!userDoc.biometric.livenessCheck,
    });

    // Mark biometric as modified to ensure Mongoose saves nested fields
    userDoc.markModified("biometric");
    userDoc.markModified("biometric.faceVerification");
    userDoc.markModified("biometric.livenessCheck");

    // Save the document - this is more reliable than findByIdAndUpdate for nested objects
    try {
      await userDoc.save({ validateBeforeSave: false });
      console.log(`[BIOMETRIC-SETUP] ✅ Save completed successfully`);
    } catch (saveError) {
      console.error(`[BIOMETRIC-SETUP] ❌ Save error:`, saveError);
      console.error(`[BIOMETRIC-SETUP] Save error message:`, saveError.message);
      console.error(`[BIOMETRIC-SETUP] Save error stack:`, saveError.stack);
      return res.status(500).json({
        error: "Failed to save biometric data",
        details: saveError.message,
      });
    }

    // Fetch fresh from database to verify save
    const updatedUser = await User.findById(user._id).lean();
    console.log(`[BIOMETRIC-SETUP] Database verification after save:`, {
      setup: updatedUser.biometric?.setup,
      type: updatedUser.biometric?.type,
      verified: updatedUser.biometric?.faceVerification?.verified,
      hasFaceVerification: !!updatedUser.biometric?.faceVerification,
      hasLivenessCheck: !!updatedUser.biometric?.livenessCheck,
      mobile: updatedUser.mobile,
    });

    // 🔥 CRITICAL: Log full biometric object to see what was actually saved
    console.log(
      `[BIOMETRIC-SETUP] Full biometric object from database:`,
      JSON.stringify(updatedUser.biometric, null, 2),
    );

    // Verify save was successful
    if (!updatedUser.biometric?.setup) {
      console.error(
        `[BIOMETRIC-SETUP] ❌ CRITICAL: Save completed but biometric.setup is NOT true in database!`,
      );
      console.error(
        `[BIOMETRIC-SETUP] This indicates a serious database/schema issue.`,
      );
      console.error(
        `[BIOMETRIC-SETUP] Current biometric state:`,
        JSON.stringify(updatedUser.biometric, null, 2),
      );
      return res.status(500).json({
        error:
          "Biometric data was not saved to database. Please check backend logs and schema configuration.",
        details: "Setup field is missing after save operation",
      });
    } else {
      console.log(
        `[BIOMETRIC-SETUP] ✅ Verification successful - biometric.setup is true in database`,
      );
    }

    // Invalidate profile cache so GET /api/profile reflects latest face verification status
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(user._id.toString());
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after biometric setup:",
        e.message,
      );
    }

    // Log successful setup
    await analytics.log("face_verification_success", {
      userId: user._id,
      deviceId: deviceId,
      scanType: type,
      confidenceScore: verificationData?.faceMatchScore,
      livenessScore: verificationData?.livenessScore,
    });

    // 🔥 FIX: Return consistent response structure
    res.status(200).json({
      success: true,
      message: "Biometric setup successful",
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        biometricType: type,
        faceVerified: verificationData ? true : false,
        confidenceScore: verificationData?.faceMatchScore,
      },
      biometric: {
        setup: updatedUser.biometric?.setup || true,
        type: updatedUser.biometric?.type || type,
        verified: updatedUser.biometric?.faceVerification?.verified || false,
        lastVerified:
          updatedUser.biometric?.faceVerification?.lastVerified || new Date(),
      },
    });
  } catch (error) {
    console.error("Biometric setup error:", error);
    await analytics.log("face_verification_failed", {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Failed to setup biometric" });
  }
});

// Reset biometric
router.post("/reset", async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile is required" });
    }

    // 🔥 FIX: Use normalized mobile lookup
    const user = await findUserByMobile(mobile);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Reset biometric settings
    await User.findByIdAndUpdate(user._id, {
      $set: {
        "biometric.setup": false,
        "biometric.type": "none",
        "biometric.lastSetupAt": null,
        "biometric.lastVerification": null,
        "biometric.attempts": 0,
        "biometric.lockedUntil": null,
        "biometric.token": null,
        "biometric.tokenExpiresAt": null,
        "biometric.faceVerification.verified": false,
        "biometric.faceVerification.faceVector": null,
        "biometric.faceVerification.lastVerified": null,
        "biometric.faceVerification.confidenceScore": null,
        "biometric.faceVerification.verificationAttempts": 0,
        "biometric.faceVerification.lastFailedAttempt": null,
        "biometric.livenessCheck.lastChecked": null,
        "biometric.livenessCheck.lastScore": null,
        "biometric.livenessCheck.lastDeviceId": null,
        "biometric.livenessCheck.lastScanType": "os_face_id",
      },
    });

    res.status(200).json({
      message: "Biometric settings reset successfully",
    });
  } catch (error) {
    console.error("Biometric reset error:", error);
    res.status(500).json({ error: "Failed to reset biometric" });
  }
});

// Check biometric registration status
// Used by: BiometricLoginButton.jsx - checks if Face ID is registered before allowing login
router.get("/status", async (req, res) => {
  try {
    const { mobile, email, deviceId } = req.query;

    // At least one identifier is required
    if (!mobile && !email && !deviceId) {
      return res.status(400).json({
        error: "Mobile, email, or deviceId is required",
        isRegistered: false,
      });
    }

    let user;

    // 🔥 FIX: Use normalized mobile lookup
    if (mobile) {
      user = await findUserByMobile(mobile);
      console.log(
        `[BIOMETRIC-STATUS] Searching by mobile: ${mobile} (normalized: ${normalizeMobile(mobile)})`,
      );
    }
    // Find user by email if mobile not found
    else if (email && !user) {
      user = await User.findOne({ email });
      console.log(`[BIOMETRIC-STATUS] Searching by email: ${email}`);
    }
    // Find user by device ID if mobile/email not provided
    else if (deviceId && !user) {
      // Try to find user by device ID stored in biometric.livenessCheck.lastDeviceId
      // This works if user registered from this device
      user = await User.findOne({
        "biometric.livenessCheck.lastDeviceId": deviceId,
        "biometric.setup": true,
      });
      console.log(`[BIOMETRIC-STATUS] Searching by deviceId: ${deviceId}`);
    }

    if (!user) {
      console.log(`[BIOMETRIC-STATUS] User not found`);
      return res.status(404).json({
        error: "User not found",
        isRegistered: false,
        success: false,
      });
    }

    // 🔥 FIX: Log user found and current biometric state
    console.log(`[BIOMETRIC-STATUS] User found: ${user._id}`, {
      mobile: user.mobile,
      biometricSetup: user.biometric?.setup,
      biometricType: user.biometric?.type,
      faceVerified: user.biometric?.faceVerification?.verified,
      isVerified: user.isVerified,
    });

    // Check if biometric is set up and verified
    const isSetup = user.biometric?.setup === true;
    const biometricType = user.biometric?.type || "none";

    // 🔥 FIX: Less strict verification logic
    // For face_id: require faceVerification.verified OR fallback to isVerified
    // For fingerprint: always considered verified (no face scan needed)
    const biometricVerified =
      biometricType === "fingerprint" || // Fingerprint is always verified
      user.biometric?.faceVerification?.verified === true ||
      (biometricType === "face_id" && user.isVerified === true); // 🔥 FALLBACK for old users

    // 🔥 FIX: Less strict registration logic
    // If setup is true and type is not "none", consider registered
    // Verification is checked separately but doesn't block registration status
    const isRegistered =
      isSetup &&
      biometricType !== "none" &&
      (biometricVerified || biometricType === "fingerprint"); // Fingerprint doesn't need verification

    // 🔥 FIX: Log registration calculation
    console.log(`[BIOMETRIC-STATUS] Registration check:`, {
      isSetup,
      biometricType,
      biometricVerified,
      isRegistered,
    });

    // Log status check for analytics
    try {
      await analytics.log("biometric_status_check", {
        userId: user._id,
        isRegistered: isRegistered,
        biometricType: biometricType,
        checkMethod: mobile ? "mobile" : email ? "email" : "deviceId",
      });
    } catch (analyticsError) {
      console.warn(
        "Failed to log biometric status check:",
        analyticsError.message,
      );
    }

    res.status(200).json({
      success: true,
      isRegistered,
      biometricType,
      setup: isSetup,
      verified: biometricVerified,
      lastVerified:
        user.biometric?.faceVerification?.lastVerified ||
        user.biometric?.lastVerification ||
        null,
      user: isRegistered
        ? {
            _id: user._id,
            mobile: user.mobile,
            email: user.email,
          }
        : null,
    });
  } catch (error) {
    console.error("Biometric status check error:", error);
    try {
      await analytics.log("biometric_status_check_failed", {
        error: error.message,
        stack: error.stack,
      });
    } catch (analyticsError) {
      // Ignore analytics errors
    }
    res.status(500).json({
      error: "Failed to check biometric status",
      isRegistered: false,
      success: false,
    });
  }
});

// Biometric login (Face ID / Fingerprint login)
// Used by: BiometricLoginButton.jsx - authenticates user with Face ID and returns fresh token
router.post("/biometric-login", async (req, res) => {
  try {
    const { mobile, email, deviceId, biometricType } = req.body;

    // At least mobile or email is required
    if (!mobile && !email) {
      return res.status(400).json({
        error: "Mobile or email is required",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        error: "Device ID is required",
      });
    }

    // 🔥 FIX: Use normalized mobile lookup
    let user;
    if (mobile) {
      user = await findUserByMobile(mobile);
    } else if (email) {
      user = await User.findOne({ email });
    }

    if (!user) {
      return res.status(404).json({
        error: "User not found",
        success: false,
      });
    }

    // Check if user account status allows authentication
    if (user.profile && user.profile.status !== "active") {
      const status = user.profile.status;
      const statusReason = user.profile.statusReason;

      let message =
        "Your account is not active. Please contact support for more information.";
      if (status === "suspended") {
        message =
          statusReason ||
          "Your account has been suspended. Please contact support for more information.";
      } else if (status === "paused") {
        message =
          statusReason ||
          "Your account has been paused. Please contact support for more information.";
      } else if (status === "inactive") {
        message =
          "Your account is inactive. Please contact support to reactivate your account.";
      }

      return res.status(403).json({
        error: "Account not active",
        message: message,
        accountStatus: status,
        statusReason: statusReason,
        success: false,
      });
    }

    // Check if biometric is set up
    if (!user.biometric?.setup) {
      return res.status(403).json({
        error:
          "Biometric authentication is not set up. Please register Face ID first.",
        success: false,
      });
    }

    // Verify biometric type matches (optional validation)
    const expectedType = user.biometric?.type;
    if (
      biometricType &&
      expectedType &&
      expectedType !== "none" &&
      !biometricType.toLowerCase().includes(expectedType.toLowerCase()) &&
      !expectedType.toLowerCase().includes(biometricType.toLowerCase())
    ) {
      // Log mismatch but don't block - device may support multiple types
      console.warn(
        `Biometric type mismatch for user ${user._id}: Expected ${expectedType}, Got ${biometricType}`,
      );
    }

    // Check if account is locked due to too many failed attempts
    if (user.biometric.lockedUntil && user.biometric.lockedUntil > new Date()) {
      return res.status(403).json({
        error: "Account locked. Please try again later",
        unlockTime: user.biometric.lockedUntil,
        success: false,
      });
    }

    // Reset attempt counter on successful login
    const update = {
      $set: {
        "biometric.attempts": 0,
        "biometric.lastLogin": new Date(),
        "biometric.lockedUntil": null,
      },
    };

    await User.findByIdAndUpdate(user._id, update);

    // Generate fresh JWT token (same as regular login)
    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "60d",
    });

    // Log successful biometric login
    try {
      await analytics.log("biometric_login_success", {
        userId: user._id,
        deviceId: deviceId,
        biometricType: biometricType || expectedType,
      });
    } catch (analyticsError) {
      console.warn("Failed to log biometric login:", analyticsError.message);
    }

    // Invalidate profile cache so GET /api/profile reflects latest data
    try {
      const { invalidateUserCaches } = require("../utils/optimizedProfile");
      invalidateUserCaches(user._id.toString());
    } catch (e) {
      console.warn(
        "Failed to invalidate user caches after biometric login:",
        e.message,
      );
    }

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        biometricType: user.biometric?.type,
        faceVerified: user.biometric?.faceVerification?.verified || false,
      },
    });
  } catch (error) {
    console.error("Biometric login error:", error);
    try {
      await analytics.log("biometric_login_failed", {
        error: error.message,
        stack: error.stack,
      });
    } catch (analyticsError) {
      // Ignore analytics errors
    }
    res.status(500).json({
      error: "Failed to authenticate with biometric",
      success: false,
    });
  }
});

module.exports = router;

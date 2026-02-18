const express = require("express");
const router = express.Router();
const User = require("../models/User");
const crypto = require("crypto");
const everflowService = require("../services/everflow.service");
const config = require("../config/config");

// Test biometric verification
router.post("/test/biometric", async (req, res) => {
  try {
    const { mobile, token } = req.body;

    if (!mobile || !token) {
      return res.status(400).json({ error: "Mobile and token are required" });
    }

    // Simulate biometric verification
    const isValidBiometric = true; // In production, this would be replaced with actual biometric check

    if (isValidBiometric) {
      // Update user's last login time
      await User.findOneAndUpdate(
        { mobile },
        { "biometric.lastLogin": new Date() }
      );

      res.status(200).json({
        success: true,
        message: "Biometric verification successful",
      });
    } else {
      res.status(400).json({
        error: "Biometric verification failed",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to verify biometric" });
  }
});

// Test CAPTCHA
router.post("/test/captcha", async (req, res) => {
  try {
    const { captcha } = req.body;

    if (!captcha) {
      return res.status(400).json({ error: "Captcha is required" });
    }

    // Simulate CAPTCHA verification
    const isValidCaptcha = true; // In production, this would be replaced with actual CAPTCHA validation

    if (isValidCaptcha) {
      res.status(200).json({
        success: true,
        message: "CAPTCHA verification successful",
      });
    } else {
      res.status(400).json({
        error: "CAPTCHA verification failed",
      });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to verify CAPTCHA" });
  }
});

// Test login flow
router.post("/test/login-flow", async (req, res) => {
  try {
    const { mobile, password, captcha } = req.body;

    if (!mobile || !password || !captcha) {
      return res
        .status(400)
        .json({ error: "Mobile, password, and captcha are required" });
    }

    // Simulate login
    const user = {
      _id: "test-user-id",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
      mobile: mobile,
      biometric: {
        setup: true,
        lastLogin: new Date(Date.now() - 7200000), // 2 hours ago
      },
    };

    // Simulate CAPTCHA verification
    const isValidCaptcha = true;
    if (!isValidCaptcha) {
      return res.status(400).json({ error: "Invalid CAPTCHA" });
    }

    // Check if biometric is required
    const now = new Date();
    const lastLogin = new Date(user.biometric.lastLogin);
    const oneHourAgo = new Date(now.getTime() - 3600000);

    if (lastLogin < oneHourAgo) {
      // Generate biometric token
      const biometricToken = crypto.randomBytes(32).toString("hex");

      return res.status(200).json({
        biometricRequired: true,
        biometricToken,
        message: "Please complete biometric verification",
      });
    }

    // Generate JWT token
    const token = "test-jwt-token"; // In production, this would be a real JWT

    res.status(200).json({
      token,
      biometricRequired: false,
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to test login flow" });
  }
});

// Test Everflow API
router.get("/everflow/health", async (req, res) => {
  try {
    console.log("\n🧪 [EVERFLOW TEST] Health check requested");
    
    const healthStatus = await everflowService.healthCheck();
    
    res.status(200).json({
      success: true,
      health: healthStatus,
      config: {
        baseURL: config.EVERFLOW_BASE_URL || "not set",
        apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
        configured: everflowService.isConfigured(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      config: {
        baseURL: config.EVERFLOW_BASE_URL || "not set",
        apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
        configured: everflowService.isConfigured(),
      },
    });
  }
});

// Test Everflow API - Direct call
router.get("/everflow/test", async (req, res) => {
  try {
    console.log("\n🧪 [EVERFLOW TEST] Direct API test requested");
    
    const { limit = 10, status = "active" } = req.query;
    
    if (!everflowService.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: "Everflow API is not configured",
        config: {
          baseURL: config.EVERFLOW_BASE_URL || "not set",
          apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
        },
      });
    }

    console.log("🧪 [EVERFLOW TEST] Calling getPostbacks with params:", { limit, status });
    
    const result = await everflowService.getPostbacks({
      limit: parseInt(limit),
      status: status,
    });

    res.status(200).json({
      success: true,
      result: result,
      config: {
        baseURL: config.EVERFLOW_BASE_URL,
        apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
      },
      requestParams: {
        limit: parseInt(limit),
        status: status,
      },
    });
  } catch (error) {
    console.error("🧪 [EVERFLOW TEST] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      errorDetails: {
        status: error.status,
        data: error.data,
      },
      config: {
        baseURL: config.EVERFLOW_BASE_URL || "not set",
        apiKey: config.EVERFLOW_API_KEY ? "***SET***" : "MISSING",
      },
    });
  }
});

// Test Everflow API - Raw request
router.get("/everflow/raw", async (req, res) => {
  try {
    console.log("\n🧪 [EVERFLOW TEST] Raw API test requested");
    
    const axios = require("axios");
    const baseURL = config.EVERFLOW_BASE_URL || "https://api.eflow.team";
    const apiKey = config.EVERFLOW_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: "EVERFLOW_API_KEY is not set",
      });
    }

    // Try different endpoints and auth methods
    const testResults = [];

    const endpoints = [
      "/v1/affiliate/postbacks",  // Most likely - base URL is api.eflow.team
      "/affiliate/postbacks",     // If base URL already includes /v1
      "/v1/postbacks",            // Alternative structure
      "/postbacks",               // If base URL includes /v1/affiliate
      "/v1/affiliates/offersrunnable",     // Offers endpoint (runnable, with payouts)
      "/affiliates/offersrunnable",        // Offers if base includes /v1
    ];

    const authMethods = [
      { header: "X-Eflow-API-Key", value: apiKey },
      { header: "Authorization", value: `Bearer ${apiKey}` },
      { header: "X-API-Key", value: apiKey },
      { header: "API-Key", value: apiKey },
    ];

    for (const endpoint of endpoints) {
      for (const authMethod of authMethods) {
        try {
          const response = await axios.get(`${baseURL}${endpoint}`, {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              [authMethod.header]: authMethod.value,
            },
            params: {
              limit: 5,
            },
            timeout: 10000,
          });

          testResults.push({
            endpoint,
            authMethod: authMethod.header,
            status: response.status,
            success: true,
            dataKeys: response.data ? Object.keys(response.data) : [],
            dataSample: JSON.stringify(response.data).substring(0, 500),
          });
        } catch (error) {
          testResults.push({
            endpoint,
            authMethod: authMethod.header,
            success: false,
            status: error.response?.status,
            error: error.message,
            errorData: error.response?.data,
          });
        }
      }
    }

    res.status(200).json({
      success: true,
      baseURL,
      apiKey: "***SET***",
      testResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;

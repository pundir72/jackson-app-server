const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const VerisoulSDK = require("../utils/verisoul");

// Initialize Verisoul SDK
const verisoul = new VerisoulSDK(
  process.env.VERISOUL_API_KEY,
  process.env.VERISOUL_BASE_URL,
);

// Test endpoints without authentication
router.get("/test", async (req, res) => {
  try {
    res.json({
      success: true,
      message: "Verisoul.ai integration is working!",
      timestamp: new Date().toISOString(),
      endpoints: {
        session: "/api/fraud-prevention/session/authenticate",
        account: "/api/fraud-prevention/account/:accountId",
        lists: "/api/fraud-prevention/lists",
        phone: "/api/fraud-prevention/phone/verify",
        liveness: "/api/fraud-prevention/liveness/verify-face",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Test endpoint error",
      error: error.message,
    });
  }
});

// Test endpoint for session authentication without auth middleware
router.post(
  "/test/session/authenticate",
  [
    body("accountId").notEmpty().withMessage("Account ID is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("metadata").optional().isObject(),
    body("group").optional().isString(),
    body("sessionId")
      .optional()
      .isString()
      .withMessage("Session ID must be a string"),
    body("session_id")
      .optional()
      .isString()
      .withMessage("Session ID must be a string"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        accountId,
        email,
        metadata = {},
        group,
        sessionId,
        session_id,
      } = req.body;

      // Accept both sessionId (camelCase) and session_id (snake_case from SDK)
      const finalSessionId = sessionId || session_id || null;

      // Provide default group if not specified (REQUIRED by Verisoul)
      const defaultGroup = group || "default";

      const result = await verisoul.authenticateSession(
        accountId,
        email,
        metadata,
        defaultGroup,
        finalSessionId,
      );

      if (result.success) {
        const sessionData = result.data?.session || {};
        const riskSignals = sessionData?.risk_signals || {};
        const decision = result.data?.decision;

        // Log risk signals for monitoring — do NOT block users at session level.
        if (decision === "Fake" || result.data?.account_score > 0.8) {
          console.warn("[FraudPrevention TEST] High-risk session (logged only, not blocked):", {
            accountId,
            decision,
            account_score: result.data?.account_score,
            riskSignals,
          });
        }

        res.json({
          success: true,
          message: "Session authenticated successfully (TEST MODE)",
          data: result.data,
          sessionId: result.sessionId,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to authenticate session",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Session authentication error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// Session Management Routes

// POST /api/fraud-prevention/session/authenticate
// Authenticate a new session
router.post(
  "/session/authenticate",
  [
    auth,
    body("accountId").notEmpty().withMessage("Account ID is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("metadata").optional().isObject(),
    body("group").optional().isString(),
    body("sessionId")
      .optional()
      .isString()
      .withMessage("Session ID must be a string"),
    body("session_id")
      .optional()
      .isString()
      .withMessage("Session ID must be a string"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const {
        accountId,
        email,
        metadata = {},
        group,
        sessionId,
        session_id,
      } = req.body;

      // Accept both sessionId (camelCase) and session_id (snake_case from SDK)
      const finalSessionId = sessionId || session_id || null;

      // Provide default group if not specified (REQUIRED by Verisoul)
      const defaultGroup = group || "regular_users";

      const result = await verisoul.authenticateSession(
        accountId,
        email,
        metadata,
        defaultGroup,
        finalSessionId,
      );

      if (result.success) {
        const sessionData = result.data?.session || {};
        const riskSignals = sessionData?.risk_signals || {};
        const decision = result.data?.decision;

        // Log risk signals for monitoring — do NOT block users at session level.
        // High-risk users are gated at payout/withdrawal time instead.
        if (decision === "Fake" || result.data?.account_score > 0.8) {
          console.warn("[FraudPrevention] High-risk session (logged only, not blocked):", {
            accountId,
            decision,
            account_score: result.data?.account_score,
            riskSignals,
          });
        }

        res.json({
          success: true,
          message: "Session authenticated successfully",
          data: result.data,
          sessionId: result.sessionId,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to authenticate session",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Session authentication error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// GET /api/fraud-prevention/session/:sessionId
// Get session details
router.get("/session/:sessionId", [auth], async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await verisoul.getSession(sessionId);

    if (result.success) {
      res.json({
        success: true,
        message: "Session retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve session",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get session error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// POST /api/fraud-prevention/session/unauthenticate
// Unauthenticate a session
router.post(
  "/session/unauthenticate",
  [auth, body("sessionId").notEmpty().withMessage("Session ID is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { sessionId } = req.body;
      const result = await verisoul.unauthenticateSession(sessionId);

      if (result.success) {
        res.json({
          success: true,
          message: "Session unauthenticated successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to unauthenticate session",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Session unauthentication error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// Account Management Routes

// GET /api/fraud-prevention/account/:accountId
// Get account details
router.get("/account/:accountId", [auth], async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await verisoul.getAccount(accountId);

    if (result.success) {
      res.json({
        success: true,
        message: "Account retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve account",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get account error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// PUT /api/fraud-prevention/account/:accountId
// Update account details
router.put(
  "/account/:accountId",
  [
    auth,
    body("email").isEmail().withMessage("Valid email is required"),
    body("metadata").optional().isObject(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { accountId } = req.params;
      const { email, metadata = {} } = req.body;
      const result = await verisoul.updateAccount(accountId, email, metadata);

      if (result.success) {
        res.json({
          success: true,
          message: "Account updated successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to update account",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Update account error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// DELETE /api/fraud-prevention/account/:accountId
// Delete account
router.delete("/account/:accountId", [auth], async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await verisoul.deleteAccount(accountId);

    if (result.success) {
      res.json({
        success: true,
        message: "Account deleted successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to delete account",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// GET /api/fraud-prevention/account/:accountId/sessions
// Get account sessions
router.get("/account/:accountId/sessions", [auth], async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await verisoul.getAccountSessions(accountId);

    if (result.success) {
      res.json({
        success: true,
        message: "Account sessions retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve account sessions",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get account sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// GET /api/fraud-prevention/account/:accountId/linked-accounts
// Get linked accounts
router.get("/account/:accountId/linked-accounts", [auth], async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await verisoul.getLinkedAccounts(accountId);

    if (result.success) {
      res.json({
        success: true,
        message: "Linked accounts retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve linked accounts",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get linked accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// List Management Routes

// POST /api/fraud-prevention/list/:listName
// Create a new list
router.post(
  "/list/:listName",
  [auth, body("description").notEmpty().withMessage("Description is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { listName } = req.params;
      const { description } = req.body;
      const result = await verisoul.createList(listName, description);

      if (result.success) {
        res.json({
          success: true,
          message: "List created successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to create list",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Create list error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// POST /api/fraud-prevention/list/:listName/account/:accountId
// Add account to list
router.post("/list/:listName/account/:accountId", [auth], async (req, res) => {
  try {
    const { listName, accountId } = req.params;
    const result = await verisoul.addAccountToList(listName, accountId);

    if (result.success) {
      res.json({
        success: true,
        message: "Account added to list successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to add account to list",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Add account to list error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// GET /api/fraud-prevention/lists
// Get all lists
router.get("/lists", [auth], async (req, res) => {
  try {
    const result = await verisoul.getLists();

    if (result.success) {
      res.json({
        success: true,
        message: "Lists retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve lists",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get lists error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// GET /api/fraud-prevention/list/:listName
// Get specific list
router.get("/list/:listName", [auth], async (req, res) => {
  try {
    const { listName } = req.params;
    const result = await verisoul.getList(listName);

    if (result.success) {
      res.json({
        success: true,
        message: "List retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve list",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get list error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// DELETE /api/fraud-prevention/list/:listName
// Delete list
router.delete("/list/:listName", [auth], async (req, res) => {
  try {
    const { listName } = req.params;
    const result = await verisoul.deleteList(listName);

    if (result.success) {
      res.json({
        success: true,
        message: "List deleted successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to delete list",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Delete list error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// DELETE /api/fraud-prevention/list/:listName/account/:accountId
// Remove account from list
router.delete(
  "/list/:listName/account/:accountId",
  [auth],
  async (req, res) => {
    try {
      const { listName, accountId } = req.params;
      const result = await verisoul.removeAccountFromList(listName, accountId);

      if (result.success) {
        res.json({
          success: true,
          message: "Account removed from list successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to remove account from list",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Remove account from list error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// Phone Verification Routes

// POST /api/fraud-prevention/phone/verify
// Verify phone number
router.post(
  "/phone/verify",
  [
    auth,
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { phoneNumber } = req.body;
      const result = await verisoul.verifyPhone(phoneNumber);

      if (result.success) {
        res.json({
          success: true,
          message: "Phone verification initiated successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to verify phone number",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Phone verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// Liveness Verification Routes

// POST /api/fraud-prevention/liveness/verify-face
// Verify face liveness
router.post(
  "/liveness/verify-face",
  [auth, body("sessionId").notEmpty().withMessage("Session ID is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { sessionId } = req.body;
      const result = await verisoul.verifyFace(sessionId);

      if (result.success) {
        res.json({
          success: true,
          message: "Face verification completed successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to verify face",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Face verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// POST /api/fraud-prevention/liveness/verify-identity
// Verify identity
router.post(
  "/liveness/verify-identity",
  [
    auth,
    body("sessionId").notEmpty().withMessage("Session ID is required"),
    body("accountId").notEmpty().withMessage("Account ID is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { sessionId, accountId } = req.body;
      const result = await verisoul.verifyIdentity(sessionId, accountId);

      if (result.success) {
        res.json({
          success: true,
          message: "Identity verification completed successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to verify identity",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("Identity verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// POST /api/fraud-prevention/liveness/enroll
// Enroll user for liveness verification
router.post(
  "/liveness/enroll",
  [
    auth,
    body("sessionId").notEmpty().withMessage("Session ID is required"),
    body("accountId").notEmpty().withMessage("Account ID is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { sessionId, accountId } = req.body;
      const result = await verisoul.enrollUser(sessionId, accountId);

      if (result.success) {
        res.json({
          success: true,
          message: "User enrolled successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to enroll user",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("User enrollment error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

// GET /api/fraud-prevention/liveness/session
// Get liveness session
router.get("/liveness/session", [auth], async (req, res) => {
  try {
    const result = await verisoul.getLivenessSession();

    if (result.success) {
      res.json({
        success: true,
        message: "Liveness session retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve liveness session",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get liveness session error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// GET /api/fraud-prevention/liveness/redirect
// Get liveness redirect URL
router.get("/liveness/redirect", [auth], async (req, res) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: "Project ID is required",
      });
    }

    const result = await verisoul.getLivenessRedirect(projectId);

    if (result.success) {
      res.json({
        success: true,
        message: "Liveness redirect URL retrieved successfully",
        data: result.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to retrieve liveness redirect URL",
        error: result.error,
      });
    }
  } catch (error) {
    console.error("Get liveness redirect error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// POST /api/fraud-prevention/liveness/verify-id
// Verify ID document
router.post(
  "/liveness/verify-id",
  [auth, body("sessionId").notEmpty().withMessage("Session ID is required")],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { sessionId } = req.body;
      const result = await verisoul.verifyId(sessionId);

      if (result.success) {
        res.json({
          success: true,
          message: "ID verification completed successfully",
          data: result.data,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to verify ID",
          error: result.error,
        });
      }
    } catch (error) {
      console.error("ID verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

module.exports = router;

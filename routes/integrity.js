/**
 * Integrity Routes
 *
 * POST /api/integrity/challenge  → issue a single-use nonce for the client to embed in
 *                                  the Play Integrity API request (rate-limited: 10/min/user)
 * POST /api/integrity/verify     → explicit token verification endpoint used by clients that
 *                                  want a session-level integrity check before critical actions
 *                                  (rate-limited: 5/min/user)
 * GET  /api/integrity/status     → lightweight check of current session integrity state
 *
 * Note: route-level integrity middleware (standardIntegrityVerification / strictIntegrityVerification)
 * is applied directly on game / reward routes — NOT here.  These routes are the infrastructure
 * that supports that flow.
 */

const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();

const googlePlayIntegrity = require('../utils/googlePlayIntegrity');
const { issueNonce, consumeNonce } = require('../utils/integrityNonceStore');
const protect = require('../middleware/auth');
const config = require('../config/config');
const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// Rate limiters (per authenticated user, keyed by user id set by protect middleware)
// ---------------------------------------------------------------------------

/**
 * Build a rate limiter keyed on the authenticated user's id.
 * Falls back to IP if user id is unavailable (shouldn't happen on protected routes).
 */
function userRateLimiter({ max, windowMs, message }) {
    return rateLimit({
        windowMs,
        max,
        keyGenerator: (req) => req.user?.id?.toString() || ipKeyGenerator(req),
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn('Integrity rate limit exceeded', {
                userId: req.user?.id,
                endpoint: req.originalUrl,
                ip: req.ip,
            });
            res.status(429).json({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message,
                },
            });
        },
    });
}

const challengeRateLimit = userRateLimiter({
    windowMs: 60 * 1000,       // 1 minute
    max: 10,
    message: 'Too many challenge requests — please wait before retrying',
});

const verifyRateLimit = userRateLimiter({
    windowMs: 60 * 1000,       // 1 minute
    max: 5,
    message: 'Too many verification requests — please wait before retrying',
});

// ---------------------------------------------------------------------------
// POST /api/integrity/challenge
// ---------------------------------------------------------------------------
router.post('/challenge', protect, challengeRateLimit, async (req, res) => {
    try {
        const userId = req.user.id.toString();

        // Issue a cryptographically secure, Redis-backed single-use nonce.
        // crypto.randomBytes(32) is used internally — Math.random() is not involved.
        const nonce = await issueNonce(userId);

        res.json({
            success: true,
            data: {
                nonce,
                packageName: config.ANDROID_PACKAGE_NAME,
                timestamp: Date.now(),
            },
        });

    } catch (err) {
        logger.error('Challenge generation error', { userId: req.user?.id, message: err.message });

        // Distinguish Redis-down from other errors
        const isRedisDown = err.message.includes('unavailable') || err.message.includes('Redis');
        res.status(isRedisDown ? 503 : 500).json({
            success: false,
            error: {
                code: isRedisDown ? 'NONCE_STORE_UNAVAILABLE' : 'CHALLENGE_GENERATION_FAILED',
                message: 'Failed to generate integrity challenge — please try again',
            },
        });
    }
});

// ---------------------------------------------------------------------------
// POST /api/integrity/verify
// Explicit standalone verification (e.g., session-level pre-auth for critical flows).
// ---------------------------------------------------------------------------
router.post('/verify', protect, verifyRateLimit, async (req, res) => {
    try {
        const { integrityToken } = req.body;

        if (!integrityToken) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_INTEGRITY_TOKEN',
                    message: 'integrityToken is required',
                },
            });
        }

        const packageName = config.ANDROID_PACKAGE_NAME;
        const verificationResult = await googlePlayIntegrity.verifyIntegrityToken(
            integrityToken,
            packageName
        );

        if (!verificationResult.isValid) {
            logger.warn('Explicit integrity verification failed', {
                userId: req.user.id,
                reason: verificationResult.reason,
            });
            return res.status(403).json({
                success: false,
                error: {
                    code: 'INTEGRITY_VERIFICATION_FAILED',
                    message: 'Device integrity check failed',
                    reason: verificationResult.reason,
                },
            });
        }

        // Validate and consume the nonce embedded in the token
        const userId = req.user.id.toString();
        const tokenNonce = verificationResult.requestDetails?.nonce;

        if (!tokenNonce) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'INTEGRITY_NONCE_MISSING',
                    message: 'Token is missing a nonce',
                },
            });
        }

        const nonceValid = await consumeNonce(userId, tokenNonce);
        if (!nonceValid) {
            logger.warn('Explicit verify: nonce invalid or replayed', { userId });
            return res.status(403).json({
                success: false,
                error: {
                    code: 'INTEGRITY_NONCE_INVALID',
                    message: 'Nonce is invalid or has already been used',
                },
            });
        }

        logger.info('Explicit integrity verification passed', { userId: req.user.id });

        return res.json({
            success: true,
            data: {
                verified: true,
                reason: verificationResult.reason,
                timestamp: new Date().toISOString(),
            },
        });

    } catch (err) {
        logger.error('Integrity verification endpoint error', {
            userId: req.user?.id,
            message: err.message,
        });
        res.status(503).json({
            success: false,
            error: {
                code: 'VERIFICATION_SERVICE_ERROR',
                message: 'Unable to verify integrity — please try again',
            },
        });
    }
});

// ---------------------------------------------------------------------------
// GET /api/integrity/status
// Lightweight status check — reads the integrity state attached by middleware.
// ---------------------------------------------------------------------------
router.get('/status', protect, (req, res) => {
    const state = req.integrityVerification;

    // No token was verified for this request — that's fine for a status check
    if (!state || state.skipped) {
        return res.json({
            success: true,
            data: {
                integrityVerified: false,
                reason: state?.skipped ? 'verification skipped in this environment' : 'no verification performed for this request',
            },
        });
    }

    res.json({
        success: true,
        data: {
            integrityVerified: state.verified === true,
            reason: state.result?.reason || null,
        },
    });
});

module.exports = router;

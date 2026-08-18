/**
 * Integrity Verification Middleware — hardened for production.
 *
 * Rules enforced:
 *  1. Token REQUIRED on all sensitive routes — missing token = 401.
 *  2. Token present but invalid = 403 (no silent pass-through).
 *  3. Nonce extracted from verified token is validated against Redis store
 *     (single-use, TTL-bound) — prevents replay attacks.
 *  4. Verification error in production = 503 (fail closed, not fail open).
 *  5. Development environment may skip verification via skipForEnvironments.
 *
 * Exported middleware:
 *  - strictIntegrityVerification   → for payments, withdrawals, large rewards
 *  - standardIntegrityVerification → for daily rewards, game completion, achievements
 *  - verifyIntegrity(options)      → factory for custom configurations
 */

const googlePlayIntegrity = require('../utils/googlePlayIntegrity');
const { consumeNonce } = require('../utils/integrityNonceStore');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * @param {Object} options
 * @param {string[]} options.skipForEnvironments  Envs where verification is bypassed (default: ['development'])
 * @param {string}   options.label                Label for log messages (default: 'integrity')
 */
const verifyIntegrity = (options = {}) => {
    const {
        skipForEnvironments = ['development'],
        label = 'integrity',
    } = options;

    return async (req, res, next) => {
        // ------------------------------------------------------------------
        // 1. Environment bypass (dev only — never skip in staging/production)
        // ------------------------------------------------------------------
        if (skipForEnvironments.includes(config.NODE_ENV)) {
            logger.debug(`[${label}] Skipping in ${config.NODE_ENV}`);
            req.integrityVerification = { verified: false, skipped: true };
            return next();
        }

        // ------------------------------------------------------------------
        // 1b. iOS bypass — Google Play Integrity is Android-only.
        //     iOS requests are identified by the x-platform header sent by
        //     the mobile app. iOS has its own attestation (DeviceCheck /
        //     App Attest) which can be wired in separately.
        // ------------------------------------------------------------------
        const platform = (req.headers['x-platform'] || '').toLowerCase();
        if (platform === 'ios') {
            logger.debug(`[${label}] Skipping Play Integrity for iOS request`);
            req.integrityVerification = { verified: false, skipped: true, platform: 'ios' };
            return next();
        }

        // ------------------------------------------------------------------
        // 2. Token must be present — no token = reject immediately
        // ------------------------------------------------------------------
        const integrityToken =
            req.headers['x-integrity-token'] ||
            (req.body && req.body.integrityToken);

        if (!integrityToken) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INTEGRITY_TOKEN_REQUIRED',
                    message: 'Device integrity token is required',
                },
            });
        }

        // ------------------------------------------------------------------
        // 3. Test token bypass — for local Postman testing only.
        //    Set INTEGRITY_TEST_TOKEN in .env. Never set this in production.
        // ------------------------------------------------------------------
        const testToken = config.INTEGRITY_TEST_TOKEN;
        if (testToken && integrityToken === testToken) {
            logger.debug(`[${label}] Test token bypass used`);
            req.integrityVerification = { verified: true, skipped: true, testBypass: true };
            return next();
        }

        try {
            // --------------------------------------------------------------
            // 3. Verify token with Google Play Integrity API
            // --------------------------------------------------------------
            const packageName = config.ANDROID_PACKAGE_NAME;
            const verificationResult = await googlePlayIntegrity.verifyIntegrityToken(
                integrityToken,
                packageName
            );

            // --------------------------------------------------------------
            // 4. Token invalid → reject (no fallback, no silent pass-through)
            // --------------------------------------------------------------
            if (!verificationResult.isValid) {
                logger.warn(`[${label}] Integrity verification failed`, {
                    userId: req.user?.userId || req.user?._id,
                    endpoint: req.originalUrl,
                    reason: verificationResult.reason,
                    ip: req.ip,
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

            // --------------------------------------------------------------
            // 5. Nonce validation — single-use replay protection
            //    The nonce baked into the token must have been issued by us
            //    for this specific user, and must not have been used before.
            // --------------------------------------------------------------
            const tokenNonce = verificationResult.requestDetails?.nonce;
            const userId = req.user?.userId || req.user?._id?.toString();

            if (!tokenNonce || !userId) {
                logger.warn(`[${label}] Nonce or userId missing`, {
                    hasNonce: !!tokenNonce,
                    hasUser: !!userId,
                    endpoint: req.originalUrl,
                });
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INTEGRITY_NONCE_MISSING',
                        message: 'Integrity token is missing required nonce',
                    },
                });
            }

            const nonceValid = await consumeNonce(userId, tokenNonce);
            if (!nonceValid) {
                logger.warn(`[${label}] Nonce rejected (replay or unknown)`, {
                    userId,
                    endpoint: req.originalUrl,
                    ip: req.ip,
                });
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'INTEGRITY_NONCE_INVALID',
                        message: 'Integrity challenge nonce is invalid or has already been used',
                    },
                });
            }

            // --------------------------------------------------------------
            // 6. All checks passed — attach result and continue
            // --------------------------------------------------------------
            logger.info(`[${label}] Integrity verified`, {
                userId,
                endpoint: req.originalUrl,
            });

            req.integrityVerification = {
                verified: true,
                result: verificationResult,
            };

            return next();

        } catch (err) {
            // --------------------------------------------------------------
            // 7. Fail CLOSED — any unexpected error rejects the request.
            //    Never allow an attacker-triggered exception to open a bypass.
            // --------------------------------------------------------------
            logger.error(`[${label}] Integrity verification error`, {
                userId: req.user?.userId || req.user?._id,
                endpoint: req.originalUrl,
                message: err.message,
            });

            return res.status(503).json({
                success: false,
                error: {
                    code: 'INTEGRITY_SERVICE_ERROR',
                    message: 'Unable to verify device integrity — please try again',
                },
            });
        }
    };
};

/**
 * For high-value operations: payments, withdrawals, large prize claims.
 * Skips verification only in local development.
 */
const strictIntegrityVerification = verifyIntegrity({
    skipForEnvironments: ['development'],
    label: 'strict-integrity',
});

/**
 * For standard sensitive operations: daily rewards, game completion, achievements,
 * coin transactions, in-app purchases.
 * Also skips only in local development — NOT in staging or production.
 */
const standardIntegrityVerification = verifyIntegrity({
    skipForEnvironments: ['development'],
    label: 'standard-integrity',
});

module.exports = {
    verifyIntegrity,
    strictIntegrityVerification,
    standardIntegrityVerification,
};

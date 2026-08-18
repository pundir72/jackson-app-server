/**
 * Google Play Integrity Service — hardened for production gaming backend.
 *
 * Security guarantees enforced here:
 *  - Only PLAY_RECOGNIZED apps pass (no UNRECOGNIZED_VERSION)
 *  - Only devices with MEETS_DEVICE_INTEGRITY pass (no MEETS_BASIC_INTEGRITY)
 *  - Package name in token must match config.ANDROID_PACKAGE_NAME
 *  - Certificate digest must match config.EXPECTED_CERT_DIGESTS (allowlist)
 *  - App licensing verdict must be LICENSED (no null pass-through)
 *  - Token timestamp must be within 5 minutes (freshness)
 *  - Nonce validation is done at middleware layer (see integrityVerification.js)
 */

const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const config = require('../config/config');
const logger = require('./logger');

// ---------------------------------------------------------------------------
// Expected certificate digests — SHA-256 of your app's signing certificate.
// Add multiple entries if you have a debug + release key.
// Config value: comma-separated hex strings, e.g. "abc123,def456"
// ---------------------------------------------------------------------------
function getExpectedCertDigests() {
    if (!config.EXPECTED_CERT_DIGESTS) {
        logger.warn('EXPECTED_CERT_DIGESTS not configured — certificate validation disabled');
        return null; // null = skip check (acceptable during initial setup, warn loudly)
    }
    return config.EXPECTED_CERT_DIGESTS
        .split(',')
        .map(d => d.trim().toLowerCase())
        .filter(Boolean);
}

class GooglePlayIntegrityService {
    constructor() {
        this.auth = null;
        this.initialized = false;
    }

    async initialize() {
        if (!config.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT) {
            throw new Error('GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT is not configured');
        }

        const serviceAccount = JSON.parse(config.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT);

        this.auth = new GoogleAuth({
            credentials: serviceAccount,
            scopes: ['https://www.googleapis.com/auth/playintegrity'],
        });

        this.initialized = true;
        logger.info('Google Play Integrity service initialised');
    }

    /**
     * Call Google's decodeIntegrityToken endpoint and return a parsed,
     * validated result object.
     *
     * @param {string} integrityToken  — token from Android client
     * @param {string} packageName     — must equal config.ANDROID_PACKAGE_NAME
     * @returns {Promise<Object>}      — see parseVerificationResult()
     */
    async verifyIntegrityToken(integrityToken, packageName) {
        if (!this.initialized) {
            await this.initialize();
        }

        const client = await this.auth.getClient();
        const accessToken = await client.getAccessToken();

        let response;
        try {
            response = await axios.post(
                `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
                { integrityToken },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken.token}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000,
                }
            );
        } catch (err) {
            // Surface HTTP errors clearly
            const status = err.response?.status;
            const msg = err.response?.data?.error?.message || err.message;
            throw new Error(`Play Integrity API error (${status ?? 'network'}): ${msg}`);
        }

        return this.parseVerificationResult(response.data);
    }

    /**
     * Parse raw API response into a structured result.
     * All security validations happen here — a single false anywhere fails the result.
     *
     * @param {Object} raw  — raw Google API response
     * @returns {Object}    — { isValid, reason, appIntegrity, deviceIntegrity, accountDetails, requestDetails }
     */
    parseVerificationResult(raw) {
        const payload = raw?.tokenPayloadExternal;

        if (!payload) {
            return this._fail('Missing token payload');
        }

        const appIntegrity    = payload.appIntegrity    || {};
        const deviceIntegrity = payload.deviceIntegrity || {};
        const accountDetails  = payload.accountDetails  || {};
        const requestDetails  = payload.requestDetails  || {};

        // ---------------------------------------------------------------
        // 1. App recognition — ONLY PLAY_RECOGNIZED is acceptable.
        //    UNRECOGNIZED_VERSION = sideloaded / tampered / version not yet
        //    indexed by Play — must never pass in production.
        // ---------------------------------------------------------------
        const appVerdict = appIntegrity.appRecognitionVerdict;
        if (appVerdict !== 'PLAY_RECOGNIZED') {
            return this._fail(`App not recognized by Play Store (verdict: ${appVerdict})`);
        }

        // ---------------------------------------------------------------
        // 2. Package name — the name baked into the token must match ours.
        //    Prevents tokens issued for other packages being accepted.
        // ---------------------------------------------------------------
        const tokenPackage = appIntegrity.packageName || requestDetails.requestPackageName;
        if (tokenPackage !== config.ANDROID_PACKAGE_NAME) {
            return this._fail(
                `Package name mismatch: expected ${config.ANDROID_PACKAGE_NAME}, got ${tokenPackage}`
            );
        }

        // ---------------------------------------------------------------
        // 3. Certificate digest — must match our signing certificate.
        //    Repackaged APKs carry a different cert and will be rejected.
        // ---------------------------------------------------------------
        const expectedDigests = getExpectedCertDigests();
        if (expectedDigests !== null) {
            const tokenCerts = (appIntegrity.certificateSha256Digest || [])
                .map(c => c.toLowerCase());
            const certMatch = tokenCerts.some(c => expectedDigests.includes(c));
            if (!certMatch) {
                return this._fail('Certificate digest mismatch — possible repackaged APK');
            }
        }

        // ---------------------------------------------------------------
        // 4. Device integrity — require MEETS_DEVICE_INTEGRITY.
        //    MEETS_BASIC_INTEGRITY only verifies the Android platform API
        //    and passes emulators / many rooted devices.
        // ---------------------------------------------------------------
        const deviceVerdicts = deviceIntegrity.deviceRecognitionVerdict || [];
        const isDeviceTrusted = deviceVerdicts.includes('MEETS_DEVICE_INTEGRITY');
        if (!isDeviceTrusted) {
            return this._fail(
                `Device integrity insufficient (verdicts: ${deviceVerdicts.join(', ') || 'none'})`
            );
        }

        // ---------------------------------------------------------------
        // 5. App licensing — must be LICENSED.
        //    Do NOT allow null/missing to pass — missing means Play couldn't
        //    verify the license, which is suspicious on a production device.
        //    Note: only enforce this if IAP / licensing is in use.
        // ---------------------------------------------------------------
        const licensingVerdict = accountDetails.appLicensingVerdict;
        if (licensingVerdict !== 'LICENSED') {
            return this._fail(
                `App licensing check failed (verdict: ${licensingVerdict ?? 'absent'})`
            );
        }

        // ---------------------------------------------------------------
        // 6. Token freshness — must be within 5 minutes.
        //    The nonce already provides request-binding, but a stale token
        //    could indicate a re-use attempt with a captured token.
        // ---------------------------------------------------------------
        const tokenTs = parseInt(requestDetails.timestampMillis, 10);
        if (isNaN(tokenTs)) {
            return this._fail('Token is missing a timestamp');
        }
        const ageMs = Date.now() - tokenTs;
        if (ageMs < 0 || ageMs > 5 * 60 * 1000) {
            return this._fail(`Token is stale (age: ${Math.round(ageMs / 1000)}s)`);
        }

        // All checks passed — log minimal, non-sensitive info
        logger.info('Play Integrity verification passed', {
            packageName: tokenPackage,
            appVerdict,
            deviceVerdicts,
        });

        return {
            isValid: true,
            reason: 'All integrity checks passed',
            appIntegrity: {
                verdict: appVerdict,
                packageName: tokenPackage,
                versionCode: appIntegrity.versionCode,
            },
            deviceIntegrity: {
                verdicts: deviceVerdicts,
            },
            accountDetails: {
                licensingVerdict,
            },
            requestDetails: {
                requestPackageName: requestDetails.requestPackageName,
                timestampMillis: requestDetails.timestampMillis,
                nonce: requestDetails.nonce,
            },
        };
    }

    // Internal helper — build a failed result without throwing
    _fail(reason) {
        logger.warn('Play Integrity verification failed', { reason });
        return { isValid: false, reason, appIntegrity: null, deviceIntegrity: null, accountDetails: null, requestDetails: null };
    }
}

module.exports = new GooglePlayIntegrityService();

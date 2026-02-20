const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const config = require('../config/config');
const logger = require('./logger');

class GooglePlayIntegrityService {
    constructor() {
        this.auth = null;
        this.initialized = false;
    }

    /**
     * Initialize Google Auth with service account
     */
    async initialize() {
        try {
            if (!config.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT) {
                throw new Error('Google Play Integrity service account not configured');
            }

            // Parse service account JSON
            const serviceAccount = JSON.parse(config.GOOGLE_PLAY_INTEGRITY_SERVICE_ACCOUNT);

            this.auth = new GoogleAuth({
                credentials: serviceAccount,
                scopes: ['https://www.googleapis.com/auth/playintegrity']
            });

            this.initialized = true;
            logger.info('Google Play Integrity service initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize Google Play Integrity service:', error);
            throw error;
        }
    }

    /**
     * Verify integrity token from Android client
     * @param {string} integrityToken - Token from Play Integrity API
     * @param {string} packageName - Your app's package name
     * @returns {Object} Verification result
     */
    async verifyIntegrityToken(integrityToken, packageName) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Get access token
            const client = await this.auth.getClient();
            const accessToken = await client.getAccessToken();

            // Verify the integrity token
            const response = await axios.post(
                `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
                {
                    integrityToken: integrityToken
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken.token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const result = response.data;

            // Log the verification result
            logger.info('Play Integrity verification result:', {
                packageName,
                verdict: result.tokenPayloadExternal?.requestDetails?.requestPackageName,
                appIntegrity: result.tokenPayloadExternal?.appIntegrity,
                deviceIntegrity: result.tokenPayloadExternal?.deviceIntegrity,
                accountDetails: result.tokenPayloadExternal?.accountDetails
            });

            return this.parseVerificationResult(result);

        } catch (error) {
            logger.error('Play Integrity verification failed:', error);
            throw new Error(`Integrity verification failed: ${error.message}`);
        }
    }

    /**
     * Parse and validate the verification result
     * @param {Object} result - Raw API response
     * @returns {Object} Parsed result with validation status
     */
    parseVerificationResult(result) {
        const payload = result.tokenPayloadExternal;

        if (!payload) {
            return {
                isValid: false,
                reason: 'Invalid token payload',
                details: null
            };
        }

        const appIntegrity = payload.appIntegrity || {};
        const deviceIntegrity = payload.deviceIntegrity || {};
        const accountDetails = payload.accountDetails || {};
        const requestDetails = payload.requestDetails || {};

        // Check app integrity
        const appIntegrityVerdict = appIntegrity.appRecognitionVerdict;
        const isAppRecognized = appIntegrityVerdict === 'PLAY_RECOGNIZED' ||
            appIntegrityVerdict === 'UNRECOGNIZED_VERSION';

        // Check device integrity
        const deviceIntegrityVerdict = deviceIntegrity.deviceRecognitionVerdict || [];
        const isDeviceTrusted = deviceIntegrityVerdict.includes('MEETS_DEVICE_INTEGRITY') ||
            deviceIntegrityVerdict.includes('MEETS_BASIC_INTEGRITY');

        // Check for rooted/compromised device
        const isDeviceCompromised = deviceIntegrityVerdict.includes('MEETS_STRONG_INTEGRITY') === false;

        // Overall validation
        const isValid = isAppRecognized && isDeviceTrusted && !isDeviceCompromised;

        return {
            isValid,
            appIntegrity: {
                verdict: appIntegrityVerdict,
                packageName: appIntegrity.packageName,
                certificateSha256Digest: appIntegrity.certificateSha256Digest,
                versionCode: appIntegrity.versionCode
            },
            deviceIntegrity: {
                verdict: deviceIntegrityVerdict,
                isCompromised: isDeviceCompromised
            },
            accountDetails: {
                appLicensingVerdict: accountDetails.appLicensingVerdict
            },
            requestDetails: {
                requestPackageName: requestDetails.requestPackageName,
                timestampMillis: requestDetails.timestampMillis,
                nonce: requestDetails.nonce
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Validate specific integrity requirements for rewards app
     * @param {Object} verificationResult - Result from verifyIntegrityToken
     * @returns {Object} Validation result with specific checks
     */
    validateForRewardsApp(verificationResult) {
        const checks = {
            appRecognized: false,
            deviceTrusted: false,
            notRooted: false,
            validLicense: false,
            recentRequest: false
        };

        if (!verificationResult.isValid) {
            return {
                passed: false,
                checks,
                reason: 'Basic integrity verification failed'
            };
        }

        // Check app recognition
        checks.appRecognized = ['PLAY_RECOGNIZED', 'UNRECOGNIZED_VERSION']
            .includes(verificationResult.appIntegrity.verdict);

        // Check device integrity
        checks.deviceTrusted = verificationResult.deviceIntegrity.verdict
            .some(v => ['MEETS_DEVICE_INTEGRITY', 'MEETS_BASIC_INTEGRITY'].includes(v));

        // Check if device is not rooted/compromised
        checks.notRooted = !verificationResult.deviceIntegrity.isCompromised;

        // Check app licensing (if available)
        checks.validLicense = !verificationResult.accountDetails.appLicensingVerdict ||
            verificationResult.accountDetails.appLicensingVerdict === 'LICENSED';

        // Check request recency (within last 5 minutes)
        const requestTime = parseInt(verificationResult.requestDetails.timestampMillis);
        const currentTime = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        checks.recentRequest = (currentTime - requestTime) < fiveMinutes;

        const allChecksPassed = Object.values(checks).every(check => check === true);

        return {
            passed: allChecksPassed,
            checks,
            reason: allChecksPassed ? 'All integrity checks passed' : 'One or more integrity checks failed'
        };
    }
}

module.exports = new GooglePlayIntegrityService();
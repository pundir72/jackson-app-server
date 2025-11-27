/**
 * Adjust S2S Service
 * Handles server-to-server API calls to Adjust
 * @module services/adjust.service
 */

const axios = require('axios');
const { URLSearchParams } = require('url');

class AdjustService {
    constructor() {
        // Adjust S2S API endpoints
        this.baseUrl = 'https://s2s.adjust.com';
        this.eventEndpoint = `${this.baseUrl}/event`;
        this.adRevenueEndpoint = `${this.baseUrl}/ad_revenue`;
        this.sessionEndpoint = `${this.baseUrl}/session`;
        
        // These should be set via environment variables
        this.appToken = process.env.ADJUST_APP_TOKEN || '';
        this.apiToken = process.env.ADJUST_API_TOKEN || '';
        this.s2sToken = process.env.ADJUST_S2S_TOKEN || '';
        
        // Event token mapping - map event types to Adjust event tokens
        // Format: ADJUST_EVENT_TOKEN_game_complete=abc123,ADJUST_EVENT_TOKEN_purchase=xyz789
        this.eventTokenMap = this.loadEventTokenMap();
    }

    /**
     * Load event token mapping from environment variables
     * Format: ADJUST_EVENT_TOKEN_<event_type>=<token>
     * Example: ADJUST_EVENT_TOKEN_game_complete=abc123
     */
    loadEventTokenMap() {
        const map = {};
        const prefix = 'ADJUST_EVENT_TOKEN_';
        
        Object.keys(process.env).forEach(key => {
            if (key.startsWith(prefix)) {
                const eventType = key.replace(prefix, '').toLowerCase();
                map[eventType] = process.env[key];
            }
        });
        
        // Also support direct JSON config
        if (process.env.ADJUST_EVENT_TOKENS) {
            try {
                const tokens = JSON.parse(process.env.ADJUST_EVENT_TOKENS);
                Object.assign(map, tokens);
            } catch (e) {
                console.warn('Failed to parse ADJUST_EVENT_TOKENS JSON:', e.message);
            }
        }
        
        return map;
    }

    /**
     * Get event token for an event type
     * @param {string} eventType - Event type (e.g., 'game_complete', 'purchase')
     * @returns {string|null} - Event token or null if not found
     */
    getEventToken(eventType) {
        if (!eventType) return null;
        return this.eventTokenMap[eventType.toLowerCase()] || null;
    }

    /**
     * Build authentication header
     */
    getAuthHeader() {
        if (this.s2sToken) {
            return `Bearer ${this.s2sToken}`;
        }
        if (this.apiToken) {
            return `Bearer ${this.apiToken}`;
        }
        return null;
    }

    /**
     * Send event to Adjust
     * @param {Object} eventData - Event data
     * @param {string} eventData.eventType - Event type (e.g., 'game_complete', 'purchase') - preferred
     * @param {string} eventData.eventToken - Adjust event token (optional, if eventType not provided)
     * @param {string} eventData.idfa - iOS IDFA (required for iOS)
     * @param {string} eventData.gpsAdid - Android GPS ADID (required for Android)
     * @param {string} eventData.idfv - iOS IDFV (backup)
     * @param {string} eventData.androidId - Android ID (backup)
     * @param {number} eventData.revenue - Revenue amount (optional)
     * @param {string} eventData.currency - Currency code (optional, default: USD)
     * @param {Object} eventData.callbackParams - Callback parameters (optional)
     * @param {Object} eventData.partnerParams - Partner parameters (optional)
     * @param {string} eventData.environment - Environment: sandbox or production (default: production)
     * @returns {Promise<Object>} Response from Adjust
     */
    async trackEvent(eventData) {
        try {
            const {
                eventType,
                eventToken,
                idfa,
                gpsAdid,
                idfv,
                androidId,
                fireAdid,
                windowsAdid,
                amazonAdid,
                revenue,
                currency = 'USD',
                callbackParams = {},
                partnerParams = {},
                environment = 'production',
                createdAt,
                osName,  // Allow explicit OS name
                appToken = this.appToken
            } = eventData;

            // Get event token from eventType or use provided eventToken
            let finalEventToken = eventToken;
            if (eventType && !finalEventToken) {
                finalEventToken = this.getEventToken(eventType);
                if (!finalEventToken) {
                    // If eventType provided but not configured, allow fallback to direct eventToken
                    // This allows testing without configuration
                    console.warn(`Event token not found for event type: ${eventType}. Using eventType as eventToken. Configure ADJUST_EVENT_TOKEN_${eventType} in environment variables for production.`);
                    // For now, allow eventType to be used directly as token (for testing)
                    finalEventToken = eventType;
                }
            }

            // Validate required fields
            if (!finalEventToken) {
                throw new Error('Either eventType or eventToken is required');
            }

            if (!appToken) {
                throw new Error('appToken is required');
            }

            // At least one device identifier is required
            if (!idfa && !gpsAdid && !idfv && !androidId && !fireAdid && !windowsAdid && !amazonAdid) {
                throw new Error('At least one device identifier is required (idfa, gpsAdid, idfv, androidId, etc.)');
            }

            // Determine OS name from device identifiers or use provided value
            let detectedOsName = osName;
            if (!detectedOsName) {
                if (idfa || idfv) {
                    detectedOsName = 'ios';
                } else if (gpsAdid || androidId) {
                    detectedOsName = 'android';
                } else if (fireAdid || amazonAdid) {
                    detectedOsName = 'amazon';
                } else if (windowsAdid) {
                    detectedOsName = 'windows';
                } else {
                    detectedOsName = 'unknown';
                }
            }

            // Build request payload
            // Adjust S2S API REQUIRES: s2s=1, app_token, os_name, and at least one device identifier
            const payload = {
                s2s: '1',  // REQUIRED: Indicates this is an S2S request
                app_token: appToken,
                event_token: finalEventToken,
                os_name: detectedOsName,  // REQUIRED: Operating system name
                environment: environment
            };

            // Add device identifiers
            if (idfa) payload.idfa = idfa;
            if (gpsAdid) payload.gps_adid = gpsAdid;
            if (idfv) payload.idfv = idfv;
            if (androidId) payload.android_id = androidId;
            if (fireAdid) payload.fire_adid = fireAdid;
            if (windowsAdid) payload.windows_adid = windowsAdid;
            if (amazonAdid) payload.amazon_adid = amazonAdid;

            // Add revenue if provided
            if (revenue !== undefined && revenue !== null) {
                payload.revenue = revenue;
                payload.currency = currency;
            }

            // Add timestamp if provided
            if (createdAt) {
                payload.created_at = new Date(createdAt).toISOString();
            }

            // Add callback parameters
            if (Object.keys(callbackParams).length > 0) {
                Object.keys(callbackParams).forEach(key => {
                    payload[`callback_params.${key}`] = callbackParams[key];
                });
            }

            // Add partner parameters
            if (Object.keys(partnerParams).length > 0) {
                Object.keys(partnerParams).forEach(key => {
                    payload[`partner_params.${key}`] = partnerParams[key];
                });
            }

            // Make request to Adjust
            // Adjust S2S API expects form-encoded data
            const formData = new URLSearchParams();
            
            Object.keys(payload).forEach(key => {
                if (payload[key] !== undefined && payload[key] !== null) {
                    formData.append(key, payload[key].toString());
                }
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const authHeader = this.getAuthHeader();
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            // Debug logging
            console.log('Adjust S2S Request:', {
                url: this.eventEndpoint,
                payload: Object.fromEntries(formData),
                hasAuth: !!authHeader
            });

            const response = await axios.post(this.eventEndpoint, formData.toString(), {
                headers: headers
            });

            // Debug logging
            console.log('Adjust S2S Response:', {
                status: response.status,
                data: response.data
            });

            // Adjust returns 200 even for errors - check response body
            // Adjust can return errors in different formats
            const responseData = response.data;
            let errorMessage = null;
            
            // Check for error in various formats
            if (typeof responseData === 'string') {
                // Sometimes Adjust returns plain text error
                if (responseData.toLowerCase().includes('error') || 
                    responseData.toLowerCase().includes('invalid') ||
                    responseData.toLowerCase().includes('s2s is not enabled')) {
                    errorMessage = responseData;
                }
            } else if (responseData && typeof responseData === 'object') {
                // Check for error field
                if (responseData.error) {
                    errorMessage = typeof responseData.error === 'string' 
                        ? responseData.error 
                        : JSON.stringify(responseData.error);
                }
                // Check for message field
                if (!errorMessage && responseData.message) {
                    errorMessage = responseData.message;
                }
            }
            
            if (errorMessage) {
                console.error('Adjust API returned error:', errorMessage);
                
                // Provide helpful error messages
                let helpfulMessage = 'Failed to track event';
                if (errorMessage.includes('s2s is not enabled')) {
                    helpfulMessage = 'S2S API is not enabled for this app in Adjust dashboard. Please enable S2S in Adjust Settings → App Settings → S2S API.';
                } else if (errorMessage.includes('Invalid event token')) {
                    helpfulMessage = 'Invalid event token. Please verify the event token exists in Adjust dashboard and matches your app token.';
                } else if (errorMessage.includes('invalid source')) {
                    helpfulMessage = 'Invalid ad revenue source. Valid sources: admob, applovin, applovin_exchange, chartboost, facebook, fyber, google, ironsource, line, maio, mintegral, mopub, nend, startapp, tiktok, unity, vungle, yandex.';
                }
                
                return {
                    success: false,
                    error: errorMessage,
                    message: helpfulMessage,
                    data: responseData
                };
            }

            return {
                success: true,
                data: response.data,
                message: 'Event tracked successfully'
            };

        } catch (error) {
            console.error('Adjust trackEvent error:', error.response?.data || error.message);
            
            // Check if error response has error message in body
            if (error.response && error.response.data && error.response.data.error) {
                return {
                    success: false,
                    error: error.response.data.error,
                    message: 'Failed to track event',
                    data: error.response.data
                };
            }
            
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to track event'
            };
        }
    }

    /**
     * Send ad revenue to Adjust
     * @param {Object} revenueData - Ad revenue data
     * @param {string} revenueData.source - Revenue source (e.g., 'admob', 'unity', 'applovin')
     * @param {string} revenueData.publisher - Publisher name
     * @param {string} revenueData.mediationNetwork - Mediation network
     * @param {string} revenueData.adUnit - Ad unit identifier
     * @param {string} revenueData.adType - Ad type (banner, interstitial, rewarded, etc.)
     * @param {number} revenueData.revenue - Revenue amount
     * @param {string} revenueData.currency - Currency code (default: USD)
     * @param {string} revenueData.idfa - iOS IDFA
     * @param {string} revenueData.gpsAdid - Android GPS ADID
     * @param {Object} revenueData.callbackParams - Callback parameters
     * @returns {Promise<Object>} Response from Adjust
     */
    async trackAdRevenue(revenueData) {
        try {
            const {
                source,
                publisher,
                mediationNetwork,
                adUnit,
                adType,
                revenue,
                currency = 'USD',
                idfa,
                gpsAdid,
                idfv,
                androidId,
                callbackParams = {},
                environment = 'production',
                createdAt,
                appToken = this.appToken
            } = revenueData;

            // Validate required fields
            if (!source) {
                throw new Error('source is required');
            }

            if (!revenue) {
                throw new Error('revenue is required');
            }

            if (!appToken) {
                throw new Error('appToken is required');
            }

            // At least one device identifier is required
            if (!idfa && !gpsAdid && !idfv && !androidId) {
                throw new Error('At least one device identifier is required');
            }

            // Determine OS name from device identifiers
            let detectedOsName = 'unknown';
            if (idfa || idfv) {
                detectedOsName = 'ios';
            } else if (gpsAdid || androidId) {
                detectedOsName = 'android';
            }

            // Build request payload
            // Adjust S2S API REQUIRES: s2s=1, app_token, os_name, and at least one device identifier
            const payload = {
                s2s: '1',  // REQUIRED: Indicates this is an S2S request
                app_token: appToken,
                os_name: detectedOsName,  // REQUIRED: Operating system name
                source: source,
                revenue: revenue,
                currency: currency,
                environment: environment
            };

            // Add optional fields
            if (publisher) payload.publisher = publisher;
            if (mediationNetwork) payload.mediation_network = mediationNetwork;
            if (adUnit) payload.ad_unit = adUnit;
            if (adType) payload.ad_type = adType;

            // Add device identifiers
            if (idfa) payload.idfa = idfa;
            if (gpsAdid) payload.gps_adid = gpsAdid;
            if (idfv) payload.idfv = idfv;
            if (androidId) payload.android_id = androidId;

            // Add timestamp if provided
            if (createdAt) {
                payload.created_at = new Date(createdAt).toISOString();
            }

            // Add callback parameters
            if (Object.keys(callbackParams).length > 0) {
                Object.keys(callbackParams).forEach(key => {
                    payload[`callback_params.${key}`] = callbackParams[key];
                });
            }

            // Make request to Adjust
            // Adjust S2S API expects form-encoded data
            const formData = new URLSearchParams();
            
            Object.keys(payload).forEach(key => {
                if (payload[key] !== undefined && payload[key] !== null) {
                    formData.append(key, payload[key].toString());
                }
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const authHeader = this.getAuthHeader();
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const response = await axios.post(this.adRevenueEndpoint, formData.toString(), {
                headers: headers
            });

            // Adjust returns 200 even for errors - check response body
            const responseData = response.data;
            let errorMessage = null;
            
            if (typeof responseData === 'string') {
                if (responseData.toLowerCase().includes('error') || 
                    responseData.toLowerCase().includes('invalid')) {
                    errorMessage = responseData;
                }
            } else if (responseData && typeof responseData === 'object') {
                if (responseData.error) {
                    errorMessage = typeof responseData.error === 'string' 
                        ? responseData.error 
                        : JSON.stringify(responseData.error);
                }
            }
            
            if (errorMessage) {
                console.error('Adjust API returned error:', errorMessage);
                
                let helpfulMessage = 'Failed to track ad revenue';
                if (errorMessage.includes('invalid source')) {
                    helpfulMessage = 'Invalid ad revenue source. Valid sources: admob, applovin, applovin_exchange, chartboost, facebook, fyber, google, ironsource, line, maio, mintegral, mopub, nend, startapp, tiktok, unity, vungle, yandex.';
                } else if (errorMessage.includes('s2s is not enabled')) {
                    helpfulMessage = 'S2S API is not enabled for this app in Adjust dashboard. Please enable S2S in Adjust Settings → App Settings → S2S API.';
                }
                
                return {
                    success: false,
                    error: errorMessage,
                    message: helpfulMessage,
                    data: responseData
                };
            }

            return {
                success: true,
                data: response.data,
                message: 'Ad revenue tracked successfully'
            };

        } catch (error) {
            console.error('Adjust trackAdRevenue error:', error.response?.data || error.message);
            
            // Check if error response has error message in body
            if (error.response && error.response.data && error.response.data.error) {
                return {
                    success: false,
                    error: error.response.data.error,
                    message: 'Failed to track ad revenue',
                    data: error.response.data
                };
            }
            
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to track ad revenue'
            };
        }
    }

    /**
     * Send session to Adjust
     * @param {Object} sessionData - Session data
     * @param {string} sessionData.idfa - iOS IDFA
     * @param {string} sessionData.gpsAdid - Android GPS ADID
     * @param {string} sessionData.idfv - iOS IDFV
     * @param {string} sessionData.androidId - Android ID
     * @param {Object} sessionData.callbackParams - Callback parameters
     * @returns {Promise<Object>} Response from Adjust
     */
    async trackSession(sessionData) {
        try {
            const {
                idfa,
                gpsAdid,
                idfv,
                androidId,
                fireAdid,
                windowsAdid,
                amazonAdid,
                callbackParams = {},
                environment = 'production',
                createdAt,
                appToken = this.appToken
            } = sessionData;

            // Validate required fields
            if (!appToken) {
                throw new Error('appToken is required');
            }

            // At least one device identifier is required
            if (!idfa && !gpsAdid && !idfv && !androidId && !fireAdid && !windowsAdid && !amazonAdid) {
                throw new Error('At least one device identifier is required');
            }

            // Determine OS name from device identifiers
            let detectedOsName = 'unknown';
            if (idfa || idfv) {
                detectedOsName = 'ios';
            } else if (gpsAdid || androidId) {
                detectedOsName = 'android';
            } else if (fireAdid || amazonAdid) {
                detectedOsName = 'amazon';
            } else if (windowsAdid) {
                detectedOsName = 'windows';
            }

            // Build request payload
            // Adjust S2S API REQUIRES: s2s=1, app_token, os_name, and at least one device identifier
            const payload = {
                s2s: '1',  // REQUIRED: Indicates this is an S2S request
                app_token: appToken,
                os_name: detectedOsName,  // REQUIRED: Operating system name
                environment: environment
            };

            // Add device identifiers
            if (idfa) payload.idfa = idfa;
            if (gpsAdid) payload.gps_adid = gpsAdid;
            if (idfv) payload.idfv = idfv;
            if (androidId) payload.android_id = androidId;
            if (fireAdid) payload.fire_adid = fireAdid;
            if (windowsAdid) payload.windows_adid = windowsAdid;
            if (amazonAdid) payload.amazon_adid = amazonAdid;

            // Add timestamp if provided
            if (createdAt) {
                payload.created_at = new Date(createdAt).toISOString();
            }

            // Add callback parameters
            if (Object.keys(callbackParams).length > 0) {
                Object.keys(callbackParams).forEach(key => {
                    payload[`callback_params.${key}`] = callbackParams[key];
                });
            }

            // Make request to Adjust
            // Adjust S2S API expects form-encoded data
            const formData = new URLSearchParams();
            
            Object.keys(payload).forEach(key => {
                if (payload[key] !== undefined && payload[key] !== null) {
                    formData.append(key, payload[key].toString());
                }
            });

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded'
            };

            const authHeader = this.getAuthHeader();
            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const response = await axios.post(this.sessionEndpoint, formData.toString(), {
                headers: headers
            });

            // Adjust returns 200 even for errors - check response body
            if (response.data && response.data.error) {
                console.error('Adjust API returned error:', response.data.error);
                return {
                    success: false,
                    error: response.data.error,
                    message: 'Failed to track session',
                    data: response.data
                };
            }

            return {
                success: true,
                data: response.data,
                message: 'Session tracked successfully'
            };

        } catch (error) {
            console.error('Adjust trackSession error:', error.response?.data || error.message);
            
            // Check if error response has error message in body
            if (error.response && error.response.data && error.response.data.error) {
                return {
                    success: false,
                    error: error.response.data.error,
                    message: 'Failed to track session',
                    data: error.response.data
                };
            }
            
            return {
                success: false,
                error: error.response?.data || error.message,
                message: 'Failed to track session'
            };
        }
    }
}

module.exports = new AdjustService();


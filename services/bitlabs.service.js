/**
 * Bitlabs API Service
 * Handles all API calls to Bitlabs platform for game offers
 * @module services/bitlabs
 */

const axios = require('axios');
const config = require('../config/config');

class BitlabsService {
    constructor() {
        // Bitlabs API base URL - should be https://api.bitlabs.ai (without /v1 or /v2)
        // The version will be added to the endpoint path (e.g., /v2/client/offers)
        this.baseURL = config.BITLABS_BASE_URL || 'https://api.bitlabs.ai';
        // Remove /v1 or /v2 from baseURL if it's there, we'll add it to the endpoint
        if (this.baseURL.endsWith('/v1') || this.baseURL.endsWith('/v2')) {
            this.baseURL = this.baseURL.replace(/\/v[12]$/, '');
        }
        this.apiToken = config.BITLABS_API_TOKEN;
        this.secretKey = config.BITLABS_SECRET_KEY;
        this.serverToServerKey = config.BITLABS_SERVER_TO_SERVER_KEY;
        
        // Create axios instance with default config
        // Note: We'll set auth headers per request since Bitlabs may use different methods
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 seconds timeout
        });

        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            response => response,
            error => {
                if (error.response) {
                    // Server responded with error status
                    const errorData = {
                        status: error.response.status,
                        message: error.response.data?.message || error.message,
                        data: error.response.data
                    };
                    throw errorData;
                } else if (error.request) {
                    // Request made but no response
                    throw {
                        status: 503,
                        message: 'Bitlabs API is not responding',
                        data: null
                    };
                } else {
                    // Error in request setup
                    throw {
                        status: 500,
                        message: error.message,
                        data: null
                    };
                }
            }
        );
    }

    /**
     * Validate service configuration
     * @returns {boolean}
     */
    isConfigured() {
        return !!(this.baseURL && this.apiToken);
    }

    /**
     * Get available offers inventory (static API)
     * Endpoint: GET https://api.bitlabs.ai/v2/client/offers
     * Required Headers:
     *   - X-Api-Token: API token
     *   - X-User-Id: User ID (can be a placeholder for static inventory)
     * @param {Object} queryParams - Query parameters (platform, country, category, etc.)
     * @param {string} userId - Optional user ID (if not provided, uses a default)
     * @returns {Promise<Object>} Offers data
     */
    async getOffers(queryParams = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            // Bitlabs API endpoint: GET https://api.bitlabs.ai/v2/client/offers
            // Required headers: X-Api-Token and X-User-Id
            const endpoint = '/v2/client/offers';
            const fullURL = `${this.baseURL}${endpoint}`;
            
            // Use provided userId or a default placeholder for static inventory
            const userIdentifier = userId || queryParams.userId || 'static-inventory';
            
            // Remove userId from queryParams if present (it goes in header, not query)
            // Also normalize parameter names to match Bitlabs API
            const { userId: _, platform, country, type, category, ...restParams } = queryParams;
            
            // Convert platform to devices array (Bitlabs uses 'devices' not 'platform')
            const normalizedParams = { ...restParams };
            
            if (platform) {
                // Convert platform to devices array
                if (platform === 'ios' || platform === 'iphone') {
                    normalizedParams.devices = ['iphone'];
                } else if (platform === 'ipad') {
                    normalizedParams.devices = ['ipad'];
                } else if (platform === 'android') {
                    normalizedParams.devices = ['android'];
                } else if (platform === 'mobile') {
                    normalizedParams.devices = ['iphone', 'android'];
                }
            }
            
            // Convert type/category to is_game if needed
            if (type === 'game' || category === 'gaming') {
                normalizedParams.is_game = true;
            }
            
            // Note: Bitlabs API accepts these query parameters:
            // - devices: array of strings ('iphone', 'ipad', 'android')
            // - is_game: boolean | null (true = only games, false = only non-games, null = all)
            // - in_app: boolean | null (App Store/Play Store guidelines)
            // - client_user_agent: string
            // - client_ip: string
            // - tags: string (key-value pairs)
            
            console.log(`Fetching Bitlabs offers from: ${fullURL}`);
            console.log(`Headers: X-Api-Token, X-User-Id: ${userIdentifier}`);
            console.log(`Query parameters:`, normalizedParams);
            
            // Bitlabs requires these headers:
            // - X-Api-Token: Your API token
            // - X-User-Id: User identifier (can be placeholder for static inventory)
            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            // Make the request with required headers
            // Bitlabs API query parameters:
            // - devices: array (e.g., ['android', 'iphone']) - axios will serialize as devices[]=android&devices[]=iphone
            // - is_game: boolean (true for games only, false for non-games, null/undefined for all)
            // - in_app: boolean (App Store/Play Store guidelines)
            // - client_user_agent: string
            // - client_ip: string
            // - tags: string (key=value&key2=value2)
            
            // Configure axios params serializer for arrays
            const paramsSerializer = {
                indexes: null // Serialize arrays as devices[]=android&devices[]=iphone
            };
            
            const response = await this.client.get(endpoint, {
                headers: headers,
                params: normalizedParams,
                paramsSerializer: paramsSerializer
            });
            
            console.log(`Successfully fetched response from ${fullURL}`);
            console.log(`Response status: ${response.status}`);
            console.log(`Response data type: ${typeof response.data}`);
            console.log(`Response data keys:`, response.data ? Object.keys(response.data) : 'null');
            console.log(`Full response data:`, JSON.stringify(response.data, null, 2));
            
            // Normalize response to match expected format
            // Bitlabs API response structure: { data: { offers: [], offerwall_code: "...", started_offers: [] }, status: "success" }
            let rawOffers = [];
            
            // Check if response.data is directly an array
            if (Array.isArray(response.data)) {
                rawOffers = response.data;
                console.log(`Found offers as direct array: ${rawOffers.length} items`);
            } 
            // Check nested data structure (Bitlabs format: response.data.data.offers)
            else if (response.data?.data?.offers && Array.isArray(response.data.data.offers)) {
                rawOffers = response.data.data.offers;
                console.log(`Found offers in response.data.data.offers: ${rawOffers.length} items`);
            }
            // Check if offers are directly in response.data
            else if (response.data?.offers && Array.isArray(response.data.offers)) {
                rawOffers = response.data.offers;
                console.log(`Found offers in response.data.offers: ${rawOffers.length} items`);
            }
            // Check other common structures
            else if (response.data?.data && Array.isArray(response.data.data)) {
                rawOffers = response.data.data;
                console.log(`Found offers in response.data.data (as array): ${rawOffers.length} items`);
            } else if (response.data?.items && Array.isArray(response.data.items)) {
                rawOffers = response.data.items;
                console.log(`Found offers in response.data.items: ${rawOffers.length} items`);
            } else if (response.data?.results && Array.isArray(response.data.results)) {
                rawOffers = response.data.results;
                console.log(`Found offers in response.data.results: ${rawOffers.length} items`);
            } else if (response.data?.list && Array.isArray(response.data.list)) {
                rawOffers = response.data.list;
                console.log(`Found offers in response.data.list: ${rawOffers.length} items`);
            } else {
                console.log(`No offers array found in response. Response structure:`, {
                    isArray: Array.isArray(response.data),
                    keys: Object.keys(response.data || {}),
                    hasData: !!response.data?.data,
                    dataKeys: response.data?.data ? Object.keys(response.data.data) : null,
                    sample: JSON.stringify(response.data).substring(0, 500)
                });
            }
            
            // Normalize Bitlabs offer structure to match our expected format
            const normalizedOffers = rawOffers.map(offer => ({
                // Basic info
                id: offer.id || offer.offer_id,
                gameId: offer.id?.toString() || offer.product_id || offer.app_metadata?.app_id,
                title: offer.anchor || offer.product_name || offer.name,
                description: offer.description || '',
                
                // Images
                icon: offer.icon_url || offer.creatives?.icon || '',
                banner: offer.creatives?.images?.['600x300'] || 
                        offer.creatives?.images?.['630x315'] || 
                        offer.creatives?.images?.['600x200'] || 
                        offer.icon_url || '',
                
                // Category/Genre
                genre: offer.app_metadata?.categories?.[0] || offer.categories?.[0] || 'General',
                category: offer.categories?.join(', ') || offer.app_metadata?.categories?.[0] || 'General',
                
                // Game info
                isGame: offer.is_game || false,
                packageName: offer.app_metadata?.app_id || '',
                platform: offer.web_to_mobile_devices?.[0] || 'android',
                
                // Rewards - get from events array
                reward: {
                    coins: parseFloat(offer.total_points) || 0,
                    currency: 'points',
                    xp: Math.round((parseFloat(offer.total_points) || 0) * 0.5),
                    payout: offer.events?.find(e => e.payable)?.payout || '0'
                },
                
                // Events/Tasks
                events: offer.events || [],
                requirements: offer.requirements || '',
                thingsToKnow: offer.things_to_know || [],
                
                // URLs
                downloadUrl: offer.click_url || '',
                deepLink: offer.click_url || '',
                supportUrl: offer.support_url || '',
                
                // Metadata
                confirmationTime: offer.confirmation_time || '',
                pendingTime: offer.pending_time || 0,
                offerExpiresAt: offer.offer_expires_at || null,
                sessionHours: offer.session_hours || 0,
                
                // Screenshots
                screenshots: offer.app_metadata?.screenshot_urls || [],
                
                // Additional Bitlabs specific fields
                offerwallCode: response.data?.data?.offerwall_code || response.data?.offerwall_code,
                funnelId: offer.funnel_id,
                productId: offer.product_id,
                productName: offer.product_name,
                isSticky: offer.is_sticky || false,
                mobileVerificationRequired: offer.mobile_verification_required || false,
                webToMobile: offer.web_to_mobile || false,
                webToMobileDevices: offer.web_to_mobile_devices || [],
                epc: offer.epc,
                lowestCapLeft: offer.lowest_cap_left,
                stats: offer.stats || {}
            }));
            
            console.log(`Final normalized offers count: ${normalizedOffers.length}`);
            
            if (normalizedOffers.length === 0) {
                console.warn(`⚠️ No offers found in Bitlabs API response.`);
                console.warn(`Response structure:`, JSON.stringify(response.data, null, 2));
            } else {
                console.log(`✅ Successfully normalized ${normalizedOffers.length} Bitlabs offers`);
            }
            
            return {
                success: true,
                data: normalizedOffers,
                total: normalizedOffers.length,
                timestamp: new Date().toISOString(),
                offerwallCode: response.data?.data?.offerwall_code || response.data?.offerwall_code
            };
        } catch (error) {
            const errorDetails = {
                status: error.status || error.response?.status,
                message: error.message,
                url: error.config?.url,
                baseURL: this.baseURL,
                fullURL: `${this.baseURL}/v2/client/offers`,
                responseData: error.response?.data,
                requestConfig: {
                    method: error.config?.method,
                    url: error.config?.url,
                    params: error.config?.params,
                    headers: error.config?.headers ? Object.keys(error.config.headers) : []
                }
            };
            
            console.error('Bitlabs getOffers error:', JSON.stringify(errorDetails, null, 2));
            
            // If we have response data, include it in the error
            if (error.response?.data) {
                error.details = error.response.data;
            }
            
            throw error;
        }
    }

    /**
     * Get offers by devices
     * @param {string|string[]} devices - Device types: 'iphone', 'ipad', 'android'
     * @param {Object} queryParams - Additional query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Offers data
     */
    async getOffersByDevices(devices, queryParams = {}, userId = null) {
        const devicesArray = Array.isArray(devices) ? devices : [devices];
        return this.getOffers({
            ...queryParams,
            devices: devicesArray
        }, userId);
    }

    /**
     * Get game offers specifically
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Game offers data
     */
    async getGameOffers(queryParams = {}, userId = null) {
        return this.getOffers({
            ...queryParams,
            is_game: true // Bitlabs uses is_game parameter
        }, userId);
    }

    /**
     * Get non-game offers
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Non-game offers data
     */
    async getNonGameOffers(queryParams = {}, userId = null) {
        return this.getOffers({
            ...queryParams,
            is_game: false
        }, userId);
    }

    /**
     * Get surveys
     * Endpoint: GET https://api.bitlabs.ai/v2/client/surveys
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Surveys data
     */
    async getSurveys(queryParams = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v2/client/surveys';
            const fullURL = `${this.baseURL}${endpoint}`;
            const userIdentifier = userId || queryParams.userId || 'static-inventory';
            
            // Normalize parameters
            const { userId: _, platform, ...restParams } = queryParams;
            const normalizedParams = { ...restParams };
            
            // Convert platform to devices array
            if (platform) {
                if (platform === 'ios' || platform === 'iphone') {
                    normalizedParams.devices = ['iphone'];
                } else if (platform === 'ipad') {
                    normalizedParams.devices = ['ipad'];
                } else if (platform === 'android') {
                    normalizedParams.devices = ['android'];
                } else if (platform === 'mobile') {
                    normalizedParams.devices = ['iphone', 'android'];
                }
            }

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const paramsSerializer = {
                indexes: null
            };

            console.log(`Fetching Bitlabs surveys from: ${fullURL}`);
            console.log(`Headers: X-Api-Token, X-User-Id: ${userIdentifier}`);
            console.log(`Query parameters:`, normalizedParams);

            const response = await this.client.get(endpoint, {
                headers: headers,
                params: normalizedParams,
                paramsSerializer: paramsSerializer
            });

            console.log(`Successfully fetched surveys from ${fullURL}`);
            console.log(`Response status: ${response.status}`);
            console.log(`Response data keys:`, response.data ? Object.keys(response.data) : 'null');

            // Normalize response - Bitlabs surveys API structure
            let rawSurveys = [];
            
            if (Array.isArray(response.data)) {
                rawSurveys = response.data;
            } else if (response.data?.data && Array.isArray(response.data.data)) {
                rawSurveys = response.data.data;
            } else if (response.data?.surveys && Array.isArray(response.data.surveys)) {
                rawSurveys = response.data.surveys;
            } else if (response.data?.items && Array.isArray(response.data.items)) {
                rawSurveys = response.data.items;
            }

            console.log(`Found ${rawSurveys.length} surveys`);

            // Normalize survey structure
            const normalizedSurveys = rawSurveys.map(survey => ({
                id: survey.id || survey.survey_id,
                surveyId: survey.id?.toString() || survey.survey_id?.toString(),
                title: survey.anchor || survey.name || survey.title,
                description: survey.description || '',
                type: 'survey',
                category: survey.category || 'Survey',
                
                // Images
                icon: survey.icon_url || survey.icon || '',
                banner: survey.banner_url || survey.banner || '',
                
                // Rewards
                reward: {
                    coins: parseFloat(survey.total_points || survey.reward || 0),
                    currency: 'points',
                    xp: Math.round((parseFloat(survey.total_points || survey.reward || 0)) * 0.5),
                    payout: survey.payout || '0'
                },
                
                // URLs
                clickUrl: survey.click_url || '',
                surveyUrl: survey.survey_url || survey.click_url || '',
                
                // Metadata
                estimatedTime: survey.estimated_time || survey.duration || 0,
                confirmationTime: survey.confirmation_time || '',
                pendingTime: survey.pending_time || 0,
                
                // Provider info
                provider: 'bitlabs',
                sdkProvider: 'bitlabs',
                
                // Additional fields
                isAvailable: survey.is_available !== false,
                requirements: survey.requirements || '',
                thingsToKnow: survey.things_to_know || []
            }));

            return {
                success: true,
                data: normalizedSurveys,
                total: normalizedSurveys.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getSurveys error:', error);
            throw error;
        }
    }

    /**
     * Get cashback offers
     * Endpoint: GET https://api.bitlabs.ai/v1/client/cashback/offers
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Cashback offers data
     */
    async getCashbackOffers(queryParams = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v1/client/cashback/offers';
            const fullURL = `${this.baseURL}${endpoint}`;
            const userIdentifier = userId || queryParams.userId || 'static-inventory';
            
            // Normalize parameters
            const { userId: _, platform, ...restParams } = queryParams;
            const normalizedParams = { ...restParams };
            
            // Convert platform to devices array
            if (platform) {
                if (platform === 'ios' || platform === 'iphone') {
                    normalizedParams.devices = ['iphone'];
                } else if (platform === 'ipad') {
                    normalizedParams.devices = ['ipad'];
                } else if (platform === 'android') {
                    normalizedParams.devices = ['android'];
                } else if (platform === 'mobile') {
                    normalizedParams.devices = ['iphone', 'android'];
                }
            }

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const paramsSerializer = {
                indexes: null
            };

            console.log(`Fetching Bitlabs cashback offers from: ${fullURL}`);
            console.log(`Headers: X-Api-Token, X-User-Id: ${userIdentifier}`);
            console.log(`Query parameters:`, normalizedParams);

            const response = await this.client.get(endpoint, {
                headers: headers,
                params: normalizedParams,
                paramsSerializer: paramsSerializer
            });

            console.log(`Successfully fetched cashback offers from ${fullURL}`);
            console.log(`Response status: ${response.status}`);
            console.log(`Response data keys:`, response.data ? Object.keys(response.data) : 'null');

            // Normalize response
            let rawCashback = [];
            
            if (Array.isArray(response.data)) {
                rawCashback = response.data;
            } else if (response.data?.data && Array.isArray(response.data.data)) {
                rawCashback = response.data.data;
            } else if (response.data?.cashback && Array.isArray(response.data.cashback)) {
                rawCashback = response.data.cashback;
            } else if (response.data?.offers && Array.isArray(response.data.offers)) {
                rawCashback = response.data.offers;
            } else if (response.data?.items && Array.isArray(response.data.items)) {
                rawCashback = response.data.items;
            }

            console.log(`Found ${rawCashback.length} cashback offers`);

            // Normalize cashback structure (similar to offers)
            const normalizedCashback = rawCashback.map(offer => ({
                id: offer.id || offer.offer_id,
                offerId: offer.id?.toString() || offer.offer_id?.toString(),
                title: offer.anchor || offer.product_name || offer.name,
                description: offer.description || '',
                type: 'cashback',
                category: offer.category || 'Cashback',
                
                // Images
                icon: offer.icon_url || offer.icon || offer.creatives?.icon || '',
                banner: offer.creatives?.images?.['600x300'] || offer.icon_url || '',
                
                // Rewards
                reward: {
                    coins: parseFloat(offer.total_points || offer.reward || 0),
                    currency: 'points',
                    xp: Math.round((parseFloat(offer.total_points || offer.reward || 0)) * 0.5),
                    payout: offer.payout || '0'
                },
                
                // URLs
                clickUrl: offer.click_url || '',
                deepLink: offer.click_url || '',
                
                // Metadata
                confirmationTime: offer.confirmation_time || '',
                pendingTime: offer.pending_time || 0,
                
                // Provider info
                provider: 'bitlabs',
                sdkProvider: 'bitlabs',
                
                // Additional fields
                requirements: offer.requirements || '',
                thingsToKnow: offer.things_to_know || []
            }));

            return {
                success: true,
                data: normalizedCashback,
                total: normalizedCashback.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getCashbackOffers error:', error);
            throw error;
        }
    }

    /**
     * Get clicks
     * Endpoint: GET https://api.bitlabs.ai/v2/client/clicks
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Clicks data
     */
    async getClicks(queryParams = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v2/client/clicks';
            const userIdentifier = userId || queryParams.userId || 'static-inventory';

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.get(endpoint, {
                headers: headers,
                params: queryParams
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getClicks error:', error);
            throw error;
        }
    }

    /**
     * Create click
     * Endpoint: POST https://api.bitlabs.ai/v2/client/clicks
     * @param {Object} clickData - Click data
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Created click data
     */
    async createClick(clickData = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v2/client/clicks';
            const userIdentifier = userId || clickData.userId || 'static-inventory';

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.post(endpoint, clickData, {
                headers: headers
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs createClick error:', error);
            throw error;
        }
    }

    /**
     * Get click by ID
     * Endpoint: GET https://api.bitlabs.ai/v2/client/clicks/{clickId}
     * @param {string} clickId - Click ID
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Click data
     */
    async getClickById(clickId, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = `/v2/client/clicks/${clickId}`;
            const userIdentifier = userId || 'static-inventory';

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.get(endpoint, {
                headers: headers
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getClickById error:', error);
            throw error;
        }
    }

    /**
     * Update click
     * Endpoint: PUT https://api.bitlabs.ai/v2/client/clicks/{clickId}
     * @param {string} clickId - Click ID
     * @param {Object} updateData - Update data
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Updated click data
     */
    async updateClick(clickId, updateData = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = `/v2/client/clicks/${clickId}`;
            const userIdentifier = userId || updateData.userId || 'static-inventory';

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.put(endpoint, updateData, {
                headers: headers
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs updateClick error:', error);
            throw error;
        }
    }

    /**
     * Get survey reconciliation count
     * Endpoint: GET https://api.bitlabs.ai/v1/client/surveys/reconciliation-count
     * @param {Object} queryParams - Query parameters
     * @param {string} userId - Optional user ID
     * @returns {Promise<Object>} Reconciliation count data
     */
    async getSurveyReconciliationCount(queryParams = {}, userId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v1/client/surveys/reconciliation-count';
            const userIdentifier = userId || queryParams.userId || 'static-inventory';

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userIdentifier,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.get(endpoint, {
                headers: headers,
                params: queryParams
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getSurveyReconciliationCount error:', error);
            throw error;
        }
    }

    /**
     * Get user magic receipt history
     * Endpoint: GET https://api.bitlabs.ai/v1/client/user/history/magic-receipts/{receiptOfferId}
     * @param {string} userId - User ID
     * @param {string} receiptOfferId - Receipt offer ID (optional)
     * @returns {Promise<Object>} Magic receipt history data
     */
    async getUserMagicReceiptHistory(userId, receiptOfferId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            let endpoint = '/v1/client/user/history/magic-receipts';
            if (receiptOfferId) {
                endpoint += `/${receiptOfferId}`;
            }

            const headers = {
                'X-Api-Token': this.apiToken,
                'X-User-Id': userId || 'static-inventory',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };

            const response = await this.client.get(endpoint, {
                headers: headers
            });

            return {
                success: true,
                data: response.data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Bitlabs getUserMagicReceiptHistory error:', error);
            throw error;
        }
    }

    /**
     * Get user offer history
     * Endpoint: GET https://api.bitlabs.ai/v1/client/user/history/offers/{offerId}
     * @param {string} userId - User ID
     * @param {string} offerId - Offer ID (optional)
     * @returns {Promise<Object>} User offer history
     */
    async getUserOfferHistory(userId, offerId = null) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            let endpoint = '/v1/client/user/history/offers';
            if (offerId) {
                endpoint += `/${offerId}`;
            }

            const response = await this.client.get(endpoint, {
                headers: {
                    'X-Api-Token': this.apiToken,
                    'X-User-Id': userId || 'static-inventory',
                    'Accept': 'application/json'
                },
                params: {}
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Bitlabs getUserOfferHistory error:', error);
            throw error;
        }
    }

    /**
     * Get user maid
     * Endpoint: GET https://api.bitlabs.ai/v1/client/user/maid
     * @param {string} userId - User ID
     * @returns {Promise<Object>} User maid data
     */
    async getUserMaid(userId) {
        if (!this.isConfigured()) {
            throw {
                status: 500,
                message: 'Bitlabs API is not properly configured',
                data: null
            };
        }

        try {
            const endpoint = '/v1/client/user/maid';

            const response = await this.client.get(endpoint, {
                headers: {
                    'X-Api-Token': this.apiToken,
                    'X-User-Id': userId || 'static-inventory',
                    'Accept': 'application/json'
                },
                params: {}
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            console.error('Bitlabs getUserMaid error:', error);
            throw error;
        }
    }

    /**
     * Verify callback/webhook signature
     * @param {Object} callbackData - Callback data from Bitlabs
     * @param {string} signature - Signature to verify
     * @returns {boolean} Whether signature is valid
     */
    verifyCallbackSignature(callbackData, signature) {
        // Implement signature verification using secret key
        // This is a placeholder - adjust based on Bitlabs actual signature method
        const crypto = require('crypto');
        const dataString = JSON.stringify(callbackData);
        const expectedSignature = crypto
            .createHmac('sha256', this.secretKey)
            .update(dataString)
            .digest('hex');
        
        return expectedSignature === signature;
    }

    /**
     * Health check for Bitlabs API
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        const configured = this.isConfigured();
        if (!configured) {
            return {
                status: 'misconfigured',
                configured: false,
                error: 'Missing Bitlabs config (BASE_URL or API_TOKEN)'
            };
        }

        try {
            // Try health check endpoint - use the correct v2 endpoint with required headers
            const response = await this.client.get('/v2/client/offers', {
                params: { 
                    limit: 1 
                },
                headers: {
                    'X-Api-Token': this.apiToken,
                    'X-User-Id': 'health-check' // Placeholder for health check
                }
            });
            
            return {
                status: 'ok',
                configured: true,
                data: { 
                    reachable: true, 
                    sampleCount: Array.isArray(response.data) 
                        ? response.data.length 
                        : (response.data?.offers?.length || response.data?.data?.length || 1)
                }
            };
        } catch (error) {
            console.error('Bitlabs health check error:', error);
            const status = error.status || error?.response?.status;
            if (status === 401 || status === 403) {
                return {
                    status: 'unauthorized',
                    configured: true,
                    error: 'Invalid or unauthorized Bitlabs API token',
                    httpStatus: status
                };
            }
            if (status >= 500) {
                return {
                    status: 'upstream_error',
                    configured: true,
                    error: 'Bitlabs API server error',
                    httpStatus: status
                };
            }
            return {
                status: 'error',
                configured: true,
                error: error.message || 'Health probe failed'
            };
        }
    }
}

// Export singleton instance
module.exports = new BitlabsService();

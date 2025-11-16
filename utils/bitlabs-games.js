const axios = require('axios');
const bitlabsService = require('../services/bitlabs.service');

// Bitlabs configuration
const BITLABS_GAMES_CONFIG = {
    baseUrl: process.env.BITLABS_BASE_URL || 'https://api.bitlabs.ai',
    apiToken: process.env.BITLABS_API_TOKEN,
    timeout: 30000 // 30 seconds
};

/**
 * Bitlabs SDK for game offers and rewards
 */
class BitlabsGamesSDK {
    constructor() {
        this.apiToken = BITLABS_GAMES_CONFIG.apiToken;
        this.baseUrl = BITLABS_GAMES_CONFIG.baseUrl;
        
        if (!this.apiToken) {
            console.warn('Bitlabs credentials not configured. Game offers will be disabled.');
        }
    }

    /**
     * Get available game offers
     * @param {Object} params - User parameters
     * @param {string} params.userId - User ID
     * @param {Object} params.userProfile - User profile information
     * @returns {Object} Available game offers
     */
    async getGameOffers(params) {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured',
                    offers: []
                };
            }

            const { userId, userProfile } = params;

            // Use Bitlabs offer cache to get offers (cached and refreshed periodically)
            const bitlabsOfferCache = require('./bitlabsOfferCache');
            
            // Convert platform to devices array (Bitlabs API format)
            let devices = [];
            const platform = userProfile?.platform || 'mobile';
            if (platform === 'ios' || platform === 'iphone') {
                devices = ['iphone'];
            } else if (platform === 'ipad') {
                devices = ['ipad'];
            } else if (platform === 'android') {
                devices = ['android'];
            } else if (platform === 'mobile') {
                devices = ['iphone', 'android'];
            }
            
            const offers = await bitlabsOfferCache.getOffers({
                devices: devices.length > 0 ? devices : undefined,
                is_game: true, // Get game offers
                client_user_agent: userProfile?.userAgent || undefined,
                client_ip: userProfile?.ipAddress || undefined,
                userId: userId // Pass userId for X-User-Id header
            });
            
            if (!Array.isArray(offers)) {
                return {
                    success: false,
                    error: 'Failed to fetch offers',
                    offers: []
                };
            }

            // Normalize Bitlabs offers - they're already normalized by the service
            // The offers from cache are already in the normalized format
            const normalizedOffers = offers.map(offer => ({
                // Use the normalized structure from service, or fallback to raw if needed
                id: offer.id,
                gameId: offer.gameId || offer.id?.toString(),
                title: offer.title || offer.anchor || offer.product_name,
                description: offer.description || '',
                icon: offer.icon || offer.icon_url || offer.creatives?.icon || '',
                banner: offer.banner || offer.creatives?.images?.['600x300'] || offer.icon_url || '',
                genre: offer.genre || offer.app_metadata?.categories?.[0] || 'General',
                category: offer.category || offer.categories?.join(', ') || 'General',
                difficulty: offer.difficulty || 'medium',
                estimatedTime: offer.estimatedTime || Math.round((offer.session_hours || 720) / 60),
                reward: offer.reward || {
                    coins: parseFloat(offer.total_points) || 0,
                    currency: 'points',
                    xp: Math.round((parseFloat(offer.total_points) || 0) * 0.5),
                    payout: offer.events?.find(e => e.payable)?.payout || '0'
                },
                requirements: offer.requirements || {
                    minLevel: 1,
                    maxLevel: null,
                    tasks: offer.events || [],
                    timeLimit: offer.session_hours || null
                },
                isAvailable: offer.isAvailable !== false,
                isInstalled: offer.isInstalled || false,
                downloadUrl: offer.downloadUrl || offer.click_url || '',
                deepLink: offer.deepLink || offer.click_url || '',
                expiresAt: offer.expiresAt || offer.offer_expires_at || null,
                priority: offer.priority || 1,
                // Bitlabs specific fields
                packageName: offer.packageName || offer.app_metadata?.app_id || '',
                platform: offer.platform || offer.web_to_mobile_devices?.[0] || 'android',
                rating: offer.rating || 4.0,
                downloadCount: offer.downloadCount || 0,
                // Additional Bitlabs fields
                isGame: offer.isGame !== undefined ? offer.isGame : (offer.is_game || false),
                events: offer.events || [],
                thingsToKnow: offer.thingsToKnow || offer.things_to_know || [],
                screenshots: offer.screenshots || offer.app_metadata?.screenshot_urls || [],
                offerwallCode: offer.offerwallCode,
                funnelId: offer.funnelId || offer.funnel_id,
                productId: offer.productId || offer.product_id
            }));

            return {
                success: true,
                offers: normalizedOffers,
                totalOffers: normalizedOffers.length,
                estimatedEarnings: normalizedOffers.reduce((sum, o) => sum + (o.reward.coins || 0), 0)
            };

        } catch (error) {
            console.error('Bitlabs get game offers error:', error.message);
            return {
                success: false,
                error: error.message,
                offers: []
            };
        }
    }

    /**
     * Track game installation
     * @param {Object} params - Installation parameters
     * @param {string} params.userId - User ID
     * @param {string} params.offerId - Offer ID
     * @param {string} params.gameId - Game ID
     * @param {Object} params.deviceInfo - Device information
     * @returns {Object} Installation tracking result
     */
    async trackInstallation(params) {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured'
                };
            }

            const { userId, offerId, gameId, deviceInfo } = params;

            // Bitlabs typically tracks installations via callbacks
            // For now, return success with tracking ID
            const trackingId = `bitlabs_${offerId}_${Date.now()}`;

            return {
                success: true,
                trackingId: trackingId,
                status: 'tracked',
                reward: 0 // Will be credited on completion
            };

        } catch (error) {
            console.error('Bitlabs track installation error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Track game completion
     * @param {Object} params - Completion parameters
     * @param {string} params.userId - User ID
     * @param {string} params.offerId - Offer ID
     * @param {string} params.gameId - Game ID
     * @param {Object} params.completionData - Completion data
     * @returns {Object} Completion tracking result
     */
    async trackCompletion(params) {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured'
                };
            }

            // Bitlabs typically handles completion via server-to-server callbacks
            // This is a placeholder for manual completion tracking
            const { userId, offerId, gameId, completionData } = params;

            return {
                success: true,
                totalReward: completionData?.reward || 0,
                bonusReward: 0,
                completedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Bitlabs track completion error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify callback/webhook
     * @param {Object} params - Callback parameters
     * @param {string} params.userId - User ID
     * @param {string} params.offerId - Offer ID
     * @param {string} params.trackingId - Tracking ID
     * @param {string} params.signature - Callback signature
     * @returns {Object} Verification result
     */
    async verifyCallback(params) {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured',
                    isValid: false
                };
            }

            const { userId, offerId, trackingId, signature, reward } = params;

            // Verify signature using secret key
            const isValid = bitlabsService.verifyCallbackSignature(
                { userId, offerId, trackingId, reward },
                signature
            );

            return {
                success: true,
                isValid: isValid,
                reward: reward || 0,
                offerId: offerId
            };

        } catch (error) {
            console.error('Bitlabs verify callback error:', error.message);
            return {
                success: false,
                error: error.message,
                isValid: false
            };
        }
    }

    /**
     * Get user game history
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @returns {Object} Game history
     */
    async getUserHistory(userId, options = {}) {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured',
                    history: []
                };
            }

            // Bitlabs history would typically come from your own database
            // This is a placeholder
            return {
                success: true,
                history: [],
                pagination: {
                    page: options.page || 1,
                    limit: options.limit || 20,
                    total: 0,
                    pages: 0
                },
                totalEarnings: 0
            };

        } catch (error) {
            console.error('Bitlabs get user history error:', error.message);
            return {
                success: false,
                error: error.message,
                history: []
            };
        }
    }

    /**
     * Get categories
     * @returns {Object} Available categories
     */
    async getCategories() {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured',
                    categories: []
                };
            }

            // Common game categories
            return {
                success: true,
                categories: [
                    { id: 'action', name: 'Action', icon: '🎮' },
                    { id: 'puzzle', name: 'Puzzle', icon: '🧩' },
                    { id: 'strategy', name: 'Strategy', icon: '♟️' },
                    { id: 'arcade', name: 'Arcade', icon: '🎯' },
                    { id: 'casual', name: 'Casual', icon: '🎲' },
                    { id: 'racing', name: 'Racing', icon: '🏎️' },
                    { id: 'sports', name: 'Sports', icon: '⚽' }
                ]
            };

        } catch (error) {
            console.error('Bitlabs get categories error:', error.message);
            return {
                success: false,
                error: error.message,
                categories: []
            };
        }
    }

    /**
     * Get earnings summary
     * @param {string} userId - User ID
     * @param {string} period - Time period (daily, weekly, monthly)
     * @returns {Object} Earnings summary
     */
    async getEarningsSummary(userId, period = 'monthly') {
        try {
            if (!this.apiToken) {
                return {
                    success: false,
                    error: 'Bitlabs not configured',
                    summary: null
                };
            }

            // Placeholder - would typically aggregate from your database
            return {
                success: true,
                summary: {
                    period: period,
                    totalEarnings: 0,
                    completedGames: 0,
                    averageEarning: 0,
                    topCategory: null,
                    earningsByDay: []
                }
            };

        } catch (error) {
            console.error('Bitlabs get earnings summary error:', error.message);
            return {
                success: false,
                error: error.message,
                summary: null
            };
        }
    }
}

// Create singleton instance
const bitlabsGames = new BitlabsGamesSDK();

module.exports = bitlabsGames;


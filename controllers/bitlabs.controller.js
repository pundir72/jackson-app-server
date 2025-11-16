/**
 * Bitlabs Controller
 * Handles business logic for Bitlabs API integration
 * @module controllers/bitlabs
 */

const bitlabsService = require('../services/bitlabs.service');
const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

/**
 * Get available offers
 * @route GET /api/bitlabs/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} category - Category filter
 * @query {string} type - Offer type (game, survey, etc.)
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
    try {
        const queryParams = req.query;
        
        logger.info('Fetching Bitlabs offers', {
            userId: req.user?.id,
            queryParams
        });

        const data = await bitlabsService.getOffers(queryParams);

        res.json({
            success: true,
            data: data?.data || [],
            total: data?.total || 0,
            timestamp: data?.timestamp || new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Bitlabs offers', {
            error: error.message,
            userId: req.user?.id,
            queryParams: req.query
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch offers',
                code: 'BITLABS_OFFERS_ERROR'
            }
        });
    }
};

/**
 * Get game offers specifically
 * @route GET /api/bitlabs/game-offers
 * @query {string} platform - Platform filter
 * @query {string} country - Country code filter
 * @access Private (requires authentication)
 */
exports.getGameOffers = async (req, res) => {
    try {
        const queryParams = req.query;
        
        logger.info('Fetching Bitlabs game offers', {
            userId: req.user?.id,
            queryParams
        });

        const data = await bitlabsService.getGameOffers(queryParams);

        res.json({
            success: true,
            data: data?.data || [],
            total: data?.total || 0,
            timestamp: data?.timestamp || new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Bitlabs game offers', {
            error: error.message,
            userId: req.user?.id,
            queryParams: req.query
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch game offers',
                code: 'BITLABS_GAME_OFFERS_ERROR'
            }
        });
    }
};

/**
 * Health check
 * @route GET /api/bitlabs/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
    try {
        const health = await bitlabsService.healthCheck();
        
        res.json({
            success: true,
            data: health,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: {
                message: 'Health check failed',
                code: 'HEALTH_CHECK_ERROR'
            }
        });
    }
};


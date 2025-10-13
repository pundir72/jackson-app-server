/**
 * Besitos Controller
 * Handles business logic for Besitos API integration
 * @module controllers/besitos
 */

const besitosService = require('../services/besitos.service');
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
 * @route GET /api/besitos/offers
 * @query {string} platform - Platform filter (iOS, Android, etc.)
 * @query {string} country - Country code filter
 * @query {string} category - Category filter
 * @access Private (requires authentication)
 */
exports.getOffers = async (req, res) => {
    try {
        const queryParams = req.query;
        
        logger.info('Fetching Besitos offers', {
            userId: req.user?.id,
            queryParams
        });

        const data = await besitosService.getOffers(queryParams);

        res.json({
            success: true,
            data: data?.data || [],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos offers', {
            error: error.message,
            userId: req.user?.id,
            queryParams: req.query
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch offers',
                code: 'BESITOS_OFFERS_ERROR'
            }
        });
    }
};

/**
 * Get user data from Besitos
 * @route GET /api/besitos/user-data/:userId
 * @param {string} userId - User ID
 * @access Private (requires authentication)
 */
exports.getUserData = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate that user can only access their own data (unless admin)
        // if (req.user.id !== userId) {
        //     return res.status(403).json({
        //         success: false,
        //         error: {
        //             message: 'Unauthorized to access this user data',
        //             code: 'FORBIDDEN'
        //         }
        //     });
        // }

        logger.info('Fetching Besitos user data', {
            requesterId: req.user?.id,
            targetUserId: userId
        });

        const data = await besitosService.getUserData(userId);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos user data', {
            error: error.message,
            userId: req.params.userId
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch user data',
                code: 'BESITOS_USER_DATA_ERROR'
            }
        });
    }
};

/**
 * Get conversions data (Admin only)
 * @route GET /api/besitos/conversions
 * @query {string} from - Start date (YYYY-MM-DD)
 * @query {string} to - End date (YYYY-MM-DD)
 * @query {string} status - Conversion status filter
 * @access Private (Admin only)
 */
exports.getConversions = async (req, res) => {
    try {
        // Admin-only check
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Admin access required',
                    code: 'ADMIN_ONLY'
                }
            });
        }

        const queryParams = req.query;

        logger.info('Fetching Besitos conversions', {
            adminId: req.user?.id,
            queryParams
        });

        const data = await besitosService.getConversions(queryParams);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos conversions', {
            error: error.message,
            queryParams: req.query
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch conversions',
                code: 'BESITOS_CONVERSIONS_ERROR'
            }
        });
    }
};

/**
 * Get surveys wall for user
 * @route GET /api/besitos/surveys/:userId
 * @param {string} userId - User ID
 * @query {string} platform - Platform filter
 * @access Private (requires authentication)
 */
exports.getSurveysWall = async (req, res) => {
    try {
        const { userId } = req.params;
        const queryParams = req.query;

        // Validate that user can only access their own surveys (unless admin)
        if (req.user.id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Unauthorized to access this user surveys',
                    code: 'FORBIDDEN'
                }
            });
        }

        logger.info('Fetching Besitos surveys wall', {
            requesterId: req.user?.id,
            targetUserId: userId,
            queryParams
        });

        const data = await besitosService.getSurveysWall(userId, queryParams);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos surveys wall', {
            error: error.message,
            userId: req.params.userId
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch surveys',
                code: 'BESITOS_SURVEYS_ERROR'
            }
        });
    }
};

/**
 * Get user profiling questions
 * @route GET /api/besitos/user-profiling/:userId
 * @param {string} userId - User ID
 * @access Private (requires authentication)
 */
exports.getUserProfiling = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate that user can only access their own profiling (unless admin)
        if (req.user.id !== userId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: {
                    message: 'Unauthorized to access this user profiling',
                    code: 'FORBIDDEN'
                }
            });
        }

        logger.info('Fetching Besitos user profiling', {
            requesterId: req.user?.id,
            targetUserId: userId
        });

        const data = await besitosService.getUserProfiling(userId);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos user profiling', {
            error: error.message,
            userId: req.params.userId
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch user profiling',
                code: 'BESITOS_PROFILING_ERROR'
            }
        });
    }
};

/**
 * Get messenger/upcoming goals
 * @route GET /api/besitos/messenger
 * @access Private (requires authentication)
 */
exports.getMessenger = async (req, res) => {
    try {
        logger.info('Fetching Besitos messenger data', {
            userId: req.user?.id
        });

        const data = await besitosService.getMessenger(req.user?.id);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching Besitos messenger', {
            error: error.message,
            userId: req.user?.id
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to fetch messenger data',
                code: 'BESITOS_MESSENGER_ERROR'
            }
        });
    }
};

/**
 * Submit conversion/postback
 * @route POST /api/besitos/conversion
 * @body {Object} conversionData - Conversion data
 * @access Private (requires authentication)
 */
exports.submitConversion = async (req, res) => {
    try {
        const conversionData = {
            ...req.body,
            userId: req.user.id,
            timestamp: new Date().toISOString()
        };

        logger.info('Submitting Besitos conversion', {
            userId: req.user?.id,
            conversionData
        });

        const data = await besitosService.submitConversion(conversionData);

        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error submitting Besitos conversion', {
            error: error.message,
            userId: req.user?.id
        });

        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Failed to submit conversion',
                code: 'BESITOS_CONVERSION_ERROR'
            }
        });
    }
};

/**
 * Health check
 * @route GET /api/besitos/health
 * @access Public
 */
exports.healthCheck = async (req, res) => {
    try {
        const health = await besitosService.healthCheck();
        
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


/**
 * Shared ioredis client
 *
 * Single instance used across the app. Callers must handle the case where
 * Redis is unavailable (client === null) gracefully — security-critical paths
 * must REJECT the request when Redis is down, not degrade silently.
 */

const Redis = require('ioredis');
const config = require('../config/config');
const logger = require('./logger');

let client = null;
let isReady = false;

try {
    client = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 2,        // fail fast on individual commands
        enableOfflineQueue: false,      // throw immediately if not connected
        lazyConnect: false,
    });

    client.on('connect', () => {
        isReady = true;
        logger.info('Redis: connected');
    });

    client.on('ready', () => {
        isReady = true;
    });

    client.on('error', (err) => {
        isReady = false;
        logger.error('Redis error:', { message: err.message });
    });

    client.on('close', () => {
        isReady = false;
    });
} catch (err) {
    logger.error('Redis: failed to initialise client', { message: err.message });
    client = null;
}

module.exports = {
    get client() { return client; },
    get isReady() { return isReady && client !== null; },
};

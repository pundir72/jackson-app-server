const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

// Only create Redis client if explicitly enabled via environment variable
if (process.env.REDIS_ENABLED === 'true') {
  try {
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retry_strategy: function (options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          // End reconnecting on a specific error and flush all commands with a individual error
          return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          // End reconnecting after a specific timeout and flush all commands with a individual error
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          // End reconnecting with built in error
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      },
    });
  } catch (error) {
    logger.warn('Redis not available, running without caching:', error.message);
  }
} else {
  logger.info('Redis disabled via REDIS_ENABLED=false, running without caching');
}

if (redisClient) {
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis Client Error:', err);
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('end', () => {
    logger.info('Redis client disconnected');
  });
}

// Cache helper functions
const cache = {
  async get(key) {
    if (!redisClient) {
      logger.warn('Redis not available, cache.get() returning null');
      return null;
    }
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  async set(key, value, expireTime = 3600) {
    if (!redisClient) {
      logger.warn('Redis not available, cache.set() returning false');
      return false;
    }
    try {
      await redisClient.setEx(key, expireTime, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Redis set error:', error);
      return false;
    }
  },

  async del(key) {
    if (!redisClient) {
      logger.warn('Redis not available, cache.del() returning false');
      return false;
    }
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('Redis del error:', error);
      return false;
    }
  },

  async exists(key) {
    if (!redisClient) {
      logger.warn('Redis not available, cache.exists() returning false');
      return false;
    }
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  },

  async expire(key, seconds) {
    if (!redisClient) {
      logger.warn('Redis not available, cache.expire() returning false');
      return false;
    }
    try {
      await redisClient.expire(key, seconds);
      return true;
    } catch (error) {
      logger.error('Redis expire error:', error);
      return false;
    }
  },
};

module.exports = { redisClient, cache }; 
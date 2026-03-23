/**
 * Integrity Nonce Store — Redis-backed, single-use nonces for Play Integrity.
 *
 * Flow:
 *   1. Server issues nonce → stored in Redis with TTL.
 *   2. Client embeds nonce when calling Android Play Integrity API.
 *   3. Play Integrity API bakes the nonce into the signed token.
 *   4. Server verifies token → extracts nonce → calls consumeNonce().
 *   5. consumeNonce() atomically deletes the key; returns false if already used
 *      or never issued — preventing replay attacks.
 *
 * Key format:  integrity:nonce:<userId>:<nonceHex>
 * TTL:         INTEGRITY_NONCE_TTL_SECONDS (default 300 s / 5 min)
 */

const crypto = require('crypto');
const config = require('../config/config');
const { client: redis, isReady } = require('./redisClient');
const logger = require('./logger');

const TTL_SECONDS = parseInt(config.INTEGRITY_NONCE_TTL_SECONDS, 10) || 300;
const KEY_PREFIX = 'integrity:nonce';

/**
 * Build the Redis key for a nonce.
 * Scoping by userId prevents one user replaying another user's nonce.
 */
function buildKey(userId, nonce) {
    return `${KEY_PREFIX}:${userId}:${nonce}`;
}

/**
 * Issue a new single-use nonce for the given user.
 *
 * @param {string} userId
 * @returns {Promise<string>} hex-encoded 32-byte nonce
 * @throws {Error} if Redis is unavailable
 */
async function issueNonce(userId) {
    if (!isReady) {
        throw new Error('Nonce store unavailable: Redis not connected');
    }

    const nonce = crypto.randomBytes(32).toString('hex');
    const key = buildKey(userId, nonce);

    // SET key '1' EX ttl NX — only set if not already present (collision guard)
    const result = await redis.set(key, '1', 'EX', TTL_SECONDS, 'NX');
    if (result !== 'OK') {
        // Astronomically unlikely with 32 random bytes, but handle it safely
        throw new Error('Nonce collision — please retry');
    }

    logger.debug('Integrity nonce issued', { userId, ttl: TTL_SECONDS });
    return nonce;
}

/**
 * Consume a nonce — validates it was issued by us and deletes it atomically.
 * Returns false if nonce is unknown, expired, or already consumed (replay).
 *
 * @param {string} userId
 * @param {string} nonce   hex string as returned by issueNonce / extracted from token
 * @returns {Promise<boolean>}
 */
async function consumeNonce(userId, nonce) {
    if (!isReady) {
        throw new Error('Nonce store unavailable: Redis not connected');
    }

    if (!nonce || typeof nonce !== 'string' || nonce.length !== 64) {
        // A valid hex-encoded 32-byte nonce is exactly 64 hex characters
        return false;
    }

    const key = buildKey(userId, nonce);

    // DEL returns the number of keys deleted (0 = never existed / already consumed)
    const deleted = await redis.del(key);
    const valid = deleted === 1;

    if (!valid) {
        logger.warn('Integrity nonce rejected', { userId, reason: 'unknown or already consumed' });
    } else {
        logger.debug('Integrity nonce consumed', { userId });
    }

    return valid;
}

module.exports = { issueNonce, consumeNonce };

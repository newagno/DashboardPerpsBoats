/**
 * KeyValueStore — abstracts session/nonce storage.
 * Completely relies on Redis (ioredis) as a strict dependency.
 *
 * All values are stored as JSON strings with optional TTL (seconds).
 */
const logger = require('./logger');

let redisClient = null;

// ── Redis initialization ──────────────────────────────────────────────────────
async function initRedis() {
    if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is not defined.');
    }

    try {
        const Redis = require('ioredis');
        redisClient = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 5) return null; // stop retrying
                return Math.min(times * 200, 2000);
            },
            enableReadyCheck: true,
            connectTimeout: 5000,
            lazyConnect: true
        });

        await redisClient.connect();
        await redisClient.ping();
        logger.info('✅ Redis connected successfully');
        return true;
    } catch (err) {
        if (redisClient) {
            try { await redisClient.quit(); } catch(_) {}
        }
        redisClient = null;
        throw new Error(`Redis connection failed: ${err.message}`);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a value by key.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {
    if (!redisClient) {
        throw new Error('Redis client is not initialized.');
    }
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
}

/**
 * Set a value with optional TTL (in seconds).
 * @param {string} key
 * @param {any} value
 * @param {number|null} ttlSeconds
 */
async function set(key, value, ttlSeconds = null) {
    if (!redisClient) {
        throw new Error('Redis client is not initialized.');
    }
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
        await redisClient.setex(key, ttlSeconds, serialized);
    } else {
        await redisClient.set(key, serialized);
    }
}

/**
 * Delete a key.
 * @param {string} key
 */
async function del(key) {
    if (!redisClient) {
        throw new Error('Redis client is not initialized.');
    }
    await redisClient.del(key);
}

/**
 * Check if key exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
    if (!redisClient) {
        throw new Error('Redis client is not initialized.');
    }
    return (await redisClient.exists(key)) === 1;
}

module.exports = {
    initRedis,
    get,
    set,
    del,
    exists,
    getClient: () => redisClient
};

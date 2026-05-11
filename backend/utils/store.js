/**
 * KeyValueStore — abstracts session/nonce storage.
 * Uses Redis when REDIS_URL is configured, falls back to in-memory Map.
 *
 * All values are stored as JSON strings with optional TTL (seconds).
 */
const logger = require('./logger');

let redisClient = null;
let useRedis = false;

// ── Redis initialization ──────────────────────────────────────────────────────
async function initRedis() {
    if (!process.env.REDIS_URL) {
        logger.warn('REDIS_URL not set — using in-memory store (sessions will be lost on restart)');
        return false;
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
        useRedis = true;
        logger.info('✅ Redis connected successfully');
        return true;
    } catch (err) {
        logger.error('Redis connection failed, falling back to in-memory store:', err.message);
        if (redisClient) {
            try { await redisClient.quit(); } catch(_) {}
        }
        redisClient = null;
        useRedis = false;
        return false;
    }
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const memoryStore = new Map();
const memoryTTLs  = new Map();

function cleanExpired() {
    const now = Date.now();
    for (const [key, expiry] of memoryTTLs) {
        if (now > expiry) {
            memoryStore.delete(key);
            memoryTTLs.delete(key);
        }
    }
}
// Cleanup every 60 seconds
setInterval(cleanExpired, 60_000);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a value by key.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function get(key) {
    if (useRedis && redisClient) {
        try {
            const val = await redisClient.get(key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            logger.error(`Redis GET error for key=${key}:`, err.message);
            // Fallback to memory
            cleanExpired();
            const memVal = memoryStore.get(key);
            return memVal ? JSON.parse(memVal) : null;
        }
    }
    cleanExpired();
    const val = memoryStore.get(key);
    return val ? JSON.parse(val) : null;
}

/**
 * Set a value with optional TTL (in seconds).
 * @param {string} key
 * @param {any} value
 * @param {number|null} ttlSeconds
 */
async function set(key, value, ttlSeconds = null) {
    const serialized = JSON.stringify(value);

    if (useRedis && redisClient) {
        try {
            if (ttlSeconds) {
                await redisClient.setex(key, ttlSeconds, serialized);
            } else {
                await redisClient.set(key, serialized);
            }
            return;
        } catch (err) {
            logger.error(`Redis SET error for key=${key}:`, err.message);
            // Fallback to memory
        }
    }

    memoryStore.set(key, serialized);
    if (ttlSeconds) {
        memoryTTLs.set(key, Date.now() + ttlSeconds * 1000);
    }
}

/**
 * Delete a key.
 * @param {string} key
 */
async function del(key) {
    if (useRedis && redisClient) {
        try {
            await redisClient.del(key);
            return;
        } catch (err) {
            logger.error(`Redis DEL error for key=${key}:`, err.message);
        }
    }
    memoryStore.delete(key);
    memoryTTLs.delete(key);
}

/**
 * Check if key exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
    if (useRedis && redisClient) {
        try {
            return (await redisClient.exists(key)) === 1;
        } catch (err) {
            logger.error(`Redis EXISTS error for key=${key}:`, err.message);
        }
    }
    cleanExpired();
    return memoryStore.has(key);
}

module.exports = {
    initRedis,
    get,
    set,
    del,
    exists
};

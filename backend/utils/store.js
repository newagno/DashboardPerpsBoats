/**
 * KeyValueStore — abstracts session/nonce/history storage.
 * Optionally uses Redis if REDIS_URL is provided and works.
 * Falls back to an In-Memory Map cache to prevent server crashes.
 *
 * All values are stored as JSON strings with optional TTL (seconds).
 */
const logger = require('./logger');

let redisClient = null;

// In-Memory Fallback Cache
const memoryCache = new Map();

// ── Redis initialization ──────────────────────────────────────────────────────
async function initRedis() {
    const connectionUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.MY_REDIS_REDIS_URL;
    if (!connectionUrl) {
        logger.warn('REDIS_URL / KV_URL / MY_REDIS_REDIS_URL is not defined. Using In-Memory cache fallback.');
        return false;
    }

    try {
        const Redis = require('ioredis');
        redisClient = new Redis(connectionUrl, {
            maxRetriesPerRequest: 2,
            retryStrategy(times) {
                if (times > 3) return null; // stop retrying quickly
                return Math.min(times * 100, 1000);
            },
            enableReadyCheck: true,
            connectTimeout: 3000,
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
        logger.warn(`Redis connection failed: ${err.message}. Using In-Memory cache fallback.`);
        return false;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a value by key.
 */
async function get(key) {
    if (redisClient) {
        try {
            const val = await redisClient.get(key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            logger.error(`Redis GET error for key ${key}:`, err.message);
        }
    }
    
    // Fallback to memory
    const item = memoryCache.get(key);
    if (item) {
        if (item.expiresAt && Date.now() > item.expiresAt) {
            memoryCache.delete(key);
            return null;
        }
        return item.value;
    }
    return null;
}

/**
 * Set a value with optional TTL (in seconds).
 */
async function set(key, value, ttlSeconds = null) {
    const serialized = JSON.stringify(value);
    
    if (redisClient) {
        try {
            if (ttlSeconds) {
                await redisClient.setex(key, ttlSeconds, serialized);
            } else {
                await redisClient.set(key, serialized);
            }
            return;
        } catch (err) {
            logger.error(`Redis SET error for key ${key}:`, err.message);
        }
    }
    
    // Fallback to memory
    const expiresAt = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null;
    memoryCache.set(key, { value, expiresAt });
}

/**
 * Delete a key.
 */
async function del(key) {
    if (redisClient) {
        try {
            await redisClient.del(key);
        } catch (err) {
            logger.error(`Redis DEL error for key ${key}:`, err.message);
        }
    }
    memoryCache.delete(key);
}

/**
 * Check if key exists.
 */
async function exists(key) {
    if (redisClient) {
        try {
            return (await redisClient.exists(key)) === 1;
        } catch (err) {
            logger.error(`Redis EXISTS error for key ${key}:`, err.message);
        }
    }
    
    // Check memory
    if (memoryCache.has(key)) {
        const item = memoryCache.get(key);
        if (item.expiresAt && Date.now() > item.expiresAt) {
            memoryCache.delete(key);
            return false;
        }
        return true;
    }
    return false;
}

module.exports = {
    initRedis,
    get,
    set,
    del,
    exists,
    getClient: () => redisClient
};

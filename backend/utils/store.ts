import Redis from 'ioredis';

/**
 * KeyValueStore — abstracts session/nonce/history storage.
 * Optionally uses Redis if REDIS_URL is provided and works.
 * Falls back to an In-Memory Map cache to prevent server crashes.
 *
 * All values are stored as JSON strings with optional TTL (seconds).
 */
import logger from './logger';

let redisClient: Redis | null = (global as any).__redisClient || null;

// In-Memory Fallback Cache
const memoryCache = new Map();

// ── Redis initialization ──────────────────────────────────────────────────────
let _redisConnectedUrl: string | null = null;
let _redisError: string | null = null;

async function initRedis() {
    const connectionUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.MY_REDIS_REDIS_URL;
    if (!connectionUrl) {
        _redisError = 'No REDIS_URL / KV_URL / MY_REDIS_REDIS_URL env variable found';
        logger.warn(`[Redis] ${_redisError}. Using In-Memory cache fallback.`);
        return false;
    }

    if ((global as any).__redisClient) {
        logger.info('[Redis] Reusing existing connection from global pool.');
        redisClient = (global as any).__redisClient;
        return true;
    }

    // Mask password in logs
    const maskedUrl = connectionUrl.replace(/:([^@]+)@/, ':***@');
    logger.info(`[Redis] Attempting to connect: ${maskedUrl}`);

    try {
        
        redisClient = new Redis(connectionUrl, {
            maxRetriesPerRequest: 3,
            retryStrategy(times) {
                if (times > 3) return null; // stop retrying after 3 tries
                return Math.min(times * 100, 1000);
            },
            enableReadyCheck: true,
            connectTimeout: 2000,
            lazyConnect: true
        });

        await redisClient.connect();
        const pong = await redisClient.ping();
        _redisConnectedUrl = maskedUrl;
        _redisError = null;
        (global as any).__redisClient = redisClient;
        logger.info(`[Redis] ✅ Connected successfully. PING response: ${pong}`);
        
        // Graceful shutdown handlers for Vercel Serverless
        if (!(global as any).__redisShutdownRegistered) {
            const shutdown = async () => {
                if ((global as any).__redisClient) {
                    logger.info('[Redis] Gracefully closing Redis connection...');
                    try { await (global as any).__redisClient.quit(); } catch(e) {}
                    (global as any).__redisClient = null;
                    redisClient = null;
                }
            };
            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);
            (global as any).__redisShutdownRegistered = true;
        }

        return true;
    } catch (err: any) {
        _redisError = err.message;
        if (redisClient) {
            try { await redisClient.quit(); } catch (_) {}
        }
        redisClient = null;
        (global as any).__redisClient = null;
        logger.warn(`[Redis] ❌ Connection failed: ${err.message}. Falling back to In-Memory cache.`);
        return false;
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get a value by key.
 */
async function get(key: string) {
    if (redisClient) {
        try {
            const val = await redisClient.get(key);
            if (!val) return null;
            const parsed = JSON.parse(val);
            // Guard against serialized null (from old store.set(key, null))
            return parsed === null ? null : parsed;
        } catch (err: any) {
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
 * If value is null or undefined, the key is deleted instead.
 */
async function set(key: string, value: any, ttlSeconds: number | null = null) {
    if (value === null || value === undefined) {
        return del(key);
    }
    const serialized = JSON.stringify(value);
    
    if (redisClient) {
        try {
            if (ttlSeconds) {
                await redisClient.setex(key, ttlSeconds, serialized);
            } else {
                await redisClient.set(key, serialized);
            }
            return;
        } catch (err: any) {
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
async function del(key: string) {
    if (redisClient) {
        try {
            await redisClient.del(key);
        } catch (err: any) {
            logger.error(`Redis DEL error for key ${key}:`, err.message);
        }
    }
    memoryCache.delete(key);
}

/**
 * Check if key exists.
 */
async function exists(key: string) {
    if (redisClient) {
        try {
            return (await redisClient.exists(key)) === 1;
        } catch (err: any) {
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

export default {
    initRedis,
    get,
    set,
    del,
    exists,
    getClient: () => redisClient,
    getStatus: () => ({
        connected: redisClient !== null,
        url: _redisConnectedUrl,
        error: _redisError,
        mode: redisClient ? 'redis' : 'memory'
    })
};

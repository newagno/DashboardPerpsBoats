import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore, RedisReply } from 'rate-limit-redis';
import store from '../utils/store';

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' },
    store: new RedisStore({
        sendCommand: (...args: string[]): Promise<RedisReply> => {
            const client = store.getClient();
            if (client) {
                return client.call(args[0], ...args.slice(1)) as Promise<RedisReply>;
            }
            return Promise.reject(new Error('Redis not connected'));
        }
    })
});

export default apiLimiter;

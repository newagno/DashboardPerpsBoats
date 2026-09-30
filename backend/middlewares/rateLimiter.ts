import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { RedisStore, RedisReply } from 'rate-limit-redis';
import store from '../utils/store';

const memoryLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' }
});

const redisLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' },
    passOnStoreError: true, // Prevents 500 error if Redis goes down mid-flight
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

const apiLimiter = (req: Request, res: Response, next: NextFunction) => {
    if (store.getClient()) {
        redisLimiter(req, res, next);
    } else {
        memoryLimiter(req, res, next);
    }
};

export default apiLimiter;

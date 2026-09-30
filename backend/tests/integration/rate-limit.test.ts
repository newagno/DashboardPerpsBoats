jest.mock('rate-limit-redis', () => {
    return {
        RedisStore: require('express-rate-limit').MemoryStore
    };
});
import request from 'supertest';
import app from '../../server'; // we will require server.js

describe('Rate Limiter Tests', () => {
    it('Should return 429 when exceeding 60 requests per minute', async () => {
        // We might not want to make 61 requests in a test, but we can try to make enough 
        // to hit the limit, or mock the rate limiter. For a true integration test, we do the requests.
        // But doing 61 requests might be slow. Let's do it on a lightweight endpoint like health.
        let status = 200;
        let lastRes;
        for (let i = 0; i <= 61; i++) {
            // Note: health endpoint does NOT have rate limiter, only /api/exchanges/...
            // Let's use /api/exchanges/extended/stats which has apiLimiter
            lastRes = await request(app)
                .post('/api/exchanges/extended/stats')
                .set({ 'x-requested-with': 'TradeDash' })
                .send({ entryId: 'test' });
            
            if (lastRes.statusCode === 429) {
                status = 429;
                break;
            }
        }
        
        expect(status).toEqual(429);
        expect(lastRes!.body).toHaveProperty('error', 'Too many requests. Slow down.');
    }, 15000); // increase timeout
});

jest.mock('rate-limit-redis', () => {
    return {
        RedisStore: require('express-rate-limit').MemoryStore
    };
});
import request from 'supertest';
import app from '../../server'; // we will require server.js

describe('API Characterization Tests', () => {
    let csrfHeader = { 'x-requested-with': 'TradeDash' };

    it('GET /api/health should return 200 and basic info', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('redis');
    });

    it('GET /api/exchanges/state/get should return 200', async () => {
        const res = await request(app).get('/api/exchanges/state/get');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
        expect(res.body).toHaveProperty('exchanges');
        expect(Array.isArray(res.body.exchanges)).toBe(true);
    });

    it('POST /api/exchanges/state/save should require CSRF header', async () => {
        const res = await request(app)
            .post('/api/exchanges/state/save')
            .send({ activeExchanges: [] });
        
        expect(res.statusCode).toEqual(403);
        expect(res.body).toHaveProperty('error', 'CSRF validation failed');
    });

    it('POST /api/exchanges/state/save should return 200 with valid CSRF', async () => {
        const res = await request(app)
            .post('/api/exchanges/state/save')
            .set(csrfHeader)
            .send({ activeExchanges: [] });
        
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('success', true);
    });

    it('GET /api/exchanges/keys/check should validate query schema', async () => {
        const res = await request(app).get('/api/exchanges/keys/check');
        expect(res.statusCode).toEqual(400); // Because validation fails
    });

    it('GET /api/exchanges/keys/check should return 200 with valid query', async () => {
        const res = await request(app).get('/api/exchanges/keys/check?type=extended&entryId=123');
        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('exists');
    });
});

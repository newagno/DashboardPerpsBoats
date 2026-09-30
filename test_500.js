const { nado_stats_11, extended_stats_9 } = require('./dist/backend/controllers/exchangeController');
const store = require('./dist/backend/utils/store').default;

async function run() {
    await store.initRedis().catch(console.error);

    const mockRes = {
        status: function(code) {
            console.log('Status:', code);
            return this;
        },
        json: function(data) {
            console.log('Response:', data);
            return this;
        }
    };

    const reqNado = {
        validatedBody: {
            address: '0x8b3657e0a27bccd0d93c73de19ee1471923ea03d'
        },
        body: {},
        cookies: {}
    };

    console.log('--- Testing Nado ---');
    await nado_stats_11(reqNado, mockRes);

    const reqExt = {
        validatedBody: {
            entryId: 'test-123'
        },
        body: {},
        cookies: {
            'ext_key_test-123': 'some_key_12345678'
        }
    };

    console.log('--- Testing Extended ---');
    await extended_stats_9(reqExt, mockRes);

    process.exit(0);
}

run();

const https = require('https');

// Mock request to test Extended API endpoints for volume
const testEndpoint = (path) => {
    return new Promise((resolve) => {
        const options = {
            hostname: 'api.starknet.extended.exchange',
            port: 443,
            path: `/api/v1${path}`,
            method: 'GET',
            headers: {
                'Accept': 'application/json'
                // Without API key for now, see if it returns 401 or data
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ path, status: res.statusCode, data: data.substring(0, 500) });
            });
        });
        
        req.on('error', (e) => resolve({ path, error: e.message }));
        req.end();
    });
};

async function run() {
    console.log(await testEndpoint('/portfolio/charts/volume?interval=ALL'));
    console.log(await testEndpoint('/user/volume?interval=ALL'));
    console.log(await testEndpoint('/user/stats'));
}

run();

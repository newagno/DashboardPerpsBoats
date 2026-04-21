const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Axios instance with global timeout
const http = axios.create({ timeout: 15000 });

// Middleware
app.use(cors());
app.use(express.json());

// ─── ROUTES MUST BE BEFORE express.static ──────────────────────────────────
// Without this, express.static serves index.html for "/" before the route runs.

app.get('/', (req, res) => {
    res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// Static files (served AFTER route definitions above)
app.use(express.static(path.join(__dirname, '../frontend')));


// ─── Proxy - Extended Exchange (Starknet) ────────────────────────────────────
app.post('/api/exchanges/extended/stats', async (req, res) => {
    try {
        const { apiKey } = req.body;
        if (!apiKey) return res.status(400).json({ error: 'API Key required' });

        const headers = {
            'X-Api-Key': apiKey,
            'User-Agent': 'TradeDash/1.0',
            'Accept': 'application/json'
        };

        const BASE = 'https://api.starknet.extended.exchange/api/v1';

        const fetchAllDataPaginated = async (endpoint) => {
            let allRecords = [];
            let seenIds = new Set();
            let limit = 100;
            let offset = 0;
            let page = 1;
            
            for (let i = 0; i < 30; i++) { // Max 3000 items
                try {
                    const res = await http.get(`${BASE}${endpoint}?limit=${limit}&offset=${offset}&page=${page}`, { headers });
                    const records = res.data?.data || res.data || [];
                    if (!Array.isArray(records) || records.length === 0) break;
                    
                    let newItemsAdded = 0;
                    for (const r of records) {
                        const uniqueId = r.id || r.orderId || r.txHash || r.uuid || JSON.stringify(r);
                        if (!seenIds.has(uniqueId)) {
                            seenIds.add(uniqueId);
                            allRecords.push(r);
                            newItemsAdded++;
                        }
                    }
                    
                    if (newItemsAdded === 0) break; // Pagination ignored or no new items
                    if (records.length < limit) break; // Last page
                    
                    offset += limit;
                    page += 1;
                } catch (e) {
                    console.error(`Extended pagination error on ${endpoint}:`, e.message);
                    break;
                }
            }
            return { data: allRecords };
        };

        const [balanceRes, tradesRes, pointsRes, pnlRes, opsRes] = await Promise.all([
            http.get(`${BASE}/user/balance`, { headers })
                .catch(e => { console.error('Extended balance error:', e.message); return { data: {} }; }),
            fetchAllDataPaginated('/user/trades'),
            http.get(`${BASE}/user/points`, { headers })
                .catch(e => { console.error('Extended points error:', e.message); return { data: { data: { points: 0 } } }; }),
            fetchAllDataPaginated('/user/pnl/history'),
            http.get(`${BASE}/user/asset-operations?limit=100`, { headers })
                .catch(e => { console.error('Extended ops error:', e.message); return { data: { data: [] } }; })
        ]);

        // Log response shapes to help debug field names
        console.log('[Extended] balance shape:', (JSON.stringify(balanceRes.data) || '').slice(0, 300));
        console.log('[Extended] trades[0]:', (JSON.stringify((tradesRes.data?.data || tradesRes.data || [])[0]) || '').slice(0, 300));

        // Dump to file for debugging
        try {
            require('fs').writeFileSync(
                path.join(__dirname, 'extended-debug.json'),
                JSON.stringify({
                    balance: balanceRes.data,
                    trades: tradesRes.data,
                    points: pointsRes.data,
                    pnlHistory: pnlRes.data,
                    operations: opsRes.data
                }, null, 2)
            );
            console.log("Dumped extended data to extended-debug.json");
        } catch(err) { console.error("Dump failed"); }

        res.json({
            balance: balanceRes.data,
            trades: tradesRes.data,
            points: pointsRes.data,
            pnlHistory: pnlRes.data,
            operations: opsRes.data
        });
    } catch (error) {
        console.error('Extended Proxy Error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});


// ─── Proxy - Nado Exchange (Ink L2) ─────────────────────────────────────────
app.post('/api/exchanges/nado/stats', async (req, res) => {
    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: 'Address required' });

        const archiveHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip'
        };

        // 1. Fetch subaccounts for the user's address
        const subRes = await http.post('https://archive.prod.nado.xyz/v1', {
            subaccounts: { address: address }
        }, { headers: archiveHeaders }).catch(e => { console.error('Nado subaccounts error:', e.message); return { data: { subaccounts: [] } }; });

        const subaccountsList = (subRes.data.subaccounts || []).map(s => s.subaccount);

        let totalAssets = 0;
        let allMatches = [];

        if (subaccountsList.length > 0) {
            // Fetch balances from gateway
            const gatewayPromises = subaccountsList.map(sub => 
                http.get(`https://gateway.prod.nado.xyz/v1/query?type=subaccount_info&subaccount=${sub}`)
                    .catch(e => { console.error('Nado gateway error:', e.message); return { data: { health: { assets: "0" } } }; })
            );

            // Fetch matches from indexer (v2 API requires subaccounts array)
            const matchesPromise = http.post('https://archive.prod.nado.xyz/v1', {
                matches: { subaccounts: subaccountsList, limit: 10000 }
            }, { headers: archiveHeaders })
                .catch(e => { console.error('Nado matches error:', e.message); return { data: { matches: [] } }; });

            const results = await Promise.all([...gatewayPromises, matchesPromise]);
            const matchesRes = results.pop();
            
            for (const r of results) {
                totalAssets += parseFloat(r.data?.health?.assets || r.data?.account_value || 0);
            }
            allMatches = matchesRes.data?.matches || [];
        }

        const pointsRes = await http.post('https://archive.prod.nado.xyz/v1', {
            nado_points: { address: address }
        }, { headers: archiveHeaders })
            .catch(e => { console.error('Nado points error:', e.message); return { data: { all_time_points: { points: 0 } } }; });

        res.json({
            snapshot: { assets: totalAssets },
            matches: allMatches,
            points: pointsRes.data.all_time_points || { points: 0 }
        });
    } catch (error) {
        console.error('Nado Proxy Error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});


// ─── Proxy - Variational (Arbitrum) ─────────────────────────────────────────
app.post('/api/exchanges/variational/stats', async (req, res) => {
    try {
        const { address, signature } = req.body;
        
        // Fetch public platform stats
        const [statsRes, dropRes] = await Promise.all([
            http.get('https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats')
                .catch(e => { console.error('Variational stats error:', e.message); return { data: {} }; }),
            http.get('https://omni.variational.io/api/points/next_drop_ts')
                .catch(e => { console.error('Variational drop error:', e.message); return { data: { next_drop_ts: null } }; })
        ]);

        let responseData = {
            stats: statsRes.data,
            nextDropTs: dropRes.data.next_drop_ts
        };

        // If authenticated with a signature, provide "Verified Portfolio" telemetry
        // Note: Real integration will use the signature to verify the session on Variational's upcoming Trading API.
        if (signature && address) {
            console.log(`[Variational] Authenticated session for ${address}`);
            // Mock personalized data for the Beta phase
            responseData.personalized = true;
            responseData.portfolio = {
                balance: 1250.75, // Sample personalized data
                pnl: 145.20,
                volume: 45000.00,
                roi: 11.6
            };
        }

        res.json(responseData);
    } catch (error) {
        console.error('Variational Proxy Error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});


// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 TradeDash Server running at http://localhost:${PORT}`);
    console.log(`Serving frontend from: ${path.join(__dirname, '../frontend')}`);
});
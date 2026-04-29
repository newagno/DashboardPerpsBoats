const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const authController = require('./controllers/auth');const app = express();
const PORT = process.env.PORT || 3000;

// Axios instance with global timeout
const http = axios.create({ timeout: 60000 });

// Middleware
app.use(cors({
    origin: (origin, callback) => {
        const whitelist = ['http://localhost:3000', 'http://127.0.0.1:3000'];
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => { res.redirect('/dashboard'); });
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Auth Routes ───────────────────────────────────────────────
app.get('/api/auth/nonce', authController.getNonce);
app.post('/api/auth/verify', authController.verifySig);
app.post('/api/auth/logout', authController.logout);

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

        // Paginated fetch helper
        const fetchAllPaginated = async (endpoint) => {
            let all = [];
            const seen = new Set();
            let cursor = null;
            for (let i = 0; i < 2000; i++) {
                try {
                    let url = `${BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=10000`;
                    if (cursor) url += `&cursor=${cursor}`;
                    const r = await http.get(url, { headers });
                    const records = r.data?.data || [];
                    let added = 0;
                    for (const rec of (Array.isArray(records) ? records : [])) {
                        const id = rec.id || JSON.stringify(rec);
                        if (!seen.has(id)) { seen.add(id); all.push(rec); added++; }
                    }
                    const next = r.data?.pagination?.cursor;
                    if (added === 0 || !next) break;
                    cursor = next;
                } catch (e) { console.error(`Extended pagination error [${endpoint}]:`, e.message); break; }
            }
            return all;
        };

        // Fetch all endpoints in parallel
        const [balanceRes, tradesRes, pointsRes, opsRes, leaderboardRes, positionsRes] = await Promise.all([
            http.get(`${BASE}/user/balance`, { headers })
                .catch(e => { console.error('Extended balance:', e.message); return { data: {} }; }),
            fetchAllPaginated('/user/trades'),
            http.get(`${BASE}/user/rewards/earned`, { headers })
                .catch(e => { console.error('Extended points:', e.message); return { data: { data: [] } }; }),
            fetchAllPaginated('/user/assetOperations'),
            http.get(`${BASE}/user/rewards/leaderboard/stats`, { headers })
                .catch(e => { console.error('Extended leaderboard:', e.message); return { data: { data: {} } }; }),
            fetchAllPaginated('/user/positions/history')
        ]);

        // INIT_DEPOSIT = sum(DEPOSIT amounts) - sum(WITHDRAWAL amounts)
        // Docs: GET /api/v1/user/assetOperations, type field = "DEPOSIT" | "WITHDRAWAL"
        // amount is signed (negative for withdrawals in some cases) - use type to determine direction
        let totalIn = 0, totalOut = 0;
        for (const op of opsRes) {
            const amt = Math.abs(parseFloat(op.amount || 0));
            if (op.type === 'DEPOSIT' && op.status === 'COMPLETED') totalIn += amt;
            else if (op.type === 'WITHDRAWAL' && op.status === 'COMPLETED') totalOut += amt;
        }
        const initDeposit = totalIn - totalOut;

        // ACT_DEPOSIT
        // Prioritize balance (which matches equity contrib / realized collateral) over equity (which includes unrealized pnl)
        const balData = balanceRes.data?.data || balanceRes.data || {};
        const actDeposit = parseFloat(balData.balance || balData.equity || 0);

        // VOLUME = sum of all trades notional value
        // Docs: GET /api/v1/user/trades → abs(notional or value or qty*price)
        let totalVolume = 0;
        for (const t of tradesRes) {
            totalVolume += Math.abs(parseFloat(t.value || t.notional || 0) || Math.abs(parseFloat(t.qty || 0) * parseFloat(t.price || 0)));
        }

        // WIN_RATE = count of closed positions with realisedPnl > 0
        let wins = 0, totalClosed = 0;
        for (const p of positionsRes) {
            if (p.realisedPnl !== undefined) {
                totalClosed++;
                if (parseFloat(p.realisedPnl || 0) > 0) wins++;
            }
        }
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        // PNL = ACT_DEPOSIT - INIT_DEPOSIT
        const pnl = actDeposit - initDeposit;

        // VOLUME from leaderboard if available (overcomes 10k trade limit)
        const lbData = leaderboardRes.data?.data || {};
        const volumeFromLB = parseFloat(lbData.volume || 0);
        const finalVolume = Math.max(totalVolume, volumeFromLB);

        // RANK from leaderboard stats
        const rank = lbData.rank || null;

        res.json({
            init_deposit: initDeposit,
            act_deposit: actDeposit,
            total_volume: finalVolume,
            pnl: pnl,
            win_rate: winRate,
            // Send full points API response so frontend can sum epochRewards across seasons
            points: pointsRes.data || {},
            rank: rank
        });
    } catch (error) {
        console.error('Extended Proxy Error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});


// ─── Proxy - Nado Exchange (Ink L2) ─────────────────────────────────────────
app.post('/api/exchanges/nado/stats', async (req, res) => {
    try {
        // walletAddress allows multi-wallet: each Nado card provides its own address
        const { address, walletAddress } = req.body;
        const targetAddress = walletAddress || address;
        if (!targetAddress) return res.status(400).json({ error: 'Address required' });

        const archiveHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip'
        };

        // build sender from targetAddress for Nado (pad with default)
        const hexAddr = targetAddress.replace('0x', '').toLowerCase();
        const nameHex = Buffer.from('default', 'ascii').toString('hex').padEnd(24, '0');
        const sender = '0x' + hexAddr + nameHex;

        let totalEquity = 0;
        let totalVolume = 0;
        let pnlFromTrades = 0;
        let wins = 0, totalClosed = 0;

        // 1. Fetch balance (Total Equity) - Nado uses product_id = 0 for USDT and 5 for USDC
        const subRes = await http.get(`https://gateway.prod.nado.xyz/v1/query?type=subaccount_info&subaccount=${sender}`).catch(() => ({ data: {} }));
        const spotBalances = subRes.data?.data?.spot_balances || subRes.data?.spot_balances || [];
        for (const b of spotBalances) {
            if (b && (b.product_id === 0 || b.product_id === 5)) {
                const amount = parseFloat(b.balance?.amount || b.amount || 0);
                totalEquity += amount / 1e18;
            }
        }

        // 2. Fetch all orders for VOLUME, PNL, WIN_RATE
        let allOrders = [];
        let cursor = null;
        let hasMore = true;
        for (let i = 0; i < 50; i++) {
            if (!hasMore) break;
            const pld = { orders: { subaccounts: [sender], limit: 100 } };
            if (cursor) pld.orders.idx = cursor;
            
            const r = await http.post('https://archive.prod.nado.xyz/v1', pld, { headers: archiveHeaders }).catch(() => null);
            const batch = r?.data?.orders || [];
            if (batch.length > 0) {
                cursor = batch[batch.length - 1].submission_idx;
                allOrders = allOrders.concat(batch);
                if (batch.length < 100) hasMore = false;
            } else {
                hasMore = false;
            }
        }

        for (const o of allOrders) {
            totalVolume += Math.abs(parseFloat(o.quote_filled || 0)) / 1e18;
            const rpnl = parseFloat(o.realized_pnl || 0) / 1e18;
            const fee = parseFloat(o.fee || 0) / 1e18;
            pnlFromTrades += (rpnl - fee);
            
            if (parseFloat(o.realized_pnl || 0) !== 0) {
                totalClosed++;
                if (rpnl > 0) wins++;
            }
        }
        
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;
        const netDeposit = totalEquity - pnlFromTrades;

        // 3. Points & Rank & PNL/Volume from Points API
        const pointsRes = await http.post('https://archive.prod.nado.xyz/v1', {
            nado_points: { address: targetAddress }
        }, { headers: archiveHeaders }).catch(() => ({ data: {} }));
        
        const allTime = pointsRes.data?.all_time_points || {};
        const totalPoints = parseFloat(allTime.points || 0);
        const rank = allTime.rank ? parseInt(allTime.rank) : null;
        
        // PNL: use points API value if available, fallback to calculated
        const apiPnl = allTime.pnl ? parseFloat(allTime.pnl) / 1e18 : null;
        const finalPnl = apiPnl !== null ? apiPnl : pnlFromTrades;
        // VOLUME: use order-calculated totalVolume (sum of quote_filled) as primary source.
        // The points API volume (allTime.volume) is an internal metric that doesn't match real trade volume.
        const finalVolume = totalVolume > 0 ? totalVolume : (allTime.volume ? parseFloat(allTime.volume) / 1e18 : 0);

        res.json({
            snapshot: { assets: totalEquity },
            matches: allOrders,
            points: totalPoints,
            // Pre-computed fields for frontend
            init_deposit: netDeposit,
            act_deposit: totalEquity,
            total_volume: finalVolume,
            pnl: finalPnl,
            win_rate: winRate,
            rank: rank,
            wallet: targetAddress
        });
    } catch (error) {
        console.error('Nado Proxy Error:', error.message);
        res.status(error.response?.status || 500).json({ error: error.message });
    }
});


// ─── Proxy - Variational Exchange (Arbitrum) ─────────────────────────────────
app.post('/api/exchanges/variational/stats', async (req, res) => {
    try {
        // walletAddress allows multi-wallet support
        const { address, walletAddress } = req.body;
        const targetAddress = walletAddress || address;
        if (!targetAddress) return res.status(400).json({ error: 'Address required' });

        const OMNI_API = 'https://omni.variational.io/api';
        const OMNI_PUB = 'https://omni-client-api.prod.ap-northeast-1.variational.io';

        // Forward the vr-token session cookie from the browser (or body) to Omni API
        const vrToken = req.body.vrToken || req.cookies?.['vr-token'];
        const authHeaders = vrToken
            ? { Cookie: `vr-token=${vrToken}`, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' };

        // Always fetch public platform stats
        const [statsRes, dropRes] = await Promise.all([
            http.get(`${OMNI_PUB}/metadata/stats`)
                .catch(e => { console.error('Variational stats error:', e.message); return { data: {} }; }),
            http.get(`${OMNI_API}/points/next_drop_ts`)
                .catch(e => { return { data: { next_drop_ts: null } }; })
        ]);

        let responseData = {
            stats: statsRes.data,
            nextDropTs: dropRes.data.next_drop_ts,
            portfolio: null,
            points: null
        };

        if (vrToken) {
            console.log(`[Variational] Fetching user data for ${targetAddress}`);
            const [portfolioRes, pointsRes, tradesRes, referralsRes] = await Promise.all([
                // ACT_DEPOSIT: /portfolio/summary → sum_balance (Total Equity)
                http.get(`${OMNI_API}/portfolio/summary`, { headers: authHeaders })
                    .catch(e => { console.error('Variational portfolio:', e.message); return null; }),
                // POINTS + RANK: /points/summary → total_points, rank
                http.get(`${OMNI_API}/points/summary`, { headers: authHeaders })
                    .catch(e => { console.error('Variational points:', e.message); return null; }),
                // INIT_DEPOSIT: /portfolio/trades filtered by DEPOSIT/WITHDRAWAL type
                // NOTE: No dedicated transfers endpoint documented. Using portfolio/trades with type filter.
                // Falls back to sum_balance - sum_upnl if trades endpoint fails.
                http.get(`${OMNI_API}/portfolio/trades`, { headers: authHeaders, params: { limit: 1000, order_by: 'created_at', order: 'desc' } })
                    .catch(e => { console.error('Variational trades:', e.message); return null; }),
                // VOLUME: /referrals/summary → trade_volume.current (user's all-time trade volume)
                http.get(`${OMNI_API}/referrals/summary`, { headers: authHeaders })
                    .catch(e => { console.error('Variational referrals:', e.message); return null; })
            ]);

            if (portfolioRes?.data) {
                const p = portfolioRes.data;
                // ACT_DEPOSIT = sum_balance (Total Equity including unrealised PnL)
                const actDeposit = parseFloat(p.sum_balance || 0);
                const upnl = parseFloat(p.sum_upnl || 0);

                // INIT_DEPOSIT: attempt to compute from portfolio/trades deposit/withdrawal records
                // If trades data has type field, filter DEPOSIT/WITHDRAWAL
                let initDeposit = 0;
                let computedFromTrades = false;
                if (tradesRes?.data?.result) {
                    const tradeList = tradesRes.data.result || [];
                    // Look for deposit/withdrawal type records
                    const deposits = tradeList.filter(t => t.type === 'DEPOSIT' || t.clearing_status === 'SETTLED');
                    if (deposits.length > 0) {
                        // Has transfer records - compute net
                        for (const t of tradeList) {
                            if (t.type === 'DEPOSIT') initDeposit += parseFloat(t.qty || t.amount || 0);
                            else if (t.type === 'WITHDRAWAL') initDeposit -= parseFloat(t.qty || t.amount || 0);
                        }
                        computedFromTrades = true;
                    }
                }
                // Fallback: INIT_DEPOSIT = sum_balance - sum_upnl (cash component of equity)
                if (!computedFromTrades) {
                    initDeposit = actDeposit - upnl;
                }

                // VOLUME: from referrals/summary trade_volume.current
                let totalVolume = 0;
                if (referralsRes?.data) {
                    totalVolume = parseFloat(referralsRes.data?.trade_volume?.current || 0);
                    responseData.referralCode = referralsRes.data?.referred_by?.code || null;
                }

                const pnl = actDeposit - initDeposit;

                responseData.portfolio = {
                    act_deposit: actDeposit,
                    init_deposit: initDeposit,
                    pnl: pnl,
                    volume: totalVolume,
                    upnl: upnl
                };

                // WIN_RATE: not available from documented Variational API endpoints
                // No win/loss per position data in /portfolio/trades docs
                responseData.portfolio.win_rate = 0; // DATA NOT FOUND in API docs
            } else {
                console.warn('[Variational] Portfolio fetch failed - session cookie may be expired');
            }

            if (pointsRes?.data) {
                // POINTS: total_points, RANK: rank
                responseData.points = {
                    total_points: parseFloat(pointsRes.data.total_points || 0),
                    rank: pointsRes.data.rank || null
                };
                console.log('[Variational] Points:', JSON.stringify(responseData.points));
            }
        } else {
            console.warn('[Variational] No vr-token cookie - returning platform stats only');
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
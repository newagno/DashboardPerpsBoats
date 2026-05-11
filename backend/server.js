const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const store = require('./utils/store');
const { validate, schemas } = require('./utils/validation');
const authController = require('./controllers/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Initialize Redis (async, non-blocking) ──────────────────────────────────
store.initRedis().catch(err => logger.error('Redis init failed:', err));

// Axios instance with global timeout (reduced for Vercel)
const http = axios.create({ timeout: isProd ? 9000 : 60000 });

// ── Security Headers ────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https://*.walletconnect.com", "https://*.walletconnect.org",
                          "wss://*.walletconnect.com", "wss://*.walletconnect.org",
                          "https://rpc.walletconnect.com", "https://pulse.walletconnect.com",
                          "https://api.web3modal.com", "https://api.web3modal.org"],
            frameSrc: ["'self'", "https://verify.walletconnect.com", "https://verify.walletconnect.org",
                       "https://secure.walletconnect.com", "https://secure.walletconnect.org"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// ── CORS (environment-aware) ────────────────────────────────────────────────
app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = isProd
            ? [
                'https://dashboard-perps.vercel.app',
                'https://dashboard-perps-aiunch7i4-newagnos-projects-d51e8127.vercel.app'
              ]
            : [
                'http://localhost:3000', 'http://127.0.0.1:3000',
                'http://localhost:5000', 'http://127.0.0.1:5000',
                'https://tradedash-local.com',
                'https://dashboard-perps.vercel.app',
                'https://dashboard-perps-aiunch7i4-newagnos-projects-d51e8127.vercel.app'
              ];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            logger.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// ── Rate Limiting ───────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,                   // 30 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' }
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,  // 1 minute
    max: 60,                   // 60 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down.' }
});

// ── CSRF Protection (custom header check for API routes) ────────────────────
const csrfProtect = (req, res, next) => {
    // Only enforce on state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const xRequestedWith = req.headers['x-requested-with'];
        if (xRequestedWith !== 'TradeDash') {
            return res.status(403).json({ error: 'CSRF validation failed' });
        }
    }
    next();
};

// ── Static routes ───────────────────────────────────────────────────────────
app.get('/', (req, res) => { res.redirect('/dashboard'); });
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});
app.use(express.static(path.join(__dirname, '../public')));

// ─── Auth Routes ───────────────────────────────────────────────
app.get('/api/auth/nonce', authLimiter, validate(schemas.nonceQuerySchema, 'query'), authController.getNonce);
app.post('/api/auth/verify', authLimiter, csrfProtect, validate(schemas.verifyBodySchema, 'body'), authController.verifySig);
app.post('/api/auth/logout', csrfProtect, authController.logout);

// ─── Auth Check (lightweight session ping) ─────────────────────────────────
// Used by frontend on page load. Returns session info without requiring headers.
app.get('/api/auth/check', async (req, res) => {
    const sessionId = req.cookies?.tradedash_auth;
    if (!sessionId) return res.json({ authenticated: false, address: null });
    const session = await require('./utils/store').get('session:' + sessionId);
    if (!session) {
        res.clearCookie('tradedash_auth');
        return res.json({ authenticated: false, address: null });
    }
    res.json({ authenticated: true, address: session.address });
});

// ─── Secure Key Store (HttpOnly Cookies) ───────────────────────────────────
// This approach is secure against XSS and works perfectly on Vercel without Redis.
app.post('/api/exchanges/keys/store', csrfProtect, validate(schemas.storeKeySchema, 'body'), (req, res) => {
    const { type, entryId, value } = req.validatedBody;
    const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;

    res.cookie(cookieName, value, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'strict' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/'
    });

    logger.info(`Stored ${type} key for entry ${entryId} securely in cookie`);
    res.json({ success: true });
});

// ─── Check if a key exists in Cookies ──────────────────────────────────────
app.get('/api/exchanges/keys/check', (req, res) => {
    const { type, entryId } = req.query;
    if (!type || !entryId) return res.status(400).json({ error: 'Missing type or entryId' });
    const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;
    res.json({ exists: !!req.cookies[cookieName] });
});

app.post('/api/exchanges/keys/remove', csrfProtect, (req, res) => {
    const { type, entryId } = req.body;
    if (!type || !entryId) return res.status(400).json({ error: 'Missing type or entryId' });
    const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;
    res.clearCookie(cookieName);
    logger.info(`Removed ${type} key for entry ${entryId} from cookies`);
    res.json({ success: true });
});

// ─── Proxy - Extended Exchange (Starknet) ────────────────────────────────────
app.post('/api/exchanges/extended/stats', apiLimiter, csrfProtect, async (req, res) => {
    const errors = [];
    try {
        // Look up API key from HttpOnly Cookie using entryId
        const entryId = req.body.entryId;
        if (!entryId) return res.status(400).json({ error: 'entryId required' });
        
        const apiKey = req.cookies[`ext_key_${entryId}`];
        if (!apiKey) return res.status(404).json({ error: 'API Key not found in vault. Please re-add this exchange.' });

        const headers = {
            'X-Api-Key': apiKey,
            'User-Agent': 'TradeDash/1.0',
            'Accept': 'application/json'
        };

        const BASE = 'https://api.starknet.extended.exchange/api/v1';

        // Paginated fetch helper - optimized for Serverless (time-budgeted)
        const fetchStartTime = Date.now();
        const fetchAllPaginated = async (endpoint) => {
            let all = [];
            const seen = new Set();
            let cursor = null;
            const maxTime = isProd ? 7000 : 55000;
            for (let i = 0; i < 100; i++) {
                if (Date.now() - fetchStartTime > maxTime) {
                    errors.push(`${endpoint}: time budget exceeded after ${all.length} records`);
                    break;
                }
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
                } catch (e) { errors.push(`${endpoint}: ${e.message}`); logger.error(`Extended pagination error [${endpoint}]:`, e.message); break; }
            }
            return all;
        };

        // Fetch all endpoints in parallel
        const [balanceRes, tradesRes, pointsRes, opsRes, leaderboardRes, positionsRes, ordersHistRes] = await Promise.all([
            http.get(`${BASE}/user/balance`, { headers })
                .catch(e => { errors.push(`balance: ${e.message}`); logger.error('Extended balance error:', e.message); return { data: {} }; }),
            fetchAllPaginated('/user/trades')
                .catch(e => { errors.push(`trades: ${e.message}`); logger.error('Extended trades error:', e.message); return []; }),
            http.get(`${BASE}/user/rewards/earned`, { headers })
                .catch(e => { errors.push(`points: ${e.message}`); logger.error('Extended points error:', e.message); return { data: { data: [] } }; }),
            fetchAllPaginated('/user/assetOperations')
                .catch(e => { errors.push(`ops: ${e.message}`); logger.error('Extended ops error:', e.message); return []; }),
            http.get(`${BASE}/user/rewards/leaderboard/stats`, { headers })
                .catch(e => { errors.push(`leaderboard: ${e.message}`); logger.error('Extended leaderboard error:', e.message); return { data: { data: {} } }; }),
            fetchAllPaginated('/user/positions/history')
                .catch(e => { errors.push(`positions: ${e.message}`); logger.error('Extended positions error:', e.message); return []; }),
            // Also fetch filled orders history — trades endpoint may miss some fills
            fetchAllPaginated('/user/orders/history')
                .catch(e => { errors.push(`orders: ${e.message}`); logger.error('Extended orders hist error:', e.message); return []; })
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

        // VOLUME method 1: sum of all trades notional value
        // Docs: GET /api/v1/user/trades → value = actual filled absolute nominal value
        let volumeFromTrades = 0;
        for (const t of tradesRes) {
            const val = Math.abs(parseFloat(t.value) || 0);
            if (val !== 0) {
                volumeFromTrades += val;
            } else {
                // Fallback: qty * price
                volumeFromTrades += Math.abs((parseFloat(t.qty) || 0) * (parseFloat(t.price) || 0));
            }
        }

        // VOLUME method 2: sum from filled orders history (filledQty * averagePrice)
        // This catches orders the trades endpoint may not return
        let volumeFromOrders = 0;
        for (const o of ordersHistRes) {
            if (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED') {
                const fq = Math.abs(parseFloat(o.filledQty) || 0);
                const ap = Math.abs(parseFloat(o.averagePrice) || 0);
                if (fq > 0 && ap > 0) {
                    volumeFromOrders += fq * ap;
                }
            }
        }

        // Use whichever source gives the higher (more complete) volume
        const finalVolume = Math.max(volumeFromTrades, volumeFromOrders);

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

        logger.info(`[Extended] Trades: ${tradesRes.length}, Volume(trades): $${(volumeFromTrades || 0).toFixed(2)}, Orders: ${ordersHistRes.length}, Volume(orders): $${(volumeFromOrders || 0).toFixed(2)}, Final: $${(finalVolume || 0).toFixed(2)}`);

        // RANK from leaderboard stats
        const lbData = leaderboardRes.data?.data || {};
        const rank = lbData.rank || null;

        res.json({
            init_deposit: initDeposit,
            act_deposit: actDeposit,
            total_volume: finalVolume,
            pnl: pnl,
            win_rate: winRate,
            // Send full points API response so frontend can sum epochRewards across seasons
            points: pointsRes.data || {},
            rank: rank,
            partial_success: errors.length > 0 ? true : undefined,
            warnings: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        logger.error('Extended Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Extended exchange data. Please try again.' });
    }
});


// ─── Proxy - Nado Exchange (Ink L2) ─────────────────────────────────────────
app.post('/api/exchanges/nado/stats', apiLimiter, csrfProtect, async (req, res) => {
    try {
        // walletAddress allows multi-wallet: each Nado card provides its own address
        const { address, walletAddress } = req.body;
        const targetAddress = walletAddress || address;
        if (!targetAddress) return res.status(400).json({ error: 'Address required' });

        const archiveHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // build sender from targetAddress for Nado (pad with default)
        const hexAddr = targetAddress.replace('0x', '').toLowerCase();
        const nameHex = Buffer.from('default', 'ascii').toString('hex').padEnd(24, '0');
        const sender = '0x' + hexAddr + nameHex;

        let totalEquity = 0;
        let pnlFromTrades = 0;
        let wins = 0, totalClosed = 0;

        // 1. Fetch balance (Total Equity)
        const subRes = await http.get(`https://gateway.prod.nado.xyz/v1/query?type=subaccount_info&subaccount=${sender}`).catch(() => ({ data: {} }));
        const spotBalances = subRes.data?.data?.spot_balances || subRes.data?.spot_balances || [];
        for (const b of spotBalances) {
            if (b && (b.product_id === 0 || b.product_id === 5)) {
                totalEquity += parseFloat(b.balance?.amount || b.amount || 0) / 1e18;
            }
        }

        // 2. Snapshot (active:false) => VOLUME (sum quote_volume_cumulative per product) + INIT_DEPOSIT fallback
        const snapRes = await http.post('https://archive.prod.nado.xyz/v1', {
            account_snapshots: { subaccounts: [sender], timestamps: [Date.now() * 1000000], active: false }
        }, { headers: archiveHeaders }).catch(() => ({ data: {} }));

        let totalVolumeFromSnap = 0, initDepositFromSnap = 0;
        const snapData = snapRes.data?.snapshots?.[sender];
        if (snapData) {
            const arr = snapData[Object.keys(snapData)[0]] || [];
            for (const item of arr) {
                if (item.product_id !== 0) totalVolumeFromSnap += parseFloat(item.quote_volume_cumulative || 0) / 1e18;
                else initDepositFromSnap = parseFloat(item.net_entry_cumulative || 0) / 1e18;
            }
        }

        // 3. INIT_DEPOSIT via collateral events (delta = post - pre spot balance)
        //    No product_id filter — captures both USDT0 (id:0) and USDC (id:5) deposits
        const evRes = await http.post('https://archive.prod.nado.xyz/v1', {
            events: { subaccounts: [sender], event_types: ['deposit_collateral', 'withdraw_collateral', 'transfer_quote'], limit: { raw: 500 } }
        }, { headers: archiveHeaders }).catch(() => ({ data: {} }));

        let initDepositFromEvents = 0;
        const evts = evRes.data?.events || [];
        for (const ev of evts) {
            const pre  = BigInt(ev.pre_balance?.spot?.balance?.amount  || 0);
            const post = BigInt(ev.post_balance?.spot?.balance?.amount || 0);
            initDepositFromEvents += Number(post - pre) / 1e18;
        }
        const initDeposit = evts.length > 0 ? initDepositFromEvents : initDepositFromSnap;

        // 4. Orders for PNL + WIN_RATE
        let allOrders = [], cursor = null, hasMore = true;
        const startTime = Date.now();
        for (let i = 0; i < 200; i++) {
            if (!hasMore || (Date.now() - startTime > 8000)) break;
            const pld = { orders: { subaccounts: [sender], limit: 100 } };
            if (cursor) pld.orders.idx = cursor;
            const r = await http.post('https://archive.prod.nado.xyz/v1', pld, { headers: archiveHeaders }).catch(() => null);
            const batch = r?.data?.orders || [];
            if (batch.length > 0) { cursor = batch[batch.length-1].submission_idx; allOrders = allOrders.concat(batch); if (batch.length < 100) hasMore = false; }
            else hasMore = false;
        }

        for (const o of allOrders) {
            const rpnl = (parseFloat(o.realized_pnl) || 0) / 1e18;
            const fee  = (parseFloat(o.fee) || 0) / 1e18;
            pnlFromTrades += (rpnl - fee);
            // Only count actual trades (product_id 0 = USDT0 collateral movements, not trades)
            if (o.product_id !== 0 && (parseFloat(o.realized_pnl) || 0) !== 0) {
                totalClosed++;
                if (rpnl > 0) wins++;
            }
        }
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        // 5. Points & Rank
        const pointsRes = await http.post('https://archive.prod.nado.xyz/v1', {
            nado_points: { address: targetAddress }
        }, { headers: archiveHeaders }).catch(() => ({ data: {} }));
        const allTime = pointsRes.data?.all_time_points || {};
        const totalPoints = parseFloat(allTime.points || 0);
        const rank = allTime.rank ? parseInt(allTime.rank) : null;

        const finalVolume = totalVolumeFromSnap;
        const finalPnl    = pnlFromTrades;

        logger.info('[Nado] SnapVol: $' + totalVolumeFromSnap.toFixed(2) + ', Orders: ' + allOrders.length + ', InitDep(events,' + evts.length + '): $' + initDepositFromEvents.toFixed(2) + ', InitDep(snap): $' + initDepositFromSnap.toFixed(2) + ', Used: $' + initDeposit.toFixed(2));

        res.json({
            snapshot: { assets: totalEquity },
            matches: allOrders,
            points: totalPoints,
            init_deposit: initDeposit,
            act_deposit: totalEquity,
            total_volume: finalVolume,
            pnl: finalPnl,
            win_rate: winRate,
            rank: rank,
            wallet: targetAddress
        });
    } catch (error) {
        logger.error('Nado Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Nado exchange data. Please try again.' });
    }
});


// ─── Proxy - Variational Exchange (Arbitrum) ─────────────────────────────────
app.post('/api/exchanges/variational/stats', apiLimiter, csrfProtect, async (req, res) => {
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
                .catch(e => { logger.error('Variational stats error:', e.message); return { data: {} }; }),
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
            logger.info(`[Variational] Fetching user data for ${logger.maskAddress(targetAddress)}`);
            const [portfolioRes, pointsRes, tradesRes, referralsRes] = await Promise.all([
                // ACT_DEPOSIT: /portfolio/summary → sum_balance (Total Equity)
                http.get(`${OMNI_API}/portfolio/summary`, { headers: authHeaders })
                    .catch(e => { logger.error('Variational portfolio:', e.message); return null; }),
                // POINTS + RANK: /points/summary → total_points, rank
                http.get(`${OMNI_API}/points/summary`, { headers: authHeaders })
                    .catch(e => { logger.error('Variational points:', e.message); return null; }),
                // INIT_DEPOSIT: /portfolio/trades filtered by DEPOSIT/WITHDRAWAL type
                // NOTE: No dedicated transfers endpoint documented. Using portfolio/trades with type filter.
                // Falls back to sum_balance - sum_upnl if trades endpoint fails.
                http.get(`${OMNI_API}/portfolio/trades`, { headers: authHeaders, params: { limit: 1000, order_by: 'created_at', order: 'desc' } })
                    .catch(e => { logger.error('Variational trades:', e.message); return null; }),
                // VOLUME: /referrals/summary → trade_volume.current (user's all-time trade volume)
                http.get(`${OMNI_API}/referrals/summary`, { headers: authHeaders })
                    .catch(e => { logger.error('Variational referrals:', e.message); return null; })
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
                logger.warn('[Variational] Portfolio fetch failed - session cookie may be expired');
            }

            if (pointsRes?.data) {
                // POINTS: total_points, RANK: rank
                responseData.points = {
                    total_points: parseFloat(pointsRes.data.total_points || 0),
                    rank: pointsRes.data.rank || null
                };
                logger.info('[Variational] Points:', JSON.stringify(responseData.points));
            }
        } else {
            logger.warn('[Variational] No vr-token cookie - returning platform stats only');
        }

        res.json(responseData);
    } catch (error) {
        logger.error('Variational Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Variational exchange data. Please try again.' });
    }
});


// Start Server (only listen if not running as a Vercel serverless function)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info(`🚀 TradeDash Server running at http://localhost:${PORT}`);
        logger.info(`Serving frontend from: ${path.join(__dirname, '../public')}`);
    });
}

// Export for Vercel serverless
module.exports = app;
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

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Initialize Cache ────────────────────────────────────────────────────────
(async () => {
    try {
        await store.initRedis();
    } catch (err) {
        logger.warn('Redis initialization failed/skipped. Falling back to In-Memory cache.');
    }
})();

// Axios instance with global timeout (reduced for Vercel)
const http = axios.create({ 
    timeout: isProd ? 9000 : 60000,
    headers: { 'Accept-Encoding': 'gzip, deflate, br' }
});

// In-memory cache for Extended Exchange accountId per API key
const extAccountIdCache = new Map();

/**
 * Dynamically fetches and caches the account ID for the Extended Exchange.
 */
async function getExtendedAccountId(BASE, headers, apiKey) {
    if (extAccountIdCache.has(apiKey)) {
        return extAccountIdCache.get(apiKey);
    }
    
    try {
        const res = await http.get(`${BASE}/user/accounts`, { headers });
        const accounts = res.data?.data;
        if (Array.isArray(accounts) && accounts.length > 0 && accounts[0].accountId) {
            const accountId = accounts[0].accountId;
            extAccountIdCache.set(apiKey, accountId);
            return accountId;
        }
        throw new Error('No active account ID found in profile');
    } catch (err) {
        const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        logger.error(`[Extended API] Failed to fetch accountId: ${errMsg}`);
        throw new Error(`Failed to fetch accountId: ${errMsg}`);
    }
}

// ── Security Headers ────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// ── CORS (environment-aware) ────────────────────────────────────────────────
app.use(cors({
    origin: (origin, callback) => {
        // In production (Vercel): only allow exact known domains
        const prodOrigins = [
            'https://dashboard-perps.vercel.app'
        ];
        // In development: also allow localhost
        const devOrigins = [
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:5000', 'http://127.0.0.1:5000'
        ];
        const allowedOrigins = isProd ? prodOrigins : [...prodOrigins, ...devOrigins];

        // Allow server-to-server requests (no Origin header)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
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
// MemoryStore is the default for express-rate-limit.
// On Vercel, rate limiting is mostly handled by Edge network anyway.
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


// ─── Secure Key Store (HttpOnly Cookies & Redis Vault) ───────────────────────────────────
app.post('/api/exchanges/keys/store', csrfProtect, validate(schemas.storeKeySchema, 'body'), async (req, res) => {
    try {
        const { type, entryId, value } = req.validatedBody;
        const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;

        // Save to Redis Vault for cross-device sync (1 year TTL)
        const vaultKey = `vault:${type}:${entryId}`;
        await store.set(vaultKey, value, 365 * 24 * 60 * 60);

        res.cookie(cookieName, value, {
            httpOnly: true,
            secure: isProd,
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        logger.info(`Stored ${type} key for entry ${entryId} securely in Vault and Cookie`);
        res.json({ success: true });
    } catch (err) {
        logger.error('Failed to store API key in vault:', err.message);
        res.status(500).json({ error: 'Failed to securely store API key.' });
    }
});

// ─── Check if a key exists in Vault or Cookies ──────────────────────────────────────
app.get('/api/exchanges/keys/check', validate(schemas.keyCheckQuerySchema, 'query'), async (req, res) => {
    const { type, entryId } = req.validatedQuery;
    const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;
    const vaultKey = `vault:${type}:${entryId}`;
    
    // Check Vault first, then fallback to cookie
    const vaultValue = await store.get(vaultKey);
    const exists = !!vaultValue || !!req.cookies[cookieName];
    
    res.json({ exists });
});

app.post('/api/exchanges/keys/remove', csrfProtect, validate(schemas.keyRemoveBodySchema, 'body'), async (req, res) => {
    try {
        const { type, entryId } = req.validatedBody;
        const cookieName = type === 'extended' ? `ext_key_${entryId}` : `vr_token_${entryId}`;
        const vaultKey = `vault:${type}:${entryId}`;
        
        await store.set(vaultKey, null, 1); 
        res.clearCookie(cookieName);
        logger.info(`Removed ${type} key for entry ${entryId} from Vault and cookies`);
        res.json({ success: true });
    } catch (err) {
        logger.error('Failed to remove API key from vault:', err.message);
        res.status(500).json({ error: 'Failed to remove API key.' });
    }
});

// ─── Server-side Persistent Manual Overrides (Cross-device sync) ───────────
app.post('/api/exchanges/manual-override/save', csrfProtect, async (req, res) => {
    try {
        const { entryId, walletAddress, exchange, manualData } = req.body;
        if (!entryId && !walletAddress) {
            return res.status(400).json({ error: 'entryId or walletAddress is required' });
        }
        const key = walletAddress ? `override:${walletAddress.toLowerCase()}` : `override:${entryId}`;
        await store.set(key, { ...manualData, exchange, updatedAt: Date.now() }, 365 * 24 * 60 * 60); // 1 year TTL
        logger.info(`Saved persistent manual override for key ${key}`);
        res.json({ success: true });
    } catch (err) {
        logger.error('Failed to save manual override:', err.message);
        res.status(500).json({ error: 'Failed to save manual override' });
    }
});

app.get('/api/exchanges/manual-override/get', async (req, res) => {
    try {
        const keyStr = req.query.key;
        if (!keyStr) return res.status(400).json({ error: 'key is required' });
        const key = `override:${keyStr.toLowerCase()}`;
        const data = await store.get(key);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Server-side Persistent Active Exchanges (Cross-device sync) ────────────
app.post('/api/exchanges/state/save', csrfProtect, async (req, res) => {
    try {
        const { activeExchanges, lastUpdated } = req.body;
        if (!Array.isArray(activeExchanges)) {
            return res.status(400).json({ error: 'activeExchanges must be an array' });
        }
        
        const timestamp = lastUpdated || Date.now();
        await store.set('global:active_exchanges_v3', { exchanges: activeExchanges, lastUpdated: timestamp }, 365 * 24 * 60 * 60);
        logger.info(`Saved ${activeExchanges.length} active exchanges to server store (ts: ${timestamp})`);
        res.json({ success: true });
    } catch (err) {
        logger.error('Failed to save active exchanges:', err.message);
        res.status(500).json({ error: 'Failed to save active exchanges' });
    }
});

app.get('/api/exchanges/state/get', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');

        const data = await store.get('global:active_exchanges_v3');
        if (data && Array.isArray(data.exchanges)) {
            res.json({ success: true, exchanges: data.exchanges, lastUpdated: data.lastUpdated });
        } else {
            // Fallback to older version if v3 doesn't exist yet
            const oldExchanges = await store.get('global:active_exchanges') || [];
            res.json({ success: true, exchanges: oldExchanges, lastUpdated: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Proxy - Extended Exchange (Starknet) ────────────────────────────────────
app.post('/api/exchanges/extended/stats', apiLimiter, csrfProtect, validate(schemas.extendedEntryIdSchema, 'body'), async (req, res) => {
    const errors = [];
    try {
        const entryId = req.validatedBody.entryId;
        
        let apiKey = await store.get(`vault:extended:${entryId}`);
        if (!apiKey) {
            apiKey = req.cookies[`ext_key_${entryId}`];
        }
        if (!apiKey) return res.status(404).json({ error: 'API Key not found in vault. Please re-add this exchange.' });

        const headers = {
            'X-Api-Key': apiKey,
            'User-Agent': 'TradeDash/1.0',
            'Accept': 'application/json'
        };

        const BASE = process.env.EXTENDED_API_URL || 'https://api.starknet.extended.exchange/api/v1';

        // Get accountId dynamically (cached in-memory)
        let accountId;
        try {
            accountId = await getExtendedAccountId(BASE, headers, apiKey);
        } catch (err) {
            logger.error('Extended accountId retrieval failed:', err.message);
            return res.status(400).json({ error: `Failed to initialize Extended Exchange: ${err.message}` });
        }

        // Load incremental stats from cache
        const cacheKey = `cache:extended:${entryId}`;
        const cached = await store.get(cacheKey) || {
            trades: [],
            deposits: [],
            withdrawals: [],
            positions: [],
            orders: [],
            lastSync: 0
        };

        // Determine if sync is required (older than 5 minutes or never synced)
        const requiresSync = !cached.lastSync || (Date.now() - cached.lastSync > 5 * 60 * 1000);

        // Fetch only current balances, earned rewards, leaderboard and PnL charts fresh (Non-paginated fast requests)
        const [balanceRes, pointsRes, leaderboardRes, pnlChartRes, operationsRes] = await Promise.all([
            http.get(`${BASE}/user/balance?accountId=${accountId}`, { headers })
                .catch(e => { errors.push(`balance: ${e.message}`); logger.error('Extended balance error:', e.message); return { data: {} }; }),
            http.get(`${BASE}/user/rewards/earned?accountId=${accountId}`, { headers })
                .catch(e => { errors.push(`points: ${e.message}`); logger.error('Extended points error:', e.message); return { data: { data: [] } }; }),
            http.get(`${BASE}/user/rewards/leaderboard/stats?accountId=${accountId}`, { headers })
                .catch(e => { errors.push(`leaderboard: ${e.message}`); logger.error('Extended leaderboard error:', e.message); return { data: { data: {} } }; }),
            http.get(`${BASE}/portfolio/charts/pnl?interval=ALL&pnlType=TOTAL_PNL&accountId=${accountId}`, { headers })
                .catch(e => { 
                    const errMsg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
                    errors.push(`pnlChart: ${errMsg}`); 
                    logger.error(`Extended pnlChart error: ${errMsg}`); 
                    return { data: { data: [] } }; 
                }),
            http.get(`${BASE}/user/asset-operations?accountId=${accountId}&limit=100`, { headers })
                .catch(e => { 
                    const errMsg = e.response?.data ? JSON.stringify(e.response.data) : e.message;
                    errors.push(`operations: ${errMsg}`); 
                    logger.error(`Extended operations error: ${errMsg}`); 
                    return { data: { data: [] } }; 
                })
        ]);

        // Calculate INIT_DEPOSIT from fresh historical deposits and withdrawals
        let totalIn = 0, totalOut = 0;
        const freshOperations = operationsRes.data?.data || [];

        const freshDeposits = freshOperations.filter(op => op.type === 'DEPOSIT' && (op.status === 'COMPLETED' || op.status === 'SUCCESS'));
        const freshWithdrawals = freshOperations.filter(op => op.type === 'WITHDRAWAL' && (op.status === 'COMPLETED' || op.status === 'SUCCESS'));

        for (const op of freshDeposits) {
            totalIn += Math.abs(parseFloat(op.amount || 0));
        }
        for (const op of freshWithdrawals) {
            totalOut += Math.abs(parseFloat(op.amount || 0));
        }
        let initDeposit = totalIn - totalOut;

        // Fresh ACT_DEPOSIT
        const balData = balanceRes.data?.data || balanceRes.data || {};
        let actDeposit = parseFloat(balData.equity ?? balData.balance ?? 0);

        // Calculate VOLUME from cached trades and orders
        let volumeFromTrades = 0;
        const cachedTrades = cached.trades || [];
        for (const t of cachedTrades) {
            const val = Math.abs(parseFloat(t.value) || 0);
            if (val !== 0) {
                volumeFromTrades += val;
            } else {
                volumeFromTrades += Math.abs((parseFloat(t.qty) || 0) * (parseFloat(t.price) || 0));
            }
        }

        let volumeFromOrders = 0;
        const cachedOrders = cached.orders || [];
        for (const o of cachedOrders) {
            if (o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED') {
                const fq = Math.abs(parseFloat(o.filledQty) || 0);
                const ap = Math.abs(parseFloat(o.averagePrice) || 0);
                if (fq > 0 && ap > 0) {
                    volumeFromOrders += fq * ap;
                }
            }
        }
        const finalVolume = Math.max(volumeFromTrades, volumeFromOrders);

        // Calculate WIN_RATE from cached historical closed positions
        let wins = 0, totalClosed = 0;
        const cachedPositions = cached.positions || [];
        for (const p of cachedPositions) {
            if (p.realisedPnl !== undefined) {
                totalClosed++;
                if (parseFloat(p.realisedPnl || 0) > 0) wins++;
            }
        }
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        // PNL = ACT_DEPOSIT - INIT_DEPOSIT
        const pnl = actDeposit - initDeposit;

        // Leaderboard Rank
        const lbData = leaderboardRes.data?.data || {};
        let rank = lbData.rank || null;

        // Check server-side stored manual override for cross-device sync
        let finalPoints = pointsRes.data || {};
        const storedOverride = await store.get(`override:${entryId}`);
        if (storedOverride) {
            if (storedOverride.points !== undefined && storedOverride.points !== null && storedOverride.points !== '') {
                finalPoints = parseFloat(storedOverride.points);
            }
            if (storedOverride.rank !== undefined && storedOverride.rank !== null && storedOverride.rank !== '') {
                rank = storedOverride.rank;
            }
            if (storedOverride.initDeposit !== undefined && storedOverride.initDeposit !== null && storedOverride.initDeposit !== '') initDeposit = parseFloat(storedOverride.initDeposit);
            if (storedOverride.actDeposit !== undefined && storedOverride.actDeposit !== null && storedOverride.actDeposit !== '') actDeposit = parseFloat(storedOverride.actDeposit);
            if (storedOverride.volume !== undefined && storedOverride.volume !== null && storedOverride.volume !== '') finalVolume = parseFloat(storedOverride.volume);
        }

        // NATIVE PNL (from fresh pnl chart)
        let nativeTotalPnl = 0;
        const pnlChart = pnlChartRes.data?.data || pnlChartRes.data || [];
        if (Array.isArray(pnlChart) && pnlChart.length > 0) {
            const lastPoint = pnlChart[pnlChart.length - 1];
            nativeTotalPnl = parseFloat(
                lastPoint.totalPnl ?? lastPoint.pnl ?? lastPoint.value ?? lastPoint.cumulativePnl ?? 0
            );
        }
        if (nativeTotalPnl === 0) {
            nativeTotalPnl = parseFloat(balData.unrealisedPnl || balData.unrealizedPnl || 0);
        }

        res.json({
            init_deposit: initDeposit,
            act_deposit: actDeposit,
            native_pnl: nativeTotalPnl,
            total_volume: finalVolume,
            pnl: pnl,
            win_rate: winRate,
            points: finalPoints,
            rank: rank,
            requires_history_sync: requiresSync,
            partial_success: errors.length > 0 ? true : undefined,
            warnings: errors.length > 0 ? errors : undefined,
            _debug: {
                balance_fields: balData,
                total_in: totalIn,
                total_out: totalOut,
                deposits_count: freshDeposits.length,
                withdrawals_count: freshWithdrawals.length,
                pnl_chart_points: pnlChart.length,
                cached_last_sync: cached.lastSync
            }
        });
    } catch (error) {
        logger.error('Extended Stats Error:', error.stack || error.message);
        res.status(500).json({ error: 'Failed to fetch Extended exchange data. Please try again.' });
    }
});

// Incremental sync helper for Extended Starknet API
const fetchAllExtendedPaginated = async (BASE, endpoint, cachedList = [], getUniqueId, isTerminalFn, headers) => {
    let all = [];
    const seen = new Set();
    const terminalCacheIds = new Set(
        cachedList
            .filter(item => !isTerminalFn || isTerminalFn(item))
            .map(item => getUniqueId(item))
    );
    let cursor = null;
    let hitTerminalCache = false;
    const fetchStartTime = Date.now();

    for (let i = 0; i < 100; i++) {
        // Strict safety time limit for Vercel functions (8.5 seconds)
        if (Date.now() - fetchStartTime > 8500) {
            logger.warn(`Extended sync time limit reached for ${endpoint}`);
            break;
        }
        try {
            let url = `${BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=100`;
            if (cursor) url += `&cursor=${cursor}`;
            const r = await http.get(url, { headers });
            const records = r.data?.data || [];
            let added = 0;

            for (const rec of (Array.isArray(records) ? records : [])) {
                const id = getUniqueId(rec);
                if (terminalCacheIds.has(id)) {
                    hitTerminalCache = true;
                }
                if (!seen.has(id)) {
                    seen.add(id);
                    all.push(rec);
                    added++;
                }
            }

            if (hitTerminalCache) {
                break; // Met a terminal record in cache - incremental sync complete!
            }

            const next = r.data?.pagination?.cursor;
            if (added === 0 || !next) break;
            cursor = next;
        } catch (e) {
            logger.error(`Extended pagination error [${endpoint}]:`, e.message);
            break;
        }
    }

    // Merge and deduplicate
    const mergedMap = new Map();
    for (const item of cachedList) {
        mergedMap.set(getUniqueId(item), item);
    }
    for (const item of all) {
        mergedMap.set(getUniqueId(item), item);
    }
    return Array.from(mergedMap.values());
};

// ─── Incremental History Sync - Extended Exchange ────────────────────────────
app.post('/api/exchanges/extended/sync-history', apiLimiter, csrfProtect, validate(schemas.extendedEntryIdSchema, 'body'), async (req, res) => {
    try {
        const entryId = req.validatedBody.entryId;

        let apiKey = await store.get(`vault:extended:${entryId}`);
        if (!apiKey) {
            apiKey = req.cookies[`ext_key_${entryId}`];
        }
        if (!apiKey) return res.status(404).json({ error: 'API Key not found in vault' });

        const headers = {
            'X-Api-Key': apiKey,
            'User-Agent': 'TradeDash/1.0',
            'Accept': 'application/json'
        };

        const BASE = process.env.EXTENDED_API_URL || 'https://api.starknet.extended.exchange/api/v1';

        // Get accountId dynamically (cached in-memory)
        let accountId;
        try {
            accountId = await getExtendedAccountId(BASE, headers, apiKey);
        } catch (err) {
            logger.error('Extended sync accountId retrieval failed:', err.message);
            return res.status(400).json({ error: `Failed to initialize Extended Exchange sync: ${err.message}` });
        }

        const cacheKey = `cache:extended:${entryId}`;
        const cached = await store.get(cacheKey) || {
            trades: [],
            deposits: [],
            withdrawals: [],
            positions: [],
            orders: [],
            lastSync: 0
        };

        logger.info(`Starting incremental history sync for Extended: ${entryId} (accountId: ${accountId})`);

        // Fetch paginated history in parallel using incremental matching and explicit accountId
        const [trades, rawOperations, positions, orders] = await Promise.all([
            fetchAllExtendedPaginated(BASE, `/user/trades?accountId=${accountId}&startTime=0`, cached.trades, t => t.id || JSON.stringify(t), () => true, headers),
            fetchAllExtendedPaginated(BASE, `/user/asset-operations?accountId=${accountId}&startTime=0`, [], op => op.id || JSON.stringify(op), () => true, headers),
            fetchAllExtendedPaginated(BASE, `/user/positions/history?accountId=${accountId}&startTime=0`, cached.positions, p => p.id || JSON.stringify(p), () => true, headers),
            fetchAllExtendedPaginated(BASE, `/user/orders/history?accountId=${accountId}&startTime=0`, cached.orders, o => o.id || JSON.stringify(o), o => ['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(o.status), headers)
        ]);

        const deposits = rawOperations.filter(op => op.type === 'DEPOSIT' && (op.status === 'COMPLETED' || op.status === 'SUCCESS'));
        const withdrawals = rawOperations.filter(op => op.type === 'WITHDRAWAL' && (op.status === 'COMPLETED' || op.status === 'SUCCESS'));

        // Save updated data to cache
        await store.set(cacheKey, {
            trades,
            deposits,
            withdrawals,
            positions,
            orders,
            lastSync: Date.now()
        }, 30 * 24 * 60 * 60); // 30 days TTL

        logger.info(`Completed history sync for Extended: ${entryId}`);
        res.json({ success: true });
    } catch (e) {
        logger.error('Extended history sync failed:', e.message);
        res.status(500).json({ error: 'History sync failed' });
    }
});


// ─── Proxy - Nado Exchange (Ink L2) ─────────────────────────────────────────
app.post('/api/exchanges/nado/stats', apiLimiter, csrfProtect, validate(schemas.nadoStatsSchema, 'body'), async (req, res) => {
    try {
        const { address, walletAddress } = req.validatedBody;
        const targetAddress = walletAddress || address;

        const archiveHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        const hexAddr = targetAddress.replace('0x', '').toLowerCase();
        const nameHex = Buffer.from('default', 'ascii').toString('hex').padEnd(24, '0');
        const sender = '0x' + hexAddr + nameHex;

        // Load cached orders
        const cacheKey = `cache:nado:${targetAddress}`;
        const cached = await store.get(cacheKey) || {
            orders: [],
            lastSync: 0
        };

        const requiresSync = !cached.lastSync || (Date.now() - cached.lastSync > 5 * 60 * 1000);

        let totalEquity = 0;
        let pnlFromTrades = 0;
        let wins = 0, totalClosed = 0;

        const gatewayUrl = process.env.NADO_GATEWAY_URL || 'https://gateway.prod.nado.xyz/v1';
        const archiveUrl = process.env.NADO_ARCHIVE_URL || 'https://archive.prod.nado.xyz/v1';

        // 1. Fetch balance (Total Equity), active deposit snapshot, events, and points fresh in parallel
        const [subRes, snapRes, evRes, pointsRes] = await Promise.all([
            http.get(`${gatewayUrl}/query?type=subaccount_info&subaccount=${sender}`).catch(() => ({ data: {} })),
            http.post(archiveUrl, {
                account_snapshots: { subaccounts: [sender], timestamps: [Date.now() * 1000000], active: false }
            }, { headers: archiveHeaders }).catch(() => ({ data: {} })),
            http.post(archiveUrl, {
                events: { subaccounts: [sender], event_types: ['deposit_collateral', 'withdraw_collateral'], limit: { raw: 2000 } }
            }, { headers: archiveHeaders }).catch(() => ({ data: {} })),
            http.post(archiveUrl, {
                nado_points: { address: targetAddress }
            }, { headers: archiveHeaders }).catch(() => ({ data: {} }))
        ]);

        // Parse Spot balances
        const spotBalances = subRes.data?.data?.spot_balances || subRes.data?.spot_balances || [];
        for (const b of spotBalances) {
            if (b && (b.product_id === 0 || b.product_id === 5)) {
                totalEquity += parseFloat(b.balance?.amount || b.amount || 0) / 1e18;
            }
        }

        // Parse Snapshots for volume & net entry cumulative
        let totalVolumeFromSnap = 0, initDepositFromSnap = 0;
        const snapData = snapRes.data?.snapshots?.[sender];
        if (snapData) {
            const arr = snapData[Object.keys(snapData)[0]] || [];
            for (const item of arr) {
                if (item.product_id !== 0) totalVolumeFromSnap += parseFloat(item.quote_volume_cumulative || 0) / 1e18;
                else initDepositFromSnap = parseFloat(item.net_entry_cumulative || 0) / 1e18;
            }
        }

        // Parse Collateral Events for net entry cumulative
        let initDepositFromEvents = 0;
        const evts = evRes.data?.events || [];
        for (const ev of evts) {
            const pre  = BigInt(ev.pre_balance?.spot?.balance?.amount  || 0);
            const post = BigInt(ev.post_balance?.spot?.balance?.amount || 0);
            initDepositFromEvents += Number(post - pre) / 1e18;
        }
        const initDepositCalc = evts.length > 0 ? initDepositFromEvents : initDepositFromSnap;
        let initDeposit = initDepositCalc;

        // Parse Unrealized PnL (Native PnL)
        let nativeTotalPnl = 0;
        const perpBalances = subRes.data?.data?.perp_balances || subRes.data?.perp_balances || [];
        const perpProducts = subRes.data?.data?.perp_products || subRes.data?.perp_products || [];
        for (const pb of perpBalances) {
            const pid = pb.product_id;
            const product = perpProducts.find(p => p.product_id === pid);
            if (product) {
                const amount = parseFloat(pb.balance?.amount || pb.amount || 0) / 1e18;
                const vQuote = parseFloat(pb.balance?.v_quote_balance || pb.v_quote_balance || 0) / 1e18;
                const price = parseFloat(product.oracle_price_x18 || 0) / 1e18;
                nativeTotalPnl += (amount * price) + vQuote;
            }
        }

        // Total Active Deposit (Equity) = Settled Spot + Unrealized PnL
        let fullEquity = totalEquity + nativeTotalPnl;

        // Calculate Win Rate & realized PNL from cached historical orders
        const cachedOrders = cached.orders || [];
        for (const o of cachedOrders) {
            const rpnl = (parseFloat(o.realized_pnl) || 0) / 1e18;
            const fee  = (parseFloat(o.fee) || 0) / 1e18;
            pnlFromTrades += (rpnl - fee);
            if (o.product_id !== 0 && (parseFloat(o.realized_pnl) || 0) !== 0) {
                totalClosed++;
                if (rpnl > 0) wins++;
            }
        }
        const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

        // Points & Rank
        const allTime = pointsRes.data?.all_time_points || {};
        let totalPoints = parseFloat(allTime.points || 0);
        let rank = allTime.rank ? (parseInt(allTime.rank) || allTime.rank) : null;

        // Manual override for Nado wallet (e.g., 0x8b36...)
        if (targetAddress && targetAddress.toLowerCase() === '0x8b3657e0a27bccd0d93c73de19ee1471923ea03d') {
            if (!totalPoints || totalPoints === 0) totalPoints = 458;
            if (!rank) rank = '4,761';
        }
        
        let finalVolume = totalVolumeFromSnap;
        // PNL = Realized from trades + Unrealized PNL (matches UI "All Time Account PnL" better than net deposits if events are missing)
        let finalPnl    = pnlFromTrades + nativeTotalPnl;

        // Check server-side stored manual override for cross-device sync
        const storedOverride = await store.get(`override:${targetAddress.toLowerCase()}`);
        if (storedOverride) {
            if (storedOverride.points !== undefined && storedOverride.points !== null && storedOverride.points !== '') {
                totalPoints = parseFloat(storedOverride.points);
            }
            if (storedOverride.rank !== undefined && storedOverride.rank !== null && storedOverride.rank !== '') {
                rank = storedOverride.rank;
            }
            if (storedOverride.initDeposit !== undefined && storedOverride.initDeposit !== null && storedOverride.initDeposit !== '') initDeposit = parseFloat(storedOverride.initDeposit);
            if (storedOverride.actDeposit !== undefined && storedOverride.actDeposit !== null && storedOverride.actDeposit !== '') fullEquity = parseFloat(storedOverride.actDeposit);
            if (storedOverride.volume !== undefined && storedOverride.volume !== null && storedOverride.volume !== '') finalVolume = parseFloat(storedOverride.volume);
            if (storedOverride.pnl !== undefined && storedOverride.pnl !== null && storedOverride.pnl !== '') finalPnl = parseFloat(storedOverride.pnl);
        }

        if (req.body.manualPoints !== undefined && req.body.manualPoints !== null && req.body.manualPoints !== '') {
            totalPoints = parseFloat(req.body.manualPoints);
        }
        if (req.body.manualRank !== undefined && req.body.manualRank !== null && req.body.manualRank !== '') {
            rank = req.body.manualRank;
        }

        res.json({
            snapshot: { assets: fullEquity },
            matches: cachedOrders,
            points: totalPoints,
            init_deposit: initDeposit,
            act_deposit: fullEquity,
            native_pnl: nativeTotalPnl,
            total_volume: finalVolume,
            pnl: finalPnl,
            win_rate: winRate,
            rank: rank,
            wallet: targetAddress,
            requires_history_sync: requiresSync,
            _debug: {
                events_count: evts.length,
                net_deposits: initDeposit,
                full_equity: fullEquity,
                settled_equity: totalEquity,
                native_pnl: nativeTotalPnl,
                orders_count: cachedOrders.length,
                pnl_from_trades: pnlFromTrades,
                cached_last_sync: cached.lastSync
            }
        });
    } catch (error) {
        logger.error('Nado Proxy Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch Nado exchange data. Please try again.' });
    }
});

// ─── Incremental History Sync - Nado Exchange ────────────────────────────────
app.post('/api/exchanges/nado/sync-history', apiLimiter, csrfProtect, validate(schemas.nadoSyncSchema, 'body'), async (req, res) => {
    try {
        const { address, walletAddress } = req.validatedBody;
        const targetAddress = walletAddress || address;

        const archiveHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        const hexAddr = targetAddress.replace('0x', '').toLowerCase();
        const nameHex = Buffer.from('default', 'ascii').toString('hex').padEnd(24, '0');
        const sender = '0x' + hexAddr + nameHex;

        // Load cached orders
        const cacheKey = `cache:nado:${targetAddress}`;
        const cached = await store.get(cacheKey) || {
            orders: [],
            lastSync: 0
        };

        logger.info(`Starting incremental history sync for Nado: ${targetAddress}`);

        let allOrders = [], cursor = null, hasMore = true;
        const cacheIds = new Set(cached.orders.map(o => o.idx || JSON.stringify(o)));
        let hitCache = false;
        const startTime = Date.now();

        for (let i = 0; i < 200; i++) {
            // Strict 8.5 seconds serverless time budget limit
            if (!hasMore || (Date.now() - startTime > 8500)) break;
            const pld = { orders: { subaccounts: [sender], limit: 100 } };
            if (cursor) pld.orders.idx = cursor;
            
            const archiveUrl = process.env.NADO_ARCHIVE_URL || 'https://archive.prod.nado.xyz/v1';
            const r = await http.post(archiveUrl, pld, { headers: archiveHeaders }).catch(() => null);
            const batch = r?.data?.orders || [];
            if (batch.length > 0) { 
                cursor = batch[batch.length-1].idx;
                
                for (const o of batch) {
                    const id = o.idx || JSON.stringify(o);
                    if (cacheIds.has(id)) {
                        hitCache = true;
                    }
                    allOrders.push(o);
                }
                
                if (hitCache) {
                    break; // Hit cached orders - sync complete!
                }
                if (batch.length < 100) hasMore = false; 
            }
            else hasMore = false;
        }

        // Merge and deduplicate
        const mergedMap = new Map();
        for (const o of cached.orders) {
            mergedMap.set(o.idx || JSON.stringify(o), o);
        }
        for (const o of allOrders) {
            mergedMap.set(o.idx || JSON.stringify(o), o);
        }
        const finalOrders = Array.from(mergedMap.values());

        // Save updated cache
        await store.set(cacheKey, {
            orders: finalOrders,
            lastSync: Date.now()
        }, 30 * 24 * 60 * 60); // 30 days TTL

        logger.info(`Completed history sync for Nado: ${targetAddress}`);
        res.json({ success: true });
    } catch (e) {
        logger.error('Nado history sync failed:', e.message);
        res.status(500).json({ error: 'Nado history sync failed' });
    }
});


// ─── Proxy - Variational Exchange (Arbitrum) ─────────────────────────────────
app.post('/api/exchanges/variational/stats', apiLimiter, csrfProtect, validate(schemas.variationalStatsSchema, 'body'), async (req, res) => {
    try {
        // walletAddress allows multi-wallet support
        const { address, walletAddress } = req.validatedBody;
        const targetAddress = walletAddress || address;

        const OMNI_API = process.env.VARIATIONAL_API_URL || 'https://omni.variational.io/api';
        const OMNI_PUB = process.env.VARIATIONAL_PUB_URL || 'https://omni-client-api.prod.ap-northeast-1.variational.io';

        // Forward the vr-token session cookie from the browser (or body) to Omni API
        let vrToken = await store.get(`vault:variational:${entryId}`);
        if (!vrToken) {
            vrToken = req.body.vrToken || req.cookies?.[`vr_token_${entryId}`] || req.cookies?.['vr-token'];
        }
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

        // Manual override for user requested wallet
        if (targetAddress && targetAddress.toLowerCase() === '0x8b3657e0a27bccd0d93c73de19ee1471923ea03d') {
            responseData.portfolio = {
                act_deposit: 1625.20,
                init_deposit: 3759.81,
                pnl: -822.70,
                volume: 1710000,
                upnl: 0,
                win_rate: 0
            };
            responseData.points = {
                total_points: 66.63,
                rank: 14091
            };
        }

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

        // Check server-side stored manual override for cross-device sync
        if (targetAddress) {
            const storedOverride = await store.get(`override:${targetAddress.toLowerCase()}`);
            if (storedOverride) {
                responseData.portfolio = responseData.portfolio || {};
                if (storedOverride.actDeposit !== undefined && storedOverride.actDeposit !== null && storedOverride.actDeposit !== '') responseData.portfolio.act_deposit = parseFloat(storedOverride.actDeposit);
                if (storedOverride.initDeposit !== undefined && storedOverride.initDeposit !== null && storedOverride.initDeposit !== '') responseData.portfolio.init_deposit = parseFloat(storedOverride.initDeposit);
                if (storedOverride.volume !== undefined && storedOverride.volume !== null && storedOverride.volume !== '') responseData.portfolio.volume = parseFloat(storedOverride.volume);
                if (storedOverride.winRate !== undefined && storedOverride.winRate !== null && storedOverride.winRate !== '') responseData.portfolio.win_rate = parseFloat(storedOverride.winRate);
                if (storedOverride.roi !== undefined && storedOverride.roi !== null && storedOverride.roi !== '') responseData.portfolio.roi = parseFloat(storedOverride.roi);
                
                responseData.points = responseData.points || {};
                if (storedOverride.points !== undefined && storedOverride.points !== null && storedOverride.points !== '') responseData.points.total_points = parseFloat(storedOverride.points);
                if (storedOverride.rank !== undefined && storedOverride.rank !== null && storedOverride.rank !== '') responseData.points.rank = storedOverride.rank;
            }
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
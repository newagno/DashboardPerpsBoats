import express from 'express';
import cors from 'cors';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import logger from './utils/logger';
import store from './utils/store';

const app = express();
app.set('trust proxy', 1); // Trust Vercel proxy for rate-limiting
const PORT = process.env.PORT || 3000;

// ── Initialize Cache ──
(async () => {
    try {
        await store.initRedis();
    } catch (err) {
        logger.warn('Redis initialization failed/skipped. Falling back to In-Memory cache.');
    }
})();

// ── Security & Middleware ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https:", "wss:"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
    credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
    logger.http(`${req.method} ${req.url}`);
    next();
});

// ── Routes ──
import apiRoutes from './routes/api';
app.use('/', apiRoutes);

// ── Static Files ──
app.use(express.static(path.join(__dirname, '../public')));

// ── Error Handling ──
app.use((err: any, req: any, res: any, next: any) => {
    logger.error('Unhandled Error:', err.stack || err);
    res.status(500).json({ error: 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info(`🚀 TradeDash Server running at http://localhost:${PORT}`);
        logger.info(`Serving frontend from: ${path.join(__dirname, '../public')}`);
    });
}

export default app;

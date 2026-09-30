const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
const code = fs.readFileSync(serverFile, 'utf8');

const helperRegex = /(\/\/\s*───\s*Extended Exchange Helper Functions[\s\S]*?)(\/\/\s*───\s*Proxy - Extended Exchange \(Starknet\))/;
const helperMatch = code.match(helperRegex);
const helpersCode = helperMatch ? helperMatch[1] : '';

const routeRegex = /app\.(get|post|delete)\('(\/api[^']+)',.*?async\s*\((req,\s*res)\)\s*=>\s*\{([\s\S]*?)(?=\n\}\);\n|\n\}\);(?!\n))/g;

let controllersCode = `const http = require('axios');
const store = require('../utils/store');
const logger = require('../utils/logger');
const crypto = require('crypto');

${helpersCode}
`;

let routesCode = `const express = require('express');
const router = express.Router();
const exchangeController = require('../controllers/exchangeController');
const { validate, schemas } = require('../utils/validation');
const apiLimiter = require('../middlewares/rateLimiter');
const csrfProtect = require('../middlewares/csrf');

`;

const matches = [...code.matchAll(routeRegex)];
let funcCounter = 1;

matches.forEach(match => {
    const method = match[1];
    const route = match[2];
    const body = match[4];
    
    const lineRegex = new RegExp(`app\\.${method}\\('${route}'(.*?)\\basync\\s*\\(req,\\s*res\\)\\s*=>\\s*\\{`);
    const lineMatch = code.match(lineRegex);
    let middlewares = lineMatch ? lineMatch[1] : '';
    middlewares = middlewares.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();

    let funcName = route.replace(/\/api\//, '').replace(/[^a-zA-Z0-9]/g, '_');
    if (funcName === 'health') funcName = 'getHealth';
    if (funcName.startsWith('exchanges_')) funcName = funcName.substring(10);
    funcName = funcName + '_' + funcCounter++;

    controllersCode += `\nexports.${funcName} = async (req, res) => {${body}\n};\n`;
    
    if (middlewares) {
        routesCode += `router.${method}('${route}', ${middlewares}, exchangeController.${funcName});\n`;
    } else {
        routesCode += `router.${method}('${route}', exchangeController.${funcName});\n`;
    }
});

fs.writeFileSync(path.join(__dirname, 'controllers', 'exchangeController.js'), controllersCode);
fs.writeFileSync(path.join(__dirname, 'routes', 'api.js'), routesCode + '\nmodule.exports = router;');

let newServerCode = `const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const logger = require('./utils/logger');
const store = require('./utils/store');

const app = express();
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
    logger.http(\`\${req.method} \${req.url}\`);
    next();
});

// ── Routes ──
const apiRoutes = require('./routes/api');
app.use('/', apiRoutes);

// ── Static Files ──
app.use(express.static(path.join(__dirname, '../public')));

// ── Error Handling ──
app.use((err, req, res, next) => {
    logger.error('Unhandled Error:', err.stack || err);
    res.status(500).json({ error: 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        logger.info(\`🚀 TradeDash Server running at http://localhost:\${PORT}\`);
        logger.info(\`Serving frontend from: \${path.join(__dirname, '../public')}\`);
    });
}

module.exports = app;
`;

fs.writeFileSync(serverFile, newServerCode);

console.log("Decomposition successful!");

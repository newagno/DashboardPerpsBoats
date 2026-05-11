/**
 * Structured logger with sensitive data masking.
 * Uses winston for production-grade log management.
 */
const winston = require('winston');

// ── Sensitive data masking ────────────────────────────────────────────────────
const MASK_PATTERNS = [
    // API keys (any string that looks like ext_... or a long hex/alnum token)
    { regex: /("?(?:api[_-]?key|apiKey|authorization|token|vrToken)"?\s*[:=]\s*"?)([a-zA-Z0-9_\-]{8,})("?)/gi,
      replacement: '$1***REDACTED***$3' },
    // Wallet private keys (if accidentally logged)
    { regex: /(0x[a-fA-F0-9]{60,})/g,
      replacement: '0x***PRIVATE_KEY_REDACTED***' },
    // Cookie values
    { regex: /(tradedash_auth=)([a-zA-Z0-9\-]+)/g,
      replacement: '$1***REDACTED***' },
    { regex: /(vr-token=)([a-zA-Z0-9\-_.]+)/g,
      replacement: '$1***REDACTED***' }
];

const maskSensitive = winston.format((info) => {
    if (typeof info.message === 'string') {
        for (const pattern of MASK_PATTERNS) {
            info.message = info.message.replace(pattern.regex, pattern.replacement);
        }
    }
    return info;
});

// ── Logger instance ──────────────────────────────────────────────────────────
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: winston.format.combine(
        maskSensitive(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        process.env.NODE_ENV === 'production'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                    return `${timestamp} ${level}: ${message}${metaStr}`;
                })
            )
    ),
    transports: [
        new winston.transports.Console()
    ],
    // Prevent unhandled rejections from crashing the process
    exitOnError: false
});

// ── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Mask an API key for safe display: ext_...a1b2
 */
logger.maskApiKey = (key) => {
    if (!key || key.length < 8) return '***';
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
};

/**
 * Mask a wallet address for logs: 0x1234...abcd
 */
logger.maskAddress = (addr) => {
    if (!addr || addr.length < 10) return '***';
    return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
};

module.exports = logger;

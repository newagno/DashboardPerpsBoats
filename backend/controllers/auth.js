const crypto = require('crypto');
const { ethers } = require('ethers');
const store = require('../utils/store');
const logger = require('../utils/logger');

// Fixed EIP-712 Domain base
const DOMAIN_BASE = {
    name: 'TradeDash',
    version: '2.0',
    verifyingContract: '0x0000000000000000000000000000000000000000'
};

const TYPES = {
    Login: [
        { name: 'intent', type: 'string' },
        { name: 'address', type: 'address' },
        { name: 'nonce', type: 'string' },
        { name: 'timestamp', type: 'uint256' }
    ]
};

// Key prefixes for Redis namespacing
const NONCE_PREFIX = 'nonce:';
const SESSION_PREFIX = 'session:';

// TTLs
const NONCE_TTL = 5 * 60;        // 5 minutes
const SESSION_TTL = 24 * 60 * 60; // 24 hours

/**
 * Generate a new Nonce for the given address
 */
const getNonce = async (req, res) => {
    try {
        // Use validated query if available, otherwise fallback to raw query
        const address = (req.validatedQuery?.address || req.query.address || '').toLowerCase();
        if (!address || !ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        const nonce = crypto.randomUUID();
        await store.set(NONCE_PREFIX + address, {
            nonce,
            timestamp: Date.now(),
            retries: 0
        }, NONCE_TTL);

        logger.info(`Nonce generated for ${logger.maskAddress(address)}`);
        res.json({ nonce });
    } catch (e) {
        logger.error('Nonce error:', e);
        res.status(500).json({ error: 'Failed to generate nonce' });
    }
};

/**
 * Verify Web3 Signature and establish session
 */
const verifySig = async (req, res) => {
    try {
        const { address, signature, message, chainId } = req.validatedBody || req.body;
        const lowerAddress = address?.toLowerCase();

        if (!lowerAddress || !signature || !message || !chainId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const stored = await store.get(NONCE_PREFIX + lowerAddress);
        if (!stored) {
            return res.status(401).json({ error: 'Nonce not found or expired. Request new nonce.' });
        }

        // Retry logic and invalidation
        stored.retries += 1;
        if (stored.retries > 3) {
            await store.del(NONCE_PREFIX + lowerAddress);
            return res.status(401).json({ error: 'Too many attempts. Request new nonce.' });
        }
        // Update retry count
        await store.set(NONCE_PREFIX + lowerAddress, stored, NONCE_TTL);

        // Validate payload matches what we expect
        if (message.nonce !== stored.nonce) {
            return res.status(401).json({ error: 'Invalid nonce' });
        }

        // Replay & Timestamp Protection (±5 minutes)
        const timeDiff = Math.abs(Date.now() - (message.timestamp * 1000));
        if (timeDiff > 5 * 60 * 1000) {
            await store.del(NONCE_PREFIX + lowerAddress);
            return res.status(401).json({ error: 'Timestamp expired or invalid' });
        }

        if (message.intent !== 'Login to Dashboard') {
            return res.status(401).json({ error: 'Invalid intent' });
        }

        // ChainId passed from client is typically a hex string from MetaMask (e.g. "0x1"), so parse it gracefully
        let parsedChainId = typeof chainId === 'string' && chainId.startsWith('0x') 
            ? parseInt(chainId, 16) 
            : parseInt(chainId);

        const domain = {
            ...DOMAIN_BASE,
            chainId: parsedChainId
        };

        // Verify EIP-712 Signature
        const recoveredAddress = ethers.verifyTypedData(domain, TYPES, message, signature);
        
        if (recoveredAddress.toLowerCase() !== lowerAddress) {
            return res.status(401).json({ error: 'Signature verification failed' });
        }

        // Success: Atomic flush of nonce
        await store.del(NONCE_PREFIX + lowerAddress);

        // Create Session
        const sessionId = crypto.randomUUID();
        await store.set(SESSION_PREFIX + sessionId, {
            address: lowerAddress,
            connectedAt: Date.now()
        }, SESSION_TTL);

        // Set HttpOnly Cookie (Environment Isolation)
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('tradedash_auth', sessionId, {
            httpOnly: true,
            secure: isProd,   // true for HTTPS
            sameSite: isProd ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        });

        logger.info(`Session created for ${logger.maskAddress(lowerAddress)}`);
        res.json({ success: true, address: lowerAddress });
    } catch (e) {
        logger.error('Verification error:', e);
        res.status(500).json({ error: 'Server verification failed' });
    }
};

/**
 * Logout / Terminate Session
 */
const logout = async (req, res) => {
    try {
        const sessionId = req.cookies?.tradedash_auth;
        if (sessionId) {
            await store.del(SESSION_PREFIX + sessionId);
        }
        res.clearCookie('tradedash_auth');
        logger.info('Session terminated');
        res.json({ success: true });
    } catch (e) {
        logger.error('Logout error:', e);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

/**
 * Auth Middleware to protect API routes
 */
const requireAuth = async (req, res, next) => {
    const sessionId = req.cookies?.tradedash_auth;
    if (!sessionId) {
        return res.status(401).json({ error: 'Unauthorized: No session' });
    }
    
    const session = await store.get(SESSION_PREFIX + sessionId);
    if (!session) {
        res.clearCookie('tradedash_auth');
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    }

    // Attach user to request
    req.user = session;
    next();
};

module.exports = {
    getNonce,
    verifySig,
    logout,
    requireAuth
};

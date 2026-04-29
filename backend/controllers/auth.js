const { v4: uuidv4 } = require('uuid');
const { ethers } = require('ethers');

// In-memory stores (in production, use Redis)
const nonces = new Map(); // address => { nonce, timestamp, retries }
const sessions = new Map(); // sessionId => { address, connectedAt }

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

/**
 * Generate a new Nonce for the given address
 */
const getNonce = (req, res) => {
    try {
        const address = req.query.address?.toLowerCase();
        if (!address || !ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid address' });
        }

        const nonce = uuidv4();
        nonces.set(address, {
            nonce,
            timestamp: Date.now(),
            retries: 0
        });

        res.json({ nonce });
    } catch (e) {
        console.error('Nonce error:', e);
        res.status(500).json({ error: 'Failed to generate nonce' });
    }
};

/**
 * Verify Web3 Signature and establish session
 */
const verifySig = async (req, res) => {
    try {
        const { address, signature, message, chainId } = req.body;
        const lowerAddress = address?.toLowerCase();

        if (!lowerAddress || !signature || !message || !chainId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const stored = nonces.get(lowerAddress);
        if (!stored) {
            return res.status(401).json({ error: 'Nonce not found or expired. Request new nonce.' });
        }

        // Retry logic and invalidation
        stored.retries += 1;
        if (stored.retries > 3) {
            nonces.delete(lowerAddress);
            return res.status(401).json({ error: 'Too many attempts. Request new nonce.' });
        }

        // Validate payload matches what we expect
        if (message.nonce !== stored.nonce) {
            return res.status(401).json({ error: 'Invalid nonce' });
        }

        // Replay & Timestamp Protection (±5 minutes)
        const timeDiff = Math.abs(Date.now() - (message.timestamp * 1000));
        if (timeDiff > 5 * 60 * 1000) {
            nonces.delete(lowerAddress);
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
        nonces.delete(lowerAddress);

        // Create Session
        const sessionId = uuidv4();
        sessions.set(sessionId, {
            address: lowerAddress,
            connectedAt: Date.now()
        });

        // Set HttpOnly Cookie (Environment Isolation)
        const isProd = process.env.NODE_ENV === 'production';
        res.cookie('tradedash_auth', sessionId, {
            httpOnly: true,
            secure: isProd,   // true for HTTPS
            sameSite: isProd ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            path: '/'
        });

        res.json({ success: true, address: lowerAddress });
    } catch (e) {
        console.error('Verification error:', e);
        res.status(500).json({ error: 'Server verification failed' });
    }
};

/**
 * Logout / Terminate Session
 */
const logout = (req, res) => {
    try {
        const sessionId = req.cookies?.tradedash_auth;
        if (sessionId) {
            sessions.delete(sessionId);
        }
        res.clearCookie('tradedash_auth');
        res.json({ success: true });
    } catch (e) {
        console.error('Logout error:', e);
        res.status(500).json({ error: 'Failed to logout' });
    }
};

/**
 * Auth Middleware to protect API routes
 */
const requireAuth = (req, res, next) => {
    const sessionId = req.cookies?.tradedash_auth;
    if (!sessionId) {
        return res.status(401).json({ error: 'Unauthorized: No session' });
    }
    
    const session = sessions.get(sessionId);
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

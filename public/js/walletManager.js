/**
 * WalletManager — handles MetaMask connection, local UI state persistence,
 * and EIP-712 Session Authentication.
 *
 * Multi-wallet: activeExchanges is now an array of objects:
 *   { exchange: 'nado', walletAddress: '0x...', label: 'Nado Main' }
 * For Extended, walletAddress is the authenticated session address (one per session).
 */
class WalletManager {
    constructor() {
        this.state = {
            address: null,
            chainId: null,
            activeExchanges: [], // Array of { id, exchange, walletAddress, label }
            extendedApiKeys: {}, // Tab-only, never persisted, keyed by entry.id
            variationalTokens: {} // Tab-only vr-tokens for Variational
        };

        this.DOMAIN_BASE = {
            name: 'TradeDash',
            version: '2.0',
            verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        this.init();
    }

    init() {
        const savedAddress = localStorage.getItem('wallet_state_address');
        const savedChainId  = localStorage.getItem('wallet_state_chainId');
        const savedExchanges = localStorage.getItem('wallet_state_exchanges_v3');

        if (savedAddress) {
            this.state.address = savedAddress;
            this.state.chainId = savedChainId;
        }

        if (savedExchanges) {
            try { this.state.activeExchanges = JSON.parse(savedExchanges); } catch(e) {}
        } else {
            // Migrate old string-array format
            const oldEx = localStorage.getItem('wallet_state_exchanges');
            if (oldEx) {
                try {
                    const old = JSON.parse(oldEx);
                    this.state.activeExchanges = old.map(exc => ({
                        id: exc + '_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                        exchange: exc,
                        walletAddress: null, // will use session address
                        label: exc.charAt(0).toUpperCase() + exc.slice(1)
                    }));
                    this._saveExchanges();
                } catch(e) {}
            }
        }

        // One-time migration: remove old vault data
        if (!localStorage.getItem('migration_v3_done')) {
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k.startsWith('vault:') || k.startsWith('encrypted:') || k.includes('privateKey') || k.includes('apiKey'))) {
                    toRemove.push(k);
                }
            }
            toRemove.forEach(k => localStorage.removeItem(k));
            localStorage.setItem('migration_v3_done', 'true');
        }

        this.waitForAppKit().then(() => {
            window.appKit.subscribeEvents(event => {
                if (event.data.event === 'MODAL_CLOSE' && !this.state.address) {}
            });
            window.appKit.subscribeAccount(account => {
                if (account.isConnected && account.address !== this.state.address) {
                    this.state.address = account.address;
                    localStorage.setItem('wallet_state_address', account.address);
                } else if (!account.isConnected && this.state.address) {
                    this.disconnect();
                }
            });
        });
    }

    _saveExchanges() {
        localStorage.setItem('wallet_state_exchanges_v3', JSON.stringify(this.state.activeExchanges));
    }

    async waitForAppKit() {
        while (!window.appKit) await new Promise(r => setTimeout(r, 100));
    }

    setExtendedApiKey(id, key) { 
        this.state.extendedApiKeys[id] = key; 
        localStorage.setItem('extendedApiKey_' + id, key);
    }
    getExtendedApiKey(id) { 
        return this.state.extendedApiKeys[id] || localStorage.getItem('extendedApiKey_' + id) || null; 
    }
    
    setVariationalToken(id, token) { 
        this.state.variationalTokens[id] = token; 
        localStorage.setItem('variationalToken_' + id, token);
    }
    getVariationalToken(id) { 
        return this.state.variationalTokens[id] || localStorage.getItem('variationalToken_' + id) || null; 
    }

    /**
     * Add a wallet entry.
     * @param {string} exchange - 'extended' | 'nado' | 'variational'
     * @param {string|null} walletAddress - specific wallet address (null = use session address)
     * @param {string|null} label - display label
     */
    addExchange(exchange, walletAddress = null, label = null) {
        const addr = (walletAddress || this.state.address || '').toLowerCase();
        
        const entry = {
            id: exchange + '_' + addr.slice(2, 8) + '_' + Date.now(),
            exchange,
            walletAddress: addr || null,
            label: label || (exchange.charAt(0).toUpperCase() + exchange.slice(1))
        };
        this.state.activeExchanges.push(entry);
        this._saveExchanges();
        return { success: true, id: entry.id };
    }

    /**
     * Remove wallet entry by its unique id.
     */
    removeExchange(id) {
        const entry = this.state.activeExchanges.find(e => e.id === id);
        this.state.activeExchanges = this.state.activeExchanges.filter(e => e.id !== id);
        this._saveExchanges();
        if (entry?.exchange === 'extended') {
            delete this.state.extendedApiKeys[id];
            localStorage.removeItem('extendedApiKey_' + id);
        }
        if (entry?.exchange === 'variational') {
            delete this.state.variationalTokens[id];
            localStorage.removeItem('variationalToken_' + id);
        }
    }

    async connectMetaMask() {
        await this.waitForAppKit();
        try {
            await window.appKit.open();
            let timeout = 60000, start = Date.now();
            while (!window.appKit.getIsConnected() && (Date.now() - start < timeout)) {
                await new Promise(r => setTimeout(r, 500));
            }
            if (window.appKit.getIsConnected()) {
                this.state.address = window.appKit.getAddress();
                this.state.chainId = '0x' + window.appKit.getChainId().toString(16);
                localStorage.setItem('wallet_state_address', this.state.address);
                return true;
            }
            return false;
        } catch (error) {
            console.error('AppKit connection failed:', error);
            return false;
        }
    }

    async loginToBackend() {
        if (!this.state.address) throw new Error("Wallet not connected");
        try {
            const nonceRes = await fetch(`/api/auth/nonce?address=${this.state.address}`);
            if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
            const { nonce } = await nonceRes.json();

            const message = {
                intent: 'Login to Dashboard',
                address: this.state.address,
                nonce,
                timestamp: Math.floor(Date.now() / 1000)
            };

            const types = {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                    { name: 'verifyingContract', type: 'address' }
                ],
                Login: [
                    { name: 'intent', type: 'string' },
                    { name: 'address', type: 'address' },
                    { name: 'nonce', type: 'string' },
                    { name: 'timestamp', type: 'uint256' }
                ]
            };

            const provider = new ethers.providers.Web3Provider(window.appKit.getWalletProvider());
            const signer = provider.getSigner();
            const domain = { ...this.DOMAIN_BASE, chainId: parseInt(this.state.chainId, 16) };
            const finalTypes = { ...types };
            delete finalTypes.EIP712Domain;

            const signature = await signer._signTypedData(domain, { Login: types.Login }, message);

            const verifyRes = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: this.state.address, signature, message, chainId: this.state.chainId })
            });

            if (!verifyRes.ok) throw new Error("Session verification failed");
            return true;
        } catch (e) {
            console.error("Auth flow error:", e);
            throw e;
        }
    }

    async logoutBackend() {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch(e) {}
    }

    disconnect() {
        this.logoutBackend();
        this.state.address = null;
        this.state.chainId = null;
        this.state.extendedApiKeys = {};
        this.state.variationalTokens = {};
        localStorage.removeItem('wallet_state_address');
        localStorage.removeItem('wallet_state_chainId');
        window.location.reload();
    }
}

window.walletManager = new WalletManager();

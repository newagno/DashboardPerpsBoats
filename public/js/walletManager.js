/**
 * WalletManager — handles MetaMask connection, local UI state persistence,
 * EIP-712 Session Authentication, and real-time backend synchronization.
 *
 * Multi-wallet: activeExchanges is now an array of objects:
 *   { id, exchange, walletAddress, label, updatedAt, manualData }
 */
// Safe UUID generator — works in HTTPS and HTTP (local IP / test envs)
const _generateId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substring(2);

class WalletManager {
    constructor() {
        this.state = {
            address: null,
            chainId: null,
            activeExchanges: [], // Array of { id, exchange, walletAddress, label, updatedAt, manualData }
            isAuthenticated: false
        };

        // CSRF header for all backend POST requests
        this._csrfHeaders = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'TradeDash'
        };

        this.DOMAIN_BASE = {
            name: 'TradeDash',
            version: '2.0',
            verifyingContract: '0x0000000000000000000000000000000000000000'
        };

        this._syncDebounceTimer = null;

        // Establish native BroadcastChannel for cross-tab synchronization
        this._syncChannel = new BroadcastChannel('wallet_state_sync');
        this._syncChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'EXCHANGES_UPDATED' && event.data.payload) {
                console.log('BroadcastChannel: Received activeExchanges update from another tab');

                // Compare before updating to prevent infinite redraw loops
                const localStr = JSON.stringify(this.state.activeExchanges);
                const incomingStr = JSON.stringify(event.data.payload);
                if (localStr !== incomingStr) {
                    this.state.activeExchanges = event.data.payload;

                    // Dispatch custom event to notify dashboard UI to re-render
                    const syncEvent = new CustomEvent('exchanges-synced', { detail: event.data.payload });
                    window.dispatchEvent(syncEvent);
                }
            }
        };

        this.init();
    }

    init() {
        const savedAddress = localStorage.getItem('wallet_state_address');
        const savedChainId = localStorage.getItem('wallet_state_chainId');
        const savedExchanges = localStorage.getItem('wallet_state_exchanges_v3');

        if (savedAddress) {
            this.state.address = savedAddress;
            this.state.chainId = savedChainId;
        }

        if (savedExchanges) {
            try { this.state.activeExchanges = JSON.parse(savedExchanges); } catch (e) { }
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
                        label: exc.charAt(0).toUpperCase() + exc.slice(1),
                        updatedAt: new Date(0).toISOString()
                    }));
                    this._saveExchanges();
                } catch (e) { }
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
                if (event.data.event === 'MODAL_CLOSE' && !this.state.address) { }
            });
            window.appKit.subscribeAccount(account => {
                if (account.isConnected && account.address !== this.state.address) {
                    this.state.address = account.address;
                    localStorage.setItem('wallet_state_address', account.address);

                    // Re-validate session when account changes
                    this.checkSession().then((isValid) => {
                        if (isValid) {
                            this.syncExchangesWithBackend();
                        } else {
                            // Session missing or expired (e.g. cleared cache). Prompt for signature to authenticate and sync.
                            this.loginToBackend().catch(err => {
                                console.error('Login signature rejected or failed:', err);
                            });
                        }
                    });
                } else if (!account.isConnected && this.state.address) {
                    this.disconnect();
                }
            });
        });
    }

    _saveExchanges() {
        localStorage.setItem('wallet_state_exchanges_v3', JSON.stringify(this.state.activeExchanges));
        if (this._syncChannel) {
            this._syncChannel.postMessage({
                type: 'EXCHANGES_UPDATED',
                payload: this.state.activeExchanges
            });
        }
        if (this.state.isAuthenticated) {
            this.syncExchangesToBackend().catch(err => console.error('Failed to save exchanges to server:', err));
        }
    }

    async waitForAppKit() {
        while (!window.appKit) await new Promise(r => setTimeout(r, 100));
    }

    setExtendedApiKey(id, key) {
        // Store in HttpOnly cookie via backend. Key is NOT kept in memory.
        return fetch('/api/exchanges/keys/store', {
            method: 'POST',
            headers: this._csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({ type: 'extended', entryId: id, value: key })
        }).then(r => r.json()).catch(e => { console.error('Failed to store Extended key:', e); return { success: false }; });
    }

    /** Check if an Extended API key cookie exists on the server. Returns Promise<boolean>. */
    async checkExtendedKeyExists(id) {
        try {
            const r = await fetch(`/api/exchanges/keys/check?type=extended&entryId=${encodeURIComponent(id)}`, { credentials: 'include' });
            const data = await r.json();
            return !!data.exists;
        } catch (e) { return false; }
    }

    setVariationalToken(id, token) {
        // Store in HttpOnly cookie via backend. Token is NOT kept in memory.
        return fetch('/api/exchanges/keys/store', {
            method: 'POST',
            headers: this._csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({ type: 'variational', entryId: id, value: token })
        }).then(r => r.json()).catch(e => { console.error('Failed to store Variational token:', e); return { success: false }; });
    }

    /** Check if a Variational token cookie exists on the server. Returns Promise<boolean>. */
    async checkVariationalTokenExists(id) {
        try {
            const r = await fetch(`/api/exchanges/keys/check?type=variational&entryId=${encodeURIComponent(id)}`, { credentials: 'include' });
            const data = await r.json();
            return !!data.exists;
        } catch (e) { return false; }
    }

    /**
     * Add a wallet entry.
     * @param {string} exchange - 'extended' | 'nado'
     * @param {string|null} walletAddress - specific wallet address (null = use session address)
     * @param {string|null} label - display label
     * @param {boolean} bypassAuth - if true, skips signatures / auth check (e.g. for Nado)
     */
    async addExchange(exchange, walletAddress = null, label = null, bypassAuth = false) {
        if (!bypassAuth && exchange !== 'nado' && !this.state.isAuthenticated) {
            if (this.state.address) {
                try { await this.loginToBackend(); } catch (e) { return { success: false, error: 'Login cancelled' }; }
            } else {
                await this.connectMetaMask();
                try { await this.loginToBackend(); } catch (e) { return { success: false, error: 'Login cancelled' }; }
            }
        }
        const addr = (walletAddress || this.state.address || '').toLowerCase();

        const entry = {
            id: _generateId(),
            exchange,
            walletAddress: addr || null,
            label: label || (exchange.charAt(0).toUpperCase() + exchange.slice(1)),
            updatedAt: new Date().toISOString()
        };
        this.state.activeExchanges.push(entry);
        this._saveExchanges();
        return { success: true, id: entry.id };
    }

    /**
     * Add a Variational exchange entry with manual data.
     * @param {object} manualData - { initDeposit, actDeposit, volume, points, rank }
     * @param {string|null} walletAddress - specific wallet address
     * @param {string|null} label - display label
     */
    async addVariationalManual(manualData, walletAddress = null, label = null) {
        if (!this.state.isAuthenticated) {
            if (this.state.address) {
                try { await this.loginToBackend(); } catch (e) { return { success: false, error: 'Login cancelled' }; }
            } else {
                await this.connectMetaMask();
                try { await this.loginToBackend(); } catch (e) { return { success: false, error: 'Login cancelled' }; }
            }
        }
        const entry = {
            id: _generateId(),
            exchange: 'variational',
            walletAddress: walletAddress || null,
            label: label || 'Variational',
            manualData: { ...manualData, inputDate: Date.now() },
            updatedAt: new Date().toISOString()
        };
        this.state.activeExchanges.push(entry);
        this._saveExchanges();
        return { success: true, id: entry.id };
    }

    /**
     * Update manual data for an existing Variational entry.
     * @param {string} id - entry id
     * @param {object} manualData - { initDeposit, actDeposit, volume, points, rank }
     * @param {string|null} walletAddress - specific wallet address
     */
    async updateVariationalManual(id, manualData, walletAddress = null) {
        if (!this.state.isAuthenticated) {
            if (this.state.address) {
                try { await this.loginToBackend(); } catch (e) { return false; }
            } else {
                await this.connectMetaMask();
                try { await this.loginToBackend(); } catch (e) { return false; }
            }
        }
        const entry = this.state.activeExchanges.find(e => e.id === id);
        if (!entry || entry.exchange !== 'variational') return false;
        entry.manualData = { ...manualData, inputDate: Date.now() };
        if (walletAddress !== null) entry.walletAddress = walletAddress;
        entry.updatedAt = new Date().toISOString();
        this._saveExchanges();
        return true;
    }

    /**
     * Remove wallet entry by its unique id.
     */
    async removeExchange(id) {
        const entry = this.state.activeExchanges.find(e => e.id === id); // Одне оголошення

        // Перевірка прав (якщо це не Nado, вимагаємо авторизацію)
        if (entry && entry.exchange !== 'nado' && !this.state.isAuthenticated) {
            if (this.state.address) {
                try { await this.loginToBackend(); } catch (e) { return; }
            } else {
                await this.connectMetaMask();
                try { await this.loginToBackend(); } catch (e) { return; }
            }
        }

        this.state.activeExchanges = this.state.activeExchanges.filter(e => e.id !== id);
        this._saveExchanges();
        if (entry?.exchange === 'extended') {
            // Remove HttpOnly cookie via backend
            fetch('/api/exchanges/keys/remove', {
                method: 'POST',
                headers: this._csrfHeaders,
                credentials: 'include',
                body: JSON.stringify({ type: 'extended', entryId: id })
            }).catch(() => { });
        }
        if (entry?.exchange === 'variational') {
            // Remove HttpOnly cookie via backend
            fetch('/api/exchanges/keys/remove', {
                method: 'POST',
                headers: this._csrfHeaders,
                credentials: 'include',
                body: JSON.stringify({ type: 'variational', entryId: id })
            }).catch(() => { });
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
                headers: this._csrfHeaders,
                credentials: 'include',
                body: JSON.stringify({ address: this.state.address, signature, message, chainId: this.state.chainId })
            });

            if (!verifyRes.ok) throw new Error("Session verification failed");

            this.state.isAuthenticated = true;
            await this.syncExchangesWithBackend();
            return true;
        } catch (e) {
            console.error("Auth flow error:", e);
            throw e;
        }
    }

    async logoutBackend() {
        try { await fetch('/api/auth/logout', { method: 'POST', headers: this._csrfHeaders, credentials: 'include' }); } catch (e) { }
    }

    disconnect() {
        this.logoutBackend();
        this.state.address = null;
        this.state.chainId = null;
        this.state.isAuthenticated = false;
        if (this._syncChannel) {
            this._syncChannel.close();
        }
        localStorage.removeItem('wallet_state_address');
        localStorage.removeItem('wallet_state_chainId');
        window.location.reload();
    }

    // ─── Robust Synchronization Strategies ─────────────────────────────────────

    /** Query check session endpoint on app load. Sets isAuthenticated flag. */
    async checkSession() {
        try {
            const r = await fetch('/api/auth/check');
            const data = await r.json();
            if (data.authenticated && data.address) {
                this.state.address = data.address;
                this.state.isAuthenticated = true;
                localStorage.setItem('wallet_state_address', data.address);
                return true;
            }
        } catch (e) {
            console.error('Session check failed:', e);
        }
        this.state.isAuthenticated = false;
        return false;
    }

    /**
     * Smart Merge algorithm that deduplicates local vs backend exchanges array,
     * resolving conflicts using the latest updatedAt timestamp.
     */
    mergeExchanges(local, backend) {
        const mergedMap = new Map();

        const getTimestamp = (isoStr) => {
            if (!isoStr) return 0;
            const t = Date.parse(isoStr);
            return isNaN(t) ? 0 : t;
        };

        // Populate local entries
        local.forEach(item => {
            if (!item.id) return;
            if (!item.updatedAt) {
                item.updatedAt = new Date(0).toISOString();
            }
            mergedMap.set(item.id, item);
        });

        // Merge backend entries
        backend.forEach(item => {
            if (!item.id) return;
            if (!item.updatedAt) {
                item.updatedAt = new Date(0).toISOString();
            }

            if (mergedMap.has(item.id)) {
                const existing = mergedMap.get(item.id);
                const localTime = getTimestamp(existing.updatedAt);
                const backendTime = getTimestamp(item.updatedAt);

                if (backendTime >= localTime) {
                    mergedMap.set(item.id, item);
                }
            } else {
                mergedMap.set(item.id, item);
            }
        });

        return Array.from(mergedMap.values());
    }

    /** Fetch exchanges from server and merge them with local storage using Smart Merge. */
    async syncExchangesWithBackend() {
        if (!this.state.isAuthenticated) return;
        try {
            const r = await fetch('/api/exchanges/active');
            if (r.ok) {
                const backendExchanges = await r.json();
                if (Array.isArray(backendExchanges)) {
                    const localExchanges = this.state.activeExchanges;

                    // Smart merge logic
                    const merged = this.mergeExchanges(localExchanges, backendExchanges);

                    this.state.activeExchanges = merged;
                    localStorage.setItem('wallet_state_exchanges_v3', JSON.stringify(merged));

                    // Dispatch custom event to notify dashboard UI to re-render immediately
                    const syncEvent = new CustomEvent('exchanges-synced', { detail: merged });
                    window.dispatchEvent(syncEvent);

                    // Upload merged array back to backend if backend was empty or different
                    const hasBackendDiff = backendExchanges.length !== merged.length ||
                        JSON.stringify(backendExchanges) !== JSON.stringify(merged);

                    if (hasBackendDiff) {
                        await this.syncExchangesToBackend();
                    }


                }
            }
        } catch (e) {
            console.error('Failed to sync active exchanges from backend:', e);
        }
    }

    /** Debounced push of local activeExchanges array to server (Fire-and-forget). */
    async syncExchangesToBackend() {
        if (!this.state.isAuthenticated) return;

        clearTimeout(this._syncDebounceTimer);
        this._syncDebounceTimer = setTimeout(async () => {
            try {
                const r = await fetch('/api/exchanges/active', {
                    method: 'POST',
                    headers: this._csrfHeaders,
                    body: JSON.stringify({ activeExchanges: this.state.activeExchanges })
                });
                if (!r.ok) {
                    console.error('Failed to sync exchanges to backend: server returned status', r.status);
                }
            } catch (e) {
                console.error('Failed to sync active exchanges to backend:', e);
            }
        }, 300);
    }

}

window.walletManager = new WalletManager();

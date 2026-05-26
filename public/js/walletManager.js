/**
 * WalletManager — local-first state manager for active exchange entries.
 * Stores activeExchanges exclusively in localStorage (wallet_state_exchanges_v3).
 * No Web3, no MetaMask, no EIP-712. API keys for Extended/Variational are
 * stored in server-side HttpOnly cookies via /api/exchanges/keys/*.
 *
 * Multi-wallet: activeExchanges is an array of objects:
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
            activeExchanges: [] // Array of { id, exchange, walletAddress, label, updatedAt, manualData }
        };

        // CSRF header for all backend POST requests
        this._csrfHeaders = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'TradeDash'
        };

        // Cross-tab synchronization via BroadcastChannel
        this._syncChannel = new BroadcastChannel('wallet_state_sync');
        this._syncChannel.onmessage = (event) => {
            if (event.data && event.data.type === 'EXCHANGES_UPDATED' && event.data.payload) {
                const localStr = JSON.stringify(this.state.activeExchanges);
                const incomingStr = JSON.stringify(event.data.payload);
                if (localStr !== incomingStr) {
                    this.state.activeExchanges = event.data.payload;
                    window.dispatchEvent(new CustomEvent('exchanges-synced', { detail: event.data.payload }));
                }
            }
        };

        this.init();
    }

    init() {
        const savedExchanges = localStorage.getItem('wallet_state_exchanges_v3');

        if (savedExchanges) {
            try { this.state.activeExchanges = JSON.parse(savedExchanges); } catch (e) { }
        } else {
            // One-time migration from old string-array format
            const oldEx = localStorage.getItem('wallet_state_exchanges');
            if (oldEx) {
                try {
                    const old = JSON.parse(oldEx);
                    this.state.activeExchanges = old.map(exc => ({
                        id: exc + '_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                        exchange: exc,
                        walletAddress: null,
                        label: exc.charAt(0).toUpperCase() + exc.slice(1),
                        updatedAt: new Date(0).toISOString()
                    }));
                    this._saveExchanges();
                } catch (e) { }
            }
        }

        // One-time migration: remove stale vault/encrypted keys from localStorage
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
    }

    _saveExchanges() {
        localStorage.setItem('wallet_state_exchanges_v3', JSON.stringify(this.state.activeExchanges));
        if (this._syncChannel) {
            this._syncChannel.postMessage({
                type: 'EXCHANGES_UPDATED',
                payload: this.state.activeExchanges
            });
        }
    }

    // ── HttpOnly Cookie API Key Management ────────────────────────────────────

    /** Store Extended API key in HttpOnly cookie via backend. Key is NOT kept in memory. */
    setExtendedApiKey(id, key) {
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

    /** Store Variational token in HttpOnly cookie via backend. Token is NOT kept in memory. */
    setVariationalToken(id, token) {
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

    // ── Exchange CRUD ─────────────────────────────────────────────────────────

    /**
     * Add a wallet entry.
     * @param {string} exchange - 'extended' | 'nado' | 'variational'
     * @param {string|null} walletAddress - specific wallet address
     * @param {string|null} label - display label
     */
    addExchange(exchange, walletAddress = null, label = null) {
        const addr = (walletAddress || '').toLowerCase() || null;
        const entry = {
            id: _generateId(),
            exchange,
            walletAddress: addr,
            label: label || (exchange.charAt(0).toUpperCase() + exchange.slice(1)),
            updatedAt: new Date().toISOString()
        };
        this.state.activeExchanges.push(entry);
        this._saveExchanges();
        return { success: true, id: entry.id };
    }

    /**
     * Add a Variational exchange entry with manual data.
     * @param {object} manualData - { initDeposit, actDeposit, volume, points, rank, winRate, roi }
     * @param {string|null} walletAddress - optional wallet address
     * @param {string|null} label - display label
     */
    addVariationalManual(manualData, walletAddress = null, label = null) {
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
     * @param {object} manualData - updated stats
     * @param {string|null} walletAddress - optional updated wallet address
     */
    updateVariationalManual(id, manualData, walletAddress = null) {
        const entry = this.state.activeExchanges.find(e => e.id === id);
        if (!entry || entry.exchange !== 'variational') return false;
        entry.manualData = { ...manualData, inputDate: Date.now() };
        if (walletAddress !== null) entry.walletAddress = walletAddress;
        entry.updatedAt = new Date().toISOString();
        this._saveExchanges();
        return true;
    }

    /**
     * Remove an exchange entry by its unique id.
     * Also removes the associated HttpOnly cookie if Extended or Variational.
     * @param {string} id - entry id
     */
    removeExchange(id) {
        const entry = this.state.activeExchanges.find(e => e.id === id);
        this.state.activeExchanges = this.state.activeExchanges.filter(e => e.id !== id);
        this._saveExchanges();

        if (entry?.exchange === 'extended') {
            fetch('/api/exchanges/keys/remove', {
                method: 'POST',
                headers: this._csrfHeaders,
                credentials: 'include',
                body: JSON.stringify({ type: 'extended', entryId: id })
            }).catch(() => { });
        }
        if (entry?.exchange === 'variational') {
            fetch('/api/exchanges/keys/remove', {
                method: 'POST',
                headers: this._csrfHeaders,
                credentials: 'include',
                body: JSON.stringify({ type: 'variational', entryId: id })
            }).catch(() => { });
        }
    }
}

window.walletManager = new WalletManager();

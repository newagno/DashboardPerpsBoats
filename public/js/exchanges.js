/**
 * Exchange API classes — each sends walletAddress in the request body
 * so the backend can route multi-wallet requests correctly.
 * All requests include X-Requested-With header for CSRF protection.
 */
class BaseExchange {
    constructor(exchangeName) {
        this.exchangeName = exchangeName;
        this.PROXY_BASE = '/api/exchanges';
    }

    async fetchData(url, options = {}) {
        try {
            // Ensure CSRF header is always present
            options.headers = options.headers || {};
            options.headers['X-Requested-With'] = 'TradeDash';
            options.credentials = 'include';

            const response = await fetch(url, options);
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching from ${this.exchangeName}:`, error);
            throw error;
        }
    }
}

class ExtendedExchange extends BaseExchange {
    constructor(apiKey, entryId) {
        super('Extended');
        this.apiKey = apiKey;
        this.entryId = entryId;
    }

    async getStats(signal) {
        return this.fetchData(`${this.PROXY_BASE}/extended/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Do NOT send apiKey in body — backend reads it from HttpOnly cookie by entryId
            body: JSON.stringify({ entryId: this.entryId }),
            signal
        });
    }
}

class NadoExchange extends BaseExchange {
    constructor(walletAddress) {
        super('Nado');
        this.walletAddress = walletAddress;
    }

    async getStats(signal) {
        // Only send address if authenticated — never send null, it fails Zod validation
        const sessionAddr = window.walletManager.state.address;
        const body = { walletAddress: this.walletAddress };
        if (sessionAddr) body.address = sessionAddr;
        return this.fetchData(`${this.PROXY_BASE}/nado/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal
        });
    }
}

class VariationalExchange extends BaseExchange {
    constructor(walletAddress) {
        super('Variational');
        this.walletAddress = walletAddress;
    }

    async getStats(signal) {
        // Only send address if authenticated — never send null, it fails Zod validation
        const sessionAddr = window.walletManager.state.address;
        const body = { walletAddress: this.walletAddress };
        if (sessionAddr) body.address = sessionAddr;
        return this.fetchData(`${this.PROXY_BASE}/variational/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal
        });
    }
}

window.Exchanges = {
    Extended: ExtendedExchange,
    Nado: NadoExchange,
    Variational: VariationalExchange
};

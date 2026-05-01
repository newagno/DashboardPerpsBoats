/**
 * Exchange API classes — each sends walletAddress in the request body
 * so the backend can route multi-wallet requests correctly.
 */
class BaseExchange {
    constructor(exchangeName) {
        this.exchangeName = exchangeName;
        this.PROXY_BASE = '/api/exchanges';
    }

    async fetchData(url, options = {}) {
        try {
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
    constructor(apiKey) {
        super('Extended');
        this.apiKey = apiKey;
    }

    async getStats() {
        return this.fetchData(`${this.PROXY_BASE}/extended/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: this.apiKey })
        });
    }
}

class NadoExchange extends BaseExchange {
    constructor(walletAddress) {
        super('Nado');
        this.walletAddress = walletAddress;
    }

    async getStats() {
        return this.fetchData(`${this.PROXY_BASE}/nado/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: window.walletManager.state.address,
                walletAddress: this.walletAddress  // specific wallet for multi-wallet support
            })
        });
    }
}

class VariationalExchange extends BaseExchange {
    constructor(walletAddress) {
        super('Variational');
        this.walletAddress = walletAddress;
    }

    async getStats() {
        return this.fetchData(`${this.PROXY_BASE}/variational/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                address: window.walletManager.state.address,
                walletAddress: this.walletAddress  // specific wallet for multi-wallet support
            })
        });
    }
}

window.Exchanges = {
    Extended: ExtendedExchange,
    Nado: NadoExchange,
    Variational: VariationalExchange
};

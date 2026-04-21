/**
 * Base Exchange class defining the interface and common logic.
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
                throw new Error(errData.error || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Error fetching from ${this.exchangeName}:`, error);
            throw error;
        }
    }
}

/**
 * Extended Exchange (Starknet)
 */
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

/**
 * Nado Exchange (Ink L2)
 */
class NadoExchange extends BaseExchange {
    constructor(address, signature) {
        super('Nado');
        this.address = address;
        this.signature = signature;
    }

    async getStats() {
        return this.fetchData(`${this.PROXY_BASE}/nado/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                address: this.address,
                signature: this.signature 
            })
        });
    }
}

/**
 * Variational Exchange (Arbitrum)
 */
class VariationalExchange extends BaseExchange {
    constructor(address, signature) {
        super('Variational');
        this.address = address;
        this.signature = signature;
    }

    async getStats() {
        // Variational proxy updated to POST to support signatures
        return this.fetchData(`${this.PROXY_BASE}/variational/stats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                address: this.address,
                signature: this.signature 
            })
        });
    }
}


window.Exchanges = {
    Extended: ExtendedExchange,
    Nado: NadoExchange,
    Variational: VariationalExchange
};

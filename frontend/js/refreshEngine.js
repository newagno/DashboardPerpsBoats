/**
 * RefreshEngine — periodic polling and manual refresh.
 * Multi-wallet: iterates over all { id, exchange, walletAddress } entries independently.
 */
class RefreshEngine {
    constructor() {
        this.interval = 5 * 60 * 1000; // 5 minutes
        this.timerId = null;
        this.isRefreshing = false;
    }

    start() {
        this.refresh();
        this.timerId = setInterval(() => this.refresh(), this.interval);
    }

    stop() {
        if (this.timerId) clearInterval(this.timerId);
    }

    async refresh() {
        if (this.isRefreshing) return;

        console.log('Starting parallel refresh cycle...');
        this.isRefreshing = true;
        this.updateLoadingState(true);

        const sessionAddress = window.walletManager.state.address;
        if (!sessionAddress) {
            this.isRefreshing = false;
            this.updateLoadingState(false);
            return;
        }

        const exchangeEntries = window.walletManager.state.activeExchanges;

        if (!exchangeEntries || exchangeEntries.length === 0) {
            this.isRefreshing = false;
            this.updateLoadingState(false);
            window.dashboardMgr.updateAllWalletCards([]);
            return;
        }

        // Each entry is { id, exchange, walletAddress, label }
        const refreshPromises = exchangeEntries.map(async (entry) => {
            const { id, exchange, walletAddress, label } = entry;
            // Effective wallet: use entry's walletAddress or fall back to session address
            const effectiveAddress = walletAddress || sessionAddress;

            try {
                let data;
                if (exchange === 'extended') {
                    const extendedKey = window.walletManager.getExtendedApiKey(id);
                    if (!extendedKey) return null;
                    const obj = new window.Exchanges.Extended(extendedKey);
                    data = await obj.getStats();
                } else if (exchange === 'nado') {
                    // Pass walletAddress as 'walletAddress' so server uses that specific address
                    const obj = new window.Exchanges.Nado(effectiveAddress);
                    data = await obj.getStats();
                } else if (exchange === 'variational') {
                    const vrToken = window.walletManager.getVariationalToken(id);
                    const obj = new window.Exchanges.Variational(effectiveAddress, vrToken);
                    data = await obj.getStats();
                } else {
                    return null;
                }

                return { id, exchange, walletAddress: effectiveAddress, label, data, success: true };
            } catch (error) {
                console.error(`Failed to refresh ${exchange} (${effectiveAddress}):`, error);
                return { id, exchange, walletAddress: effectiveAddress, label, error: error.message, success: false };
            }
        });

        const results = (await Promise.all(refreshPromises)).filter(r => r !== null);

        window.dashboardMgr.updateAllWalletCards(results);
        window.dashboardMgr.updateSummary();
        document.getElementById('last-update').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

        this.isRefreshing = false;
        this.updateLoadingState(false);
    }

    updateLoadingState(loading) {
        const overlay = document.getElementById('loading-overlay');
        const refreshBtn = document.getElementById('refresh-btn');
        if (loading) {
            overlay.style.display = 'flex';
            refreshBtn.classList.add('spinning');
        } else {
            overlay.style.display = 'none';
            refreshBtn.classList.remove('spinning');
        }
    }
}

window.refreshEngine = new RefreshEngine();

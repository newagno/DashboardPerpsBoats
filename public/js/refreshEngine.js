/**
 * RefreshEngine — periodic polling and manual refresh.
 * Multi-wallet: iterates over all { id, exchange, walletAddress } entries independently.
 */
class RefreshEngine {
    constructor() {
        this.interval = 5 * 60 * 1000; // 5 minutes
        this.timerId = null;
        this.isRefreshing = false;
        this.isNextCircle = true;
    }

    start() {
        this.loadFromCache();
        this.refresh();
        this.timerId = setInterval(() => this.refresh(), this.interval);
    }

    loadFromCache() {
        try {
            const cacheStr = localStorage.getItem('exchange_cache_v1');
            if (!cacheStr) return;
            const cache = JSON.parse(cacheStr);
            const cachedResults = [];
            
            const exchangeEntries = window.walletManager.state.activeExchanges || [];
            exchangeEntries.forEach(entry => {
                if (entry.exchange === 'variational') {
                    const md = entry.manualData;
                    if (md) {
                        const data = {
                            init_deposit: md.initDeposit || 0,
                            act_deposit:  md.actDeposit  || 0,
                            total_volume: md.volume      || 0,
                            points:       md.points      || 0,
                            rank:         md.rank        || null,
                            win_rate:     md.winRate     || 0,
                            _inputDate:   md.inputDate   || null
                        };
                        cachedResults.push({ id: entry.id, exchange: entry.exchange, walletAddress: entry.walletAddress, label: entry.label, data, success: true });
                    }
                } else if (cache[entry.id]) {
                    cachedResults.push(cache[entry.id]);
                }
            });
            
            if (cachedResults.length > 0) {
                window.dashboardMgr.updateAllWalletCards(cachedResults);
                document.getElementById('last-update').textContent = `Cached data loaded`;
            }
        } catch (e) {
            console.error("Failed to load cache", e);
        }
    }

    stop() {
        if (this.timerId) clearInterval(this.timerId);
    }

    async refresh() {
        if (this.isRefreshing) return;

        console.log('Starting parallel refresh cycle...');
        this.isRefreshing = true;
        const isInitial = Object.keys(window.dashboardMgr.walletData || {}).length === 0;
        this.updateLoadingState(true, isInitial);

        const exchangeEntries = window.walletManager.state.activeExchanges;
        const sessionAddress = window.walletManager.state.address;

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
                    if (!extendedKey) {
                        console.warn(`Ghost entry detected for extended (id: ${id}). Removing.`);
                        window.walletManager.removeExchange(id);
                        return null;
                    }
                    const obj = new window.Exchanges.Extended(extendedKey);
                    data = await obj.getStats();
                } else if (exchange === 'nado') {
                    // Pass walletAddress as 'walletAddress' so server uses that specific address
                    const obj = new window.Exchanges.Nado(effectiveAddress);
                    data = await obj.getStats();
                } else if (exchange === 'variational') {
                    // Manual data short-circuit — no API call, read from stored entry
                    if (!entry.manualData) {
                        console.warn(`Variational entry ${id} has no manualData. Removing.`);
                        window.walletManager.removeExchange(id);
                        return null;
                    }
                    const md = entry.manualData;
                    data = {
                        init_deposit: md.initDeposit || 0,
                        act_deposit:  md.actDeposit  || 0,
                        total_volume: md.volume      || 0,
                        points:       md.points      || 0,
                        rank:         md.rank        || null,
                        win_rate:     md.winRate     || 0,
                        _inputDate:   md.inputDate   || null
                    };
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

        // Update cache
        try {
            const cacheStr = localStorage.getItem('exchange_cache_v1');
            const cache = cacheStr ? JSON.parse(cacheStr) : {};
            results.forEach(r => {
                if (r.success && r.exchange !== 'variational') {
                    cache[r.id] = r;
                }
            });
            localStorage.setItem('exchange_cache_v1', JSON.stringify(cache));
        } catch (e) {
            console.error("Failed to update cache", e);
        }

        window.dashboardMgr.updateAllWalletCards(results);
        window.dashboardMgr.updateSummary();
        document.getElementById('last-update').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

        this.isRefreshing = false;
        this.updateLoadingState(false);
    }

    updateLoadingState(loading, isInitial = false) {
        const overlay = document.getElementById('loading-overlay');
        const refreshBtn = document.getElementById('refresh-btn');
        if (loading) {
            if (isInitial) overlay.style.display = 'flex';
            if (this.isNextCircle) {
                refreshBtn.style.animation = 'spin-to-circle 1s linear infinite';
            } else {
                refreshBtn.style.animation = 'spin-to-square 1s linear infinite';
            }
        } else {
            overlay.style.display = 'none';
            refreshBtn.style.animation = 'none';
            if (this.isNextCircle) {
                refreshBtn.style.borderRadius = '50%';
                this.isNextCircle = false;
            } else {
                refreshBtn.style.borderRadius = '0%';
                this.isNextCircle = true;
            }
        }
    }
}

window.refreshEngine = new RefreshEngine();

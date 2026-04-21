/**
 * RefreshEngine handles the periodic polling and manual refreshing of data.
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

        const wallets = window.cryptoMgr.getWallets();
        
        // Map wallets to a list of promises for parallel execution
        const refreshPromises = wallets.map(async (wallet) => {
            try {
                let exchangeObj;
                const decryptedSignature = wallet.sessionSignature ? window.cryptoMgr.decrypt(wallet.sessionSignature) : null;
                
                if (wallet.exchange === 'extended') {
                    const decryptedKey = window.cryptoMgr.decrypt(wallet.apiKey);
                    exchangeObj = new window.Exchanges.Extended(decryptedKey);
                } else if (wallet.exchange === 'nado') {
                    exchangeObj = new window.Exchanges.Nado(wallet.address, decryptedSignature);
                } else if (wallet.exchange === 'variational') {
                    exchangeObj = new window.Exchanges.Variational(wallet.address, decryptedSignature);
                }

                if (exchangeObj) {
                    const data = await exchangeObj.getStats();
                    return { id: wallet.id, exchange: wallet.exchange, data, success: true };
                }
            } catch (error) {
                console.error(`Failed to refresh wallet ${wallet.id}:`, error);
                return { id: wallet.id, exchange: wallet.exchange, error: error.message, success: false };
            }
            return null;
        });

        const results = (await Promise.all(refreshPromises)).filter(r => r !== null);

        // Update UI
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

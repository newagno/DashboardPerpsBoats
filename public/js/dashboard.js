/**
 * DashboardManager — UI rendering and API interactions.
 */
class DashboardManager {
    constructor() {
        this.walletsContainer = document.getElementById('wallets-container');
        this.btnAddExchange   = document.getElementById('btn-add-exchange');
        this.modalAddExchange = document.getElementById('modal-add-exchange');
        this.exchangeSelect   = document.getElementById('exchange-select');
        this.extendedConfigGroup = document.getElementById('extended-config-group');
        this.btnSaveExchange  = document.getElementById('btn-save-exchange');

        this.walletData = {};
    }

    async init() {
        this.setupEasterEgg();
        this.setupEventListeners();
        this.checkAuthState();
    }

    checkAuthState() {
        const hasExchanges = window.walletManager.state.activeExchanges.length > 0;
        if (hasExchanges) {
            this.renderLoading();
            setTimeout(() => window.refreshEngine.refresh(), 500);
        } else {
            this.walletsContainer.innerHTML = '<div class="empty-state"><p>NO ACTIVE SESSION OR EXCHANGES. CLICK "ADD_EXCHANGE" TO INITIALIZE.</p></div>';
        }
    }

    setupEventListeners() {
        this.btnAddExchange.addEventListener('click', () => {
            this.modalAddExchange.style.display = 'flex';
        });

        this.exchangeSelect.addEventListener('change', (e) => {
            const v = e.target.value;
            this.extendedConfigGroup.style.display = v === 'extended' ? 'block' : 'none';
            document.getElementById('multi-wallet-group').style.display = v ? 'block' : 'none';
            document.getElementById('label-group').style.display = v ? 'block' : 'none';
        });

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => { this.modalAddExchange.style.display = 'none'; });
        });

        this.btnSaveExchange.addEventListener('click', async () => {
            const exc = this.exchangeSelect.value;
            if (!exc) return;
            const labelInput = document.getElementById('wallet-label-input');
            const addrInput = document.getElementById('wallet-address-input');
            const label = labelInput?.value.trim();
            const walletAddr = addrInput?.value.trim();
            
            const result = window.walletManager.addExchange(exc, walletAddr, label);
            if (exc === 'extended') {
                const pkInput = document.getElementById('extended-api-key');
                const pk = pkInput.value.trim();
                window.walletManager.setExtendedApiKey(result.id, pk);
                pkInput.value = ''; // clear
            }
            
            // Clear fields
            if (labelInput) labelInput.value = '';
            if (addrInput) addrInput.value = '';
            this.exchangeSelect.value = '';
            this.extendedConfigGroup.style.display = 'none';
            document.getElementById('multi-wallet-group').style.display = 'none';
            document.getElementById('label-group').style.display = 'none';
            
            this.modalAddExchange.style.display = 'none';
            if (walletAddr) this.saveWalletAddressHistory(walletAddr);
            window.refreshEngine.refresh();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            window.refreshEngine.refresh();
        });
    }

    saveWalletAddressHistory(address) {
        let history = [];
        try { history = JSON.parse(localStorage.getItem('wallet_history') || '[]'); } catch(e) {}
        if (!history.includes(address)) {
            history.unshift(address);
            if (history.length > 10) history.pop();
            localStorage.setItem('wallet_history', JSON.stringify(history));
            this.populateWalletHistory();
        }
    }

    populateWalletHistory() {
        const datalist = document.getElementById('wallet-address-history');
        if (!datalist) return;
        datalist.innerHTML = '';
        let history = [];
        try { history = JSON.parse(localStorage.getItem('wallet_history') || '[]'); } catch(e) {}
        history.forEach(addr => {
            const option = document.createElement('option');
            option.value = addr;
            datalist.appendChild(option);
        });
    }

    setupEasterEgg() {
        const key = document.getElementById('draggable-key');
        const chest = document.getElementById('treasure-chest');
        const modal = document.getElementById('easter-egg-modal');
        if (!key || !chest) return;
        key.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'key'); });
        chest.addEventListener('dragover', (e) => { e.preventDefault(); });
        chest.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.getData('text/plain') === 'key') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
                modal.style.display = 'flex';
            }
        });
    }

    renderLoading() {
        this.walletsContainer.innerHTML = '<div class="empty-state"><p>SYNCHRONIZING EXCHANGE ACCOUNTS...</p></div>';
    }

    updateAllWalletCards(results) {
        this.walletsContainer.innerHTML = '';
        if (!results || results.length === 0) {
            this.walletsContainer.innerHTML = '<div class="empty-state"><p>NO EXCHANGES ADDED.</p></div>';
            return;
        }

        results.forEach(res => {
            if (res.success) {
                this.walletData[res.id] = this.processExchangeData(res.exchange, res.data);
            }
            this.walletsContainer.appendChild(this.createExchangeCard(res));
        });
        this.updateSummary();
    }

    createExchangeCard(res) {
        const { id, exchange, walletAddress, label, success, error } = res;
        const card = document.createElement('div');
        card.className = 'wallet-card';
        const excName = exchange.charAt(0).toUpperCase() + exchange.slice(1);
        const addrShort = window.Utils.truncateAddress(walletAddress || '');
        
        let logoUrl = '';
        if (exchange === 'nado') logoUrl = 'assets/nado.png';
        else if (exchange === 'extended') logoUrl = 'assets/Extended.png';
        
        const logoHtml = logoUrl ? `<img src="${logoUrl}" style="width: 18px; height: 18px; border-radius: 50%; vertical-align: middle; margin-right: 8px;">` : '';
        const labelHtml = label ? `<span class="wallet-label" style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.8em; margin-left: 10px; border: 1px solid rgba(255,255,255,0.2);">${label}</span>` : '';

        if (!success) {
            card.innerHTML = `
                <div class="card-header" style="display: flex; align-items: center;">
                    ${logoHtml}
                    <span class="exchange-badge">${excName}</span>
                    ${labelHtml}
                    <span class="wallet-address-truncated" style="margin-left: auto; margin-right: 15px;">ID: ${addrShort}</span>
                    <button class="remove-btn" onclick="window.dashboardMgr.removeWallet('${id}')">×</button>
                </div>
                <div class="card-body error-text" style="padding:20px; color:#ff6b6b;">
                    SYNC ERROR: ${error || 'Connection Failed'}
                </div>`;
            return card;
        }

        const data = this.walletData[id] || {};
        const pnlClass = (data.pnl || 0) >= 0 ? 'positive' : 'negative';

        card.innerHTML = `
            <div class="card-header" style="display: flex; align-items: center;">
                ${logoHtml}
                <span class="exchange-badge">${excName}</span>
                ${labelHtml}
                <span class="wallet-address-truncated" style="margin-left: auto; margin-right: 15px;">ID: ${addrShort}</span>
                <button class="remove-btn" onclick="window.dashboardMgr.removeWallet('${id}')">×</button>
            </div>
            <div class="wallet-stats-grid">
                <div class="wallet-stat"><span class="stat-label">INIT_DEPOSIT</span><span class="stat-value">${window.Utils.formatCurrency(data.initDeposit)}</span></div>
                <div class="wallet-stat"><span class="stat-label">ACT_DEPOSIT</span><span class="stat-value">${window.Utils.formatCurrency(data.actDeposit)}</span></div>
                <div class="wallet-stat"><span class="stat-label">VOLUME</span><span class="stat-value">${window.Utils.formatCurrency(data.volume)}</span></div>
                <div class="wallet-stat"><span class="stat-label">POINTS</span><span class="stat-value">${(data.points || 0).toLocaleString()}</span></div>
                <div class="wallet-stat"><span class="stat-label">RANK</span><span class="stat-value">${data.rank ? data.rank : 'N/A'}</span></div>
                <div class="wallet-stat"><span class="stat-label">PNL</span><span class="stat-value ${pnlClass}">${window.Utils.formatCurrency(data.pnl)}</span></div>
                <div class="wallet-stat"><span class="stat-label">WIN_RATE</span><span class="stat-value">${window.Utils.formatPercent(data.winRate)}</span></div>
            </div>
            <div class="wallet-footer">
                <span class="timestamp">Last sync: ${new Date().toLocaleTimeString()}</span>
            </div>`;
        return card;
    }

    removeWallet(id) {
        window.walletManager.removeExchange(id);
        delete this.walletData[id];
        this.updateAllWalletCards(Object.values(window.walletManager.state.activeExchanges).map(e => ({...e, success: false, error: 'Refreshing...'})));
        window.refreshEngine.refresh();
    }

    processExchangeData(exchange, rawData) {
        const d = { initDeposit: 0, actDeposit: 0, volume: 0, points: 0, pnl: 0, winRate: 0 };
        d.initDeposit = rawData.init_deposit || 0;
        d.actDeposit = rawData.act_deposit || 0;
        d.volume = rawData.total_volume || 0;
        d.winRate = rawData.win_rate || 0;
        d.pnl = d.actDeposit - d.initDeposit;
        d.rank = rawData.rank;
        
        if (exchange === 'nado') {
            const ptsVal = rawData.points?.points || rawData.points || 0;
            d.points = Math.round(parseFloat(ptsVal) / 1e18);
        } else {
            if (Array.isArray(rawData.points)) {
                d.points = rawData.points.reduce((sum, p) => sum + parseFloat(p.amount || p.points || p.reward || p.value || 0), 0);
            } else if (typeof rawData.points === 'object' && rawData.points !== null) {
                if (Array.isArray(rawData.points.data)) {
                    d.points = rawData.points.data.reduce((sum, season) => {
                        if (season.epochRewards && Array.isArray(season.epochRewards)) {
                            return sum + season.epochRewards.reduce((epochSum, epoch) => epochSum + parseFloat(epoch.pointsReward || 0), 0);
                        }
                        return sum + parseFloat(season.amount || season.points || season.reward || season.value || 0);
                    }, 0);
                } else {
                    d.points = parseFloat(rawData.points.total || rawData.points.points || rawData.points.amount || rawData.points.total_points || 0);
                }
            } else {
                d.points = parseFloat(rawData.points) || 0;
            }
        }
        
        // Final safety net to prevent [object Object] rendering
        if (typeof d.points === 'object' || isNaN(d.points)) {
            d.points = 0;
        } else if (exchange !== 'extended') {
            d.points = Math.round(d.points);
        } else {
            // Keep precision for Extended points
            d.points = parseFloat(d.points.toFixed(2));
        }
        
        return d;
    }

    updateSummary() {
        let totalInit = 0, totalPnL = 0, totalVol = 0, totalWinRate = 0, winRateCount = 0;
        Object.values(this.walletData).forEach(d => {
            totalInit += d.initDeposit;
            totalPnL += d.pnl;
            totalVol += d.volume;
            if (typeof d.winRate === 'number' && !isNaN(d.winRate) && d.winRate > 0) {
                totalWinRate += d.winRate;
                winRateCount++;
            }
        });
        const meanWinRate = winRateCount > 0 ? (totalWinRate / winRateCount) : 0;
        document.getElementById('total-deposit').textContent = window.Utils.formatCurrency(totalInit);
        document.getElementById('total-pnl').textContent = window.Utils.formatCurrency(totalPnL);
        document.getElementById('total-volume').textContent = window.Utils.formatCurrency(totalVol);
        document.getElementById('total-win-rate').textContent = window.Utils.formatPercent(meanWinRate);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMgr = new DashboardManager();
    window.dashboardMgr.populateWalletHistory();
    window.dashboardMgr.init();
});
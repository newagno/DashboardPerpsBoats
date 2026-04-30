/**
 * DashboardManager — UI rendering and API interactions.
 * Multi-wallet: each result has a unique { id, exchange, walletAddress, label }.
 * New metrics per card: INIT_DEPOSIT, ACT_DEPOSIT (renamed from NET_DEPOSIT), RANK (last row).
 */
class DashboardManager {
    constructor() {
        this.walletsContainer = document.getElementById('wallets-container');
        this.btnAddExchange   = document.getElementById('btn-add-exchange');
        this.modalAddExchange = document.getElementById('modal-add-exchange');
        this.exchangeSelect   = document.getElementById('exchange-select');
        this.extendedConfigGroup = document.getElementById('extended-config-group');
        this.btnSaveExchange  = document.getElementById('btn-save-exchange');

        // keyed by unique wallet entry id
        this.walletData = {};
    }

    async init() {
        this.setupEasterEgg();
        this.setupEventListeners();
        this.checkAuthState();
    }

    checkAuthState() {
        const addr = window.walletManager.state.address;
        const hasExchanges = window.walletManager.state.activeExchanges.length > 0;
        if (addr || hasExchanges) {
            this.renderLoading();
            setTimeout(() => window.refreshEngine.start(), 500);
            setTimeout(() => window.refreshEngine.refresh(), 1000);
        } else {
            this.walletsContainer.innerHTML = '<div class="empty-state"><p>NO ACTIVE SESSION OR EXCHANGES. CLICK "ADD_EXCHANGE" TO INITIALIZE.</p></div>';
        }
    }

    setupEventListeners() {
        this.btnAddExchange.addEventListener('click', () => {
            this.modalAddExchange.style.display = 'flex';
            document.getElementById('extended-api-key').value = window.walletManager.getExtendedApiKey() || '';
            document.getElementById('wallet-address-input').value = '';
            document.getElementById('wallet-label-input').value = '';
            this.exchangeSelect.value = '';
            this.extendedConfigGroup.style.display = 'none';
            document.getElementById('variational-config-group').style.display = 'none';
            document.getElementById('multi-wallet-group').style.display = 'none';
            document.getElementById('label-group').style.display = 'none';
        });

        this.exchangeSelect.addEventListener('change', (e) => {
            const v = e.target.value;
            this.extendedConfigGroup.style.display = v === 'extended' ? 'block' : 'none';
            document.getElementById('variational-config-group').style.display = 'none'; // disabled
            // Show wallet address and label for any selected exchange
            document.getElementById('multi-wallet-group').style.display = v ? 'block' : 'none';
            document.getElementById('label-group').style.display = v ? 'block' : 'none';
        });

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => { this.modalAddExchange.style.display = 'none'; });
        });

        this.btnSaveExchange.addEventListener('click', async () => {
            const exc = this.exchangeSelect.value;
            if (!exc) { alert('Please select an exchange.'); return; }

            try {
                this.btnSaveExchange.innerHTML = 'Authenticating...';

                const label = document.getElementById('wallet-label-input')?.value.trim() || null;
                const inputAddr = document.getElementById('wallet-address-input')?.value.trim() || null;
                const walletAddr = inputAddr || null;

                // Force user to input an address manually if they don't have a session
                if (!walletAddr && !window.walletManager.state.address) {
                    alert('Please enter a wallet address for this exchange.');
                    this.btnSaveExchange.innerHTML = 'Save Exchange';
                    return;
                }
                
                const result = window.walletManager.addExchange(exc, walletAddr, label);
                if (!result) {
                    alert('This wallet is already added for this exchange.');
                    return;
                }

                if (exc === 'extended') {
                    const pk = document.getElementById('extended-api-key').value.trim();
                    window.walletManager.setExtendedApiKey(result.id, pk);
                }
                
                if (exc === 'variational') {
                    const vt = document.getElementById('variational-token').value.trim();
                    if (vt) window.walletManager.setVariationalToken(result.id, vt);
                }

                this.modalAddExchange.style.display = 'none';
                this.checkAuthState();
            } catch(e) {
                console.error(e);
                alert('Authentication failed. Check your MetaMask or console.');
            } finally {
                this.btnSaveExchange.innerHTML = originalText;
            }
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            if (window.walletManager.state.address) window.refreshEngine.refresh();
        });
    }

    setupEasterEgg() {
        const key = document.getElementById('draggable-key');
        const chest = document.getElementById('treasure-chest');
        const modal = document.getElementById('easter-egg-modal');
        if (!key || !chest) return;
        key.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'key'); key.style.opacity = '0.5'; });
        key.addEventListener('dragend', () => { key.style.opacity = '1'; });
        chest.addEventListener('dragover', (e) => { e.preventDefault(); chest.classList.add('drag-over'); });
        chest.addEventListener('dragleave', () => { chest.classList.remove('drag-over'); });
        chest.addEventListener('drop', (e) => {
            e.preventDefault();
            chest.classList.remove('drag-over');
            if (e.dataTransfer.getData('text/plain') === 'key') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ff6b6b', '#667eea', '#ffffff'] });
                modal.style.display = 'flex';
                const orig = chest.innerHTML;
                chest.innerHTML = '<span style="font-size:32px">🔓</span>';
                setTimeout(() => { chest.innerHTML = orig; }, 3000);
            }
        });
    }

    renderLoading() {
        this.walletsContainer.innerHTML = '<div class="empty-state"><p>SYNCHRONIZING EXCHANGE ACCOUNTS...</p></div>';
    }

    /**
     * @param {Array} results - [{id, exchange, walletAddress, label, data, success, error}]
     */
    updateAllWalletCards(results) {
        if (!window.walletManager.state.address) return;
        this.walletsContainer.innerHTML = '';

        if (results.length === 0) {
            this.walletsContainer.innerHTML = '<div class="empty-state"><p>NO EXCHANGES ADDED. CLICK "ADD_EXCHANGE" SET UP A STREAM.</p></div>';
            this.updateSummary();
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
        const card = document.createElement('div');
        card.className = 'wallet-card';
        const { id, exchange: exc, walletAddress, label } = res;
        const excName = exc.charAt(0).toUpperCase() + exc.slice(1);
        const displayAddr = walletAddress || window.walletManager.state.address || '';
        const addrShort = window.Utils.truncateAddress(displayAddr);
        let logoName = exc === 'nado' ? 'nado' : excName.toLowerCase();

        if (!res.success) {
            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <span class="exchange-badge">
                            <img src="assets/${logoName}.png" alt="${excName}" style="height:1em;width:auto;vertical-align:middle;margin-right:6px;">${excName}
                        </span>
                        <span class="wallet-address-truncated">ID: ${addrShort}</span>
                        ${label ? `<div style="font-size:0.75em;color:#4ade80;margin-top:2px;">${label}</div>` : ''}
                    </div>
                </div>
                <div class="empty-state" style="padding:20px;font-size:0.8em;color:#ff6b6b;">
                    DATA_UNAVAILABLE: ${res.error || 'Connection Failed'}
                </div>
                <div style="text-align:right;padding:10px;">
                    <button class="btn-secondary" style="font-size:0.7em;" onclick="window.dashboardMgr.removeWallet('${id}')">REMOVE</button>
                </div>`;
            return card;
        }

        const data = this.walletData[id] || {};
        const securityStatus = exc === 'extended' ? 'API_KEY_AUTH (Tab-Only)' : 'WEB3_SESSION (Secure Cookie)';
        const pnlClass = (data.pnl || 0) >= 0 ? 'positive' : 'negative';
        const roiClass = (data.roi || 0) >= 0 ? 'positive' : 'negative';
        const rankDisplay = data.rank != null ? `#${data.rank.toLocaleString()}` : 'N/A';

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="exchange-badge">
                        <img src="assets/${logoName}.png" alt="${excName}" style="height:1em;width:auto;vertical-align:middle;margin-right:6px;display:inline-block;">${excName}
                    </span>
                    <span class="wallet-address-truncated" title="${displayAddr}">ID: ${addrShort}</span>
                    ${label ? `<div style="font-size:0.75em;color:#4ade80;margin-top:2px;">${label}</div>` : ''}
                </div>
                <button class="btn-secondary" style="font-size:0.7em;border-color:rgba(255,107,107,0.4);color:#ff6b6b;" onclick="window.dashboardMgr.removeWallet('${id}')">X</button>
            </div>

            <div class="wallet-stats-grid">
                <div class="wallet-stat">
                    <span class="stat-label">01 // INIT_DEPOSIT</span>
                    <span class="stat-value">${window.Utils.formatCurrency(data.initDeposit || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">02 // ACT_DEPOSIT</span>
                    <span class="stat-value">${window.Utils.formatCurrency(data.actDeposit || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">03 // VOLUME</span>
                    <span class="stat-value">${window.Utils.formatCurrency(data.volume || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">04 // POINTS</span>
                    <span class="stat-value">${(data.points || 0).toLocaleString()}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">05 // PNL</span>
                    <span class="stat-value ${pnlClass}">${window.Utils.formatCurrency(data.pnl || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">06 // ROI %</span>
                    <span class="stat-value ${roiClass}">${window.Utils.formatPercent(data.roi || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">07 // WIN_RATE %</span>
                    <span class="stat-value">${window.Utils.formatPercent(data.winRate || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">08 // RANK</span>
                    <span class="stat-value">${rankDisplay}</span>
                </div>
            </div>

            <div class="wallet-footer" style="padding:10px 15px;border-top:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
                <span class="security-badge status-protected">${securityStatus}</span>
                <span class="timestamp wallet-last-update">STB: ${new Date().toLocaleTimeString()}</span>
            </div>`;

        return card;
    }

    removeWallet(id) {
        window.walletManager.removeExchange(id);
        delete this.walletData[id];
        window.refreshEngine.refresh();
    }

    processExchangeData(exchange, rawData) {
        const d = {
            initDeposit: 0,
            actDeposit:  0,
            volume:      0,
            points:      0,
            pnl:         0,
            roi:         0,
            winRate:     0,
            rank:        null
        };

        if (exchange === 'extended') {
            // Server pre-computes most fields for Extended
            d.initDeposit = rawData.init_deposit || 0;
            d.actDeposit  = rawData.act_deposit  || 0;
            d.volume      = rawData.total_volume  || 0;
            d.winRate     = rawData.win_rate      || 0;
            d.rank        = rawData.rank          || null;

            // POINTS: sum all epochRewards across all seasons
            // Backend now sends full points API response: { data: [ { epochRewards: [{ pointsReward }] } ] }
            let totalPoints = 0;
            const pointsPayload = rawData.points || {};
            const pointsData = pointsPayload.data || [];
            if (Array.isArray(pointsData)) {
                pointsData.forEach(season => {
                    (season.epochRewards || []).forEach(ep => {
                        totalPoints += parseFloat(ep.pointsReward || 0);
                    });
                });
            }
            d.points = Math.round(totalPoints * 100) / 100;

            // PNL = ACT_DEPOSIT - INIT_DEPOSIT
            d.pnl = d.actDeposit - d.initDeposit;
            // ROI % = (PNL / INIT_DEPOSIT) * 100
            d.roi = d.initDeposit > 0 ? (d.pnl / d.initDeposit) * 100 : 0;

        } else if (exchange === 'nado') {
            // Server pre-computes most fields for Nado
            d.initDeposit = rawData.init_deposit || 0;
            d.actDeposit  = rawData.act_deposit  || 0;
            d.volume      = rawData.total_volume  || 0;
            d.winRate     = rawData.win_rate      || 0;
            d.rank        = rawData.rank          || null;

            // POINTS: all_time_points.points (x18 scaled)
            // Docs: archive nado_points → all_time_points.points
            const ptsVal = rawData.points?.points || rawData.points || 0;
            d.points = Math.round(parseFloat(ptsVal) / 1e18);

            // PNL = ACT_DEPOSIT - INIT_DEPOSIT
            d.pnl = d.actDeposit - d.initDeposit;
            // ROI % = (PNL / INIT_DEPOSIT) * 100
            d.roi = d.initDeposit > 0 ? (d.pnl / d.initDeposit) * 100 : 0;

        } else if (exchange === 'variational') {
            if (rawData.portfolio) {
                d.initDeposit = parseFloat(rawData.portfolio.init_deposit || 0);
                d.actDeposit  = parseFloat(rawData.portfolio.act_deposit  || 0);
                d.volume      = parseFloat(rawData.portfolio.volume        || 0);
                d.winRate     = 0; // DATA NOT FOUND in Variational API docs
            }
            if (rawData.points) {
                d.points = parseFloat(rawData.points.total_points || 0);
                d.rank   = rawData.points.rank || null;
            }

            // PNL = ACT_DEPOSIT - INIT_DEPOSIT
            d.pnl = d.actDeposit - d.initDeposit;
            // ROI % = (PNL / INIT_DEPOSIT) * 100
            d.roi = d.initDeposit > 0 ? (d.pnl / d.initDeposit) * 100 : 0;
        }

        return d;
    }

    updateSummary() {
        let totalInitDeposit = 0, totalPnL = 0, totalVolume = 0;
        let totalWinRate = 0, activeCount = 0;

        Object.values(this.walletData).forEach(d => {
            if (!d) return;
            activeCount++;
            totalInitDeposit += d.initDeposit || 0;
            totalPnL         += d.pnl         || 0;
            totalVolume      += d.volume       || 0;
            totalWinRate     += d.winRate      || 0;
        });

        // Update summary cards in header
        const avgWinRate = activeCount > 0 ? totalWinRate / activeCount : 0;
        // PNL % of total initial deposit
        const pnlPct = totalInitDeposit > 0 ? (totalPnL / totalInitDeposit) * 100 : 0;

        const el = (id) => document.getElementById(id);
        // 01 // INITIAL_DEPOSIT = sum of all initDeposit across all wallets/exchanges
        if (el('total-deposit'))     el('total-deposit').textContent     = window.Utils.formatCurrency(totalInitDeposit);
        if (el('total-pnl')) {
            const pnlSign = pnlPct >= 0 ? '+' : '';
            el('total-pnl').textContent  = `${window.Utils.formatCurrency(totalPnL)} (${pnlSign}${pnlPct.toFixed(2)}%)`;
            el('total-pnl').className    = `value ${totalPnL >= 0 ? 'positive' : 'negative'}`;
        }
        if (el('total-win-rate')) el('total-win-rate').textContent = window.Utils.formatPercent(avgWinRate);
        if (el('total-volume'))   el('total-volume').textContent   = window.Utils.formatCurrency(totalVolume);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMgr = new DashboardManager();
    window.dashboardMgr.init();
});
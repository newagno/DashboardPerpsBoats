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

        // ── Particles ───────────────────────────────────────────────────────
        this.initParticles();
        // ── Interactive Key tracking ────────────────────────────────────────
        this.initKeyTracking();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PARTICLE BACKGROUND
    // ═══════════════════════════════════════════════════════════════════════
    initParticles() {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let W = canvas.width  = window.innerWidth;
        let H = canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            W = canvas.width  = window.innerWidth;
            H = canvas.height = window.innerHeight;
        });

        // Reduce count for mobile devices to save battery and CPU
        const isMobile = window.innerWidth < 768;
        const COUNT = isMobile ? 25 : 55;
        
        const particles = Array.from({ length: COUNT }, () => ({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 1.5 + 0.4,
            dx: (Math.random() - 0.5) * 0.25, // Slightly slower for better feel
            dy: (Math.random() - 0.5) * 0.25,
            alpha: Math.random() * 0.4 + 0.1
        }));

        const draw = () => {
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = 'rgba(255, 72, 54, 0.2)'; // Use a single color for speed
            
            for (const p of particles) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.globalAlpha = p.alpha;
                ctx.fill();
                
                p.x += p.dx;
                p.y += p.dy;
                
                if (p.x < 0 || p.x > W) p.dx *= -1;
                if (p.y < 0 || p.y > H) p.dy *= -1;
            }
            ctx.globalAlpha = 1.0;
            requestAnimationFrame(draw);
        };
        draw();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INTERACTIVE KEY — follows mouse
    // ═══════════════════════════════════════════════════════════════════════
    initKeyTracking() {
        const key = document.getElementById('draggable-key');
        if (!key) return;
        
        const rotateKey = (cx, cy, x, y) => {
            const angle = Math.atan2(y - cy, x - cx) * (180 / Math.PI);
            key.style.transform = `rotate(${angle}deg)`;
        };

        document.addEventListener('mousemove', (e) => {
            const rect = key.getBoundingClientRect();
            const cx = rect.left + rect.width  / 2;
            const cy = rect.top  + rect.height / 2;
            rotateKey(cx, cy, e.clientX, e.clientY);
        });

        document.addEventListener('touchmove', (e) => {
            if (e.touches[0]) {
                const rect = key.getBoundingClientRect();
                const cx = rect.left + rect.width  / 2;
                const cy = rect.top  + rect.height / 2;
                rotateKey(cx, cy, e.touches[0].clientX, e.touches[0].clientY);
            }
        }, { passive: true });
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

        // ── Real-time address validation ───────────────────────────────────
        const addrInputEl = document.getElementById('wallet-address-input');
        const validMsg    = document.getElementById('wallet-addr-validation');
        if (addrInputEl && validMsg) {
            addrInputEl.addEventListener('input', () => {
                const v = addrInputEl.value.trim();
                const valid = /^0x[0-9a-fA-F]{40}$/.test(v) || v.length === 0;
                addrInputEl.classList.toggle('input-error', !valid && v.length > 0);
                validMsg.classList.toggle('show', !valid && v.length > 0);
            });
        }

        this.btnSaveExchange.addEventListener('click', async () => {
            const exc = this.exchangeSelect.value;
            if (!exc) return;
            const labelInput = document.getElementById('wallet-label-input');
            const addrInput  = document.getElementById('wallet-address-input');
            const label      = labelInput?.value.trim();
            const walletAddr = addrInput?.value.trim();

            // ── Validate address ───────────────────────────────────────────
            if (walletAddr && !/^0x[0-9a-fA-F]{40}$/.test(walletAddr)) {
                addrInput.classList.add('input-error');
                const vm = document.getElementById('wallet-addr-validation');
                if (vm) vm.classList.add('show');
                addrInput.focus();
                return;
            }

            // ── Duplicate check (case-insensitive) ────────────────────────
            const norm = (walletAddr || '').toLowerCase();
            const isDup = window.walletManager.state.activeExchanges.some(
                e => e.exchange === exc && (e.walletAddress || '').toLowerCase() === norm
            );
            if (isDup) {
                addrInput.classList.add('input-error');
                const vm = document.getElementById('wallet-addr-validation');
                if (vm) { vm.textContent = '⚠ This wallet is already added for this exchange'; vm.classList.add('show'); }
                return;
            }

            const result = window.walletManager.addExchange(exc, walletAddr, label);
            if (exc === 'extended') {
                const pkInput = document.getElementById('extended-api-key');
                const pk = pkInput.value.trim();
                window.walletManager.setExtendedApiKey(result.id, pk);
                pkInput.value = '';
            }

            // Clear fields
            if (labelInput) labelInput.value = '';
            if (addrInput) {
                addrInput.value = '';
                addrInput.classList.remove('input-error');
            }
            const vm = document.getElementById('wallet-addr-validation');
            if (vm) { vm.classList.remove('show'); vm.textContent = '⚠ Invalid address — must be 42 chars starting with 0x'; }
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

    // ── Address history datalist ───────────────────────────────────────────
    saveWalletAddressHistory(address) {
        const normalized = address.toLowerCase();
        let history = [];
        try { history = JSON.parse(localStorage.getItem('wallet_history') || '[]'); } catch(e) {}
        const alreadyExists = history.some(h => h.toLowerCase() === normalized);
        if (!alreadyExists) {
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

    // ═══════════════════════════════════════════════════════════════════════
    // FORTUNE COOKIE — chest click easter egg
    // Підказка: що буде, якщо поєднати КЛЮЧ і СУНДУК? 🔑
    // ═══════════════════════════════════════════════════════════════════════
    setupEasterEgg() {
        const key    = document.getElementById('draggable-key');
        const chest  = document.getElementById('treasure-chest');
        const modal  = document.getElementById('easter-egg-modal');
        const fortunePopup = document.getElementById('fortune-popup');
        const fortuneText  = document.getElementById('fortune-text');
        if (!key || !chest) return;

        const fortunes = [
            "The market can remain irrational longer than you can remain solvent.",
            "Cut your losses short. Let your winners run.",
            "Don't fight the trend. The trend is your friend.",
            "Price is the only truth. Everything else is noise.",
            "The best trade is sometimes no trade at all.",
            "Risk management is not a feature — it's the product.",
            "When in doubt, zoom out.",
            "Patience is the rarest alpha in a casino disguised as a market.",
            "Fear when others are greedy. Be greedy when others are fearful.",
            "Every lock has its key. Every vault has its secret."
        ];

        const hints = [
            "🔑 The vault whispers... something is missing.",
            "🔒 A chest unopened holds no treasure.",
            "🗝 What opens is not always what it seems.",
            "🔐 The answer is closer than you think."
        ];

        chest.addEventListener('click', () => {
            const quote = fortunes[Math.floor(Math.random() * fortunes.length)];
            const hint  = hints[Math.floor(Math.random() * hints.length)];
            const hintEl = fortunePopup.querySelector('.fortune-hint');
            if (hintEl) hintEl.textContent = hint;
            fortuneText.textContent = `"${quote}"`;
            fortunePopup.style.display = 'block';
            fortunePopup.style.animation = 'none';
            void fortunePopup.offsetWidth;
            fortunePopup.style.animation = 'slideInRight 0.4s ease';
            clearTimeout(this._fortuneTimer);
            this._fortuneTimer = setTimeout(() => { fortunePopup.style.display = 'none'; }, 7000);
        });

        // Easter egg — КЛЮЧ перетягнути на СУНДУК = ACCESS_GRANTED
        key.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'key'); });
        chest.addEventListener('dragover', (e) => { e.preventDefault(); });
        chest.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.getData('text/plain') === 'key') {
                confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ['#FF4836','#FFD700','#FFFFFF'] });
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
        const excName   = exchange.charAt(0).toUpperCase() + exchange.slice(1);
        const addrShort = window.Utils.truncateAddress(walletAddress || '');

        let logoUrl = '';
        if (exchange === 'nado')     logoUrl = 'assets/nado.png';
        else if (exchange === 'extended') logoUrl = 'assets/Extended.png';

        const logoHtml  = logoUrl ? `<img src="${logoUrl}" style="width: 18px; height: 18px; border-radius: 50%; vertical-align: middle; margin-right: 8px;">` : '';
        const labelHtml = label    ? `<span class="wallet-label" style="background: rgba(255,255,255,0.1); padding: 2px 6px; font-size: 0.8em; margin-left: 10px; border: 1px solid rgba(255,255,255,0.2);">${label}</span>` : '';

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

        const data     = this.walletData[id] || {};
        const pnlClass = (data.pnl || 0) >= 0 ? 'positive' : 'negative';

        // ── $/POINT metric ─────────────────────────────────────────────────
        // Logic: how much capital you "paid" per point earned
        // When PNL < 0 (loss): cost = |PNL| / points  (each point cost you $X in losses)
        // When PNL >= 0 (profit): cost = 0 — points are "free", you made money AND earned points
        let pointValue = 'FREE';
        if (data.points && data.points > 0) {
            if (data.pnl < 0) {
                pointValue = `$${(Math.abs(data.pnl) / data.points).toFixed(4)}`;
            } else {
                pointValue = `+$${(data.pnl / data.points).toFixed(4)}`; // earning per point
            }
        } else {
            pointValue = 'N/A';
        }

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
                <div class="wallet-stat" style="border-top: 1px dashed rgba(255,72,54,0.3); margin-top:2px;"><span class="stat-label" style="color: rgba(255,72,54,0.7);">$/POINT</span><span class="stat-value" style="color: rgba(255,72,54,0.9); font-size:12px;">${pointValue}</span></div>
            </div>
            <div class="wallet-footer">
                <span class="timestamp">Last sync: ${new Date().toLocaleTimeString()}</span>
            </div>`;
        return card;
    }

    removeWallet(id) {
        window.walletManager.removeExchange(id);
        delete this.walletData[id];
        // Re-render only current active exchanges — do NOT show removed ones
        const remaining = window.walletManager.state.activeExchanges.map(e => ({...e, success: false, error: 'Refreshing...'}));
        this.updateAllWalletCards(remaining);
        window.refreshEngine.refresh();
    }

    processExchangeData(exchange, rawData) {
        const d = { initDeposit: 0, actDeposit: 0, volume: 0, points: 0, pnl: 0, winRate: 0 };
        d.initDeposit = rawData.init_deposit || 0;
        d.actDeposit  = rawData.act_deposit  || 0;
        d.volume      = rawData.total_volume || 0;
        d.winRate     = rawData.win_rate     || 0;
        d.rank        = rawData.rank;
        // PNL = ACT_DEPOSIT - INIT_DEPOSIT (universal formula for all exchanges)
        d.pnl         = d.actDeposit - d.initDeposit;

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

        if (typeof d.points === 'object' || isNaN(d.points)) {
            d.points = 0;
        } else if (exchange !== 'extended') {
            d.points = Math.round(d.points);
        } else {
            d.points = parseFloat(d.points.toFixed(2));
        }

        return d;
    }

    updateSummary() {
        let totalInit = 0, totalPnL = 0, totalVol = 0, totalWinRate = 0, winRateCount = 0;
        let totalPoints = 0;

        Object.values(this.walletData).forEach(d => {
            totalInit  += d.initDeposit;
            totalPnL   += d.pnl;  // pnl = actDeposit - initDeposit per card
            totalVol   += d.volume;
            if (d.points > 0) totalPoints += d.points;
            if (typeof d.winRate === 'number' && !isNaN(d.winRate) && d.winRate > 0) {
                totalWinRate += d.winRate; winRateCount++;
            }
        });
        const meanWinRate = winRateCount > 0 ? (totalWinRate / winRateCount) : 0;

        // $/POINT for summary: same logic — if total PNL < 0, cost = |PNL|/pts; if >= 0, free/earning
        let avgPointValue = 'N/A';
        if (totalPoints > 0) {
            if (totalPnL < 0) {
                avgPointValue = `$${(Math.abs(totalPnL) / totalPoints).toFixed(4)}/pt`;
            } else {
                avgPointValue = `+$${(totalPnL / totalPoints).toFixed(4)}/pt`;
            }
        }

        document.getElementById('total-deposit').textContent  = window.Utils.formatCurrency(totalInit);
        document.getElementById('total-pnl').textContent      = window.Utils.formatCurrency(totalPnL);
        document.getElementById('total-volume').textContent   = window.Utils.formatCurrency(totalVol);
        document.getElementById('total-win-rate').textContent = window.Utils.formatPercent(meanWinRate);

        const ppEl = document.getElementById('total-point-value');
        if (ppEl) ppEl.textContent = avgPointValue;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMgr = new DashboardManager();
    window.dashboardMgr.populateWalletHistory();
    window.dashboardMgr.init();
});
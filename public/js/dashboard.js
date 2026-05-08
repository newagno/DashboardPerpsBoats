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

        // Helper to close modal and reset state
        this.closeModal = () => {
            this.modalAddExchange.style.display = 'none';
            // Reset validation states
            const addrInput = document.getElementById('wallet-address-input');
            const vm = document.getElementById('wallet-addr-validation');
            if (addrInput) addrInput.classList.remove('input-error');
            if (vm) {
                vm.classList.remove('show');
                vm.textContent = window.i18n ? window.i18n.t('err_invalid_address') : '⚠ Invalid address — must be 42 chars starting with 0x';
            }
        };

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

        window.addEventListener('languageChanged', () => {
            // Re-render empty state or refresh existing cards with new language
            if (window.walletManager.state.activeExchanges.length === 0) {
                this.checkAuthState();
            } else {
                const remaining = window.walletManager.state.activeExchanges.map(e => ({...e, success: false, error: window.i18n ? window.i18n.t('refreshing') : 'Refreshing...'}));
                this.updateAllWalletCards(remaining);
                window.refreshEngine.refresh();
            }
        });
    }

    checkAuthState() {
        const hasExchanges = window.walletManager.state.activeExchanges.length > 0;
        if (hasExchanges) {
            this.renderLoading();
            setTimeout(() => window.refreshEngine.refresh(), 500);
        } else {
            this.walletsContainer.innerHTML = `<div class="empty-state"><p>${window.i18n ? window.i18n.t('no_exchange_configured') : 'NO ACTIVE SESSION OR EXCHANGES. CLICK "ADD_EXCHANGE" TO INITIALIZE.'}</p></div>`;
        }
    }

    setupEventListeners() {
        this.btnAddExchange.addEventListener('click', () => {
            // Reset modal fields before showing
            this.exchangeSelect.value = '';
            const addrInput = document.getElementById('wallet-address-input');
            const labelInput = document.getElementById('wallet-label-input');
            if (addrInput) addrInput.value = '';
            if (labelInput) labelInput.value = '';
            this.extendedConfigGroup.style.display = 'none';
            document.getElementById('multi-wallet-group').style.display = 'none';
            document.getElementById('label-group').style.display = 'none';
            
            this.modalAddExchange.style.display = 'flex';
        });

        this.exchangeSelect.addEventListener('change', (e) => {
            const v = e.target.value;
            const isVar = v === 'variational';
            this.extendedConfigGroup.style.display  = (v === 'extended') ? 'block' : 'none';
            document.getElementById('variational-config-group').style.display = isVar  ? 'block' : 'none';
            document.getElementById('multi-wallet-group').style.display = (v && !isVar) ? 'block' : 'none';
            document.getElementById('label-group').style.display = v ? 'block' : 'none';
        });

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => { this.closeModal(); });
        });

        // ── Keyboard Esc listener ──────────────────────────────────────────
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalAddExchange.style.display === 'flex') {
                this.closeModal();
            }
        });

        // ── Click outside listener (backdrop) ──────────────────────────────
        this.modalAddExchange.addEventListener('mousedown', (e) => {
            if (e.target === this.modalAddExchange) {
                this.closeModal();
            }
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
            const label      = labelInput?.value.trim();

            // ── Variational manual path ────────────────────────────────────
            if (exc === 'variational') {
                const manualData = {
                    initDeposit: parseFloat(document.getElementById('var-init-deposit').value) || 0,
                    actDeposit:  parseFloat(document.getElementById('var-act-deposit').value)  || 0,
                    volume:      parseFloat(document.getElementById('var-volume').value)        || 0,
                    points:      parseFloat(document.getElementById('var-points').value)        || 0,
                    rank:        document.getElementById('var-rank').value.trim() || null,
                    winRate:     parseFloat(document.getElementById('var-win-rate').value) || 0,
                    roi:         parseFloat(document.getElementById('var-roi').value) || 0
                };
                window.walletManager.addVariationalManual(manualData, label);
                ['var-init-deposit','var-act-deposit','var-volume','var-points','var-rank','var-win-rate','var-roi'].forEach(fid => {
                    const el = document.getElementById(fid); if (el) el.value = '';
                });
                if (labelInput) labelInput.value = '';
                document.getElementById('variational-config-group').style.display = 'none';
                document.getElementById('label-group').style.display = 'none';
                this.exchangeSelect.value = '';
                this.modalAddExchange.style.display = 'none';
                window.refreshEngine.refresh();
                return;
            }

            // ── Standard path (Extended / Nado) ───────────────────────────
            const addrInput  = document.getElementById('wallet-address-input');
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
            const sessionAddr = (window.walletManager.state.address || '').toLowerCase();
            const inputAddr   = (walletAddr || '').toLowerCase();
            const finalAddr   = inputAddr || sessionAddr;

            if (!finalAddr) {
                addrInput.classList.add('input-error');
                const vm = document.getElementById('wallet-addr-validation');
                if (vm) { vm.textContent = window.i18n ? window.i18n.t('err_no_address') : '⚠ No address provided and no wallet connected'; vm.classList.add('show'); }
                return;
            }

            const isDup = window.walletManager.state.activeExchanges.some(e => {
                const eAddr = (e.walletAddress || sessionAddr).toLowerCase();
                return e.exchange === exc && eAddr === finalAddr;
            });

            if (isDup) {
                console.log('Duplicate detected:', { exc, finalAddr, currentExchanges: window.walletManager.state.activeExchanges });
                addrInput.classList.add('input-error');
                const vm = document.getElementById('wallet-addr-validation');
                if (vm) { vm.textContent = window.i18n ? window.i18n.t('err_already_added') : '⚠ This wallet is already added for this exchange'; vm.classList.add('show'); }
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
            if (vm) { vm.classList.remove('show'); vm.textContent = window.i18n ? window.i18n.t('err_invalid_address') : '⚠ Invalid address — must be 42 chars starting with 0x'; }
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

        // ── Edit Variational modal listeners ───────────────────────────────
        const editVarModal = document.getElementById('modal-edit-variational');
        document.getElementById('close-edit-variational').addEventListener('click', () => { editVarModal.style.display = 'none'; });
        document.getElementById('close-edit-variational-cancel').addEventListener('click', () => { editVarModal.style.display = 'none'; });
        editVarModal.addEventListener('mousedown', (e) => { if (e.target === editVarModal) editVarModal.style.display = 'none'; });
        document.getElementById('btn-save-variational-edit').addEventListener('click', () => this.saveVariationalEdit());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && editVarModal.style.display === 'flex') editVarModal.style.display = 'none';
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

        chest.addEventListener('click', () => {
            const fortunes = window.i18n ? window.i18n.t('fortunes') : [
                "The market can remain irrational longer than you can remain solvent."
            ];
            const hints = [
                window.i18n ? window.i18n.t('hint_1') : "🔑 The vault whispers... something is missing.",
                window.i18n ? window.i18n.t('hint_2') : "🔒 A chest unopened holds no treasure.",
                window.i18n ? window.i18n.t('hint_3') : "🗝 What opens is not always what it seems.",
                window.i18n ? window.i18n.t('hint_4') : "🔐 The answer is closer than you think."
            ];

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
        // Desktop drag events
        key.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', 'key'); });
        chest.addEventListener('dragover', (e) => { e.preventDefault(); });
        chest.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.getData('text/plain') === 'key') {
                confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ['#FF4836','#FFD700','#FFFFFF'] });
                modal.style.display = 'flex';
            }
        });

        // Mobile touch events for drag and drop
        let startX, startY, initialX, initialY;
        key.addEventListener('touchstart', (e) => {
            // Prevent default browser behavior (scrolling, image drag)
            e.preventDefault();
            const touch = e.touches[0];
            startX = touch.clientX;
            startY = touch.clientY;
            
            const rect = key.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            
            // Lock dimensions
            key.style.width = rect.width + 'px';
            key.style.height = rect.height + 'px';
            
            key.style.position = 'fixed';
            key.style.zIndex = '9999';
            key.style.left = initialX + 'px';
            key.style.top = initialY + 'px';
            key.style.transition = 'none';
        }, { passive: false });

        key.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            // Using translate for hardware acceleration
            key.style.transform = `translate(${dx}px, ${dy}px)`;
        }, { passive: false });

        key.addEventListener('touchend', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            const chestRect = chest.getBoundingClientRect();
            
            // Check if drop location overlaps chest
            if (touch.clientX >= chestRect.left && touch.clientX <= chestRect.right &&
                touch.clientY >= chestRect.top && touch.clientY <= chestRect.bottom) {
                confetti({ particleCount: 200, spread: 90, origin: { y: 0.5 }, colors: ['#FF4836','#FFD700','#FFFFFF'] });
                modal.style.display = 'flex';
            }
            
            // Reset key position
            key.style.position = '';
            key.style.zIndex = '';
            key.style.left = '';
            key.style.top = '';
            key.style.width = '';
            key.style.height = '';
            key.style.transform = '';
            key.style.transition = '';
        });
    }

    renderLoading() {
        this.walletsContainer.innerHTML = `<div class="empty-state"><p>${window.i18n ? window.i18n.t('syncing') : 'SYNCHRONIZING EXCHANGE ACCOUNTS...'}</p></div>`;
    }

    updateAllWalletCards(results) {
        this.walletsContainer.innerHTML = '';
        if (!results || results.length === 0) {
            this.walletsContainer.innerHTML = `<div class="empty-state"><p>${window.i18n ? window.i18n.t('no_exchanges') : 'NO EXCHANGES ADDED.'}</p></div>`;
            return;
        }

        results.forEach(res => {
            if (res.success) {
                this.walletData[res.id] = this.processExchangeData(res.exchange, res.data);
            }
            this.walletsContainer.appendChild(this.createExchangeCard(res));
        });
        this.setupDragAndDrop();
        this.updateSummary();
    }

    createExchangeCard(res) {
        const { id, exchange, walletAddress, label, success, error } = res;
        const card = document.createElement('div');
        card.className = 'wallet-card';
        card.dataset.id = id;
        const excName   = exchange.charAt(0).toUpperCase() + exchange.slice(1);
        const addrShort = window.Utils.truncateAddress(walletAddress || '');

        let logoUrl = '';
        if (exchange === 'nado')     logoUrl = 'assets/nado.png';
        else if (exchange === 'extended') logoUrl = 'assets/Extended.png';
        else if (exchange === 'variational') logoUrl = 'assets/Variational.png';

        const logoHtml  = logoUrl
            ? `<img src="${logoUrl}" style="width:16px;height:16px;object-fit:contain;flex-shrink:0;">`
            : `<div style="width:16px;height:16px;flex-shrink:0;"></div>`;
        const labelHtml = label ? `<span class="card-label">${label}</span>` : '';
        const addrRow   = addrShort ? `<span class="wallet-address-truncated">ID: ${addrShort}</span>` : '';

        const headerHtml = (editBtnArg = '') => `
            <div class="card-header">
                <div class="card-header-row1">
                    ${logoHtml}
                    <span class="exchange-badge">${excName}</span>
                    ${labelHtml}
                    ${editBtnArg}
                    <button class="remove-btn" onclick="window.dashboardMgr.removeWallet('${id}')">×</button>
                </div>
                <div class="card-header-row2">
                    ${addrRow}
                </div>
            </div>`;

        if (!success) {
            card.innerHTML = headerHtml() + `
                <div class="card-body error-text" style="padding:20px; color:#ff6b6b;">
                    SYNC ERROR: ${error || (window.i18n ? window.i18n.t('failed_sync') : 'Connection Failed')}
                </div>`;
            return card;
        }

        const data     = this.walletData[id] || {};
        const pnlClass = (data.pnl || 0) >= 0 ? 'positive' : 'negative';

        // ── $/POINT metric ─────────────────────────────────────────────────
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

        // Variational: show inputDate from manualData on page load; other exchanges show real-time sync
        let footerTimestamp;
        if (exchange === 'variational' && res.data && res.data._inputDate) {
            const inputD = new Date(res.data._inputDate);
            const dateStr = inputD.toLocaleDateString() + ' ' + inputD.toLocaleTimeString();
            footerTimestamp = `${window.i18n ? window.i18n.t('var_input_date') : 'Data entered'}: ${dateStr}`;
        } else {
            footerTimestamp = `Last sync: ${new Date().toLocaleTimeString()}`;
        }

        // Edit button (only for Variational)
        const editBtnHtml = (exchange === 'variational')
            ? `<button title="${window.i18n ? window.i18n.t('var_edit_btn') : 'Edit data'}" onclick="window.dashboardMgr.openEditVariational('${id}')" style="background:transparent;border:none;padding:2px;display:flex;align-items:center;color:#888;cursor:pointer;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#888'"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>`
            : '';

        let roi = 0;
        if (exchange === 'variational' && data.roi !== undefined && data.roi !== null) {
            roi = data.roi;
        } else {
            roi = data.initDeposit > 0 ? (data.pnl / data.initDeposit) * 100 : 0;
        }
        const roiClass = roi >= 0 ? 'positive' : 'negative';

        card.innerHTML = headerHtml(editBtnHtml) + `
            <div class="wallet-stats-grid">
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_init_deposit') : '01 // INIT_DEPOSIT'}</span><span class="stat-value">${window.Utils.formatCurrency(data.initDeposit)}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_act_deposit') : '02 // ACT_DEPOSIT'}</span><span class="stat-value">${window.Utils.formatCurrency(data.actDeposit)}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_volume') : '03 // VOLUME'}</span><span class="stat-value">${window.Utils.formatCurrency(data.volume)}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_points') : '04 // POINTS'}</span><span class="stat-value">${(data.points || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_rank') : '05 // RANK'}</span><span class="stat-value">${data.rank ? data.rank : 'N/A'}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_pnl') : '06 // PNL'}</span><span class="stat-value ${pnlClass}">${window.Utils.formatCurrency(data.pnl)}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_win_rate') : '07 // WIN_RATE'}</span><span class="stat-value">${window.Utils.formatPercent(data.winRate)}</span></div>
                <div class="wallet-stat"><span class="stat-label">${window.i18n ? window.i18n.t('card_roi') : '08 // ROI'}</span><span class="stat-value ${roiClass}">${window.Utils.formatPercent(roi)}</span></div>
                <div class="wallet-stat" style="border-top: 1px dashed rgba(255,72,54,0.3); margin-top:2px;"><span class="stat-label" style="color: rgba(255,72,54,0.7);">${window.i18n ? window.i18n.t('card_point_value') : '09 // $/POINT'}</span><span class="stat-value" style="color: rgba(255,72,54,0.9); font-size:12px;">${pointValue}</span></div>
            </div>
            <div class="wallet-footer">
                <span class="timestamp">${footerTimestamp}</span>
            </div>`;
        return card;
    }

    removeWallet(id) {
        const entryToRemove = window.walletManager.state.activeExchanges.find(e => e.id === id);
        if (entryToRemove) {
            const eAddr = (entryToRemove.walletAddress || '').toLowerCase();
            const duplicates = window.walletManager.state.activeExchanges.filter(e => 
                e.exchange === entryToRemove.exchange && 
                (e.walletAddress || '').toLowerCase() === eAddr &&
                e.id !== id
            );
            duplicates.forEach(dup => {
                console.log('Purging ghost duplicate:', dup.id);
                window.walletManager.removeExchange(dup.id);
                delete this.walletData[dup.id];
            });
        }

        window.walletManager.removeExchange(id);
        delete this.walletData[id];
        // Re-render only current active exchanges — do NOT show removed ones
        const remaining = window.walletManager.state.activeExchanges.map(e => ({...e, success: false, error: window.i18n ? window.i18n.t('refreshing') : 'Refreshing...'}));
        this.updateAllWalletCards(remaining);
        window.refreshEngine.refresh();
    }

    // ── Variational Edit Modal ─────────────────────────────────────────────
    openEditVariational(id) {
        const entry = window.walletManager.state.activeExchanges.find(e => e.id === id);
        if (!entry || entry.exchange !== 'variational') return;
        const md = entry.manualData || {};
        document.getElementById('edit-var-id').value           = id;
        document.getElementById('edit-var-init-deposit').value = md.initDeposit || '';
        document.getElementById('edit-var-act-deposit').value  = md.actDeposit  || '';
        document.getElementById('edit-var-volume').value       = md.volume      || '';
        document.getElementById('edit-var-points').value       = md.points      || '';
        document.getElementById('edit-var-rank').value         = md.rank        || '';
        document.getElementById('edit-var-win-rate').value     = md.winRate     || '';
        document.getElementById('edit-var-roi').value          = md.roi         || '';
        document.getElementById('modal-edit-variational').style.display = 'flex';
    }

    saveVariationalEdit() {
        const id = document.getElementById('edit-var-id').value;
        if (!id) return;
        const manualData = {
            initDeposit: parseFloat(document.getElementById('edit-var-init-deposit').value) || 0,
            actDeposit:  parseFloat(document.getElementById('edit-var-act-deposit').value)  || 0,
            volume:      parseFloat(document.getElementById('edit-var-volume').value)        || 0,
            points:      parseFloat(document.getElementById('edit-var-points').value)        || 0,
            rank:        document.getElementById('edit-var-rank').value.trim() || null,
            winRate:     parseFloat(document.getElementById('edit-var-win-rate').value) || 0,
            roi:         parseFloat(document.getElementById('edit-var-roi').value) || 0
        };
        window.walletManager.updateVariationalManual(id, manualData);
        document.getElementById('modal-edit-variational').style.display = 'none';
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
        } else {
            d.points = parseFloat(d.points.toFixed(2));
        }

        // Pass through manual ROI if present (Variational)
        if (rawData.roi !== undefined && rawData.roi !== null) {
            d.roi = rawData.roi;
        }

        return d;
    }

    setupDragAndDrop() {
        const container = this.walletsContainer;
        let draggedItem = null;

        const cards = container.querySelectorAll('.wallet-card');
        cards.forEach(card => {
            card.setAttribute('draggable', true);
            card.style.cursor = 'grab';
            
            card.addEventListener('dragstart', function(e) {
                draggedItem = this;
                this.style.cursor = 'grabbing';
                setTimeout(() => this.style.opacity = '0.5', 0);
            });
            
            card.addEventListener('dragend', function() {
                setTimeout(() => {
                    this.style.opacity = '1';
                    this.style.cursor = 'grab';
                    draggedItem = null;
                }, 0);
            });
            
            card.addEventListener('dragover', function(e) {
                e.preventDefault();
            });
            
            card.addEventListener('dragenter', function(e) {
                e.preventDefault();
                if (draggedItem !== this) this.style.transform = 'scale(1.02)';
            });
            
            card.addEventListener('dragleave', function() {
                if (draggedItem !== this) this.style.transform = 'none';
            });
            
            card.addEventListener('drop', function() {
                this.style.transform = 'none';
                if (draggedItem && draggedItem !== this) {
                    const allCards = [...container.querySelectorAll('.wallet-card')];
                    const draggedIdx = allCards.indexOf(draggedItem);
                    const thisIdx = allCards.indexOf(this);
                    
                    if (draggedIdx < thisIdx) {
                        this.parentNode.insertBefore(draggedItem, this.nextSibling);
                    } else {
                        this.parentNode.insertBefore(draggedItem, this);
                    }
                    window.dashboardMgr.saveCardOrder();
                }
            });
        });
    }

    saveCardOrder() {
        const cards = this.walletsContainer.querySelectorAll('.wallet-card');
        const newOrderIds = Array.from(cards).map(card => card.dataset.id);
        
        const newExchanges = [];
        newOrderIds.forEach(id => {
            const entry = window.walletManager.state.activeExchanges.find(e => e.id === id);
            if (entry) newExchanges.push(entry);
        });
        
        if (newExchanges.length === window.walletManager.state.activeExchanges.length) {
            window.walletManager.state.activeExchanges = newExchanges;
            window.walletManager._saveExchanges();
        }
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

        const totalROI = totalInit > 0 ? (totalPnL / totalInit) * 100 : 0;

        document.getElementById('total-deposit').textContent  = window.Utils.formatCurrency(totalInit);
        document.getElementById('total-pnl').textContent      = window.Utils.formatCurrency(totalPnL);
        document.getElementById('total-roi').textContent      = window.Utils.formatPercent(totalROI);
        document.getElementById('total-win-rate').textContent = window.Utils.formatPercent(meanWinRate);
        document.getElementById('total-volume').textContent   = window.Utils.formatCurrency(totalVol);

        const roiEl = document.getElementById('total-roi');
        if (roiEl) {
            roiEl.textContent = window.Utils.formatPercent(totalROI);
            roiEl.className = totalROI >= 0 ? 'value positive' : 'value negative';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMgr = new DashboardManager();
    window.dashboardMgr.populateWalletHistory();
    window.dashboardMgr.init();
});
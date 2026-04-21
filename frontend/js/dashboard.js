/**
 * DashboardManager handles the UI interactions for the dashboard page.
 * Integrated with Secure Vault and Web3 Signature Authentication.
 */
class DashboardManager {
    constructor() {
        this.walletsContainer = document.getElementById('wallets-container');
        this.modal = document.getElementById('modal-add-wallet');
        this.form = document.getElementById('form-add-wallet');
        this.exchangeSelect = document.getElementById('exchange-select');
        this.apiKeyGroup = document.getElementById('api-key-group');
        this.authSessionGroup = document.getElementById('auth-session-group');
        this.walletData = {}; // Cache for refreshed data
        this.modalAdvisor = document.getElementById('modal-risk-advisor');
        
        // Vault UI
        this.modalVault = document.getElementById('modal-vault-auth');
        this.vaultPasswordInput = document.getElementById('vault-password');
        this.vaultError = document.getElementById('vault-error');
        this.btnUnlockVault = document.getElementById('btn-unlock-vault');
        this.btnLockVault = document.getElementById('lock-vault-btn');
    }

    async init() {
        this.setupEventListeners();
        await this.checkVaultStatus();
    }

    async checkVaultStatus() {
        if (!window.cryptoMgr.exists()) {
            // New User: Setup Vault
            document.getElementById('vault-title').textContent = 'INITIALIZE_SECURE_VAULT';
            document.getElementById('vault-msg').textContent = 'CREATE A MASTER PASSWORD TO SECURE YOUR PORTFOLIO DATA.';
            document.getElementById('vault-init-notice').style.display = 'block';
            this.btnUnlockVault.textContent = 'CREATE_VAULT';
            this.modalVault.style.display = 'flex';
        } else if (window.cryptoMgr.isLocked) {
            this.modalVault.style.display = 'flex';
            this.vaultPasswordInput.focus();
        } else {
            this.onVaultUnlocked();
        }
    }

    async handleVaultAuth() {
        const password = this.vaultPasswordInput.value;
        if (!password) return;

        this.btnUnlockVault.disabled = true;
        this.btnUnlockVault.textContent = 'VERIFYING...';
        this.vaultError.style.display = 'none';

        try {
            let success = false;
            if (!window.cryptoMgr.exists()) {
                success = await window.cryptoMgr.initVault(password);
            } else {
                success = await window.cryptoMgr.unlock(password);
            }

            if (success) {
                this.modalVault.style.display = 'none';
                this.vaultPasswordInput.value = '';
                this.onVaultUnlocked();
            } else {
                this.vaultError.style.display = 'block';
                this.btnUnlockVault.textContent = 'RETRY_AUTH';
            }
        } catch (e) {
            console.error('Vault auth error:', e);
            this.vaultError.textContent = '[ FATAL_ERROR ] SYSTEM_REJECTED_KEY';
            this.vaultError.style.display = 'block';
        } finally {
            this.btnUnlockVault.disabled = false;
        }
    }

    async handleMetaMaskUnlock() {
        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask is not installed.');
            return;
        }

        const btn = document.getElementById('btn-unlock-metamask');
        const originalText = btn.innerHTML;
        
        try {
            btn.innerHTML = 'CONNECTING...';
            btn.disabled = true;

            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length === 0) throw new Error('No accounts found');
            const address = accounts[0];

            btn.innerHTML = 'SIGNING_AUTH...';
            const message = `Unlock TradeDash Vault for ${address.toLowerCase()}`;
            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, address]
            });

            if (signature) {
                const success = await window.cryptoMgr.unlockWithSignature(signature, address);
                if (success) {
                    this.modalVault.style.display = 'none';
                    this.onVaultUnlocked();
                } else {
                    this.vaultError.textContent = '[ ERROR ] CRYPTO_DERIVATION_FAILED';
                    this.vaultError.style.display = 'block';
                }
            }
        } catch (e) {
            console.error('MetaMask unlock error:', e);
            this.vaultError.textContent = '[ ERROR ] METAMASK_AUTH_REJECTED';
            this.vaultError.style.display = 'block';
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    onVaultUnlocked() {
        this.btnLockVault.style.display = 'block';
        this.renderWallets();
        window.refreshEngine.start();
        
        // Trigger initial refresh
        setTimeout(() => window.refreshEngine.refresh(), 500);
    }

    lockVault() {
        window.cryptoMgr.lock();
        this.walletData = {};
        this.btnLockVault.style.display = 'none';
        this.walletsContainer.innerHTML = '<div class="empty-state"><p>VAULT_LOCKED. RE-AUTHENTICATE TO VIEW TELEMETRY.</p></div>';
        this.checkVaultStatus();
    }

    setupEventListeners() {
        // Vault Events
        this.btnUnlockVault.addEventListener('click', () => this.handleVaultAuth());
        this.vaultPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleVaultAuth();
        });
        this.btnLockVault.addEventListener('click', () => this.lockVault());
        
        const btnUnlockMetamask = document.getElementById('btn-unlock-metamask');
        if (btnUnlockMetamask) {
            btnUnlockMetamask.addEventListener('click', () => this.handleMetaMaskUnlock());
        }

        document.getElementById('add-wallet-btn').addEventListener('click', () => this.openModal());
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        this.exchangeSelect.addEventListener('change', (e) => {
            this.updateModalFields(e.target.value);
        });

        // MetaMask Connect (Address only)
        const btnConnect = document.getElementById('btn-connect-metamask');
        if (btnConnect) {
            btnConnect.addEventListener('click', async () => {
                const notice = document.getElementById('metamask-notice');
                if (typeof window.ethereum !== 'undefined') {
                    try {
                        const originalText = btnConnect.innerHTML;
                        btnConnect.innerHTML = 'Connecting...';
                        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                        if (accounts.length > 0) {
                            document.getElementById('wallet-address').value = accounts[0];
                            notice.style.display = 'block';
                            // Show auth group if exchange supports it
                            this.updateModalFields(this.exchangeSelect.value);
                        }
                        btnConnect.innerHTML = originalText;
                    } catch (error) {
                        console.error('MetaMask connection error:', error);
                        btnConnect.innerHTML = 'Connection Failed';
                        setTimeout(() => btnConnect.innerHTML = 'Connect MetaMask', 2000);
                    }
                } else {
                    alert('MetaMask is not installed. Please install it to use this feature.');
                }
            });
        }

        // Web3 Signature Authorization
        document.getElementById('btn-authorize-session').addEventListener('click', () => this.authorizeSession());

        this.form.addEventListener('submit', (e) => this.handleAddWallet(e));
        document.getElementById('refresh-btn').addEventListener('click', () => window.refreshEngine.refresh());

        const btnAdvisor = document.getElementById('btn-risk-advisor');
        if (btnAdvisor) {
            btnAdvisor.addEventListener('click', () => {
                const totalEl = document.getElementById('total-deposit').textContent;
                const totalVal = parseFloat(totalEl.replace(/[^0-9.-]+/g, ""));
                if (totalVal > 0) document.getElementById('adv-total-depo').value = totalVal.toFixed(2);

                this.modalAdvisor.style.display = 'flex';
                this.calculateRisk();
            });
        }

        const closeAdvisor = document.querySelector('.advisor-close');
        if (closeAdvisor) {
            closeAdvisor.addEventListener('click', () => {
                this.modalAdvisor.style.display = 'none';
            });
        }

        const btnCalc = document.getElementById('btn-calc-advisor');
        if (btnCalc) {
            btnCalc.addEventListener('click', () => this.calculateRisk());
        }

        this.setupEasterEgg();

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
            if (e.target === this.modalAdvisor) this.modalAdvisor.style.display = 'none';
        });
    }

    updateModalFields(exchange) {
        // Reset visibility
        this.apiKeyGroup.style.display = 'none';
        this.authSessionGroup.style.display = 'none';

        if (exchange === 'extended') {
            this.apiKeyGroup.style.display = 'block';
        } else if (exchange === 'nado' || exchange === 'variational') {
            const address = document.getElementById('wallet-address').value;
            if (address) {
                this.authSessionGroup.style.display = 'block';
            }
        }
    }

    async authorizeSession() {
        const address = document.getElementById('wallet-address').value;
        const exchange = this.exchangeSelect.value;
        const btn = document.getElementById('btn-authorize-session');
        const status = document.getElementById('session-status');

        if (!address) {
            alert('Please enter or connect a wallet address first.');
            return;
        }

        try {
            btn.textContent = 'WAITING_FOR_METAMASK...';
            btn.disabled = true;

            const domain = {
                name: 'TradeDash',
                version: '1',
                chainId: exchange === 'variational' ? 42161 : 57073, // Arb for Variational, Ink for Nado
                verifyingContract: '0x0000000000000000000000000000000000000000'
            };

            const types = {
                EIP712Domain: [
                    { name: 'name', type: 'string' },
                    { name: 'version', type: 'string' },
                    { name: 'chainId', type: 'uint256' },
                    { name: 'verifyingContract', type: 'address' }
                ],
                Authorize: [
                    { name: 'message', type: 'string' },
                    { name: 'address', type: 'address' },
                    { name: 'timestamp', type: 'uint256' }
                ]
            };

            const message = {
                message: `Authorize TradeDash to view read-only ${exchange} telemetry.`,
                address: address,
                timestamp: Math.floor(Date.now() / 1000)
            };

            const msgParams = JSON.stringify({
                domain,
                message,
                primaryType: 'Authorize',
                types
            });

            const signature = await window.ethereum.request({
                method: 'eth_signTypedData_v4',
                params: [address, msgParams]
            });

            if (signature) {
                document.getElementById('session-signature').value = signature;
                status.style.display = 'block';
                btn.textContent = '🔒 RE-AUTHORIZE (SIGN_MESSAGE)';
                confetti({ particleCount: 50, spread: 40, origin: { y: 0.8 } });
            }
        } catch (e) {
            console.error('Signing failed:', e);
            alert('Authorization failed. Please try again or check MetaMask.');
            btn.textContent = '🔒 AUTHORIZE_SESSION (SIGN_MESSAGE)';
        } finally {
            btn.disabled = false;
        }
    }

    setupEasterEgg() {
        const key = document.getElementById('draggable-key');
        const chest = document.getElementById('treasure-chest');
        const modal = document.getElementById('easter-egg-modal');

        if (!key || !chest) return;

        key.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', 'key');
            key.style.opacity = '0.5';
        });
        key.addEventListener('dragend', () => { key.style.opacity = '1'; });

        chest.addEventListener('dragover', (e) => { e.preventDefault(); chest.classList.add('drag-over'); });
        chest.addEventListener('dragleave', () => { chest.classList.remove('drag-over'); });
        chest.addEventListener('drop', (e) => {
            e.preventDefault();
            chest.classList.remove('drag-over');
            if (e.dataTransfer.getData('text/plain') === 'key') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#ff6b6b', '#667eea', '#ffffff'] });
                modal.style.display = 'flex';
                const originalHtml = chest.innerHTML;
                chest.innerHTML = '<span style="font-size: 32px">🔓</span>';
                setTimeout(() => { chest.innerHTML = originalHtml; }, 3000);
            }
        });
    }

    openModal(wallet = null) {
        if (window.cryptoMgr.isLocked) {
            this.checkVaultStatus();
            return;
        }

        const title = this.modal.querySelector('h3');
        const submitBtn = this.form.querySelector('.btn-primary');
        const editIdx = document.getElementById('edit-index');
        
        // Reset state
        document.getElementById('metamask-notice').style.display = 'none';
        document.getElementById('session-status').style.display = 'none';
        document.getElementById('session-signature').value = '';
        document.getElementById('private-key').value = '';
        document.getElementById('btn-authorize-session').textContent = '🔒 AUTHORIZE_SESSION (SIGN_MESSAGE)';

        if (wallet) {
            title.textContent = 'Edit Wallet';
            submitBtn.textContent = 'Save Changes';
            editIdx.value = wallet.id;

            this.exchangeSelect.value = wallet.exchange;
            document.getElementById('wallet-address').value = wallet.address;
            document.getElementById('wallet-description').value = wallet.description;

            this.updateModalFields(wallet.exchange);

            if (wallet.apiKey) {
                const decrypted = window.cryptoMgr.decrypt(wallet.apiKey);
                document.getElementById('api-key').value = decrypted || '';
            }
            if (wallet.sessionSignature) {
                const sig = window.cryptoMgr.decrypt(wallet.sessionSignature);
                if (sig) {
                    document.getElementById('session-signature').value = sig;
                    document.getElementById('session-status').style.display = 'block';
                    document.getElementById('btn-authorize-session').textContent = '🔒 RE-AUTHORIZE (SIGN_MESSAGE)';
                }
            }
            if (wallet.privateKey) {
                const pk = window.cryptoMgr.decrypt(wallet.privateKey);
                document.getElementById('private-key').value = pk || '';
            }
        } else {
            title.textContent = 'Add New Wallet';
            submitBtn.textContent = 'Add Wallet';
            editIdx.value = '-1';
            this.form.reset();
            this.updateModalFields('');
        }

        this.modal.style.display = 'flex';
    }

    calculateRisk() {
        const totalDepo = parseFloat(document.getElementById('adv-total-depo').value) || 0;
        const mode = document.getElementById('adv-mode').value;
        const resultsEl = document.getElementById('advisor-results');

        const perExchange = totalDepo / 3;
        const posAllocation = Math.min(perExchange, totalDepo);
        let bufferRatio = 0.375; 
        if (mode === 'moderate') bufferRatio = 0.25;
        if (mode === 'aggressive') bufferRatio = 0.15;

        const maxUsedMargin = posAllocation * (1 - bufferRatio);
        const entryMargin = maxUsedMargin / 2.5;
        const dca1Margin = entryMargin * 0.5;
        const dca2Margin = entryMargin * 1.0;
        const freeMargin = posAllocation * bufferRatio;

        let levBTC = mode === 'conservative' ? 10 : (mode === 'moderate' ? 15 : 20);
        let levBNB = mode === 'conservative' ? 7 : (mode === 'moderate' ? 10 : 15);
        let levALT = mode === 'conservative' ? 4 : (mode === 'moderate' ? 7 : 10);

        resultsEl.innerHTML = `
            <div style="color:var(--colors-token-green, #4CAF50); margin-bottom:10px;">> AGGREGATE POOL: $${totalDepo.toFixed(2)} | EXCHANGE EQ: $${perExchange.toFixed(2)}</div>
            <div style="margin-bottom:10px; color:#fff;">> ALLOC_PER_ACTIVE_POSITION (MAX 3): $${posAllocation.toFixed(2)}</div>
            <div style="margin-bottom:15px; color:#94a3b8;">
                - Init Entry Margin (1x Base): $${entryMargin.toFixed(2)}<br>
                - DCA 1 Margin (0.5x Base): $${dca1Margin.toFixed(2)}<br>
                - DCA 2 Margin (1x Base): $${dca2Margin.toFixed(2)}<br>
                <strong style="color: var(--colors-token-green, #4CAF50);">- Total Margin Used: $${maxUsedMargin.toFixed(2)}</strong><br>
                <strong style="color: var(--colors-token-green, #4CAF50);">- Free Margin Buffer: $${freeMargin.toFixed(2)}</strong> (Holds position vs liquidations)
            </div>
            <table style="width:100%; border-collapse: collapse; margin-bottom: 10px;">
                <tr style="border-bottom:1px solid #333; color:#fff;"><th style="text-align:left; padding-bottom:5px;">ASSET</th><th style="padding-bottom:5px;">LEV</th><th style="padding-bottom:5px;">ENTRY SIZE</th><th style="padding-bottom:5px;">MAX POS SIZE</th></tr>
                <tr><td>BTC, ETH</td><td style="text-align:center;">${levBTC}x</td><td style="text-align:center;">$${(entryMargin*levBTC).toFixed(0)}</td><td style="text-align:center;">$${(maxUsedMargin*levBTC).toFixed(0)}</td></tr>
                <tr><td>BNB, SOL</td><td style="text-align:center;">${levBNB}x</td><td style="text-align:center;">$${(entryMargin*levBNB).toFixed(0)}</td><td style="text-align:center;">$${(maxUsedMargin*levBNB).toFixed(0)}</td></tr>
                <tr><td>XRP, HYPE</td><td style="text-align:center;">${levALT}x</td><td style="text-align:center;">$${(entryMargin*levALT).toFixed(0)}</td><td style="text-align:center;">$${(maxUsedMargin*levALT).toFixed(0)}</td></tr>
            </table>
        `;
    }

    closeModal() {
        this.modal.style.display = 'none';
        this.apiKeyGroup.style.display = 'none';
        this.authSessionGroup.style.display = 'none';
        this.form.reset();
    }

    handleAddWallet(e) {
        e.preventDefault();

        const editId = document.getElementById('edit-index').value;
        const exchange = this.exchangeSelect.value;
        const address = document.getElementById('wallet-address').value.trim();
        const apiKey = document.getElementById('api-key').value.trim();
        const signature = document.getElementById('session-signature').value.trim();
        const privateKey = document.getElementById('private-key').value.trim();
        const description = document.getElementById('wallet-description').value.trim();

        if (exchange === 'extended' && !apiKey) {
            alert('API Key is required for Extended Exchange.');
            return;
        }

        if (editId !== '-1') {
            window.cryptoMgr.updateWallet(editId, { 
                exchange, address, apiKey, 
                sessionSignature: signature || undefined, 
                privateKey: privateKey || undefined,
                description 
            });
        } else {
            window.cryptoMgr.storeWallet(exchange, address, apiKey, signature, description, privateKey);
        }

        this.renderWallets();
        this.closeModal();
        window.refreshEngine.refresh();
    }

    renderWallets() {
        if (window.cryptoMgr.isLocked) return;
        const wallets = window.cryptoMgr.getWallets();

        if (wallets.length === 0) {
            this.walletsContainer.innerHTML = '<div class="empty-state"><p>NO DATA FEED DETECTED. CLICK "LINK_WALLET" TO INITIALIZE.</p></div>';
            return;
        }

        this.walletsContainer.innerHTML = '';
        wallets.forEach(wallet => {
            this.walletsContainer.appendChild(this.createWalletCard(wallet));
        });
    }

    createWalletCard(wallet) {
        const card = document.createElement('div');
        card.className = 'wallet-card';
        card.setAttribute('data-id', wallet.id);

        const exchangeName = wallet.exchange.charAt(0).toUpperCase() + wallet.exchange.slice(1);
        const data = this.walletData[wallet.id] || {};
        const displayDesc = wallet.description ? `<span class="desc-bracket"> (${wallet.description})</span>` : '';
        const isVariational = wallet.exchange === 'variational';

        // Security Badge Logic
        let securityStatus = 'PUBLIC_VIEW';
        let securityClass = 'status-public';
        if (wallet.sessionSignature || (wallet.exchange === 'extended' && wallet.apiKey)) {
            securityStatus = 'AUTHORIZED (WEB3)';
            securityClass = 'status-protected';
        }
        if (wallet.privateKey) {
            securityStatus += ' + PK';
        }

        const depositLabel = wallet.exchange === 'extended' ? 'NET_DEPOSIT' : 'DEPOSIT';
        const depositVal = (wallet.exchange === 'extended' && data.netDeposit !== undefined)
            ? data.netDeposit
            : (data.balance || 0);

        const pointsLabel = 'POINTS';
        const pointsDisplay = isVariational
            ? (data.nextDropTs ? new Date(data.nextDropTs * 1000).toLocaleDateString() : 'TBD')
            : (data.points || 0).toLocaleString();

        let logoName = exchangeName;
        if (wallet.exchange === 'nado') logoName = 'nado';

        card.innerHTML = `
            <div class="card-header">
                <div>
                    <span class="exchange-badge">
                        <img src="assets/${logoName}.png" alt="${exchangeName}" style="height: 1em; width: auto; vertical-align: middle; margin-right: 6px; display: inline-block; object-fit: contain;">${exchangeName}
                    </span>
                    <span class="wallet-address-truncated" title="${wallet.address}">
                        ID: ${window.Utils.truncateAddress(wallet.address)} ${displayDesc}
                    </span>
                </div>
                <div class="wallet-actions">
                    <button class="btn-edit" onclick="window.dashboardMgr.editWallet('${wallet.id}')">EDIT</button>
                    <button class="btn-delete" onclick="window.dashboardMgr.deleteWallet('${wallet.id}')">DEL</button>
                </div>
            </div>

            <div class="wallet-stats-grid">
                <div class="wallet-stat">
                    <span class="stat-label">01 // ${depositLabel}</span>
                    <span class="stat-value deposit-val">${window.Utils.formatCurrency(depositVal)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">02 // VOLUME</span>
                    <span class="stat-value volume-val">${window.Utils.formatCurrency(data.volume || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">03 // ${pointsLabel}</span>
                    <span class="stat-value points-val">${pointsDisplay}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">04 // PNL</span>
                    <span class="stat-value pnl-val ${(data.pnl || 0) >= 0 ? 'positive' : 'negative'}">${window.Utils.formatCurrency(data.pnl || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">05 // ROI %</span>
                    <span class="stat-value roi-val">${window.Utils.formatPercent(data.roi || 0)}</span>
                </div>
                <div class="wallet-stat">
                    <span class="stat-label">06 // WIN_RATE %</span>
                    <span class="stat-value wr-val">${window.Utils.formatPercent(data.winRate || 0)}</span>
                </div>
            </div>
            <div class="wallet-footer" style="padding: 10px 15px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                <span class="security-badge ${securityClass}">${securityStatus}</span>
                <span class="timestamp wallet-last-update">STB: --:--:--</span>
            </div>
        `;

        return card;
    }

    editWallet(id) {
        const wallet = window.cryptoMgr.getWallets().find(w => w.id === id);
        if (wallet) this.openModal(wallet);
    }

    deleteWallet(id) {
        if (confirm('Are you sure you want to delete this wallet?')) {
            window.cryptoMgr.deleteWallet(id);
            delete this.walletData[id];
            this.renderWallets();
            this.updateSummary();
        }
    }

    updateAllWalletCards(results) {
        results.forEach(res => {
            if (res.success) {
                this.walletData[res.id] = this.processExchangeData(res.exchange, res.data);
            }

            const card = document.querySelector(`.wallet-card[data-id="${res.id}"]`);
            if (!card) return;

            if (res.success) {
                const d = this.walletData[res.id];
                const isVariational = res.exchange === 'variational';

                const depositVal = (res.exchange === 'extended' && d.netDeposit !== undefined) ? d.netDeposit : d.balance;
                const pointsDisplay = isVariational ? (d.nextDropTs ? new Date(d.nextDropTs * 1000).toLocaleDateString() : 'TBD') : d.points.toLocaleString();

                card.querySelector('.deposit-val').textContent = window.Utils.formatCurrency(depositVal);
                card.querySelector('.volume-val').textContent = window.Utils.formatCurrency(d.volume);
                card.querySelector('.points-val').textContent = pointsDisplay;

                const pnlEl = card.querySelector('.pnl-val');
                pnlEl.textContent = window.Utils.formatCurrency(d.pnl);
                pnlEl.className = `stat-value pnl-val ${d.pnl >= 0 ? 'positive' : 'negative'}`;

                card.querySelector('.roi-val').textContent = window.Utils.formatPercent(d.roi);
                card.querySelector('.wr-val').textContent = window.Utils.formatPercent(d.winRate);
                card.querySelector('.wallet-last-update').textContent = `STB: ${new Date().toLocaleTimeString()}`;
            } else {
                card.querySelector('.wallet-last-update').textContent = `ERR: ${res.error || 'fetch failed'}`;
            }
        });

        this.updateSummary();
    }

    processExchangeData(exchange, rawData) {
        const processed = {
            balance: 0, pnl: 0, volume: 0, roi: 0, winRate: 0, points: 0,
            nextDropTs: null, netDeposit: undefined, platformOnly: false
        };

        if (exchange === 'extended') {
            const balData = rawData.balance?.data || rawData.balance || {};
            processed.balance = parseFloat(balData.balance || balData.equity || 0) || 0;
            const trades = rawData.trades?.data || (Array.isArray(rawData.trades) ? rawData.trades : []);
            if (trades.length > 0) {
                processed.volume = trades.reduce((acc, t) => acc + Math.abs(parseFloat(t.notional || (t.size*t.price) || 0)), 0);
                const wins = trades.filter(t => parseFloat(t.realized_pnl || 0) > 0).length;
                processed.winRate = (wins / trades.length) * 100;
            }
            processed.pnl = parseFloat(balData.pnl || 0);
            processed.points = parseInt(rawData.points?.data?.points || 0);
            processed.roi = processed.balance > 0 ? (processed.pnl / processed.balance) * 100 : 0;
            const ops = rawData.operations?.data || [];
            if (ops.length > 0) {
                const totalIn = ops.filter(o => ['DEPOSIT'].includes(o.type)).reduce((acc, o) => acc + parseFloat(o.amount || 0), 0);
                const totalOut = ops.filter(o => ['WITHDRAWAL'].includes(o.type)).reduce((acc, o) => acc + parseFloat(o.amount || 0), 0);
                processed.netDeposit = totalIn - totalOut;
            }
        } else if (exchange === 'nado') {
            const snapshot = rawData.snapshot || null;
            const matches = rawData.matches || [];
            if (snapshot) processed.balance = parseFloat(snapshot.health?.assets || 0) / 1e18;
            if (matches.length > 0) {
                processed.volume = matches.reduce((acc, m) => acc + (parseFloat(m.price_x18 || 0)/1e18 * Math.abs(parseFloat(m.amount||0)/1e18)), 0);
                processed.pnl = matches.reduce((acc, m) => acc + (parseFloat(m.realized_pnl||0)/1e18), 0);
                const wins = matches.filter(m => parseFloat(m.realized_pnl||0) > 0).length;
                processed.winRate = (wins / matches.length) * 100;
            }
            processed.points = Math.round(parseFloat(rawData.points || 0) / 1e18);
            processed.roi = processed.balance > 0 ? (processed.pnl / processed.balance) * 100 : 0;
        } else if (exchange === 'variational') {
            const stats = rawData.stats || {};
            processed.volume = parseFloat(stats.total_volume_24h || 0);
            processed.balance = parseFloat(stats.tvl || 0);
            processed.platformOnly = true;
            if (rawData.nextDropTs) processed.nextDropTs = Math.floor(new Date(rawData.nextDropTs).getTime() / 1000);
        }
        return processed;
    }

    updateSummary() {
        const wallets = window.cryptoMgr.getWallets();
        if (window.cryptoMgr.isLocked) return;
        let totalDeposit = 0, totalPnL = 0, totalVolume = 0, totalWinRate = 0, activeCount = 0;

        wallets.forEach(w => {
            const d = this.walletData[w.id];
            if (!d || d.platformOnly) return;
            activeCount++;
            totalDeposit += (d.netDeposit !== undefined ? d.netDeposit : d.balance);
            totalPnL += d.pnl;
            totalVolume += d.volume;
            totalWinRate += d.winRate;
        });

        document.getElementById('total-deposit').textContent = window.Utils.formatCurrency(totalDeposit);
        document.getElementById('total-pnl').textContent = window.Utils.formatCurrency(totalPnL);
        document.getElementById('total-pnl').className = `value ${totalPnL >= 0 ? 'positive' : 'negative'}`;
        document.getElementById('total-win-rate').textContent = window.Utils.formatPercent(activeCount > 0 ? totalWinRate / activeCount : 0);
        document.getElementById('total-volume').textContent = window.Utils.formatCurrency(totalVolume);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboardMgr = new DashboardManager();
    window.dashboardMgr.init();

    // Check for auto-login from landing page
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === 'metamask') {
        setTimeout(() => {
            if (window.cryptoMgr.isLocked) {
                window.dashboardMgr.handleMetaMaskUnlock();
            }
        }, 800);
    }
});
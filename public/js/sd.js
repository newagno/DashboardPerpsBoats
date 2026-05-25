this.btnSaveExchange.addEventListener('click', async () => {
    try {
        const exc = this.exchangeSelect.value;
        if (!exc) {
            alert('Please select an exchange.');
            return;
        }

        const labelInput = document.getElementById('wallet-label-input');
        const label = labelInput?.value.trim();

        // ── VARIATIONAL MANUAL ────────────────────────
        if (exc === 'variational') {
            const walletAddress = document.getElementById('var-wallet-address').value.trim();
            const manualData = {
                initDeposit: parseFloat(document.getElementById('var-init-deposit').value) || 0,
                actDeposit: parseFloat(document.getElementById('var-act-deposit').value) || 0,
                volume: parseFloat(document.getElementById('var-volume').value) || 0,
                points: parseFloat(document.getElementById('var-points').value) || 0,
                rank: document.getElementById('var-rank').value.trim() || null,
                winRate: parseFloat(document.getElementById('var-win-rate').value) || 0,
                roi: parseFloat(document.getElementById('var-roi').value) || 0
            };
            
            console.log('➕ Adding Variational:', { manualData, walletAddress, label });
            const result = await window.walletManager.addVariationalManual(manualData, walletAddress, label)
                .catch(e => {
                    console.error('❌ Variational error:', e);
                    return { success: false, error: e.message };
                });
            
            if (!result?.success) {
                alert('❌ Error: ' + (result?.error || 'Failed to add'));
                return;
            }
            
            // Clear fields
            ['var-wallet-address', 'var-init-deposit', 'var-act-deposit', 'var-volume', 'var-points', 'var-rank', 'var-win-rate', 'var-roi'].forEach(fid => {
                const el = document.getElementById(fid);
                if (el) el.value = '';
            });
            if (labelInput) labelInput.value = '';
            this.exchangeSelect.value = '';
            document.getElementById('variational-config-group').style.display = 'none';
            document.getElementById('label-group').style.display = 'none';
            this.modalAddExchange.style.display = 'none';
            
            const remaining = window.walletManager.state.activeExchanges.map(e => ({ ...e, success: false, error: 'Refreshing...' }));
            this.updateAllWalletCards(remaining);
            window.refreshEngine.refresh();
            return;
        }

        // ── STANDARD PATH (Extended / Nado) ────────────────────────
        const addrInput = document.getElementById('wallet-address-input');
        const walletAddr = addrInput?.value.trim();

        // Validate
        if (walletAddr && !/^0x[0-9a-fA-F]{40,64}$/.test(walletAddr)) {
            addrInput.classList.add('input-error');
            alert('❌ Invalid wallet address format');
            return;
        }

        const sessionAddr = (window.walletManager.state.address || '').toLowerCase();
        const finalAddr = (walletAddr || sessionAddr).toLowerCase();

        if (!finalAddr) {
            alert('❌ No wallet address provided or connected');
            return;
        }

        // Check duplicate
        const isDup = window.walletManager.state.activeExchanges.some(e => {
            const eAddr = (e.walletAddress || sessionAddr).toLowerCase();
            return e.exchange === exc && eAddr === finalAddr;
        });

        if (isDup) {
            alert('⚠️ This wallet is already added for ' + exc);
            return;
        }

        // 🔴 CRITICAL: Extended requires authentication BEFORE addExchange
        if (exc === 'extended' && !window.walletManager.state.isAuthenticated) {
            console.log('⚠️ Extended requires authentication, connecting wallet...');
            this.btnSaveExchange.disabled = true;
            this.btnSaveExchange.textContent = 'Connecting Wallet...';
            
            try {
                // Step 1: Connect MetaMask
                const connected = await window.walletManager.connectMetaMask();
                if (!connected) {
                    alert('❌ MetaMask connection failed. Please connect your wallet and try again.');
                    this.btnSaveExchange.disabled = false;
                    this.btnSaveExchange.textContent = 'Add Exchange';
                    return;
                }
                
                this.btnSaveExchange.textContent = 'Signing Message...';
                
                // Step 2: Sign and authenticate
                await window.walletManager.loginToBackend();
                console.log('✅ Authentication successful');
                
            } catch (e) {
                console.error('❌ Authentication failed:', e);
                alert('❌ Authentication failed: ' + e.message);
                this.btnSaveExchange.disabled = false;
                this.btnSaveExchange.textContent = 'Add Exchange';
                return;
            }
            
            this.btnSaveExchange.disabled = false;
            this.btnSaveExchange.textContent = 'Add Exchange';
        }

        console.log('➕ Adding exchange:', { exc, finalAddr });
        
        // bypassAuth only for Nado
        const bypassAuth = (exc === 'nado');
        const result = await window.walletManager.addExchange(exc, finalAddr, label, bypassAuth)
            .catch(e => {
                console.error('❌ Exchange error:', e);
                return { success: false, error: e.message };
            });

        if (!result?.success) {
            alert('❌ Error: ' + (result?.error || 'Failed to add'));
            return;
        }

        // Store Extended API key if needed
        if (exc === 'extended') {
            const pkInput = document.getElementById('extended-api-key');
            const pk = pkInput.value.trim();
            if (pk) {
                console.log('🔑 Storing Extended API key');
                await window.walletManager.setExtendedApiKey(result.id, pk);
                pkInput.value = '';
            }
        }

        // Clear all fields
        if (labelInput) labelInput.value = '';
        if (addrInput) {
            addrInput.value = '';
            addrInput.classList.remove('input-error');
        }
        this.exchangeSelect.value = '';
        this.extendedConfigGroup.style.display = 'none';
        document.getElementById('multi-wallet-group').style.display = 'none';
        document.getElementById('label-group').style.display = 'none';
        this.modalAddExchange.style.display = 'none';

        console.log('✅ Exchange added, refreshing UI...');
        const remaining = window.walletManager.state.activeExchanges.map(e => ({ ...e, success: false, error: 'Refreshing...' }));
        this.updateAllWalletCards(remaining);
        window.refreshEngine.refresh();

    } catch (err) {
        console.error("❌ Error:", err);
        alert("Error: " + err.message);
        this.btnSaveExchange.disabled = false;
        this.btnSaveExchange.textContent = 'Add Exchange';
    }
});
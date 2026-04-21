/**
 * EncryptionManager handles AES-256 encryption using TweetNaCl.js
 * It stores wallet data in localStorage, encrypting sensitive fields (API Keys, Signatures).
 * Uses PBKDF2 for password-derived key generation to ensure maximum security.
 */
class EncryptionManager {
    constructor() {
        this.STORAGE_KEY = 'td_wallets';
        this.VAULT_META_KEY = '_td_vault';
        this.key = null; // Will be set after unlocking
        this.salt = null;
        this.isLocked = true;
    }

    /**
     * Checks if a vault already exists.
     */
    exists() {
        // Migration check: if old key exists, we still count as "exists" for migration
        return localStorage.getItem(this.VAULT_META_KEY) !== null || localStorage.getItem('_tdk') !== null;
    }

    /**
     * Initializes a new vault with a password.
     */
    async initVault(password) {
        const salt = nacl.randomBytes(16);
        this.salt = salt;
        this.key = await this._deriveKey(password, salt);
        
        const meta = {
            salt: nacl.util.encodeBase64(salt),
            version: '2.0',
            iterations: 100000
        };
        
        localStorage.setItem(this.VAULT_META_KEY, JSON.stringify(meta));
        // Remove legacy key if exists to force security upgrade
        localStorage.removeItem('_tdk');
        
        this.isLocked = false;
        return true;
    }

    /**
     * Unlocks the vault using a password.
     */
    async unlock(password) {
        // Handle legacy migration if needed
        const legacyKey = localStorage.getItem('_tdk');
        if (legacyKey && !localStorage.getItem(this.VAULT_META_KEY)) {
            // This is a legacy vault, we'll allow unlocking it once to migrate
            this.key = nacl.util.decodeBase64(legacyKey);
            this.isLocked = false;
            return true;
        }

        const metaRaw = localStorage.getItem(this.VAULT_META_KEY);
        if (!metaRaw) return false;

        const meta = JSON.parse(metaRaw);
        const salt = nacl.util.decodeBase64(meta.salt);
        this.key = await this._deriveKey(password, salt);
        
        // Note: In a production app, we'd verify the key against a stored hash here.
        // For this demo, secretbox.open will return null on incorrect key during decryption.
        this.isLocked = false;
        return true;
    }

    /**
     * Derives a vault key from a signature (Web3 Unlock).
     */
    async unlockWithSignature(signature, address) {
        if (!signature || !address) return false;
        
        // Use the signature as the source of entropy for the key
        const encoder = new TextEncoder();
        const sigBytes = nacl.util.decodeBase64(signature.replace('0x', ''));
        const salt = encoder.encode(`td_vault_salt_${address.toLowerCase()}`);
        
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            sigBytes,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            256
        );

        this.key = new Uint8Array(derivedBits);
        this.isLocked = false;
        
        // Ensure vault metadata exists if this is the first time
        if (!localStorage.getItem(this.VAULT_META_KEY)) {
            const meta = {
                salt: nacl.util.encodeBase64(salt),
                version: '2.0-web3',
                iterations: 100000,
                address: address.toLowerCase()
            };
            localStorage.setItem(this.VAULT_META_KEY, JSON.stringify(meta));
        }
        
        return true;
    }

    async _deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        const derivedBits = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            passwordKey,
            256
        );

        return new Uint8Array(derivedBits);
    }

    /**
     * Encrypts a string using the current master key.
     */
    encrypt(text) {
        if (this.isLocked || !this.key) throw new Error('Vault is locked. Cannot encrypt.');
        if (!text) return null;

        const nonce = nacl.randomBytes(24);
        const messageUint8 = nacl.util.decodeUTF8(text);
        const box = nacl.secretbox(messageUint8, nonce, this.key);
        
        return {
            ciphertext: nacl.util.encodeBase64(box),
            nonce: nacl.util.encodeBase64(nonce)
        };
    }

    /**
     * Decrypts an encrypted object.
     */
    decrypt(encrypted) {
        if (this.isLocked || !this.key) return null;
        if (!encrypted || !encrypted.ciphertext || !encrypted.nonce) return null;
        
        try {
            const box = nacl.util.decodeBase64(encrypted.ciphertext);
            const nonce = nacl.util.decodeBase64(encrypted.nonce);
            const payload = nacl.secretbox.open(box, nonce, this.key);
            
            return payload ? nacl.util.encodeUTF8(payload) : null;
        } catch (e) {
            console.error('Decryption failed:', e);
            return null;
        }
    }

    /**
     * Stores a wallet object. Supports API Keys, Signatures, and Private Keys.
     */
    storeWallet(exchange, address, apiKey, sessionSignature, description, privateKey) {
        const wallets = this.getWallets();
        const encryptedKey = apiKey ? this.encrypt(apiKey) : null;
        const encryptedSig = sessionSignature ? this.encrypt(sessionSignature) : null;
        const encryptedPk = privateKey ? this.encrypt(privateKey) : null;
        
        const newWallet = {
            id: Date.now().toString(),
            exchange,
            address,
            apiKey: encryptedKey,
            sessionSignature: encryptedSig,
            privateKey: encryptedPk,
            description: description || '',
            createdAt: new Date().toISOString()
        };
        
        wallets.push(newWallet);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(wallets));
        return newWallet;
    }

    getWallets() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    deleteWallet(id) {
        const wallets = this.getWallets().filter(w => w.id !== id);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(wallets));
    }

    updateWallet(id, data) {
        const wallets = this.getWallets();
        const index = wallets.findIndex(w => w.id === id);
        if (index === -1) return null;

        if (!this.isLocked) {
            if (data.apiKey !== undefined) {
                data.apiKey = data.apiKey ? this.encrypt(data.apiKey) : null;
            }
            if (data.sessionSignature !== undefined) {
                data.sessionSignature = data.sessionSignature ? this.encrypt(data.sessionSignature) : null;
            }
            if (data.privateKey !== undefined) {
                data.privateKey = data.privateKey ? this.encrypt(data.privateKey) : null;
            }
        }

        wallets[index] = { ...wallets[index], ...data };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(wallets));
        return wallets[index];
    }

    lock() {
        this.key = null;
        this.isLocked = true;
    }
}

const cryptoMgr = new EncryptionManager();
window.cryptoMgr = cryptoMgr;

# How to Run TradeDash

TradeDash is a multi-exchange trading dashboard with a secure Web3-signing authentication layer.

### 1. Prerequisites
- **Node.js**: Installed on your system.
- **MetaMask**: Browser extension installed and at least one wallet connected.
- **Master Password**: You will need to create a master password on your first run to secure your encrypted vault.

### 2. Backend Proxy Setup
The backend handles securely proxying your requests to exchanges (Variational, Nado, Extended).
```powershell
npm install
npm start
```
*Port: 3001*

### 3. Frontend Access
Open the dashboard in your browser:
- **Option A**: Double-click `frontend/dashboard.html` (may have CORS issues on some browsers).
- **Option B (Recommended)**: Use a local server (like `live-server` or `npm run dev` if available).

### 4. First-Time Initialization
1.  **Unlock Vault**: You will see a "Secure Vault" prompt. Enter a strong Master Password. This password is never sent to any server; it is only used locally to encrypt your data.
2.  **Add Wallet**: Click "Link Wallet".
3.  **Authorize**: Choose an exchange and click "**🔒 Authorize via MetaMask**". 
4.  **Sign**: Sign the human-readable message in MetaMask to prove ownership (no funds are accessed).

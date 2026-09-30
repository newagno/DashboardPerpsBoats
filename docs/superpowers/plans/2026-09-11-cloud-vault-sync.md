# Cloud Vault Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement server-side Redis storage for API keys to achieve 100% seamless cross-device synchronization.

**Architecture:** Update the keys endpoints in `server.js` to store API keys in Redis (`vault:${type}:${entryId}`) alongside HttpOnly cookies. Update stats endpoints to fetch from Redis first, falling back to cookies.

**Tech Stack:** Node.js, Express, Redis (via custom `store` utility)

## Global Constraints
- Do not expose any API keys to the frontend.
- Fallback gracefully to cookies if Redis fails or key is missing.
- Ensure TTL for Redis keys is set appropriately (e.g., 30 days or 1 year).

---

### Task 1: Update API Key Management Endpoints

**Files:**
- Modify: `backend/server.js:135-167`

**Interfaces:**
- Consumes: Frontend POST payload to `/api/exchanges/keys/store`
- Produces: Redis key `vault:${type}:${entryId}` stored via `store.set`

- [ ] **Step 1: Write the failing test**
N/A (Testing is manual as this requires a live Redis instance and complex mocking)

- [ ] **Step 2: Update store logic in /api/exchanges/keys/store**
Modify the `/api/exchanges/keys/store` endpoint to `await store.set(cookieName, value, 365 * 24 * 60 * 60);` right before `res.cookie`. Since the endpoint must now be `async`, add the `async` keyword to the route handler. Wrap in `try/catch`.

- [ ] **Step 3: Update check logic in /api/exchanges/keys/check**
Modify the `/api/exchanges/keys/check` endpoint to be `async`. Check if the key exists in Redis using `await store.get(cookieName)`. If found in Redis OR `req.cookies`, return `{ exists: true }`.

- [ ] **Step 4: Update remove logic in /api/exchanges/keys/remove**
Modify the `/api/exchanges/keys/remove` endpoint to be `async`. Remove the key from Redis using `await store.set(cookieName, null, 1)` (or similar mechanism if `store.delete` isn't implemented). Clear the cookie as usual.

- [ ] **Step 5: Commit**
```bash
git add backend/server.js
git commit -m "feat: store API keys in Redis vault for cross-device sync"
```

---

### Task 2: Update Extended Stats Logic

**Files:**
- Modify: `backend/server.js` (inside `/api/exchanges/extended/stats`)

**Interfaces:**
- Consumes: Redis key `ext_key_${entryId}`
- Produces: `apiKey` variable for extended API requests

- [ ] **Step 1: Write minimal implementation**
Find `const apiKey = req.cookies[\`ext_key_${entryId}\`];` in the Extended stats endpoint.
Replace it with:
```javascript
let apiKey = await store.get(`ext_key_${entryId}`);
if (!apiKey) {
    apiKey = req.cookies[`ext_key_${entryId}`];
}
```

- [ ] **Step 2: Commit**
```bash
git add backend/server.js
git commit -m "feat: use Redis vault for Extended API keys"
```

---

### Task 3: Update Extended Sync History Logic

**Files:**
- Modify: `backend/server.js` (inside `/api/exchanges/extended/sync-history`)

**Interfaces:**
- Consumes: Redis key `ext_key_${entryId}`
- Produces: `apiKey` variable for extended API requests

- [ ] **Step 1: Write minimal implementation**
Find `const apiKey = req.cookies[\`ext_key_${entryId}\`];` in the Extended sync-history endpoint.
Replace it with:
```javascript
let apiKey = await store.get(`ext_key_${entryId}`);
if (!apiKey) {
    apiKey = req.cookies[`ext_key_${entryId}`];
}
```

- [ ] **Step 2: Commit**
```bash
git add backend/server.js
git commit -m "feat: use Redis vault for Extended history sync API keys"
```

---

### Task 4: Update Variational Stats Logic

**Files:**
- Modify: `backend/server.js` (inside `/api/exchanges/variational/stats`)

**Interfaces:**
- Consumes: Redis key `vr_token_${entryId}`
- Produces: `vrToken` variable for Variational API requests

- [ ] **Step 1: Write minimal implementation**
Find `const vrToken = req.body.vrToken || req.cookies?.['vr-token'];` in the Variational endpoint.
Wait, Variational uses `vr_token_${entryId}` in the store endpoint. But the stats endpoint uses `req.cookies?.['vr-token']`? Let's fix that inconsistency!
Replace it with:
```javascript
let vrToken = await store.get(`vr_token_${entryId}`);
if (!vrToken) {
    vrToken = req.body.vrToken || req.cookies?.[`vr_token_${entryId}`] || req.cookies?.['vr-token'];
}
```

- [ ] **Step 2: Commit**
```bash
git add backend/server.js
git commit -m "feat: use Redis vault for Variational API keys"
```

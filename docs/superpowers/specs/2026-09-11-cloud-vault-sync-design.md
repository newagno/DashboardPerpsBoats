# Cloud Vault Synchronization Design

## Goal
Achieve 100% seamless cross-device synchronization of exchange API keys (like the Extended Exchange API key and Variational VR Token) between devices without requiring the user to manually enter the keys on each new device.

## Context
Currently, API keys are stored exclusively in HttpOnly browser cookies. While extremely secure, this breaks cross-device syncing because the user's mobile phone does not share cookies with the laptop.

## Proposed Architecture

1. **Redis Vault Storage**:
   - We will utilize the existing Vercel KV (Redis) database as a "Cloud Vault".
   - When a user adds an API key via the frontend, the `POST /api/exchanges/keys/store` endpoint will save the key in Redis under a secure identifier: `vault:${type}:${entryId}`.

2. **Fetching Stats**:
   - The stats endpoints (`/api/exchanges/extended/sync-history` and `/api/exchanges/variational/stats`) will first attempt to retrieve the API key from Redis using `vault:${type}:${entryId}`.
   - If found in Redis, the backend will use this key to authenticate with the respective exchange API.
   - As a fallback (for backwards compatibility), the backend will still check `req.cookies` if the Redis key is absent.

3. **Security Measures**:
   - The API keys will remain securely stored in the backend and will **never** be transmitted back to the frontend.
   - The frontend will not need to know the keys; it will simply rely on the backend to use the stored keys for synchronization.

## Verification
- Add an API key on the laptop.
- Open the dashboard on the mobile phone.
- The phone should seamlessly load the exchange data without showing the "API KEY NOT FOUND" error, utilizing the Cloud Vault.

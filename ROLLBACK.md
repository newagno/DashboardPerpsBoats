# How to Rollback Code Changes

If something goes wrong during the Web3 Signature update, follow these steps to restore the stable version.

### 1. Identify Backup Folder
The stable version is stored in:
`c:\D\blockchain\P\Dashboard Perps\backups\v1_stable\`

### 2. Manual Restore
1.  **Delete current contents** in `frontend/` and `backend/`.
2.  **Copy all folders and files** from `backups/v1_stable/` back to the root of the project.
3.  **Ensure `package.json`** is restored as well.

### 3. Automatic Restore (PowerShell)
Run this command from the root of the project:
```powershell
Copy-Item -Path backups/v1_stable/* -Destination ./ -Recurse -Force
```

### 4. Browser Clean-Up
-   **Reset LocalStorage**: If you're experiencing login issues with the vault, open your browser Console (`F12`) and run:
    ```javascript
    localStorage.clear();
    location.reload();
    ```

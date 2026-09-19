# 07 — Backup and Recovery

**Audience:** engineers & AI agents · **Scope:** encrypted data backups, migration, and export/import · **Verified against:** `1.1.0`

QuotaShift provides passphrase-protected export and import workflows to allow seamless migration between workstations or safe local backups.

## 1. Encrypted Backup Container Specification

Backups are exported as encrypted JSON files protected by the user's secret passphrase using **AES-256-GCM** authenticated encryption:

```json
{
  "version": 1,
  "kdf": {
    "algorithm": "PBKDF2-SHA256",
    "iterations": 100000,
    "salt": "<hex-encoded-32-byte-salt>"
  },
  "cipher": {
    "algorithm": "AES-256-GCM",
    "nonce": "<hex-encoded-12-byte-nonce>",
    "ciphertext": "<base64-encoded-payload>",
    "tag": "<hex-encoded-16-byte-auth-tag>"
  }
}
```

### Export Payload Inclusions:
- **Google Antigravity Accounts**: Account aliases, emails, refresh tokens, and display profiles.
- **OpenAI Codex Accounts**: Workspace IDs, email addresses, and OAuth tokens.
- **OpenAI Codex Pools**: Custom model pools, priority weightings, and account member assignments.

*Note: Claude Code profiles are not included in credential backups because Claude Code credentials remain entirely owned by local OS filesystem config directories.*

## 2. Export & Reveal Workflow

1. User opens **Settings → Data → Export Backup**.
2. User provides a strong passphrase.
3. Rust backend derives the AES key, serializes in-memory account data from the secure vault, encrypts the payload, and writes the timestamped file (e.g. `quotashift-backup-2026-09-19.json`).
4. **Success Modal with Explorer Reveal**:
   - A modal confirms export completion and shows the destination path.
   - User can click **Open in Explorer** / **Reveal File** which executes `open_path_in_file_manager`:
     - **Windows**: `explorer.exe /select,<path>`
     - **macOS**: `open -R <path>`
     - **Linux**: `xdg-open <directory>`

## 3. Import & Migration Workflow

1. User clicks **Import Backup** in **Settings → Data**.
2. Native file dialog prompts for backup file selection.
3. If file selection succeeds, the passphrase dialog auto-opens immediately.
4. If cancelled, the panel state restores gracefully without visual glitching.
5. Upon passphrase entry, the backend verifies the GCM authentication tag:
   - **Invalid Passphrase or Tampered File**: No corrupted or partial data is written. The passphrase dialog stays open and shows a red inline error immediately below the passphrase input; this validation failure does not use a toast. Editing the input clears the error for retry.
   - **Successful Decryption**: Deserializes accounts, merges them with existing secure vault data without overwriting distinct active credentials, and triggers an immediate UI state refresh.

**Related:** [`02-security-and-credentials`](02-security-and-credentials.md) · [`06-settings-and-configuration`](06-settings-and-configuration.md)

**Back to Index:** [`README.md`](README.md)

# 02 — Security and Credentials

**Audience:** engineers & AI agents · **Verified against:** `1.1.1` · **Date:** 2026-09-21

## 1. QuotaShift secure account storage

Sensitive QuotaShift account state is not persisted as plaintext browser storage.

### Native encrypted store

- Rust implementation: `src-tauri/src/storage/secure_storage.rs` and `storage/secure_storage/ops.rs`.
- Encrypted file: `secure-storage-v1.bin` under the application data directory.
- Cipher: AES-256-GCM with a random 12-byte nonce per write and authenticated format metadata.
- Key: random 32-byte key stored only through the OS keyring service `com.the-long-ride.quotashift`.
- File format begins with `QSF1` and format version 1.
- Existing ciphertext without its keyring key is an error; QuotaShift does not silently generate a replacement key and orphan the data.
- Writes use a uniquely named `create_new` temporary file, `sync_all`, restrictive permissions on Unix, then atomic replacement/rename.

### Renderer facade and migration

`SecureStorageAdapter` maintains a synchronous in-memory view for application code while serializing native secure writes asynchronously.

- Sensitive writes/deletes are queued in order.
- Failed writes roll the in-memory value back to the last successfully persisted value when that mutation is still current.
- `flush()` surfaces queued persistence failures.
- Legacy plaintext values are deleted only after secure migration succeeds; migration failure leaves recoverable legacy copies intact and the adapter unhydrated.
- Sensitive keys include Antigravity accounts, Codex accounts, the local Antigravity session, and compatible dynamic `antigravity-*-accounts` keys.

## 2. Provider credential boundaries

### Antigravity

- OAuth/session credentials can be refreshed and applied because account switching is a supported QuotaShift feature.
- SQLite session-writing helpers receive credential payloads through JSON stdin. Credential values are not placed on subprocess command lines.

### OpenAI Codex

- OAuth or API-key account material is stored through the secure account store.
- Pool routing refreshes expiring OAuth credentials before building router snapshots and persists refreshed account material through secure storage.
- Pool definitions, usage/model caches, selected pool IDs, and routing flags are non-secret state and are stored separately.

### Claude Code

- QuotaShift does not write or replace Claude credentials.
- Profiles are identified by local `CLAUDE_CONFIG_DIR` roots and monitored through local status/usage mechanisms.
- Process guardrails act on verified local process identity, not authentication files.

## 3. Codex router security

- Listener binds only `127.0.0.1` with an OS-assigned ephemeral port.
- Each listener receives a fresh random secret that clients must present.
- Host/origin checks reject unexpected non-loopback surfaces.
- Router logs contain request boundaries and normalized status metadata, not authorization tokens, request bodies, query strings, or credentials.
- Provider configuration is restored when routing stops or stale routing state is recovered.

## 4. Backup cryptography

User-exported backups use a separate passphrase-based envelope:

- PBKDF2-HMAC-SHA-256, 100,000 iterations.
- 16-byte random salt.
- AES-256-GCM with 12-byte random IV.
- Wrong passphrase or tampered ciphertext fails decryption.
- The backup passphrase itself is not stored in the backup.

## 5. Dependency security exception

Linux GTK3 currently constrains stable Tauri to the affected published `glib 0.18.x` range for RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g. QuotaShift applies the reviewed source-compatible 0.18.5 backport through an immutable git revision in `[patch.crates-io]`.

`SECURITY.md`, `.github/dependabot.yml`, the Cargo audit exception, and `tests/glib-security-patch.test.mjs` document and enforce the narrow exception. The version-based scanner ignore is metadata handling; the pinned source patch is the runtime mitigation.

## 6. Logging rules

- Antigravity successful quota refreshes emit concise masked summaries; low-level successful HTTP traffic is not logged.
- Codex model-catalog and pool-router diagnostics use request-boundary logs without secrets or payload bodies.
- Persistent `quotashift.log` is limited to WARN/ERROR; verbose session logs remain in memory for the running session.

**Next →** [03 — Provider Monitoring and Switching](03-provider-monitoring-and-switching.md)

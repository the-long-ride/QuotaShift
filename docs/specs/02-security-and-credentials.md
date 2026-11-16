---
schema_version: 1
id: architecture.security-credentials
title: Security and Credentials
kind: architecture
status: verified
summary: "QSF1 AES-256-GCM encrypted vaults, OS keyring secrets, OAuth PKCE & scope auditing, CLI/SQLite stdin hygiene, backup cryptography, and Cargo security mitigations."
tags: ["security", "credentials", "keyring", "oauth", "crypto"]
source_paths: ["src-tauri/src/auth/credential_store.rs", "src-tauri/src/auth/credential_store/consumer.rs", "src-tauri/src/auth/mod.rs", "src-tauri/src/auth/oauth.rs", "src-tauri/src/auth/oauth/codex.rs", "src-tauri/src/auth/oauth/codex_client_id.rs", "src-tauri/src/auth/oauth/codex_profile.rs", "src-tauri/src/auth/oauth/utils.rs", "src-tauri/src/auth/secrets.rs", "src-tauri/src/storage/mod.rs", "src-tauri/src/storage/secure_storage.rs", "src-tauri/src/storage/secure_storage/claude_gateway.rs", "src-tauri/src/storage/secure_storage/ops.rs", "src-tauri/src/storage/secure_storage/siwc_native.rs", "src-tauri/src/storage/secure_storage/tests.rs", "src-tauri/src/system/cli_restore/command.rs", "src-tauri/src/system/cli_restore/continuation.rs", "src-tauri/src/system/cli_restore/conversation.rs", "src-tauri/src/system/cli_restore/inject_windows.rs", "src-tauri/src/system/cli_restore/mod.rs", "src-tauri/src/system/cli_restore/outcome.rs", "src-tauri/src/system/cli_restore/respawn.rs", "src-tauri/src/system/cli_restore/restore.rs", "src-tauri/src/system/cli_restore/snapshot.rs", "src-tauri/src/system/cli_restore/tests/command_tests.rs", "src-tauri/src/system/cli_restore/tests/conversation_tests.rs", "src-tauri/src/system/cli_restore/tests/outcome_tests.rs", "src-tauri/src/system/cli_restore/tests/snapshot_tests.rs", "src-tauri/src/system/keep_alive.rs", "src-tauri/src/system/keep_alive/codex.rs", "src-tauri/src/system/keep_alive/tests.rs", "src-tauri/src/system/session.rs", "src-tauri/src/system/session/executable.rs", "src-tauri/src/system/session/restart.rs", "src-tauri/src/system/session/store.rs", "src-tauri/src/system/session/store/capture.rs", "src-tauri/src/system/session/store/source.rs", "src-tauri/src/system/session/switch_message.rs", "src-tauri/src/system/session/tests.rs", "src-tauri/src/system/session/unix.rs", "src/hooks/accounts/useAccountCardGridColumns.ts", "src/hooks/accounts/useAccountRename.ts", "src/hooks/accounts/usePointerCardReorder.ts", "src/utils/account/account-avatar.ts", "src/utils/account/account-last-used.ts", "src/utils/account/account-order.ts", "src/utils/account/account-search.ts", "src/utils/account/account-selection.ts", "src/utils/account/capture/account-auth-error.ts", "src/utils/account/capture/account-card-columns.ts", "src/utils/account/capture/account-poll-suspension.ts", "src/utils/account/capture/account-sort.ts", "src/utils/account/capture/capture-completion.ts", "src/utils/account/capture/capture-label.ts", "src/utils/account/current-account.ts", "src/utils/account/current-session-last-used.ts", "src/utils/account/index.ts", "src/utils/account/pointer-reorder.ts", "src/utils/auth/auth.ts", "src/utils/auth/crypto.ts", "src/utils/auth/index.ts", "src/utils/auth/secure-storage-migration.ts", "src/utils/auth/secure-storage-types.ts", "src/utils/auth/secure-storage.ts"]
related_specs: ["architecture.system-overview", "feature.provider-monitoring-switching", "workflow.claude-guardrails-lifecycle", "workflow.backup-recovery", "feature.codex-routing-pools", "feature.agent-api-cli-failover"]
last_doc_update_at: "2026-11-15T18:57:14Z"
last_verified_at: "2026-11-15T18:57:14Z"
last_verified_code_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_commit: 87e44a844f42ca07d2a4dd7f09fe7cb213bf84e3
last_source_change_at: "2026-11-16T01:57:07+07:00"
source_fingerprint: "sha256:b2015b27a3470dca63afe5fd9f02b188bf921a0de5b9903f2af48116925113fb"
---

# 02 — Security and Credentials

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` · **Date:** 2026-11-16

## 1. QuotaShift secure account storage

Sensitive QuotaShift account state is not persisted as plaintext browser storage.

### Native encrypted store

- Rust implementation: `src-tauri/src/storage/secure_storage.rs` and `src-tauri/src/storage/secure_storage/ops.rs`.
- Encrypted file: `secure-storage-v1.bin` under the application data directory (`app.path().app_data_dir()`).
- Cipher: AES-256-GCM with a random 12-byte nonce (`OsRng`) per write and authenticated associated data (`QSF1` + format version `1`).
- Key: random 32-byte key stored only through the OS keyring service `com.the-long-ride.quotashift` (`secure-storage-key-v1`).
- File format begins with `QSF1` (`MAGIC`) and format version `1`.
- Existing ciphertext without its keyring key fails closed with an error; QuotaShift does not silently generate a replacement key and orphan the data.
- Writes are serialized by a process-wide mutex (`SECURE_STORAGE_LOCK`), use a uniquely named `create_new` temporary file (`.{file}.tmp-{pid}-{rand}`) with `0o700` directory and `0o600` file permissions on Unix, `sync_all`, and atomic rename.
- Native-only encrypted stores share the same `QSF1` AEAD format and OS keyring vault while remaining inaccessible to generic renderer IPC commands (`validate_requested_key` rejects `siwc-registration-*` and `claude-gateway-binding-*`):
  - `claude-gateway-v1.bin` (`src-tauri/src/storage/secure_storage/claude_gateway.rs`) stores `ClientBinding` secrets for Claude Code gateway `apiKeyHelper` invocations (`--claude-gateway-token <profile_id>`).
  - `siwc-credentials-v1.bin` (`src-tauri/src/storage/secure_storage/siwc_native.rs`) stores Sign-In-With-Codex (SIWC) registration sessions and index metadata.

### Renderer facade and migration

`SecureStorageAdapter` (`src/utils/auth/secure-storage.ts`, `secure-storage-types.ts`, `secure-storage-migration.ts`) maintains a synchronous in-memory view (`Object.defineProperty(window, "localStorage", ...)`) for application code while serializing native secure writes asynchronously:

- Sensitive writes/deletes are queued in order via `writeChain`.
- Failed writes roll the in-memory value back to the last successfully persisted value when the failed mutation's revision is still current.
- `flush()` surfaces queued persistence failures.
- Legacy plaintext values in native `localStorage` and `tauri-plugin-store` are deleted only after all secure writes succeed; migration failure leaves recoverable legacy copies intact and the adapter unhydrated.
- Sensitive keys include `antigravity-accounts-list`, `antigravity-codex-accounts`, `quotashift_local_antigravity_session_v1`, and compatible dynamic `antigravity-*-accounts` keys.
- `obfuscate`/`deobfuscate` in `src/utils/auth/auth.ts` is UTF-8-safe Base64 field encoding only; at-rest confidentiality depends on `secure-storage-v1.bin` and passphrase-encrypted backup envelopes.

## Router telemetry privacy

- Router telemetry persists numeric aggregates only: request counts, input/output/cached/reasoning token totals, cache-hit request counts, hourly buckets, and per-model breakdowns.
- Request and response bodies, prompts, tool arguments, and credentials are not stored in telemetry. The local telemetry file is application usage history, not a request log.

## 2. Provider credential boundaries

### Antigravity

- OAuth/session credentials can be refreshed and applied because account switching is a supported QuotaShift feature.
- **Browser Google OAuth (`src-tauri/src/auth/oauth.rs`, `oauth/utils.rs`)**:
  - Uses PKCE S256 and a random `state` token on a local loopback listener (`127.0.0.1:1456`, redirect URI `http://localhost:1456/auth/callback`), rejecting callbacks with missing/mismatched state.
  - Resolves Google OAuth client credentials (`src-tauri/src/auth/credential_store.rs`, `credential_store/consumer.rs`) in order: installed Antigravity IDE `main.js`, gcloud Application Default Credentials (`authorized_user`), runtime prefetch/disk cache (`~/.quotashift/ag_client_id.txt` and `ag_client_secret.txt`), or compile-time `QUOTASHIFT_AG_*` overrides (`src-tauri/src/auth/secrets.rs`).
  - **Live OAuth scope audit**: `exchange_antigravity_google_token` inspects the token response's `scope` string (falling back best-effort to `https://oauth2.googleapis.com/tokeninfo?access_token=...`), checks granted space- or comma-delimited scopes against `AG_GOOGLE_SCOPES` via `audit_granted_scopes`, and populates `missingScopes` and `scopeAuditPassed` via `apply_scope_audit`. When `scopeAuditPassed === false`, `AddAntigravityAccountModal` warns the user and recommends **Capture Local Session** for full Antigravity 2.0 permissions.
- **Local session capture & matching (`src-tauri/src/system/session/store.rs`, `store/capture.rs`, `store/source.rs`, `src/utils/account/current-account.ts`)**:
  - Capture reads the provider's shared OS-keyring session (`gemini`/`antigravity` on Unix; Windows Credential Manager via `read_cred_mgr.py`) and each older IDE SQLite `state.vscdb` profile without modifying either source, selecting the authoritative session according to active CLI/IDE runtime detection.
  - Matching email, refresh token, or access token prevents saving a duplicate copy (`findAntigravityAccountMatch`); native capture tags accounts with `authSource: "native_capture"` and upgrades matching emails in-place while preserving `id`, label, and saved account order.
- **Session switching & CLI restoration (`src-tauri/src/system/session.rs`, `restart.rs`, `unix.rs`, `src-tauri/src/system/cli_restore/`)**:
  - SQLite (`write_vscdb.py`, `write_worker_vscdb.py`) and Windows Credential Manager (`write_cred_mgr.py`) helpers receive credential payloads solely through JSON stdin (`run_python_json_command`); credential values are never placed on subprocess command lines (`sys.argv`).
  - Account switching targets only the identified running Antigravity executable (`QS_RESTART_TARGET` env var on Windows; verified path on Unix), excludes QuotaShift-owned `antigravity-workers` from CLI termination, attempts to reopen the IDE if writing the switched session fails, and verifies relaunch.
  - Stopped `agy` and `codex` CLI sessions are restored using host-PID + start-time verification (`host_alive`), validated conversation IDs (`valid_id`: 8–64 ASCII alphanumeric/hyphen chars), shell-appropriate quoting, Windows ConPTY input (`inject_windows.rs`) or Unix `tmux` pane validation (`valid_tmux_pane`), or new tab/window respawn. Continuation handoff prompts (`cli_restore/continuation.rs`) are single-slot, one-shot, validated against control/NUL injection, expire after 90s, and are bound to `(CliKind, pid, started_at)`.
- **Multi-account keep-alive (`src-tauri/src/system/keep_alive.rs`, `src-tauri/src/antigravity/keep_alive/`)**: maintains registered Antigravity accounts via read-only quota/OAuth maintenance without generating model activity.
- Re-authentication flows display the target account header, highlight the account row, and retain the account's saved ID, order, label, and prior `refreshToken` if the new exchange omits one.

### OpenAI Codex

- OAuth or API-key account material is stored through the secure account store; SIWC registrations are isolated in `siwc-credentials-v1.bin`.
- **Browser OAuth (`src-tauri/src/auth/oauth/codex.rs`, `codex_client_id.rs`, `codex_profile.rs`)**: uses PKCE S256 and `state` validation on loopback `127.0.0.1:1455` (`http://localhost:1455/auth/callback`) with dynamically resolved/cached `CLIENT_ID` (`~/.quotashift/codex_client_id.txt`).
- **Multi-account keep-alive (`src-tauri/src/system/keep_alive/codex.rs`, `src-tauri/src/codex/keep_alive/`)**: maintains all saved Codex accounts, refreshing JWT tokens within the 5-minute safety window (`CODEX_REFRESH_SAFETY_SECONDS`), persisting rotated refresh tokens, self-healing `401 Unauthorized` responses, and verifying API keys against `/models`.
- Active CLI configuration (`~/.codex/auth.json`) is synchronized automatically whenever the active account refreshes (`read_codex_auth` / `write_codex_auth` / `codex_sync`).
- Pool routing refreshes expiring OAuth credentials before building router snapshots and persists refreshed account material through secure storage.
- Pool definitions, usage/model caches, selected pool IDs, routing flags, and aggregate router telemetry are non-secret state and are stored separately from secure account credentials.
- Re-authentication modal displays target account header and preserves existing account configuration.

### Claude Code

- QuotaShift does not write or replace Claude credentials.
- Profiles are identified by local `CLAUDE_CONFIG_DIR` roots and monitored through local status/usage mechanisms.
- Process guardrails act on verified local process identity, not authentication files.
- Claude Code Connect Wizard uses launch-once or persistent profile bindings. Persistent mode configures an `apiKeyHelper` command (`--claude-gateway-token <profile_id>`) referencing an encrypted gateway binding in `claude-gateway-v1.bin` (`src-tauri/src/storage/secure_storage/claude_gateway.rs`), avoiding plaintext tokens on disk.
- Profile launchers in `.quotashift/bin/{profile_executable}` isolate environment and config variables securely per profile.

## 3. Codex router & Agent API security

- Codex Router listener binds only `127.0.0.1` with an OS-assigned ephemeral port and a fresh random secret.
- Host/origin checks reject unexpected non-loopback surfaces.
- Router logs contain request boundaries and normalized status metadata, not authorization tokens, request bodies, query strings, or credentials.
- Provider configuration is restored when routing stops or stale routing state is recovered.
- Routing key regeneration supports an interactive confirmation dialog with an automated update switch to propagate new keys to `settings.json` across all QuotaShift-created Claude profiles.
- **AI Agent API (`src-tauri/src/agent_api/`)**:
  - Disabled by default (`quotashift_agent_api_enabled_v1`); binds strictly to `127.0.0.1:<port>` (default `45692`, valid `1024–65535`).
  - Rejects browser `Origin` headers (no CORS) and non-loopback `Host` headers (`localhost` / `127.0.0.1` only).
  - Stores the Bearer token in the OS keyring (`com.the-long-ride.quotashift.agent-api` / `agent-api-key-v1`), supporting generated 32-byte keys or user-entered keys (`16–512` chars, no whitespace/control chars) updated only while stopped. Validates `Authorization: Bearer <token>` in constant time via SHA-256 digests (`matches_bearer`).
  - Read endpoints (`/v1/accounts`, `/v1/pools`, `/v1/operations/{id}`) never expose account emails or aliases.
  - User-scope Terminal/PowerShell setup passes the keyring secret in process environment (`QUOTASHIFT_SETUP_KEY`) rather than writing the key into temporary setup script files; managed `SKILL.md` files never embed secrets.
- **Windows uninstaller cleanup (`src-tauri/installer.nsi`)**: When the user explicitly checks `Clean all app data (includes temp files and all data written to this device)`, uninstall removes QuotaShift Credential Manager entries (`secure-storage-key-v1.com.the-long-ride.quotashift` and `agent-api-key-v1.com.the-long-ride.quotashift.agent-api`), app data directories, temp files, `HKCU\Environment` Agent API variables, and unmodified managed `quotashift-rotation` skills.

## 4. Backup cryptography

User-exported backups (`src/utils/auth/crypto.ts`) use a separate passphrase-based Web Crypto envelope:

- PBKDF2-HMAC-SHA-256, 100,000 iterations.
- 16-byte random salt.
- AES-256-GCM with 12-byte random IV.
- Wrong passphrase or tampered ciphertext fails decryption.
- The backup passphrase itself is not stored in the backup (`hashPassphrase` produces a SHA-256 digest only for optional local verification).
- Backups explicitly preserve `refreshToken` for Antigravity and Codex OAuth credentials so restored accounts remain authenticated.

## 5. Dependency security and exceptions

- **Linux `glib` patch (`RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g`)**: Linux GTK3 currently constrains stable Tauri 2 to the affected published `glib 0.18.x` range. QuotaShift applies the reviewed source-compatible 0.18.5 backport through an immutable git revision (`9e2bb20e2daba5b4dc5e2c9f4dee0797a1503b9f`) in `src-tauri/Cargo.toml` `[patch.crates-io]`. `SECURITY.md`, `.github/dependabot.yml`, `src-tauri/.cargo/audit.toml`, and `tests/security/glib-security-patch.test.mjs` document and enforce the narrow exception. The version-based scanner ignore is metadata handling; the pinned source patch is the runtime mitigation.
- **Cargo lockfile updates (`1.3.0`)**: `src-tauri/Cargo.lock` updates `rustix` (`1.1.4 → 1.1.6`), `tokio` (`1.52.3 → 1.54.1`), and `async-executor` (`1.14.0 → 1.14.1`).
- **Unsigned self-updater removal**: Tauri backend no longer exposes `execute_update` or unsigned `update_setup.exe` / `update.deb` installer downloads (`tests/security/update-backend-security.test.mjs`).

## 6. Logging rules

- Antigravity successful quota refreshes emit concise masked summaries; low-level successful HTTP traffic is not logged.
- Codex model-catalog and pool-router diagnostics use request-boundary logs without secrets or payload bodies.
- Persistent `quotashift.log` is limited to WARN/ERROR; verbose session logs remain in memory for the running session.

**Next →** [03 — Provider Monitoring and Switching](03-provider-monitoring-and-switching.md)

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Encrypted Storage & Keys | `src-tauri/src/storage/secure_storage.rs`, `secure_storage/*.rs` | `QSF1` AES-256-GCM vault, OS keyring keys, isolated SIWC & Claude gateway binary stores |
| Renderer Storage Facade | `src/utils/auth/{secure-storage*,crypto,auth}.ts` | Synchronous `localStorage` facade, ordered write queue, rollback, backup PBKDF2/AES-GCM crypto |
| OAuth & Scope Audit | `src-tauri/src/auth/{oauth,oauth/utils,oauth/codex*,credential_store*}.rs` | PKCE S256 loopback OAuth flows and `tokeninfo` / `audit_granted_scopes` verification |
| Session, Keep-Alive & Restore | `src-tauri/src/system/{session*,keep_alive*,cli_restore*}.rs` | Safe JSON-stdin SQLite/keyring updates, token refreshers, ConPTY/tmux CLI continuation |
| Account Utilities & Hooks | `src/utils/account/**`, `src/hooks/accounts/**` | Account matching, avatar/last-used metadata, card sorting, poll suspension |

---
schema_version: 1
id: workflow.backup-recovery
title: Backup and Recovery
kind: workflow
status: verified
summary: "Passphrase-encrypted Full Backup v3 and Credentials Backup v1 payloads, 53-key settings allowlist, v1-v3 compatibility merge rules, and Codex/CLI pool restore parity."
tags: ["backup", "recovery", "encryption", "settings", "migration"]
source_paths: ["src/hooks/app/useAppBackups.ts", "src/utils/codex/pools/codex-pools-v2-migration.ts", "src/utils/common/backup/app-backup-merge.ts", "src/utils/common/backup/app-backup.ts", "src/utils/common/backup/app-constants.ts", "src/utils/common/backup/app-storage.ts", "src/utils/common/backup/credentials-backup.ts", "src/utils/common/backup/settings-backup.ts"]
related_specs: ["architecture.system-overview", "architecture.security-credentials", "interface.settings-configuration", "feature.codex-routing-pools", "feature.agent-api-cli-failover"]
last_doc_update_at: "2026-11-16T06:42:00Z"
last_verified_at: "2026-11-16T06:42:00Z"
last_verified_code_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_at: "2026-11-16T01:57:11+07:00"
source_fingerprint: "sha256:845f2f1892635b397b7d41fb5a5cc6086812e867b3bfc511cc0632ceddbdff6d"
---

# 07 — Backup and Recovery

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` · **Date:** 2026-11-16

QuotaShift exposes two passphrase-encrypted backup workflows under **Settings > Data** (`SettingsModal`, `useAppBackups`), both separate from the native OS-keyring-backed runtime secure store (`QSF1`).

## Backup payloads

### 1. Full Encrypted Backup (`version: 3`)

`buildBackupData` (`src/utils/common/backup/app-backup.ts`) produces logical payload version **3** containing:

- `createdAt` timestamp and `theme` (kept for legacy importers);
- `settings`: allowlisted user preferences (`collectSettings()`) as storage-key-to-string maps;
- `antigravity`: account records (preserving `refreshToken` / `refresh_token`, session keys, and quotas) plus Antigravity-scoped `cliPools`;
- `codex`: account records (preserving OAuth tokens, refresh tokens, plan types, and rate limits for seamless keep-alive on restore), Codex account pools (`loadCodexPools()`), and Codex-scoped `cliPools`;
- `cliPools`: full CLI account rotation pool array (`loadCliRotationPools()`).

Claude credentials/profiles are not exported because Claude authentication remains owned by local Claude configuration directories.

### 2. Account Credentials Backup (`version: 1`)

`buildCredentialsBackupData` (`src/utils/common/backup/credentials-backup.ts`, triggered via `AccountCredentialsSection` in **Settings > Data**) exports a lightweight credential-only envelope (`version: 1`, `type: "quotashift_credentials_backup"`, `createdAt`) containing solely `antigravity.accounts` and `codex.accounts`.

`restoreCredentialsData` merges and persists only Antigravity and Codex accounts plus their account ordering (`ANTIGRAVITY_ORDER_KEY`, `CODEX_ORDER_KEY`) without modifying application settings, Codex pools, or CLI rotation pools.

## Settings

`BACKUP_SETTING_KEYS` (`src/utils/common/backup/settings-backup.ts`) defines the **53** allowlisted preference keys (`MAX_SETTING_VALUE_LENGTH = 64 * 1024`), covering:

- Appearance & shell: theme, card layout mode, platform visibility, main-window zoom, UI adjustment, display mode & last display mode, circle overlay orientation, max monitored account cards (`MAX_MONITORED_CARDS_KEY`), overlay enabled, used/remaining quota display mode.
- Monitoring & automation: multi-track switch, default/tracked/idle poll intervals, Antigravity keep-alive, persistent exact workers (`PERSISTENT_WORKER_KEY`), restart-on-switch, auto-monitor-on-apply, optional same-provider unmonitor on apply.
- Routing & CLI pools: Codex pool routing, router port, active pool ID, Codex model routing, CLI rotation prompt preferences (`CLI_ROTATION_PREFERENCES_KEY`).
- Claude Code: poll interval, guardrail enablement/thresholds (window-driven, 5-hour, weekly), auto-resume at reset, reduce-low-usage probing, only-watch-processing-accounts, Claude reset count (`CLAUDE_RESET_CREDITS_ENABLED_KEY`), and Claude aliases.
- Shortcuts: global overlay/refresh shortcut keys & enabled flags, plus all 11 in-app shortcuts (add account, toggle theme, toggle card view, focus search, refresh all, open settings, quit app, untrack all, zoom in, zoom out, reset zoom).

Intentionally excluded (`EXCLUDED` in `tests/shared/settings-backup-coverage.test.mjs`): tracked account selection (`quotashift_overlay_tracked_v2` and legacy tracked keys), overlay window monitor position (`quotashift_overlay_pos`), transient caches (usage, model catalog, overlay payload, auth poll suspensions), local sessions and active account IDs, Claude manual profile directories/order/last-used, CLI rotation active bindings (`quotashift_cli_rotation_bindings_v1`), superseded legacy poll keys, and privileged Agent API settings (`quotashift_agent_api_enabled_v1`, `quotashift_agent_api_port_v1`, `quotashift_agent_api_write_v2`). `tests/shared/settings-backup-coverage.test.mjs` fails if any new `*_KEY` or `quotashift*` storage key in `src/` is unclassified.

Import writes only known string keys under the size cap, maps legacy version 2 `theme` fallback, validates `CODEX_ACTIVE_POOL_ID_KEY` against restored `reconciled` pool IDs, and forces `enabled: false` and `autoRestartAfterAppStart: false` on restored `CLI_ROTATION_PREFERENCES_KEY` (preserving the prompt text). When `importedSettingsCount > 0`, `useAppBackups` flushes secure storage (`flushSecureStorage()`) and schedules a window reload (`1200ms`) so all windows read restored preferences.

## Encryption envelope

Both backup formats serialize JSON and encrypt via Web Crypto (`src/utils/auth/crypto.ts`):

- PBKDF2-HMAC-SHA-256 with 100,000 iterations;
- random 16-byte salt;
- AES-256-GCM;
- random 12-byte IV;
- JSON bundle fields `salt`, `iv`, and `data` (base64).

A wrong passphrase or tampered ciphertext fails authenticated decryption without mutating state. `PassphraseModal` surfaces passphrase/decryption errors inline (`"Invalid passphrase or corrupted backup"`), and successful exports surface `"Backup Exported Successfully"` with a file-manager reveal action (`open_path_in_file_manager`).

## Restore compatibility

`extractBackupPayload` (`src/utils/common/backup/app-backup.ts`) accepts v1–v3 structured backups as well as legacy layouts: `platforms` wrappers, root provider arrays, raw account arrays, and older Codex snake_case credential fields.

### Merge rules

- Existing accounts (`app-backup-merge.ts`) match primarily by stable `id`, then normalized email, with credential-key fallback for legacy records lacking identity.
- Matching imported accounts update existing records while preserving the local account `id` and any existing non-empty `refreshToken` when omitted in the import.
- Unmatched records are assigned/keep their IDs and append to the account list, recording `importedIdMap` per provider.
- Existing account ordering (`ANTIGRAVITY_ORDER_KEY`, `CODEX_ORDER_KEY`) is retained for known accounts, newly imported accounts are appended, and sorted account lists are persisted.
- Imported Codex account pools are normalized, member IDs are remapped through `importedIdMap`, merged by pool ID with existing pools, and reconciled against the final Codex account list (`reconcileCodexPools`) so dangling IDs are dropped.
- Settings in the backup overwrite matching preferences; absent keys are left unchanged.

## Failure behavior

- Importing never deletes current local accounts, pools, or unmentioned preferences.
- Invalid pool definitions are discarded by normalization.
- Decryption failures leave storage untouched.
- Native OS keyring migration (`app-storage.ts` + `flushSecureStorage()`) remains fail-closed; backup import routes through the secure account facade rather than bypassing it.

## Codex Model Pools Backup & V2 Parity

- Full backup (`app-backup.ts`) currently exports `codex.pools` from `loadCodexPools()` (`quotashift_codex_account_pools_v1`) and restores them via `saveCodexPools` (`quotashift_codex_account_pools_v1`). `loadCodexModelPoolsV2` (`app-storage.ts`) lazily migrates v1 pools into `quotashift_codex_model_pools_v2` via `migrateCodexPoolsV1` when V2 storage is absent.
- `codex-pools-v2` normalization and validation helpers (`migrateCodexPoolsV1`, `validateEnabledPoolNames`, `normalizeCodexModelPoolsV2` verified in `tests/shared/model-pool-backup-v2.test.mjs`) strip upstream tokens and machine-local bindings, enforce unique enabled public aliases (`^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$`), remap member account IDs, and disable conflicting aliases rather than silently breaking routing.
- Restored machines still require explicitly re-connecting local CLI installations and profiles.

## CLI Rotation Pools Backup Parity

- CLI pools (`quotashift_cli_rotation_pools_v1`) travel in `cliPools` (and provider-split `antigravity.cliPools` / `codex.cliPools`), while continuation prompt preferences (`quotashift_cli_rotation_prompt_v1`) travel in `settings`. Active provider bindings (`quotashift_cli_rotation_bindings_v1`) remain machine-local and are excluded.
- `mergeRestoredCliPools` (`src/utils/cli-pools/restore.ts`) merges by pool ID, preserves unrelated local pools, remaps member IDs per provider (`agyIdMap`, `codexIdMap`), disables pools with missing or cross-provider members, and forces `autoSwitch: false`.
- Restored `CLI_ROTATION_PREFERENCES_KEY` forces `enabled: false` and `autoRestartAfterAppStart: false` while preserving the custom continuation prompt.

**Back to →** [01 — System Overview](01-system-overview.md)

## v1.3.0 backup additions

The 53-key allowlist includes used/remaining quota percentage mode (`QUOTA_PERCENT_MODE_KEY`), max monitored account cards (`MAX_MONITORED_CARDS_KEY`), auto-monitor-on-Apply (`AUTO_MONITOR_ON_APPLY_KEY`), same-provider removal on apply (`UNMONITOR_SAME_PROVIDER_ON_APPLY_KEY`), persistent exact workers (`PERSISTENT_WORKER_KEY`), Untrack All in-app shortcut, and zoom shortcuts (`Zoom in`, `Zoom out`, `Reset zoom`). Account Credentials Backup (`quotashift_credentials_backup`, v1) provides credential-only export/import without modifying settings or pools. Tracked account IDs and Agent API runtime/write-permission keys (`quotashift_agent_api_enabled_v1`, `quotashift_agent_api_port_v1`, `quotashift_agent_api_write_v2`) remain excluded; Agent API keys stay in the OS keyring. On Windows, uninstaller guidance points users to **Settings > Data** to export an encrypted backup prior to full app-data removal.

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Full Backup & Merge Engine | `src/utils/common/backup/{app-backup,app-backup-merge,app-storage,app-constants}.ts` | Version 3 payload export/import, v1–v3 legacy extraction, identity/email merge, pool ID remapping, reload flush |
| Credentials & Settings Allowlists | `src/utils/common/backup/{credentials-backup,settings-backup}.ts` | Credential-only backup v1 and the 53-key `BACKUP_SETTING_KEYS` allowlist (`MAX_SETTING_VALUE_LENGTH = 64 KiB`) |
| Pool Migration & CLI Restore | `src/utils/codex/pools/migration.ts`, `src/utils/cli-pools/restore.ts`, `src/hooks/common/useAppBackups.ts` | Lazy V1→V2 Codex pool migration, CLI pool import safety resets (`autoSwitch: false`), passphrase flow & file reveal |

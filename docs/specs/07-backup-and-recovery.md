# 07 — Backup and Recovery

**Audience:** engineers & AI agents · **Verified against:** `1.1.5` · **Date:** 2026-10-09

QuotaShift exports a user-selected passphrase-encrypted backup for portable account recovery. This backup path is distinct from the native OS-keyring-backed runtime secure store.

## Backup payload

`buildBackupData` produces logical payload version **3** containing:

- creation timestamp and current theme (kept for older importers);
- `settings`: every user preference, as a map of storage key to string value (see below);
- Antigravity account records (preserving refresh tokens, session keys, and quotas);
- Codex account records (preserving OAuth access tokens, refresh tokens, plan types, and rate limits for seamless background keep-alive upon restore);
- Codex pool definitions.

Claude credentials/profiles are not exported because Claude authentication remains owned by local Claude configuration directories.

## Settings

`BACKUP_SETTING_KEYS` (`src/utils/common/settings-backup.ts`) lists every preference that is backed up: theme, card layout, platform visibility, main-window zoom, overlay UI, display mode, multi-track switch, all poll rates, keep-alive, persistent workers, restart-on-switch, Codex pool routing and active pool, every Claude monitoring/guardrail preference and alias, and all global and in-app shortcuts with their enable switches.

Not backed up, on purpose: accounts' tracked selection (chosen by account id), the overlay window position (tied to this machine's monitors), caches (usage, model catalog, overlay payload), local sessions and active-account ids, Claude profile directories, and legacy keys superseded by a backed-up one. `tests/shared/settings-backup-coverage.test.mjs` fails when a storage key is added to `src` without being classified as backed up or excluded, so a new setting cannot be forgotten.

Import only applies known keys with string values, so a tampered backup cannot write arbitrary storage. The active pool is applied only when that pool exists after the import. A version 2 backup restores just its theme. After an import that applied settings, the app flushes secure storage and reloads so every window reads the restored preferences.

## Encryption envelope

The serialized payload is encrypted with Web Crypto:

- PBKDF2-HMAC-SHA-256 with 100,000 iterations;
- random 16-byte salt;
- AES-256-GCM;
- random 12-byte IV;
- base64 fields `salt`, `iv`, and `data`.

A wrong passphrase or modified ciphertext causes authenticated decryption to fail. The import UI reports a wrong passphrase inline under the input.

## Restore compatibility

The importer accepts current structured backups plus legacy layouts used by earlier versions, including provider arrays, `platforms` wrappers, raw account arrays, and older Codex field names.

### Merge rules

- Existing accounts are matched primarily by stable ID or normalized email, with credential-key fallback for legacy records lacking identity.
- A matching imported account updates the existing record while preserving the current local ID and non-empty `refreshToken` values.
- New records are assigned/import their IDs and are appended.
- Imported account IDs are remapped before restoring pool membership.
- Imported pools are normalized, merged by pool ID, then reconciled against the final Codex account set so dangling member IDs are removed.
- Existing account ordering is retained where possible; newly imported accounts are appended and the resulting order is persisted.
- Settings in the backup overwrite the current values; settings absent from the backup are left as they are.

## Failure behavior

- Import does not require replacing accounts absent from the backup; unmentioned current accounts are kept.
- Invalid pool definitions are ignored by normalization.
- Decryption failure does not mutate current application state.
- Native runtime secure storage migration is separate and fail-closed; backup import does not bypass the secure account facade.

**Back to →** [01 — System Overview](01-system-overview.md)

# 07 — Backup and Recovery

**Audience:** engineers & AI agents · **Verified against:** `1.1.2` · **Date:** 2026-09-24

QuotaShift exports a user-selected passphrase-encrypted backup for portable account recovery. This backup path is distinct from the native OS-keyring-backed runtime secure store.

## Backup payload

`buildBackupData` produces logical payload version **2** containing:

- creation timestamp and current theme;
- Antigravity account records;
- Codex account records;
- Codex pool definitions.

Claude credentials/profiles are not exported because Claude authentication remains owned by local Claude configuration directories.

Pool definitions are included, but active pool selection and the current Pool Routing enabled flag are runtime preferences and are not part of the backup payload.

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
- A matching imported account updates the existing record while preserving the current local ID.
- New records are assigned/import their IDs and are appended.
- Imported account IDs are remapped before restoring pool membership.
- Imported pools are normalized, merged by pool ID, then reconciled against the final Codex account set so dangling member IDs are removed.
- Existing account ordering is retained where possible; newly imported accounts are appended and the resulting order is persisted.

## Failure behavior

- Import does not require replacing accounts absent from the backup; unmentioned current accounts are kept.
- Invalid pool definitions are ignored by normalization.
- Decryption failure does not mutate current application state.
- Native runtime secure storage migration is separate and fail-closed; backup import does not bypass the secure account facade.

**Back to →** [01 — System Overview](01-system-overview.md)

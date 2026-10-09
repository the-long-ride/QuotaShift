import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BACKUP_SETTING_KEYS } from "../../.test-build/common/settings-backup.js";

/** Storage keys that are intentionally not preferences, with the reason they stay out of backups. */
const EXCLUDED = {
  // Credentials and accounts travel in the account sections of the backup (or never leave the keyring).
  "antigravity-accounts-list": "accounts section",
  "antigravity-codex-accounts": "accounts section",
  "antigravity-account-order": "restored with the accounts",
  "antigravity-codex-account-order": "restored with the accounts",
  quotashift_pools: "legacy pool list",
  quotashift_codex_account_pools_v1: "pools section",
  "antigravity-active-id": "which account is signed in on this machine",
  "antigravity-codex-active-id": "which account is signed in on this machine",
  quotashift_local_antigravity_session_v1: "local session of this machine",
  // Tracked accounts are chosen by account id, and imported accounts can be re-identified.
  quotashift_overlay_tracked_v2: "tracked account ids",
  quotashift_overlay_tracked_ids_v1: "legacy tracked account ids",
  quotashift_overlay_tracked_provider: "tracked account identity",
  quotashift_overlay_tracked_account_id: "tracked account identity",
  quotashift_multi_track_v1: "legacy multi-track flag",
  // Position of a window on this machine's monitors.
  quotashift_overlay_pos: "monitor-specific window position",
  // Caches rebuilt by the next refresh.
  quotashift_overlay_data: "overlay payload cache",
  quotashift_claude_usage_cache_v1: "usage cache",
  quotashift_codex_usage_cache_v1: "usage cache",
  quotashift_codex_model_catalog_v1: "model catalog cache",
  quotashift_auth_poll_suspensions_v1: "transient poll suspensions",
  // Claude profiles are local directories of this machine.
  quotashift_claude_manual_profile_paths_v1: "per-machine directories",
  "quotashift-claude-account-order": "Claude accounts are discovered locally",
  "quotashift-claude-last-used-v1": "Claude accounts are discovered locally",
  // Superseded by a key that is backed up.
  quotashift_poll_interval_secs: "legacy poll interval",
  // Not localStorage keys.
  _passphraseHash: "store.json migration marker",
  _encrypted: "store.json migration marker",
  quotashift_shortcuts_changed: "window event name",
  "quotashift-request-quit": "window event name",
};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function storageKeysInSource() {
  const keys = new Set();
  for (const file of sourceFiles("src")) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/_KEY\s*=\s*"([^"]+)"/g)) keys.add(match[1]);
    for (const match of text.matchAll(/"(quotashift[_-][A-Za-z0-9_-]+)"/g)) keys.add(match[1]);
  }
  return keys;
}

test("every storage key is either backed up as a setting or deliberately excluded", () => {
  const included = new Set(BACKUP_SETTING_KEYS);
  const unclassified = [...storageKeysInSource()].filter(
    (key) => !included.has(key) && !(key in EXCLUDED),
  );
  assert.deepEqual(
    unclassified,
    [],
    "Add these keys to BACKUP_SETTING_KEYS (src/utils/common/settings-backup.ts) or to EXCLUDED here",
  );
});

test("no key is both backed up and excluded, and no entry is stale", () => {
  const found = storageKeysInSource();
  for (const key of BACKUP_SETTING_KEYS) {
    assert.equal(key in EXCLUDED, false, `${key} is both included and excluded`);
    assert.ok(found.has(key), `${key} is no longer a storage key in src`);
  }
  for (const key of Object.keys(EXCLUDED)) {
    assert.ok(found.has(key), `EXCLUDED lists ${key}, which is no longer used in src`);
  }
  assert.equal(new Set(BACKUP_SETTING_KEYS).size, BACKUP_SETTING_KEYS.length, "duplicate keys");
});

test("credentials are never backed up as plain settings", () => {
  for (const key of BACKUP_SETTING_KEYS) {
    assert.doesNotMatch(key, /token|secret|session|password|api[-_]?key|credential/i, key);
  }
});

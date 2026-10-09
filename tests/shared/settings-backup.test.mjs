import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_SETTING_KEYS,
  applyBackupSettings,
  collectSettings,
  extractBackupSettings,
} from "../../.test-build/common/settings-backup.js";
import { buildBackupData, restoreBackupData } from "../../.test-build/common/app-backup.js";

const memory = (init = {}) => {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  };
};

const ACTIVE_POOL_KEY = "quotashift_codex_active_pool_id_v1";

test("collectSettings reads every stored preference and skips unset keys", () => {
  const storage = memory({
    "antigravity-theme": "light",
    quotashift_display_mode_v1: "taskbar",
    quotashift_claude_five_hour_stop_threshold_pct: "90",
    quotashift_in_app_shortcut_add_account: "CommandOrControl+Shift+N",
    "antigravity-accounts-list": "[secret]",
    quotashift_overlay_pos: '{"x":1,"y":2}',
  });
  assert.deepEqual(collectSettings(storage), {
    "antigravity-theme": "light",
    quotashift_display_mode_v1: "taskbar",
    quotashift_claude_five_hour_stop_threshold_pct: "90",
    quotashift_in_app_shortcut_add_account: "CommandOrControl+Shift+N",
  });
  assert.deepEqual(collectSettings(null), {});
  assert.deepEqual(
    collectSettings({
      getItem: () => {
        throw new Error("denied");
      },
    }),
    {},
  );
});

test("extractBackupSettings keeps only known keys with string values", () => {
  const extracted = extractBackupSettings({
    version: 3,
    settings: {
      "antigravity-theme": "dark",
      quotashift_card_layout_mode: "compact",
      "antigravity-accounts-list": "[stolen]",
      quotashift_overlay_pos: "{}",
      quotashift_ui_adjustment_v1: { not: "a string" },
      quotashift_idle_poll_interval_secs: "x".repeat(70_000),
    },
  });
  assert.deepEqual(extracted, {
    "antigravity-theme": "dark",
    quotashift_card_layout_mode: "compact",
  });
  assert.deepEqual(extractBackupSettings(null), {});
  assert.deepEqual(extractBackupSettings([]), {});
  assert.deepEqual(extractBackupSettings({ settings: ["antigravity-theme"] }), {});
});

test("a v2 backup restores its theme", () => {
  assert.deepEqual(extractBackupSettings({ version: 2, theme: "light" }), {
    "antigravity-theme": "light",
  });
  assert.deepEqual(extractBackupSettings({ version: 2, theme: "neon" }), {});
  assert.deepEqual(
    extractBackupSettings({ theme: "light", settings: { "antigravity-theme": "dark" } }),
    { "antigravity-theme": "dark" },
  );
});

test("applyBackupSettings writes settings and survives a refusing storage", () => {
  const storage = memory();
  const applied = applyBackupSettings(
    { "antigravity-theme": "light", quotashift_card_layout_mode: "compact" },
    storage,
  );
  assert.equal(applied, 2);
  assert.equal(storage.getItem("antigravity-theme"), "light");

  const refusing = {
    setItem: (key) => {
      if (key === "antigravity-theme") throw new Error("quota");
    },
  };
  assert.equal(
    applyBackupSettings(
      { "antigravity-theme": "dark", quotashift_card_layout_mode: "compact" },
      refusing,
    ),
    1,
  );
  assert.equal(applyBackupSettings({ a: "b" }, null), 0);
});

test("the active pool is restored only when that pool exists after the import", () => {
  const settings = { [ACTIVE_POOL_KEY]: "pool-1", quotashift_codex_pool_routing_v1: "true" };
  const kept = memory();
  applyBackupSettings(settings, kept, { knownPoolIds: ["pool-1"] });
  assert.equal(kept.getItem(ACTIVE_POOL_KEY), "pool-1");

  const dropped = memory();
  applyBackupSettings(settings, dropped, { knownPoolIds: ["pool-2"] });
  assert.equal(dropped.getItem(ACTIVE_POOL_KEY), null);
  assert.equal(dropped.getItem("quotashift_codex_pool_routing_v1"), "true");
});

test("a backup round-trips every setting through build and restore", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
  for (const key of BACKUP_SETTING_KEYS) store.set(key, `value:${key}`);
  store.set(ACTIVE_POOL_KEY, "pool-a");
  store.set("antigravity-accounts-list", "[]");
  store.set("quotashift_overlay_pos", "{}");

  const bundle = buildBackupData([], [], "dark");
  assert.equal(bundle.version, 3);
  assert.equal(Object.keys(bundle.settings).length, BACKUP_SETTING_KEYS.length);
  assert.equal("antigravity-accounts-list" in bundle.settings, false);
  assert.equal("quotashift_overlay_pos" in bundle.settings, false);

  store.clear();
  bundle.codex.pools = [{ id: "pool-a", name: "A", model: "gpt-5", accountIds: [] }];
  const result = restoreBackupData(JSON.parse(JSON.stringify(bundle)), [], [], []);
  assert.equal(result.importedSettingsCount, BACKUP_SETTING_KEYS.length);
  for (const key of BACKUP_SETTING_KEYS) {
    if (key === ACTIVE_POOL_KEY) assert.equal(store.get(key), "pool-a");
    else assert.equal(store.get(key), `value:${key}`, key);
  }
});

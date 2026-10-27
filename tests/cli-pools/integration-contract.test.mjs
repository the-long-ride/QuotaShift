import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Integration: storage keys and constants are defined and exported", () => {
  const constants = fs.readFileSync("src/utils/common/app-constants.ts", "utf8");
  const storage = fs.readFileSync("src/utils/common/app-storage.ts", "utf8");

  assert.ok(
    constants.includes("CLI_ROTATION_POOLS_KEY"),
    "app-constants must export CLI_ROTATION_POOLS_KEY",
  );
  assert.ok(
    constants.includes("CLI_ROTATION_BINDINGS_KEY"),
    "app-constants must export CLI_ROTATION_BINDINGS_KEY",
  );
  assert.ok(
    storage.includes("loadCliRotationPools"),
    "app-storage must export loadCliRotationPools",
  );
  assert.ok(
    storage.includes("saveCliRotationPools"),
    "app-storage must export saveCliRotationPools",
  );
});

test("Integration: settings backup allowlist includes CLI rotation preferences", () => {
  const settingsBackup = fs.readFileSync("src/utils/common/settings-backup.ts", "utf8");
  assert.ok(
    settingsBackup.includes("CLI_ROTATION_PREFERENCES_KEY"),
    "BACKUP_SETTING_KEYS must include CLI_ROTATION_PREFERENCES_KEY",
  );
});

test("Integration: Antigravity and Codex tabs mount CLI pool modals and buttons", () => {
  const agyTab = fs.readFileSync("src/components/antigravity/AntigravityTab.tsx", "utf8");
  const codexTab = fs.readFileSync("src/components/codex/CodexTab.tsx", "utf8");
  const codexBar = fs.readFileSync("src/components/codex/CodexAccountBar.tsx", "utf8");

  assert.ok(agyTab.includes("<CliPoolModal"), "AntigravityTab must mount CliPoolModal");
  assert.ok(agyTab.includes("CLI Pools"), "AntigravityTab must render CLI Pools button");

  assert.ok(codexTab.includes("<CliPoolModal"), "CodexTab must mount CliPoolModal");
  assert.ok(codexBar.includes("CLI Pools"), "CodexAccountBar must render CLI Pools button");
});

test("Integration: Behavior settings mounts CliRotationSettings", () => {
  const behavior = fs.readFileSync("src/components/common/BehaviorSettingsSection.tsx", "utf8");
  assert.ok(
    behavior.includes("<CliRotationSettings"),
    "BehaviorSettingsSection must mount CliRotationSettings",
  );
});

test("Integration: CLI pool modal and editor components exist with styling", () => {
  assert.ok(fs.existsSync("src/components/common/CliPoolModal.tsx"));
  assert.ok(fs.existsSync("src/components/common/CliPoolEditor.tsx"));
  assert.ok(fs.existsSync("src/components/common/CliRotationSettings.tsx"));
  assert.ok(fs.existsSync("src/styles/common/cli-pools.css"));
});

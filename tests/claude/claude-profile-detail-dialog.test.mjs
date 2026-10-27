import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("ClaudeProfileDetailDialog exposes Profile executable section in .quotashift/bin", () => {
  const dialog = fs.readFileSync(
    "src/components/claude/profiles/ClaudeProfileDetailDialog.tsx",
    "utf8",
  );

  assert.match(dialog, /Profile executable/);
  assert.match(dialog, /claude-detail-section/);
  assert.match(dialog, /resolvedLauncherPath/);
  assert.match(dialog, /\.quotashift.*bin/);
  assert.match(dialog, /copyVal\(resolvedLauncherPath,\s*"launcher"\)/);
});

test("ClaudeProfileDTO interface includes launcherPath", () => {
  const hook = fs.readFileSync(
    "src/hooks/claude/gateway/useClaudeCodePoolConnector.ts",
    "utf8",
  );

  assert.match(hook, /launcherPath\?:\s*string\s*\|\s*null/);
});

test("Rust inventory profiles resolve launcherPath from managed_launcher_bin", () => {
  const profiles = fs.readFileSync("src-tauri/src/claude/inventory/profiles.rs", "utf8");
  const launcher = fs.readFileSync("src-tauri/src/claude/inventory/launcher.rs", "utf8");

  assert.match(profiles, /pub launcher_path:\s*Option<PathBuf>/);
  assert.match(profiles, /resolve_profile_launcher/);
  assert.match(launcher, /pub fn resolve_profile_launcher/);
});

test("ClaudeProfileDetailDialog exposes Restore to default button for settings.json", () => {
  const dialog = fs.readFileSync(
    "src/components/claude/profiles/ClaudeProfileDetailDialog.tsx",
    "utf8",
  );
  assert.match(dialog, /restore_claude_profile_settings/);
  assert.match(dialog, /Restore to default/);
  assert.match(dialog, /handleRestoreDefaultSettings/);
});

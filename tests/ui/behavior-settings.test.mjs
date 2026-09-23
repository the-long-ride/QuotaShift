import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  KEEP_ALIVE_DEFAULT_ENABLED,
  KEEP_ALIVE_KEY,
  loadKeepAlivePreference,
} from "../../.test-build/common/app-constants.js";

const settings = fs.readFileSync("src/components/common/SettingsModal.tsx", "utf8");
const behaviorSection = fs.readFileSync(
  "src/components/common/BehaviorSettingsSection.tsx",
  "utf8",
);
const appearanceSection = fs.readFileSync(
  "src/components/common/AppearanceSettingsSection.tsx",
  "utf8",
);
const switchRow = fs.readFileSync("src/components/common/SettingsSwitchRow.tsx", "utf8");
const css = fs.readFileSync("src/styles/settings/settings-modal.css", "utf8");
const keepAliveBridge = fs.readFileSync("src/utils/antigravity/antigravity-keep-alive.ts", "utf8");
const appTheme = fs.readFileSync("src/hooks/app/useAppThemeAndOverlay.ts", "utf8");
const bootstrap = fs.readFileSync("src/hooks/app/useAppSessionBootstrap.ts", "utf8");

test("Monitoring includes background controls and leaves Card View to Appearance", () => {
  assert.match(
    behaviorSection,
    /Keeps saved Antigravity accounts and the local Codex sign-in active in the background\./,
  );
  assert.match(
    behaviorSection,
    /Keeps isolated Antigravity monitoring workers running for exact quota updates\./,
  );
  assert.doesNotMatch(behaviorSection, /CardViewSetting/);
  assert.match(appearanceSection, /CardViewSetting/);
  assert.match(switchRow, /description\?: React\.ReactNode/);
  assert.match(switchRow, /settings-toggle-description/);
  assert.match(css, /\.settings-toggle-copy\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.settings-toggle-description\s*\{/);
  assert.match(settings, /<BehaviorSettingsSection/);
  assert.match(settings, /\["poll", "Monitoring"\]/);
  assert.match(settings, /Monitored account poll rate/);
  assert.doesNotMatch(settings, /\["behavior", "Behavior"\]/);
});

test("Keep-Alive defaults on only when no explicit preference exists", () => {
  assert.equal(KEEP_ALIVE_KEY, "keepAliveActive");
  assert.equal(KEEP_ALIVE_DEFAULT_ENABLED, true);
  assert.equal(loadKeepAlivePreference({ getItem: () => null }), true);
  assert.equal(loadKeepAlivePreference({ getItem: () => "true" }), true);
  assert.equal(loadKeepAlivePreference({ getItem: () => "false" }), false);
});

test("UI state and Antigravity background bridge share the default-on Keep-Alive preference loader", () => {
  assert.match(appTheme, /useState\(\(\) => loadKeepAlivePreference\(\)\)/);
  assert.match(keepAliveBridge, /const enabled = loadKeepAlivePreference\(\)/);
  assert.match(keepAliveBridge, /if \(enabled\)[\s\S]*invoke\("start_keep_alive"/);
  assert.doesNotMatch(bootstrap, /get_keep_alive_status|handleToggleKeepAlive/);
});

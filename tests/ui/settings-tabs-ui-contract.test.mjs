import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(
  new URL("../../src/components/common/SettingsModal.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../../src/styles/settings/settings-modal.css", import.meta.url),
  "utf8",
);
const header = await readFile(
  new URL("../../src/components/common/Header.tsx", import.meta.url),
  "utf8",
);
const overlaySizing = await readFile(
  new URL("../../src/components/overlay/OverlayWindowSizingBridge.tsx", import.meta.url),
  "utf8",
);
const overlayGroup = await readFile(
  new URL("../../src/components/common/OverlayAdjustmentGroup.tsx", import.meta.url),
  "utf8",
);
const quotaDisplayRow = await readFile(
  new URL("../../src/components/common/QuotaDisplayRow.tsx", import.meta.url),
  "utf8",
);
const settingsSwitchRow = await readFile(
  new URL("../../src/components/common/SettingsSwitchRow.tsx", import.meta.url),
  "utf8",
);
const cardViewSetting = await readFile(
  new URL("../../src/components/common/CardViewSetting.tsx", import.meta.url),
  "utf8",
);
const behaviorSection = await readFile(
  new URL("../../src/components/common/BehaviorSettingsSection.tsx", import.meta.url),
  "utf8",
);
const appearanceSection = await readFile(
  new URL("../../src/components/common/AppearanceSettingsSection.tsx", import.meta.url),
  "utf8",
);
const main = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8");
const windowManager = await readFile(
  new URL("../../src-tauri/src/window/window_manager.rs", import.meta.url),
  "utf8",
);

test("settings modal exposes vertical sidebar tabs including Help", () => {
  for (const label of [
    "Monitoring",
    "Appearance",
    "Keyboard Shortcuts",
    "Data",
    "Logs",
    "Help",
  ]) {
    assert.match(settings, new RegExp(label));
  }
  assert.doesNotMatch(settings, /"ui",\s*"Overlay & Taskbar"/);
  assert.match(settings, /className="settings-modal-body"/);
  assert.match(settings, /className="settings-tabs"/);
  assert.match(
    settings,
    /className="dialog-box settings-modal-box" style=\{\{ width: "624px" \}\}/,
  );
  assert.match(css, /\.settings-modal-body\s*\{[\s\S]*?display:\s*flex/);
  assert.match(css, /\.settings-tabs\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.doesNotMatch(css, /\.settings-tabs\s*\{[\s\S]*?overflow-x:\s*auto/);
});

test("Appearance tab owns theme, UI scale and Reset monitor display controls continuous below On Monitored Display", () => {
  assert.match(appearanceSection, /<QuotaDisplayRow/);
  assert.match(appearanceSection, /<OverlayAdjustmentGroup/);
  assert.match(appearanceSection, /Reset monitor display/);
  assert.ok(
    appearanceSection.indexOf("<QuotaDisplayRow") <
      appearanceSection.indexOf("<OverlayAdjustmentGroup"),
    "Overlay adjustment group must follow On Monitored Display",
  );
  assert.ok(
    appearanceSection.indexOf("<OverlayAdjustmentGroup") <
      appearanceSection.indexOf("Reset monitor display"),
    "Reset monitor display must follow adjustment group",
  );
  assert.ok(
    appearanceSection.indexOf("Reset monitor display") <
      appearanceSection.indexOf('className="settings-platform-flow"'),
    "Platform subsection must follow Reset monitor display",
  );
  assert.match(appearanceSection, /Overlay & taskbar tooltip UI scale/);
  assert.doesNotMatch(
    settings,
    /Overlay Width|Overlay Height|Panel UI Scale|Reset Panel|panelScale/,
  );
  assert.doesNotMatch(settings, /Panel Height|panelHeightMax/);
  assert.match(appearanceSection, /onUiAdjustmentChange/);
});

test("Data tab gives each action its own full-width row without a divider", () => {
  assert.match(settings, /Rescan all Codex models/);
  assert.match(settings, /Export Backup/);
  assert.match(settings, /Import Backup/);
  assert.doesNotMatch(settings, /className="settings-divider"/);
  assert.doesNotMatch(settings, /settings-backup-row|settings-action-row--right/);
});

test("main dashboard no longer uses CSS panel scaling while overlay uses one uniform scale", () => {
  assert.match(header, /loadUiAdjustmentPreferences/);
  assert.match(header, /UI_ADJUSTMENT_EVENT/);
  assert.doesNotMatch(header, /panelScale|--panel-ui-scale/);
  assert.match(overlaySizing, /getOverlayWindowWidth/);
  assert.match(overlaySizing, /getOverlayWindowHeight/);
  assert.match(overlaySizing, /--overlay-ui-scale/);
  assert.doesNotMatch(overlaySizing, /overlayWidth|overlayHeight|overlay-ui-scale-inverse/);
  assert.match(main, /<OverlayWindowSizingBridge \/>/);
});

test("main window lifecycle no longer depends on tray panel positioning", () => {
  assert.doesNotMatch(windowManager, /position_window/);
  assert.match(windowManager, /open_main_window/);
});

test("Monitoring owns former Behavior controls and no display controls", () => {
  const monitoringBlock =
    settings.match(/\{activeTab === "poll"[\s\S]*?\{activeTab === "appearance"/)?.[0] ?? "";

  assert.match(monitoringBlock, /<BehaviorSettingsSection/);
  assert.doesNotMatch(monitoringBlock, /Quota display|QuotaDisplayRow/);
  assert.doesNotMatch(settings, /\["behavior",\s*"Behavior"\]/);
});

test("Reset monitor display follows theme and scale in Appearance tab", async () => {
  const uiCss = await readFile(
    new URL("../../src/styles/desktop/ui-adjustment.css", import.meta.url),
    "utf8",
  );

  assert.ok(
    appearanceSection.indexOf("<OverlayAdjustmentGroup") <
      appearanceSection.indexOf("Reset monitor display"),
  );
  assert.match(appearanceSection, /className="settings-overlay-reset-row"/);
  assert.match(uiCss, /\.settings-overlay-reset-row\s*\{[\s\S]*justify-content:\s*flex-end;/);
  assert.doesNotMatch(overlayGroup, /settings-adjustment-group-header|Reset monitor display/);
  assert.ok(overlayGroup.indexOf("Overlay & taskbar theme") < overlayGroup.indexOf("<AdjustmentRow"));
});

test("Monitoring includes background controls while Appearance owns Card View and Platform", () => {
  assert.match(settingsSwitchRow, /description\?: React\.ReactNode/);
  assert.match(
    behaviorSection,
    /Keeps saved Antigravity accounts and the local Codex sign-in active in the background\./,
  );
  assert.match(
    behaviorSection,
    /Keeps isolated Antigravity monitoring workers running for exact quota updates\./,
  );
  assert.doesNotMatch(behaviorSection, /CardViewSetting/);
  assert.match(
    cardViewSetting,
    /Choose compact one-line cards or expanded cards with full quota details\./,
  );
  assert.match(appearanceSection, /<CardViewSetting mode=\{cardLayoutMode\}/);
  assert.match(appearanceSection, /Platform/);
  assert.match(appearanceSection, /Antigravity/);
  assert.match(appearanceSection, /ChatGPT Codex/);
  assert.match(appearanceSection, /label: "Claude Code"/);
  assert.match(appearanceSection, /Other idle accounts poll rate/);
  assert.match(settings, /activeTab === "poll"/);
  assert.match(settings, /Monitored account\(s\) poll rate/);
  assert.match(settings, /<BehaviorSettingsSection/);
  assert.match(settings, /activeTab === "appearance"/);
  assert.match(css, /\.settings-platform-flow\s*\{[\s\S]*flex-wrap:\s*wrap/);
});

test("Appearance tab also exposes the shared Quota display selector as On Monitored Display", () => {
  assert.match(quotaDisplayRow, /export const QuotaDisplayRow/);
  assert.match(quotaDisplayRow, /On Monitored Display/);
  assert.match(appearanceSection, /<QuotaDisplayRow displayMode=\{displayMode\}/);
  const appearanceBlock =
    settings.match(/\{activeTab === "appearance"[\s\S]*?\{activeTab === "shortcuts"/)?.[0] ?? "";
  assert.match(appearanceBlock, /displayMode=\{displayMode\}/);
  assert.match(appearanceBlock, /onDisplayModeChange=\{onDisplayModeChange\}/);
});

test("settings rows use bottom dividers except the last row without legacy top dividers", async () => {
  const uiCss = await readFile(
    new URL("../../src/styles/desktop/ui-adjustment.css", import.meta.url),
    "utf8",
  );

  assert.match(
    css,
    /\.settings-section > :not\(\.settings-section-title\):not\(:last-child\)\s*\{[\s\S]*border-bottom:\s*1px solid color-mix/,
  );
  assert.doesNotMatch(css, /\.settings-field \+ \.settings-field\s*\{[^}]*border-top:/s);
  assert.doesNotMatch(
    css,
    /\.settings-shortcut-row \+ \.settings-shortcut-row\s*\{[^}]*border-top:/s,
  );
  assert.doesNotMatch(css, /\.settings-subsection\s*\{[^}]*border-top:/s);
  assert.doesNotMatch(
    uiCss,
    /\.settings-adjustment-row \+ \.settings-adjustment-row\s*\{[^}]*border-top:/s,
  );
  assert.doesNotMatch(uiCss, /\.settings-overlay-theme-row\s*\{[^}]*border-bottom:/s);
});

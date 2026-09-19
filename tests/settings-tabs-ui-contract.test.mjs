import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(
  new URL("../src/components/common/SettingsModal.tsx", import.meta.url),
  "utf8",
);
const css = await readFile(new URL("../src/styles/settings-modal.css", import.meta.url), "utf8");
const header = await readFile(
  new URL("../src/components/common/Header.tsx", import.meta.url),
  "utf8",
);
const overlaySizing = await readFile(
  new URL("../src/components/overlay/OverlayWindowSizingBridge.tsx", import.meta.url),
  "utf8",
);
const overlayGroup = await readFile(
  new URL("../src/components/common/OverlayAdjustmentGroup.tsx", import.meta.url),
  "utf8",
);
const overlayPrimaryRow = await readFile(
  new URL("../src/components/common/OverlayPrimaryRow.tsx", import.meta.url),
  "utf8",
);
const settingsSwitchRow = await readFile(
  new URL("../src/components/common/SettingsSwitchRow.tsx", import.meta.url),
  "utf8",
);
const cardViewSetting = await readFile(
  new URL("../src/components/common/CardViewSetting.tsx", import.meta.url),
  "utf8",
);
const behaviorSection = await readFile(
  new URL("../src/components/common/BehaviorSettingsSection.tsx", import.meta.url),
  "utf8",
);
const appearanceSection = await readFile(
  new URL("../src/components/common/AppearanceSettingsSection.tsx", import.meta.url),
  "utf8",
);
const main = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const windowManager = await readFile(
  new URL("../src-tauri/src/window/window_manager.rs", import.meta.url),
  "utf8",
);

test("settings modal exposes vertical sidebar tabs including Help", () => {
  for (const label of ["Monitoring", "Appearance", "Keyboard Shortcuts", "Data", "Overlay", "Logs", "Help"]) {
    assert.match(settings, new RegExp(label));
  }
  assert.match(settings, /className="settings-modal-body"/);
  assert.match(settings, /className="settings-tabs"/);
  assert.match(
    settings,
    /className="dialog-box settings-modal-box" style=\{\{ width: "552px" \}\}/,
  );
  assert.match(css, /\.settings-modal-body\s*\{[\s\S]*?display:\s*flex/);
  assert.match(css, /\.settings-tabs\s*\{[\s\S]*?flex-direction:\s*column/);
  assert.doesNotMatch(css, /\.settings-tabs\s*\{[\s\S]*?overflow-x:\s*auto/);
});

test("Overlay tab owns Desktop Overlay, theme, and UI scale controls", () => {
  assert.match(overlayPrimaryRow, /Desktop Overlay/);
  assert.match(overlayPrimaryRow, /Reset Overlay/);
  assert.match(settings, /Overlay UI Scale/);
  assert.doesNotMatch(
    settings,
    /Overlay Width|Overlay Height|Panel UI Scale|Reset Panel|panelScale/,
  );
  assert.doesNotMatch(settings, /Panel Height|panelHeightMax/);
  assert.match(settings, /onUiAdjustmentChange/);
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
  assert.doesNotMatch(
    overlaySizing,
    /getBoundingClientRect|ResizeObserver|overlayWidth|overlayHeight|overlay-ui-scale-inverse/,
  );
  assert.match(main, /<OverlayWindowSizingBridge \/>/);
});

test("main window lifecycle no longer depends on tray panel positioning", () => {
  assert.doesNotMatch(windowManager, /position_window/);
  assert.match(windowManager, /open_main_window/);
});

test("Monitoring owns former Behavior controls while Overlay owns Desktop Overlay", () => {
  const monitoringBlock =
    settings.match(/\{activeTab === "poll"[\s\S]*?\{activeTab === "appearance"/)?.[0] ?? "";
  const overlayBlock =
    settings.match(/\{activeTab === "ui"[\s\S]*?<OverlayAdjustmentGroup[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(monitoringBlock, /<BehaviorSettingsSection/);
  assert.doesNotMatch(monitoringBlock, /Desktop Overlay|OverlayPrimaryRow/);
  assert.doesNotMatch(settings, /\["behavior",\s*"Behavior"\]/);
  assert.match(overlayBlock, /<OverlayPrimaryRow/);
  assert.match(overlayPrimaryRow, /Desktop Overlay/);
});

test("Overlay root settings put Reset Overlay beside Desktop Overlay before theme and scale", () => {
  const overlayBlock =
    settings.match(/\{activeTab === "ui"[\s\S]*?\{activeTab ===/i)?.[0] ??
    settings.slice(settings.indexOf('{activeTab === "ui"'));

  assert.match(overlayBlock, /<OverlayPrimaryRow/);
  assert.match(overlayPrimaryRow, /className="settings-overlay-primary-row"/);
  assert.match(overlayPrimaryRow, /settings-overlay-desktop-toggle/);
  assert.match(overlayPrimaryRow, /className="settings-overlay-primary-divider"/);
  assert.match(overlayPrimaryRow, /settings-reset-btn--overlay-inline/);
  assert.ok(
    overlayPrimaryRow.indexOf("Desktop Overlay") < overlayPrimaryRow.indexOf("Reset Overlay"),
  );
  assert.ok(
    overlayBlock.indexOf("<OverlayPrimaryRow") < overlayBlock.indexOf("<OverlayAdjustmentGroup"),
  );
  assert.doesNotMatch(overlayGroup, /settings-adjustment-group-header|Reset Overlay/);
  assert.ok(overlayGroup.indexOf("Overlay Theme") < overlayGroup.indexOf("<AdjustmentRow"));
});

test("Desktop Overlay takes remaining width while inline Reset Overlay stays fit-content", async () => {
  const uiCss = await readFile(new URL("../src/styles/ui-adjustment.css", import.meta.url), "utf8");

  assert.match(
    uiCss,
    /\.settings-overlay-desktop-toggle\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*width:\s*auto;/,
  );
  assert.match(uiCss, /\.settings-overlay-primary-divider\s*\{[\s\S]*width:\s*1px;/);
  assert.match(uiCss, /\.settings-reset-btn--overlay-inline\s*\{[\s\S]*width:\s*fit-content;/);
});

test("Monitoring includes background controls while Appearance owns Card View and Platform", () => {
  assert.match(settingsSwitchRow, /description\?: React\.ReactNode/);
  assert.match(
    behaviorSection,
    /Refreshes saved Antigravity credentials in the background to keep sessions active\./,
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
  assert.match(settings, /Monitored account poll rate/);
  assert.match(settings, /<BehaviorSettingsSection/);
  assert.match(settings, /activeTab === "appearance"/);
  assert.match(css, /\.settings-platform-flow\s*\{[\s\S]*flex-wrap:\s*wrap/);
});

test("settings rows use bottom dividers except the last row without legacy top dividers", async () => {
  const uiCss = await readFile(new URL("../src/styles/ui-adjustment.css", import.meta.url), "utf8");

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
  assert.doesNotMatch(uiCss, /\.settings-overlay-primary-row\s*\{[^}]*border-bottom:/s);
});

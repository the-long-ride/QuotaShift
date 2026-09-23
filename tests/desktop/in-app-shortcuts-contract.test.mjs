import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("in-app shortcuts define requested defaults and runtime actions", () => {
  const shortcuts = read("src/utils/common/shortcuts.ts");
  const app = read("src/App.tsx");
  const appHook = read("src/hooks/app/useAppInAppShortcuts.ts");
  const hook = read("src/hooks/desktop/useInAppShortcuts.ts");
  for (const binding of [
    "CommandOrControl+N",
    "CommandOrControl+L",
    "CommandOrControl+E",
    "CommandOrControl+F",
    "CommandOrControl+R",
    "CommandOrControl+,",
    "CommandOrControl+Shift+Q",
  ]) assert.ok(shortcuts.includes(binding), "missing " + binding);
  assert.match(app, /useAppInAppShortcuts\(coord, cardLayoutMode, handleCardLayoutModeChange\)/);
  assert.match(appHook, /coord\.activeTab === "antigravity"[\s\S]*coord\.setAddAgOpen\(true\)/);
  assert.match(appHook, /coord\.activeTab === "codex"[\s\S]*coord\.setIsCodexModalOpen\(true\)/);
  assert.match(appHook, /setClaudeAddRequestId/);
  assert.match(appHook, /toggleTheme: coord\.themeAndOverlay\.handleToggleTheme/);
  assert.match(appHook, /onCardLayoutModeChange\(cardLayoutMode === "compact" \? "expanded" : "compact"\)/);
  assert.match(appHook, /querySelector<HTMLInputElement>\("\.header-search-input"\)\?\.focus\(\)/);
  assert.match(appHook, /openSettings: \(\) => setSettingsOpen\(true\)/);
  assert.match(appHook, /quotashift-request-quit/);
  assert.match(hook, /matchesShortcutEvent/);
  assert.match(hook, /event\.preventDefault\(\)/);
});

test("shortcut settings split global and in-app bindings and support rebinding", () => {
  const settings = read("src/components/common/ShortcutSettings.tsx");
  assert.match(settings, /Global shortcuts/);
  assert.match(settings, /In app shortcuts/);
  assert.match(settings, /IN_APP_SHORTCUT_DEFAULTS/);
  assert.match(settings, /buildShortcutFromKeyEvent/);
  assert.match(settings, /saveShortcutPreferences/);
  assert.match(settings, /dataset\.shortcutRecording = "true"/);
});

test("shortcut-aware controls expose current bindings while search uses its placeholder", () => {
  const header = read("src/components/common/Header.tsx");
  const antigravity = read("src/components/antigravity/AntigravityTab.tsx");
  const codex = read("src/components/codex/CodexAccountBar.tsx");
  const claude = read("src/components/claude/ClaudeTab.tsx");
  const settings = read("src/components/common/SettingsModal.tsx");
  const cardView = read("src/components/common/CardViewSetting.tsx");
  const quit = read("src/components/common/QuitButton.tsx");
  assert.match(header, /formatShortcutDisplay\(shortcuts\.focusSearch\)/);
  assert.match(header, /data-shortcut=\{shortcuts\.refreshAll\}/);
  assert.match(header, /data-shortcut=\{shortcuts\.openSettings\}/);
  assert.match(antigravity, /data-shortcut=\{shortcuts\.addAccount\}/);
  assert.match(codex, /data-shortcut=\{shortcuts\.addAccount\}/);
  assert.match(claude, /data-shortcut=\{shortcuts\.addAccount\}/);
  assert.match(settings, /data-shortcut=\{shortcuts\.toggleTheme\}/);
  assert.match(cardView, /data-shortcut=\{shortcuts\.toggleCardView\}/);
  assert.match(quit, /data-shortcut=\{shortcut\}/);
});

test("app tooltip renders shortcut bindings as keycaps", () => {
  const tooltip = read("src/components/common/Tooltip.tsx");
  const css = read("src/styles/codex/codex-cards.css");
  assert.match(tooltip, /target\.getAttribute\("data-shortcut"\)/);
  assert.match(tooltip, /shortcutKeycaps/);
  assert.match(tooltip, /<kbd className="app-tooltip-keycap">/);
  assert.match(css, /\.app-tooltip-shortcut\s*\{/);
  assert.match(css, /\.app-tooltip-keycap\s*\{/);
});

test("confirmation dialogs map Escape to cancel and Enter to confirm", () => {
  const dialog = read("src/components/common/CustomDialog.tsx");
  assert.match(dialog, /event\.key === "Escape"[\s\S]*onClose\(false\)/);
  assert.match(dialog, /event\.key === "Enter"[\s\S]*onClose\(true\)/);
  assert.match(dialog, /addEventListener\("keydown", handleKeyDown, true\)/);
  assert.match(dialog, /removeEventListener\("keydown", handleKeyDown, true\)/);
});


test("in-app shortcut rows reuse matching action icons and supplied add theme search artwork", () => {
  const shortcutSettings = read("src/components/common/ShortcutSettings.tsx");
  const headerIcons = read("src/components/common/HeaderIcons.tsx");
  const codexBar = read("src/components/codex/CodexAccountBar.tsx");
  const antigravity = read("src/components/antigravity/AntigravityTab.tsx");
  const claude = read("src/components/claude/ClaudeTab.tsx");
  const quit = read("src/components/common/QuitButton.tsx");

  for (const icon of [
    "AddAccountIcon",
    "ShortcutThemeIcon",
    "CardViewIcon",
    "FocusSearchIcon",
    "RefreshIcon",
    "GearIcon",
    "QuitIcon",
  ]) {
    assert.match(shortcutSettings, new RegExp("icon: <" + icon));
  }

  assert.match(headerIcons, /M6 7C5\.44772 7 5 7\.44772 5 8/);
  assert.match(headerIcons, /M16,12\.55C17\.2,10\.43,19\.48,9,22\.09,9/);
  assert.match(headerIcons, /export const ThemeIcon:[\s\S]*theme-icon--moon[\s\S]*theme-icon--sun/);
  assert.match(headerIcons, /export const ShortcutThemeIcon:/);
  assert.match(headerIcons, /M3\.624,15a8\.03,8\.03,0,0,0,10\.619\.659/);

  assert.match(codexBar, /<CodexAddIcon \/>/);
  assert.match(antigravity, /<AddPlusIcon \/>/);
  assert.match(claude, /const AddAccountIcon: React\.FC[\s\S]*M12 5v14M5 12h14/);
  assert.match(quit, /import \{ QuitIcon \} from "\.\/HeaderIcons"/);
  assert.match(headerIcons, /export const QuitIcon:[\s\S]*width="12"[\s\S]*height="12"/);
});

test("shortcut groups rely on one section divider instead of a second group border", () => {
  const css = read("src/styles/settings/settings-modal.css");
  assert.match(
    css,
    /\.settings-section > :not\(\.settings-section-title\):not\(:last-child\)[\s\S]*border-bottom:/,
  );
  assert.doesNotMatch(
    css,
    /\.settings-shortcut-group \+ \.settings-shortcut-group\s*\{[^}]*border-top:/s,
  );
});

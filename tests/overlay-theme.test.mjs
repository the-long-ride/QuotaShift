import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Overlay settings expose Glassmorphism and Mono themes", () => {
  const group = fs.readFileSync("src/components/common/OverlayAdjustmentGroup.tsx", "utf8");
  const settings = fs.readFileSync("src/components/common/SettingsModal.tsx", "utf8");

  assert.match(group, /aria-label="Overlay Theme"/);
  assert.match(group, />\s*Glassmorphism\s*</);
  assert.match(group, /Mono/);
  assert.match(group, /onThemeChange\("glassmorphism"\)/);
  assert.match(group, /onThemeChange\("mono"\)/);
  assert.match(group, /follows the app window light\/dark theme/);
  assert.match(settings, /theme=\{uiAdjustment\.overlayTheme\}/);
  assert.match(settings, /onThemeChange=\{\(overlayTheme\) => updateUi\(\{ overlayTheme \}\)\}/);
});

test("overlay and tooltip windows apply theme preference and live app theme events", () => {
  const bridge = fs.readFileSync("src/components/overlay/OverlayWindowSizingBridge.tsx", "utf8");
  const tooltip = fs.readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");
  const appTheme = fs.readFileSync("src/hooks/useAppThemeAndOverlay.ts", "utf8");

  for (const source of [bridge, tooltip]) {
    assert.match(source, /setAttribute\("data-overlay-theme"/);
    assert.match(source, /setAttribute\("data-theme"/);
    assert.match(source, /listen<string>\(APP_THEME_EVENT/);
    assert.match(source, /THEME_KEY/);
  }
  assert.match(appTheme, /publishAppTheme\(nextTheme\)/);
});

test("Mono overlay theme follows dark/light app theme with no borders or outlines", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const imports = fs.readFileSync("src/styles.css", "utf8");

  assert.match(imports, /@import ".\/styles\/overlay-themes\.css";/);
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\]\s*\{[\s\S]*--overlay-mono-bg:\s*#000000[\s\S]*--overlay-mono-fg:\s*#ffffff/,
  );
  assert.match(
    styles,
    /:is\([\s\S]*\[data-overlay-theme="mono"\]\[data-theme="light"\][\s\S]*\)[\s\S]*--overlay-mono-bg:\s*#ffffff[\s\S]*--overlay-mono-fg:\s*#000000/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.glass-card\s*\{[\s\S]*border:\s*none;[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\);/,
  );
  assert.match(styles, /\.overlay-avatar-wrap\s*\{[\s\S]*border:\s*none;[\s\S]*outline:\s*none;/);
  assert.match(
    styles,
    /\.overlay-tier-badge,[\s\S]*\.overlay-guardrail-badge\s*\{[\s\S]*border:\s*1px solid var\(--overlay-mono-fg\)/,
  );
  assert.match(styles, /\.overlay-family-col \+ \.overlay-family-col\s*\{\s*border-left:\s*none;/);
  assert.match(
    styles,
    /\.overlay-context-menu\s*\{[\s\S]*border:\s*none;[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-fg\);/,
  );
  assert.match(
    styles,
    /\.overlay-tooltip\s*\{[\s\S]*border:\s*none;[\s\S]*outline:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\);/,
  );
  assert.match(styles, /\.overlay-tooltip::after\s*\{[\s\S]*border:\s*none;/);
  assert.match(
    styles,
    /data-usage-tone="warning"[\s\S]*#f97316[\s\S]*data-usage-tone="critical"[\s\S]*#ef4444/,
  );
  assert.doesNotMatch(styles, /\.overlay-avatar-img\s*\{[\s\S]*grayscale/);
});

test("Glassmorphism matches the music-player glass parameter profile", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(styles, /--glass-specular-opacity:\s*0\.31/);
  assert.match(styles, /--glass-specular-saturation:\s*16/);
  assert.match(styles, /--glass-refraction-level:\s*0\.76/);
  assert.match(styles, /--glass-blur-level:\s*1\.7/);
  assert.match(styles, /--glass-progressive-blur-strength:\s*1\.17/);
  assert.match(styles, /--glass-background-opacity:\s*0\.09/);
  assert.match(
    styles,
    /\[data-overlay-theme="glassmorphism"\] \.glass-card\s*\{[\s\S]*backdrop-filter:\s*blur\(17px\) saturate\(160%\) contrast\(1\.08\)/,
  );
  assert.match(styles, /border-radius:\s*999px/);
  assert.match(styles, /rgba\(12, 15, 20, var\(--glass-contrast-floor\)\)/);
});

test("glassmorphism has no square blur layer or fixed warm outline tint", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const glassSection = styles.split('[data-overlay-theme="mono"]')[0];

  assert.match(glassSection, /clip-path:\s*inset\(0 round 999px\);/);
  assert.match(glassSection, /border:\s*1px solid transparent;/);
  assert.match(
    glassSection,
    /\.glass-card::after\s*\{[\s\S]*backdrop-filter:\s*saturate\(260%\) contrast\(1\.28\) brightness\(1\.02\)/,
  );
  assert.doesNotMatch(glassSection, /rgba\(255,\s*(?:76|82|118),/);
  assert.doesNotMatch(glassSection, /--glass-warm-edge/);
});

test("glassmorphism uses the previous backdrop-sampled refraction ring", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const glassSection = styles.split('[data-overlay-theme="mono"]')[0];

  assert.match(glassSection, /mask-composite:\s*exclude;/);
  assert.match(glassSection, /-webkit-mask-composite:\s*xor;/);
  assert.match(glassSection, /background:\s*rgba\(255, 255, 255, 0\.035\);/);
});

test("glassmorphism tooltip has a glass arrow and no drop shadow", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const glassSection = styles.split('[data-overlay-theme="mono"]')[0];

  assert.match(
    glassSection,
    /\[data-overlay-theme="glassmorphism"\] \.overlay-tooltip\s*\{[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(glassSection, /\.overlay-tooltip::after\s*\{[\s\S]*box-shadow:\s*none;/);
});

test("glassmorphism keeps readable contrast on bright backgrounds", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  assert.match(styles, /--glass-contrast-floor:\s*0\.2;/);
  assert.match(styles, /background:\s*rgba\(12, 15, 20, var\(--glass-contrast-floor\)\)/);
});

test("glass menu buttons and both tooltip variants use reduced opacity and no shadow", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const glassSection = styles.split('[data-overlay-theme="mono"]')[0];

  assert.match(
    glassSection,
    /\.overlay-context-menu\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, 0\.28\);[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    glassSection,
    /\.overlay-menu-item\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, 0\.58\);[\s\S]*border-radius:\s*3px;[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    glassSection,
    /\.overlay-menu-item:hover\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, 0\.7\);/,
  );
  assert.match(
    glassSection,
    /\.overlay-tooltip\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, 0\.64\);[\s\S]*border-radius:\s*3px;[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    glassSection,
    /\.overlay-tooltip--menu\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, 0\.7\);[\s\S]*border-radius:\s*3px;[\s\S]*box-shadow:\s*none;/,
  );
});

test("glassmorphism uses a lighter shared surface with subtle content shadows", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const glassSection = styles.split('[data-overlay-theme="mono"]')[0];

  assert.match(glassSection, /--glass-contrast-floor:\s*0\.2;/);
  assert.match(
    glassSection,
    /\.glass-card\s*\{[\s\S]*background:\s*rgba\(12, 15, 20, var\(--glass-contrast-floor\)\)/,
  );
  assert.match(
    glassSection,
    /\.overlay-metric-label,[\s\S]*\.overlay-provider-badge\s*\{[\s\S]*text-shadow:\s*0 1px 2px rgba\(0, 0, 0, 0\.48\),[\s\S]*0 0 1px rgba\(0, 0, 0, 0\.25\);/,
  );
  assert.match(
    glassSection,
    /\.overlay-avatar-wrap\s*\{[\s\S]*box-shadow:\s*0 1px 4px rgba\(0, 0, 0, 0\.26\),[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.14\);/,
  );
  assert.match(
    glassSection,
    /\.overlay-avatar-img\s*\{[\s\S]*filter:\s*drop-shadow\(0 1px 2px rgba\(0, 0, 0, 0\.22\)\);/,
  );
});

test("glassmorphism stays the default overlay theme", () => {
  const prefs = fs.readFileSync("src/utils/common/ui-adjustment.ts", "utf8");
  const glass = fs.readFileSync("src/styles/overlay.css", "utf8");

  assert.match(prefs, /overlayTheme:\s*"glassmorphism"/);
  assert.match(glass, /backdrop-filter:\s*blur\(16px\) saturate\(190%\)/);
});

test("real-time overlay theme delivery targets the overlay windows explicitly", () => {
  const header = fs.readFileSync("src/components/common/Header.tsx", "utf8");
  const appTheme = fs.readFileSync("src/hooks/useAppThemeAndOverlay.ts", "utf8");
  const overlay = fs.readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");

  assert.match(header, /emitTo\("overlay", UI_ADJUSTMENT_EVENT, livePayload\)/);
  assert.match(header, /emitTo\("overlay-tooltip", UI_ADJUSTMENT_EVENT, livePayload\)/);
  assert.match(appTheme, /emitTo\("overlay", APP_THEME_EVENT, theme\)/);
  assert.match(appTheme, /emitTo\("overlay-tooltip", APP_THEME_EVENT, theme\)/);
  assert.match(
    overlay,
    /listen<UiAdjustmentPreferences & \{ appTheme\?: string \}>\(UI_ADJUSTMENT_EVENT/,
  );
  assert.match(overlay, /data-overlay-theme=\{overlayTheme\}/);
  assert.match(
    overlay,
    /document\.documentElement\.setAttribute\("data-overlay-theme", nextTheme\)/,
  );
});

test("overlay theme stylesheet is loaded while UI polish remains the final normalization layer", () => {
  const imports = fs.readFileSync("src/styles.css", "utf8");
  assert.ok(imports.includes('@import "./styles/overlay-themes.css";'));
  assert.match(imports, /@import "\.\/styles\/ui-polish\.css";\s*$/);
});

test("Mono preserves avatar color and threshold usage colors", () => {
  const card = fs.readFileSync("src/components/overlay/OverlayCard.tsx", "utf8");
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(card, /data-usage-tone=\{tone\}/);
  assert.match(card, /pct !== null && pct < 10 \? "critical"/);
  assert.match(card, /pct !== null && pct < 20 \? "warning"/);
  assert.match(styles, /data-usage-tone="warning"[\s\S]*#f97316/);
  assert.match(styles, /data-usage-tone="critical"[\s\S]*#ef4444/);
  assert.doesNotMatch(styles, /\.overlay-avatar-img[\s\S]*grayscale/);
});

test("overlay tooltip binds the selected overlay theme directly", () => {
  const tooltip = fs.readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");

  assert.match(tooltip, /useState<OverlayTheme>/);
  assert.match(tooltip, /setOverlayTheme\(p\.overlayTheme\)/);
  assert.match(tooltip, /data-overlay-theme=\{overlayTheme\}/);
});

test("UI adjustment delivery includes the current app theme for light-mode overlay sync", () => {
  const header = fs.readFileSync("src/components/common/Header.tsx", "utf8");
  const bridge = fs.readFileSync("src/components/overlay/OverlayWindowSizingBridge.tsx", "utf8");
  const tooltip = fs.readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");

  assert.match(header, /const appTheme = isDarkMode \? "dark" : "light"/);
  assert.match(header, /const livePayload = \{ \.\.\.normalized, appTheme \}/);
  assert.match(header, /emitTo\("overlay", UI_ADJUSTMENT_EVENT, livePayload\)/);
  assert.match(header, /emitTo\("overlay-tooltip", UI_ADJUSTMENT_EVENT, livePayload\)/);
  assert.match(bridge, /event\.payload\?\.appTheme.*applyAppTheme/s);
  assert.match(tooltip, /event\.payload\?\.appTheme.*applyAppTheme/s);
});

test("Mono badges use the opposite monochrome foreground as border", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(
    styles,
    /\.overlay-tier-badge,[\s\S]*\.overlay-provider-badge,[\s\S]*\.overlay-reset-badge,[\s\S]*\.overlay-guardrail-badge\s*\{[\s\S]*border:\s*1px solid var\(--overlay-mono-fg\)/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\]\[data-theme="light"\][\s\S]*--overlay-mono-fg:\s*#000000/,
  );
});

test("overlay and tooltip bind app theme on the same live themed element", () => {
  const overlay = fs.readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");
  const tooltip = fs.readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(overlay, /data-theme=\{appTheme\}/);
  assert.match(overlay, /setAppTheme\(nextAppTheme\)/);
  assert.match(tooltip, /data-theme=\{appTheme\}/);
  assert.match(tooltip, /setAppTheme\(next\)/);
  assert.match(styles, /\[data-theme="light"\] \[data-overlay-theme="mono"\]/);
});

test("overlay initializes light mode from shared theme storage and keeps listening for theme events", () => {
  const overlay = fs.readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");

  assert.match(overlay, /localStorage\.getItem\(THEME_KEY\) === "light"/);
  assert.match(overlay, /listen<string>\(APP_THEME_EVENT/);
  assert.match(overlay, /event\.key === THEME_KEY/);
});

test("glassmorphism keeps Claude overlay logos white regardless of app light/dark theme", () => {
  const card = fs.readFileSync("src/components/overlay/OverlayCard.tsx", "utf8");
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(card, /<ClaudeLogo size=\{12\} className="overlay-claude-logo" \/>/);
  assert.match(card, /<ClaudeLogo size=\{22\} className="overlay-claude-logo" \/>/);
  assert.match(
    styles,
    /\[data-overlay-theme="glassmorphism"\] \.overlay-claude-logo\s*\{[\s\S]*color:\s*#ffffff !important;/,
  );
});

test("Mono context menu uses a shadow fake border without a real border", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-context-menu\s*\{[\s\S]*border:\s*none;[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-fg\);/,
  );
});

test("Mono menu tooltips use a subtle shadow fake border", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");
  const tooltip = fs.readFileSync("src/components/overlay/OverlayTooltipApp.tsx", "utf8");
  const menu = fs.readFileSync("src/components/overlay/OverlayContextMenu.tsx", "utf8");

  assert.match(menu, /source:\s*"menu"/);
  assert.match(tooltip, /data\.source === "menu"/);
  assert.match(tooltip, /overlay-tooltip--menu/);
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-tooltip--menu\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\);/,
  );
  assert.equal((styles.match(/--overlay-mono-edge:\s*var\(--overlay-mono-fg\);/g) ?? []).length, 2);
  assert.match(
    styles,
    /\.overlay-tooltip--menu::after\s*\{[\s\S]*box-shadow:\s*-1px -1px 0 var\(--overlay-mono-edge\);/,
  );
  assert.match(
    styles,
    /\.overlay-tooltip--menu\.overlay-tooltip--above::after\s*\{[\s\S]*box-shadow:\s*1px 1px 0 var\(--overlay-mono-edge\);/,
  );
});

test("overlay menu can toggle the shared app theme in both directions", () => {
  const overlay = fs.readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");
  const menu = fs.readFileSync("src/components/overlay/OverlayContextMenu.tsx", "utf8");
  const appTheme = fs.readFileSync("src/hooks/useAppThemeAndOverlay.ts", "utf8");

  assert.match(menu, /appTheme:\s*"light" \| "dark"/);
  assert.match(menu, /onToggleTheme/);
  assert.match(menu, /Switch to light mode/);
  assert.match(menu, /Switch to dark mode/);
  assert.match(overlay, /const nextTheme = appTheme === "dark" \? "light" : "dark"/);
  assert.match(overlay, /localStorage\.setItem\(THEME_KEY, nextTheme\)/);
  assert.match(overlay, /emit\(APP_THEME_EVENT, nextTheme\)/);
  assert.match(
    appTheme,
    /listen<string>\(APP_THEME_EVENT,[\s\S]*setIsDarkMode\(nextTheme === "dark"\)[\s\S]*localStorage\.setItem\(THEME_KEY, nextTheme\)/,
  );
});

test("Mono restores the family divider and uses fake-border shadows on overlay and tooltip", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-family-col \+ \.overlay-family-col\s*\{[\s\S]*border-left:\s*none;[\s\S]*box-shadow:\s*-1px 0 0 var\(--overlay-mono-edge\);/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.glass-card\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\);/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-tooltip\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px var\(--overlay-mono-edge\);/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-tooltip::after\s*\{[\s\S]*box-shadow:\s*-1px -1px 0 var\(--overlay-mono-edge\);/,
  );
  assert.match(
    styles,
    /\[data-overlay-theme="mono"\] \.overlay-tooltip--above::after\s*\{[\s\S]*box-shadow:\s*1px 1px 0 var\(--overlay-mono-edge\);/,
  );
});

test("Mono fake-border shadows use the same foreground as normal usage bars", () => {
  const styles = fs.readFileSync("src/styles/overlay-themes.css", "utf8");

  assert.equal((styles.match(/--overlay-mono-edge:\s*var\(--overlay-mono-fg\);/g) ?? []).length, 2);
  assert.match(styles, /--overlay-mono-fg:\s*#ffffff;/);
  assert.match(styles, /--overlay-mono-fg:\s*#000000;/);
  assert.match(
    styles,
    /data-usage-tone="normal"[\s\S]*\.overlay-progress-bar[\s\S]*background:\s*var\(--overlay-mono-fg\) !important;/,
  );
});

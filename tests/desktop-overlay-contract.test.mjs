import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readWithCssImports } from "./css-helper.mjs";

const read = (path) => {
  const content = readWithCssImports(new URL(`../${path}`, import.meta.url));
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const cardPath = new URL("../src/components/overlay/OverlayCard.tsx", import.meta.url);
    const menuPath = new URL("../src/components/overlay/OverlayContextMenu.tsx", import.meta.url);
    const posPath = new URL("../src/components/overlay/overlay-position.ts", import.meta.url);
    const dragPath = new URL("../src/components/overlay/useOverlayDrag.ts", import.meta.url);
    const dataPath = new URL(
      "../src/components/overlay/useOverlayDataAndWindow.ts",
      import.meta.url,
    );
    const menuHookPath = new URL(
      "../src/components/overlay/useOverlayContextMenu.ts",
      import.meta.url,
    );
    return (
      content +
      (fs.existsSync(cardPath) ? readWithCssImports(cardPath) : "") +
      (fs.existsSync(menuPath) ? readWithCssImports(menuPath) : "") +
      (fs.existsSync(posPath) ? readWithCssImports(posPath) : "") +
      (fs.existsSync(dragPath) ? readWithCssImports(dragPath) : "") +
      (fs.existsSync(dataPath) ? readWithCssImports(dataPath) : "") +
      (fs.existsSync(menuHookPath) ? readWithCssImports(menuHookPath) : "")
    );
  }
  return content;
};
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));

test("tauri.conf.json configures the overlay window with 340x80 dimensions and transparent liquid attributes", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const windows = conf.app?.windows ?? [];
  const overlay = windows.find((w) => w.label === "overlay");

  assert.ok(overlay, "overlay window must be defined in tauri.conf.json");
  assert.equal(overlay.width, 340, "overlay window width should be 340");
  assert.equal(overlay.height, 80, "overlay window height should be 80");
  assert.equal(overlay.transparent, true, "overlay must be transparent");
  assert.equal(overlay.decorations, false, "overlay must have no OS window decorations");
  assert.equal(overlay.alwaysOnTop, true, "overlay must stay always on top");
  assert.equal(overlay.skipTaskbar, true, "overlay must not clutter the taskbar");
  assert.match(
    overlay.url,
    /window=overlay/,
    "overlay must route with window=overlay search param",
  );
});

test("capabilities default.json permits overlay window dragging, positioning, and sizing", () => {
  const cap = JSON.parse(read("src-tauri/capabilities/default.json"));
  assert.ok(cap.windows.includes("overlay"), "capabilities windows must include overlay");
  assert.ok(
    cap.permissions.includes("core:window:allow-start-dragging"),
    "capabilities must permit core:window:allow-start-dragging",
  );
  assert.ok(
    cap.permissions.includes("core:window:allow-set-position"),
    "capabilities must permit core:window:allow-set-position",
  );
  assert.ok(
    cap.permissions.includes("core:window:allow-set-size"),
    "capabilities must permit core:window:allow-set-size",
  );
});

test("main.tsx routes window=overlay query parameter to OverlayApp", () => {
  const code = read("src/main.tsx");
  assert.match(code, /window\.location\.search\.includes\("window=overlay"\)/);
  assert.match(code, /<OverlayApp\s*\/>/);
});

test("Overlay settings tab exposes Desktop Overlay toggle switch item", () => {
  const code =
    read("src/components/common/Header.tsx") +
    read("src/components/common/SettingsModal.tsx") +
    read("src/components/common/OverlayPrimaryRow.tsx");
  assert.match(code, /overlayEnabled/);
  assert.match(code, /onToggleOverlay/);
  assert.match(code, /Desktop Overlay/);
  assert.match(code, /codex-pool-switch.*overlayEnabled/);
});

test("App.tsx publishOverlayUpdate publishes multi-family Antigravity quotas and single-pool Codex quotas", () => {
  const code = read("src/App.tsx");
  assert.match(code, /family === ["']gemini["']/);
  assert.match(code, /family === ["']claude["']\s*\|\|\s*[^;\n]*family === ["']open_ai["']/);
  assert.match(
    code,
    /quotaRows:\s*(?:import\(["']\.\/components\/(?:overlay\/)?OverlayApp["']\)\.OverlayQuotaRow\[\]|OverlayQuotaRow\[\])/,
  );
  assert.match(code, /provider:\s*["']codex["']/);
  assert.match(code, /fiveHourPercent:/);
  assert.match(code, /weeklyPercent:/);
  assert.match(code, /emit\(\s*["']overlay-data-update["']/);
  assert.match(code, /localStorage\.setItem\(\s*["']quotashift_overlay_data["']/);
});

test("OverlayApp implements quota bar color thresholds (<10% red, <20% orange, >=20% white)", () => {
  const code = read("src/components/overlay/OverlayApp.tsx");
  assert.match(code, /function barColor\(pct:/);
  assert.match(code, /if\s*\(pct\s*<\s*10\)\s*return\s*["']#ef4444["']/);
  assert.match(code, /if\s*\(pct\s*<\s*20\)\s*return\s*["']#f97316["']/);
  assert.match(code, /return\s*["']rgba\(255,255,255,0\.85\)["']/);
});

test("OverlayApp renders correct brand logos and [Claude] ~ [OpenAI] format without text labels", () => {
  const code =
    read("src/components/overlay/OverlayApp.tsx") + read("src/components/overlay/OverlayCard.tsx");
  assert.match(code, /antigravity-icon__white\.png/);
  assert.match(code, /const OpenAILogo/);
  assert.match(code, /const GeminiLogo/);
  assert.match(
    code,
    /import\s+\{\s*ClaudeLogo\s*\}\s+from\s+["'](?:\.\/|\.\.\/claude\/)ClaudeLogo["']/,
  );
  assert.match(code, /<ClaudeLogo size=\{12\} className="overlay-claude-logo" \/>/);
  assert.match(code, /className="overlay-logo-sep"/);
  assert.match(code, /<OpenAILogo size=\{12\}\s*\/>/);
  assert.match(code, /className="overlay-family-logo"/);
});

test("OverlayWindowSizingBridge is the sole owner of native overlay size for every provider", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const bridge = read("src/components/overlay/OverlayWindowSizingBridge.tsx");
  assert.doesNotMatch(app, /targetWidth/);
  assert.doesNotMatch(app, /setSize\(new LogicalSize/);
  assert.match(bridge, /getOverlayWindowWidth/);
  assert.match(bridge, /getOverlayWindowHeight/);
  assert.doesNotMatch(bridge, /getBoundingClientRect|ResizeObserver|scrollWidth|scrollHeight/);
  assert.match(bridge, /setSize\(new LogicalSize/);
  assert.match(app, /className=\{`overlay-container overlay-container--\$\{data\.provider\}`\}/);
  assert.match(app, /glass-card--\$\{data\.provider\}/);
  assert.match(app, /data-provider=\{data\.provider\}/);
});

test("OverlayApp detects a double-click with its own time and distance thresholds", () => {
  const code = read("src/components/overlay/OverlayApp.tsx");
  const mouseDownBlock = code.match(/const handleMouseDown[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(code, /DOUBLE_CLICK_WINDOW_MS\s*=\s*500/);
  assert.match(code, /DOUBLE_CLICK_DISTANCE_PX\s*=\s*6/);
  assert.match(code, /lastPressRef/);
  assert.match(mouseDownBlock, /performance\.now\(\)/);
  assert.match(mouseDownBlock, /now - previousPress\.time <= DOUBLE_CLICK_WINDOW_MS/);
  assert.match(
    mouseDownBlock,
    /Math\.hypot\(pointerX - previousPress\.x, pointerY - previousPress\.y\)\s*<=\s*DOUBLE_CLICK_DISTANCE_PX/,
  );
  assert.match(mouseDownBlock, /invoke\(["']show_dashboard["']\)/);
  assert.match(mouseDownBlock, /lastPressRef\.current = null/);
  assert.doesNotMatch(
    code,
    /onDoubleClick=/,
    "browser dblclick must not be relied on for the transparent overlay",
  );
  assert.doesNotMatch(code, /e\.detail\s*===\s*2/, "do not depend on WebView2 MouseEvent.detail");
});

test("OverlayApp drags manually after movement without consuming the double-click sequence", () => {
  const code = read("src/components/overlay/OverlayApp.tsx");
  const mouseMoveBlock = code.match(/const handleMouseMove[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(code, /DRAG_THRESHOLD_PX\s*=\s*4/);
  assert.match(code, /outerPosition\(\)/);
  assert.match(mouseMoveBlock, /e\.screenX - origin\.pointerX/);
  assert.match(mouseMoveBlock, /e\.screenY - origin\.pointerY/);
  assert.match(mouseMoveBlock, /Math\.hypot\(deltaX, deltaY\) < DRAG_THRESHOLD_PX/);
  assert.match(mouseMoveBlock, /lastPressRef\.current = null/);
  assert.match(mouseMoveBlock, /setPosition\(new PhysicalPosition/);
  assert.match(code, /onMouseUp=\{handleMouseUp\}/);
  assert.doesNotMatch(
    code,
    /startDragging\(/,
    "native dragging consumes the double-click sequence on this WebView overlay",
  );
  assert.doesNotMatch(
    code,
    /data-tauri-drag-region/,
    "manual dragging must not compete with native drag regions",
  );
  assert.equal((code.match(/onMouseDown=\{handleMouseDown\}/g) ?? []).length, 1);
  assert.equal((code.match(/onMouseMove=\{handleMouseMove\}/g) ?? []).length, 1);
  assert.doesNotMatch(
    code,
    /interaction-probe|logFrontend/,
    "temporary interaction debug logging must not ship",
  );
});

test("OverlayApp clamps position to screen workArea on mount", () => {
  const code = read("src/components/overlay/OverlayApp.tsx");
  assert.match(code, /clampPositionToScreen/);
  assert.match(code, /currentMonitor/);
  assert.match(code, /primaryMonitor/);
  assert.match(code, /monitor\.workArea/);
  assert.match(code, /win\.setPosition\(new PhysicalPosition/);
  assert.match(code, /STORAGE_OVERLAY_POS_KEY/);
});

test("styles.css defines liquid glass theme with acrylic saturation, specular highlight, and no outer box-shadow", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.glass-card\s*\{/);
  assert.match(css, /backdrop-filter:\s*blur\(16px\)\s*saturate\(190%\)/);
  assert.match(css, /border-radius:\s*12px/);
  assert.match(css, /border-top:\s*1px solid rgba\(255, 255, 255, 0\.55\)/);
  assert.match(css, /box-shadow:\s*none/);
  assert.match(css, /\.glass-card::before/);
  assert.doesNotMatch(
    css,
    /(^|\n)\.glass-card::after\s*\{/m,
    "The base overlay must not have an unscoped leftover border-line pseudo element",
  );
  assert.match(
    css,
    /\[data-overlay-theme="glassmorphism"\] \.glass-card::after\s*\{[\s\S]*mask-composite:\s*exclude;/,
  );
});

test("styles.css scales one fixed overlay surface for all providers", () => {
  const css = read("src/styles.css");
  assert.match(css, /--overlay-ui-scale/);
  assert.match(css, /\.overlay-container\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.overlay-container\s*\{[\s\S]*?height:\s*100%/);
  assert.match(css, /\.overlay-container\s*\{[\s\S]*?zoom:\s*var\(--overlay-ui-scale\)/);
  assert.match(css, /\.glass-card\s*\{[\s\S]*?width:\s*100%/);
  assert.doesNotMatch(css, /--overlay-card-width|--overlay-card-height|--overlay-ui-scale-inverse/);
  assert.doesNotMatch(css, /max-width:\s*238px/);
  assert.doesNotMatch(css, /max-width:\s*340px/);
});

test("styles.css styles provider badge with transparent background and glass border", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(8px\);/);
  assert.match(
    css,
    /\.overlay-provider-badge\s*\{[\s\S]*?border:\s*1px solid rgba\(255, 255, 255, 0\.35\);/,
  );
});

test("styles.css and OverlayApp define provider-aware plan tier badge at left side of avatar with liquid glass square", () => {
  const css = read("src/styles.css");
  const code = read("src/components/overlay/OverlayApp.tsx");
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?position:\s*absolute;/);
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?left:\s*-4px;/);
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(8px\);/);
  assert.match(
    css,
    /\.overlay-tier-badge\s*\{[\s\S]*?border:\s*1px solid rgba\(255, 255, 255, 0\.35\);/,
  );
  assert.match(code, /export\s+function\s+resolveTierBadgeText/);
  assert.match(code, /className="overlay-tier-badge"/);
  assert.match(code, /\{tierText\}/);
});

test("styles.css defines dual logo styling and column divider for horizontal family layout", () => {
  const css = read("src/styles.css");
  assert.match(css, /\.overlay-dual-logo/);
  assert.match(css, /\.overlay-logo-sep/);
  assert.match(css, /\.overlay-family-logo/);
  assert.match(css, /\.overlay-family-col \+ \.overlay-family-col/);
});

test("Rust backend attaches Win32 overlay clamp hook with multi-monitor edge awareness", () => {
  const lib = read("src-tauri/src/lib.rs");
  const clamp = read("src-tauri/src/window/overlay_clamp.rs");
  assert.match(lib, /overlay_clamp/);
  assert.match(lib, /overlay_clamp::clamp_overlay_window_to_screen/);
  assert.match(clamp, /SetWindowSubclass/);
  assert.match(clamp, /WM_MOVING/);
  assert.match(clamp, /WM_WINDOWPOSCHANGING/);
  assert.match(clamp, /EnumDisplayMonitors/);
  assert.match(clamp, /has_display_right/);
  assert.match(clamp, /has_display_left/);
  assert.match(clamp, /has_display_top/);
  assert.match(clamp, /has_display_bottom/);
});

test("Claude tab reuses the same Claude SVG component as the overlay", () => {
  assert.equal(
    exists("src/components/claude/ClaudeLogo.tsx"),
    true,
    "shared ClaudeLogo component must exist",
  );
  const logo = read("src/components/claude/ClaudeLogo.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const tabBar = read("src/components/app/AppTabBar.tsx");
  const brandIcon = read("src/components/common/PlatformBrandIcon.tsx");
  assert.match(logo, /viewBox=["']0 0 100 100["']/);
  assert.match(logo, /m19\.6 66\.5 19\.7-11/);
  assert.match(
    overlay,
    /import\s+\{\s*ClaudeLogo\s*\}\s+from\s+["'](?:\.\/|\.\.\/claude\/)ClaudeLogo["']/,
  );
  assert.match(overlay, /<ClaudeLogo size=\{12\} className="overlay-claude-logo" \/>/);
  assert.match(tabBar, /<PlatformBrandIcon platform="claude" \/>/);
  assert.match(brandIcon, /return <ClaudeLogo size=\{12\} className="tab-brand-icon" \/>/);
  assert.doesNotMatch(
    tabBar + brandIcon,
    /M11 1h2v7\.17l5\.07-5\.07/,
    "temporary starburst Claude tab icon must be removed",
  );
});

test("Overlay tracking is decoupled from activeTab and supports dynamic singleBars for single-window plans", () => {
  const app = read("src/App.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  assert.match(
    app,
    /const isCodexTracked\s*=\s*(?:savedTrackedProvider === ["']codex["'][\s\S]*?)?Boolean\(lastFullStatus\?\.monitoredCodex\)/,
  );
  assert.doesNotMatch(app, /publishOverlayUpdate = useCallback\([\s\S]*?\[activeTab/);
  assert.match(app, /normalizeCodexUsageWindows\(cache\.rate_limit\)/);
  assert.match(app, /singleBars/);
  assert.match(overlay, /interface OverlaySingleBar/);
  assert.match(overlay, /singleBars\?:\s*OverlaySingleBar\[\]/);
  assert.match(overlay, /data\.singleBars\.map/);
  assert.match(css, /\.glass-card:hover\s*\{[\s\S]*?border-top-color/);
  assert.doesNotMatch(css, /\.glass-card:hover\s*\{[\s\S]*?rgba\(26,\s*32,\s*48/);
});

test("main.tsx and index.html suppress native WebView context menu in production / build versions", () => {
  const indexHtml = read("index.html");
  const mainTsx = read("src/main.tsx");
  assert.match(indexHtml, /contextmenu/);
  assert.match(indexHtml, /preventDefault/);
  assert.match(mainTsx, /import\.meta\.env\.DEV/);
  assert.match(mainTsx, /addEventListener\(\s*["']contextmenu["']/);
});

test("OverlayApp renders a liquid-glass icon-only 4-button action panel on right-click", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  const app = read("src/App.tsx");
  assert.match(overlay, /handleContextMenu/);
  assert.match(overlay, /className="overlay-context-menu"/);
  for (const label of ["Refresh usage", "Open dashboard", "Hide overlay"]) {
    assert.match(overlay, new RegExp(`data-tooltip="${label}"`));
    assert.match(overlay, new RegExp(`aria-label="${label}"`));
  }
  assert.doesNotMatch(overlay, /<span>Refresh usage<\/span>/);
  assert.doesNotMatch(overlay, /<span>Open dashboard<\/span>/);
  assert.doesNotMatch(overlay, /<span>Hide overlay<\/span>/);
  assert.doesNotMatch(overlay, /title="(?:Refresh usage|Open dashboard|Hide overlay)"/);
  assert.match(overlay, /onMouseEnter=\{\(event\) => showTooltip\("Refresh usage", event\)\}/);
  assert.match(overlay, /Switch to light mode/);
  assert.match(overlay, /Switch to dark mode/);
  assert.match(overlay, /onToggleTheme=\{handleToggleAppTheme\}/);
  assert.match(overlay, /emit\(APP_THEME_EVENT, nextTheme\)/);
  assert.match(overlay, /emit\("overlay-tooltip-data"/);
  assert.match(overlay, /Promise\.all\(\[win\.outerPosition\(\), win\.outerSize\(\)\]\)/);
  assert.match(overlay, /const nativeScale = outerSize\.width \/ cssViewportWidth/);
  assert.match(
    overlay,
    /const buttonCenterX = position\.x \+ \(rect\.left \+ rect\.width \/ 2\) \* nativeScale/,
  );
  assert.match(overlay, /menuWidth/);
  assert.match(overlay, /menuHeight/);
  assert.match(overlay, /posX \+ menuWidth >/);
  assert.match(overlay, /posY \+ menuHeight >/);
  assert.match(css, /\.overlay-context-menu\s*\{/);
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\.overlay-menu-item\s*\{/);
  assert.match(app, /listen\("request-refresh-usage"/);
  assert.match(app, /listen<boolean>\("overlay-visibility-changed"/);
});

test("Rust poll_and_update_tray preserves monitored_codex across polling intervals", () => {
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /async fn poll_and_update_tray/);
  assert.match(lib, /status\.monitored_codex\s*=\s*monitored_codex;/);
  assert.match(
    lib,
    /force_refresh[\s\S]*?status\.monitored_codex\s*=\s*state\.monitored_codex\.clone\(\);/,
  );
});

test("Tracked account and provider are persisted to storage and restored on startup", () => {
  const constants = read("src/utils/common/app-constants.ts");
  const usageOverlay = read("src/hooks/useAppUsageAndOverlay.ts");
  const bootstrap = read("src/hooks/useAppSessionBootstrap.ts");
  assert.match(
    constants,
    /OVERLAY_TRACKED_PROVIDER_KEY\s*=\s*["']quotashift_overlay_tracked_provider["']/,
  );
  assert.match(
    constants,
    /OVERLAY_TRACKED_ACCOUNT_ID_KEY\s*=\s*["']quotashift_overlay_tracked_account_id["']/,
  );
  assert.match(
    usageOverlay,
    /handleTrackAntigravityAccount[\s\S]*?localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']antigravity["']\)/,
  );
  assert.match(
    usageOverlay,
    /handleTrackCodexAccount[\s\S]*?localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']codex["']\)/,
  );
  assert.match(
    bootstrap,
    /const savedTrackedProvider = localStorage\.getItem\(OVERLAY_TRACKED_PROVIDER_KEY\)/,
  );
  assert.match(bootstrap, /invoke\("set_monitored_codex"/);
});

test("Overlay refresh button refreshes only the tracked account without triggering full multi-account refresh", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const app = read("src/App.tsx");
  assert.match(
    overlay,
    /handleRefreshUsage[\s\S]*?emit\("request-refresh-usage",\s*\{[\s\S]*?provider: data\.provider/,
  );
  assert.doesNotMatch(
    overlay,
    /handleRefreshUsage[\s\S]*?invoke\("force_refresh"\)/,
    "overlay menu must not invoke broad force_refresh",
  );
  assert.match(
    app,
    /listen[\s\S]*?"request-refresh-usage"[\s\S]*?refreshTrackedAccountOnly\(event\?\.payload\)/,
  );
  assert.match(app, /const refreshTrackedAccountOnly = async/);
  assert.match(app, /refreshTrackedAccountOnly[\s\S]*?fetchAccountUsage\(targetAcc,\s*(?:true|force)\)/);
  assert.match(
    app,
    /refreshTrackedAccountOnly[\s\S]*?refreshAntigravityAccountsCloudFirst\(\[targetAcc\],\s*(?:true|force)\)/,
  );
});

test("Overlay context menu is one compact horizontal 4-button panel with matching bounds", () => {
  const css = read("src/styles.css");
  const overlayCss = read("src/styles/overlay.css");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?width:\s*95px;/);
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?padding:\s*3px;/);
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?flex-direction:\s*row;/);
  assert.match(css, /\.overlay-menu-item\s*\{[\s\S]*?width:\s*20px;/);
  assert.match(css, /\.overlay-menu-item\s*\{[\s\S]*?height:\s*20px;/);
  assert.doesNotMatch(overlayCss, /\.overlay-menu-item::after\s*\{[\s\S]*content:/);
  assert.match(overlay, /menuWidth\s*=\s*95;/);
  assert.match(overlay, /menuHeight\s*=\s*26;/);
  assert.match(overlay, /<svg\s+width="12"\s+height="12"/);
});

test("Overlay tracking on app startup loads synchronous accounts and preserves cached overlay data without blanking", () => {
  const app = read("src/App.tsx");
  assert.match(
    app,
    /useState<AntigravityAccount\[\]>\(\(\)\s*=>\s*loadAntigravityAccounts\(\),?\s*\)/,
  );
  assert.match(app, /useState<CodexAccount\[\]>\(\(\)\s*=>\s*loadCodexAccounts\(\),?\s*\)/);
  assert.match(
    app,
    /useState<string \| null>\(\(\)\s*=>\s*\{?[\s\S]*?localStorage\.getItem\(ANTIGRAVITY_ACTIVE_ID_KEY\)/,
  );
  assert.match(
    app,
    /useState<string \| null>\(\(\)\s*=>\s*\{?[\s\S]*?localStorage\.getItem\(CODEX_ACTIVE_ID_KEY\)/,
  );
  assert.match(app, /let prevOverlayData:\s*OverlayAccountData\s*\|\s*null\s*=\s*null;/);
  assert.match(app, /localStorage\.getItem\(["']quotashift_overlay_data["']\)/);
  assert.match(app, /prevOverlayData\.provider === ["']antigravity["']/);
  assert.match(app, /prevOverlayData\.provider === ["']codex["']/);
});

test("Overlay multi-monitor drag and Win32 clamp preserve position without jumping on right-click", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const clamp = read("src-tauri/src/window/overlay_clamp.rs");
  assert.match(overlay, /availableMonitors\(\)/);
  assert.match(overlay, /setPointerCapture\(e\.pointerId\)/);
  assert.match(clamp, /WM_MOVING/);
  assert.match(clamp, /WM_WINDOWPOSCHANGING/);
  assert.match(clamp, /DefSubclassProc\(hwnd,\s*msg,\s*w_param,\s*l_param\)/);
});

test("Overlay avatar image is non-draggable and unselectable to prevent selection ghosting during overlay dragging", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  assert.match(overlay, /className="overlay-avatar-img"[\s\S]*?draggable=\{false\}/);
  assert.match(css, /\.overlay-avatar-wrap\s*\{[\s\S]*?user-select:\s*none;/);
  assert.match(css, /\.overlay-avatar-img\s*\{[\s\S]*?-webkit-user-drag:\s*none;/);
  assert.match(css, /\.overlay-avatar-img\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-avatar-fallback\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test("Overlay logo images and SVGs are non-draggable and unselectable", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  assert.match(overlay, /AntigravityLogo[\s\S]*?draggable=\{false\}/);
  assert.match(overlay, /WebkitUserDrag:\s*"none"/);
  assert.match(overlay, /pointerEvents:\s*"none"/);
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-provider-badge img,[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-family-logo\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-family-logo img,[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-dual-logo\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test("Dashboard monitored pulse icon strictly follows trackedProvider and trackedAccountId", () => {
  const app = read("src/App.tsx");
  const agTab = read("src/components/antigravity/AntigravityTab.tsx");
  const codexTab = read("src/components/codex/CodexTab.tsx");
  assert.match(app, /const \[trackedAccountId, setTrackedAccountId\] = useState<string \| null>/);
  assert.match(
    app,
    /<AntigravityTab[\s\S]*?trackedAccountId=\{trackedAccountId\}[\s\S]*?trackedProvider=\{trackedProvider\}/,
  );
  assert.match(
    app,
    /<CodexTab[\s\S]*?trackedAccountId=\{trackedAccountId\}[\s\S]*?trackedProvider=\{trackedProvider\}/,
  );
  assert.match(agTab, /trackedAccountId\?: string \| null/);
  assert.match(agTab, /effectiveTrackedId\s*=\s*trackedProvider === "antigravity"/);
  assert.match(
    agTab,
    /const isMonitoredAg = Boolean\(effectiveTrackedId && acc\.id === effectiveTrackedId\);/,
  );
  assert.match(codexTab, /trackedAccountId\?: string \| null/);
  assert.match(codexTab, /effectiveTrackedId\s*=\s*trackedProvider === "codex"/);
  assert.match(
    codexTab,
    /const isMonitored = Boolean\(effectiveTrackedId && acc\.id === effectiveTrackedId\);/,
  );
});

test('Overlay contracts map rate limit windows to compact labels ("5H", "WK", "MO") for compact singleBars and BarRow fallback', () => {
  const app = read("src/App.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  assert.match(app, /"5H"/);
  assert.match(app, /"WK"/);
  assert.match(app, /"MO"/);
  assert.match(overlay, /"5H"/);
  assert.match(overlay, /"WK"/);
  assert.match(overlay, /"MO"/);
});

test("Overlay renders liquid glass reset badge on top-right of avatar only when resetCount > 0", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  const app = read("src/App.tsx");
  assert.match(overlay, /resetCount\?:\s*number\s*\|\s*null/);
  assert.match(overlay, /typeof data\.resetCount === ["']number["']\s*&&\s*data\.resetCount > 0/);
  assert.match(overlay, /className="overlay-reset-badge"/);
  assert.match(app, /resetCount/);
  assert.match(app, /available_count/);
  assert.match(css, /\.overlay-reset-badge\s*\{/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?top:\s*-3px/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?right:\s*-4px/);
  assert.match(css, /\.overlay-reset-badge\s*\{[\s\S]*?backdrop-filter:\s*blur/);
});

test("Overlay avatar falls back to placeholder initial letter on image load error or missing source", () => {
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const css = read("src/styles.css");
  assert.match(overlay, /avatarError.*setAvatarError/);
  assert.match(overlay, /onError=\{.*setAvatarError\(true\)\}/);
  assert.match(overlay, /className="overlay-avatar-fallback"/);
  assert.match(overlay, /initialLetter/);
  assert.match(css, /\.overlay-avatar-fallback\s*\{/);
  assert.match(css, /\.overlay-avatar-fallback\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test("overlay menu stays open when the non-focusable tooltip window is shown", () => {
  const menuHook = read("src/components/overlay/useOverlayContextMenu.ts");
  const tooltip = read("src/components/overlay/OverlayTooltipApp.tsx");
  const capabilities = read("src-tauri/capabilities/default.json");

  assert.doesNotMatch(menuHook, /addEventListener\("blur"/);
  assert.doesNotMatch(menuHook, /removeEventListener\("blur"/);
  assert.match(tooltip, /setFocusable\(false\)/);
  assert.match(capabilities, /core:window:allow-set-focusable/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from './css-helper.mjs';

const read = (path) => readWithCssImports(new URL(`../${path}`, import.meta.url));
const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));

test('tauri.conf.json configures the overlay window with 340x100 dimensions and transparent liquid attributes', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
  const windows = conf.app?.windows ?? [];
  const overlay = windows.find((w) => w.label === 'overlay');

  assert.ok(overlay, 'overlay window must be defined in tauri.conf.json');
  assert.equal(overlay.width, 340, 'overlay window width should be 340');
  assert.equal(overlay.height, 100, 'overlay window height should be 100');
  assert.equal(overlay.transparent, true, 'overlay must be transparent');
  assert.equal(overlay.decorations, false, 'overlay must have no OS window decorations');
  assert.equal(overlay.alwaysOnTop, true, 'overlay must stay always on top');
  assert.equal(overlay.skipTaskbar, true, 'overlay must not clutter the taskbar');
  assert.match(overlay.url, /window=overlay/, 'overlay must route with window=overlay search param');
});

test('capabilities default.json permits overlay window dragging, positioning, and sizing', () => {
  const cap = JSON.parse(read('src-tauri/capabilities/default.json'));
  assert.ok(cap.windows.includes('overlay'), 'capabilities windows must include overlay');
  assert.ok(
    cap.permissions.includes('core:window:allow-start-dragging'),
    'capabilities must permit core:window:allow-start-dragging'
  );
  assert.ok(
    cap.permissions.includes('core:window:allow-set-position'),
    'capabilities must permit core:window:allow-set-position'
  );
  assert.ok(
    cap.permissions.includes('core:window:allow-set-size'),
    'capabilities must permit core:window:allow-set-size'
  );
});

test('main.tsx routes window=overlay query parameter to OverlayApp', () => {
  const code = read('src/main.tsx');
  assert.match(code, /window\.location\.search\.includes\("window=overlay"\)/);
  assert.match(code, /<OverlayApp\s*\/>/);
});

test('Header exposes Desktop Overlay setting toggle item and dot indicator', () => {
  const code = read('src/components/Header.tsx');
  assert.match(code, /overlayEnabled/);
  assert.match(code, /onToggleOverlay/);
  assert.match(code, /Desktop Overlay/);
  assert.match(code, /gear-toggle-dot.*overlayEnabled/);
});

test('App.tsx publishOverlayUpdate publishes multi-family Antigravity quotas and single-pool Codex quotas', () => {
  const code = read('src/App.tsx');

  // Multi-family grouping for Antigravity
  assert.match(code, /family === ["']gemini["']/);
  assert.match(code, /family === ["']claude["']\s*\|\|\s*[^;\n]*family === ["']open_ai["']/);
  assert.match(code, /quotaRows:\s*import\(["']\.\/components\/OverlayApp["']\)\.OverlayQuotaRow\[\]/);

  // Codex single pool publish
  assert.match(code, /provider:\s*["']codex["']/);
  assert.match(code, /fiveHourPercent:/);
  assert.match(code, /weeklyPercent:/);

  // Tauri event and storage sync
  assert.match(code, /emit\(\s*["']overlay-data-update["']/);
  assert.match(code, /localStorage\.setItem\(\s*["']quotashift_overlay_data["']/);
});

test('OverlayApp implements quota bar color thresholds (<10% red, <20% orange, >=20% white)', () => {
  const code = read('src/components/OverlayApp.tsx');

  assert.match(code, /function barColor\(pct:/);
  assert.match(code, /if\s*\(pct\s*<\s*10\)\s*return\s*["']#ef4444["']/);
  assert.match(code, /if\s*\(pct\s*<\s*20\)\s*return\s*["']#f97316["']/);
  assert.match(code, /return\s*["']rgba\(255,255,255,0\.85\)["']/);
});

test('OverlayApp renders correct brand logos and [Claude] ~ [OpenAI] format without text labels', () => {
  const code = read('src/components/OverlayApp.tsx');

  // Antigravity brand icon matching main tab
  assert.match(code, /antigravity-icon__white\.png/);
  // OpenAI SVG path matching main tab
  assert.match(code, /const OpenAILogo/);
  // Gemini star logo
  assert.match(code, /const GeminiLogo/);
  // Official Claude logo is shared with the main Claude tab
  assert.match(code, /import\s+\{\s*ClaudeLogo\s*\}\s+from\s+["']\.\/ClaudeLogo["']/);

  // Dual Claude ~ OpenAI logo format
  assert.match(code, /<ClaudeLogo size=\{12\}\s*\/>/);
  assert.match(code, /className="overlay-logo-sep"/);
  assert.match(code, /<OpenAILogo size=\{12\}\s*\/>/);

  // Centered logo container
  assert.match(code, /className="overlay-family-logo"/);
});

test('OverlayApp adapts width dynamically based on account platform type (Codex 70% of Antigravity)', () => {
  const code = read('src/components/OverlayApp.tsx');

  assert.match(code, /targetWidth = (?:data\.provider === ["']codex["'] \? 238 : 340|\(data\.provider === ["']codex["'] \|\| data\.provider === ["']claude["']\) \? 238 : 340)/);
  assert.match(code, /win\.setSize\(new LogicalSize\(targetWidth, 100\)\)/);
  assert.match(code, /className=\{`overlay-container overlay-container--\$\{data\.provider\}`\}/);
  assert.match(code, /glass-card--\$\{data\.provider\}/);
  assert.match(code, /data-provider=\{data\.provider\}/);
});

test('OverlayApp detects a double-click with its own time and distance thresholds', () => {
  const code = read('src/components/OverlayApp.tsx');
  const mouseDownBlock = code.match(/const handleMouseDown[\s\S]*?\n  \};/)?.[0] ?? '';

  assert.match(code, /DOUBLE_CLICK_WINDOW_MS\s*=\s*500/);
  assert.match(code, /DOUBLE_CLICK_DISTANCE_PX\s*=\s*6/);
  assert.match(code, /lastPressRef/);
  assert.match(mouseDownBlock, /performance\.now\(\)/);
  assert.match(mouseDownBlock, /now - previousPress\.time <= DOUBLE_CLICK_WINDOW_MS/);
  assert.match(mouseDownBlock, /Math\.hypot\(pointerX - previousPress\.x, pointerY - previousPress\.y\) <= DOUBLE_CLICK_DISTANCE_PX/);
  assert.match(mouseDownBlock, /invoke\(["']show_dashboard["']\)/);
  assert.match(mouseDownBlock, /lastPressRef\.current = null/);
  assert.doesNotMatch(code, /onDoubleClick=/, 'browser dblclick must not be relied on for the transparent overlay');
  assert.doesNotMatch(code, /e\.detail\s*===\s*2/, 'do not depend on WebView2 MouseEvent.detail');
});

test('OverlayApp drags manually after movement without consuming the double-click sequence', () => {
  const code = read('src/components/OverlayApp.tsx');
  const mouseMoveBlock = code.match(/const handleMouseMove[\s\S]*?\n  \};/)?.[0] ?? '';

  assert.match(code, /DRAG_THRESHOLD_PX\s*=\s*4/);
  assert.match(code, /outerPosition\(\)/);
  assert.match(mouseMoveBlock, /e\.screenX - origin\.pointerX/);
  assert.match(mouseMoveBlock, /e\.screenY - origin\.pointerY/);
  assert.match(mouseMoveBlock, /Math\.hypot\(deltaX, deltaY\) < DRAG_THRESHOLD_PX/);
  assert.match(mouseMoveBlock, /lastPressRef\.current = null/);
  assert.match(mouseMoveBlock, /setPosition\(new PhysicalPosition/);
  assert.match(code, /onMouseUp=\{handleMouseUp\}/);
  assert.doesNotMatch(code, /startDragging\(/, 'native dragging consumes the double-click sequence on this WebView overlay');
  assert.doesNotMatch(code, /data-tauri-drag-region/, 'manual dragging must not compete with native drag regions');
  assert.equal((code.match(/onMouseDown=\{handleMouseDown\}/g) ?? []).length, 1);
  assert.equal((code.match(/onMouseMove=\{handleMouseMove\}/g) ?? []).length, 1);
  assert.doesNotMatch(code, /interaction-probe|logFrontend/, 'temporary interaction debug logging must not ship');
});

test('OverlayApp clamps position to screen workArea on mount', () => {
  const code = read('src/components/OverlayApp.tsx');

  assert.match(code, /clampPositionToScreen/);
  assert.match(code, /currentMonitor/);
  assert.match(code, /primaryMonitor/);
  assert.match(code, /monitor\.workArea/);
  assert.match(code, /win\.setPosition\(new PhysicalPosition/);
  assert.match(code, /STORAGE_OVERLAY_POS_KEY/);
});

test('styles.css defines liquid glass theme with acrylic saturation, specular highlight, and no outer box-shadow', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.glass-card\s*\{/);
  assert.match(css, /backdrop-filter:\s*blur\(16px\)\s*saturate\(190%\)/);
  assert.match(css, /border-radius:\s*12px/);
  assert.match(css, /border-top:\s*1px solid rgba\(255, 255, 255, 0\.55\)/);
  assert.match(css, /box-shadow:\s*none/);
  assert.match(css, /\.glass-card::before/);
  assert.doesNotMatch(css, /\.glass-card::after/, 'Must not have leftover vertical border lines');
});

test('styles.css defines platform-specific sizing for Codex (70% width) and Antigravity', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.glass-card--codex/);
  assert.match(css, /max-width:\s*238px/);
  assert.match(css, /\.glass-card--antigravity/);
  assert.match(css, /max-width:\s*340px/);
});

test('styles.css styles provider badge with transparent background and glass border', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(8px\);/);
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?border:\s*1px solid rgba\(255, 255, 255, 0\.35\);/);
});

test('styles.css and OverlayApp define plan tier badge (PRO/FREE) at left side of avatar with liquid glass square', () => {
  const css = read('src/styles.css');
  const code = read('src/components/OverlayApp.tsx');

  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?position:\s*absolute;/);
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?left:\s*-4px;/);
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?backdrop-filter:\s*blur\(8px\);/);
  assert.match(css, /\.overlay-tier-badge\s*\{[\s\S]*?border:\s*1px solid rgba\(255, 255, 255, 0\.35\);/);

  assert.match(code, /export\s+function\s+resolveTierBadgeText/);
  assert.match(code, /className="overlay-tier-badge"/);
  assert.match(code, /\{tierText\}/);
});

test('styles.css defines dual logo styling and column divider for horizontal family layout', () => {
  const css = read('src/styles.css');

  assert.match(css, /\.overlay-dual-logo/);
  assert.match(css, /\.overlay-logo-sep/);
  assert.match(css, /\.overlay-family-logo/);
  assert.match(css, /\.overlay-family-col \+ \.overlay-family-col/);
});

test('Rust backend attaches Win32 overlay clamp hook with multi-monitor edge awareness', () => {
  const lib = read('src-tauri/src/lib.rs');
  const clamp = read('src-tauri/src/overlay_clamp.rs');

  // Module registration and setup in lib.rs
  assert.match(lib, /mod overlay_clamp;/);
  assert.match(lib, /overlay_clamp::clamp_overlay_window_to_screen/);

  // Win32 hooks in overlay_clamp.rs
  assert.match(clamp, /SetWindowSubclass/);
  assert.match(clamp, /WM_MOVING/);
  assert.match(clamp, /WM_WINDOWPOSCHANGING/);
  assert.match(clamp, /EnumDisplayMonitors/);
  assert.match(clamp, /has_display_right/);
  assert.match(clamp, /has_display_left/);
  assert.match(clamp, /has_display_top/);
  assert.match(clamp, /has_display_bottom/);
});

test('Claude tab reuses the same Claude SVG component as the overlay', () => {
  assert.equal(exists('src/components/ClaudeLogo.tsx'), true, 'shared ClaudeLogo component must exist');
  const logo = read('src/components/ClaudeLogo.tsx');
  const overlay = read('src/components/OverlayApp.tsx');
  const app = read('src/App.tsx');

  assert.match(logo, /viewBox=["']0 0 100 100["']/);
  assert.match(logo, /m19\.6 66\.5 19\.7-11/);
  assert.match(overlay, /import\s+\{\s*ClaudeLogo\s*\}\s+from\s+["']\.\/ClaudeLogo["']/);
  assert.match(overlay, /<ClaudeLogo size=\{12\}\s*\/>/);
  assert.match(app, /import\s+\{\s*ClaudeLogo\s*\}\s+from\s+["']\.\/components\/ClaudeLogo["']/);
  assert.match(app, /data-tab=["']claude["'][\s\S]{0,500}<ClaudeLogo/);
  assert.doesNotMatch(app, /M11 1h2v7\.17l5\.07-5\.07/, 'temporary starburst Claude tab icon must be removed');
});

test('Overlay tracking is decoupled from activeTab and supports dynamic singleBars for single-window plans', () => {
  const app = read('src/App.tsx');
  const overlay = read('src/components/OverlayApp.tsx');
  const css = read('src/styles.css');

  // Tracking decoupled from activeTab
  assert.match(app, /const isCodexTracked = (?:savedTrackedProvider === ["']codex["'][\s\S]*?)?Boolean\(lastFullStatus\?\.monitoredCodex\)/);
  assert.doesNotMatch(app, /publishOverlayUpdate = useCallback\([\s\S]*?\[activeTab/);

  // Single-window plans (e.g. Free tier monthly) use dynamic singleBars
  assert.match(app, /normalizeCodexUsageWindows\(cache\.rate_limit\)/);
  assert.match(app, /singleBars/);
  assert.match(overlay, /interface OverlaySingleBar/);
  assert.match(overlay, /singleBars\?:\s*OverlaySingleBar\[\]/);
  assert.match(overlay, /data\.singleBars\.map/);

  // Hover does not darken background to dark black ink or override borders
  assert.match(css, /\.glass-card:hover\s*\{[\s\S]*?border-top-color/);
  assert.doesNotMatch(css, /\.glass-card:hover\s*\{[\s\S]*?rgba\(26,\s*32,\s*48/);
});

test('main.tsx and index.html suppress native WebView context menu in production / build versions', () => {
  const indexHtml = read('index.html');
  const mainTsx = read('src/main.tsx');

  assert.match(indexHtml, /contextmenu/);
  assert.match(indexHtml, /preventDefault/);
  assert.match(mainTsx, /import\.meta\.env\.DEV/);
  assert.match(mainTsx, /addEventListener\(\s*["']contextmenu["']/);
});

test('OverlayApp renders liquid glass context menu on right-click with Refresh usage, Open dashboard, and Hide overlay', () => {
  const overlay = read('src/components/OverlayApp.tsx');
  const css = read('src/styles.css');
  const app = read('src/App.tsx');

  // Menu items and actions
  assert.match(overlay, /handleContextMenu/);
  assert.match(overlay, /className="overlay-context-menu"/);
  assert.match(overlay, /<span>Refresh usage<\/span>/);
  assert.match(overlay, /<span>Open dashboard<\/span>/);
  assert.match(overlay, /<span>Hide overlay<\/span>/);

  // Position auto-clamping to avoid screen/container edge
  assert.match(overlay, /menuWidth/);
  assert.match(overlay, /menuHeight/);
  assert.match(overlay, /posX \+ menuWidth >/);
  assert.match(overlay, /posY \+ menuHeight >/);

  // Liquid glass CSS
  assert.match(css, /\.overlay-context-menu\s*\{/);
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?backdrop-filter:\s*blur\(18px\)/);
  assert.match(css, /\.overlay-menu-item\s*\{/);

  // Overlay event wiring in App.tsx
  assert.match(app, /listen\("request-refresh-usage"/);
  assert.match(app, /listen<boolean>\("overlay-visibility-changed"/);
});

test('Rust poll_and_update_tray preserves monitored_codex across polling intervals', () => {
  const lib = read('src-tauri/src/lib.rs');

  assert.match(lib, /async fn poll_and_update_tray/);
  assert.match(lib, /status\.monitored_codex\s*=\s*monitored_codex;/);
  assert.match(lib, /force_refresh[\s\S]*?status\.monitored_codex\s*=\s*state\.monitored_codex\.clone\(\);/);
});

test('Tracked account and provider are persisted to storage and restored on startup', () => {
  const app = read('src/App.tsx');

  // Storage keys
  assert.match(app, /OVERLAY_TRACKED_PROVIDER_KEY\s*=\s*["']quotashift_overlay_tracked_provider["']/);
  assert.match(app, /OVERLAY_TRACKED_ACCOUNT_ID_KEY\s*=\s*["']quotashift_overlay_tracked_account_id["']/);

  // Persistence when tracking accounts
  assert.match(app, /handleTrackAntigravityAccount[\s\S]*?localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']antigravity["']\)/);
  assert.match(app, /handleTrackCodexAccount[\s\S]*?localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']codex["']\)/);

  // Restoration on app startup
  assert.match(app, /const savedTrackedProvider = localStorage\.getItem\(OVERLAY_TRACKED_PROVIDER_KEY\)/);
  assert.match(app, /invoke\("set_monitored_codex"/);
});

test('Overlay refresh button refreshes only the tracked account without triggering full multi-account refresh', () => {
  const overlay = read('src/components/OverlayApp.tsx');
  const app = read('src/App.tsx');

  // OverlayApp passes tracked account info and does not invoke generic force_refresh
  assert.match(overlay, /handleRefreshUsage[\s\S]*?emit\("request-refresh-usage",\s*\{[\s\S]*?provider: data\.provider/);
  assert.doesNotMatch(overlay, /handleRefreshUsage[\s\S]*?invoke\("force_refresh"\)/, 'overlay menu must not invoke broad force_refresh');

  // App.tsx wires request-refresh-usage to targeted refreshTrackedAccountOnly
  assert.match(app, /listen[\s\S]*?"request-refresh-usage"[\s\S]*?refreshTrackedAccountOnly\(event\?\.payload\)/);
  assert.match(app, /const refreshTrackedAccountOnly = async/);
  assert.match(app, /refreshTrackedAccountOnly[\s\S]*?fetchAccountUsage\(targetAcc,\s*true\)/);
  assert.match(app, /refreshTrackedAccountOnly[\s\S]*?refreshAntigravityAccountsCloudFirst\(\[targetAcc\],\s*true\)/);
});

test('Overlay context menu uses compact micro-UI dimensions with matching bounds clamping', () => {
  const css = read('src/styles.css');
  const overlay = read('src/components/OverlayApp.tsx');

  // Compact context menu CSS styling
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?width:\s*108px;/);
  assert.match(css, /\.overlay-context-menu\s*\{[\s\S]*?padding:\s*2px;/);
  assert.match(css, /\.overlay-menu-item\s*\{[\s\S]*?height:\s*18px;/);
  assert.match(css, /\.overlay-menu-item\s*\{[\s\S]*?font-size:\s*8\.5px;/);
  assert.match(css, /\.overlay-menu-item\s*\{[\s\S]*?gap:\s*5px;/);

  // OverlayApp component bounds and 10x10 icons
  assert.match(overlay, /menuWidth\s*=\s*108;/);
  assert.match(overlay, /menuHeight\s*=\s*58;/);
  assert.match(overlay, /<svg\s+width="10"\s+height="10"/);
});

test('Overlay tracking on app startup loads synchronous accounts and preserves cached overlay data without blanking', () => {
  const app = read('src/App.tsx');

  // Synchronous state initialization from storage to avoid initial empty render
  assert.match(app, /useState<AntigravityAccount\[\]>\(\(\)\s*=>\s*loadAntigravityAccounts\(\)\)/);
  assert.match(app, /useState<CodexAccount\[\]>\(\(\)\s*=>\s*loadCodexAccounts\(\)\)/);
  assert.match(app, /useState<string \| null>\(\(\)\s*=>\s*\{[\s\S]*?localStorage\.getItem\(ANTIGRAVITY_ACTIVE_ID_KEY\)/);
  assert.match(app, /useState<string \| null>\(\(\)\s*=>\s*\{[\s\S]*?localStorage\.getItem\(CODEX_ACTIVE_ID_KEY\)/);

  // Cold-start overlay cache preservation in publishOverlayUpdate
  assert.match(app, /let prevOverlayData:\s*OverlayAccountData\s*\|\s*null\s*=\s*null;/);
  assert.match(app, /localStorage\.getItem\(["']quotashift_overlay_data["']\)/);
  assert.match(app, /prevOverlayData\.provider === ["']antigravity["']/);
  assert.match(app, /prevOverlayData\.provider === ["']codex["']/);
});

test('Overlay multi-monitor drag and Win32 clamp preserve position without jumping on right-click', () => {
  const overlay = read('src/components/OverlayApp.tsx');
  const clamp = read('src-tauri/src/overlay_clamp.rs');

  // Multi-monitor queries in OverlayApp
  assert.match(overlay, /availableMonitors\(\)/);
  assert.match(overlay, /setPointerCapture\(e\.pointerId\)/);

  // Win32 clamp only clamps on WM_MOVING and does not overwrite coordinates in WM_WINDOWPOSCHANGING
  assert.match(clamp, /WM_MOVING/);
  assert.match(clamp, /WM_WINDOWPOSCHANGING/);
  assert.match(clamp, /DefSubclassProc\(hwnd,\s*msg,\s*w_param,\s*l_param\)/);
});

test('Overlay avatar image is non-draggable and unselectable to prevent selection ghosting during overlay dragging', () => {
  const overlay = read('src/components/OverlayApp.tsx');
  const css = read('src/styles.css');

  // JSX attribute: img has draggable={false}
  assert.match(overlay, /className="overlay-avatar-img"[\s\S]*?draggable=\{false\}/);

  // CSS attributes: user-select, user-drag, and pointer-events disabled
  assert.match(css, /\.overlay-avatar-wrap\s*\{[\s\S]*?user-select:\s*none;/);
  assert.match(css, /\.overlay-avatar-img\s*\{[\s\S]*?-webkit-user-drag:\s*none;/);
  assert.match(css, /\.overlay-avatar-img\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-avatar-fallback\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test('Overlay logo images and SVGs are non-draggable and unselectable', () => {
  const overlay = read('src/components/OverlayApp.tsx');
  const css = read('src/styles.css');

  // AntigravityLogo img has draggable={false} and non-draggable styles
  assert.match(overlay, /AntigravityLogo[\s\S]*?draggable=\{false\}/);
  assert.match(overlay, /WebkitUserDrag:\s*"none"/);
  assert.match(overlay, /pointerEvents:\s*"none"/);

  // CSS attributes for provider badge and family logos
  assert.match(css, /\.overlay-provider-badge\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-provider-badge img,[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-family-logo\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-family-logo img,[\s\S]*?pointer-events:\s*none;/);
  assert.match(css, /\.overlay-dual-logo\s*\{[\s\S]*?pointer-events:\s*none;/);
});

test('Dashboard monitored pulse icon strictly follows trackedProvider and trackedAccountId', () => {
  const app = read('src/App.tsx');
  const agTab = read('src/components/AntigravityTab.tsx');
  const codexTab = read('src/components/CodexTab.tsx');

  // App.tsx tracks trackedAccountId state and passes to tabs
  assert.match(app, /const \[trackedAccountId, setTrackedAccountId\] = useState<string \| null>/);
  assert.match(app, /<AntigravityTab[\s\S]*?trackedAccountId=\{trackedAccountId\}[\s\S]*?trackedProvider=\{trackedProvider\}/);
  assert.match(app, /<CodexTab[\s\S]*?trackedAccountId=\{trackedAccountId\}[\s\S]*?trackedProvider=\{trackedProvider\}/);

  // AntigravityTab respects trackedProvider and trackedAccountId
  assert.match(agTab, /trackedAccountId\?: string \| null/);
  assert.match(agTab, /effectiveTrackedId = trackedProvider === "antigravity"/);
  assert.match(agTab, /const isMonitoredAg = Boolean\(effectiveTrackedId && acc\.id === effectiveTrackedId\);/);

  // CodexTab respects trackedProvider and trackedAccountId
  assert.match(codexTab, /trackedAccountId\?: string \| null/);
  assert.match(codexTab, /effectiveTrackedId = trackedProvider === "codex"/);
  assert.match(codexTab, /const isMonitored = Boolean\(effectiveTrackedId && acc\.id === effectiveTrackedId\);/);
});


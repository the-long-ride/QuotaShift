import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

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
  // Official Claude logo
  assert.match(code, /const ClaudeLogo/);

  // Dual Claude ~ OpenAI logo format
  assert.match(code, /<ClaudeLogo size=\{12\}\s*\/>/);
  assert.match(code, /className="overlay-logo-sep"/);
  assert.match(code, /<OpenAILogo size=\{12\}\s*\/>/);

  // Centered logo container
  assert.match(code, /className="overlay-family-logo"/);
});

test('OverlayApp adapts width dynamically based on account platform type (Codex 70% of Antigravity)', () => {
  const code = read('src/components/OverlayApp.tsx');

  assert.match(code, /targetWidth = data\.provider === ["']codex["'] \? 238 : 340/);
  assert.match(code, /win\.setSize\(new LogicalSize\(targetWidth, 100\)\)/);
  assert.match(code, /className=\{`overlay-container overlay-container--\$\{data\.provider\}`\}/);
  assert.match(code, /glass-card--\$\{data\.provider\}/);
  assert.match(code, /data-provider=\{data\.provider\}/);
});

test('OverlayApp wires native drag regions, mousedown startDragging fallback, and double-click dashboard opening', () => {
  const code = read('src/components/OverlayApp.tsx');

  assert.match(code, /data-tauri-drag-region/);
  assert.match(code, /handleMouseDown/);
  assert.match(code, /getCurrentWebviewWindow\(\)\.startDragging\(\)/);
  assert.doesNotMatch(code, /e\.preventDefault\(\);/, 'Must not block default event to keep double-click working');
  assert.match(code, /handleDoubleClick/);
  assert.match(code, /invoke\(["']show_dashboard["']\)/);
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

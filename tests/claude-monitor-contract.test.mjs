import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readWithCssImports } from './css-helper.mjs';

const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));
const read = (path) => readWithCssImports(new URL(`../${path}`, import.meta.url));

test('Claude monitor backend is registered and bridge mode runs before Tauri startup', () => {
  assert.equal(exists('src-tauri/src/claude/monitor.rs'), true, 'claude monitor must exist');
  const backend = read('src-tauri/src/claude/monitor.rs');
  const lib = read('src-tauri/src/lib.rs');
  const main = read('src-tauri/src/main.rs');

  assert.match(backend, /pub\s+fn\s+run_claude_statusline_bridge\s*\(/);
  assert.match(backend, /ensure_claude_statusline_bridge/);
  assert.match(backend, /get_claude_monitor_status/);
  assert.match(lib, /claude_monitor/);
  assert.match(lib, /claude_monitor::ensure_claude_statusline_bridge/);
  assert.match(lib, /claude_monitor::get_claude_monitor_status/);
  assert.match(main, /--claude-statusline-bridge/);
  assert.ok(
    main.indexOf('--claude-statusline-bridge') < main.indexOf('tauri_app_lib::run()'),
    'bridge mode must be checked before normal Tauri startup',
  );
});

test('Claude bridge remains local-only and does not introduce Claude auth or remote service access', () => {
  const backend = read('src-tauri/src/claude/monitor.rs');
  assert.doesNotMatch(backend, /api\.anthropic\.com|claude\.ai\//i);
  assert.doesNotMatch(backend, /access[_-]?token|refresh[_-]?token|cookie|authorization/i);
  assert.match(backend, /statusLine/);
  assert.match(backend, /claude-session\.json/);
});

test('App exposes a third Claude main tab and polls only local Claude monitor status', () => {
  const app = read('src/App.tsx');
  assert.match(app, /useState<"antigravity" \| "codex" \| "claude">/);
  assert.match(app, /ensure_claude_statusline_bridge/);
  assert.match(app, /get_claude_monitor_status/);
  assert.match(app, /setInterval\([\s\S]{0,240}2000/);
  assert.match(app, /activeTab === "claude"/);
  assert.match(app, /<ClaudeTab\s+status=\{claudeMonitorStatus\}/);
});

test('ClaudeTab is read-only and contains no account-management controls', () => {
  assert.equal(exists('src/components/claude/ClaudeTab.tsx'), true, 'ClaudeTab.tsx must exist');
  const tab = read('src/components/claude/ClaudeTab.tsx');
  assert.match(tab, /ClaudeMonitorStatus/);
  assert.match(tab, /5-hour|5 hour|5 Hour/i);
  assert.match(tab, /7-day|7 day|Weekly/i);
  assert.match(tab, /Context/i);
  assert.match(tab, /Session/i);
  assert.doesNotMatch(tab, /Add Account|onAddAccount|switch account|onApply|Apply best|onDelete|onRename|login/i);
});

test('Claude types and scoped styles are present', () => {
  const types = read('src/utils/common/types.ts');
  const styles = read('src/styles.css');
  assert.match(types, /interface ClaudeRateLimitWindow/);
  assert.match(types, /interface ClaudeSessionSnapshot/);
  assert.match(types, /interface ClaudeMonitorStatus/);
  assert.match(styles, /\.claude-monitor/);
  assert.match(styles, /\.claude-usage-grid/);
  assert.match(styles, /\.claude-stat-grid/);
});

test('Claude snapshot persistence stores only normalized monitoring fields and uses atomic local writes', () => {
  const backend = read('src-tauri/src/claude/monitor.rs');
  assert.match(backend, /write_atomic/);
  assert.match(backend, /let\s+snapshot\s*=\s*normalize_payload/);
  assert.match(backend, /serde_json::to_vec_pretty\(&snapshot\)/);
  assert.doesNotMatch(backend, /fs::write\(&path,\s*raw\.as_bytes\(\)\)/);
});

test('Claude monitor exposes hybrid local transcript usage without reading conversation content', () => {
  const backend = read('src-tauri/src/claude/monitor.rs');
  const types = read('src/utils/common/types.ts');
  const tab = read('src/components/claude/ClaudeTab.tsx');

  assert.match(backend, /scan_local_transcripts_at/);
  assert.match(backend, /~?\.claude|join\("\.claude"\)/);
  const recordStart = backend.indexOf('struct LocalTranscriptRecord');
  const recordEnd = backend.indexOf('struct LocalAssistantMessage');
  assert.ok(recordStart >= 0 && recordEnd > recordStart, 'narrow transcript structs must exist');
  assert.doesNotMatch(backend.slice(recordStart, recordEnd), /content\s*:/i);

  assert.match(types, /type ClaudeMonitorSource\s*=\s*"statusLine"\s*\|\s*"localTranscript"\s*\|\s*"none"/);
  assert.match(types, /interface ClaudeObservedUsageWindow/);
  assert.match(types, /interface ClaudeObservedUsage/);
  assert.match(types, /localUsage:\s*ClaudeObservedUsage\s*\|\s*null/);

  assert.match(tab, /Local activity/i);
  assert.match(tab, /processed tokens/i);
  assert.match(tab, /Exact Claude plan-limit percentages/i);
  assert.doesNotMatch(tab, /current session will appear after Claude Code emits its next status update/i);
});

test('Claude monitor extracts CLI usage fallback and replaces model name with Claude Sonnet  5', () => {
  const backend = read('src-tauri/src/claude/monitor.rs');
  const tab = read('src/components/claude/ClaudeTab.tsx');

  assert.match(backend, /pub\s+fn\s+extract_cli_usage_from_output\s*\(/);
  assert.match(backend, /pub\s+fn\s+run_claude_cli_usage\s*\(/);
  assert.match(backend, /pub\s+fn\s+format_claude_model_name\s*\(/);
  assert.match(backend, /"claude-sonnet-5"/);
  assert.match(backend, /"Claude Sonnet  5"/);

  assert.match(tab, /formatClaudeModelName/);
  assert.match(tab, /"Claude Sonnet  5"/);
});

test('ClaudeTab exposes Track Claude button and wires local session tracking to desktop overlay', () => {
  const tab = read('src/components/claude/ClaudeTab.tsx');
  const app = read('src/App.tsx');
  const overlay = read('src/components/overlay/OverlayApp.tsx');
  const styles = read('src/styles.css');

  // ClaudeTab button and props
  assert.match(tab, /isTracked\?:\s*boolean/);
  assert.match(tab, /onTrackClaude\?:\s*\(\)\s*=>\s*void/);
  assert.match(tab, /Track Claude/);
  assert.match(tab, /claude-track-btn/);

  // App.tsx handles tracking Claude and publishing to overlay
  assert.match(app, /handleTrackClaude/);
  assert.match(app, /localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']claude["']\)/);
  assert.match(app, /localStorage\.setItem\(OVERLAY_TRACKED_ACCOUNT_ID_KEY,\s*["']claude-local["']\)/);
  assert.match(app, /provider:\s*["']claude["']/);
  assert.match(app, /<ClaudeTab[\s\S]*?isTracked=\{trackedProvider === ["']claude["']\}[\s\S]*?onTrackClaude=\{handleTrackClaude\}/);

  // OverlayApp supports Claude provider and logo in provider badge
  assert.match(overlay, /provider:\s*["']antigravity["']\s*\|\s*["']codex["']\s*\|\s*["']claude["']/);
  assert.match(overlay, /data\.provider === ["']claude["']\s*\?\s*\(\s*<ClaudeLogo size=\{10\}/);

  // CSS styling for Claude track button and overlay sizing
  assert.match(styles, /\.claude-track-btn/);
  assert.match(styles, /\.glass-card--claude/);
});

test('Claude monitor spawns CLI usage and shell commands silently on Windows without flashing console windows', () => {
  const backend = read('src-tauri/src/claude/monitor.rs');

  // CommandExt imported on Windows
  assert.match(backend, /#\[cfg\(target_os\s*=\s*"windows"\)\]\s*use\s+std::os::windows::process::CommandExt;/);

  // run_shell_command suppresses console window
  assert.match(backend, /run_shell_command[\s\S]*?creation_flags\(0x08000000\)/);

  // run_claude_cli_usage suppresses console window
  assert.match(backend, /run_claude_cli_usage[\s\S]*?creation_flags\(0x08000000\)/);
});



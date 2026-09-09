import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Claude monitor backend is registered and bridge mode runs before Tauri startup', () => {
  assert.equal(exists('src-tauri/src/claude_monitor.rs'), true, 'claude_monitor.rs must exist');
  const backend = read('src-tauri/src/claude_monitor.rs');
  const lib = read('src-tauri/src/lib.rs');
  const main = read('src-tauri/src/main.rs');

  assert.match(backend, /pub\s+fn\s+run_claude_statusline_bridge\s*\(/);
  assert.match(backend, /ensure_claude_statusline_bridge/);
  assert.match(backend, /get_claude_monitor_status/);
  assert.match(lib, /mod\s+claude_monitor\s*;/);
  assert.match(lib, /claude_monitor::ensure_claude_statusline_bridge/);
  assert.match(lib, /claude_monitor::get_claude_monitor_status/);
  assert.match(main, /--claude-statusline-bridge/);
  assert.ok(
    main.indexOf('--claude-statusline-bridge') < main.indexOf('tauri_app_lib::run()'),
    'bridge mode must be checked before normal Tauri startup',
  );
});

test('Claude bridge remains local-only and does not introduce Claude auth or remote service access', () => {
  const backend = read('src-tauri/src/claude_monitor.rs');
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
  assert.equal(exists('src/components/ClaudeTab.tsx'), true, 'ClaudeTab.tsx must exist');
  const tab = read('src/components/ClaudeTab.tsx');
  assert.match(tab, /ClaudeMonitorStatus/);
  assert.match(tab, /5-hour|5 hour|5 Hour/i);
  assert.match(tab, /7-day|7 day|Weekly/i);
  assert.match(tab, /Context/i);
  assert.match(tab, /Session/i);
  assert.doesNotMatch(tab, /Add Account|onAddAccount|switch account|onApply|Apply best|onDelete|onRename|login/i);
});

test('Claude types and scoped styles are present', () => {
  const types = read('src/utils/types.ts');
  const styles = read('src/styles.css');
  assert.match(types, /interface ClaudeRateLimitWindow/);
  assert.match(types, /interface ClaudeSessionSnapshot/);
  assert.match(types, /interface ClaudeMonitorStatus/);
  assert.match(styles, /\.claude-monitor/);
  assert.match(styles, /\.claude-usage-grid/);
  assert.match(styles, /\.claude-stat-grid/);
});

test('Claude snapshot persistence stores only normalized monitoring fields and uses atomic local writes', () => {
  const backend = read('src-tauri/src/claude_monitor.rs');
  assert.match(backend, /write_atomic/);
  assert.match(backend, /let\s+snapshot\s*=\s*normalize_payload/);
  assert.match(backend, /serde_json::to_vec_pretty\(&snapshot\)/);
  assert.doesNotMatch(backend, /fs::write\(&path,\s*raw\.as_bytes\(\)\)/);
});

test('Claude monitor exposes hybrid local transcript usage without reading conversation content', () => {
  const backend = read('src-tauri/src/claude_monitor.rs');
  const types = read('src/utils/types.ts');
  const tab = read('src/components/ClaudeTab.tsx');

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
  const backend = read('src-tauri/src/claude_monitor.rs');
  const tab = read('src/components/ClaudeTab.tsx');

  assert.match(backend, /pub\s+fn\s+extract_cli_usage_from_output\s*\(/);
  assert.match(backend, /pub\s+fn\s+run_claude_cli_usage\s*\(/);
  assert.match(backend, /pub\s+fn\s+format_claude_model_name\s*\(/);
  assert.match(backend, /"claude-sonnet-5"/);
  assert.match(backend, /"Claude Sonnet  5"/);

  assert.match(tab, /formatClaudeModelName/);
  assert.match(tab, /"Claude Sonnet  5"/);
});


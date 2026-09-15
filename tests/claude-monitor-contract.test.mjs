import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readWithCssImports } from "./css-helper.mjs";
import {
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_STOP_THRESHOLD_KEY,
  CLAUDE_WEEKLY_STOP_ENABLED_KEY,
  CLAUDE_WEEKLY_STOP_THRESHOLD_KEY,
  DEFAULT_CLAUDE_POLL_INTERVAL_SECS,
  loadClaudePreferences,
  saveClaudePreferences,
  sanitizeClaudePollInterval,
  sanitizeClaudeStopThreshold,
} from "../.test-build/common/claude-preferences.js";

const exists = (path) => fs.existsSync(new URL(`../${path}`, import.meta.url));
const read = (path) => readWithCssImports(new URL(`../${path}`, import.meta.url));

function createMockStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

test("Claude monitor backend is registered and bridge mode runs before Tauri startup", () => {
  assert.equal(exists("src-tauri/src/claude/monitor.rs"), true, "claude monitor must exist");
  const backend = read("src-tauri/src/claude/monitor.rs");
  const lib = read("src-tauri/src/lib.rs");
  const main = read("src-tauri/src/main.rs");

  assert.match(backend, /pub\s+fn\s+run_claude_statusline_bridge\s*\(/);
  assert.match(backend, /ensure_claude_statusline_bridge/);
  assert.match(backend, /get_claude_monitor_status/);
  assert.match(lib, /claude_monitor/);
  assert.match(lib, /claude_monitor::ensure_claude_statusline_bridge/);
  assert.match(lib, /claude_monitor::get_claude_monitor_status/);
  assert.match(main, /--claude-statusline-bridge/);
  assert.ok(
    main.indexOf("--claude-statusline-bridge") < main.indexOf("tauri_app_lib::run()"),
    "bridge mode must be checked before normal Tauri startup",
  );
});

test("Claude bridge remains local-only and does not introduce Claude auth or remote service access", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  assert.doesNotMatch(backend, /api\.anthropic\.com|claude\.ai\//i);
  assert.doesNotMatch(backend, /access[_-]?token|refresh[_-]?token|cookie|authorization/i);
  assert.match(backend, /statusLine/);
  assert.match(backend, /claude-session\.json/);
});

test("App keeps the existing Claude wiring while useClaudeMonitor enforces split guardrails", () => {
  const app = read("src/App.tsx");
  const hook = read("src/hooks/useClaudeMonitor.ts");

  assert.match(app, /useState<"antigravity" \| "codex" \| "claude">/);
  assert.match(app, /useClaudeMonitor\(showToast\)/);
  assert.match(app, /activeTab === "claude"/);
  assert.match(app, /<ClaudeTab\s+status=\{claudeMonitorStatus\}/);
  assert.match(app, /claudePollIntervalSecs=\{claudePollIntervalSecs\}/);
  assert.match(app, /claudeStopThresholdPct=\{claudeStopThresholdPct\}/);
  assert.match(app, /onClaudePollIntervalChange=\{handleClaudePollIntervalChange\}/);
  assert.match(app, /onClaudeStopThresholdChange=\{handleClaudeStopThresholdChange\}/);

  assert.match(hook, /ensure_claude_statusline_bridge/);
  assert.match(hook, /get_claude_monitor_status/);
  assert.match(hook, /setInterval\(tick,\s*ms\)/);
  assert.match(hook, /kill_claude_processes/);
  assert.match(hook, /preferences\.fiveHour\.enabled/);
  assert.match(hook, /preferences\.weekly\.enabled/);
  assert.match(hook, /loadClaudePreferences\(\)/);
});

test("Claude poll rate defaults to 20 seconds and allows 5 seconds through 20 minutes", () => {
  assert.equal(DEFAULT_CLAUDE_POLL_INTERVAL_SECS, 20);
  assert.equal(sanitizeClaudePollInterval(1), 5);
  assert.equal(sanitizeClaudePollInterval(20), 20);
  assert.equal(sanitizeClaudePollInterval(1201), 1200);
  assert.equal(sanitizeClaudePollInterval("25"), 25);
  assert.equal(sanitizeClaudePollInterval("invalid"), 20);

  const legacyStorage = createMockStorage({ [CLAUDE_POLL_INTERVAL_KEY]: "2" });
  assert.equal(loadClaudePreferences(legacyStorage).pollIntervalSecs, 5);
});

test("Claude guardrails persist independent 5-hour and weekly switches and thresholds", () => {
  assert.equal(sanitizeClaudeStopThreshold(-1), 1);
  assert.equal(sanitizeClaudeStopThreshold(98), 98);
  assert.equal(sanitizeClaudeStopThreshold(101), 100);

  const storage = createMockStorage();
  const defaults = loadClaudePreferences(storage);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.fiveHour.enabled, false);
  assert.equal(defaults.weekly.enabled, false);
  assert.equal(defaults.fiveHour.thresholdPct, 98);
  assert.equal(defaults.weekly.thresholdPct, 98);

  const preferences = {
    pollIntervalSecs: 20,
    enabled: true,
    fiveHour: { enabled: true, thresholdPct: 96 },
    weekly: { enabled: false, thresholdPct: 92 },
  };
  saveClaudePreferences(preferences, storage);
  assert.equal(storage.getItem(CLAUDE_GUARDRAILS_ENABLED_KEY), "true");
  assert.equal(storage.getItem(CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY), "true");
  assert.equal(storage.getItem(CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY), "true");
  assert.equal(storage.getItem(CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY), "96");
  assert.equal(storage.getItem(CLAUDE_WEEKLY_STOP_ENABLED_KEY), "false");
  assert.equal(storage.getItem(CLAUDE_WEEKLY_STOP_THRESHOLD_KEY), "92");
  assert.deepEqual(loadClaudePreferences(storage), preferences);
});

test("Claude guardrails migrate the legacy single threshold to both windows", () => {
  const storage = createMockStorage({ [CLAUDE_STOP_THRESHOLD_KEY]: "97" });
  const preferences = loadClaudePreferences(storage);
  assert.equal(preferences.enabled, true);
  assert.deepEqual(preferences.fiveHour, { enabled: true, thresholdPct: 97 });
  assert.deepEqual(preferences.weekly, { enabled: true, thresholdPct: 97 });
});

test("Claude guardrails preserve a legacy master-off state until a window is explicitly enabled", () => {
  const storage = createMockStorage({
    [CLAUDE_GUARDRAILS_ENABLED_KEY]: "false",
    [CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY]: "true",
    [CLAUDE_WEEKLY_STOP_ENABLED_KEY]: "true",
  });
  const preferences = loadClaudePreferences(storage);
  assert.equal(preferences.enabled, false);
  assert.equal(preferences.fiveHour.enabled, false);
  assert.equal(preferences.weekly.enabled, false);
});

test("Claude guardrail controls expose independent 5-hour and weekly switches without a master switch", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const styles = read("src/styles.css");

  assert.match(controls, /Claude guardrails/);
  assert.match(controls, /5-hour stop %/);
  assert.match(controls, /Weekly stop %/);
  assert.match(controls, /role="switch"/);
  assert.match(controls, /Recommended 15–30s/);
  assert.doesNotMatch(controls, /label="Enable Claude guardrails"/);
  assert.doesNotMatch(controls, /disabled=\{!preferences\.enabled\}/);
  assert.match(controls, /codex-pool-switch/);
  assert.doesNotMatch(styles, /\.claude-guardrail-switch/);
});

test("Claude tab uses neutral tab styling without a Claude-specific logo or active-border color", () => {
  const styles = read("src/styles.css");
  assert.doesNotMatch(styles, /\.tab-btn\[data-tab="claude"\][\s\S]{0,120}border-bottom-color/);
  assert.doesNotMatch(styles, /\.tab-btn\[data-tab="claude"\][\s\S]{0,180}\.tab-brand-icon[\s\S]{0,80}color:/);
});

test("Claude auto-stop counts only successful targeted process kills", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const hook = read("src/hooks/useClaudeMonitor.ts");

  assert.match(process, /if\s+process\.kill\(\)\s*\{/);
  assert.doesNotMatch(process, /taskkill[\s\S]{0,180}\/[Ii][Mm]/);
  assert.match(process, /#\[serde\(rename_all\s*=\s*"camelCase"\)\]/);
  assert.doesNotMatch(hook, /no running Claude processes found/i);
});

test("ClaudeTab is read-only and contains no account-management controls", () => {
  assert.equal(exists("src/components/claude/ClaudeTab.tsx"), true, "ClaudeTab.tsx must exist");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  assert.match(tab, /ClaudeMonitorStatus/);
  assert.match(tab, /5-hour|5 hour|5 Hour/i);
  assert.match(tab, /7-day|7 day|Weekly/i);
  assert.match(tab, /Context/i);
  assert.match(tab, /Session/i);
  assert.doesNotMatch(tab, /Add Account|onAddAccount|switch account|onApply|Apply best|onDelete|onRename|login/i);
});

test("Claude types and scoped styles are present", () => {
  const types = read("src/utils/common/types.ts");
  const styles = read("src/styles.css");
  assert.match(types, /interface ClaudeRateLimitWindow/);
  assert.match(types, /interface ClaudeSessionSnapshot/);
  assert.match(types, /interface ClaudeMonitorStatus/);
  assert.match(styles, /\.claude-monitor/);
  assert.match(styles, /\.claude-usage-grid/);
  assert.match(styles, /\.claude-stat-grid/);
});

test("Claude snapshot persistence stores only normalized monitoring fields and uses atomic local writes", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  assert.match(backend, /write_atomic/);
  assert.match(backend, /let\s+snapshot\s*=\s*normalize_payload/);
  assert.match(backend, /serde_json::to_vec_pretty\(&snapshot\)/);
  assert.doesNotMatch(backend, /fs::write\(&path,\s*raw\.as_bytes\(\)\)/);
});

test("Claude monitor exposes hybrid local transcript usage without reading conversation content", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  const types = read("src/utils/common/types.ts");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const parts = read("src/components/claude/ClaudeParts.tsx");

  assert.match(backend, /scan_local_transcripts_at/);
  assert.match(backend, /~?\.claude|join\("\.claude"\)/);
  const recordStart = backend.indexOf("struct LocalTranscriptRecord");
  const recordEnd = backend.indexOf("struct LocalAssistantMessage");
  assert.ok(recordStart >= 0 && recordEnd > recordStart, "narrow transcript structs must exist");
  assert.doesNotMatch(backend.slice(recordStart, recordEnd), /content\s*:/i);

  assert.match(types, /type ClaudeMonitorSource\s*=\s*"statusLine"\s*\|\s*"localTranscript"\s*\|\s*"none"/);
  assert.match(types, /interface ClaudeObservedUsageWindow/);
  assert.match(types, /interface ClaudeObservedUsage/);
  assert.match(types, /localUsage:\s*ClaudeObservedUsage\s*\|\s*null/);

  assert.match(tab, /Local activity/i);
  assert.match(parts, /processed tokens/i);
  assert.match(tab, /Exact Claude plan-limit percentages/i);
  assert.doesNotMatch(tab, /current session will appear after Claude Code emits its next status update/i);
});

test("Claude monitor extracts CLI usage fallback and replaces model name with Claude Sonnet  5", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const parts = read("src/components/claude/ClaudeParts.tsx");

  assert.match(backend, /pub\s+fn\s+extract_cli_usage_from_output\s*\(/);
  assert.match(backend, /pub\s+fn\s+run_claude_cli_usage\s*\(/);
  assert.match(backend, /pub\s+fn\s+format_claude_model_name\s*\(/);
  assert.match(backend, /"claude-sonnet-5"/);
  assert.match(backend, /"Claude Sonnet  5"/);

  assert.match(tab, /formatClaudeModelName/);
  assert.match(parts, /"Claude Sonnet  5"/);
});

test("ClaudeTab exposes Track Claude button and wires local session tracking to desktop overlay", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const app = read("src/App.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const styles = read("src/styles.css");

  assert.match(tab, /isTracked\?:\s*boolean/);
  assert.match(tab, /onTrackClaude\?:\s*\(\)\s*=>\s*void/);
  assert.match(tab, /Track Claude/);
  assert.match(tab, /claude-track-btn/);

  assert.match(app, /handleTrackClaude/);
  assert.match(app, /localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*["']claude["']\)/);
  assert.match(app, /localStorage\.setItem\(OVERLAY_TRACKED_ACCOUNT_ID_KEY,\s*["']claude-local["']\)/);
  assert.match(app, /provider:\s*["']claude["']/);
  assert.match(app, /<ClaudeTab[\s\S]*?isTracked=\{trackedProvider === ["']claude["']\}[\s\S]*?onTrackClaude=\{handleTrackClaude\}/);

  assert.match(overlay, /provider:\s*["']antigravity["']\s*\|\s*["']codex["']\s*\|\s*["']claude["']/);
  assert.match(overlay, /data\.provider === ["']claude["'][\s\S]{0,180}<ClaudeLogo size=\{22\}/);

  assert.match(styles, /\.claude-track-btn/);
  assert.match(styles, /\.glass-card--claude/);
});

test("Claude monitor spawns CLI usage and shell commands silently on Windows without flashing console windows", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");

  assert.match(backend, /#\[cfg\(target_os\s*=\s*"windows"\)\]\s*use\s+std::os::windows::process::CommandExt;/);
  assert.match(backend, /run_shell_command[\s\S]*?creation_flags\(0x08000000\)/);
  assert.match(backend, /run_claude_cli_usage[\s\S]*?creation_flags\(0x08000000\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { readWithCssImports } from "./css-helper.mjs";
import {
  CLAUDE_AUTO_RESUME_AT_RESET_KEY,
  CLAUDE_FIVE_HOUR_STOP_ENABLED_KEY,
  CLAUDE_FIVE_HOUR_STOP_THRESHOLD_KEY,
  CLAUDE_GUARDRAILS_ENABLED_KEY,
  CLAUDE_GUARDRAILS_WINDOW_DRIVEN_KEY,
  CLAUDE_POLL_INTERVAL_KEY,
  CLAUDE_PREFERENCES_CHANGED_EVENT,
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
const read = (path) => {
  const content = readWithCssImports(new URL(`../${path}`, import.meta.url));
  if (path === "src/components/overlay/OverlayApp.tsx") {
    const cardPath = new URL("../src/components/overlay/OverlayCard.tsx", import.meta.url);
    return content + (fs.existsSync(cardPath) ? readWithCssImports(cardPath) : "");
  }
  return content;
};

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
  const accountHook = read("src/hooks/useClaudeAccountMonitor.ts");
  const resumeHook = read("src/hooks/useClaudeAccountResume.ts");
  const guardrails = read("src/utils/claude/claude-guardrails.ts");

  assert.match(app, /useState<"antigravity" \| "codex" \| "claude">/);
  assert.match(app, /useClaudeMonitor\(showToast, platformVisibility\.claude, idlePollInterval\)/);
  assert.match(app, /activeTab === "claude"/);
  assert.match(app, /<ClaudeTab\s+status=\{claudeMonitorStatus\}/);
  assert.match(app, /claudePollIntervalSecs=\{claudePollIntervalSecs\}/);
  assert.match(app, /claudeStopThresholdPct=\{claudeStopThresholdPct\}/);
  assert.match(app, /onClaudePollIntervalChange=\{handleClaudePollIntervalChange\}/);
  assert.match(app, /onClaudeStopThresholdChange=\{handleClaudeStopThresholdChange\}/);

  assert.match(hook, /ensure_claude_statusline_bridge/);
  assert.doesNotMatch(hook, /get_claude_monitor_status/);
  assert.match(hook, /useClaudeAccountMonitor/);
  assert.doesNotMatch(hook, /window\.setInterval/);
  assert.match(accountHook, /claudeAdaptivePollIntervalSecs/);
  assert.match(accountHook, /window\.setTimeout/);
  assert.match(accountHook, /claude-account-usage-updated/);
  assert.match(accountHook, /maxAgeSecs/);
  assert.doesNotMatch(accountHook, /activeRequestRef|pendingForceRef/);
  assert.doesNotMatch(hook + accountHook, /invoke[^\n]*kill_claude_processes/);
  assert.match(accountHook, /suspend_claude_account_processes/);
  assert.match(resumeHook, /resume_claude_account_processes/);
  assert.match(guardrails, /preferences\.fiveHour\.enabled/);
  assert.match(guardrails, /preferences\.weekly\.enabled/);
  assert.match(accountHook, /loadClaudePreferences\(\)/);
});

test("Claude platform visibility is a hard feature gate for frontend and backend workers", () => {
  const hook = read("src/hooks/useClaudeMonitor.ts");
  const accountHook = read("src/hooks/useClaudeAccountMonitor.ts");
  const scheduler = read("src-tauri/src/claude/monitor/usage_scheduler.rs");
  const schedulerControl = read("src-tauri/src/claude/monitor/usage_scheduler/control.rs");
  const autoResume = read("src-tauri/src/claude/process/auto_resume.rs");
  const lib = read("src-tauri/src/lib.rs");

  assert.match(hook, /set_claude_features_enabled/);
  assert.match(hook, /enabled:\s*platformVisible/);
  assert.match(hook, /if \(!platformVisible\) return;/);
  assert.match(accountHook, /if \(!platformVisible\) return accountStatusesRef\.current/);
  assert.match(accountHook, /if \(!platformVisible\) return;/);
  assert.match(scheduler, /enabled:\s*Arc<AtomicBool>/);
  assert.match(schedulerControl, /if !self\.is_enabled\(\) \{[\s\S]*return;/);
  assert.match(autoResume, /if scheduler\.is_enabled\(\)/);
  assert.match(lib, /claude_monitor::set_claude_features_enabled/);
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

test("Claude Code guardrails persist independent 5-hour and weekly switches and thresholds", () => {
  assert.equal(sanitizeClaudeStopThreshold(-1), 1);
  assert.equal(sanitizeClaudeStopThreshold(98), 98);
  assert.equal(sanitizeClaudeStopThreshold(101), 100);

  const storage = createMockStorage();
  const defaults = loadClaudePreferences(storage);
  assert.equal(defaults.enabled, false);
  assert.equal(defaults.fiveHour.enabled, false);
  assert.equal(defaults.weekly.enabled, false);
  assert.equal(defaults.fiveHour.thresholdPct, 95);
  assert.equal(defaults.weekly.thresholdPct, 98);

  const preferences = {
    pollIntervalSecs: 20,
    enabled: true,
    autoResumeAtReset: false,
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

test("Claude preference save reports storage failure and still publishes in-session state", () => {
  const preferences = loadClaudePreferences(createMockStorage());
  assert.equal(saveClaudePreferences(preferences, createMockStorage()), true);

  const previousWindow = globalThis.window;
  const fakeWindow = new EventTarget();
  let published = null;
  fakeWindow.addEventListener(CLAUDE_PREFERENCES_CHANGED_EVENT, (event) => {
    published = event.detail;
  });
  globalThis.window = fakeWindow;

  try {
    const next = {
      ...preferences,
      fiveHour: { ...preferences.fiveHour, enabled: true },
    };
    assert.equal(
      saveClaudePreferences(next, {
        setItem() {
          throw new Error("storage unavailable");
        },
      }),
      false,
    );
    assert.equal(published.fiveHour.enabled, true);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }

  const monitorHook = read("src/hooks/useClaudeMonitor.ts");
  assert.match(monitorHook, /event instanceof CustomEvent/);
  assert.match(monitorHook, /event\.detail/);
});

test("Claude auto-resume-at-reset defaults off and persists independently", () => {
  const storage = createMockStorage();
  const defaults = loadClaudePreferences(storage);
  assert.equal(defaults.autoResumeAtReset, false);

  saveClaudePreferences({ ...defaults, autoResumeAtReset: true }, storage);
  const stored = loadClaudePreferences(storage);
  assert.equal(stored.autoResumeAtReset, true);
  assert.equal(stored.fiveHour.enabled, false);
  assert.equal(stored.weekly.enabled, false);
  assert.equal(storage.getItem(CLAUDE_AUTO_RESUME_AT_RESET_KEY), "true");
});

test("Claude Code guardrails migrate the legacy single threshold to both windows", () => {
  const storage = createMockStorage({ [CLAUDE_STOP_THRESHOLD_KEY]: "97" });
  const preferences = loadClaudePreferences(storage);
  assert.equal(preferences.enabled, true);
  assert.deepEqual(preferences.fiveHour, { enabled: true, thresholdPct: 97 });
  assert.deepEqual(preferences.weekly, { enabled: true, thresholdPct: 97 });
});

test("Claude Code guardrails preserve a legacy master-off state until a window is explicitly enabled", () => {
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

  assert.match(controls, /Claude Code guardrails/);
  assert.match(controls, /5-hour suspend %/);
  assert.match(controls, /Weekly suspend %/);
  assert.match(controls, /role="switch"/);
  assert.match(controls, /Recommended 15–30s/);
  assert.match(controls, /Auto-resume at quota reset/);
  assert.match(controls, /both guardrails turn off/);
  assert.match(controls, /same suspended process/);
  assert.doesNotMatch(controls, /label="Enable Claude Code guardrails"/);
  assert.doesNotMatch(controls, /disabled=\{!preferences\.enabled\}/);
  assert.match(controls, /codex-pool-switch/);
  assert.doesNotMatch(styles, /\.claude-guardrail-switch/);
});

test("Claude guardrail primary row gives auto-resume two thirds and poll controls one third", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const styles = read("src/styles/claude.css");

  assert.match(controls, /className="claude-guardrail-primary-row"/);
  assert.match(controls, /className="claude-auto-resume-group"/);
  assert.match(controls, /className="claude-poll-copy"/);
  assert.match(
    controls,
    /claude-auto-resume-group[\s\S]*Auto-resume at quota reset[\s\S]*<GuardrailSwitch/,
  );
  assert.match(
    controls,
    /claude-poll-copy[\s\S]*Poll rate[\s\S]*Recommended 15–30s[\s\S]*claude-control-input/,
  );
  assert.match(controls, /claude-control-label--active/);
  assert.match(styles, /\.claude-control-label--active/);
  assert.doesNotMatch(controls, /className="claude-auto-resume-row"/);
  assert.match(
    styles,
    /\.claude-guardrail-primary-row\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 2fr\) minmax\(0, 1fr\);/,
  );
  assert.match(
    styles,
    /\.claude-auto-resume-group\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;/,
  );
  assert.match(
    styles,
    /\.claude-poll-control--inline\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    styles,
    /\.claude-poll-copy\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*align-items:\s*flex-start;/,
  );
  assert.match(
    styles,
    /\.claude-control-field\.claude-poll-control--inline\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    styles,
    /\.claude-poll-control--inline \.claude-control-input\s*\{[\s\S]*width:\s*7ch;/,
  );
});

test("collapsed Claude guardrail summary includes auto-resume toggle state", () => {
  const controls = read("src/components/claude/ClaudeControls.tsx");

  assert.match(controls, /Auto-resume:\s*\$\{preferences\.autoResumeAtReset \? "on" : "off"\}/);
  assert.match(controls, /!detailsExpanded && getCollapsedGuardrailDescription\(preferences\)/);
});

test("Claude guardrail suspension is wired to native and in-app notification paths", () => {
  const packageJson = read("package.json");
  const cargo = read("src-tauri/Cargo.toml");
  const capabilities = read("src-tauri/capabilities/default.json");
  const lib = read("src-tauri/src/lib.rs");
  const helper = read("src/utils/claude/claude-guardrail-notification.ts");
  const hook = read("src/hooks/useClaudeAccountMonitor.ts");

  assert.match(packageJson, /@tauri-apps\/plugin-notification/);
  assert.match(cargo, /tauri-plugin-notification/);
  assert.match(capabilities, /notification:default/);
  assert.match(lib, /tauri_plugin_notification::init\(\)/);
  assert.match(helper, /isPermissionGranted/);
  assert.match(helper, /requestPermission/);
  assert.match(helper, /sendNotification/);
  assert.match(hook, /notifyClaudeGuardrailSuspension/);
  assert.match(hook, /showToast\(message, "warning"\)/);
  assert.match(hook, /Claude Code guardrails are now off/);
});

test("Claude tab uses neutral tab styling without a Claude-specific logo or active-border color", () => {
  const styles = read("src/styles.css");
  assert.doesNotMatch(styles, /\.tab-btn\[data-tab="claude"\][\s\S]{0,120}border-bottom-color/);
  assert.doesNotMatch(
    styles,
    /\.tab-btn\[data-tab="claude"\][\s\S]{0,180}\.tab-brand-icon[\s\S]{0,80}color:/,
  );
});

test("Claude guardrails use account-scoped suspend/resume instead of process termination", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const native = read("src-tauri/src/claude/process/native.rs");
  const classify = read("src-tauri/src/claude/process/classify.rs");
  const hook = read("src/hooks/useClaudeAccountMonitor.ts");
  const resumeHook = read("src/hooks/useClaudeAccountResume.ts");

  assert.match(process, /suspend_claude_account_processes/);
  assert.match(process, /resume_claude_account_processes/);
  assert.match(native, /NtSuspendProcess/);
  assert.match(native, /NtResumeProcess/);
  assert.match(classify, /is_claude_usage_probe/);
  assert.match(hook, /"suspend_claude_account_processes"/);
  assert.match(resumeHook, /"resume_claude_account_processes"/);
  assert.doesNotMatch(hook, /kill_claude_processes|process\.kill\(/);
});

test("ClaudeTab keeps usage-only account cards without switching or credential actions", () => {
  assert.equal(exists("src/components/claude/ClaudeTab.tsx"), true, "ClaudeTab.tsx must exist");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");

  assert.match(tab, /ClaudeMonitorStatus/);
  assert.match(tab, /ClaudeAccountCards/);
  assert.match(cards, /fullLabel="5h"/);
  assert.match(cards, /fullLabel="Weekly"/);
  assert.match(cards, /MonitoredHeartbeatIcon/);
  assert.doesNotMatch(cards, /ClaudeAccountDetails|aria-expanded|claude-account-monitor-btn/);
  assert.doesNotMatch(tab + cards, /switch account|onApply|Apply best|onDelete|onRename|login/i);
});

test("Claude types and scoped styles are present", () => {
  const types = read("src/utils/common/types.ts");
  const accountTypes = read("src/utils/claude/claude-account-types.ts");
  const styles = read("src/styles.css");
  assert.match(types, /interface ClaudeRateLimitWindow/);
  assert.match(types, /interface ClaudeSessionSnapshot/);
  assert.match(types, /interface ClaudeMonitorStatus/);
  assert.match(accountTypes, /interface ClaudeAccountUsageStatus/);
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

test("Claude transcript monitor infrastructure remains narrow but is no longer polled by account cards", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  const accounts = read("src-tauri/src/claude/accounts.rs");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");

  assert.match(backend, /scan_local_transcripts_at/);
  const recordStart = backend.indexOf("struct LocalTranscriptRecord");
  const recordEnd = backend.indexOf("struct LocalAssistantMessage");
  assert.ok(recordStart >= 0 && recordEnd > recordStart, "narrow transcript structs must exist");
  assert.doesNotMatch(backend.slice(recordStart, recordEnd), /content\s*:/i);
  assert.doesNotMatch(accounts, /get_claude_account_details|scan_local_transcripts_at/);
  assert.doesNotMatch(cards, /get_claude_account_details|ClaudeAccountDetails/);
});

test("Claude monitor keeps CLI usage fallback and model normalization helpers", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");
  const formatters = read("src/utils/claude/claude-formatters.ts");

  assert.match(backend, /pub\s+fn\s+extract_cli_usage_from_output\s*\(/);
  assert.match(backend, /pub\s+fn\s+run_claude_cli_usage\s*\(/);
  assert.match(backend, /pub\s+fn\s+format_claude_model_name\s*\(/);
  assert.match(backend, /"claude-sonnet-5"/);
  assert.match(backend, /"Claude Sonnet  5"/);
  assert.match(formatters, /"Claude Sonnet  5"/);
});

test("Claude account cards expose Monitor and wire account-specific tracking to desktop overlay", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const app = read("src/App.tsx");
  const overlay = read("src/components/overlay/OverlayApp.tsx");
  const usageOverlay = read("src/hooks/useAppUsageAndOverlay.ts");

  assert.match(tab, /onTrackClaudeAccount\?:\s*\(status:\s*ClaudeAccountUsageStatus\)\s*=>\s*void/);
  assert.match(cards, /onDoubleClick=\{\(\) => onMonitor\?\.\(status\)\}/);
  assert.match(cards, /MonitoredHeartbeatIcon/);
  assert.doesNotMatch(tab, /onTrackClaude\?:\s*\(\)\s*=>\s*void/);

  assert.match(app, /onTrackClaudeAccount=\{handleTrackClaude\}/);
  assert.match(usageOverlay, /const accountId = status\.account\.id/);
  assert.match(usageOverlay, /localStorage\.setItem\(OVERLAY_TRACKED_PROVIDER_KEY,\s*"claude"\)/);
  assert.match(
    usageOverlay,
    /localStorage\.setItem\(OVERLAY_TRACKED_ACCOUNT_ID_KEY,\s*accountId\)/,
  );
  assert.match(usageOverlay, /isClaudeTracked\s*=\s*savedTrackedProvider\s*===\s*"claude"/);
  assert.match(usageOverlay, /[REDACTED]/);

  assert.match(
    overlay,
    /provider:\s*["']antigravity["']\s*\|\s*["']codex["']\s*\|\s*["']claude["']/,
  );
  assert.match(overlay, /data\.provider === ["']claude["'][\s\S]{0,180}<ClaudeLogo size=\{22\}/);
});

test("Claude monitor spawns CLI usage and shell commands silently on Windows without flashing console windows", () => {
  const backend = read("src-tauri/src/claude/monitor.rs");

  assert.match(
    backend,
    /#\[cfg\(target_os\s*=\s*"windows"\)\]\s*use\s+std::os::windows::process::CommandExt;/,
  );
  assert.match(backend, /run_shell_command[\s\S]*?creation_flags\(0x08000000\)/);
  assert.match(backend, /run_claude_cli_usage[\s\S]*?creation_flags\(0x08000000\)/);
});

test("Claude metric cards use wrapping fit-content flow", () => {
  const styles = read("src/styles/claude.css");
  assert.match(
    styles,
    /\.claude-usage-grid,[\s\S]*\.claude-local-usage-grid,[\s\S]*\.claude-stat-grid\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;/,
  );
  assert.match(styles, /\.claude-local-usage-card\s*\{[\s\S]*width:\s*fit-content;/);
  assert.match(styles, /\.claude-context-card\s*\{[\s\S]*width:\s*fit-content;/);
  assert.match(styles, /\.claude-stat\s*\{[\s\S]*width:\s*fit-content;/);
});

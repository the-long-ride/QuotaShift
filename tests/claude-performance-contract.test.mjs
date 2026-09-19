import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Claude quota polling stays lightweight after removing account local-details polling", () => {
  const accounts = read("src-tauri/src/claude/accounts.rs");
  const monitor = read("src/hooks/useClaudeMonitor.ts");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");

  const statusStart = accounts.indexOf("pub fn get_claude_account_statuses");
  const testStart = accounts.indexOf("#[cfg(test)]", statusStart);
  const statusBody = accounts.slice(statusStart, testStart);

  assert.doesNotMatch(statusBody, /scan_local_transcripts_at|merge_monitor_sources|read_snapshot/);
  assert.doesNotMatch(accounts, /get_claude_account_details/);
  assert.doesNotMatch(cards, /ClaudeAccountDetails|get_claude_account_details/);
  assert.doesNotMatch(monitor, /get_claude_monitor_status|window\.setInterval/);
});

test("Claude transcript details preserve partial JSONL tails and resume from complete-line offsets", () => {
  const cache = read("src-tauri/src/claude/monitor/transcript_cache.rs");
  assert.match(cache, /parsed_len/);
  assert.match(cache, /file_len/);
  assert.match(cache, /read_until\(b'\\n'/);
  assert.match(cache, /if !line\.ends_with\(b"\\n"\)/);
  assert.match(cache, /SeekFrom::Start\(start\)/);
  assert.match(cache, /previous:\s*Option<CachedTranscriptFile>/);
});

test("Claude process-aware polling shares one process snapshot for suspension and activity", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const accounts = read("src-tauri/src/claude/accounts.rs");

  assert.match(process, /suspended_process_counts_with_system/);
  assert.match(process, /process_profile_states_for_configs/);
  assert.match(process, /if map\.is_empty\(\)\s*\{\s*return HashMap::new\(\)/s);
  assert.match(accounts, /process_profile_states_for_configs\(&config_dirs\)/);
  assert.match(accounts, /profile_refresh_interval_secs/);
  assert.match(accounts, /idle_poll_interval_secs/);
  assert.doesNotMatch(accounts, /suspended_process_count_for_config\(&config_dir\)/);
});

test("Claude status-line bridge installation returns lightweight state without a transcript scan", () => {
  const bridge = read("src-tauri/src/claude/monitor/bridge.rs");
  const start = bridge.indexOf("pub fn ensure_claude_statusline_bridge_impl");
  const end = bridge.indexOf("pub fn get_claude_monitor_status_impl");
  const body = bridge.slice(start, end);

  assert.match(body, /read_snapshot/);
  assert.doesNotMatch(body, /monitor_status|scan_local_transcripts/);
});

test("Claude CLI probes use one bounded scheduler worker to cap peak CPU", () => {
  const accounts = read("src-tauri/src/claude/accounts.rs");
  const cli = read("src-tauri/src/claude/monitor/cli.rs");
  const scheduler = read("src-tauri/src/claude/monitor/usage_scheduler.rs");

  assert.match(scheduler, /VecDeque<String>/);
  assert.match(scheduler, /spawn_blocking/);
  assert.match(scheduler, /rerun_after_current/);
  assert.doesNotMatch(
    accounts + cli + scheduler,
    /std::thread::spawn|std::thread::scope|CLI_USAGE_RUN_LOCK/,
  );
});

test("Claude auto-resume immediately queues one fresh usage probe after full resume", () => {
  const autoResume = read("src-tauri/src/claude/process/auto_resume.rs");

  assert.match(autoResume, /ClaudeUsageScheduler/);
  assert.match(autoResume, /state::<ClaudeUsageScheduler>/);
  assert.match(autoResume, /request_profiles\(&resumed_config_dirs,\s*1,\s*true\)/);
  assert.match(autoResume, /profile_ready_for_usage_refresh/);
});

test("Claude status refreshes are event-driven and avoid frontend catch-up loops", () => {
  const hook = read("src/hooks/useClaudeAccountMonitor.ts");

  assert.match(hook, /claude-account-usage-updated/);
  assert.match(hook, /maxAgeSecs/);
  assert.match(hook, /window\.setTimeout\(tick, nextPollSecs \* 1000\)/);
  assert.doesNotMatch(hook, /activeRequestRef|pendingForceRef|Math\.max\(250/);
});

test("legacy Claude local overlay tracking migrates to a discovered account and manual refresh stays Claude-specific", () => {
  const usage = read("src/hooks/useAppUsageAndOverlay.ts");

  assert.match(usage, /savedTrackedAccountId === "claude-local"/);
  assert.match(usage, /profileName\.trim\(\)\.toLowerCase\(\) === "default"/);
  assert.match(usage, /syncTrackedIdentityState\("claude", savedTrackedAccountId\)/);
  assert.match(usage, /OVERLAY_TRACKED_ACCOUNT_ID_KEY, savedTrackedAccountId/);
  assert.match(
    usage,
    /payload\?\.provider === "claude"[\s\S]*refreshClaudeAccountStatuses\?\.\(true\)/,
  );
  assert.doesNotMatch(usage, /const accountId = status\?\.account\.id \?\? "claude-local"/);
});

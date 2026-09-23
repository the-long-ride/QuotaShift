import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Claude Code discovers subscription accounts by independent config directories without exposing tokens", () => {
  const root = read("src-tauri/src/claude/accounts.rs");
  const discovery = read("src-tauri/src/claude/accounts/discovery.rs");
  const metadata = read("src-tauri/src/claude/accounts/metadata.rs");
  const types = read("src-tauri/src/claude/accounts/types.rs");

  assert.match(root, /get_claude_account_statuses/);
  assert.match(discovery, /\.join\("\.claude"\)/);
  assert.match(discovery, /claude-profiles/);
  assert.match(discovery, /WindowsPowerShell/);
  assert.match(discovery, /PowerShell/);
  assert.match(discovery, /CLAUDE_CONFIG_DIR/);
  assert.match(discovery, /enabled_profiles/);
  assert.match(discovery, /profiles_config/);
  assert.match(metadata, /\.credentials\.json/);
  assert.match(metadata, /subscriptionType/);
  assert.match(metadata, /rateLimitTier/);
  assert.match(metadata, /emailAddress/);
  assert.match(types, /config_dir:\s*String/);
  assert.doesNotMatch(types + metadata, /access[_-]?token|refresh[_-]?token/i);
});

test("Claude Code usage polling is independently scheduled and executed with each account config directory", () => {
  const cli = read("src-tauri/src/claude/monitor/cli.rs");
  const monitor = read("src-tauri/src/claude/monitor.rs");
  const scheduler = read("src-tauri/src/claude/monitor/usage_scheduler.rs");

  assert.match(scheduler, /HashMap<String, ProfileState>/);
  assert.match(scheduler, /normalize_config_dir_key/);
  assert.match(cli, /probe_cli_usage_for_config/);
  assert.match(monitor, /run_claude_cli_usage_for_config/);
  assert.match(monitor, /cmd\.env\("CLAUDE_CONFIG_DIR", config_dir\)/);
  assert.match(monitor, /"claude"[\s\S]*"-p"[\s\S]*"\/usage"/);
});

test("account guardrails suspend only profile-mapped Claude processes and never suspend probes or IDE hosts", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const classify = read("src-tauri/src/claude/process/classify.rs");
  const native = read("src-tauri/src/claude/process/native.rs");
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  const lib = read("src-tauri/src/lib.rs");

  assert.match(classify, /CLAUDE_CONFIG_DIR/);
  assert.match(classify, /process\.parent\(\)/);
  assert.match(classify, /is_claude_usage_probe/);
  assert.match(classify, /is_ide_host_process/);
  assert.match(classify, /is_claude_ide_backend_process/);
  assert.match(process, /profiles\.get\(&pid\) != Some\(&target_key\)/);
  assert.match(native, /NtSuspendProcess/);
  assert.match(native, /NtResumeProcess/);
  assert.match(process, /suspend_claude_account_processes/);
  assert.match(process, /resume_claude_account_processes/);
  assert.match(lib, /claude_monitor::suspend_claude_account_processes/);
  assert.match(lib, /claude_monitor::resume_claude_account_processes/);
  assert.match(hook, /"suspend_claude_account_processes"/);
  const resumeHook = read("src/hooks/claude/useClaudeAccountResume.ts");
  assert.match(resumeHook, /"resume_claude_account_processes"/);
  assert.doesNotMatch(hook, /kill_claude_processes/);
});

test("obsolete broad Claude process commands are not exposed", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const lib = read("src-tauri/src/lib.rs");

  assert.doesNotMatch(lib, /resume_all_suspended_claude_processes|kill_claude_processes/);
  assert.doesNotMatch(
    process,
    /pub async fn (resume_all_suspended_claude_processes|kill_claude_processes)/,
  );
});

test("shared Claude Code guardrails are one-shot and never auto-resume on clear or disable", () => {
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  const controls = read("src/components/claude/ClaudeControls.tsx");
  const guardrails = read("src/utils/claude/claude-guardrails.ts");

  assert.match(hook, /for \(const status of statuses\)/);
  assert.match(guardrails, /preferences\.fiveHour\.enabled/);
  assert.match(guardrails, /preferences\.weekly\.enabled/);
  assert.doesNotMatch(hook, /status\.suspended && !decision\.hit/);
  assert.match(hook, /window\.setTimeout/);
  assert.match(hook, /claudeAdaptivePollIntervalSecs/);
  assert.match(hook, /claude-account-usage-updated/);
  assert.match(hook, /maxAgeSecs/);
  assert.doesNotMatch(hook, /activeRequestRef|pendingForceRef/);
  assert.doesNotMatch(hook, /resume_all_suspended_claude_processes/);
  assert.match(hook, /saveClaudePreferences/);
  assert.match(hook, /fiveHour:\s*\{[\s\S]*enabled:\s*false/);
  assert.match(hook, /weekly:\s*\{[\s\S]*enabled:\s*false/);
  assert.match(hook, /fiveHourTriggered:\s*decision\.fiveHourHit/);
  assert.match(hook, /weeklyTriggered:\s*decision\.weeklyHit/);
  assert.match(hook, /notifyClaudeGuardrailSuspension/);
  assert.match(hook, /guardrailFiringRef/);
  assert.match(
    controls,
    /preferences\.onlyWatchProcessingAccounts[\s\S]*Only profiles with a mapped running process can trigger suspension[\s\S]*Guardrails check every discovered Claude Code profile/i,
  );
  assert.match(controls, /Auto-suspend armed/);
  assert.doesNotMatch(controls, /Auto-stop armed/);
});

test("successful suspension stays successful when journal persistence reports an error", () => {
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");

  assert.match(hook, /persistenceError:\s*string \| null/);
  assert.match(hook, /result\.persistenceError/);
  assert.match(hook, /Automatic resume state could not be saved/);
  assert.match(hook, /const fired = [\s\S]*totalSuspended[\s\S]*alreadySuspended/);
});

test("one-shot Claude guardrail reports when the disabled state cannot be saved for restart", () => {
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");

  assert.match(hook, /const guardrailsPersisted = saveClaudePreferences/);
  assert.match(hook, /Guardrails are off for this session/);
  assert.match(hook, /off state could not be saved for restart/);
});

test("manual Claude resume reports journal persistence failure without hiding resume success", () => {
  const hook = read("src/hooks/claude/useClaudeAccountResume.ts");

  assert.match(
    hook,
    /type ClaudeProcessResumeResult = \{[\s\S]*persistenceError:\s*string \| null/,
  );
  assert.match(hook, /result\.persistenceError/);
  assert.match(hook, /journal cleanup could not be saved/i);
});

test("Claude Code compact cards show quota text without bars", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const app = read("src/App.tsx");
  const css = read("src/styles/claude/claude.css") + read("src/styles/claude/claude-accounts.css");
  const flow = read("src/styles/accounts/account-card-flow.css");
  const compact = read("src/styles/desktop/compact-mode.css");

  assert.match(tab, /ClaudeAccountCards/);
  assert.doesNotMatch(cards, /Claude Code accounts/);
  assert.doesNotMatch(cards, /claude-accounts-heading/);
  assert.match(cards, /<div className="claude-card-actions">[\s\S]*?account-card-plan-badge/);
  assert.match(cards, /className=\{`account-card claude-account-card/);
  assert.match(cards, /monitored/);
  assert.match(cards, /MonitoredHeartbeatIcon/);
  assert.match(cards, /onDoubleClick=\{\(\) => onMonitor\?\.\(status\)\}/);
  assert.doesNotMatch(cards, /claude-account-monitor-btn|ClaudeAccountDetails|aria-expanded/);
  assert.match(cards, /navigator\.clipboard\.writeText\(account\.email\)/);
  assert.match(cards, /invoke\("open_path_in_file_manager", \{ path: account\.configDir \}\)/);
  assert.match(cards, /fullLabel="5h"/);
  assert.match(cards, /compactLabel="5HR"/);
  assert.match(cards, /fullLabel="Weekly"/);
  assert.match(cards, /compactLabel="WK"/);
  assert.match(cards, /quota-limits-container/);
  assert.match(cards, /quota-value/);
  assert.doesNotMatch(cards, /% left/);
  assert.match(cards, /rawReset === "Reset unavailable" \? "" : rawReset/);
  assert.match(cards, />\s*Resume\s*<\/button>/);
  assert.match(app, /accountStatuses=\{claudeAccountStatuses\}/);
  assert.match(app, /onResumeAccount=\{handleResumeClaudeAccount\}/);
  assert.match(css, /\.claude-account-card/);
  assert.match(
    flow,
    /\.claude-accounts-flow\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*repeat\(var\(--account-card-columns, 1\), minmax\(0, 1fr\)\);/,
  );
  assert.match(cards, /useAccountCardGridColumns\(\)/);
  assert.doesNotMatch(flow, /@media \(min-width: 7350px\)|repeat\(17, minmax/);
  assert.match(
    compact,
    /\[data-card-mode="compact"\] \.claude-card-limits\s*\{[^}]*margin-top:\s*2px\s*!important;[^}]*border-top:\s*none\s*!important;/,
  );
  assert.doesNotMatch(
    compact,
    /\[data-card-mode="compact"\] \.claude-card-limits\s*\{[^}]*display:\s*none\s*!important;/,
  );
  assert.match(
    compact,
    /\[data-card-mode="compact"\] \.claude-account-card \.quota-limit-col\s*\{[^}]*flex-direction:\s*row\s*!important;/,
  );
  assert.match(
    compact,
    /\[data-card-mode="compact"\] \.claude-account-card \.progress-container\s*\{\s*display:\s*none\s*!important;/,
  );
});

test("Claude monitored-account overlay uses the selected account instead of stale local-session data", () => {
  const helper = read("src/utils/common/app-overlay-helpers.ts");
  const usage = read("src/hooks/app/useAppUsageAndOverlay.ts");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const app = read("src/App.tsx");

  assert.match(helper, /buildClaudeAccountOverlayPayload/);
  assert.match(helper, /accountId:\s*account\.id/);
  assert.match(helper, /provider:\s*"claude"/);
  assert.match(helper, /singleBars:\s*\[[\s\S]*label:\s*"5H"[\s\S]*label:\s*"WK"/);
  assert.match(helper, /buildTrackedClaudeOverlayPayload/);
  assert.match(usage, /savedTrackedAccountId/);
  assert.match(usage, /buildTrackedClaudeOverlayPayload/);
  assert.doesNotMatch(
    usage,
    /if \(isClaudeTracked\) \{[\s\S]{0,240}setItem\(OVERLAY_TRACKED_ACCOUNT_ID_KEY, "claude-local"\)/,
  );
  assert.match(cards, /onDoubleClick=\{\(\) => onMonitor\?\.\(status\)\}/);
  assert.match(cards, /MonitoredHeartbeatIcon/);
  assert.match(tab, /trackedAccountId=\{trackedAccountId\}/);
  assert.match(app, /onTrackClaudeAccount=\{handleTrackClaude\}/);
});

test("Claude account cards expose target-only manual refresh and disable it while suspended", () => {
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const app = read("src/App.tsx");
  const refreshHook = read("src/hooks/claude/useClaudeAccountRefresh.ts");
  const backend = read("src-tauri/src/claude/accounts.rs");

  assert.match(cards, /CodexRefreshIcon/);
  assert.match(cards, /codex-card-refresh-btn/);
  assert.match(cards, /disabled=\{!onRefresh \|\| isRefreshing \|\| status\.suspended\}/);
  assert.match(cards, /onRefresh\?\.\(account\.id\)/);
  assert.match(tab, /refreshingAccountIds=\{refreshingAccountIds\}/);
  assert.match(tab, /onRefresh=\{onRefreshAccount\}/);
  assert.match(app, /refreshingAccountIds=\{refreshingClaudeAccountIds\}/);
  assert.match(app, /onRefreshAccount=\{refreshClaudeAccountUsage\}/);
  assert.match(refreshHook, /runClaudeAccountRefresh\(/);
  assert.match(backend, /refresh_account_id:\s*Option<String>/);
  assert.match(backend, /target_account_id != account_id/);
  assert.match(backend, /if suspended \|\| target_account_id != account_id/);
});

test("Claude account usage bars use app tooltips with full limit/reset text", () => {
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  assert.match(cards, /formatUsageLimitTooltip\(tooltipLabel, resetLabel\)/);
  assert.match(cards, /data-tooltip=\{tooltip\}/);
  assert.doesNotMatch(cards, /title=/);
});

test("Claude account cards remove the expanded local-details polling surface", () => {
  const backend = read("src-tauri/src/claude/accounts.rs");
  const rustTypes = read("src-tauri/src/claude/accounts/types.rs");
  const tsTypes = read("src/utils/claude/claude-account-types.ts");
  const cards = read("src/components/claude/ClaudeAccountCards.tsx");
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const lib = read("src-tauri/src/lib.rs");
  const styles = read("src/styles.css");

  assert.doesNotMatch(backend, /get_claude_account_details/);
  assert.doesNotMatch(rustTypes, /ClaudeAccountLocalDetails/);
  assert.doesNotMatch(tsTypes, /ClaudeAccountLocalDetails/);
  assert.doesNotMatch(cards, /ClaudeAccountDetails|expandedIds|aria-expanded/);
  assert.doesNotMatch(tab, /claude-session-card|claude-context-card|claude-stat-grid/);
  assert.doesNotMatch(lib, /get_claude_account_details/);
  assert.doesNotMatch(styles, /claude-account-details\.css/);
});

test("Claude Code account bar supports search, manual profile paths, and current-process monitoring", () => {
  const tab = read("src/components/claude/ClaudeTab.tsx");
  const reorderHook = read("src/components/claude/useClaudeTabReorder.ts");
  const modal = read("src/components/claude/ClaudeAddAccountModal.tsx");
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  const paths = read("src/utils/claude/claude-profile-paths.ts");
  const accounts = read("src-tauri/src/claude/accounts.rs");
  const process = read("src-tauri/src/claude/process.rs");
  const currentProcess = read("src-tauri/src/claude/process/current.rs");
  const lib = read("src-tauri/src/lib.rs");
  const app = read("src/App.tsx");
  const tierSummary = read("src/components/common/AccountTierSummary.tsx");

  assert.match(tab, /className="account-bar"/);
  assert.match(tab, /<AccountTierSummary/);
  assert.match(tab, /totalTooltip="Total Claude Code accounts"/);
  assert.match(tierSummary, /account-bar-summary/);
  assert.match(tierSummary, /account-tier-badge/);
  assert.doesNotMatch(tab, />\s*Best\s*</);
  assert.match(reorderHook, /matchesClaudeAccount/);
  assert.match(reorderHook, /account\.email/);
  assert.match(reorderHook, /account\.configDir/);
  assert.match(tab, /searchQuery/);
  assert.match(tab, /ClaudeAddAccountModal/);
  assert.match(tab, /TrackCurrentAccountIcon/);
  assert.match(tab, /Monitor Current Claude Code Account/);

  assert.match(modal, /Claude profile path/);
  assert.match(modal, /CLAUDE_CONFIG_DIR/);
  assert.match(modal, /onAdd\(value\)/);

  assert.match(paths, /CLAUDE_MANUAL_PROFILE_PATHS_KEY/);
  assert.match(paths, /localStorage/);
  assert.match(paths, /sameClaudeConfigPath/);
  assert.match(hook, /extraConfigDirs:\s*manualProfilePathsRef\.current/);
  assert.match(hook, /handleAddClaudeProfilePath:\s*addProfilePath/);
  assert.match(hook, /handleResolveCurrentClaudeAccount:\s*resolveCurrentAccount/);

  assert.match(accounts, /extra_config_dirs:\s*Option<Vec<String>>/);
  assert.match(accounts, /candidate_dirs_with_extra/);
  assert.match(process, /pub use current::\*/);
  assert.match(currentProcess, /get_current_claude_config_dir/);
  assert.match(currentProcess, /max_by_key\(\|\(start_time, pid, _\)\|/);
  assert.match(lib, /claude_monitor::get_current_claude_config_dir/);

  assert.match(app, /onAddProfilePath=\{claudeMonitor\.handleAddClaudeProfilePath\}/);
  assert.match(app, /handleResolveCurrentClaudeAccount/);
  assert.match(app, /searchQuery=\{searchQuery\}/);
  const header = read("src/components/common/Header.tsx");
  assert.match(
    header,
    /placeholder=\{`Search accounts\.\.\. \(\$\{formatShortcutDisplay\(shortcuts\.focusSearch\)\}\)`\}/,
  );
});

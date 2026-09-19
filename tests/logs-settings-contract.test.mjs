import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("SettingsModal registers Logs tab with icon and renders LogsSettingsSection", () => {
  const modal = read("src/components/common/SettingsModal.tsx");
  assert.match(modal, /activeTab === "logs"/);
  assert.match(modal, /<LogsSettingsSection \/>/);
  assert.match(modal, /\["logs",\s*"Logs"\]/);
});

test("LogsSettingsSection includes file size, open location, and remove logs with confirmation dialog", () => {
  const section = read("src/components/common/LogsSettingsSection.tsx");
  assert.match(section, /invoke.*get_log_file_size/);
  assert.match(section, /invoke.*open_logs_folder/);
  assert.match(section, /invoke.*clear_log_file/);
  assert.match(section, /CustomDialog/);
  assert.match(section, /confirmDialogOpen/);
  assert.match(section, /Remove Logs/);
  assert.match(section, /Persistent log file/);
  assert.match(section, /Warnings &amp; errors only - Size:/);
  assert.match(section, /OpenLocationSvgIcon/);
  assert.match(section, /RemoveLogsSvgIcon/);
  assert.match(section, /data-tooltip="Open log file location"/);
  assert.match(section, /data-tooltip="Remove logs"/);
  // Ensure no buttons have native title tooltip attribute
  assert.doesNotMatch(section, /<button[^>]*\btitle=/);
});

test("LogsSettingsSection provides live session logs with switch auto-scroll and icon-only copy button", () => {
  const section = read("src/components/common/LogsSettingsSection.tsx");
  assert.match(section, /invoke.*get_session_logs/);
  assert.match(section, /role="switch"/);
  assert.match(section, /codex-pool-switch/);
  assert.match(section, /Auto-scroll/);
  assert.match(section, /logs-copy-button/);
  assert.match(section, /CopySvgIcon/);
  assert.match(section, /data-tooltip=\{copied \? "Copied!" : "Copy all logs below"\}/);
  assert.doesNotMatch(section, /<span>\{copied \? "Copied!" : "Copy"\}<\/span>/);
  assert.doesNotMatch(section, /<button[^>]*\btitle=/);
});

test("logs-settings.css styles compact logs tab with consistent small fonts, no session header border, and 24px buttons", () => {
  const css = read("src/styles/logs-settings.css");
  assert.match(css, /\.logs-terminal-viewer\s*\{[^}]*font-size:\s*6pt;/);
  assert.match(css, /\.logs-terminal-line\s*\{[^}]*font-size:\s*6pt;/);
  assert.match(css, /\.logs-copy-button\s*\{[^}]*width:\s*24px;/);
  assert.match(css, /\.logs-copy-button\s*\{[^}]*height:\s*24px;/);
  assert.match(css, /\.logs-action-button\s*\{[^}]*width:\s*24px;/);
  assert.match(css, /\.logs-action-button\s*\{[^}]*height:\s*24px;/);
  assert.match(css, /\.logs-file-label\s*\{[^}]*font-size:\s*10px;/);
  assert.match(css, /\.logs-file-desc\s*\{[^}]*font-size:\s*7\.5px;/);
  assert.match(css, /\.logs-session-title\s*\{[^}]*font-size:\s*10px;/);
  assert.match(css, /\.logs-session-subtitle\s*\{[^}]*font-size:\s*7\.5px;/);
  assert.match(css, /\.logs-session-header\s*\{[^}]*border-bottom:\s*none\s*!important;/);
  assert.match(css, /\.logs-autoscroll-control/);
});

test("ChatGPT usage fetcher passes and logs masked account email", () => {
  const oauthCmd = read("src-tauri/src/app/commands/oauth.rs");
  const fetcherHook = read("src/hooks/useCodexUsageFetcher.ts");

  assert.match(oauthCmd, /pub fn mask_email_address/);
  assert.match(oauthCmd, /format!\("email=\{\} ", mask_email_address\(e\)\)/);
  assert.match(oauthCmd, /start fetching ChatGPT usage for \{\}account=\{\}/);
  assert.match(oauthCmd, /extract_jwt_email/);

  assert.match(fetcherHook, /accountEmail = oauthData\.email \|\| account\.email/);
  assert.match(fetcherHook, /email:\s*accountEmail/);
});

test("Icons use theme-adaptive SVG stroke/fill and user-specified path data", () => {
  const copyIcon = read("src/components/common/CopySvgIcon.tsx");
  const logIcons = read("src/components/common/LogIcons.tsx");
  const headerIcons = read("src/components/common/HeaderIcons.tsx");
  const quitBtn = read("src/components/common/QuitButton.tsx");

  // CopySvgIcon uses user-provided path
  assert.match(copyIcon, /M8 6V5C8 4\.44772/);
  assert.match(copyIcon, /strokeDasharray="2 2"/);
  assert.match(copyIcon, /stroke="currentColor"/);

  // LogIcons use user-provided paths
  assert.match(logIcons, /OpenLocationSvgIcon/);
  assert.match(logIcons, /M9 13H15M15 13L13 11/);
  assert.match(logIcons, /RemoveLogsSvgIcon/);
  assert.match(logIcons, /M905\.92 237\.76a32 32 0 0 0-52\.48 36\.48/);

  // GearIcon uses user-provided path
  assert.match(headerIcons, /GearIcon/);
  assert.match(headerIcons, /M15 12C15 13\.6569/);
  assert.match(headerIcons, /M12\.9046 3\.06005/);

  // QuitIcon uses user-provided power path
  assert.match(quitBtn, /M12 3V12M18\.3611/);
  assert.match(quitBtn, /stroke="currentColor"/);
});

test("backend logger restricts persistent quotashift.log to warnings and errors and maintains session buffer", () => {
  const loggerRs = read("src-tauri/src/logger.rs");
  assert.match(loggerRs, /SESSION_LOGS/);
  assert.match(loggerRs, /MAX_SESSION_LOGS/);
  assert.match(loggerRs, /pub fn get_session_logs\(\)/);
  assert.match(loggerRs, /pub fn get_log_file_size\(\)/);
  assert.match(loggerRs, /pub fn clear_log_file\(\)/);
  assert.match(loggerRs, /let is_warning_or_error = level\.eq_ignore_ascii_case\("WARN"\)/);
  assert.match(loggerRs, /short_time\(\)/);

  const commandsRs = read("src-tauri/src/app/commands/logs.rs");
  assert.match(commandsRs, /get_log_file_size/);
  assert.match(commandsRs, /clear_log_file/);
  assert.match(commandsRs, /get_session_logs/);
  assert.match(commandsRs, /open_logs_folder/);

  const libRs = read("src-tauri/src/lib.rs");
  assert.match(libRs, /get_log_file_size/);
  assert.match(libRs, /clear_log_file/);
  assert.match(libRs, /get_session_logs/);
  assert.match(libRs, /open_logs_folder/);
});

test("Claude low-usage throttle preference is exposed and persisted with default OFF", () => {
  const prefsTypes = read("src/utils/common/claude-preference-types.ts");
  const prefs = read("src/utils/common/claude-preferences.ts");
  const behavior = read("src/components/common/BehaviorSettingsSection.tsx");
  const polling = read("src/utils/claude/claude-polling.ts");

  assert.match(prefsTypes, /CLAUDE_REDUCE_LOW_USAGE_KEY/);
  assert.match(prefsTypes, /reduceLowUsageFrequency\?: boolean/);
  assert.match(prefs, /loadClaudeLowUsageReductionPreference/);
  assert.match(prefs, /saveClaudeLowUsageReductionPreference/);
  assert.match(behavior, /reduce frequency refresh claude code usage to saving device resource/);
  assert.match(behavior, /Reduce frequency refresh claude code usage/);
  assert.match(polling, /isClaudeLowUsage/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("reset credits command is registered and resolves the account through the account scan", () => {
  const lib = read("src-tauri/src/lib.rs");
  const accounts = read("src-tauri/src/claude/accounts.rs");
  assert.match(lib, /claude_monitor::get_claude_reset_credits/);
  assert.match(accounts, /pub async fn get_claude_reset_credits\(/);
  const command = accounts.slice(accounts.indexOf("pub async fn get_claude_reset_credits("));
  assert.match(command, /scan_claude_accounts_at\(/);
  assert.match(command, /account\.id == account_id/);
});

test("reset credits request identifies as the installed Claude CLI and is read-only", () => {
  const client = read("src-tauri/src/claude/accounts/resets/client.rs");
  assert.match(client, /api\/oauth\/usage\?cedar_ember=1&skip_spend=1/);
  assert.match(client, /"anthropic-beta", "oauth-2025-04-20"/);
  assert.match(client, /claude-cli\/\{version\} \(external, cli\)/);
  assert.match(client, /\.get\(RESET_CREDITS_URL\)/);
  assert.doesNotMatch(client, /\.post\(|refresh_token|redeem|consume/i);
});

test("reset credits never log tokens or response bodies", () => {
  const client = read("src-tauri/src/claude/accounts/resets/client.rs");
  const mod = read("src-tauri/src/claude/accounts/resets/mod.rs");
  for (const source of [client, mod]) {
    for (const line of source.split(/\r?\n/).filter((l) => /log_eprintln!/.test(l))) {
      assert.doesNotMatch(line, /token|body/i, `log line must stay token/body free: ${line}`);
    }
  }
  assert.doesNotMatch(client, /\.text\(\)/, "response body must not be read as text for errors");
});

test("tracked Claude overlay payload carries reset credits only through the mapper", () => {
  const helpers = read("src/utils/common/app-overlay-helpers.ts");
  const account = helpers.slice(
    helpers.indexOf("export const buildClaudeAccountOverlayPayload"),
    helpers.indexOf("export const buildTrackedClaudeOverlayPayload"),
  );
  assert.match(account, /resetCredits\?: ClaudeResetCredits \| null/);
  assert.match(account, /\.\.\.resetCreditsToOverlayFields\(resetCredits\)/);
  const tracked = helpers.slice(helpers.indexOf("export const buildTrackedClaudeOverlayPayload"));
  assert.match(tracked, /prev\?\.provider === "claude" \? prev : null,\s*resetCredits,/);
});

test("reset credits hook caches counts for Claude cards and the tracked overlay account", () => {
  const hook = read("src/hooks/claude/useClaudeResetCredits.ts");
  assert.match(hook, /loadClaudeResetCreditsEnabled\(\)/);
  assert.match(hook, /CLAUDE_RESET_CREDITS_CHANGED_EVENT/);
  assert.match(hook, /accountStatuses/);
  assert.match(hook, /trackedProvider === "claude"/);
  assert.match(hook, /trackedAccountId !== "claude-local"/);
  assert.match(hook, /requestedAccountId === "claude-local"/);
  assert.match(hook, /refreshAll/);
  assert.match(hook, /resetCreditsByAccountId/);
  assert.match(hook, /invoke<ClaudeResetCredits>\("get_claude_reset_credits"/);
  assert.match(hook, /RESET_CREDITS_POLL_MS = 30 \* 60 \* 1000/);
});

test("overlay publisher wires the hook into the tracked Claude payload and overlay refresh", () => {
  const usage = read("src/hooks/app/useAppUsageAndOverlay.ts");
  assert.match(usage, /useClaudeResetCredits\(/);
  assert.match(usage, /resetCreditsByAccountId/);
  assert.match(usage, /buildTrackedClaudeOverlayPayload\(\{[\s\S]*?resetCredits,[\s\S]*?\}\)/);
  assert.match(usage, /refreshResetCredits\(true,\s*accountId/);
});

test("Settings > Monitoring offers an off-by-default opt-in with a risk note", () => {
  const modal = read("src/components/common/SettingsModal.tsx");
  const row = read("src/components/common/ClaudeResetCreditsSetting.tsx");
  const icon = read("src/components/common/ClaudeResetCreditsIcon.tsx");
  assert.match(modal, /<ClaudeResetCreditsSetting \/>/);
  assert.match(row, /SettingsSwitchRow/);
  assert.match(row, /Show Claude reset count/);
  assert.match(row, /icon=\{<ClaudeResetCreditsIcon \/>\}/);
  assert.match(icon, /export const ClaudeResetCreditsIcon/);
  assert.match(icon, /viewBox="0 0 1024 1024"/);
  assert.match(icon, /M983\.902 815\.94/);
  assert.match(row, /Experimental/);
  assert.match(row, /unofficial/i);
  assert.match(row, /account cards and the overlay/i);
  assert.match(row, /useState\(\(\) => loadClaudeResetCreditsEnabled\(\)\)/);
  assert.match(row, /saveClaudeResetCreditsEnabled\(next\)/);
});

test("Claude behavior settings show low-usage refresh before Persistent AG monitor", () => {
  const behavior = read("src/components/common/BehaviorSettingsSection.tsx");
  const lowUsagePosition = behavior.indexOf("Reduce frequency refresh claude code usage");
  const persistentMonitorPosition = behavior.indexOf("Persistent AG monitor");

  assert.notEqual(lowUsagePosition, -1);
  assert.notEqual(persistentMonitorPosition, -1);
  assert.ok(lowUsagePosition < persistentMonitorPosition);
});

test("reset credits hook explains skips and surfaces request failures in session logs", () => {
  const hook = read("src/hooks/claude/useClaudeResetCredits.ts");
  assert.match(hook, /logFrontend\(\s*"INFO",\s*"claude:resets"/);
  assert.match(hook, /no Claude account is tracked in the overlay/);
  assert.match(hook, /logFrontend\("WARN", "claude:resets", "Reset count request failed"/);
  const accounts = read("src-tauri/src/claude/accounts.rs");
  assert.match(accounts, /\[claude_resets\] unknown account/);
});

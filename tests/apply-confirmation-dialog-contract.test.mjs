import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCodexAuthContent } from '../.test-build/codex/current-local-session.js';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const lib = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
const commands = fs.readFileSync('src-tauri/src/app/commands.rs', 'utf8');
const processRs = fs.readFileSync('src-tauri/src/codex/process.rs', 'utf8');

test('App prompts for confirmation before applying Antigravity account', () => {
  assert.match(app, /accountPendingApply/);
  assert.match(app, /Apply Antigravity Account/);
  assert.match(app, /kill all current Antigravity processes \(CLI \/ IDE \/ Desktop App\)/);
});

test('App prompts for confirmation before applying Codex account', () => {
  assert.match(app, /Apply Codex Account/);
  assert.match(app, /kill all current Codex processes \(Codex CLI, ChatGPT desktop app, and IDE extension\)/);
  assert.match(app, /kill_codex_processes/);
  assert.match(app, /buildCodexAuthContent/);
});

test('buildCodexAuthContent formats OAuth and API-key payloads correctly', () => {
  const oauthRaw = JSON.stringify({
    accessToken: "test-acc-token",
    refreshToken: "test-ref-token",
    accountId: "test-acct-id",
    idToken: "test-id-token",
  });
  const oauthParsed = JSON.parse(buildCodexAuthContent(oauthRaw));
  assert.equal(oauthParsed.auth_mode, "chatgpt");
  assert.equal(oauthParsed.tokens.access_token, "test-acc-token");
  assert.equal(oauthParsed.tokens.refresh_token, "test-ref-token");
  assert.equal(oauthParsed.tokens.account_id, "test-acct-id");
  assert.equal(oauthParsed.tokens.id_token, "test-id-token");

  const apiKeyRaw = "sk-proj-test123456";
  const apiKeyParsed = JSON.parse(buildCodexAuthContent(apiKeyRaw));
  assert.equal(apiKeyParsed.auth_mode, "openai_api_key");
  assert.equal(apiKeyParsed.OPENAI_API_KEY, "sk-proj-test123456");
});

test('Backend exposes kill_codex_processes for CLI, desktop, and IDE extensions', () => {
  assert.match(lib, /kill_codex_processes/);
  assert.match(commands, /pub async fn kill_codex_processes/);
  assert.match(processRs, /is_codex_cli_process/);
  assert.match(processRs, /is_chatgpt_desktop_process/);
  assert.match(processRs, /is_codex_ide_extension_process/);
  assert.match(processRs, /quotashift/);
});

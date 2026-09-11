import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("App discovers and tracks the current Antigravity local session", () => {
  assert.match(app, /handleTrackCurrentAntigravityAccount\s*=\s*async/);
  assert.match(app, /invoke[^\n]{0,160}\("read_antigravity_session"\)/);
  assert.match(app, /extractAntigravitySessionAccount/);
  assert.match(app, /findAntigravityAccountMatch/);
  assert.match(app, /upsertAccountById/);
  assert.match(app, /saveAntigravityAccounts/);
  assert.match(app, /saveAccountOrder\(ANTIGRAVITY_ORDER_KEY/);
  assert.match(app, /refreshAntigravityAccountsCloudFirst\(\[account\], true\)/);
});

test("App imports and tracks the current Codex local session even when cloud usage fails", () => {
  assert.match(app, /handleTrackCurrentCodexAccount\s*=\s*async/);
  assert.match(app, /invoke[^\n]{0,160}\("read_codex_auth"\)/);
  assert.match(app, /parseCodexLocalAuth/);
  assert.match(app, /findCodexAccountMatch/);
  assert.match(app, /saveCodexAccounts/);
  assert.match(app, /saveAccountOrder\(CODEX_ORDER_KEY/);
  assert.match(app, /fetchAccountUsage\(account, true\)/);
  assert.match(app, /set_monitored_codex/);
  assert.match(app, /cloud usage unavailable/);
});

test("App exposes a shared busy state for current-session tracking", () => {
  assert.match(app, /trackingCurrentProvider/);
  assert.match(app, /onTrackCurrentAccount/);
  assert.match(app, /isTrackingCurrentAccount/);
});

test("App preserves existing account data and avatar when tracking existing account", () => {
  assert.match(app, /const match = findAntigravityAccountMatch\(antigravityAccounts, candidate\),\s*account:\s*AntigravityAccount\s*=\s*match\s*\|\|\s*\{\s*\.\.\.candidate/);
  assert.match(app, /if\s*\(!match\)\s*\{\s*const updated = upsertAccountById\(antigravityAccounts/);
  assert.match(app, /if\s*\(!match\)\s*\{\s*const updated = upsertAccountById\(codexAccounts/);
});

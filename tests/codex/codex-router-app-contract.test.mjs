import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync("src/hooks/codex/useCodexRouterManager.ts", "utf8");
const router = fs.readFileSync("src/utils/codex/codex-router.ts", "utf8");

test("Pool Routing lifecycle requires and publishes an explicit active pool", () => {
  assert.match(manager, /Select a pool before enabling Pool Routing/);
  assert.match(manager, /activePoolId:\s*activeCodexPoolId/);
  assert.match(manager, /start_codex_router/);
  assert.match(manager, /configure_codex_router/);
  assert.match(manager, /stop_codex_router/);
});

test("router snapshot excludes stale quota and refreshes active-pool OAuth credentials", () => {
  assert.match(router, /isUsageCacheFresh/);
  assert.match(router, /isCodexModelCacheFresh/);
  assert.match(router, /refreshActivePoolOAuthCredentials/);
  assert.match(manager, /refresh_chatgpt_token/);
  assert.match(manager, /saveCodexAccounts/);
});

test("router configuration remains transient and does not persist credentials itself", () => {
  assert.match(router, /decodeCredential/);
  assert.match(router, /normalizeCodexUsageWindows/);
  assert.doesNotMatch(router, /localStorage/);
});

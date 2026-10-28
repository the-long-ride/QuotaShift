import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const manager = fs.readFileSync("src/hooks/codex/useCodexRouterManager.ts", "utf8");
const router = fs.readFileSync("src/utils/codex/pools/codex-router.ts", "utf8");

test("Pool Routing lifecycle requires at least one enabled model pool and publishes V2", () => {
  assert.match(manager, /Enable at least one Model Pool/);
  assert.match(manager, /poolsV2: modelPoolsV2/);
  assert.match(manager, /start_codex_router/);
  assert.match(manager, /configure_codex_router/);
  assert.match(manager, /stop_codex_router/);
});

test("router snapshot excludes stale quota and avoids legacy OAuth refresh", () => {
  assert.match(router, /isUsageCacheFresh/);
  assert.match(router, /isCodexModelCacheFresh/);
  assert.match(router, /refreshActivePoolOAuthCredentials/);
  assert.doesNotMatch(manager, /refresh_chatgpt_token/);
  assert.doesNotMatch(manager, /saveCodexAccounts/);
});

test("router configuration remains transient and does not persist credentials itself", () => {
  assert.match(router, /decodeCredential/);
  assert.match(router, /normalizeCodexUsageWindows/);
  assert.doesNotMatch(router, /localStorage/);
});

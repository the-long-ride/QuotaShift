import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

const app = readWithCssImports("src/App.tsx");
const accountOps = fs.readFileSync("src/hooks/codex/useCodexAccountOps.ts", "utf8");
const usage = fs.readFileSync("src/hooks/app/useAppUsageAndOverlay.ts", "utf8");
const appConstants = fs.readFileSync("src/utils/common/app-constants.ts", "utf8");

test("App persists and wires Codex model pools as router selections", () => {
  assert.match(appConstants, /CODEX_POOLS_KEY = "quotashift_codex_account_pools_v1"/);
  assert.match(app, /handleActivateCodexPool/);
  assert.match(app, /activePoolId=\{activeCodexPoolId\}/);
  assert.match(app, /onActivatePool=\{handleActivateCodexPool\}/);
});

test("pool activation does not rewrite auth or kill Codex processes", () => {
  const activation = accountOps.slice(
    accountOps.indexOf("const handleActivateCodexPool"),
    accountOps.indexOf("const handleSwitchBestCodex"),
  );
  assert.match(activation, /persistCodexActivePool/);
  assert.doesNotMatch(activation, /kill_codex_processes/);
  assert.doesNotMatch(activation, /write_codex_auth/);
  assert.doesNotMatch(activation, /handleApplyCodexAccount/);
});

test("pool routing has no background account-apply failover path", () => {
  assert.doesNotMatch(accountOps, /findCodexPoolFailover|pickBestCodexPoolMember/);
  assert.doesNotMatch(usage, /maybeAutoFailoverActiveCodexPool|codexFailoverLatchRef/);
});

test("backup export and import still round-trip optional Codex pools", () => {
  const backup = fs.readFileSync("src/utils/common/app-backup.ts", "utf8");
  assert.match(backup, /Array\.isArray\(pData\.pools\)/);
  assert.match(backup, /normalizeCodexPools/);
  assert.match(backup, /reconcileCodexPools/);
});

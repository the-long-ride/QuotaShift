import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("only the device-applied Antigravity identity can launch an exact quota worker", () => {
  const source = read("src/utils/antigravity/quota/antigravity-exact-ops.ts");
  const sessionRead = source.indexOf('invoke<Record<string, unknown> | null>("read_antigravity_session")');
  const match = source.indexOf("findAntigravityAccountMatch(accounts, current)");
  const selected = source.indexOf("const appliedAccounts = accounts.filter");
  const credentials = source.indexOf("buildExactRequest(account, deobfuscate)");
  const nativeWorker = source.indexOf('"refresh_antigravity_accounts_exact"');
  assert.ok(sessionRead >= 0 && sessionRead < match && match < selected);
  assert.ok(selected < credentials && credentials < nativeWorker);
  assert.match(source, /if \(appliedAccounts\.length === 0\)/);
  assert.match(source, /for \(const account of appliedAccounts\)/);
  assert.match(source, /const invalidAccounts = appliedAccounts\.filter/);
  assert.match(source, /let appliedAccountId: string \| null = null/);
  assert.doesNotMatch(source, /const validRequests = accounts/);
});

test("unapplied accounts preserve cloud-only quota without preparing exact workers", () => {
  const source = read("src/utils/antigravity/quota/antigravity-exact-ops.ts");
  const emptyGate = source.slice(
    source.indexOf("if (appliedAccounts.length === 0)"),
    source.indexOf("const validRequests = appliedAccounts"),
  );
  assert.match(emptyGate, /return;/);
  assert.doesNotMatch(emptyGate, /preparing_profile|refresh_antigravity_accounts_exact/);
  assert.match(emptyGate, /if \(allowCloudFallback && fetchQuotaFn\)/);
});

test("quota model icons and image meter use application tooltips, not browser title tooltips", () => {
  for (const path of [
    "src/components/antigravity/AntigravityQuotaRows.tsx",
    "src/components/antigravity/AntigravityImageQuotaRow.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /className="quota-model-name" data-tooltip=/);
    assert.doesNotMatch(source, /className="quota-model-name" title=/);
  }
});

test("account quota switches reuse QuotaShift's standard monochrome switch", () => {
  const source = read("src/components/common/accounts/AccountQuotaPollingSwitch.tsx");
  const standard = read("src/components/common/CommonSwitch.tsx");
  const style = read("src/styles/accounts/quota-polling-switch.css");
  assert.match(source, /<CommonSwitch/);
  assert.match(source, /className="account-quota-polling-switch"/);
  assert.match(standard, /codex-pool-switch--on/);
  assert.match(standard, /onDoubleClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(style, /#[0-9a-fA-F]{3,8}|var\(--accent-color/);
});

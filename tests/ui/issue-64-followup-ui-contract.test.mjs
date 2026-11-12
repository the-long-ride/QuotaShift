import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = (file) => readFileSync(file, "utf8");

test("Antigravity unavailable credits render no placeholder and zero is preserved", () => {
  const helper = source("src/components/antigravity/modal/antigravity-card-helpers.ts");
  const card = source("src/components/antigravity/AntigravityTab.tsx");
  assert.ok(helper.includes('Number.isFinite(currentBalance)'));
  assert.ok(helper.includes("USD"));
  assert.ok(helper.includes("test(acc.lastBalance.trim())"));
  assert.ok(!helper.includes('acc.lastBalance || "—"'));
  assert.ok(card.includes('{displayBalance && <div className="codex-card-meta">'));
  assert.ok(!helper.includes('acc.lastBalance || "—"'));
});

test("quota setting title avoids redundant Remaining / Used text", () => {
  const setting = source("src/components/common/settings-fields/QuotaPercentModeSetting.tsx");
  assert.ok(setting.includes(">How to show quota usage</span>"));
  assert.ok(!setting.includes("How to show quota usage: Remaining / Used"));
});

test("all segmented controls share the moving indicator and reduced-motion setting", () => {
  const css = source("src/styles/settings/settings-segment-motion.css");
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(css.includes("--segment-index"));
  for (const file of [
    "src/components/common/settings-fields/QuotaPercentModeSetting.tsx",
    "src/components/common/settings-fields/CardViewSetting.tsx",
    "src/components/common/accounts/QuotaDisplayRow.tsx",
  ]) assert.ok(source(file).includes('"--segment-index"'), file);
});

test("argon carry preserves depleted omitted pool without inventing new exhaustion", () => {
  const code = source("src/utils/antigravity/quota/antigravity-quota-carry.ts");
  assert.ok(code.includes("prior.weeklyPercent !== 0"));
  assert.ok(code.includes("result.push({ ...prior, quotaCarried: true })"));
  assert.ok(code.includes("resetStillValid(reset, now)"));
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("expanded Codex and Antigravity usage rows omit the word limit", () => {
  const codex = read("src/components/codex/CodexCardUsageLimits.tsx");
  const antigravity = read("src/components/antigravity/AntigravityQuotaRows.tsx");

  assert.match(codex, /const expandedLabel = item\.label\.replace\(\/\\s\+limit\$\/i, ""\)/);
  assert.match(codex, /className="label-full">\{expandedLabel\}<\/span>/);
  assert.match(codex, /formatCompactLimitLabel\(item\.label\)/);
  assert.match(antigravity, /label:\s*"5 hrs"/);
  assert.match(antigravity, /label:\s*"Weekly"/);
  assert.doesNotMatch(antigravity, /label:\s*"5 hrs limit"/);
  assert.doesNotMatch(antigravity, /label:\s*"Weekly limit"/);
});


test("expanded account usage bars expose full reset text through app tooltips without native label titles", () => {
  const codex = read("src/components/codex/CodexCardUsageLimits.tsx");
  const antigravity = read("src/components/antigravity/AntigravityQuotaRows.tsx");

  assert.match(codex, /data-tooltip=\{formatUsageLimitTooltip\(expandedLabel, resetStr\)\}/);
  assert.doesNotMatch(codex, /quota-limit-name"\s+title=/);
  assert.doesNotMatch(codex, /quota-limit-reset"\s+title=/);

  assert.match(antigravity, /data-tooltip=\{formatUsageLimitTooltip\(/);
  assert.doesNotMatch(antigravity, /quota-limit-name"\s+title=/);
  assert.doesNotMatch(antigravity, /quota-limit-reset"\s+title=/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

test("account cards format reset times through formatCardResetLabel", () => {
  const codex = read("src/components/codex/CodexCardUsageLimits.tsx");
  const agy = read("src/components/antigravity/AntigravityQuotaRows.tsx");
  const claude = read("src/components/claude/ClaudeAccountCards.tsx");
  assert.match(codex, /formatCardResetLabel\("codex", epochToIso\(item\.resetAt\)\)/);
  assert.match(agy, /formatCardResetLabel\(\s*"antigravity",\s*quota\.fiveHourReset,/);
  assert.match(agy, /formatCardResetLabel\(\s*"antigravity",\s*quota\.weeklyReset,/);
  assert.match(claude, /formatCardResetLabel\("claude", epochToIso\(window\?\.resetsAt\)\)/);
  assert.doesNotMatch(claude, /formatReset\(window\.resetsAt\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("antigravity cloud success resumes polling", () => {
  const src = read("src/utils/antigravity/app-antigravity-ops.ts");
  assert.match(src, /resumeAccountPolling\("antigravity", acc\.id\)/);
});

test("antigravity exact success resumes polling", () => {
  const src = read("src/utils/antigravity/antigravity-exact-ops.ts");
  assert.match(src, /state === "exact"[\s\S]{0,200}resumeAccountPolling\("antigravity"/);
});

test("codex success paths resume polling", () => {
  const src = read("src/hooks/codex/useCodexUsageFetcher.ts");
  const hits = src.match(/resumeAccountPolling\("codex", account\.id\)/g) || [];
  assert.equal(hits.length, 2);
});

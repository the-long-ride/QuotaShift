import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();

async function loadBuilt(fileName) {
  try {
    return await import(pathToFileURL(path.join(root, ".test-build", fileName)).href);
  } catch {
    return null;
  }
}

test("model line humanizes only the display name and keeps the real model id", async () => {
  const mod = await loadBuilt("codex-model-display.js");
  assert.ok(mod?.formatCodexModelLine, "codex model display utility must exist");
  assert.equal(
    mod.formatCodexModelLine("GPT-5.6-Luna", "gpt-5.6-luna"),
    "GPT 5.6 Luna - gpt-5.6-luna",
  );
  assert.equal(
    mod.formatCodexModelLine("", "codex-auto-review"),
    "codex auto review - codex-auto-review",
  );
});

test("copy action writes the exact model id", async () => {
  const mod = await loadBuilt("codex-model-display.js");
  assert.ok(mod?.copyCodexModelId, "codex model copy utility must exist");
  const writes = [];
  const copied = await mod.copyCodexModelId("gpt-5.6-luna", {
    writeText: async (value) => { writes.push(value); },
  });
  assert.equal(copied, true);
  assert.deepEqual(writes, ["gpt-5.6-luna"]);
});

test("last-used timestamp advances monotonically by account id", async () => {
  const mod = await loadBuilt("account-last-used.js");
  assert.ok(mod?.markAccountLastUsed, "account last-used utility must exist");
  const original = [
    { id: "a", email: "A@example.com", lastUsedAt: 100 },
    { id: "b", email: "b@example.com" },
  ];
  const advanced = mod.markAccountLastUsed(original, "a", 200);
  assert.equal(advanced[0].lastUsedAt, 200);
  assert.equal(advanced[1], original[1]);
  const older = mod.markAccountLastUsed(advanced, "a", 150);
  assert.equal(older, advanced, "an older observation must not rewrite persisted last-used data");
});

test("current-session email matching is case-insensitive", async () => {
  const mod = await loadBuilt("account-last-used.js");
  assert.ok(mod?.markAccountLastUsedByEmail, "email reconciliation utility must exist");
  const original = [{ id: "a", email: "Jess@Example.com" }];
  const updated = mod.markAccountLastUsedByEmail(original, "  jess@example.COM ", 300);
  assert.equal(updated[0].lastUsedAt, 300);
});

test("last-used label always renders for saved accounts", async () => {
  const mod = await loadBuilt("account-last-used.js");
  assert.ok(mod?.formatLastUsed, "last-used formatter must exist");
  assert.equal(mod.formatLastUsed(undefined), "");
  assert.match(mod.formatLastUsed(1_700_000_000_000), /^Last used: /);
});

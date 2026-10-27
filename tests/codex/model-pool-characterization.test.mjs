import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeCodexPools } from "../../.test-build/codex-pools.js";
import { buildCodexRouterConfig } from "../../.test-build/codex-router.js";

const fixturesDir = path.resolve("tests/fixtures/model-pool");

test("MP-00: characterization - v1 pool normalization handles conflict fixture correctly", () => {
  const rawConflict = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "pools/v1_conflict_pools.json"), "utf8"),
  );
  const normalized = normalizeCodexPools(rawConflict.pools);

  // Duplicate ID 'pool-dup-1' must only appear once
  assert.equal(normalized.filter((p) => p.id === "pool-dup-1").length, 1);
  const poolDup = normalized.find((p) => p.id === "pool-dup-1");
  assert.ok(poolDup);
  // Duplicate accounts within a pool must be de-duplicated
  assert.deepEqual(poolDup.accountIds, ["acc-1", "acc-2"]);

  // Trimmed name pool
  const poolTrim = normalized.find((p) => p.id === "pool-valid-2");
  assert.ok(poolTrim);
  assert.equal(poolTrim.name, "Pool Trim Name");
  // Empty account strings must be filtered out
  assert.deepEqual(poolTrim.accountIds, ["acc-4", "acc-5"]);

  // Empty account list pool is preserved in v1 draft normalization
  const poolEmpty = normalized.find((p) => p.id === "pool-empty-3");
  assert.ok(poolEmpty);
  assert.deepEqual(poolEmpty.accountIds, []);
});

test("MP-00: characterization - user Codex applied-account behavior remains unaffected", () => {
  const configWithoutPool = buildCodexRouterConfig({
    accounts: [{ id: "acc-user", label: "User Account", apiKey: "token-user" }],
    pools: [],
    usageCache: {},
    modelCache: {},
    appliedAccountId: "acc-user",
    activePoolId: null,
    decodeCredential: (val) => val,
  });

  assert.equal(configWithoutPool.appliedAccountId, "acc-user");
  assert.equal(configWithoutPool.activePoolId, null);
  assert.equal(configWithoutPool.pools.length, 0);

  const configWithPool = buildCodexRouterConfig({
    accounts: [{ id: "acc-user", label: "User Account", apiKey: "token-user" }],
    pools: [{ id: "p1", name: "Pool 1", model: "gpt-4o", accountIds: ["acc-user"] }],
    usageCache: {},
    modelCache: {},
    appliedAccountId: "acc-user",
    activePoolId: "p1",
    decodeCredential: (val) => val,
  });

  assert.equal(configWithPool.appliedAccountId, "acc-user");
  assert.equal(configWithPool.activePoolId, "p1");
  assert.equal(configWithPool.pools.length, 1);
});

test("MP-00: characterization - response and message fixtures are parseable and token-free", () => {
  const completed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "responses/response_completed.json"), "utf8"),
  );
  assert.equal(completed.status, "completed");
  assert.equal(typeof completed.usage.input_tokens_details.cached_tokens, "number");

  const failed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "responses/response_failed.json"), "utf8"),
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.error.code, "rate_limit_exceeded");

  const cached = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "responses/response_cached_usage.json"), "utf8"),
  );
  assert.equal(cached.usage.input_tokens_details.cached_tokens, 80);

  const textMsg = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "messages/message_text.json"), "utf8"),
  );
  assert.equal(textMsg.messages[0].role, "user");

  const toolUseMsg = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "messages/message_tool_use.json"), "utf8"),
  );
  assert.equal(toolUseMsg.tools[0].name, "get_weather");

  const toolResultMsg = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "messages/message_tool_result.json"), "utf8"),
  );
  assert.equal(toolResultMsg.messages[2].content[0].type, "tool_result");

  const abortMsg = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, "messages/message_abort.json"), "utf8"),
  );
  assert.equal(abortMsg.stream, true);

  const rawSSE = fs.readFileSync(
    path.join(fixturesDir, "responses/response_truncated_stream.sse"),
    "utf8",
  );
  assert.ok(rawSSE.includes("response.created"));
  assert.ok(!rawSSE.includes("response.completed"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { exportPoolsToJson, importPoolsFromJson } from "../.test-build/codex/codex-pools-io.js";

const sampleAccounts = [
  { id: "acc-1", label: "Account 1", apiKey: "key1" },
  { id: "acc-2", label: "Account 2", apiKey: "key2" },
  { id: "acc-3", label: "Account 3", apiKey: "key3" },
];

const samplePools = [
  {
    id: "pool-1",
    name: "GPT-5 Pool",
    model: "gpt-5.6-sol",
    accountIds: ["acc-1", "acc-2"],
  },
  {
    id: "pool-2",
    name: "Fast Pool",
    model: "gpt-5.1-flash",
    accountIds: ["acc-2", "acc-3"],
  },
];

test("exportPoolsToJson generates valid JSON with metadata", () => {
  const jsonStr = exportPoolsToJson(samplePools);
  assert.ok(typeof jsonStr === "string");
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.type, "quotashift_pools");
  assert.equal(parsed.pools.length, 2);
  assert.equal(parsed.pools[0].name, "GPT-5 Pool");
  assert.equal(parsed.pools[1].name, "Fast Pool");
});

test("importPoolsFromJson parses exported format correctly", () => {
  const jsonStr = exportPoolsToJson(samplePools);
  const result = importPoolsFromJson(jsonStr, [], sampleAccounts);
  assert.equal(result.error, undefined);
  assert.equal(result.pools.length, 2);
  assert.equal(result.importedCount, 2);
  assert.equal(result.updatedCount, 0);
  assert.equal(result.pools[0].id, "pool-1");
  assert.deepEqual(result.pools[0].accountIds, ["acc-1", "acc-2"]);
});

test("importPoolsFromJson supports direct array format", () => {
  const jsonStr = JSON.stringify(samplePools);
  const result = importPoolsFromJson(jsonStr, [], sampleAccounts);
  assert.equal(result.error, undefined);
  assert.equal(result.pools.length, 2);
  assert.equal(result.importedCount, 2);
});

test("importPoolsFromJson updates existing pools by matching id", () => {
  const existing = [
    {
      id: "pool-1",
      name: "Old Name",
      model: "gpt-5.6-sol",
      accountIds: ["acc-1"],
    },
  ];
  const incoming = [
    {
      id: "pool-1",
      name: "Updated Name",
      model: "gpt-5.6-sol",
      accountIds: ["acc-1", "acc-2"],
    },
    {
      id: "pool-2",
      name: "New Pool",
      model: "gpt-5.1-flash",
      accountIds: ["acc-3"],
    },
  ];
  const jsonStr = exportPoolsToJson(incoming);
  const result = importPoolsFromJson(jsonStr, existing, sampleAccounts);
  assert.equal(result.error, undefined);
  assert.equal(result.pools.length, 2);
  assert.equal(result.importedCount, 1);
  assert.equal(result.updatedCount, 1);
  const updated = result.pools.find((p) => p.id === "pool-1");
  assert.equal(updated.name, "Updated Name");
  assert.deepEqual(updated.accountIds, ["acc-1", "acc-2"]);
});

test("importPoolsFromJson filters out accounts not present in validAccounts", () => {
  const incoming = [
    {
      id: "pool-x",
      name: "Filter Pool",
      model: "gpt-5.6-sol",
      accountIds: ["acc-1", "acc-unknown-999"],
    },
  ];
  const jsonStr = exportPoolsToJson(incoming);
  const result = importPoolsFromJson(jsonStr, [], sampleAccounts);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.pools[0].accountIds, ["acc-1"]);
});

test("importPoolsFromJson returns error for malformed JSON", () => {
  const result = importPoolsFromJson("invalid json {", []);
  assert.ok(result.error);
  assert.match(result.error, /Invalid JSON/i);
});

test("importPoolsFromJson returns error for invalid structure", () => {
  const result = importPoolsFromJson(JSON.stringify({ notPools: 123 }), []);
  assert.ok(result.error);
  assert.match(result.error, /No valid.*pools found/i);
});

test("importPoolsFromJson skips items without valid name or model", () => {
  const invalidItems = [
    { id: "p1", name: "", model: "gpt" },
    { id: "p2", name: "Valid", model: "" },
    { id: "p3", name: "Complete", model: "gpt-5.6-sol", accountIds: ["acc-1"] },
  ];
  const result = importPoolsFromJson(JSON.stringify(invalidItems), [], sampleAccounts);
  assert.equal(result.error, undefined);
  assert.equal(result.pools.length, 1);
  assert.equal(result.pools[0].name, "Complete");
});

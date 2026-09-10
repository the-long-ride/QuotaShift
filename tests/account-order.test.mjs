import test from "node:test";
import assert from "node:assert/strict";

// Set up mock localStorage for Node environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

import {
  loadAccountOrder,
  saveAccountOrder,
  sortByOrder,
  reorderItems,
} from "../.test-build/account-order.js";

test("loadAccountOrder returns empty array on missing or malformed storage", () => {
  storage.clear();
  assert.deepEqual(loadAccountOrder("non-existent"), []);

  storage.set("corrupted", "{not json");
  assert.deepEqual(loadAccountOrder("corrupted"), []);
});

test("saveAccountOrder and loadAccountOrder persist and read order list", () => {
  storage.clear();
  const order = ["id-1", "id-2", "id-3"];
  saveAccountOrder("order-key", order);
  assert.deepEqual(loadAccountOrder("order-key"), order);
});

test("sortByOrder orders items based on specified order array", () => {
  const items = [{ id: "c" }, { id: "a" }, { id: "b" }, { id: "d" }];
  const order = ["a", "b", "c"];

  const sorted = sortByOrder(items, order);
  assert.deepEqual(
    sorted.map((i) => i.id),
    ["a", "b", "c", "d"]
  );
});

test("sortByOrder handles elements not in order or partial orders", () => {
  const items = [{ id: "x" }, { id: "y" }, { id: "z" }];
  const order = ["z"];

  const sorted = sortByOrder(items, order);
  assert.equal(sorted[0].id, "z");
});

test("reorderItems moves element from source to target index", () => {
  const items = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];

  // Move 1 to position of 3
  const movedForward = reorderItems(items, "1", "3");
  assert.deepEqual(
    movedForward.map((i) => i.id),
    ["2", "3", "1", "4"]
  );

  // Move 4 to position of 2
  const movedBackward = reorderItems(items, "4", "2");
  assert.deepEqual(
    movedBackward.map((i) => i.id),
    ["1", "4", "2", "3"]
  );

  // Same source and target
  assert.deepEqual(reorderItems(items, "2", "2"), items);

  // Invalid IDs
  assert.deepEqual(reorderItems(items, "missing", "2"), items);
  assert.deepEqual(reorderItems(items, "2", "missing"), items);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const backend = readFileSync("src-tauri/src/lib.rs", "utf8");
test("Tauri no longer exposes unsigned installer download or execution", () => {
  assert.doesNotMatch(backend, /execute_update/);
  assert.doesNotMatch(backend, /update_setup\.exe|update\.deb/);
});

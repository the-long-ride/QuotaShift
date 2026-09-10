import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("prettier script exists and runs in check mode", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/prettier.mjs", "--check", "tests/format-time.test.mjs"],
    {
      cwd: root,
      encoding: "utf8",
    }
  );

  assert.equal(typeof result.status, "number");
  assert.ok(
    result.stdout.includes("Code Formatting") || result.stdout.includes("Running Prettier"),
    "Output must include script banner"
  );
});

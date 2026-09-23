import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const python = process.platform === "win32" ? "python" : "python3";
const script = (name) => readFileSync(new URL(`../../src-tauri/src/python/${name}`, import.meta.url), "utf8");

function run(scriptText, args, input) {
  const result = spawnSync(python, ["-c", scriptText, ...args], {
    encoding: "utf8",
    input: input && JSON.stringify(input),
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("capture reads every IDE database without mixing profile credentials", () => {
  const root = mkdtempSync(join(tmpdir(), "quotashift-capture-"));
  try {
    const first = join(root, "first", "state.vscdb");
    const second = join(root, "second", "state.vscdb");
    const writer = script("write_vscdb.py");
    run(writer, [], {
      db_paths: [first],
      token: "first-access",
      refresh_token: "first-refresh",
      email: "first@example.test",
    });
    run(writer, [], {
      db_paths: [second],
      token: "second-access",
      email: "second@example.test",
    });
    utimesSync(first, 1000, 1000);
    utimesSync(second, 2000, 2000);

    const paths = `${first}|${second}`;
    const reader = script("read_vscdb.py");
    const all = JSON.parse(run(reader, [paths, "--all"]));
    assert.equal(all.length, 2);
    assert.equal(all[0]["antigravityUnifiedStateSync.oauthToken"], "second-access");
    assert.equal(all[0]["antigravity.refreshToken"], undefined);
    assert.equal(all[1]["antigravityUnifiedStateSync.oauthToken"], "first-access");
    assert.equal(all[1]["antigravity.refreshToken"], "first-refresh");

    const current = JSON.parse(run(reader, [paths]));
    assert.equal(current["antigravityUnifiedStateSync.oauthToken"], "second-access");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

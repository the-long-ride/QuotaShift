import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
test("restart targets only detected Antigravity app executable", () => {
  const session = read("src-tauri/src/system/session.rs");
  const restart = read("src-tauri/src/system/session/restart.rs");
  assert.ok(session.includes("quit_antigravity_ide_at(executable)"));
  assert.ok(session.includes("verify_antigravity_restarted(executable)"));
  assert.ok(restart.includes("QS_RESTART_TARGET"));
  assert.ok(restart.includes("Get-CimInstance Win32_Process"));
  assert.ok(restart.includes("same_executable(candidate, executable)"));
  assert.ok(!restart.includes('"/F", "/T", "/PID"'));
});
test("persistent quota workers and IDE language servers are not CLI processes", () => {
  const session = read("src-tauri/src/system/session.rs");
  const unix = read("src-tauri/src/system/session/unix.rs");
  assert.ok(session.includes("*antigravity-workers*"));
  assert.ok(unix.includes('contains("antigravity-workers")'));
  assert.ok(!unix.includes('lower.contains("language_server")'));
});

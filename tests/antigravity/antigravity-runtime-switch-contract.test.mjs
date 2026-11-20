import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

const read = (path) => readWithCssImports(path);

const slice = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  const tail = source.slice(from);
  const to = tail.indexOf(end);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return tail.slice(0, to);
};

test("Antigravity Apply delegates IDE and CLI switching to one backend operation", () => {
  const app = read("src/App.tsx");
  const apply = slice(
    app,
    "const handleApplyAntigravityAccount = async",
    "const handleDeleteAntigravityAccount = async",
  );

  assert.match(apply, /switch_antigravity_account/);
  assert.doesNotMatch(apply, /quit_antigravity_ide/);
  assert.doesNotMatch(apply, /open_antigravity_ide/);
  assert.doesNotMatch(apply, /write_antigravity_session/);
});

test("Antigravity switch result uses toast instead of the header status badge", () => {
  const app = read("src/App.tsx");
  const apply = slice(
    app,
    "const handleApplyAntigravityAccount = async",
    "const handleDeleteAntigravityAccount = async",
  );
  const header = read("src/components/common/header/Header.tsx");
  const toast = read("src/components/common/Toast.tsx");

  assert.match(app, /<Toast/);
  assert.match(apply, /showToast\(/);
  assert.match(apply, /restartFailures\.length/);
  assert.match(apply, /:\s*switchResult\.message/);
  assert.match(apply, /if \(skipConfirm && restartFailures\.length\)/);
  assert.doesNotMatch(apply, /setStatusText\(switchResult\.message\)/);
  assert.match(toast, /role="status"/);
  assert.match(toast, /onDismiss/);
});

test("backend detects IDE and agy CLI and preserves the exact IDE executable", () => {
  const session =
    read("src-tauri/src/system/session.rs") +
    read("src-tauri/src/system/session/switch_message.rs");
  const lib = read("src-tauri/src/lib.rs");

  assert.match(session, /AntigravityRuntimeState/);
  assert.match(session, /AntigravitySwitchResult/);
  assert.match(session, /detect_antigravity_runtime/);
  assert.match(session, /agy/);
  assert.match(session, /antigravity-cli/);
  assert.match(session, /runtime\.ide_executable/);
  assert.match(session, /stop_antigravity_cli/);
  assert.match(session, /open_antigravity_ide_at/);
  assert.match(session, /CLI switched/);
  assert.match(session, /run agy again/);
  assert.match(lib, /switch_antigravity_account/);
});

test("Apply confirmation reports rejected account switches instead of dropping the promise", () => {
  const modals = read("src/components/app/AppModals.tsx");
  const apply = slice(modals, "{accountPendingApply &&", "<MonitoredAccountsModal");
  assert.match(apply, /Promise\.resolve\(\)/);
  assert.match(apply, /\.catch\(\(error: unknown\)/);
  assert.match(apply, /Failed to apply account:/);
});

test("restart verification targets the selected executable rather than any detected IDE", () => {
  const restart = read("src-tauri/src/system/session/restart.rs");
  assert.match(restart, /selected_ide_is_running\(executable\)/);
  const verify = slice(restart, "pub async fn verify_antigravity_restarted", "\\n}".replace(/\\n/, "\n"));
  assert.doesNotMatch(verify, /detect_antigravity_runtime\(\)/);
});

test("Apply excludes isolated quota workers from user-facing IDE detection", () => {
  const session = read("src-tauri/src/system/session.rs");
  const restart = read("src-tauri/src/system/session/restart.rs");
  const unix = read("src-tauri/src/system/session/unix.rs");
  assert.match(session, /\$_.Name -eq 'Antigravity.exe' -and \$_.CommandLine -notlike '\*antigravity-workers\*'/);
  assert.match(restart, /\$_.CommandLine -notlike '\*antigravity-workers\*'/);
  assert.match(unix, /pub fn is_antigravity_ide_process[\s\S]*?contains\("antigravity-workers"\)/);
});

test("Windows CLI stop reports termination failure before credentials are written", () => {
  const session = read("src-tauri/src/system/session.rs");
  assert.match(session, /Stop-Process -Id \$target\.ProcessId -Force -ErrorAction Stop/);
  assert.match(session, /if \(\$remaining\.Count -gt 0\)/);
  const apply = slice(session, "pub async fn switch_antigravity_account", "pub async fn read_codex_auth");
  assert.ok(apply.indexOf("let (cli_stopped, cli_stop_error)") < apply.indexOf("if let Err(write_error)"));
});

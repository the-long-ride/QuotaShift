import test from "node:test";
import assert from "node:assert/strict";

const { buildApplyDialogMessage } = await import("../../.test-build/common/restart-on-switch.js");

test("restart on: Antigravity dialog names IDE, desktop app and agy CLI", () => {
  const msg = buildApplyDialogMessage("antigravity", "Work", true);
  assert.match(msg, /Applying "Work"/);
  assert.match(msg, /IDE or desktop app is closed and reopened/);
  assert.match(msg, /agy CLI is stopped and reopened in a new terminal window/);
  assert.match(msg, /not running is left alone/);
});

test("restart on: Codex dialog names desktop app, CLI and IDE extension", () => {
  const msg = buildApplyDialogMessage("codex", "Work", true);
  assert.match(msg, /desktop app is closed and reopened/);
  assert.match(msg, /Codex CLI sessions and IDE extension processes are stopped/);
  assert.match(msg, /not running is left alone/);
});

test("restart off: dialogs say running apps are not touched", () => {
  assert.match(
    buildApplyDialogMessage("codex", "Work", false),
    /without touching running Codex apps/,
  );
  assert.match(
    buildApplyDialogMessage("antigravity", "Work", false),
    /keep the old account until restarted/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { buildCodexRestartMessage, buildCodexNoRestartMessage } =
  await import("../../.test-build/codex/codex-restart-message.js");

const none = {
  cliKilled: false,
  desktopKilled: false,
  ideExtensionKilled: false,
  desktopRelaunched: false,
};

test("nothing running keeps the short message", () => {
  assert.equal(buildCodexRestartMessage(none, "Work"), "Applied Codex account: Work");
});

test("all variants are reported", () => {
  const msg = buildCodexRestartMessage(
    { cliKilled: true, desktopKilled: true, ideExtensionKilled: true, desktopRelaunched: true },
    "Work",
  );
  assert.match(msg, /desktop app restarted/);
  assert.match(msg, /VS Code extension reconnecting/);
  assert.match(msg, /run `codex resume`/);
});

test("desktop killed but not relaunched asks to reopen", () => {
  const msg = buildCodexRestartMessage({ ...none, desktopKilled: true }, "Work");
  assert.match(msg, /reopen the desktop app/);
});

test("no-restart message explains old sessions", () => {
  assert.match(buildCodexNoRestartMessage("Work"), /keep the old account until restarted/);
});

test("apply hooks pass the restart preference", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  const ag = read("src/hooks/antigravity/useAntigravityAccountOps.ts");
  const cx = read("src/hooks/codex/useCodexAccountOps.ts");
  assert.match(ag, /const restart = loadRestartOnSwitch\(\)/);
  assert.match(ag, /email: acc\.email,\s*restart,/);
  assert.match(cx, /const restart = loadRestartOnSwitch\(\)/);
  assert.match(cx, /if \(restart\)[\s\S]{0,120}kill_codex_processes/);
  assert.match(cx, /relaunch_codex_desktop/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCodexRestartMessage } from "../../.test-build/codex/account/codex-restart-message.js";

const base = {
  cliKilled: true,
  desktopKilled: false,
  ideExtensionKilled: false,
  desktopRelaunched: false,
};

test("restore summary replaces the run-codex-resume hint", () => {
  assert.equal(
    buildCodexRestartMessage(
      { ...base, cliSummary: "Codex CLI resumed in F:\\repo (same tab)." },
      "Work",
    ),
    "Applied Codex account: Work. Codex CLI resumed in F:\\repo (same tab).",
  );
});

test("without a summary the old hint stays", () => {
  assert.equal(
    buildCodexRestartMessage(base, "Work"),
    "Applied Codex account: Work. CLI stopped — run `codex resume` to continue.",
  );
});

test("account switch restores the CLI after writing auth", () => {
  const ops = readFileSync("src/hooks/codex/useCodexAccountOps.ts", "utf8");
  const restore = readFileSync("src/utils/codex/account/codex-restore.ts", "utf8");
  assert.match(restore, /"restore_codex_cli"/);
  assert.match(ops, /restoreStoppedCodexCli\(killed\)/);
  assert.ok(ops.indexOf("write_codex_auth") < ops.indexOf("restoreStoppedCodexCli(killed)"));
});

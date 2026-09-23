import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("Claude guardrails suspend Claude-owned backends without suspending IDE hosts or usage probes", () => {
  const process = read("src-tauri/src/claude/process.rs");
  const classify = read("src-tauri/src/claude/process/classify.rs");
  const native = read("src-tauri/src/claude/process/native.rs");
  const ideProcess = read("src-tauri/src/claude/ide_process.rs");
  const hook = read("src/hooks/claude/useClaudeAccountMonitor.ts");

  assert.match(ideProcess, /pub\s+fn\s+is_ide_host_process\s*\(/);
  assert.match(ideProcess, /pub\s+fn\s+is_claude_ide_backend_process\s*\(/);
  assert.match(ideProcess, /code|vscode/i);
  assert.match(ideProcess, /cursor/i);
  assert.match(ideProcess, /windsurf/i);
  assert.match(ideProcess, /codium|vscodium/i);
  assert.match(classify, /if\s+is_ide_host_process\([^)]*\)\s*\{\s*return\s+false;/s);
  assert.match(classify, /is_claude_usage_probe/);
  assert.match(classify, /CLAUDE_CONFIG_DIR/);
  assert.match(classify, /process\.parent\(\)/);
  assert.match(process, /ide_backend_suspended/);
  assert.match(process, /suspend_claude_account_processes/);
  assert.match(native, /NtSuspendProcess/);
  assert.match(native, /NtResumeProcess/);
  assert.match(hook, /suspend_claude_account_processes/);
  assert.doesNotMatch(hook, /kill_claude_processes/);
});

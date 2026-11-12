import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");

test("agent api is loopback only, token-gated and disabled by default", () => {
  const commands = read("src-tauri/src/agent_api/commands.rs");
  const server = read("src-tauri/src/agent_api/server.rs");
  assert.ok(commands.includes('TcpListener::bind(("127.0.0.1", port))'));
  assert.ok(commands.includes("Generate an API key before enabling"));
  assert.ok(server.includes("matches_bearer"));
  assert.ok(server.includes("headers.contains_key(header::ORIGIN)"));
  assert.ok(server.includes("StatusCode::FORBIDDEN"));
  assert.ok(server.includes("DefaultBodyLimit::max(4096)"));
});

test("response DTO has no alias, email or authentication fields", () => {
  const dto = read("src-tauri/src/agent_api/state.rs");
  const server = read("src-tauri/src/agent_api/server.rs");
  const snapshot = read("src/utils/agent-api/snapshot.ts");
  assert.ok(dto.includes("deny_unknown_fields"));
  assert.ok(dto.includes("pub remaining_percent: Option<u8>"));
  assert.ok(!dto.includes("pub email:"));
  assert.ok(!dto.includes("pub alias:"));
  assert.ok(!dto.includes("pub token:"));
  assert.ok(server.includes('"accounts": snapshot.accounts'));
  assert.ok(snapshot.includes("Never include account objects"));
  assert.ok(snapshot.includes("!pool.quotaCarried"));
});

test("agent writes dispatch through the existing apply hooks with identity verification", () => {
  const bridge = read("src/hooks/app/useAgentApiBridge.ts");
  const coordinator = read("src/hooks/app/useAppAccountOperations.ts");
  const codex = read("src/hooks/codex/useCodexAccountOps.ts");
  assert.ok(coordinator.includes("useAgentApiBridge({"));
  assert.ok(bridge.includes('listen<RotationEvent>("quotashift:agent-rotation"'));
  assert.ok(bridge.includes("agent_api_finish_rotation"));
  assert.ok(bridge.includes("findAntigravityAccountMatch"));
  assert.ok(bridge.includes("findCodexAccountMatch"));
  assert.ok(codex.includes("if (skipConfirm) throw err"));
});

test("agent skill install and environment variable instructions are secret free", () => {
  const native = read("src-tauri/src/agent_api/skills.rs");
  const ui = read("src/components/common/agent-api/AgentApiSettings.tsx");
  assert.ok(native.includes(".agents"));
  assert.ok(native.includes(".claude"));
  assert.ok(native.includes(".gemini"));
  assert.ok(native.includes("QUOTASHIFT_AGENT_API_KEY"));
  assert.ok(native.includes("Refusing to overwrite existing user skill"));
  assert.ok(ui.includes("Test API connection"));
  assert.ok(ui.includes("Copy PowerShell environment setup"));
  assert.ok(!ui.includes("localStorage.setItem(ENABLED_KEY, revealedKey)"));
});

test("auto and direct account selection require different pool constraints", () => {
  const policy = read("src-tauri/src/cli_pools/agent_selection.rs");
  assert.ok(policy.includes("resolve_agent_request"));
  assert.ok(policy.includes("NotSavedAccount"));
  assert.ok(policy.includes("directly_selects_a_saved_account_outside_cli_pools"));
  assert.ok(policy.includes("explicit_pool_id_cannot_override_membership"));
});

test("agent API cannot disable itself mid-rotation and bounds operation history", () => {
  const commands = read("src-tauri/src/agent_api/commands.rs");
  const server = read("src-tauri/src/agent_api/server.rs");
  assert.ok(commands.includes("Agent rotation is in progress"));
  assert.ok(server.includes("ops.len() > 128"));
  assert.ok(server.includes('op.status != "pending"'));
});

test("automatic CLI pool rotation uses preflight and continuation command with explicit safety gates", () => {
  const bridge = read("src/hooks/app/useAgentApiBridge.ts");
  const auto = read("src/hooks/app/useCliPoolAutoFailover.ts");
  const native = read("src-tauri/src/cli_pools/runtime.rs");
  const cli = read("src-tauri/src/system/cli_restore/restore.rs");
  assert.ok(bridge.includes("useCliPoolAutoFailover(props, switchBusy)"));
  assert.ok(bridge.includes("TRACKED_POLL_INTERVAL_CHANGED_EVENT"));
  assert.ok(auto.includes("recordQuotaEvidence"));
  assert.ok(auto.includes("cli_pool_preflight_auto_rotation"));
  assert.ok(auto.includes("cli_pool_arm_continuation"));
  assert.ok(auto.includes("cli_pool_continuation_succeeded"));
  assert.ok(auto.includes("cli_pool_clear_continuation"));
  assert.ok(native.includes("pool.switch_when_idle_only"));
  assert.ok(native.includes("scan_cli_instances"));
  assert.ok(native.includes("plan_rotation"));
  assert.ok(cli.includes("continuation::take_for(snap)"));
  assert.ok(cli.includes("continuation::mark_result"));
});

test("automatic rotation revalidates pool binding, target quota and candidate after native preflight", () => {
  const auto = read("src/hooks/app/useCliPoolAutoFailover.ts");
  const guard = read("src/hooks/app/cliPoolAutoPreflightGuard.ts");
  assert.ok(auto.includes("assertAutoRotationStillEligible({"));
  assert.ok(guard.includes("loadCliRotationBindings(updatedPools)"));
  assert.ok(guard.includes("updatedPool.accountIds.join"));
  assert.ok(guard.includes("nextEligibleCandidate(updatedPool"));
  assert.ok(guard.includes("observePoolQuota(provider, latestEntry"));
  assert.ok(guard.includes("latestReading.resetAt !== resetEpoch"));
});

test("agent idempotent account requests must verify the effective native identity", () => {
  const bridge = read("src/hooks/app/useAgentApiBridge.ts");
  assert.ok(bridge.includes("const nativeAg = extractAntigravitySessionAccount"));
  assert.ok(bridge.includes("const nativeCodex = parseCodexLocalAuth"));
  assert.ok(bridge.includes("state.activeAntigravityId !== account.id || !agMatches"));
  assert.ok(bridge.includes("state.activeCodexId !== account.id || !codexMatches"));
});

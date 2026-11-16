---
schema_version: 1
id: feature.agent-api-cli-failover
title: AI Agent API and CLI Failover
kind: feature
status: verified
summary: "Opt-in loopback AI Agent API with OS-keyring Bearer auth and managed agent skills, paired with experimental CLI Account Rotation Pools featuring live idle probing, cwd disambiguation, and resume verification."
tags: ["agent-api", "cli-pools", "failover", "idle-probe", "skills"]
source_paths: ["src-tauri/src/agent_api/commands.rs", "src-tauri/src/agent_api/key.rs", "src-tauri/src/agent_api/mod.rs", "src-tauri/src/agent_api/operations.rs", "src-tauri/src/agent_api/server.rs", "src-tauri/src/agent_api/skills.rs", "src-tauri/src/agent_api/skills_fs.rs", "src-tauri/src/agent_api/skills_tests.rs", "src-tauri/src/agent_api/state.rs", "src-tauri/src/agent_api/terminal.rs", "src-tauri/src/cli_pools/agent_selection.rs", "src-tauri/src/cli_pools/apply/mod.rs", "src-tauri/src/cli_pools/apply/tests.rs", "src-tauri/src/cli_pools/command/mod.rs", "src-tauri/src/cli_pools/command/tests.rs", "src-tauri/src/cli_pools/continuation_commands.rs", "src-tauri/src/cli_pools/controller/disambiguate.rs", "src-tauri/src/cli_pools/controller/mod.rs", "src-tauri/src/cli_pools/controller/tests.rs", "src-tauri/src/cli_pools/conversation/mod.rs", "src-tauri/src/cli_pools/conversation/tests.rs", "src-tauri/src/cli_pools/events.rs", "src-tauri/src/cli_pools/idle.rs", "src-tauri/src/cli_pools/journal/mod.rs", "src-tauri/src/cli_pools/journal/tests.rs", "src-tauri/src/cli_pools/launch/mod.rs", "src-tauri/src/cli_pools/launch/tests.rs", "src-tauri/src/cli_pools/locks.rs", "src-tauri/src/cli_pools/locks/tests.rs", "src-tauri/src/cli_pools/mod.rs", "src-tauri/src/cli_pools/process_inventory.rs", "src-tauri/src/cli_pools/process_inventory/tests.rs", "src-tauri/src/cli_pools/quota.rs", "src-tauri/src/cli_pools/quota/tests.rs", "src-tauri/src/cli_pools/runtime.rs", "src-tauri/src/cli_pools/shutdown.rs", "src-tauri/src/cli_pools/shutdown/tests.rs", "src-tauri/src/cli_pools/types.rs", "src-tauri/src/cli_pools/validation.rs", "src-tauri/src/cli_pools/validation/tests.rs", "src/components/common/agent-api/AgentApiEndpointsReference.tsx", "src/components/common/agent-api/AgentApiGuidance.tsx", "src/components/common/agent-api/AgentApiIcons.tsx", "src/components/common/agent-api/AgentApiKeyPanels.tsx", "src/components/common/agent-api/AgentApiModal.tsx", "src/components/common/agent-api/AgentApiModalChrome.tsx", "src/components/common/agent-api/AgentApiSettings.tsx", "src/components/common/agent-api/AgentApiSkillsSection.tsx", "src/components/common/agent-api/agentApiPowerShellSetup.ts", "src/components/common/cli-pools/CliPoolAccountItem.tsx", "src/components/common/cli-pools/CliPoolAccountList.tsx", "src/components/common/cli-pools/CliPoolCardItem.tsx", "src/components/common/cli-pools/CliPoolEditor.tsx", "src/components/common/cli-pools/CliPoolFilters.tsx", "src/components/common/cli-pools/CliPoolIcons.tsx", "src/components/common/cli-pools/CliPoolModal.tsx", "src/components/common/cli-pools/CliPoolSearchFilterBar.tsx", "src/components/common/cli-pools/CliRotationSettings.tsx", "src/hooks/app/cliPoolAutoPreflightGuard.ts", "src/hooks/app/useAgentApiBridge.ts", "src/hooks/app/useCliPoolAutoFailover.ts", "src/styles/settings/agent-api.css", "src/utils/agent-api/freshness.ts", "src/utils/agent-api/snapshot.ts", "src/utils/cli-pools/account-order.ts", "src/utils/cli-pools/auto-failover.ts", "src/utils/cli-pools/normalize.ts", "src/utils/cli-pools/preferences.ts", "src/utils/cli-pools/restore.ts", "src/utils/cli-pools/tier-filter.ts", "src/utils/cli-pools/types.ts"]
related_specs: ["architecture.system-overview", "architecture.security-credentials", "feature.provider-monitoring-switching", "architecture.desktop-shell-overlay", "interface.settings-configuration", "workflow.backup-recovery"]
last_doc_update_at: "2026-11-15T18:57:14Z"
last_verified_at: "2026-11-15T18:57:14Z"
last_verified_code_commit: 7a0913bd6c2aca62395d780a783ed20d078d2635
last_source_change_commit: 4f808eb55b3a700cd9896bf905649ed4d41aee0a
last_source_change_at: "2026-11-16T01:57:03+07:00"
source_fingerprint: "sha256:667bdc89ecc3780832a086bbd0c47a54953e86c0cfbb3dc46fcc3b3f21045cda"
---

# 09 — AI Agent API and CLI Failover

**Audience:** engineers & AI agents · **Verified against:** `1.3.0` · **Date:** 2026-11-16

QuotaShift provides two coordinated automation surfaces for `antigravity` (`agy`) and `codex`:

1. **Local AI Agent API**: an opt-in, OS-keyring-authenticated loopback HTTP API (`127.0.0.1`) that exposes privacy-redacted account/pool state and dispatches asynchronous account rotations through the main window's verified Apply hooks.
2. **CLI Account Rotation Pools & Auto-Failover**: per-provider ordered account pools (`agy` and `codex`) with an experimental two-sample quota-exhaustion detector, live CLI process preflight (idle probing and multi-process disambiguation), and one-shot continuation prompt injection across CLI restarts.

CLI Account Rotation Pools are strictly separate from **Codex Model Pools V2** (`quotashift_codex_model_pools_v2` and the `/v1/responses` + `/v1/messages` router). Both automated paths serialize account switches in `useAgentApiBridge` through a single shared `switchBusy` lock so unattended failover and Agent API calls cannot race on credentials.

---

## 1. Local AI Agent API

### Network, CORS, and authentication invariants

- **Disabled by default**: `quotashift_agent_api_enabled_v1` defaults to `"false"`. Startup auto-start occurs only when `"true"` is persisted locally and an API key already exists in the OS keyring.
- **Loopback-only binding**: `agent_api_start` binds strictly to `TcpListener::bind(("127.0.0.1", port))` with `port` in `1024..=65535` (default `45692`).
- **No CORS & browser isolation**: `authenticate()` rejects any request containing an `Origin` header (`403 Forbidden`) and rejects any `Host` whose hostname (before `:`) is not `localhost` or `127.0.0.1` (`403 Forbidden`).
- **Body size limit**: `DefaultBodyLimit::max(4096)` caps all HTTP request bodies at 4 KB.
- **Constant-time Bearer check**: `matches_bearer()` hashes the supplied `Authorization` header and `"Bearer <expected>"` with SHA-256 and compares all 32 bytes in constant time (`401 Unauthorized` on mismatch).
- **OS keyring secret lifecycle** (`src-tauri/src/agent_api/key.rs`):
  - Stored under keyring service `"com.the-long-ride.quotashift.agent-api"`, user `"agent-api-key-v1"`.
  - `agent_api_generate_key` generates 32 cryptographically random bytes encoded as `URL_SAFE_NO_PAD` base64.
  - `agent_api_set_key` validates manual keys after trimming: length `16..=512`, no whitespace or control characters.
  - Both key commands refuse to replace the key while the listener is running (`"Stop the Agent API before replacing its key"`).
  - `agent_api_start` refuses to start when no key is configured (`"Generate an API key before enabling the Agent API"`).

### Local-only persistence (excluded from backups)

| Storage key (`localStorage`) | Default | Purpose | Backup status |
| --- | --- | --- | --- |
| `quotashift_agent_api_enabled_v1` | `"false"` | Whether listener auto-starts on app launch | Excluded (per-device opt-in) |
| `quotashift_agent_api_port_v1` | `"45692"` | Configured loopback port (`1024–65535`) | Excluded (per-device port) |
| `quotashift_agent_api_write_v2` | `"true"` (unless `"false"`) | **Allow account rotation** write gate | Excluded (privilege never imported) |

### Snapshot DTO & privacy contract

The frontend `useAgentApiBridge` hook builds `AgentApiSnapshot` via `buildAgentApiSnapshot()` and pushes it to Rust via `agent_api_publish_snapshot` whenever accounts, usage caches, active account IDs, or `quotashift:cli-rotation-configuration-changed` change.

- **Strict schema (`#[serde(deny_unknown_fields)]`)**: `PublicAgentAccount`, `PublicAgentPool`, and `AgentApiSnapshot` reject any extra fields such as `email`, `alias`, or `token`.
- **Snapshot validation (`AgentApiSnapshot::validate`)**: max `256` accounts, max `64` pools, provider strictly `"codex" | "antigravity"`, IDs `1..=160` ASCII `[A-Za-z0-9-_.:]`, unique `(provider, id)`, percentages `0..=100`, and pool `accountIds` must all exist in `accounts` for that provider.
- **Pool visibility**: `buildAgentApiSnapshot` publishes only `enabled === true` CLI pools, filters `accountIds` to saved accounts of that provider, and marks `active: true` for the pool matching `quotashift_cli_rotation_bindings_v1`.

### HTTP endpoints

| Method & Path | Auth / Gate | Success | Failure codes |
| --- | --- | --- | --- |
| `GET /v1/accounts` | Bearer token | `200 OK` `{ "accounts": PublicAgentAccount[] }` | `401`, `403`, `503` |
| `GET /v1/pools` | Bearer token | `200 OK` `{ "pools": PublicAgentPool[] }` | `401`, `403`, `503` |
| `POST /v1/rotation` | Bearer token + `write_enabled` | `202 Accepted` `AgentOperation` (`status: "pending"`) | `401`, `403` (origin/host or write disabled), `404`, `409` (conflict/ineligible/busy), `503` |
| `GET /v1/operations/{id}` | Bearer token | `200 OK` `AgentOperation` | `401`, `403`, `404`, `503` |

`PublicAgentAccount` fields: `id`, `provider` (`"antigravity" | "codex"`), `remainingPercent` (`u8 | null`), `usedPercent` (`u8 | null`), `resetAt` (`string | null`), `updatedAt` (`u64 | null`, epoch ms).
`PublicAgentPool` fields: `id`, `provider`, `accountIds` (`string[]`), `enabled` (`bool`), `active` (`bool`).
`AgentOperation` fields: `operationId`, `provider`, `accountId`, `status` (`"pending" | "running" | "succeeded" | "failed" | "timed_out"`), `updatedAt` (`u64`, epoch ms).

### Quota freshness & account selection policy

- **Frontend quota freshness (`verifiedAgentQuotaTimestamp` in `src/utils/agent-api/freshness.ts`)**:
  - Rejects entries with `error`, `loading: true`, or invalid/non-positive `fetchedAt`.
  - **Antigravity**: requires `accuracy === "exact_grouped"` and `source === "exact" | "cloud"`. In `snapshot.ts`, `entry?.source === "exact"` supersedes `cloudQuotas` (`[]`), and any `cloudQuotas` pool with `quotaCarried: true` is excluded; if any pool in `reported` is `quotaCarried`, `aggregateCloudQuotasIntoPools()` recomputes solely from non-carried lanes.
  - **Codex**: requires `isOAuth === true` (API-key entries return `updatedAt: null`).
- **Server-side eligibility (`eligible()` in `src-tauri/src/agent_api/server.rs`)**: requires `remaining_percent > 0` and `updated_at` within `300_000` ms (5 minutes) of current epoch ms (`t <= now && now - t <= 300_000`).
- **Request resolution (`resolve_agent_request` in `src-tauri/src/cli_pools/agent_selection.rs`)**:
  - `AgentRotationRequest` accepts `mode: "auto"` (`provider`, optional `poolId`) or `mode: "account"` (`provider`, optional `poolId`, `accountId`), with `provider` accepting `"codex"`, `"agy"`, or `"antigravity"`.
  - **`mode: "auto"`**: requires an enabled CLI pool matching `provider` (explicit `poolId` or the currently `active` pool); selects the next non-exhausted member after `current_id` in pool order (`select_next_candidate_account`).
  - **`mode: "account"` without `poolId`**: may select any saved account for that provider outside CLI pools (`NotSavedAccount` if absent; `Exhausted` if ineligible).
  - **`mode: "account"` with `poolId`**: requires the named enabled pool, verifies `provider` matches, and requires `accountId` to be a member of that pool (`NotInPool` / `PoolMismatch` / `MissingPool`). Selecting the currently active account is permitted by policy and handled idempotently by the bridge.

### Asynchronous rotation lifecycle & identity verification

```
POST /v1/rotation ──► [pending] (active_operation = Some(id), 90s timeout armed)
                          │
   ┌──────────────────────┴───────────────────────┐
   ▼ (timeout before begin)                       ▼ (renderer calls agent_api_begin_rotation)
[failed] (lock released)                      [running]
                                                  │
                       ┌──────────────────────────┴──────────────────────┐
                       ▼ (90s timeout fires while running)               ▼ (renderer calls agent_api_finish_rotation)
                  [timed_out] (lock RETAINED!)                   [succeeded | failed] (lock released)
                       │
                       ▼ (renderer later calls agent_api_finish_rotation)
                   [failed] (lock released)
```

1. `POST /v1/rotation` acquires `active_operation` (returning `409 Conflict` if non-empty), creates a 16-byte random hex `operationId`, emits `"quotashift:agent-rotation"` to the `"main"` window, and spawns a 90-second `manager.timeout(id)` timer.
2. In `useAgentApiBridge.ts`, if `switchBusy.current` is already true, the handler immediately calls `agent_api_finish_rotation(id, false)`. Otherwise it claims the lock via `agent_api_begin_rotation(id)`.
3. Before writing credentials, the bridge checks the native local session (`read_antigravity_session` + `extractAntigravitySessionAccount` + `findAntigravityAccountMatch`, or `read_codex_auth` + `parseCodexLocalAuth` + `findCodexAccountMatch`). It calls `applyAntigravity(account, true)` or `applyCodex(account, true)` only when `active*Id !== account.id` or native identity does not match.
4. Both Apply hooks honor `skipConfirm = true` by bypassing confirmation dialogs and **throwing** if credentials fail or if `restartOnSwitch` is active and desktop/CLI restart or restoration fails (`isCodexRestartComplete` in `useCodexAccountOps.ts`; `restartFailures` in `useAntigravityAccountOps.ts`).
5. After apply, the bridge re-reads the native session to verify effective identity matches `account`, then calls `agent_api_finish_rotation(id, success)`.
6. `agent_api_stop` refuses to stop while `active_operation` is `Some(_)` (`"Agent rotation is in progress. Disable the API after it completes."`). Operation history bounds itself to `128` entries by pruning the oldest non-`pending`/non-`running` entry on completion.

### Tauri IPC commands (`agent_api`)

`agent_api_status`, `agent_api_generate_key`, `agent_api_set_key`, `agent_api_run_env_setup`, `agent_api_start`, `agent_api_test_connection`, `agent_api_stop`, `agent_api_publish_snapshot`, `agent_api_begin_rotation`, `agent_api_finish_rotation`, `agent_api_list_skills`, `agent_api_set_skill_installed`, `install_agent_skill`, `uninstall_agent_skill`.

### Terminal environment setup & managed agent skills

- **Automated terminal setup (`agent_api_run_env_setup`)**: reads the saved key from the OS keyring and opens a native shell to persist `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY` at user scope:
  - **Windows**: passes `QUOTASHIFT_SETUP_URL` and `QUOTASHIFT_SETUP_KEY` via child process environment to `powershell.exe` (`CREATE_NEW_CONSOLE`), calls `[Environment]::SetEnvironmentVariable(..., 'User')`, masks the key in printed commands (`<OS keyring secret>`), clears the setup env vars, and deletes the temp `.ps1` file.
  - **macOS / Linux**: writes a `0o700` `.sh` script that self-deletes (`rm -f "$0"`), updates fenced `# >>> quotashift-agent-api >>>` blocks in `~/.zshrc` + `~/.zprofile` + `launchctl setenv` (macOS) or `~/.bashrc`, optional `~/.zshrc`, and `~/.profile` (Linux) with `chmod 600`.
- **Copyable setup scripts (`agentApiPowerShellSetup.ts`)**: prompt interactively at runtime (`Read-Host ... -AsSecureString` + `ZeroFreeBSTR` on Windows; `stty -echo` on POSIX), never embed secrets, and never modify `PATH`.
- **Managed skill lifecycle (`src-tauri/src/agent_api/skills.rs` & `skills_fs.rs`)**:
  - Targets: `claude` (`~/.claude/skills/quotashift-rotation`), `codex` (`~/.agents/skills/quotashift-rotation`, also canonical path), `antigravity` (`~/.gemini/config/skills/quotashift-rotation`), and `opencode` (`~/.config/opencode/skills/quotashift-rotation`).
  - `SKILL.md` carries marker `<!-- quotashift-managed-agent-skill-v1 -->` and never embeds secrets.
  - Recognizes current and known legacy managed `SKILL.md` payloads (`http://127.0.0.1:45692` and legacy OpenCode section) so QuotaShift can upgrade or cleanly uninstall its own files, while **refusing** to overwrite or delete user-modified/user-authored manifests or conflicting symlinks.
  - When `codex` is uninstalled, any symlinks from other agents pointing to `~/.agents/skills/quotashift-rotation` are materialized first; when all four targets are uninstalled, the canonical `~/.agents/skills/quotashift-rotation` directory is removed if still managed.

### Agent API UI & Background Services integration

- **Settings entry (`AgentApiSettings.tsx`)**: under `Settings > Monitoring > AI Agent API`.
- **Configuration modal (`AgentApiModal.tsx`)**:
  - Header shows live `Running`/`Disabled` pill, `<CommonSwitch>` toggle (`Disable Agent API?` danger confirmation dialog when turning off), and `Close`.
  - **Connection**: port input (`1024–65535`, locked while running), **Allow account rotation** `<CommonSwitch>` (locked while running), `Endpoint` row with copy icon and `Test API connection` button (`agent_api_test_connection`), and collapsible `AgentApiEndpointsReference` (`API endpoints (4)`).
  - **API Key (`AgentApiKeyPanels.tsx`)**: manual input (`16+` chars, editable while stopped) with inline `Show`/`Hide`, `Copy`, `Rotate`/`Generate`, and `Save` icon buttons. Generated keys are displayed once in `revealedKey` and cleared on modal close.
  - **Agent environment setup & skills (`AgentApiGuidance.tsx`, `AgentApiSkillsSection.tsx`)**: OS-aware warning banner, copyable script, `Run in PowerShell` / `Run in Terminal`, per-agent `<CommonSwitch>` rows, and slash command guide (`/quotashift-rotation` for Claude Code & Antigravity, `$quotashift-rotation` or `/skills` for Codex, `/skills` + optional `opencode.jsonc` merge for OpenCode).
- **Header monitor (`BackgroundStatusModal.tsx`, `useBackgroundServicesStatus.ts`)**: polls `agent_api_status` every 3s, displays port (click-to-copy when running), `Access mode` (`Read & Rotate` vs `Read-only`), `API key` (`Configured` vs `Not set`), `Status` (`Listening` vs `Idle`), quick toggle switch (redirects to `AgentApiModal` if no key is configured; confirms before stopping), and `Configure` button.

---

## 2. CLI Account Rotation Pools & Experimental Automatic Failover

### Data model, storage, and backup rules

- **Pool definitions (`quotashift_cli_rotation_pools_v1`)**: `CliRotationPoolV1` contains `id`, `provider` (`"agy" | "codex"`), `name`, `accountIds` (ordered failover list, deduplicated, same-provider only), `enabled`, `autoSwitch`, `triggerWindows` (`"5h" | "weekly" | "monthly"`, default `["5h", "weekly"]`), `fallbackLatestEnabled` (default `false`), and `switchWhenIdleOnly` (default `true`).
- **Active provider bindings (`quotashift_cli_rotation_bindings_v1`)**: `CliRotationBindingsV1` (`agyActivePoolId`, `codexActivePoolId`). At most one `enabled` pool may be bound per provider (`validateCliPoolBinding` clears missing, disabled, or cross-provider bindings).
- **Preferences (`quotashift_cli_rotation_prompt_v1`)**: `CliRotationPreferencesV1` defaults to `enabled: false`, `continuationPrompt: "continue remaining works"`, `requiredFreshSamples: 2`, `minSampleSeparationSecs: 5`, `gracefulWaitSecs: 15`, `autoRestartAfterAppStart: false`.
  - Continuation prompt validation (`validateContinuationPrompt` / `validate_prompt`): non-empty when trimmed, `<= 2000` Unicode code points, no `\0` bytes.
- **Change notifications**: `saveCliRotationPools` and `saveCliRotationBindings` dispatch `window` event `"quotashift:cli-rotation-configuration-changed"`, prompting `useAgentApiBridge` to republish the Agent API snapshot immediately.
- **Backup parity (`restore.ts`, `settings-backup.ts`)**:
  - `quotashift_cli_rotation_pools_v1` and `quotashift_cli_rotation_prompt_v1` travel in encrypted v3 backups; `quotashift_cli_rotation_bindings_v1` is excluded (machine-local).
  - On restore (`mergeRestoredCliPools`), imported pools merge by `id` (preserving unrelated local pools), remap account IDs within their provider, force `autoSwitch: false`, and force `enabled: false` if any member ID is unresolved or cross-provider. Imported `CLI_ROTATION_PREFERENCES_KEY` forces `enabled: false` and `autoRestartAfterAppStart: false` while preserving the exact `continuationPrompt`.

### Active pool polling & quota evidence evaluation

- **Active pool polling (`useAgentApiBridge.ts`)**: when `loadCliRotationPreferences().enabled` is true, each provider's active account in an `enabled && autoSwitch` bound pool is refreshed on the tracked-account polling cadence (`TRACKED_POLL_INTERVAL_CHANGED_EVENT`), skipping accounts already present in `loadTrackedList()` to avoid double-fetching.
- **Failover preconditions (`useCliPoolAutoFailover.ts`)**: automatic failover evaluates only when `prefs.enabled === true`, `loadRestartOnSwitch() === true`, `!busy.current`, and the provider has a bound `enabled && autoSwitch` pool containing the active account.
- **Quota observation (`observePoolQuota` in `src/utils/cli-pools/auto-failover.ts`)**:
  - Freshness bound: `maxAgeMs = Math.max(300_000, trackedPollIntervalSecs * 2000)`. Rejects errored, loading, stale, future-timestamped, or already-past-reset (`resetAt <= now`) entries.
  - **Antigravity (`"agy"`)**: rejects `"monthly"` window, requires `accuracy === "exact_grouped"`, rejects any pool with `quotaCarried === true` or `fiveHourDisabled`/`weeklyDisabled === true`, and picks the **maximum** `remaining` across all reported pools (rotation triggers only when every reported pool has 0% remaining).
  - **Codex (`"codex"`)**: requires `isOAuth === true`, maps `5h -> primary`, `weekly -> secondary`, `monthly -> monthly`, and verifies window duration (when reported) is within ±5% of `300m` / `10080m` / `43200m` so daily limits cannot trigger weekly rotation.
- **Two-sample confirmation (`recordQuotaEvidence`)**:
  - Requires `remaining === 0` across at least `Math.max(2, prefs.requiredFreshSamples)` distinct `fetchedAt` samples within the same `resetAt` epoch, separated by at least `Math.max(5000, prefs.minSampleSeparationSecs * 1000)` ms.
  - Intermediate `null`/loading renders do not erase an existing sample unless its `lastFetchedAt` exceeds `maxAgeMs`.
  - Any non-zero reading or `resetAt` epoch change clears prior evidence. A `fired` flag prevents duplicate triggers within the same reset epoch, reinforced by a `300_000` ms (`COOLDOWN_MS`) per-`${provider}:${active}:${window}:${resetAt}` cooldown in `useCliPoolAutoFailover`.
- **Candidate selection (`nextEligibleCandidate`)**: scans `pool.accountIds` circularly starting after `activeId` and picks the first member whose Agent API snapshot has fresh (`<= maxAgeMs`) `remainingPercent > 0`.

### Native preflight, idle probing, disambiguation & command construction

`useCliPoolAutoFailover` invokes `cli_pool_preflight_auto_rotation` (`src-tauri/src/cli_pools/runtime.rs`), a **read-only** blocking command that never kills processes or writes credentials:

1. **Pool & unavailable-set checks**: validates `unavailable_account_ids` are subset of `pool.account_ids`; verifies `pool.enabled && pool.auto_switch && pool.account_ids.len() >= 2` and `current_account_id` is in `pool.account_ids`.
2. **Process inventory (`process_inventory.rs`)**: `scan_cli_instances` wraps `system::cli_restore::snapshot::build_snapshots` to detect live `agy`/`antigravity-cli` or `codex` instances, separating wrapper/shim `identity.executable` (e.g., `node.exe` running npm `codex.js`) from `launch_executable`, and recording `pid`, `started_at`, `related_pids`, `cwd`, and `args`.
3. **Idle-only gate (`pool.switch_when_idle_only === true`, `idle.rs`)**:
   - Requires **strictly 1** running CLI instance for `pool.provider` (0 or >1 instances block preflight).
   - `probe_cli_instance_idle()` verifies: `pid != 0`, PID still running with identical `started_at`, no active descendant process outside `related_pids` (`find_active_descendant`), summed CPU across `own_pids` over a 150ms interval is finite and `<= 2.0%`, and the matched Codex rollout `.jsonl` or Antigravity `~/.gemini/antigravity-cli/history.jsonl` entry/file has been quiet for at least `10` seconds.
4. **Multi-process disambiguation (`controller/disambiguate.rs`)**:
   - When `switch_when_idle_only === false` and multiple provider instances are running, `plan_rotation` calls `disambiguate_active_instance_with`.
   - Fails closed (`ControllerError::AmbiguousMultipleProcesses`) unless **every** candidate has a non-empty, distinct normalized `cwd` (`all_distinct_cwds`), and **strictly one** candidate has the newest resolved rollout/history timestamp within `ACTIVE_SESSION_WINDOW_SECS` (`300` seconds). Ties or stale (>5m) activity fail closed.
5. **Conversation resolution (`conversation/mod.rs`)**:
   - Precedence: (a) explicit CLI flag (`--conversation` for `agy`, `resume` for `codex`) validated with `valid_id`, (b) single matching history/rollout entry for `cwd` with `timestamp_secs >= started_at` when no peer instance shares that `cwd`, (c) `ResolutionOrigin::LatestFallback` only when `pool.fallback_latest_enabled` is true, `cwd` is non-empty, and total running provider instances `== 1`. Ambiguous peer instances or multiple candidate conversation IDs fail closed.
6. **Sanitized resume command (`command/mod.rs`)**:
   - `build_resume_command` validates the continuation prompt, filters out `FORBIDDEN_FLAGS` (`--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, `--yolo`, `--resume`, `resume`, `--last`, `--continue`, `--conversation`, `--prompt-interactive`, `--prompt`, `--print`), strips Codex security overrides (`-s`/`--sandbox=danger-full-access`, `-c`/`--config` keys `approval_policy`, `sandbox_mode`, `permissions`) as whole flag/value pairs, preserves ordinary flags, and appends Codex's prompt after `--`.
   - `preflight_auto_rotation_sync` verifies `Path::new(&plan.cwd).is_dir()` before returning `RotationPlan`.

### Race-safe revalidation, continuation handoff & clipboard fallback

1. **Post-preflight revalidation (`assertAutoRotationStillEligible` in `cliPoolAutoPreflightGuard.ts`)**: after `cli_pool_preflight_auto_rotation` resolves, re-checks `active*Id`, `loadCliRotationPreferences().enabled`, `loadRestartOnSwitch()`, bound pool existence/enabled/autoSwitch/member order/trigger windows, fresh `remaining === 0` with unchanged `resetEpoch`, and `nextEligibleCandidate(...) === nextId`.
2. **One-shot continuation arming (`continuation_commands.rs`, `system/cli_restore/continuation.rs`)**:
   - `cli_pool_arm_continuation(provider, pid, startedAt, prompt)` re-scans live instances to verify `pid` + `startedAt` still uniquely match 1 running instance, then arms the global `ContinuationSlot` (90s TTL, one-shot).
3. **Credential apply & CLI restore**:
   - Calls `applyAntigravity(account, true)` or `applyCodex(account, true)` (`skipConfirm = true`), which stops the CLI, writes credentials, and invokes `system::cli_restore::restore`.
   - `restore_one` (`system/cli_restore/restore.rs`) consumes the armed prompt via `continuation::take_for(snap)` (matching `kind`, `pid`, `started_at`), builds the resume command with `cli_pools::command::build_resume_command`, attempts in-place or respawned relaunch, polls up to 2.5s (`5 × 500ms`) via `verify_cli_running`, and records `continuation::mark_result(kind, pid, ok)`.
4. **Verification & fallback (`useCliPoolAutoFailover.ts`)**:
   - Verifies native local session identity (`verifyApplied`), then checks `cli_pool_continuation_succeeded(provider, pid)`.
   - Always clears the slot in `finally` via `cli_pool_clear_continuation`.
   - If credentials already switched (`credentialsSwitched === true`) but continuation did not succeed, best-effort copies `formatCommandSpec(plan.commandSpec)` to the clipboard and shows warning toast `"Switched account. Resume command copied to clipboard."`.

### Unwired Rust building blocks & remaining release gates

The following `src-tauri/src/cli_pools/` modules are implemented and unit-tested in Rust, but are **not yet wired** into the live frontend/Tauri rotation path (which currently uses `applyAntigravity`/`applyCodex` + `system::cli_restore`):

- `locks.rs`: `RotationLockManager` (per-`(provider, auth_domain)` RAII lock guard) and `preflight_rotation_compatibility` (blocking when Codex router has in-flight requests or is active without isolated `CODEX_HOME`).
- `quota.rs`: Rust-side `evaluate_exhaustion` and `QuotaDeduplicator` (mirrors frontend `auto-failover.ts` evidence rules).
- `shutdown.rs`: `stop_target_cli_instance` (PID + `started_at` + executable basename preflight before `taskkill /F` / `kill -9` after `grace_budget_secs`).
- `apply/mod.rs`: `apply_cli_credentials` explicitly returns `Err(ApplyError::RuntimeIntegrationUnavailable(provider))` until a native secure account service adapter exists (`apply_codex_credentials_at` is test-only/helper).
- `launch/mod.rs`: `launch_resumed_cli` (`CREATE_NEW_CONSOLE` spawn helper).
- `journal/mod.rs` & `events.rs`: `HandoffJournalV1` state machine (`Snapshotted -> OldProcessExited -> NewAccountApplied -> NewProcessLaunched -> VerifiedResumed | Failed(reason)`), atomic temp+`sync_all`+rename persistence, `list_active_journals`/`dismiss_journal`, and `CliRotationEvent`. Startup journal scanning and recovery UI ("Copy command" / "Dismiss") are not yet wired.
- `tests/cli-pools/windows/scenario-matrix.test.mjs`: 7 Windows real-CLI end-to-end acceptance scenarios remain `test.todo`.

### CLI Pools UI

- **Pool management (`CliPoolModal.tsx`, `CliPoolEditor.tsx`, `CliPoolCardItem.tsx`, `CliPoolSearchFilterBar.tsx`)**: mounted from **CLI Pools** buttons in `AntigravityTab.tsx` and `CodexAccountBar.tsx` / `CodexTabDialogs.tsx`. Supports active pool dropdown, pool name search, `All`/`Active`/`Unactive` filters, member selection with tier badges (`tier-filter.ts`), rotation order (`▲`/`▼`, selected accounts ordered first via `orderCliPoolAccounts`), trigger window switches (`5h`, `weekly`, `monthly`), and ordered behavior switches (`Enable this pool` → `Automatic Quota Switching` → `Allow Fallback to Latest Session` → `Switch Only When Process Is Idle`), all using `<CommonSwitch>` (no native checkboxes).
- **Settings (`CliRotationSettings.tsx`)**: mounted in `BehaviorSettingsSection.tsx` under `CLI Rotation`. Provides the `CLI account rotation <Experimental>` toggle and `Continuation prompt` textarea (`0–2000` chars) with `Reset` (prompt-only) and `Save` actions.

**Back to →** [01 — System Overview](01-system-overview.md)

## Code map

| Layer | Paths | Responsibility |
| --- | --- | --- |
| Agent API Rust Gateway & Keys | `src-tauri/src/agent_api/{mod,commands,server,key,operations,state,terminal,skills,skills_fs}.rs` | Loopback HTTP gateway (`127.0.0.1`), OS keyring Bearer auth, 90s rotation lock, terminal setup, managed skills |
| CLI Pools Selection & Safety | `src-tauri/src/cli_pools/{agent_selection,runtime,idle,process_inventory,continuation_commands}.rs`, `controller/**`, `conversation/**`, `command/**` | Agent API selection policy, live `probe_cli_instance_idle`, 5m `cwd` disambiguation, conversation resolution, flag sanitization |
| Unwired CLI Pools Foundations | `src-tauri/src/cli_pools/{locks,quota,shutdown,events}.rs`, `{apply,launch,journal}/mod.rs` | Tested lock/quota/shutdown/journal/event primitives awaiting full native handoff & startup recovery wiring |
| Frontend Bridges & UI | `src/hooks/app/{useAgentApiBridge,useCliPoolAutoFailover,cliPoolAutoPreflightGuard}.ts`, `src/utils/{agent-api,cli-pools}/**`, `src/components/common/{agent-api,cli-pools}/**` | Snapshot publishing, `switchBusy` serialization, two-sample exhaustion detector, clipboard fallback, Agent API & CLI Pool modals |

### Known UI copy drift (documented for follow-up)
- `AgentApiEndpointsReference.tsx` sample JSON still renders `"remainingPercent": 82.5` and ISO timestamp strings, whereas actual wire DTOs (`PublicAgentAccount`, `AgentOperation`) emit integer `0..=100` and epoch milliseconds (`u64`).
- `CliPoolEditor.tsx` and `CliRotationSettings.tsx` descriptive text still states that `Switch Only When Process Is Idle` blocks failover due to missing idle detection, whereas `probe_cli_instance_idle` (`cli_pools/idle.rs`) is now active in preflight.

# Claude Local Session Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only Claude main tab that automatically captures the current Claude Code session through the documented local status-line interface and displays local usage metadata without account management or remote service access.

**Architecture:** The existing QuotaShift executable gains a pre-Tauri `--claude-statusline-bridge` mode. An idempotent backend installer points Claude Code's user `statusLine` command at that mode while preserving/chaining an existing command, and the normal Tauri process reads a local snapshot for a dedicated read-only React tab.

**Tech Stack:** Rust 2021, serde/serde_json, Tauri 2, React 19, TypeScript, Node `node:test` contract tests, CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-claude-local-monitor-design.md`

## Global Constraints

- Use only Claude Code's documented local `statusLine` JSON input.
- Never read Claude auth credentials, cookies, browser storage, network traffic, undocumented endpoints, or Claude.ai pages.
- Never automate Claude prompts or service requests.
- Never persist prompt text, response text, or transcript contents.
- Claude has no account list, add-account flow, switching, login, pools, rename, delete, or Apply/Best actions.
- Preserve unrelated Claude user settings and preserve/chains an existing command-based status line.
- Existing Antigravity, Codex, tray, and desktop-overlay behavior must remain unchanged.

---

### Task 1: Backend Claude monitor and bridge

**Files:**
- Create: `src-tauri/src/claude_monitor.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Test: `tests/claude-monitor-contract.test.mjs`

**Interfaces:**
- Produces: `pub fn run_claude_statusline_bridge() -> Result<(), String>`
- Produces: Tauri command `ensure_claude_statusline_bridge() -> Result<ClaudeMonitorStatus, String>`
- Produces: Tauri command `get_claude_monitor_status() -> Result<ClaudeMonitorStatus, String>`
- Produces: serialized `ClaudeMonitorStatus` / `ClaudeSessionSnapshot` consumed by `App.tsx`

- [ ] **Step 1: Write the failing backend contract test**

Add assertions that `claude_monitor.rs` exists, exports bridge/install/read entry points, `lib.rs` registers both Tauri commands, and `main.rs` checks `--claude-statusline-bridge` before `tauri_app_lib::run()`.

- [ ] **Step 2: Run the backend contract test and verify RED**

Run: `node --test tests/claude-monitor-contract.test.mjs`
Expected: FAIL because `src-tauri/src/claude_monitor.rs` and Claude command registrations do not exist.

- [ ] **Step 3: Add Rust unit tests before implementation**

Inside `claude_monitor.rs`, define tests for a documented payload containing model/cost/context/rate-limit fields, a payload without `rate_limits`, status-line option preservation, idempotent bridge-marker recognition, and compact fallback output.

- [ ] **Step 4: Implement the minimal backend**

Implement path resolution, documented-payload normalization, atomic snapshot writes, previous-command chaining through the platform shell, settings preservation, bridge installation, Tauri commands, and the pre-Tauri main entry point. Never inspect auth/session credentials or transcript contents.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `node --test tests/claude-monitor-contract.test.mjs`
Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor`
Expected: both PASS.

### Task 2: Read-only Claude frontend tab

**Files:**
- Create: `src/components/ClaudeTab.tsx`
- Modify: `src/utils/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Test: `tests/claude-monitor-contract.test.mjs`

**Interfaces:**
- Consumes: `ClaudeMonitorStatus` returned by the two Tauri commands from Task 1.
- Produces: `<ClaudeTab status={claudeMonitorStatus} />` with no account-management callbacks.

- [ ] **Step 1: Extend the contract test for the frontend and verify RED**

Assert that App's main-tab union includes `claude`, the Claude tab button and `ClaudeTab` rendering exist, polling invokes `get_claude_monitor_status`, installation invokes `ensure_claude_statusline_bridge`, and `ClaudeTab.tsx` contains no Add Account / Apply / switch-account controls.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/claude-monitor-contract.test.mjs`
Expected: FAIL on the missing Claude React/type/style wiring.

- [ ] **Step 3: Implement the minimal TypeScript model and polling**

Add `ClaudeRateLimitWindow`, `ClaudeSessionSnapshot`, and `ClaudeMonitorStatus` interfaces. In App, install once, poll the local snapshot every 2000 ms, extend `activeTab`, add the Claude tab button, and render `ClaudeTab` without changing existing provider actions.

- [ ] **Step 4: Implement the read-only Claude UI and styles**

Render waiting/error/session states; optional 5-hour and 7-day used-percentage bars with resets; context used percentage/tokens; model/project/version/last capture; and cost/duration/current token/cache statistics. Add scoped `.claude-*` CSS only.

- [ ] **Step 5: Run contract test and frontend build and verify GREEN**

Run: `node --test tests/claude-monitor-contract.test.mjs`
Run: `rtk npm build`
Expected: PASS.

### Task 3: Regression verification and tracker sync

**Files:**
- Modify: `current-work.md`

**Interfaces:**
- Consumes: completed backend/frontend implementation.
- Produces: verified repo state and final work checkpoint.

- [ ] **Step 1: Run the complete Node contract suite**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run the Rust suite**

Run: `rtk cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS. If Aevra's worker limit prevents the full run, preserve the exact timeout as a verification limitation after targeted Claude Rust tests pass.

- [ ] **Step 3: Run production frontend build**

Run: `rtk npm build`
Expected: PASS.

- [ ] **Step 4: Review diff for compliance boundary**

Run: `rtk git diff`
Verify no Claude auth/token/cookie/network/remote-endpoint code exists and no account-management controls were added to Claude.

- [ ] **Step 5: Synchronize `current-work.md`**

Move completed items to checkpoints, leave only actual unresolved work under `## Remaining Work`, and record any test-environment limitation under Known Risks/Blockers.

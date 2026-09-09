# Claude Hybrid Local Usage Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Claude status-line capture on Windows and add passive local transcript-based usage monitoring so Claude Desktop Code users can see local usage without a separately installed Claude CLI.

**Architecture:** Keep the existing documented `statusLine` bridge as the exact source for current context and Pro/Max rate-limit percentages. Add a privacy-minimized parser over Anthropic’s documented local `~/.claude/projects/**/*.jsonl` application data, aggregate de-duplicated token activity for rolling 5-hour and 7-day windows, and select the freshest local session while never reading message content or credentials.

**Tech Stack:** Rust 2021, serde/serde_json, chrono, std filesystem/BufRead/OnceLock/Mutex, Tauri 2, React 19, TypeScript, Node `node:test`, CSS.

**Spec:** `docs/superpowers/specs/2026-09-09-claude-hybrid-local-usage-design.md`

## Global Constraints

- Claude monitoring makes no Anthropic network request.
- Never read Claude auth credentials, `~/.claude.json`, `.credentials.json`, cookies, browser storage, request headers, OAuth tokens, Claude.ai pages, or undocumented endpoints.
- Transcript fallback reads only `*.jsonl` beneath `~/.claude/projects/` and deserializes only timestamp/session/cwd/version/message-id/model/numeric usage metadata.
- Never define or deserialize transcript `content` in the local fallback structs.
- Never persist a raw transcript line or raw transcript payload.
- Exact 5-hour / 7-day subscription percentages remain statusLine-only; transcript tokens must not be converted into quota percentages.
- Claude retains no account list, add-account, login, account-switching, pool, delete, rename, Apply, or Best actions.
- Existing Antigravity, Codex, tray, and overlay behavior remain unchanged.
- Preserve an existing user command-based Claude status line and unrelated Claude settings.

---

### Task 1: Repair Windows status-line invocation

**Files:**
- Modify: `src-tauri/src/claude_monitor.rs`

**Interfaces:**
- Consumes: `BRIDGE_ARG` and executable `&Path`.
- Produces: `fn quoted_bridge_command(executable: &Path) -> String` that is shell-safe on Windows and preserves existing non-Windows behavior.

- [ ] **Step 1: Add failing platform-specific unit tests**

Add these tests beside the existing bridge-marker tests:

```rust
#[cfg(target_os = "windows")]
#[test]
fn [REDACTED]() {
    let command = quoted_bridge_command(Path::new(r"C:\Program Files\QuotaShift\quotashift.exe"));
    assert_eq!(
        command,
        "powershell -NoProfile -Command \"& 'C:/Program Files/QuotaShift/quotashift.exe' --claude-statusline-bridge\""
    );
}

#[cfg(target_os = "windows")]
#[test]
fn [REDACTED]() {
    let command = quoted_bridge_command(Path::new(r"C:\Users\O'Brien\QuotaShift\quotashift.exe"));
    assert!(command.contains("O''Brien"));
}
```

- [ ] **Step 2: Run targeted tests and verify RED**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor::tests::windows_bridge_command
```

Expected: FAIL because the current implementation returns a raw quoted Windows path.

- [ ] **Step 3: Implement the minimal platform-aware command builder**

Replace the current function with:

```rust
fn quoted_bridge_command(executable: &Path) -> String {
    #[cfg(target_os = "windows")]
    {
        let path = executable
            .to_string_lossy()
            .replace('\\', "/")
            .replace('\'', "''");
        return format!(
            "powershell -NoProfile -Command \"& '{path}' {BRIDGE_ARG}\""
        );
    }

    #[cfg(not(target_os = "windows"))]
    {
        let path = executable.to_string_lossy().replace('"', "\\\"");
        format!("\"{path}\" {BRIDGE_ARG}")
    }
}
```

- [ ] **Step 4: Run targeted Claude Rust tests and verify GREEN**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor
```

Expected: new command-generation tests and existing Claude tests PASS.

---

### Task 2: Add privacy-minimized transcript parsing and rolling observed usage

**Files:**
- Modify: `src-tauri/src/claude_monitor.rs`

**Interfaces:**
- Produces serialized `ClaudeObservedUsageWindow` and `ClaudeObservedUsage`.
- Produces private `LocalTranscriptRecord`, `LocalAssistantMessage`, and `LocalUsageFields` with no `content` field.
- Produces pure aggregation helper:

```rust
fn scan_local_transcripts_at(projects_root: &Path, now: chrono::DateTime<chrono::Utc>) -> LocalTranscriptScan
```

- `LocalTranscriptScan` contains `latest_main_session: Option<ClaudeSessionSnapshot>` and `observed_usage: Option<ClaudeObservedUsage>`.

- [ ] **Step 1: Add test-only transcript fixtures and failing de-duplication/window tests**

Use a temporary directory under `std::env::temp_dir()` with a UUID-free deterministic suffix from process ID/test name. Write JSONL fixtures containing only metadata plus an ignored `content` field. Add tests equivalent to:

```rust
#[test]
fn [REDACTED]() {
    let records = [
        transcript_line("msg-1", "2026-09-09T10:00:00Z", 10, 20, 30, 40),
        transcript_line("msg-1", "2026-09-09T10:00:01Z", 10, 20, 30, 40),
    ];
    let scan = scan_fixture(records, utc("2026-09-09T12:00:00Z"));
    let five = scan.observed_usage.unwrap().five_hour;
    assert_eq!(five.request_count, 1);
    assert_eq!(five.processed_tokens, 100);
}

#[test]
fn [REDACTED]() {
    let scan = scan_fixture(
        [
            transcript_line("five", "2026-09-09T08:00:00Z", 1, 2, 3, 4),
            transcript_line("seven", "2026-09-05T12:00:00Z", 10, 20, 30, 40),
            transcript_line("old", "2026-09-01T11:59:59Z", 100, 200, 300, 400),
        ],
        utc("2026-09-09T12:00:00Z"),
    );
    let usage = scan.observed_usage.unwrap();
    assert_eq!(usage.five_hour.request_count, 1);
    assert_eq!(usage.seven_day.request_count, 2);
}
```

- [ ] **Step 2: Run the new aggregation tests and verify RED**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor::tests::transcript
```

Expected: FAIL because transcript scanning types/functions do not exist.

- [ ] **Step 3: Add narrow local transcript structs**

Add exactly the metadata-only serde structs from the design:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalTranscriptRecord {
    timestamp: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
    version: Option<String>,
    message: Option<LocalAssistantMessage>,
}

#[derive(Debug, Deserialize)]
struct LocalAssistantMessage {
    id: Option<String>,
    model: Option<String>,
    usage: Option<LocalUsageFields>,
}

#[derive(Debug, Clone, Deserialize)]
struct LocalUsageFields {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}
```

Do not add a `content` property.

- [ ] **Step 4: Implement saturating observed-window accumulation**

Add:

```rust
fn add_usage(window: &mut ClaudeObservedUsageWindow, usage: &LocalUsageFields) {
    let input = usage.input_tokens.unwrap_or(0);
    let output = usage.output_tokens.unwrap_or(0);
    let cache_create = usage.cache_creation_input_tokens.unwrap_or(0);
    let cache_read = usage.cache_read_input_tokens.unwrap_or(0);
    window.request_count = window.request_count.saturating_add(1);
    window.input_tokens = window.input_tokens.saturating_add(input);
    window.output_tokens = window.output_tokens.saturating_add(output);
    window.cache_creation_input_tokens = window.cache_creation_input_tokens.saturating_add(cache_create);
    window.cache_read_input_tokens = window.cache_read_input_tokens.saturating_add(cache_read);
    window.processed_tokens = window.processed_tokens.saturating_add(
        input.saturating_add(output).saturating_add(cache_create).saturating_add(cache_read)
    );
}
```

Use a global `HashSet<String>` for message IDs during one scan.

- [ ] **Step 5: Implement recursive recent-file scanning**

Use `fs::read_dir`, metadata modified time, `BufReader<File>::lines()`, and `DateTime::parse_from_rfc3339`. Recurse only directories beneath the supplied projects root. Skip inaccessible entries/files and invalid JSONL lines. Skip files with modification time older than 8 days.

- [ ] **Step 6: Run aggregation tests and verify GREEN**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor::tests::transcript
```

Expected: de-duplication, rolling-window, malformed-line, and missing-root tests PASS.

---

### Task 3: Derive the freshest local session and merge exact plan windows safely

**Files:**
- Modify: `src-tauri/src/claude_monitor.rs`

**Interfaces:**
- Produces `ClaudeMonitorSource::{StatusLine, LocalTranscript, None}`.
- Extends `ClaudeMonitorStatus` with `source` and `local_usage`.
- Produces:

```rust
fn merge_monitor_sources(
    statusline: Option<ClaudeSessionSnapshot>,
    transcript: LocalTranscriptScan,
    now_ms: u64,
) -> (ClaudeMonitorSource, Option<ClaudeSessionSnapshot>, Option<ClaudeObservedUsage>)
```

- [ ] **Step 1: Add failing session-selection tests**

Add tests covering:

```rust
#[test]
fn [REDACTED]() {
    let statusline = snapshot_at(1_000, Some(20.0));
    let transcript = scan_with_main(snapshot_at(2_000, None));
    let (source, session, _) = merge_monitor_sources(statusline.into(), transcript, 2_000);
    assert_eq!(source, ClaudeMonitorSource::LocalTranscript);
    assert_eq!(session.unwrap().captured_at_ms, 2_000);
}

#[test]
fn [REDACTED]() {
    let statusline = snapshot_with_limits(1_000_000, 33.0, 44.0);
    let transcript = scan_with_main(snapshot_at(1_100_000, None));
    let (_, session, _) = merge_monitor_sources(Some(statusline), transcript, 1_100_000);
    let session = session.unwrap();
    assert_eq!(session.five_hour.unwrap().used_percentage, Some(33.0));
    assert_eq!(session.seven_day.unwrap().used_percentage, Some(44.0));
}

#[test]
fn [REDACTED]() {
    let statusline = snapshot_with_limits(1_000_000, 33.0, 44.0);
    let transcript = scan_with_main(snapshot_at(1_400_001, None));
    let (_, session, _) = merge_monitor_sources(Some(statusline), transcript, 1_400_001);
    assert!(session.unwrap().five_hour.is_none());
}
```

- [ ] **Step 2: Verify RED**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor::tests::newer_transcript claude_monitor::tests::fresh_statusline claude_monitor::tests::stale_statusline
```

Expected: FAIL because source model and merge helper do not exist.

- [ ] **Step 3: Implement transcript-derived current-session mapping**

For the newest main transcript record with usage:

```rust
let input = usage.input_tokens.unwrap_or(0);
let cache_create = usage.cache_creation_input_tokens.unwrap_or(0);
let cache_read = usage.cache_read_input_tokens.unwrap_or(0);
let total_input = input.saturating_add(cache_create).saturating_add(cache_read);
```

Populate the existing `ClaudeSessionSnapshot` fields exactly as defined in the spec. Keep unsupported exact fields `None`.

- [ ] **Step 4: Implement source merge and 5-minute exact-limit freshness rule**

Use `300_000` ms as the exact-limit freshness threshold. If transcript is newer and the normalized statusLine snapshot age is `<= 300_000`, copy only `five_hour` and `seven_day` to the transcript-derived snapshot; do not copy cost/context percentages from a different session.

- [ ] **Step 5: Add a two-second in-process transcript cache**

Use:

```rust
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

struct TranscriptCache {
    scanned_at: Instant,
    value: LocalTranscriptScan,
}

static TRANSCRIPT_CACHE: OnceLock<Mutex<Option<TranscriptCache>>> = OnceLock::new();
```

The production reader reuses the cached scan while `elapsed() < Duration::from_secs(2)`. Pure unit tests call `scan_local_transcripts_at` directly.

- [ ] **Step 6: Wire both Tauri status commands through the merged monitor builder**

`monitor_status(installed, settings_path)` must read the normalized statusLine snapshot, read cached local transcript scan, merge sources, and return `ClaudeMonitorStatus { installed, settings_path, source, session, local_usage, error: None }`.

- [ ] **Step 7: Run all targeted Claude Rust tests and verify GREEN**

Run:

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor
```

Expected: all Claude monitor unit tests PASS.

---

### Task 4: Expose hybrid source/usage types and update the Claude UI

**Files:**
- Modify: `src/utils/types.ts`
- Modify: `src/components/ClaudeTab.tsx`
- Modify: `src/styles.css`
- Modify: `tests/claude-monitor-contract.test.mjs`

**Interfaces:**
- Consumes backend JSON fields `source` and `localUsage`.
- Produces TypeScript `ClaudeMonitorSource`, `ClaudeObservedUsageWindow`, `ClaudeObservedUsage`.
- `ClaudeTab` remains `React.FC<{ status: ClaudeMonitorStatus }>`.

- [ ] **Step 1: Extend Node contract tests first**

Add assertions that:

```javascript
assert.match(types, /type ClaudeMonitorSource\s*=\s*"statusLine"\s*\|\s*"localTranscript"\s*\|\s*"none"/);
assert.match(types, /interface ClaudeObservedUsageWindow/);
assert.match(types, /localUsage:\s*ClaudeObservedUsage\s*\|\s*null/);
assert.match(tab, /Local activity/i);
assert.match(tab, /processed tokens/i);
assert.match(tab, /Exact Claude plan-limit percentages/i);
assert.doesNotMatch(tab, /current session will appear after Claude Code emits its next status update/i);
```

Keep the existing no-account-control assertions.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```text
node --test tests/claude-monitor-contract.test.mjs
```

Expected: FAIL because the hybrid types/copy are missing.

- [ ] **Step 3: Add TypeScript types**

Add:

```typescript
export type ClaudeMonitorSource = "statusLine" | "localTranscript" | "none";

export interface ClaudeObservedUsageWindow {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  processedTokens: number;
}

export interface ClaudeObservedUsage {
  fiveHour: ClaudeObservedUsageWindow;
  sevenDay: ClaudeObservedUsageWindow;
  capturedAtMs: number;
}
```

Extend `ClaudeMonitorStatus` with:

```typescript
source: ClaudeMonitorSource;
localUsage: ClaudeObservedUsage | null;
```

- [ ] **Step 4: Update the waiting/no-data state**

Render `No local Claude Code activity found yet` when no session exists. Copy must explain that local Claude Code/Claude Desktop Code data is supported, while Claude.ai web-only usage is not available through a documented local API.

- [ ] **Step 5: Render exact plan usage only when exact windows exist**

Keep `UsageLane` for actual `fiveHour` / `sevenDay` rate-limit data. Do not render zero-width fake lanes when both are absent. When absent, show the exact-plan explanation from the spec.

- [ ] **Step 6: Render locally observed usage cards**

Add a small component:

```tsx
const LocalUsageCard: React.FC<{ label: string; usage: ClaudeObservedUsageWindow }> = ({ label, usage }) => (
  <div className="claude-local-usage-card">
    <div className="claude-local-usage-title">{label}</div>
    <strong>{formatTokens(usage.processedTokens)} processed tokens</strong>
    <div className="claude-local-usage-meta">
      <span>{formatTokens(usage.outputTokens)} output</span>
      <span>{usage.requestCount.toLocaleString()} requests</span>
    </div>
  </div>
);
```

Render 5-hour and 7-day cards whenever `status.localUsage` exists, regardless of selected session source.

- [ ] **Step 7: Update source labeling and scoped CSS**

Use `Current local Claude session` / `Local activity` when `status.source === "localTranscript"`; preserve the exact statusLine labeling otherwise. Add `.claude-local-usage-grid`, `.claude-local-usage-card`, and `.claude-plan-note` styles without changing global provider card behavior.

- [ ] **Step 8: Verify GREEN**

Run:

```text
node --test tests/claude-monitor-contract.test.mjs
rtk npm build
```

Expected: contract test and TypeScript/Vite production build PASS.

---

### Task 5: Compliance and regression verification

**Files:**
- Modify: `current-work.md`

**Interfaces:**
- Consumes completed backend/frontend behavior.
- Produces a verified final work state.

- [ ] **Step 1: Run the complete Node suite**

```text
node --test tests/*.test.mjs
```

Expected: PASS; if an unrelated pre-existing test fails, record the exact test and unchanged file evidence.

- [ ] **Step 2: Run the complete targeted Claude Rust suite**

```text
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor
```

Expected: PASS.

- [ ] **Step 3: Run Rust compile verification**

```text
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS apart from already-known warnings.

- [ ] **Step 4: Run frontend production build**

```text
rtk npm build
```

Expected: PASS.

- [ ] **Step 5: Run formatting/diff checks**

```text
rustfmt --edition 2021 --check src-tauri/src/claude_monitor.rs
git diff --check
```

Expected: PASS for the modified Claude module and diff.

- [ ] **Step 6: Verify the local-only privacy boundary**

Search `src-tauri/src/claude_monitor.rs` and assert no matches for:

```text
api.anthropic.com
claude.ai/
access_token
refresh_token
cookie
authorization
.credentials.json
```

Also verify the local transcript structs contain no `content` field.

- [ ] **Step 7: Synchronize the tracker**

Move every completed task into `## Checkpoints (done)`, leave only genuine unresolved issues under `## Remaining Work`, and record any pre-existing regression-suite limitation under Known Risks.

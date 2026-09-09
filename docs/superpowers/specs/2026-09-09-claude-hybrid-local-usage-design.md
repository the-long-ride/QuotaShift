# Claude Hybrid Local Usage Monitoring Design

**Date:** 2026-09-09

## Goal

Fix the Claude tab so it does not remain stuck on “Waiting for a Claude Code session” when QuotaShift can already observe local Claude activity. QuotaShift must support two local-only monitoring sources:

1. Claude Code `statusLine` JSON for exact current-session metadata and Pro/Max 5-hour / 7-day rate-limit percentages when Claude exposes them.
2. Claude’s documented local application data under `~/.claude/projects/` as a passive fallback for Claude Desktop Code or CLI sessions where `statusLine` is not invoked.

The Claude integration remains read-only. It has no add-account, login, account-switching, pool, credential, browser, cookie, or remote API behavior.

## Compliance and Privacy Boundary

- `statusLine` remains the preferred exact source. Anthropic documents that Claude Code pipes local JSON session data to a configured command and that status-line execution does not consume API tokens.
- Anthropic documents `~/.claude/projects/` as local application data used for session resume/continue and documents `~/.claude/stats-cache.json` as aggregated token/cost counts shown by `/usage`.
- The fallback parser may open only local `*.jsonl` session files beneath `~/.claude/projects/`.
- The fallback parser must deserialize only metadata needed for monitoring: record timestamp, session ID, working directory, Claude Code version, message ID, model ID, and numeric token/cache usage fields.
- Prompt text, response text, tool content, transcript contents, auth data, `.credentials.json`, `~/.claude.json`, browser storage, cookies, request headers, OAuth tokens, Claude.ai pages, and undocumented service endpoints are out of scope and must never be read by this feature.
- QuotaShift must make no Anthropic service request for Claude monitoring.
- No raw transcript line or raw statusLine payload is persisted by the fallback path.

## Root Cause Being Fixed

The current Windows installer writes a raw command such as:

```text
"F:\path\to\quotashift.exe" --claude-statusline-bridge
```

Claude Code executes Windows status-line commands through Git Bash when available or PowerShell otherwise. A raw quoted Windows executable path is not a reliable PowerShell invocation because PowerShell requires the call operator for a quoted executable path. The bridge executable itself is healthy; direct probe input creates a valid snapshot.

QuotaShift will generate a shell-safe Windows command instead:

```text
powershell -NoProfile -Command "& 'F:/path/to/quotashift.exe' --claude-statusline-bridge"
```

This form was verified locally to forward stdin to bridge mode and emit the bridge stdout. Non-Windows platforms keep the direct quoted executable command.

## Source Model

Add a serialized source marker:

```rust
#[serde(rename_all = "camelCase")]
pub enum ClaudeMonitorSource {
    StatusLine,
    LocalTranscript,
    None,
}
```

`ClaudeMonitorStatus` gains:

- `source: ClaudeMonitorSource`
- `local_usage: Option<ClaudeObservedUsage>`

Existing fields remain:

- `installed`
- `settings_path`
- `session`
- `error`

`source` describes the source used for the displayed current session. `local_usage` is independently available whenever recent transcript metadata can be aggregated.

## Local Transcript Data Model

Deserialize JSONL lines into narrow private structs that omit conversation content entirely:

```rust
struct LocalTranscriptRecord {
    timestamp: Option<String>,
    session_id: Option<String>,
    cwd: Option<String>,
    version: Option<String>,
    message: Option<LocalAssistantMessage>,
}

struct LocalAssistantMessage {
    id: Option<String>,
    model: Option<String>,
    usage: Option<LocalUsageFields>,
}

struct LocalUsageFields {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    cache_creation_input_tokens: Option<u64>,
    cache_read_input_tokens: Option<u64>,
}
```

Serde ignores every other field. No `content` field is defined.

## Observed Usage Windows

Add:

```rust
pub struct ClaudeObservedUsageWindow {
    pub request_count: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_input_tokens: u64,
    pub cache_read_input_tokens: u64,
    pub processed_tokens: u64,
}

pub struct ClaudeObservedUsage {
    pub five_hour: ClaudeObservedUsageWindow,
    pub seven_day: ClaudeObservedUsageWindow,
    pub captured_at_ms: u64,
}
```

Semantics:

- `five_hour` is a rolling 5-hour window ending at the local scan time.
- `seven_day` is a rolling 7-day window ending at the local scan time.
- Include assistant API-response records from main sessions and nested subagent transcripts because those responses consume local Claude usage.
- De-duplicate globally by `message.id`. Claude transcript files can contain repeated assistant records with identical usage for the same response.
- `request_count` counts unique message IDs with a usage object.
- `processed_tokens = input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
- These are locally observed token/activity totals only. They must never be converted into or labeled as Pro/Max quota percentages.

## Transcript-Derived Current Session

When no usable statusLine session is newer than the local transcript session, select the most recently updated **main** transcript file (`*.jsonl` not under a `subagents` directory) with a valid assistant usage record.

Build a `ClaudeSessionSnapshot` from the most recent unique assistant message in that file:

- `session_id`: transcript `sessionId`
- `model_id` / `model_display_name`: message model ID; display name may fall back to the same ID
- `claude_code_version`: record version
- `current_dir` / `project_dir`: record cwd
- `captured_at_ms`: record timestamp
- `total_input_tokens`: `input + cache_creation + cache_read`, matching Claude’s documented context input semantics
- `total_output_tokens`: output tokens from the latest response
- `current_input_tokens`: raw non-cache input tokens
- `current_output_tokens`: output tokens
- cache counters: direct usage values
- `total_duration_ms`: elapsed time between the earliest parseable timestamp in that main transcript and the selected latest record
- `context_window_size`, context percentages, API duration, cost, and plan rate-limit windows remain `None` unless they come from statusLine

Do not infer a context-window size from the model name because extended-context eligibility may vary.

## Source Selection and Merging

`get_claude_monitor_status()` and `ensure_claude_statusline_bridge()` both build status from the same local aggregation function.

Selection rules:

1. Read the normalized statusLine snapshot if present.
2. Scan documented local transcripts for the latest main-session metadata and rolling observed usage.
3. If only one session exists, use it.
4. If both exist, use whichever has the newer `captured_at_ms` as the displayed session.
5. If the transcript session is newer, copy `five_hour` / `seven_day` plan windows from the statusLine snapshot only when that statusLine snapshot is no more than 5 minutes old. This keeps exact quota data visible when recently observed without presenting stale rate-limit state indefinitely.
6. `local_usage` is populated independently from transcript aggregation even when `source == StatusLine`.
7. If neither source exists, return `source == None`, `session == None`, and no error.

A malformed single transcript line is skipped. A malformed transcript file must not make the whole Claude tab fail. A malformed QuotaShift normalized snapshot continues to surface as a local integration error because QuotaShift owns that file.

## Filesystem Scan

- Root: `~/.claude/projects/`.
- Recurse directories using `std::fs`; no new dependency is required.
- Consider only `*.jsonl` files whose filesystem modification time is within the last 7 days plus a small safety margin (8 days).
- Read line-by-line with `BufReader` so large transcripts are not loaded wholesale.
- For rolling windows, ignore records older than 7 days.
- Main-session selection excludes any path with a `subagents` path component.
- Subagent records remain eligible for aggregate observed usage.

The existing frontend polls every two seconds. To avoid repeated expensive scans, cache the parsed local transcript result in-process for at least 2 seconds using a module-level `OnceLock<Mutex<...>>`. Tests exercise the pure scan/aggregation functions directly and do not depend on the cache.

## Frontend Behavior

### Exact statusLine source

When exact plan windows exist, preserve the existing 5-hour and 7-day percentage cards and label them as subscription usage.

Also show locally observed 5-hour and 7-day token/activity totals when available.

### Local transcript fallback

When the current session comes from local transcript metadata:

- Heading: `Current local Claude session`
- Source badge: `Local activity`
- Show model, project/cwd, Claude Code version, capture time, current context token counts, and session wall duration when available.
- Replace the empty percentage-only experience with two `Local activity` cards:
  - `Last 5 hours`: processed tokens, output tokens, requests
  - `Last 7 days`: processed tokens, output tokens, requests
- If exact 5-hour / 7-day plan percentages are unavailable, render an explanatory note: `Exact Claude plan-limit percentages are only exposed locally by Claude Code statusLine. QuotaShift is showing observed local token activity instead.`
- Do not draw a fake percent bar.

### No local Code data

If `session == None` and `source == None`:

- If the bridge is installed, do not say only “Waiting for a Claude Code session.”
- Show: `No local Claude Code activity found yet.`
- Explain that QuotaShift monitors Claude Code/Claude Desktop Code data stored locally and that Claude.ai web-only usage cannot be read through a documented local API.
- No account/login action is added.

## Windows Bridge Repair

Change `quoted_bridge_command()` into a platform-aware command builder.

Windows output must:

- use forward slashes in the executable path inside the single-quoted PowerShell string
- escape a single quote in the path as two PowerShell single quotes
- invoke `powershell -NoProfile -Command`
- use PowerShell’s `&` call operator

Example:

```text
powershell -NoProfile -Command "& 'C:/Program Files/QuotaShift/quotashift.exe' --claude-statusline-bridge"
```

Non-Windows keeps:

```text
"/path/to/quotashift" --claude-statusline-bridge
```

`ensure_claude_statusline_bridge()` remains idempotent and updates an old QuotaShift bridge command to the repaired command without recording the broken QuotaShift command as a user’s previous custom status line.

## Error Handling

- Missing `~/.claude/` or `projects/`: valid no-data state.
- Permission denied while scanning one project directory/file: skip that path and continue; do not fail the entire tab.
- Invalid JSONL line: skip line.
- Missing message ID: the record may be used for current-session metadata only if needed, but must not contribute to aggregate observed usage because it cannot be safely de-duplicated.
- Timestamp parse failure: record cannot contribute to rolling windows/current-session freshness.
- Integer overflow while summing token counters: use saturating addition.
- StatusLine exact rate-limit fields remain optional.

## Testing

### Rust unit tests

Add tests for:

- Windows bridge command uses PowerShell and forward-slash executable path.
- Windows bridge command escapes a single quote safely.
- Narrow transcript metadata parser ignores unrelated/content fields.
- Duplicate message IDs are counted once.
- 5-hour and 7-day windows include/exclude records at the correct boundaries.
- Subagent usage contributes to aggregate windows but subagent transcript cannot become the displayed current session.
- Transcript-derived current session maps context input as input + cache-create + cache-read.
- Newer transcript session beats older statusLine session.
- Fresh statusLine rate-limit windows are merged into a newer transcript session.
- Stale statusLine rate-limit windows are not merged.
- Missing transcript root returns no-data, not an error.

### Node contract tests

Extend `tests/claude-monitor-contract.test.mjs` to verify:

- `ClaudeMonitorStatus` exposes `source` and `localUsage`.
- backend contains local transcript scanning but does not define/deserialise a `content` field in the local transcript structs.
- backend still contains no Anthropic endpoint/auth/cookie handling.
- UI contains local observed usage copy and no fake percentage fallback.
- no-data copy no longer claims only that a CLI status update is required.
- account-management exclusions remain enforced.

### Verification

Run:

```text
node --test tests/claude-monitor-contract.test.mjs
rtk cargo test --manifest-path src-tauri/Cargo.toml claude_monitor
node --test tests/*.test.mjs
rtk npm build
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Also run `git diff --check`, targeted `rustfmt --check` for `claude_monitor.rs`, and a compliance grep for Anthropic endpoints/auth/cookie terms in the Claude backend.

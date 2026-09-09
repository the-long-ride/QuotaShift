# Claude Local Session Monitoring Design

**Date:** 2026-09-09

## Goal

Add a third main QuotaShift tab for Claude Code that automatically captures the current local Claude Code session and displays documented local usage metadata. The Claude integration has no account list, login flow, account addition, account switching, token handling, remote quota requests, or Claude.ai scraping.

## Compliance Boundary

- Use only Claude Code's documented `statusLine` command integration. Claude Code explicitly sends session JSON to a locally configured command on stdin.
- Do not access Claude authentication credentials, cookies, browser storage, network traffic, private/undocumented endpoints, or Claude.ai pages.
- Do not automate prompts or service requests. QuotaShift only consumes metadata Claude Code itself provides to a local command.
- Persist no prompt text, response text, or transcript contents.
- The status-line payload may contain a transcript path, but QuotaShift exposes only the normalized monitoring fields listed below.

## Architecture

Claude Code invokes QuotaShift's existing executable with `--claude-statusline-bridge` through `~/.claude/settings.json`. Bridge mode runs before Tauri startup, reads one JSON payload from stdin, atomically stores the local snapshot under `~/.quotashift/`, then exits. The normal Tauri process polls that local snapshot through a read-only command and renders it in a dedicated Claude tab.

The installer is idempotent. If a user already has a command-based `statusLine`, QuotaShift stores the previous status-line object and chains its command from bridge mode so the existing status output remains available. Existing status-line options such as `padding`, `refreshInterval`, and `hideVimModeIndicator` remain in the Claude settings object. If no previous command exists, bridge mode prints a compact model/context fallback rather than leaving Claude Code with a blank custom status line.

## Backend Module

Create `src-tauri/src/claude_monitor.rs` with four responsibilities:

1. Resolve `~/.claude/settings.json`, `~/.quotashift/claude-session.json`, and the saved previous-status-line metadata.
2. Install/update the QuotaShift bridge command without touching unrelated Claude settings.
3. Run bridge mode: read stdin, validate JSON, atomically write the snapshot, optionally pipe the same JSON to the user's previous status-line command, and print its stdout.
4. Normalize the stored payload into a Tauri-safe monitoring model.

Expose Tauri commands:

- `ensure_claude_statusline_bridge() -> Result<ClaudeMonitorStatus, String>`
- `get_claude_monitor_status() -> Result<ClaudeMonitorStatus, String>`

Expose a non-Tauri public entry point used by `main.rs`:

- `run_claude_statusline_bridge() -> Result<(), String>`

## Data Model

`ClaudeMonitorStatus` contains:

- `installed: bool`
- `settings_path: Option<String>`
- `session: Option<ClaudeSessionSnapshot>`
- `error: Option<String>` only when a recoverable local integration problem must be shown

`ClaudeSessionSnapshot` contains only:

- session ID and optional session name
- model ID/display name
- Claude Code version
- current/project directories
- capture timestamp
- session cost and duration fields
- context-window total input/output tokens, size, used/remaining percentages, and current-call token/cache counters
- optional 5-hour and 7-day rate-limit used percentages and reset epoch seconds

No auth material or conversation contents are stored in the normalized frontend model.

## Frontend

Create `src/components/ClaudeTab.tsx` as a read-only panel. It renders:

- captured session identity, model, project, Claude Code version, and last capture time
- 5-hour and 7-day rate-limit progress when present
- context-window progress and token totals
- session cost, wall-clock duration, API duration, and current token/cache counters
- a waiting state when Claude Code has not produced a status-line payload yet
- an integration-error state when local settings cannot safely be read or updated

The tab contains no Add Account, Apply, Best, pool, login, delete, rename, or switching actions.

`src/App.tsx` extends the main tab union to `"antigravity" | "codex" | "claude"`, installs the bridge once on startup, polls the local monitor status every two seconds, adds the Claude tab button, and renders `ClaudeTab`. Existing Antigravity/Codex behavior and overlay behavior remain unchanged.

## Error Handling

- Invalid existing `~/.claude/settings.json`: fail without overwriting the file and show the error in the Claude tab.
- Snapshot missing: valid waiting state, not an error.
- Snapshot malformed/partially populated: ignore unavailable optional fields; reject only structurally invalid JSON.
- Existing QuotaShift bridge command with an old executable path: update it to the current executable path without treating it as a previous user command.
- Previous status-line command failure: bridge capture still succeeds; do not block Claude Code. Print no previous output for that invocation.

## Testing

- Rust unit tests verify normalization of documented Claude fields, missing optional rate limits, settings preservation, idempotent installation, bridge-marker detection, and compact fallback output.
- Node contract tests verify the Tauri commands are registered, `main.rs` enters bridge mode before Tauri startup, App exposes the third main tab, ClaudeTab has no account-management controls, and styles include the Claude monitoring layout.
- Run the contract tests, targeted Rust tests, full frontend build, and full Rust test suite where runtime limits permit.

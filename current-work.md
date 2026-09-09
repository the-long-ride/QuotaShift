# Current Work - Claude usage monitoring fallback
Last updated: 2026-09-09T15:05:00+07:00 · Status: done

## Goal
Fix Claude monitoring so CLI status-line capture works reliably on Windows and users who use Claude Desktop Code without a separately installed Claude CLI can still monitor local usage.

## Checkpoints (done)
- [x] Reproduced missing Claude snapshot and repaired the Windows status-line command with a PowerShell-safe wrapper.
- [x] Added passive Claude Desktop Code fallback from documented local `~/.claude/projects/` metadata.
- [x] Added de-duplicated rolling 5-hour and 7-day local token/cache/request totals, including subagent usage.
- [x] Preserved exact subscription 5-hour/7-day percentages only when Claude statusLine provides them; no percentage inference from tokens.
- [x] Added source-aware Claude UI for statusLine, local transcript activity, and no-local-data states.
- [x] Preserved the Claude privacy boundary: no auth tokens, cookies, Claude.ai scraping, hidden endpoints, network interception, or conversation-content parsing.
- [x] Windows bridge and transcript/source behavior covered with Rust and Node regression tests.
- [x] Resolved the pre-existing Windows Antigravity contract blocker by normalizing CRLF to LF in the source-contract test helper before marker matching.
- [x] Targeted Antigravity source contract verified: 4 passed, 0 failed.
- [x] Full Rust suite verified: all unit, integration, and doc tests passed.
- [x] Full Node suite verified: 166 passed, 0 failed.
- [x] Production TypeScript/Vite build verified.
- [x] `git diff --check` verified clean.
- [x] Rust formatting verified for the repaired contract test and Claude monitor module.

- [x] Overlay left border restored — restored full continuous `1px solid rgba(255, 255, 255, 0.28)` border and corner arcs on `.glass-card` in [styles.css](file:///F:/my-repos/my-opensources/QuotaShift/src/styles.css), symmetrically matching the right border.
- [x] Claude logo shared — extracted the overlay Claude SVG into `src/components/ClaudeLogo.tsx` and reused it for the main Claude tab icon.
- [x] Overlay/Claude icon regression coverage updated — targeted overlay suite 18/18 and full Node suite 167/167 pass.
- [x] Frontend production build reverified after visual fixes — TypeScript/Vite build passes and `git diff --check` is clean.
- [x] Dashboard display errors resolved — fixed corrupted footer text/separators in [App.tsx](file:///F:/my-repos/my-opensources/QuotaShift/src/App.tsx), restored missing `data-tab` attributes on tab buttons, cleaned recursive mojibake in [claude_monitor.rs](file:///F:/my-repos/my-opensources/QuotaShift/src-tauri/src/claude_monitor.rs), rounded Codex limit percentages in [CodexTab.tsx](file:///F:/my-repos/my-opensources/QuotaShift/src/components/CodexTab.tsx), and supported local activity display in [ClaudeTab.tsx](file:///F:/my-repos/my-opensources/QuotaShift/src/components/ClaudeTab.tsx).
- [x] Overlay grab & release smoothness resolved — in [OverlayApp.tsx](file:///F:/my-repos/my-opensources/QuotaShift/src/components/OverlayApp.tsx), added synchronous drag origin from cached window position (zero grab delay), normalized CSS pointer movement to physical pixels via `window.devicePixelRatio`, coalesced in-flight `setPosition` IPC calls to avoid queue flood, added pointerdown `setPointerCapture(e.pointerId)` with global `pointermove`/`mousemove`/`pointerup`/`blur` listeners so fast flicks across the screen never lose tracking, and debounced `localStorage` writes.

## Remaining Work

## Blockers
- None.

## Known Risks
- Anthropic does not expose a documented individual Pro/Max quota API to third-party desktop apps; exact 5-hour/7-day plan percentages remain unavailable when Claude Code statusLine does not provide them.
- Claude.ai web-only usage cannot be measured from documented local application data, so QuotaShift reports no local data instead of fabricating quota usage.
- The branch remains substantially behind remote and contains mixed uncommitted feature work; no pull/rebase was performed automatically.
- Existing Rust warnings in `src/codex_router.rs` remain unrelated to this work.

## Resolved
- Windows raw quoted executable path was unreliable for Claude statusLine execution — replaced with a PowerShell wrapper using the call operator and a shell-safe path.
- Claude Desktop Code stream-json sessions do not invoke the configured statusLine — local transcript metadata now provides passive session/token activity fallback.
- Repeated assistant transcript records could double-count usage — aggregation de-duplicates globally by message ID.
- Antigravity source-contract markers were LF-only while Windows `session.rs` was CRLF — test file loading now normalizes line endings before marker searches.

## Trade-offs
- Non-CLI fallback | chose: documented local `~/.claude/projects/` transcript metadata | rejected: Claude.ai/Desktop scraping, auth token reuse, hidden endpoints | why: local app data requires no automated access to Anthropic services.
- Plan usage without statusLine | chose: show local observed token/activity totals and mark exact plan quota unavailable | rejected: inventing percentage bars from tokens | why: Pro/Max quota accounting is dynamic and no documented conversion exists.
- Windows bridge invocation | chose: invoke QuotaShift through PowerShell from statusLine | rejected: raw quoted Windows executable path | why: the PowerShell wrapper is shell-safe and locally verified.
- Transcript privacy | chose: narrow serde structs with no conversation content field | rejected: generic JSON transcript parsing | why: it makes the data boundary explicit and minimizes accidental collection.
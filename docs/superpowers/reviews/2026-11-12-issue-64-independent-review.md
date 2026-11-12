# Independent code review — QuotaShift issue #64, v1.2.2 (Draft)
Date: 2026-11-12
Base: main; review head: feat/issue-64-v1.2.2
Review method: direct GitHub source and diff inspection, cross-platform CI, regression tests.
This is not a real-device test, an OAuth permissions attestation or a release approval.

## Confirmed defects corrected on the draft branch
1. **P1 — False success after Codex restart failure:** `useCodexAccountOps` previously ignored missing/failed CLI restore outcomes and failed ChatGPT Desktop relaunch while updating active UI state. The automated path now requires all captured CLI outcomes to be restored and a stopped desktop to be relaunched. Incomplete recovery is a warning for manual Apply and an error for agent/auto Apply.
2. **P1 — Agent API timeout could overlap credential writes:** after 90 seconds, the prior timeout handler cleared the native rotation lock even if React Apply was still executing. Now queued operations must be acknowledged by the renderer before execution; an unclaimed timed-out event cannot start, and a running timed-out operation holds the lock until Apply finishes. On timeout, a late success is reported as failed, not success.
3. **P1 — Stale quota looked fresh after fetch failure:** quota snapshots reused `fetchedAt` despite loading/error state or low-accuracy cached Antigravity quota. Account usage remains displayable, but rotation eligibility now receives a timestamp only for successful Codex OAuth usage or verified exact/cloud Antigravity quota.
4. **P2 — Missing Antigravity credits could show non-money placeholders:** the previous fallback hid dash variants but could still render `N/A` or arbitrary strings. It now accepts only a plausible numerical balance, while a real zero stays visible.

## Requirements-to-source assessment
| Requirement | Assessment |
| --- | --- |
| Remaining/Used selector without redundant label, account cards/overlay/taskbar | Implemented; verify live UI |
| Animated segmented controls and reduced-motion support | Implemented for known settings segmented controls |
| Argon exhausted pool carry-forward without fake fresh evidence | Implemented; cache display is not a rotation signal |
| Antigravity credits missing => no text/placeholder; zero remains | Corrected; needs UI smoke test |
| Monitoring settings visual subgroups | Implemented |
| Apply-to-monitor adds without replacing; optional same-platform unmonitor | Implemented |
| Untrack All shortcut and confirmation | Implemented |
| Preserve account ordering through re-authentication | Implemented in source; manual test outstanding |
| API key/port modal, disabled-by-default localhost API, ID+usage-only output | Implemented and regression-tested at source level |
| Agent auto-pool and explicit saved-account-ID switching | Implemented in selection/dispatch; real-provider test outstanding |
| Skills: canonical, Claude, Antigravity, Codex, OpenCode guidance | Implemented; links/junctions need OS acceptance |
| Auto-poll enabled CLI pool at monitored cadence | Implemented; provider rate-limit behavior needs observation |
| Quota-hit auto failover and continuation prompt | Experimental fail-closed; only command submission is verified, not task completion |
| Antigravity 2.0 restart with Keep-alive and Persistent Monitor enabled | Code targets selected executable; **not** verified on installed app |
| Codex CLI vs ChatGPT Desktop same-machine lifecycle | Distinct code paths; mixed-installation acceptance pending |
| Antigravity OAuth newly required permissions | Native-session capture workaround; **not proven solved** |
| Claude Desktop two banked reset counts | Unknown-state UI correct; **Desktop parity not implemented** |
| v1.2.2 metadata/specs/changelog | Present; not released |

## Follow-up review: exact quota provenance and pool snapshot
5. **P1 — Antigravity exact result lacked accuracy metadata**: Native exact worker returns `FullStatus.accuracy`, but `mergeExactResult` omitted it and retained previous `cloudQuotas`. A successful exact refresh could therefore remain ineligible or be overridden by old carried quota. The exact result now sets source, accuracy and replaces the previous cloud lanes; API snapshot explicitly prefers this source.
6. **P2 — Pool configuration changes did not update Agent API snapshots**: the React bridge published only when account/usage props changed. Saving pool membership or active binding now publishes via a same-window custom change event, so agent selection does not retain the previous pool configuration.

## Remaining release blockers and safety notes
- Real-machine Windows/macOS/Linux smoke tests: Antigravity 2.0 restart with both monitoring switches enabled; Codex Desktop + Codex CLI together; agent API read/write and skill install/uninstall; independent successful conversation resume.
- Provider sign-in permissions must be confirmed against current supported Antigravity OAuth behavior; do not guess scopes or promise the warning is fixed.
- Claude Desktop's banked reset count requires a legitimate data source; do not infer `2` from missing/opaque provider metadata.
- Unattended failover cannot reliably detect CLI idleness. It remains opt-in and refuses idle-only mode. After a timed-out in-flight Apply the native lock intentionally remains held until renderer completion or application restart, rather than overlapping credentials.
- A successful CI matrix proves builds and tests, **not** successful on-device app or CLI handoff.

## Outcome
Keep PR #67 Draft. No merge, tag, release, or issue closure until the outstanding checks above are independently verified.

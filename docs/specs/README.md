# QuotaShift Software Specifications

Engineering and AI-agent reference for the current source tree. Verified against **v1.3.0** on 2026-11-16. See [INDEX.md](INDEX.md) for the machine-indexed specification graph.

| # | File | Scope |
| --- | --- | --- |
| 01 | [System overview](01-system-overview.md) | Runtime planes, components, storage, and invariants |
| 02 | [Security and credentials](02-security-and-credentials.md) | Secure storage, credential boundaries, router security, dependency mitigation |
| 03 | [Provider monitoring and switching](03-provider-monitoring-and-switching.md) | Antigravity, Codex, Claude monitoring, account switching, refresh, and ordering |
| 04 | [Desktop shell and overlay](04-desktop-shell-and-overlay.md) | Main window, dialogs, zoom, tray, overlay, taskbar strip, and shortcut-visible UI |
| 05 | [Claude guardrails and process lifecycle](05-claude-guardrails-and-process-lifecycle.md) | Multi-profile polling, reset-credit fallback, gateway connect, suspension, resume, and safety gates |
| 06 | [Settings and configuration](06-settings-and-configuration.md) | Preference keys, defaults, global/in-app shortcuts, CLI rotation settings, and UI behavior |
| 07 | [Backup and recovery](07-backup-and-recovery.md) | Encrypted backup payload, credentials backup, compatibility, merge, and pool restore |
| 08 | [Codex routing and pools](08-codex-routing-and-pools.md) | Codex account sync, native SIWC, Model Pools V2, loopback HTTP gateway, Anthropic translation, and telemetry |
| 09 | [Agent API and CLI failover](09-agent-api-and-cli-failover.md) | Localhost Agent API gateway, skill installation, CLI pool rotation, idle probing, disambiguation, and resume recovery |

## Prior as-built snapshot

- `docs/superpowers/specs/2026-09-21-v1-1-1-as-built-sync.md` (v1.1.1 As-Built Specification, retained locally if present)

The nine specifications above describe v1.3.0. Prior snapshots are retained for historical comparison. When documentation and source disagree, the current source is authoritative.

**Reading order:** [INDEX](INDEX.md) → 01 → 09. **User setup/manual:** `GUIDELINE.md`.

## v1.3.0 implementation status

The current spec set reflects the complete v1.3.0 source tree: Issue #64 UI and restart improvements (`docs/superpowers/specs/2026-11-12-issue-64-v1.3.0-design.md`), the opt-in local AI Agent API service and skill integration, CLI-pool live idle probing/disambiguation/resume verification, live Antigravity OAuth scope auditing with `native_capture` upgrade, verified same-account Claude Desktop `Local Storage/leveldb` reset-inventory fallback, the header Background Services monitor, Antigravity/Codex UI alignment, and the Windows full-cleanup uninstall option.

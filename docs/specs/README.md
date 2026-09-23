# QuotaShift Software Specifications

Engineering and AI-agent reference for the current source tree. Verified against **v1.1.2** on 2026-09-24.

| # | File | Scope |
| --- | --- | --- |
| 01 | [System overview](01-system-overview.md) | Runtime planes, components, storage, and invariants |
| 02 | [Security and credentials](02-security-and-credentials.md) | Secure storage, credential boundaries, router security, dependency mitigation |
| 03 | [Provider monitoring and switching](03-provider-monitoring-and-switching.md) | Antigravity, Codex, Claude monitoring, routing, pooling, refresh, and ordering |
| 04 | [Desktop shell and overlay](04-desktop-shell-and-overlay.md) | Main window, dialogs, zoom, tray, overlay, and shortcut-visible UI |
| 05 | [Claude guardrails and process lifecycle](05-claude-guardrails-and-process-lifecycle.md) | Multi-profile polling, suspension, resume, and safety gates |
| 06 | [Settings and configuration](06-settings-and-configuration.md) | Preference keys, defaults, global/in-app shortcuts, and UI behavior |
| 07 | [Backup and recovery](07-backup-and-recovery.md) | Encrypted backup payload, compatibility, merge, and pool restore |

## Prior as-built snapshot

- [v1.1.1 As-Built Specification](../superpowers/specs/2026-09-21-v1-1-1-as-built-sync.md)

The seven specifications above describe v1.1.2. The linked v1.1.1 snapshot is retained for historical comparison. When documentation and source disagree, the current source is authoritative.

**Reading order:** 01 → 07. **User setup/manual:** [`../../GUIDELINE.md`](../../GUIDELINE.md).

# QuotaShift Software Specifications

Engineering and AI-agent reference for the current source tree. Synchronized and verified for **v1.3.3** on **2026-11-28**. See [INDEX.md](INDEX.md) for the machine-indexed specification graph.

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

The nine specifications above reflect the complete **v1.3.3** source tree. When documentation and source disagree, the current source is authoritative.

**Reading order:** [INDEX](INDEX.md) → 01 → 09. **User setup/manual:** `GUIDELINE.md`.

## v1.3.3 implementation status

The current spec set is synchronized across v1.3.0–v1.3.3 additions: scheduled **Auto Backup** in `Settings > Data` (encrypted Full or Credentials backups, `QSF1` vault passphrase storage, missed-schedule catch-up, atomic Rust writes), cross-provider tier precision & dark/light badge palettes (`PRO+`, `ENTERPRISE`, Codex `GO`/`Pro5x`/`Pro20x`/`Pro50x`/`STD`/`PRE`, Claude `Max 5x`/`Max 20x`/`STD`/`PRE`, multiline tier tooltips), Codex multi-workspace profile separation & rotated-token propagation, credential/backup freshness checks, default+managed Claude `statusLine` bridge monitoring & unauthenticated cards, shared HTTP pooling & reset-credit HTTP 429 cache/backoff resilience, per-account quota polling controls, lazy secondary window lifecycle, Windows 10 taskbar self-repair, and the interactive showcase site (`site/`).

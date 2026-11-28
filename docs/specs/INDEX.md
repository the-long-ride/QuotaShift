# QuotaShift Specifications Index

Machine-indexed and human-navigable specification suite for **QuotaShift v1.3.3**. Verified against current source on **2026-11-28**. Every document carries YAML frontmatter (`schema_version: 1`) bound by SHA-256 `source_fingerprint` across **818** core first-party source files (`scripts/`, `src/`, `src-tauri/src/`, alongside **31** showcase files in `site/`).

Start with [README](README.md) for a brief introduction, then navigate by domain below.

## Specifications

| # | Spec | ID | Kind | Status | Scope Summary |
| --- | --- | --- | --- | --- | --- |
| 01 | [System Overview](01-system-overview.md) | `architecture.system-overview` | architecture | verified | Dual-plane Tauri/React architecture, entrypoints, scripts, showcase site, and invariants |
| 02 | [Security and Credentials](02-security-and-credentials.md) | `architecture.security-credentials` | architecture | verified | `QSF1` encrypted vaults, OS keyring secrets, OAuth PKCE/scope audit, CLI stdin safety, backup & Auto Backup crypto |
| 03 | [Provider Monitoring and Switching](03-provider-monitoring-and-switching.md) | `feature.provider-monitoring-switching` | feature | verified | Antigravity (`PRO+`, `ENTERPRISE`, image quota), Codex workspace separation, Claude monitoring, native capture |
| 04 | [Desktop Shell and Overlay](04-desktop-shell-and-overlay.md) | `architecture.desktop-shell-overlay` | architecture | verified | Dashboard shell, tray (`QuotaShift // the-long-ride`), lazy overlays, Win32 taskbar, tier badge palette & tooltips |
| 05 | [Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md) | `workflow.claude-guardrails-lifecycle` | workflow | verified | Multi-profile Claude discovery, default+managed `statusLine` bridge, reset-credit 429 backoff/LevelDB fallback, suspend/resume |
| 06 | [Settings and Configuration](06-settings-and-configuration.md) | `interface.settings-configuration` | interface | verified | Six-tab Settings modal, Data Auto Backup controls, storage keys/defaults, poll rates, global & in-app shortcuts |
| 07 | [Backup and Recovery](07-backup-and-recovery.md) | `workflow.backup-recovery` | workflow | verified | Encrypted Full Backup v3, Credentials Backup v1, scheduled Auto Backup, 54-key allowlist, freshness merge rules, pool parity |
| 08 | [Codex Account Sync, SIWC, and Model Pool Routing](08-codex-routing-and-pools.md) | `feature.codex-routing-pools` | feature | verified | Codex sync/keep-alive, multi-workspace isolation, native SIWC registration, Model Pools V2 gateway, Anthropic `/v1/messages`, 90d telemetry |
| 09 | [AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md) | `feature.agent-api-cli-failover` | feature | verified | Opt-in loopback Agent API, managed agent skills, CLI failover idle probing, disambiguation, resume verification |

## Quick lookup by task

- **App startup, IPC registration, logs, scripts**: [01 — System Overview](01-system-overview.md)
- **Vault encryption, keyring, OAuth scope audit, Dependency advisories**: [02 — Security and Credentials](02-security-and-credentials.md)
- **Antigravity exact workers, Image Generation quota, Argon pools, restart/apply recovery, native capture**: [03 — Provider Monitoring and Switching](03-provider-monitoring-and-switching.md)
- **Tray, Windows taskbar strip, overlay scaling/clamping, shortcuts HUD**: [04 — Desktop Shell and Overlay](04-desktop-shell-and-overlay.md)
- **Claude profile discovery, `cedar_ember` / Desktop LevelDB resets, suspension/resume**: [05 — Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md)
- **Preference storage keys, default values, keybindings, usage color tones**: [06 — Settings and Configuration](06-settings-and-configuration.md)
- **Backup export/import, passphrase crypto, merge compatibility**: [07 — Backup and Recovery](07-backup-and-recovery.md)
- **Codex Model Pools V2, SIWC auth, `/v1/responses` & `/v1/messages` router, telemetry**: [08 — Codex Account Sync, SIWC, and Model Pool Routing](08-codex-routing-and-pools.md)
- **Local AI Agent API (`/v1/accounts`, `/v1/pools`, `/v1/rotation`), CLI rotation pools & idle probing**: [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md)

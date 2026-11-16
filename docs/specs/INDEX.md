# QuotaShift Specifications Index

Machine-indexed and human-navigable specification suite for **QuotaShift v1.3.0**. Every document carries YAML frontmatter (`schema_version: 1`) bound by SHA-256 `source_fingerprint` across all **760** first-party source files (`scripts/`, `src/`, `src-tauri/src/`).

Start with [README](README.md) for a brief introduction, then navigate by domain below.

## Specifications

| # | Spec | ID | Kind | Status | Scope Summary |
| --- | --- | --- | --- | --- | --- |
| 01 | [System Overview](01-system-overview.md) | `architecture.system-overview` | architecture | verified | Dual-plane Tauri/React architecture, entrypoints, scripts, and invariants |
| 02 | [Security and Credentials](02-security-and-credentials.md) | `architecture.security-credentials` | architecture | verified | `QSF1` encrypted vaults, OS keyring secrets, OAuth PKCE/scope audit, CLI stdin safety, backup crypto |
| 03 | [Provider Monitoring and Switching](03-provider-monitoring-and-switching.md) | `feature.provider-monitoring-switching` | feature | verified | Antigravity, Codex, and Claude usage monitoring, tier classification, native capture, keep-alive |
| 04 | [Desktop Shell and Overlay](04-desktop-shell-and-overlay.md) | `architecture.desktop-shell-overlay` | architecture | verified | Dashboard shell, tray (`QuotaShift // the-long-ride`), Background Services modal, Win32 taskbar, overlay clamp |
| 05 | [Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md) | `workflow.claude-guardrails-lifecycle` | workflow | verified | Multi-profile Claude discovery, request-anchored polling, reset-count LevelDB fallback, suspend/auto-resume |
| 06 | [Settings and Configuration](06-settings-and-configuration.md) | `interface.settings-configuration` | interface | verified | Six-tab Settings modal, storage keys/defaults, poll rates, global & in-app keyboard shortcuts |
| 07 | [Backup and Recovery](07-backup-and-recovery.md) | `workflow.backup-recovery` | workflow | verified | Encrypted Full Backup v3 & Credentials Backup v1, 53-key allowlist, merge rules, pool restore parity |
| 08 | [Codex Account Sync, SIWC, and Model Pool Routing](08-codex-routing-and-pools.md) | `feature.codex-routing-pools` | feature | verified | Codex sync/keep-alive, native SIWC registration, Model Pools V2 gateway, Anthropic `/v1/messages`, 90d telemetry |
| 09 | [AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md) | `feature.agent-api-cli-failover` | feature | verified | Opt-in loopback Agent API, managed agent skills, CLI failover idle probing, disambiguation, resume verification |

## Quick lookup by task

- **App startup, IPC registration, logs, scripts**: [01 — System Overview](01-system-overview.md)
- **Vault encryption, keyring, OAuth scope audit, Dependency advisories**: [02 — Security and Credentials](02-security-and-credentials.md)
- **Antigravity exact workers, Argon pools, native capture**: [03 — Provider Monitoring and Switching](03-provider-monitoring-and-switching.md)
- **Tray, Windows taskbar strip, overlay scaling/clamping, shortcuts HUD**: [04 — Desktop Shell and Overlay](04-desktop-shell-and-overlay.md)
- **Claude profile discovery, `cedar_ember` / Desktop LevelDB resets, suspension/resume**: [05 — Claude Guardrails and Process Lifecycle](05-claude-guardrails-and-process-lifecycle.md)
- **Preference storage keys, default values, keybindings, usage color tones**: [06 — Settings and Configuration](06-settings-and-configuration.md)
- **Backup export/import, passphrase crypto, merge compatibility**: [07 — Backup and Recovery](07-backup-and-recovery.md)
- **Codex Model Pools V2, SIWC auth, `/v1/responses` & `/v1/messages` router, telemetry**: [08 — Codex Account Sync, SIWC, and Model Pool Routing](08-codex-routing-and-pools.md)
- **Local AI Agent API (`/v1/accounts`, `/v1/pools`, `/v1/rotation`), CLI rotation pools & idle probing**: [09 — AI Agent API and CLI Failover](09-agent-api-and-cli-failover.md)

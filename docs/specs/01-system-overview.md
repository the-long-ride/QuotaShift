# 01 — System Overview

**Audience:** engineers & AI agents · **Verified against:** `1.1.2` · **Date:** 2026-09-24

QuotaShift is a cross-platform Tauri desktop application for monitoring AI-provider quota, switching supported provider accounts, routing OpenAI Codex model traffic through local account pools, and supervising Claude Code quota guardrails. Claude Code credentials remain monitor-only.

## Runtime planes

### React / TypeScript frontend (`src/`)

- React 19 + TypeScript + Vite.
- Primary provider tabs: Antigravity, Codex, and Claude Code.
- Main dashboard owns account cards, search, persistent ordering/sorting, compact/expanded card layout, Settings, shortcuts, backup UI, and provider actions.
- Overlay windows render tracked-account usage independently from the main dashboard.
- Provider usage caches and non-secret preferences use renderer storage; sensitive account values are intercepted by the secure-storage facade.

### Rust host (`src-tauri/`)

- Tauri 2 host with system tray, custom window lifecycle, notifications, global shortcuts, process supervision, and IPC commands.
- `storage/secure_storage.rs` stores sensitive QuotaShift account state in an AES-256-GCM encrypted application-data file. The random 32-byte encryption key is held by the OS keyring.
- `codex/router*` runs the authenticated loopback Codex router on `127.0.0.1` using an ephemeral port and random bearer secret.
- `codex/sync*` safely applies/restores Codex provider configuration for routing.
- `system/session/` reads the shared Antigravity 2.0/agy keyring session and older IDE SQLite profiles. Capture imports distinct local identities through the Add Account modal; account applying remains a separate action. Secrets passed to SQLite-writing helpers travel through JSON stdin, not process arguments.
- `claude/` discovers profiles, monitors local usage/status, and suspends/resumes only Claude-owned processes under guardrail rules.

## Main component map

| Area | Primary source | Responsibility |
| --- | --- | --- |
| App orchestration | `src/App.tsx`, `src/hooks/app/useAppCoordinator.ts` | Provider state, session bootstrap, refresh, dialogs, tracked provider |
| Antigravity | `src/components/antigravity/`, `src/utils/antigravity/`, `src-tauri/src/antigravity/` | Quota retrieval, account apply, local-session integration |
| Codex | `src/components/codex/`, `src/utils/codex/`, `src-tauri/src/codex/` | Account usage, model discovery, pools, loopback routing, config sync |
| Claude Code | `src/components/claude/`, `src/utils/claude/`, `src-tauri/src/claude/` | Multi-profile monitoring, polling, guardrails, suspend/resume |
| Secure storage | `src/utils/auth/secure-storage*`, `src-tauri/src/storage/secure_storage*` | Synchronous renderer facade over authenticated encrypted persistence |
| Desktop shell | `src/components/common/Header.tsx`, `WindowControls.tsx`, `WindowResizeHandles.tsx` | Borderless title bar, window actions, search, Settings |
| Overlay/tray | `src/components/overlay/`, `src/utils/common/tray-usage.ts` | Tracked quota HUD, native sizing, tray usage summary |
| Settings | `src/components/common/SettingsModal.tsx` and section components | Monitoring, Appearance, Shortcuts, Data, Overlay, Logs, Help |

## Central invariants

1. **Claude Code is monitor-only for credentials.** QuotaShift may discover, poll, suspend, and resume Claude-owned processes, but it does not replace Claude authentication.
2. **Sensitive account values fail closed.** Account data is migrated into authenticated encryption before plaintext legacy copies are deleted.
3. **Codex routing is loopback-only.** The listener binds IPv4 localhost on an ephemeral port and requires the generated routing secret.
4. **Pool selection is independent from standalone account apply.** A selected pool controls pool routing; applying a standalone Codex account remains a separate action.
5. **Tracked tray/overlay state follows the explicitly monitored provider/account.** Unrelated idle polling must not overwrite it.
6. **Usage severity is global.** Remaining quota below 20% is warning orange; below 10% is critical red.
7. **All modal/dialog surfaces preserve the application title bar.** They begin below the 38px title bar and are viewport-capped for native WebView zoom.

## Version alignment

v1.1.2 is aligned across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.

**Next →** [02 — Security and Credentials](02-security-and-credentials.md)

# 01 — System Overview

**Audience:** engineers & AI agents · **Scope:** the whole product in one view · **Verified against:** `1.1.0`

QuotaShift is a **cross-platform desktop quota monitor and account swapper** for AI coding tools. It monitors quota limits, reset windows, and balances for **Google Antigravity**, **OpenAI Codex**, and **Claude Code**, providing quick account switching, loopback routing pools, process guardrails, and a desktop overlay HUD.

## The Two Planes

```text
React 19 + TypeScript Frontend (Vite)
       │
       │ Tauri v2 IPC (Commands & Events)
       ▼
Rust Host Core (Tauri 2.11.5, Tokio, Keyring, Axum Loopback)
  ├── Windows / macOS / Linux OS Integration (Tray, Keyring, Global Shortcuts, Notifications)
  ├── Loopback Proxy Router (127.0.0.1:0, OsRng Bearer Authentication)
  ├── SQLite Storage Writers & Keyring Encryption Facade
  └── Isolated Worker Language Server & Process Supervision
```

### 1. Web Frontend Plane (`src/`)

- Built with **React 19**, **TypeScript**, and **Vite**.
- Manages three primary provider views: `AntigravityTab`, `CodexTab`, and `ClaudeTab`.
- Renders two distinct window views:
  - **Main Dashboard Window** (`App.tsx`): Header, search filtering, card grids, vertical settings modal, and custom window titlebar controls.
  - **Desktop Overlay Window** (`OverlayApp.tsx`): High-DPI, translucent HUD showing tracked account usage, quota reset countdowns, and context menu.

### 2. Native Rust Host Plane (`src-tauri/`)

- Built with **Tauri v2** and **Rust 2021 edition**.
- Manages system tray icons, dynamic context menus, and window lifecycle.
- Hosts secure OS-backed credential storage via `keyring` (Windows Credential Manager, macOS Keychain, Linux Secret Service).
- Spawns and manages loopback proxy routing (`127.0.0.1:0`) for Codex model routing pools.
- Executes isolated background workers for Antigravity language-server quota polling.
- Supervises local Claude Code and Codex processes with graceful or forced termination.

## The Central Invariants

> 1. **Zero Credential Tampering for Claude Code**: QuotaShift is strictly monitor-only for Claude Code. It never alters, replaces, or writes Claude credentials or auth tokens.
> 2. **Fail-Closed Secure Credential Storage**: Account OAuth tokens and passwords never exist in plaintext `localStorage`. The frontend communicates exclusively through a serialized secure storage facade.
> 3. **Subprocess Argument Hygiene**: Sensitive tokens never travel via command-line arguments (`sys.argv`); all subprocess communication passes via standard input (`sys.stdin`) JSON payloads.
> 4. **No Unsigned Remote Execution**: Software update checks link directly to official GitHub release pages; QuotaShift never downloads or executes remote binary updates automatically.

## Core Components & Structure

| Component | Location | Responsibility |
| --- | --- | --- |
| Main Dashboard | `src/App.tsx`, `src/components/app/` | Root window lifecycle, tab orchestration, coordinator hooks, session bootstrap |
| Antigravity Suite | `src/components/antigravity/` | Local session card, cloud quota capture, account cards, token refresh, persistent card ordering |
| Codex Suite | `src/components/codex/` | Multi-workspace browser login, model scanner, persistent account ordering, loopback pools manager, pool router |
| Claude Suite | `src/components/claude/` | Multi-profile discovery (`CLAUDE_CONFIG_DIR`), persistent profile ordering, account cards, guardrails lifecycle, statusline |
| Desktop Overlay | `src/components/overlay/` | Translucent HUD, screen clamping, theme toggle, dynamic sizing bridge, tooltips |
| Settings Modal | `src/components/common/` | Vertical 7-tab sidebar (Monitoring, Appearance, Shortcuts, Data, Overlay, Logs, Help) |
| Window Controls | `src/components/common/WindowControls.tsx` | Custom borderless window titlebar: minimize, maximize/restore, close, quit dialog |
| Logger Subsystem | `src-tauri/src/logger.rs`, `src/utils/common/logger.tsx` | Durable WARN/ERROR file logging (`quotashift.log`), in-memory session buffer, local timestamps |
| Rust Core | `src-tauri/src/lib.rs` | Tauri setup, command registration, plugin initialization, single instance lock |
| Auth & Secrets | `src-tauri/src/auth/` | OAuth browser flow, token refresh, keyring encryption, secrets facade |
| Codex Proxy | `src-tauri/src/codex/` | Loopback HTTP proxy, pool routing, model catalog auto-discovery, `config.toml` sync |
| Claude Backend | `src-tauri/src/claude/` | Multi-profile scan, process suspension/resumption, guardrail auto-stop, transcripts |
| System Utilities | `src-tauri/src/system/` | Explorer file reveal, native process killers, window handles, single instance |

**Related:** [`02-security-and-credentials`](02-security-and-credentials.md) · [`03-provider-monitoring-and-switching`](03-provider-monitoring-and-switching.md)

**Next →** [`02-security-and-credentials`](02-security-and-credentials.md)

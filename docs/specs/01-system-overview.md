---
schema_version: 1
id: architecture.system-overview
title: "System Overview"
kind: architecture
status: verified
summary: "Cross-platform Tauri architecture, multi-window React frontend, Rust backend subsystems, build/test scripts, and central invariants."
tags: ["architecture", "tauri", "frontend", "rust", "overview"]
source_paths: ["package.json", "scripts/check-coverage.mjs", "scripts/check-loc.mjs", "scripts/clean-build-artifacts.js", "scripts/copy-release.js", "scripts/dev.mjs", "scripts/prettier.mjs", "scripts/test-rust-windows.ps1", "scripts/test.mjs", "src-tauri/Cargo.toml", "src-tauri/src/app/auto_backup.rs", "src-tauri/src/app/commands.rs", "src-tauri/src/app/commands/keep_alive.rs", "src-tauri/src/app/commands/logs.rs", "src-tauri/src/app/commands/oauth.rs", "src-tauri/src/app/mod.rs", "src-tauri/src/app/setup.rs", "src-tauri/src/lib.rs", "src-tauri/src/logger.rs", "src-tauri/src/main.rs", "src-tauri/src/python/delete_cred.py", "src-tauri/src/python/delete_session.py", "src-tauri/src/python/read_adc.py", "src-tauri/src/python/read_cred_mgr.py", "src-tauri/src/python/read_vscdb.py", "src-tauri/src/python/write_cred_mgr.py", "src-tauri/src/python/write_vscdb.py", "src-tauri/src/python/write_worker_vscdb.py", "src-tauri/src/system/explorer.rs", "src-tauri/src/system/http_client.rs", "src-tauri/src/system/mod.rs", "src-tauri/src/system/notification.rs", "src-tauri/src/system/process.rs", "src-tauri/src/system/process/query.rs", "src-tauri/src/system/process/tests.rs", "src-tauri/src/system/retry_after.rs", "src-tauri/src/system/run_cmd.rs", "src-tauri/src/types.rs", "src-tauri/tauri.conf.json", "src/App.tsx", "src/components/app/AppModals.tsx", "src/components/app/AppTabBar.tsx", "src/components/app/index.ts", "src/components/index.ts", "src/hooks/README.md", "src/hooks/app/useAppAccountOperations.ts", "src/hooks/app/useAppCoordinator.ts", "src/hooks/app/useAppEventListeners.ts", "src/hooks/app/useAppEventListeners.types.ts", "src/hooks/app/useAppEventListenersRefs.ts", "src/hooks/app/useAppInAppShortcuts.ts", "src/hooks/app/useAppModalState.ts", "src/hooks/app/useAppNavigation.ts", "src/hooks/app/useAppSessionBootstrap.ts", "src/hooks/app/useAppUpdateCheck.ts", "src/hooks/app/useAutoBackup.ts", "src/hooks/app/useKeepAliveStateSync.ts", "src/main.tsx", "src/styles.css", "src/styles/README.md", "src/styles/accounts/account-auth.css", "src/styles/accounts/account-card-actions.css", "src/styles/accounts/account-card-flow.css", "src/styles/accounts/account-sort-menu.css", "src/styles/accounts/account-tier-badges.css", "src/styles/accounts/quota-polling-switch.css", "src/styles/accounts/reset-credits-dialog.css", "src/styles/antigravity/antigravity.css", "src/styles/claude/claude-accounts.css", "src/styles/claude/claude-guardrails.css", "src/styles/claude/claude-pool-wizard.css", "src/styles/claude/claude-profile-dialog.css", "src/styles/claude/claude.css", "src/styles/common/cli-pool-editor.css", "src/styles/common/cli-pools.css", "src/styles/common/common-dropdown.css", "src/styles/desktop/compact-mode.css", "src/styles/desktop/native-zoom.css", "src/styles/desktop/ui-adjustment.css", "src/styles/desktop/ui-polish.css", "src/styles/desktop/window-controls.css", "src/styles/settings/auto-backup.css", "src/styles/settings/help-settings.css", "src/styles/settings/logs-settings.css", "src/styles/settings/settings-experimental.css", "src/styles/settings/settings-modal.css", "src/styles/settings/settings-platform.css", "src/styles/settings/settings-segment-motion.css", "src/styles/shared/background-status.css", "src/styles/shared/base.css", "src/styles/shared/modals.css", "src/styles/shared/panel.css", "src/utils/common/app-toast.ts", "src/utils/common/index.ts", "src/utils/common/logger.tsx", "src/utils/common/types.ts", "src/utils/common/update-policy.ts", "src/utils/index.ts", "src/utils/types.ts", "src/vite-env.d.ts", "tsconfig.site.json", "vite.site.config.ts"]
related_specs: ["architecture.security-credentials", "feature.provider-monitoring-switching", "architecture.desktop-shell-overlay", "workflow.claude-guardrails-lifecycle", "interface.settings-configuration", "workflow.backup-recovery", "feature.codex-routing-pools", "feature.agent-api-cli-failover"]
last_doc_update_at: "2026-11-28T21:18:00Z"
last_verified_at: "2026-11-28T21:18:00Z"
last_verified_code_commit: 50fc1bc4ced3f3dd3ce67b93b719ff25622d1b7c
last_source_change_commit: 50fc1bc4ced3f3dd3ce67b93b719ff25622d1b7c
last_source_change_at: "2026-11-28T21:18:00Z"
source_fingerprint: "sha256:c00e1dbcd44cc9a9d018da138f263dae965c9eac53c21edc869e89f560dd11e8"
---

# 01 — System Overview

**Audience:** engineers & AI agents · **Updated for:** `1.3.3` · **Date:** 2026-11-28

QuotaShift is a cross-platform Tauri desktop application for monitoring AI-provider quota, switching supported provider accounts, routing OpenAI Codex model traffic through local account pools, and supervising Claude Code quota guardrails. Claude Code credentials remain monitor-only.

## Runtime planes

### React / TypeScript frontend (`src/`)

- React 19 + TypeScript + Vite (`src/main.tsx`, `src/App.tsx`).
- Multi-window bootstrap in `src/main.tsx` routes `?window=overlay-tooltip`, `?window=taskbar`, and `?window=overlay` directly to lazy-loaded (`React.lazy`) `OverlayTooltipApp`, `TaskbarApp`, and `OverlayWindowSizingBridge` + `OverlayApp` without eagerly importing dashboard chunks. The main window dynamically loads `@tauri-apps/plugin-store` (`store.json`), runs legacy passphrase `MigrationGate` when `_passphraseHash` is present, hydrates `SecureStorageAdapter` (installing the renderer facade via `installSecureStorageFacade`), installs `installWindowActivityAttribute()`, initializes Antigravity and Codex keep-alive bridges, disables production context menus, and renders `<App />` under `<ErrorBoundary>`.
- Primary provider tabs (`AppTabBar`): Antigravity, ChatGPT Codex, and Claude Code, filtered by `platformVisibility` (`useAppNavigation`).
- Main dashboard (`App.tsx`, `useAppCoordinator`, `useAppModalState`, `useAppAccountOperations`, `useKeepAliveStateSync`, `useAutoBackup`, `AppModals`) owns account cards, search, persistent ordering/sorting, compact/expanded card layout, Settings, global and in-app shortcuts, backup/credentials/Auto Backup UI, and provider actions.
- Interactive showcase site (`site/`, `vite.site.config.ts`, `tsconfig.site.json`, built via `pnpm run build:site` to `dist-site/`): shims `@tauri-apps/api/*` and `@tauri-apps/plugin-*` (`site/shims/*`) to render a browser-runnable dashboard, overlay, and taskbar demo deployed by `.github/workflows/pages.yml`.
- Tracking and overlay hooks (`src/hooks/app/tracking/`) manage the ordered tracked-account list (`useTrackedAccountIds`, cross-provider multi-tracking), display mode (`none` | `overlay` | `circle` | `taskbar`), tray usage payloads, and `overlay-data-update` / `request-apply-account` synchronization independently from idle polling.
- Provider usage caches and non-secret preferences use renderer `localStorage` (persisted via `store.json`); sensitive account values are intercepted by the secure-storage facade.

### Rust host (`src-tauri/`)

- Tauri 2 binary (`src-tauri/src/main.rs`) supports CLI helper modes before GUI launch: `--claude-statusline-bridge` runs the Claude Code statusLine bridge and `--claude-gateway-token <profile_id>` serves `apiKeyHelper` tokens from encrypted storage; normal launches enter `tauri_app_lib::run()` (`src-tauri/src/lib.rs`).
- `src-tauri/src/lib.rs` registers plugins (`global_shortcut`, `single_instance`, `opener`, `notification`, `store`), manages `AgentApiManager`, `AntigravityWorkerManager`, `ClaudeUsageScheduler`, `CodexRouterManager`, and `SiwcSignInState`, configures the `main` system tray icon (`QuotaShift // the-long-ride`), minimizes main-window close to tray, re-exports `app::get_state`, mounts `tauri::generate_handler![...]` commands, and restores Codex router config on `RunEvent::Exit`.
- `src-tauri/src/app/mod.rs` owns shared `STATE: OnceLock<Mutex<AppState>>` and `get_state()`, while `src-tauri/src/app/setup.rs` recovers stale Codex router configuration, initializes tray and desktop notifications, registers `window::secondary_windows::register_tooltip_lifecycle` (alongside lazy `configure_{overlay,taskbar,tooltip}_window` helpers for `"create": false` secondary windows), cleans up stale owned Antigravity workers, spawns `ClaudeUsageScheduler`, restores the Claude suspension journal and auto-resume worker, prefetches Codex OAuth and Antigravity consumer credentials, starts the background tray polling loop (`poll_interval_secs`, default `30`), starts background keep-alive workers, and applies Windows DWM styling.
- `src-tauri/src/app/commands.rs`, `src-tauri/src/app/commands/{keep_alive,logs,oauth}.rs`, and `src-tauri/src/app/auto_backup.rs` expose Tauri IPC commands for tray/overlay state (including lazy window lifecycle and `take_pending_overlay_tooltip`), backup exports to `~/Downloads`, atomic scheduled Auto Backup writes (`write_auto_backup_file`, `pick_auto_backup_folder`), Codex auth/sync/process lifecycle, Antigravity session switching/usage, keep-alive synchronization, OAuth/ChatGPT APIs, window controls, and session/file logs.
- `src-tauri/src/system/{http_client,retry_after,process}.rs` provide shared pooled `reqwest` clients (`shared_client()`, `shared_streaming_client()`), common 429 `Retry-After` + circuit-breaker cooldown helpers, and `sysinfo`-based process scanning with cached CSRF regexes.
- `src-tauri/src/logger.rs` buffers up to `2000` in-memory session log lines (`SESSION_REVISION`) while suppressing high-frequency redundant `INFO` traces, and durably writes `WARN`/`ERROR` entries to `~/.quotashift/quotashift.log`.
- `src-tauri/src/types.rs` and `src/utils/common/types.ts` define shared cross-plane IPC structures (`FullStatus`, `QuotaData`, `CreditInfo`, `CodexMonitoredInfo`, `MonitoredTrayInfo`, `AntigravityAccountUsage`, `AntigravityWorkerProgress`, plus `premiumModels` and `quotaCarried`).
- `storage/secure_storage.rs` stores sensitive QuotaShift account state in an AES-256-GCM encrypted application-data file. The random 32-byte encryption key is held by the OS keyring.
- `codex/router*` runs the authenticated loopback Codex router on `127.0.0.1` using an ephemeral port (or configured fixed port) and random bearer secret. It records aggregate token/cache telemetry, hourly history (up to 90 days), and per-model totals locally without retaining request or response payloads.
- Codex routing keeps session requests account-affine when possible and derives stable SHA-256 prompt-cache keys scoped by binding and pool.
- `codex/sync*` safely applies/restores Codex provider configuration for routing.
- `system/session/` reads the shared Antigravity 2.0/agy keyring session and older IDE SQLite profiles. Capture imports distinct local identities through the Add Account modal; account applying remains a separate action. Secrets passed to SQLite-writing helpers travel through JSON stdin, not process arguments.
- `claude/` discovers profiles, monitors local usage/status, and suspends/resumes only Claude-owned processes under guardrail rules.
- `agent_api/` provides the opt-in loopback HTTP API (`127.0.0.1`), OS-keyring API key lifecycle, async account rotation operations, user-scope terminal setup launcher, and per-agent managed skill installation (`quotashift-rotation`).

## Codex Router telemetry

- The Rust router normalizes input, output, cached, and reasoning token counts from supported upstream usage metadata.
- Aggregates include request count, cache-hit requests, per-model totals, and hourly buckets; history is bounded to 90 days and persisted locally.
- The frontend telemetry modal offers 1h, 24h, 7d, 30d, and all-time views with model breakdowns and token/cache charts. Numeric telemetry is retained; request/response bodies are not.

## Build, test, and verification tooling (`scripts/`)

| Script | Responsibility |
| --- | --- |
| `scripts/dev.mjs` | Finds a free loopback TCP port from `1420` and runs `tauri dev` with `VITE_PORT` and a temporary `--config` override |
| `scripts/test.mjs` | Compiles `src/utils/**` to `.test-build` (`ES2022`), generates root shims + `.test-build/coverage-shims.json`, and runs `node --test tests/**/*.test.mjs` |
| `scripts/check-coverage.mjs` | Runs `scripts/test.mjs` under `--experimental-test-coverage` enforcing >=95% lines, >=85% branches, >=95% functions across compiled utilities |
| `scripts/check-loc.mjs` | Enforces Prettier-formatted LOC thresholds (`.tsx` <= 350, `.ts` <= 300, `.rs` <= 300, `.css` <= 600), excluding tests, `dist-site`, and fixtures |
| `scripts/prettier.mjs` | Runs Prettier (`--write` / `--check`) on TS/TSX/CSS/HTML (`src/`, `site/`, `vite.site.config.ts`) and `cargo fmt` on `src-tauri/Cargo.toml` |
| `scripts/test-rust-windows.ps1` | Writes a Windows Common Controls v6 sidecar `.manifest` for `tauri_app_lib-*.exe` and runs `cargo test --lib -- --test-threads=1` |
| `scripts/copy-release.js`, `scripts/clean-build-artifacts.js` | Copies portable executables and installer bundles to `release/` and prunes intermediate `dist/`, `dist-site/`, and `target/` artifacts |
| `vite.site.config.ts`, `tsconfig.site.json` | Builds the browser-runnable interactive showcase site (`site/`) to `dist-site/` (`pnpm run dev:site`, `pnpm run build:site`) |

## Code map

Primary entrypoints, build/verification scripts, and system glue covered by this overview (`src/main.tsx`, `src/App.tsx`, `src/hooks/app/`, `src-tauri/src/{main,lib,logger,types}.rs`, `src-tauri/src/app/`, `scripts/`).

### Main component map

| Area | Primary source | Responsibility |
| --- | --- | --- |
| App orchestration | `src/main.tsx`, `src/App.tsx`, `src/components/app/`, `src/hooks/app/useAppCoordinator.ts` | Multi-window bootstrap, provider state, modals, refresh, tracked provider |
| Rust host & IPC | `src-tauri/src/{main,lib,logger,types}.rs`, `src-tauri/src/app/` | CLI bridges, Tauri plugins, tray lifecycle, background workers, IPC commands |
| Antigravity | `src/components/antigravity/`, `src/utils/antigravity/`, `src-tauri/src/antigravity/` | Quota retrieval, account apply, local-session integration, keep-alive |
| Codex | `src/components/codex/`, `src/utils/codex/`, `src-tauri/src/codex/` | Account usage, model discovery, pools, loopback routing, config sync, multi-account keep-alive |
| Claude Code | `src/components/claude/`, `src/utils/claude/`, `src-tauri/src/claude/` | Multi-profile monitoring, polling, guardrails, suspend/resume |
| Secure storage | `src/utils/auth/secure-storage*`, `src-tauri/src/storage/secure_storage*` | Synchronous renderer facade over authenticated encrypted persistence |
| Desktop shell | `src/components/common/header/Header.tsx`, `src/components/common/header/BackgroundStatusButton.tsx`, `src/components/common/header/WindowControls.tsx`, `src/components/common/header/WindowResizeHandles.tsx` | Borderless title bar, window actions, search, Settings, Background Services status modal |
| Agent API | `src/components/common/agent-api/`, `src/hooks/app/useAgentApiBridge.ts`, `src-tauri/src/agent_api/` | Loopback HTTP gateway (`127.0.0.1`), keyring Bearer auth, endpoint docs, terminal env setup, managed agent skills |
| Overlay/tray/taskbar | `src/components/overlay/`, `src/components/taskbar/`, `src/utils/common/accounts/tray-usage.ts`, `src/utils/common/accounts/tracked-accounts.ts`, `src/hooks/app/tracking/` | Tracked quota HUD, Windows taskbar strip, native sizing, tray usage summary, tracked-account list |
| Settings | `src/components/common/settings/SettingsModal.tsx` and section components | Monitoring, Appearance, Keyboard Shortcuts, Data, Logs, Help |

## Central invariants

1. **Claude Code is monitor-only for credentials.** QuotaShift may discover, poll, suspend, and resume Claude-owned processes, but it does not replace Claude authentication.
2. **Sensitive account values fail closed.** Account data is migrated into authenticated encryption before plaintext legacy copies are deleted.
3. **Codex routing is loopback-only.** The listener binds IPv4 localhost and requires the generated routing secret.
4. **Pool selection is independent from standalone account apply.** A selected pool controls pool routing; applying a standalone Codex account remains a separate action.
5. **Tracked tray/overlay/taskbar state follows the explicitly monitored provider/account list (primary plus up to two more when multi-tracking is on).** Unrelated idle polling must not overwrite it.
6. **Usage severity is global.** Remaining quota below 20% is warning orange; below 10% is critical red.
7. **All modal/dialog surfaces preserve the application title bar.** They begin below the 38px title bar and are viewport-capped for native WebView zoom.
8. **Keep-alive maintains all registered accounts across Antigravity and Codex.** Background maintenance refreshes near-expired credentials, preserves rotated refresh tokens, and self-heals 401 Unauthorized states.

## Version alignment

v1.3.3 is aligned across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `site/shims/tauri-api-shim.ts`.

**Next →** [02 — Security and Credentials](02-security-and-credentials.md)

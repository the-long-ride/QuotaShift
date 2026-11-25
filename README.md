# QuotaShift

[![License: MIT](https://img.shields.io/badge/License-MIT-black?style=flat-square&labelColor=black)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-v2-black?style=flat-square&labelColor=black&logo=tauri&logoColor=white)](https://tauri.app/)
[![Built from GHA](https://img.shields.io/badge/Built%20from%20GHA-%E2%9C%93-black?style=flat-square&labelColor=black&logo=githubactions&logoColor=white)](https://github.com/the-long-ride/QuotaShift/actions/workflows/publish.yml)
[![Downloads](https://img.shields.io/github/downloads/the-long-ride/QuotaShift/total?style=flat-square&labelColor=black&color=black&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cGF0aCBmaWxsPSJ3aGl0ZSIgZD0iTTIuNzUgMTRBMS43NSAxLjc1IDAgMCAxIDEgMTIuMjV2LTIuNWEuNzUuNzUgMCAwIDEgMS41IDB2Mi41YzAgLjEzOC4xMTIuMjUuMjUuMjVoMTAuNWEuMjUuMjUgMCAwIDAgLjI1LS4yNXYtMi41YS43NS43NSAwIDAgMSAxLjUgMHYyLjVBMS43NSAxLjc1IDAgMCAxIDEzLjI1IDE0WiIvPjxwYXRoIGZpbGw9IndoaXRlIiBkPSJNNy4yNSA3LjY4OVYyYS43NS43NSAwIDAgMSAxLjUgMHY1LjY4OWwxLjk3LTEuOTY5YS43NDkuNzQ5IDAgMSAxIDEuMDYgMS4wNmwtMy4yNSAzLjI1YS43NDkuNzQ5IDAgMCAxLTEuMDYgMEw0LjIyIDYuNzhhLjc0OS43NDkgMCAxIDEgMS4wNi0xLjA2bDEuOTcgMS45NjlaIi8+PC9zdmc+&label=)](https://github.com/the-long-ride/QuotaShift/releases/latest)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-black?style=flat-square&labelColor=black&logo=github&logoColor=white)](https://the-long-ride.github.io/QuotaShift/)
[![Antigravity](https://img.shields.io/badge/Antigravity-black?style=flat-square&labelColor=black&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1NDAgNTQwIiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTI2NSw4NEwyODIsODVMMjkzLDg4TDMwNSw5NEwzMjAsMTA2TDMzMCwxMThMMzM5LDEzMkwzNDgsMTUwTDM1OSwxNzhMMzY4LDIwNkwzOTQsMzAwTDQxMSwzNDhMNDE4LDM2Mkw0MTgsMzY0TDQzMiwzOTBMNDQ3LDQxMUw0NjQsNDI5TDQ2OSw0MzhMNDcwLDQ0M0w0NjgsNDQ5TDQ2Myw0NTNMNDQ5LDQ1NEw0MzYsNDQ5TDQxOCw0MzZMMzk5LDQxOEwzODIsMzk3TDM2OCwzNzZMMzM5LDMyNkwzMjYsMzA5TDMxMywyOTdMMjk4LDI4OEwyODksMjg1TDI3MywyODNMMjYxLDI4M0wyNDYsMjg2TDIyNSwyOTdMMjA5LDMxM0wyMDAsMzI1TDE2OSwzNzhMMTUxLDQwNEwxNDEsNDE2TDExOSw0MzdMOTksNDUxTDg1LDQ1NUw3OSw0NTVMNzEsNDUyTDY3LDQ0NUw2OSw0MzdMNzQsNDI5TDkzLDQwOUwxMDcsMzg5TDEyNCwzNTZMMTQzLDMwNEwxNDMsMzAxTDE0NywyOTFMMTQ3LDI4OEwxNTcsMjU2TDE1OCwyNDlMMTY0LDIzMUwxNjcsMjE3TDE4MCwxNzZMMTg5LDE1M0wyMDAsMTMxTDIxMywxMTJMMjMwLDk2TDI0Myw4OUwyNTIsODZMMjY0LDg1TDI2NSw4NFoiLz48L3N2Zz4=)](https://antigravity.google/)
[![OpenAI Codex](https://img.shields.io/badge/OpenAI%20Codex-black?style=flat-square&labelColor=black&logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIiBmaWxsPSJ3aGl0ZSI+PHBhdGggZD0iTTQ3NC4xMjMgMjA5LjgxYzExLjUyNS0zNC41NzcgNy41NjktNzIuNDIzLTEwLjgzOC0xMDMuOTA0LTI3LjY5Ni00OC4xNjgtODMuNDMzLTcyLjk0LTEzNy43OTQtNjEuNDE0YTEyNy4xNCAxMjcuMTQgMCAwMC05NS40NzUtNDIuNDljLTU1LjU2NCAwLTEwNC45MzYgMzUuNzgxLTEyMi4xMzkgODguNTkzLTM1Ljc4MSA3LjM5Ny02Ni41NzQgMjkuNzYtODQuNjM3IDYxLjQxNC0yNy44NjggNDguMTY3LTIxLjUwMyAxMDguNzIgMTUuODI2IDE1MC4wMDctMTEuNTI1IDM0LjU3OC03LjU2OSA3Mi40MjQgMTAuODM4IDEwMy43MzMgMjcuNjk2IDQ4LjM0IDgzLjQzMyA3My4xMTEgMTM3Ljk2NiA2MS41ODUgMjQuMDg0IDI3LjE4IDU4LjgzMyA0Mi44MzUgOTUuMzAzIDQyLjY2MyA1NS41NjQgMCAxMDQuOTM2LTM1Ljc4MiAxMjIuMTM5LTg4LjU5NCAzNS43ODItNy4zOTcgNjYuNTc0LTI5Ljc2IDg0LjQ2NS02MS40MTMgMjguMDQtNDguMTY4IDIxLjY3Ni0xMDguNzIyLTE1LjY1NC0xNTAuMDA4di0uMTcyem0tMzkuNTY3LTg3LjIxOGMxMS4wMSAxOS4yNjcgMTUuMTM5IDQxLjgwMyAxMS4zNTQgNjMuNjUtLjY4OC0uNTE2LTIuMDY0LTEuMjA0LTIuOTI0LTEuNzJsLTEwMS4xNTItNTguNDlhMTYuOTY1IDE2Ljk2NSAwIDAwLTE2LjY4NyAwTDIwNi42MjEgMTk0LjV2LTUwLjIzMmw5Ny44ODMtNTYuNTk3YzQ1LjU4Ny0yNi4zMiAxMDMuNzMyLTEwLjY2NiAxMzAuMDUyIDM0LjkyMXptLTIyNy45MzUgMTA0LjQybDQ5Ljg4OC0yOC45IDQ5Ljg4NyAyOC45djU3LjYzbC00OS44ODcgMjguOS00OS44ODgtMjguOXYtNTcuNjN6bTIzLjIyMy0xOTEuODFjMjIuMzY0IDAgNDMuODY3IDcuNzQyIDYxLjA3IDIyLjAyLS42ODguMzQ0LTIuMDY0IDEuMjA0LTMuMDk3IDEuNzJMMTg2LjY2NiAxMTcuMjZjLTUuMTYxIDIuOTI1LTguMjU4IDguNDMtOC4yNTggMTQuNDV2MTM2LjkzNGwtNDMuNTIzLTI1LjExNlYxMzAuMzMzYzAtNTIuNjQgNDIuNDkxLTk1LjEzIDk1LjEzMS05NS4zMDJsLS4xNzIuMTcyek01Mi4xNCAxNjguNjk3YzExLjE4Mi0xOS4yNjggMjguNTU3LTM0LjA2MiA0OS41NDQtNDEuODAzVjI0Ny4xNGMwIDYuMDIgMy4wOTcgMTEuMzU0IDguMjU4IDE0LjQ1bDExOC4zNTQgNjguMjk1LTQzLjY5NSAyNS4yODgtOTcuNzExLTU2LjQyNWMtNDUuNDE1LTI2LjMyLTYxLjA3LTg0LjQ2NS0zNC43NS0xMzAuMDUyem0yNi42NjUgMjIwLjcxYy0xMS4xODItMTkuMDk1LTE1LjEzOS00MS44MDItMTEuMzU0LTYzLjY1LjY4OC41MTYgMi4wNjQgMS4yMDQgMi45MjQgMS43MmwxMDEuMTUyIDU4LjQ5YTE2Ljk2NSAxNi45NjUgMCAwMDE2LjY4NyAwbDExOC4zNTQtNjguNDY3djUwLjIzMmwtOTcuODgzIDU2LjQyNWMtNDUuNTg3IDI2LjE0OC0xMDMuNzMyIDEwLjY2NS0xMzAuMDUyLTM0Ljc1aC4xNzJ6bTIwNC41NCA4Ny4zOWMtMjIuMTkyIDAtNDMuODY3LTcuNzQxLTYwLjg5OC0yMi4wMmE2Mi40MzkgNjIuNDM5IDAgMDAzLjA5Ny0xLjcybDEwMS4xNTItNTguMzE3YzUuMTYtMi45MjQgOC40MjktOC40MyA4LjI1Ny0xNC40NVYyNDMuNTI3bDQzLjUyMyAyNS4xMTZ2MTEzLjAyMmMwIDUyLjY0LTQyLjY2MyA5NS4zMDMtOTUuMTMxIDk1LjMwM3YtLjE3MnpNNDYxLjIyIDM0My4zMDNjLTExLjE4MiAxOS4yNjctMjguNzI5IDM0LjA2MS00OS41NDQgNDEuNjNWMjY0LjY4N2MwLTYuMDIxLTMuMDk3LTExLjUyNi04LjI1Ny0xNC40NUwyODQuODkzIDE4MS43N2w0My41MjMtMjUuMTE2IDk3Ljg4MyA1Ni40MjRjNDUuNTg3IDI2LjMyIDYxLjA3IDg0LjQ2NiAzNC43NSAxMzAuMDUzbC4xNzIuMTcyeiIvPjwvc3ZnPg==)](https://chatgpt.com/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-black?style=flat-square&labelColor=black&logo=claude&logoColor=white)](https://claude.ai/)

> Quota monitoring and account switching for AI coding tools.

QuotaShift is a desktop application built with Tauri that tracks quota limits, reset windows, and balances for Google Antigravity, OpenAI Codex, and Claude Code. Antigravity and Codex support account switching; Claude Code is monitor-only and supports multiple local profiles without switching credentials. Usage can be monitored from the dashboard, system tray, or desktop overlay.

---

## Live Demo

Explore the interactive web showcase in your browser: **[https://the-long-ride.github.io/QuotaShift/](https://the-long-ride.github.io/QuotaShift/)**

The showcase mounts QuotaShift's real React components with sample account data across all three surfaces:

- **Main Dashboard**: Switch between Google Antigravity, ChatGPT Codex (`Accounts` and `Model Pools`), and Claude Code tabs, inspect Background Services and Settings modals, and toggle dark or light themes.
- **Desktop Overlay HUD**: Drag the floating Glass or Mono HUD across the stage, switch between Card Stack and Circle Nodes (vertical or horizontal), hover any account for its quota card, and open the context menu.
- **Windows Taskbar**: Preview the docked taskbar strip across all four screen edges (`Bottom`, `Top`, `Left`, `Right`) with hover quota cards and context menus.

---

## Key features

### Desktop overlay & taskbar

- Compact HUD for Antigravity, ChatGPT Codex, and Claude Code with usage and reset details. Settings can show Remaining (default) or Used percentages consistently across cards, overlay and taskbar without changing warning thresholds.
- Glassmorphism and Mono themes, 80%–200% scaling, and multi-monitor edge clamping.
- Display modes None, Overlay, and Taskbar (Windows): the taskbar strip docks into the Windows taskbar and displays each tracked account's avatar, badges, and compact usage lines, with a rich hover card.
- Native zoom compensation ensures taskbar and hover card sizing remain crisp and unaffected by main dashboard page zoom.
- Interactive context menus on overlay cards and taskbar items for account refresh, dashboard navigation, theme toggling, untracking, and hiding.
- Experimental multi-account tracking: monitor up to three accounts from any mix of providers. Double-click any card or taskbar item to open the dashboard with smooth scroll centering and card focus.
- Header Untrack All button and configurable Ctrl/Cmd+Shift+U shortcut unpin monitored accounts only after confirmation. Optional Auto-monitor on Apply adds a successful Antigravity/Codex account to the monitored list (up to three) without evicting other providers; an explicit setting can untrack same-provider accounts.
- Claude quota keeps the last known values (marked stale) when usage cannot be read, for example when offline or behind a VPN.

### Google Antigravity

- Monitor 5-hour and weekly quotas with reset times through background workers.
- Capture accounts from Antigravity 2.0, agy, and the older IDE into the saved list once per identity; switch accounts safely and pick the account with the most quota remaining.
- OAuth keep-alive plus persistent drag-and-drop or Sort-menu account ordering.
- Optional experimental restart on switch: seamlessly restarts running IDE/desktop processes and running `agy` CLI in a fresh terminal window upon account switch.

### ChatGPT Codex

- Monitor saved accounts and their available usage windows across dedicated `Accounts` and `Model Pools` subtabs.
- Discover shared model support and group accounts into local routing pools with automatic failover.
- Switch credentials safely, multi-account OAuth keep-alive with token rotation, restore provider config on exit, and persist account order by drag or Sort menu.
- Optional experimental restart on switch: restarts the running Codex desktop app (including Microsoft Store packaged builds) while stopping CLI and IDE extension processes.

### AI Agent API & Background Services

- Inspect and toggle background services (**Model Routing** and **Agent API**) from the title-bar status button without opening Settings.
- Enable an opt-in local Agent API (`127.0.0.1:45692` by default) authenticated via OS-keyring Bearer secret to read redacted account quotas (`GET /v1/accounts`, `GET /v1/pools`), request safe account rotation (`POST /v1/rotation`), and monitor operation state (`GET /v1/operations/{id}`).
- Configure user-scope `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY` from Terminal/PowerShell and toggle managed `quotashift-rotation` skills for `Claude Code`, `Codex`, `Antigravity`, and `OpenCode`.

### Claude Code

- Monitor multiple `CLAUDE_CONFIG_DIR` profiles without switching credentials.
- Auto-discover profiles, add custom directories, search accounts, refresh usage, and track a profile in the desktop overlay or taskbar.
- Optional independent 5-hour and weekly guardrails can suspend matching Claude processes, notify the user, and optionally auto-resume after all required resets.
- Guardrails default to watching only running Claude accounts. The optional Show Claude reset count switch gates reset-credit queries and all card/overlay/taskbar badges, falling back read-only to verified same-account Claude Desktop local storage when the API cannot report saved resets (remaining unknown rather than zero when unavailable from both sources).
- Local `statusLine` and transcript telemetry remain available without storing Claude credentials or running a proxy.

### Dashboard and backups

- Search all providers, use responsive compact/expanded card layouts, and persist main-window zoom.
- Configure monitoring, appearance, shortcuts, data, logs, help, and tracked/idle poll rates from the 6-tab Settings modal.
- Export/import AES-256-GCM encrypted backups of accounts, pools and all settings, and reveal them in the native file manager.
- Last-used tracking, confirmation dialogs, tray usage tooltips, and installed-version-aware AI support are built in.

---

## Security and storage

- Account credentials are encrypted with AES-256-GCM, backed by Windows Credential Manager, macOS Keychain, or Linux Secret Service.
- Sensitive values stay in memory and are not saved to unencrypted browser storage.
- Subprocess credentials pass through standard input (`sys.stdin`) instead of command arguments (`sys.argv`).
- Configuration files use restricted file permissions (`0600` files, `0700` directories) and reject symlinks (`O_NOFOLLOW`).
- Local proxy and Agent API check bearer tokens in constant time and require loopback host binding (`127.0.0.1`).
- Windows uninstaller includes an opt-in full-cleanup checkbox (`Clean all app data`) alongside an encrypted backup reminder before removing app data, temp files, Credential Manager keys, and environment variables.
- Update notifications link to official GitHub release pages for manual verification.

---

## Platform risks and terms of use

Account switching and proxying interact with each provider's usage terms and abuse protections.

### Platform comparison

| Platform           | Multi-account/profile monitoring    | Credential switching | Proxy router | Current QuotaShift behavior                                                  |
| ------------------ | ----------------------------------- | -------------------- | ------------ | ---------------------------------------------------------------------------- |
| Google Antigravity | Yes                                 | Yes                  | No           | Monitor quotas, capture local sessions, and apply saved accounts             |
| OpenAI Codex       | Yes                                 | Yes                  | Yes (local)  | Monitor usage, switch saved accounts, and optionally use local routing pools |
| Claude Code        | Yes, by `CLAUDE_CONFIG_DIR` profile | No                   | No           | Monitor multiple local profiles and apply account-scoped guardrails only     |

---

### Google Antigravity

QuotaShift reads usage through background workers or OAuth endpoints. When you apply an account, QuotaShift updates IDE configuration files and restarts active IDE or CLI (`agy`) processes.

- Rapidly switching Google accounts from the same machine and IP address may trigger Google security checks, including phone verification or OAuth re-consent.
- Credential switches stop running Antigravity processes. Save active files before applying a new account.
- Creating disposable accounts to cycle free quota violates Google's terms. Use QuotaShift with legitimate accounts.

### OpenAI Codex

QuotaShift manages credentials in `~/.codex/auth.json` and can route requests across accounts through a local proxy (`127.0.0.1:0`).

- OpenAI terms prohibit using proxy pools or multiple accounts to bypass subscription rate limits.
- Rotating tokens aggressively across accounts can lead to HTTP 429 errors, revoked sessions, or account suspension.
- Switching accounts terminates running Codex CLI sessions, desktop apps, and extension servers. Do not switch during active generations.

### Why Claude Code does not support account switching

QuotaShift supports monitoring multiple Claude Code profiles, but it intentionally does not switch Claude credentials or pool Claude accounts.

- Each monitored profile is identified by its local `CLAUDE_CONFIG_DIR` path.
- Adding a profile gives QuotaShift another monitor target; it does not copy, replace, or rotate Claude authentication data.
- Guardrails are account-scoped and one-shot: after a successful suspension both Claude guardrail windows turn off. QuotaShift never resumes a process merely because guardrails are disabled or a later quota probe is unavailable.
- Manual Resume is the default. Optional auto-resume at quota reset is disabled by default and, when enabled, requires the exact persisted PID, process start time, and profile mapping to still match; if both guardrail windows triggered, both reset conditions must pass.
- Claude Code remains a monitor-only integration; no Claude proxy router or credential-switching workflow is provided.

---

## Setup and guides

- For installation packages and local development steps, see [GUIDELINE.md](GUIDELINE.md).
- For release notes and version history, see [CHANGELOG.md](CHANGELOG.md).

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## CLI-pool automatic failover (v1.3.0)

CLI-pool rotation is opt-in. Configure **Settings → Monitoring → CLI Rotation**, turn on **Restart running app on switch**, then enable the desired provider's **CLI Pools** and **Automatic Quota Switching**. Two separately fetched quota snapshots must confirm exhaustion and the next pool account must have fresh positive remaining quota. QuotaShift preflights running CLI processes—including two-sample CPU, child-process, and recent session/rollout activity probing when **Switch Only When Process Is Idle** is enabled, plus recency-based multi-instance disambiguation (`<= 5 min` with distinct `cwd`)—restarts onto the next account, verifies the relaunched CLI process (`<= 2.5s`), and copies the resume command to the clipboard if automated prompt delivery fails.

**Important:** Ambiguous/tied processes, stale quota snapshots, active busy processes (while idle-only is ON), or unreadable prompt history fail closed rather than risking work loss. Test CLI-pool handoffs with a disposable session before relying on them in production.

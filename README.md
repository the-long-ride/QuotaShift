# QuotaShift

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Quota monitoring and account switching for AI coding tools.

QuotaShift is a desktop application built with Tauri that tracks quota limits, reset windows, and balances for Google Antigravity, OpenAI Codex, and Anthropic Claude. You can monitor usage from the system tray or a desktop overlay and switch active credentials in one click.

---

## Preview

| Antigravity Tab | ChatGPT Codex Tab | Claude Tab |
|---|---|---|
| <img src="assets/demo-pics/Antigravity-tab.png" width="100%" alt="Antigravity Tab"> | <img src="assets/demo-pics/Codex-tab.png" width="100%" alt="Codex Tab"> | <img src="assets/demo-pics/Claude-tab.png" width="100%" alt="Claude Tab"> |

<p align="center">
  <strong>Desktop Overlay HUD</strong><br>
  <img src="assets/demo-pics/Overlay.png" width="60%" alt="Desktop Overlay HUD">
</p>

---

## Key features

### Desktop overlay
- Translucent HUD showing dual limits, the active model, and usage percentages.
- Edge clamping on Windows keeps the overlay within screen bounds across multiple monitors.
- Width adjusts automatically for the tracked platform.
- Right-click menu lets you refresh quotas, open the dashboard, or hide the overlay.
- Hover tooltips show exact remaining quota, token counts, and reset times.

### Google Antigravity
- Track 5-hour and weekly quota pools with absolute reset times.
- Inspect quotas through background language server workers without locking the active IDE session.
- Detect unsaved IDE sessions with a pinned card and capture them in one click.
- Switch accounts by updating local IDE credentials, refreshing OAuth tokens before writing, and restarting processes cleanly.
- Pick the account with the most remaining quota using the Best button.
- Background keep-alive loop refreshes OAuth access tokens to prevent session expiration.
- Drag and drop account cards to save a custom sort order.

### OpenAI Codex
- Monitor Free, Plus, Pro, and Team accounts with primary and weekly usage windows.
- Local loopback proxy router (`127.0.0.1:0`) with random 32-byte bearer tokens from `OsRng`.
- Query model availability across saved accounts to find shared model support.
- Group accounts into routing pools with automatic failover when limits are reached.
- Sync provider settings in `config.toml` with automatic restore on exit, tray quit, or crash recovery.
- Process manager stops active Codex CLI, ChatGPT desktop, and extension processes before credential switches.

### Anthropic Claude
- Read-only bridge that monitors local Claude Code `statusLine` output and `~/.claude/projects/` transcripts.
- Shows the active model, token velocity, context window percentage and size, estimated USD cost, run duration, and prompt cache hits.
- Aggregates local token use over 5-hour and 7-day rolling windows.
- Pin local Claude sessions to the desktop overlay with the Track button.
- Stores no credentials, runs no proxy, and makes no network requests to Anthropic.

### Dashboard and backups
- Search accounts in real time across Antigravity and Codex tabs.
- Export and import accounts using AES-256-GCM passphrase-encrypted backups.
- Reveal exported backups directly in Windows Explorer, macOS Finder, or Linux file managers.
- Switch between compact and expanded card layouts.
- Set custom poll intervals for tracked and idle accounts.
- Confirmation modals protect against accidental account deletion or process termination.
- Minimize to the system tray with live usage tooltips.

---

## Security and storage

- Account credentials are encrypted with AES-256-GCM, backed by Windows Credential Manager, macOS Keychain, or Linux Secret Service.
- Sensitive values stay in memory and are not saved to unencrypted browser storage.
- Subprocess credentials pass through standard input (`sys.stdin`) instead of command arguments (`sys.argv`).
- Configuration files use restricted file permissions (`0600` files, `0700` directories) and reject symlinks (`O_NOFOLLOW`).
- Local proxy checks bearer tokens in constant time and requires loopback host headers.
- Update notifications link to official GitHub release pages for manual verification.

---

## Platform risks and terms of use

Account switching and proxying interact with each provider's usage terms and abuse protections.

### Platform comparison

| Platform | Multi-account support | Credential switching | Proxy router | Risk level | Main consideration |
|---|---|---|---|---|---|
| Google Antigravity | Yes | Yes | No | Low to moderate | Account checkpoints when switching frequently on one IP |
| OpenAI Codex | Yes | Yes | Yes (local) | Moderate | Terms against bypassing rate limits through account pools |
| Anthropic Claude | No | No | No | None (zero risk) | Read-only local monitoring; no credential handling |

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

### Why Claude does not support account switching
QuotaShift does not support multi-account management or account switching for Claude. This is intentional:

- **Anthropic terms prohibit rate limit evasion**: Anthropic's Commercial Terms, Usage Policy, and Claude Code terms forbid using multiple accounts to bypass usage limits, such as the 5-hour message cap on Pro and Team plans. They also forbid credential sharing and automated account pooling.
- **Enforcement leads to permanent bans**: Anthropic actively monitors account cycling and automated credential swapping. Violations result in immediate account termination, forfeiture of paid balances, and bans on associated payment methods and phone numbers.
- **Safe by design**: To protect user accounts from bans, QuotaShift never manages Claude credentials.
- **Local read-only observer**: The Claude tab only reads local telemetry from the Claude Code `statusLine` hook and on-disk transcripts in `~/.claude/projects/`. It does not store tokens, does not switch sessions, and never contacts Anthropic authentication servers.

---

## Setup and guides

- For installation packages and local development steps, see [GUIDELINE.md](file:///F:/my-repos/my-opensources/QuotaShift/GUIDELINE.md).
- For release notes and version history, see [CHANGELOG.md](file:///F:/my-repos/my-opensources/QuotaShift/CHANGELOG.md).

---

## License

This project is licensed under the MIT License. See [LICENSE](file:///F:/my-repos/my-opensources/QuotaShift/LICENSE) for details.


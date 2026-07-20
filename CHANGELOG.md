# Changelog

All notable changes to this project will be documented in this file.

## [0.0.8] - 2026-06-28

### Added

- Active badge now shows the account that is actually applied/running in the IDE, not just the tracked/monitored card. Separate `appliedId` prop tracks the true active session.
- Plan detection now maps `advanced-tier` / `advanced` / `google_ai_pro` / `google-ai-pro` / `ai-pro` to "Google AI Pro" and `ultra-tier` / `ultra` / `google_ai_ultra` / `google-ai-ultra` / `ai-ultra` to "Google AI Ultra" in both Rust parser and frontend resolver.
- Auto-detect OAuth client credentials from the user's installed Antigravity IDE (`main.js`) at runtime, with fallback to gcloud ADC and compile-time defaults.
- OAuth credentials extracted to `secrets.rs` with compile-time env var overrides (`QUOTASHIFT_*`).
- Loading spinner moved to the left of the Apply button in account card headers.
- Per-account usage cache with 5-minute TTL; "Best" button on Codex and Antigravity tabs switches to the account with the most remaining quota across visible windows.
- Recommend `vadimcn.vscode-lldb` in `.vscode/extensions.json` for in-IDE Rust debugging.

### Fixed

- Apply Antigravity account now refreshes the access token before writing the session, preventing 401 errors from expired tokens.
- Preserved existing `lastPlan` and `lastBalance` on card when quota fetch returns no plan/credits data (e.g. from language server fallback), instead of overwriting with defaults.
- Removed "Live - just now" timestamp and "Fetching live quota..." / "Fetching usage..." text from account cards.
- Fetch ChatGPT (Codex) OAuth `client_id` at runtime from the `openai/codex` GitHub raw source, cache to `~/.quotashift/codex_client_id.txt`; replaces the compile-time env var that previously shipped empty and broke browser login with "Authentication Error / empty_string".
- Fetch Antigravity consumer Google OAuth `client_id` + `client_secret` at runtime from the `skainguyen1412/antigravity-usage` GitHub raw source, cache to `~/.quotashift/ag_client_id.txt` + `ag_client_secret.txt`; replaces compile-time defaults that were not reaching the OAuth flow, causing browser login to fail with "Missing required parameter: client_id" (Error 400: invalid_request).
- Antigravity cloud `retrieveUserQuota` buckets with no `window` field now apply their percentage to both 5h and weekly pools instead of defaulting the missing window to `"5h"` (which left the weekly column stuck at 100%).
- Antigravity browser login no longer overwrites the IDE's current session; the `write_antigravity_session` call is removed from the browser login path. Users must explicitly click "Apply" on an account card to switch the IDE session.
- Codex Plus (and above) accounts now display only the weekly limit column — OpenAI removed the monthly cap for these tiers. Falls back to `weekly_window` field when `secondary_window` is absent.

## [0.0.7] - 2026-06-25

### Added

- Added "Unsaved Active IDE Session" banner at the top of the Antigravity tab when the running IDE session uses an unsaved account, with a one-click Capture button.

### Fixed

- Fixed backend session token decoding to successfully resolve access and refresh tokens from protobuf format regardless of base64 prefixes.
- Automatically aligned and cleared the active account badge if the user switches to an unsaved account in the IDE.

## [0.0.6] - 2026-06-25

### Fixed

- Handled background terminal command execution silently on Windows (no flashing console windows).
- Fixed double quotes being added to the installation directory in the NSIS installer.
- Added auto-recovery of active Codex session from `~/.codex/auth.json` on token expiry/401 errors.
- Synchronized refreshed Codex session tokens back to `~/.codex/auth.json` to keep the active CLI/extension session logged in.

## [0.0.4] - 2026-06-24

### Fixed

- Removed enclosing quotes from `InstallLocation` registry key.
- Configured passive installer flags (`/UPDATE`, `/P`, `/R`) in update process to automate update installation and application restart.

## [0.0.2] - 2026-06-24

### Fixed

- Resolved account switching issue in Codex and Antigravity by introducing direct credentials and session state injection.
- Handled session capture/import by linking quota tracking to account emails instead of raw session IDs, preventing overwrites.
- Added password phrase handling for improved security when importing/ exporting backup data sessions.
- Prevented duplicate account cards in the UI when importing a session for an existing account.

## [0.0.1] - 2026-04-20

### Added

- Manage Antigravity and Codex accounts in a single interface.
- Real-time monitoring of 5-Hour and Weekly limits for both Antigravity and Codex.
- System tray tooltip displaying active model and quota limits.
- Floating overlay dashboard with active model details and remaining credits.
- Custom polling intervals, light/dark themes, and update notifications.
- Auto-centering of monitored model and interdependent limit updates.
- Support for multiple accounts and quick swapping between them.

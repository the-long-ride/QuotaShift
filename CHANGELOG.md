# Changelog

All notable changes to this project will be documented in this file.

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

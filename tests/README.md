# Test layout

Tests are grouped by the behavior they cover:

- `accounts/`: shared account management, authentication, and account cards
- `antigravity/`, `claude/`, `codex/`: provider-specific behavior
- `desktop/`: overlay, windows, tray, and shortcuts
- `ui/`: settings, layout, and general interface contracts
- `security/`: credential storage and security checks
- `updates/`: update and release behavior
- `tooling/`: repository scripts, CI, and coverage checks
- `shared/`: behavior crossing several groups and general utilities
- `helpers/` and `fixtures/`: support files used by tests

Run the whole suite with `pnpm test`. The test and coverage runners discover
`*.test.mjs` files recursively, so new tests belong in the relevant subfolder.

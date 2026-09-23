# Hook layout

- `app/`: app coordination, bootstrap, updates, and overlay state
- `accounts/`: shared account card and ordering behavior
- `antigravity/`, `claude/`, `codex/`: provider-specific behavior
- `desktop/`: shortcuts, card layout, and window zoom

Keep a hook with the behavior it owns. Imports use direct module paths.

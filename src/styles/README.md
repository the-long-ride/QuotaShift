# Stylesheet layout

- `accounts/`: shared account cards and actions
- `antigravity/`, `claude/`, `codex/`: provider-specific styles
- `desktop/`: overlay, window, layout, and final UI polish
- `settings/`: settings and help views
- `shared/`: base panels and modals

`src/styles.css` remains the ordered entry point. Preserve its cascade order when adding or moving stylesheets.

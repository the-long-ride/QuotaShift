# 06 — Settings and Configuration

**Audience:** engineers & AI agents · **Verified against:** `1.1.4` · **Date:** 2026-10-06

Settings uses a vertical six-section navigation: Monitoring, Appearance, Keyboard Shortcuts, Data, Logs, and Help.

## Core preference defaults

| Area | Storage key | Default / range |
| --- | --- | --- |
| Tracked poll | `quotashift_tracked_poll_interval_secs` | 30s; 5–1200s |
| Idle accounts poll | `quotashift_idle_poll_interval_secs` | 600s; 5–1200s |
| Claude guardrail poll | `quotashift_claude_poll_interval_secs` | 20s; 5–1200s |
| Claude only watch running accounts | `quotashift_claude_only_watch_processing_accounts_v1` | true |
| Claude reset count in overlay | `quotashift_claude_reset_credits_enabled_v1` | false |
| Claude 5h guardrail enabled | `quotashift_claude_five_hour_stop_enabled` | false |
| Claude 5h threshold | `quotashift_claude_five_hour_stop_threshold_pct` | 95 |
| Claude weekly guardrail enabled | `quotashift_claude_weekly_stop_enabled` | false |
| Claude weekly threshold | `quotashift_claude_weekly_stop_threshold_pct` | 98 |
| Claude auto-resume | `quotashift_claude_auto_resume_at_reset_v1` | false |
| Claude low-usage reduction | `quotashift_claude_reduce_low_usage_frequency` | false |
| Theme | `antigravity-theme` | dark |
| Card layout | `quotashift_card_layout_mode` | expanded unless compact explicitly stored |
| Platform visibility | `quotashift_platform_visibility_v1` | all three providers visible |
| Antigravity and multi-account Codex keep-alive | `keepAliveActive` | true |
| Main WebView zoom | `quotashift_main_webview_zoom_v1` | 100%; 70–190% |
| Overlay UI | `quotashift_ui_adjustment_v1` | glassmorphism, 100%; scale 80–200% |
| Display mode | `quotashift_display_mode_v1` (last non-None in `quotashift_display_mode_last_v1`) | taskbar (Windows) / overlay (other); none / overlay / taskbar; forced to none when untracked |
| Track multiple accounts (experimental) | `quotashift_multi_track_v2` | false |
| Tracked account list | `quotashift_overlay_tracked_v2` | primary only; 1–3 `{provider, id}` entries |
| Restart running app on switch (experimental) | `quotashift_restart_on_switch_v1` | false |
| Claude last-good usage cache | `quotashift_claude_usage_cache_v1` | per-account snapshot |

## Monitoring

The Monitoring tab contains:
- **Poll rates**: Monitored account (default 30s) and Other idle accounts (default 600s), range 5–1200s.
- **Track multiple accounts <Experimental>**: tracks up to 3 accounts from any mix of providers.
- **Antigravity & ChatGPT Codex**:
  - Keep-alive: maintains saved Antigravity sessions and local Codex sign-in in the background.
  - Persistent AG monitor <Experimental>: keeps isolated Antigravity monitoring workers running.
  - Restart running app on switch <Experimental>: restarts running desktop apps and `agy` CLI in a fresh terminal upon account switch.
- **Claude Code**:
  - Reduce frequency refresh claude code usage: throttles usage probes when usage is below 10%.
  - Show Claude reset count <Experimental>: controls the reset badge in the overlay HUD and taskbar item for the tracked non-local Claude account.

## Keyboard Shortcuts

The tab is split into two independent groups.

### Global shortcuts

These remain registered while the dashboard is hidden in the tray. Each binding has an enable switch and is rebindable.

| Action | Default |
| --- | --- |
| Cycle display mode (None → Overlay → Taskbar) | `CommandOrControl+Alt+D` |
| Refresh monitored account | `CommandOrControl+Alt+R` |

### In-app shortcuts

These execute only while the QuotaShift WebView is open. They are persisted and rebindable.

| Action | Default | Behavior |
| --- | --- | --- |
| Add account | `CommandOrControl+N` | Opens Add for the current provider tab |
| Toggle theme | `CommandOrControl+L` | Dark/light |
| Toggle card view | `CommandOrControl+E` | Compact/expanded |
| Focus search | `CommandOrControl+F` | Focuses header search |
| Reload full usage | `CommandOrControl+R` | Forces full usage refresh |
| Open Settings | `CommandOrControl+,` | Opens Settings |
| Quit app | `CommandOrControl+Shift+Q` | Opens quit confirmation |

Shortcut-aware buttons include their live binding in the custom tooltip as keycaps. Search is the exception: its current binding is shown in the placeholder.

## Appearance

- **Header actions**: theme toggle button (sun/moon artwork) is placed immediately to the left of the close button.
- **Card view**: segmented switch for Compact vs Expanded card modes.
- **Monitored Display**:
  - **Quota display**: segmented switch choosing **None**, **Overlay**, or **Taskbar** (Windows only).
  - **Overlay & taskbar tooltip UI scale**: slider adjusting scale between 80% and 200%.
  - **Overlay theme**: segmented switch choosing `glassmorphism` or `mono`.
  - **Reset monitor display**: button resetting overlay position, scale, and theme to default values.
- **Platform Visibility**: independent toggle cards for Antigravity, ChatGPT Codex, and Claude Code. Hiding Claude Code stops all Claude background polling and feature execution.

## Usage color contract

All remaining-usage displays share the same thresholds:

- `<10%`: critical red.
- `10%–<20%`: warning orange `#f97316` (the same orange as the overlay warning bar).
- `>=20%` or unavailable: normal treatment.

## Dialog/confirmation behavior

- Shared dialogs remain below the 38px app title bar and are capped to the available viewport at high zoom.
- The title bar remains visible/interactable and gains a shadow while a dialog is open.
- Confirmation dialogs use Escape for cancel/close and Enter for confirm.
- Wrong backup passphrases are shown inline below the passphrase input rather than as a toast.

## Codex non-secret state

| State | Storage key |
| --- | --- |
| Accounts | secure facade key `antigravity-codex-accounts` |
| Pool definitions | `quotashift_codex_account_pools_v1` |
| Active pool | `quotashift_codex_active_pool_id_v1` |
| Pool routing requested | `quotashift_codex_pool_routing_v1` |
| Model catalog cache | `quotashift_codex_model_catalog_v1` |
| Successful usage cache | `quotashift_codex_usage_cache_v1` |

The usage cache persists successful snapshots only and removes transient loading/error flags before storage.

**Next →** [07 — Backup and Recovery](07-backup-and-recovery.md)

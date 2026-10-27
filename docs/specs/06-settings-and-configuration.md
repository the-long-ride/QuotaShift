# 06 — Settings and Configuration

**Audience:** engineers & AI agents · **Verified against:** `1.2.0` · **Date:** 2026-10-27

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
- **Poll rates**: Monitored account(s) (default 30s) and Other idle accounts (default 600s), range 5–1200s.
- **Track multiple accounts <Experimental>**: tracks up to 3 accounts from any mix of providers.
- **Antigravity & ChatGPT Codex**:
  - CLI auto-rotation <Experimental>: enables automated process rotation upon quota exhaustion.
  - Continuation prompt: user-configurable instruction passed on CLI resume (default: 'continue remaining works').
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

## Concurrent Codex Model Pools UI (V2)

The **Codex → Model Pools** tab uses independent **Enabled** switches, rather than choosing one
global active pool. Every enabled pool is routable concurrently by its unique public model
name; multiple pools may point at the same upstream model. Enabling an alias collision
fails without disabling other pools. Pool display names are not routing keys.

The **Pool Routing** switch starts/stops the local gateway for all enabled pools. If all pools
are disabled, the gateway cannot be enabled and will stop when the last pool is disabled.
Definitions live at `quotashift_codex_model_pools_v2`. The legacy
`quotashift_codex_active_pool_id_v1` is a one-time migration input, not the active routing
selection. The global Codex CLI applied account is independent of enabled Model Pools.

### Claude Code through Model Pools

The **Claude Code** tab includes **Connect to QuotaShift**. It routes Claude Code through the
local gateway (`/v1/messages`) to an enabled Model Pool. Requests are translated from
Anthropic Messages to OpenAI Responses and streamed back in Anthropic format.

Setup: pick an installation and profile, choose a mode, and map Claude slots (Default, Sonnet,
Opus, Haiku, Fable) to pool aliases. The **Default slot is required**: unmapped Claude models
use its pool, and Connect refuses without it ("Map the Default slot: unmapped Claude models use
it.").

- **Launch once**: starts Claude Code with temporary env; the token lives only in memory. A new
  launch-once connect revokes the token of an earlier launch-once session.
- **Persist for this profile** (internal id `persistent-profile`): writes `apiKeyHelper`
  (`"<exe>" --claude-gateway-token <profile_id>`), the base URL and the slot env keys into the
  profile `settings.json`. No token is written there. Gateway bindings are encrypted at rest
  and survive restarts.

Connect refusals:

- The profile's own `settings.json` env has `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`
  (QuotaShift does not edit them; remove the key and retry).
- Launch once: `settings.json` env.ANTHROPIC_BASE_URL is set to a different URL than the
  gateway's. Settings override the process environment, so Claude Code would bypass the
  gateway. Remove or fix that key.
- Persist for this profile: the router is not on a fixed port. The address is written into
  `settings.json`, so it must survive restarts. In Model Pools > Router Server enter a Port
  (1024-65535) and click Apply, then connect again. A random port, or a start that fell back
  because the saved port was taken, does not count. Launch once works on any port.
- A mapped alias is not an enabled pool, or is a legacy Codex OAuth pool. Use an enabled SIWC or
  API-key pool.

These cannot be checked at connect time and will override `apiKeyHelper`: project-level
`.claude/settings*.json` env, managed/organisation policy settings, and
`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` exported in the shell.

The **Connected profiles** section of the wizard lists connections and their state:

| State | Meaning / action |
| --- | --- |
| Connected (no suffix) | Active. **Disconnect** revokes the token and restores `settings.json`. |
| `, router stopped` | Not cleanup-pending, but the local router is not running, so the connection is not live. Start Model Pool Routing: it works again when the router comes back on the same address, which a fixed port guarantees. If the address differs, the row changes to the next state. |
| `, router address changed - reconnect` | `settings.json` still holds the address the router had when you connected, but the router now listens elsewhere (for example the saved fixed port was taken at startup and it fell back to a random port, or you changed the port). Claude Code cannot reach the router. Free the saved port and click Apply on the Port setting (or stop and start Model Pool Routing), or connect again to write the new address. QuotaShift never rewrites your `settings.json` on its own. |
| `, cleanup pending` | The settings revert failed (for example a managed key was edited); the message names the key. **Clean up** retries the revert. **Dismiss** stops tracking, leaves `settings.json` as is (token already revoked); remove `apiKeyHelper` / `ANTHROPIC_BASE_URL` yourself. After Dismiss, leftover keys are treated as your originals on a later reconnect. |

Behaviour and errors:

- If an account fails before any text or tool output, QuotaShift tries the next account in the
  pool (`precommit_failover` in `quotashift.log`). After content has started streaming a failure
  ends that response; there is no mid-stream switch.
- 429: `QuotaShift pool '<alias>' has no account with remaining quota. Switch this Claude slot to another pool in QuotaShift.` Map the slot to another pool or wait for quota.
- 502: `Every account in pool '<alias>' failed; last failure: <reason>.` Check the accounts.
- Both the 429 and the 502 carry `x-should-retry: false`, so Claude Code shows them at once instead of retrying for minutes.
- Other upstream error messages are passed through unchanged.

Manual verification steps: `docs/superpowers/plans/2026-10-26-claude-code-manual-check.md`.

### Routing key regeneration

Regenerating the routing secret key displays a confirmation dialog with an automated profile synchronization switch (default ON). When accepted:
- If ON, QuotaShift updates the routing key in `settings.json` for all QuotaShift-created Claude profiles and alerts with a toast listing updated profiles.
- If OFF or if no profiles exist, it regenerates the key and alerts with a standalone confirmation toast.


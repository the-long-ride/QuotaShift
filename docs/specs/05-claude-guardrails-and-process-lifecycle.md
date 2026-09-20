# 05 — Claude Guardrails and Process Lifecycle

**Audience:** engineers & AI agents · **Verified against:** `1.1.1` · **Date:** 2026-09-21

Claude Code remains credential monitor-only while QuotaShift can observe local profiles and suspend/resume verified Claude-owned processes when quota guardrails trigger.

## Profile and visibility model

- Profiles are keyed by `CLAUDE_CONFIG_DIR`.
- Standard/running profiles are discovered automatically; custom roots can be added manually.
- Claude platform visibility is the master runtime gate. Hidden Claude disables frontend polling, guardrail evaluation, statusline setup, usage event handling, manual/overlay refresh, and backend auto-resume checks.

## Polling precedence

1. Hidden Claude: no Claude polling.
2. Visible and either guardrail enabled: active/processing and explicitly tracked profiles use the dedicated Claude cadence when eligible.
3. Visible, guardrails off, explicitly tracked profile: global tracked-account cadence.
4. Other visible profiles, including inactive/untracked/process-suspended profiles: Other idle accounts cadence.

Defaults and bounds:

- Claude guardrail poll: 20s default, 5s–1200s allowed.
- Global tracked poll: 30s default.
- Other idle accounts: 600s default.
- Optional low-usage resource saver: OFF by default; eligible probing is reduced when usage is below 10% of limit.

Per-account manual Refresh is disabled while that profile is process-suspended. The refresh controller always clears its loading state after success or failure.

## Guardrail windows

There is no separate master guardrail source of truth. The derived enabled state is true when either window switch is enabled.

| Window | Default enabled | Default threshold |
| --- | --- | --- |
| 5-hour | false | 95% used |
| Weekly | false | 98% used |

Stale, errored, or missing usage cannot trigger a suspension decision.

## Suspension lifecycle

When a fresh enabled window crosses its configured threshold:

1. QuotaShift resolves processes belonging to the target profile.
2. It records process identity needed for safe resumption.
3. It suspends Claude-owned CLI/background processes without suspending IDE host processes or usage probes.
4. Guardrail switches are disabled as a one-shot safety action.
5. In-app and native notifications report the suspension.

## Resume

### Manual

Before resuming, QuotaShift verifies that the recorded process still corresponds to the expected process identity/profile.

### Auto-resume at reset

- OFF by default.
- Runs only while Claude platform visibility is enabled.
- Requires all relevant triggered reset windows to be reached with trustworthy reset data.
- Missing/stale/error reset telemetry fails closed and leaves processes suspended.
- A complete auto-resume clears suspension state and immediately queues one forced fresh usage probe.
- Partial resume keeps the remaining suspension state blocked until all recorded processes are resolved.

## Overlay synchronization

Claude guardrail display settings are synchronized into overlay data only when the currently stored overlay payload belongs to Claude. Existing non-Claude overlay payloads are left unchanged.

**Next →** [06 — Settings and Configuration](06-settings-and-configuration.md)

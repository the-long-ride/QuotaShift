# CLI Account Rotation Playbook

## Current status

CLI Account Pools are a configuration preview and a set of Rust building blocks.
The UI persists pool definitions and preferences, but there is no runtime scheduler,
quota-event subscription, Tauri handoff command, or startup recovery banner yet.
Selecting a pool or enabling its saved preference does not switch accounts.
The runtime account-apply adapter returns an explicit unavailable error for both providers.
Existing manual account switching remains separate.

## Configuration preview

1. Open **Antigravity** or **Codex** and click **CLI Pools**.
2. Create a pool, choose its accounts and order, and configure quota windows.
3. Edit the continuation prompt in **Settings -> Monitoring -> Antigravity & ChatGPT Codex**.
   Its default is `continue remaining works`; Reset changes only this prompt.

Backups retain pool definitions and the exact prompt. Imported pools have auto-switch
turned off, and imported global preferences disable rotation and automatic startup restart.
Older backups preserve local pools. Active provider bindings remain local and are not exported.

## Implemented safeguards and remaining gates

Pure Rust helpers validate pool members, resolve conversation hints, build argv,
evaluate consecutive quota samples, plan a single-instance handoff, lock a provider/auth
domain, and persist journal state. Tests exercise these helpers with synthetic inputs.
They do not establish a working end-to-end handoff.

Before runtime integration, complete the `implementplan.md` acceptance gates for:

- Authoritative applied-account identity, quota feeds, and secure provider account services.
- Handle-bound process identity and graceful shutdown, idle detection, and durable orchestration.
- Installed CLI capability probing and OS-verified launch identity, account and conversation.
- Startup reconciliation, recovery UI, visible terminal selection, and cancellation.
- Disposable Windows end-to-end tests with Defender enabled.

The stop/launch helpers are not connected to automatic rotation. Their native behavior,
PID reuse races, terminal handling, and conversation verification remain release blockers.
Do not use them against live user sessions as part of routine development tests.

## Recovery status

Journal storage and transition helpers exist. The application does not yet scan them on
startup or expose Copy command / Dismiss actions. No automatic recovery is currently provided.
Use the original provider CLI's documented resume workflow if recovering a session manually;
verify the conversation and working directory yourself. Do not assume a successful process
spawn proves account or conversation continuity.

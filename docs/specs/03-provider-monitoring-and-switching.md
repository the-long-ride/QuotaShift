# 03 — Provider Monitoring and Switching

**Audience:** engineers & AI agents · **Scope:** Antigravity, Codex, and Claude provider subsystems · **Verified against:** `1.1.0`

QuotaShift integrates three distinct AI coding ecosystems, each with unique quota structures, authentication protocols, and switching capabilities.

## Provider Architecture Matrix

| Capability                 | Google Antigravity                | OpenAI Codex                           | Claude Code                    |
| -------------------------- | --------------------------------- | -------------------------------------- | ------------------------------ |
| **Quota Pools**            | 5-Hour & Weekly Pools             | Primary & Secondary (Weekly) Windows   | 5-Hour & Weekly Limit Windows  |
| **Account Switching**      | Full (OAuth & Session Injection)  | Full (Loopback Router & Session Write) | Monitor Only (Zero Mutation)   |
| **Discovery Method**       | Language Server & Cloud API       | CLI `auth.json` & OAuth Flow           | `CLAUDE_CONFIG_DIR` Profiles   |
| **Local Active Detection** | IDE Process Inspection & PID scan | `~/.codex/auth.json` Monitoring        | Active CLI Process PID scan    |
| **Routing / Failover**     | Manual Switching / "Best" Quota   | Local Proxy Routing Pools              | Threshold Guardrail Suspension |

---

## Shared Account Ordering & Sorting

- Antigravity, Codex, and Claude Code use the same persistent account-order model. Manual card dragging writes the resulting ID order, and the order is restored on the next launch.
- Claude Code profiles now expose the same drag handle and pointer-card reordering behavior as Antigravity and Codex.
- The **right-most account-bar action** on all three provider tabs is an icon-only **Sort** menu.
- Sort fields are **Alias name**, **Email**, **Tier**, **Usage**, and **Last used**. Every field supports both **Asc** and **Desc**.
- Sorting is a one-shot reorder, not a live sort mode: choosing a sort writes the resulting order to the same persisted ordering store used by drag-and-drop. Users can drag cards afterward to fine-tune the order.
- Missing field values are placed last for both directions.
- Alias and email use locale-aware text ordering. Tier uses provider tier rank. Last used sorts by the persisted last-use timestamp; Claude updates that timestamp when QuotaShift detects the profile as active/processing.

### Normalized Usage Sort

Usage sort compares consumed quota capacity rather than raw percentages. The base score is:

`normalized weekly usage + (normalized 5-hour usage / 6)`

Provider capacity normalization:

- **Antigravity**: Free = `0.3×` Plus, Plus = `1×`, Pro = `3×` Plus (`10×` Free), Ultra = `5×` Pro = `15×` Plus.
- **Codex**: Plus = `1×`; regular Pro = `5×` Plus; Pro x20 = `20×` Plus for both 5-hour and weekly lanes. A full Free monthly allowance is `0.25×` one Plus 5-hour allowance, so four full Free monthly allowances equal one full Plus 5-hour allowance.
- **Claude Code**: Pro/Team = `1×`; Max x5 = `5×` Pro/Team for 5-hour and `3×` for weekly; Max x20 = `20×` for 5-hour and `6.5×` for weekly.
- Antigravity remaining percentages are converted to consumed percentages before scoring. Unknown usage stays unscored and sorts after known values.

---

## 1. Google Antigravity Subsystem

### Quota Polling Architecture

- **Dual Pipeline**: Quota is collected either via direct Google Cloud `retrieveUserQuota` API calls using fresh OAuth tokens or via an isolated background language server worker.
- **Worker Isolation**: The language server worker runs in an independent temporary profile (`--user-data-dir`) so it never contends for database locks or interrupts active Antigravity IDE sessions.
- **Quota Buckets**: Automatically parses both 5-hour and weekly quota pools, calculating absolute local reset timestamps (`Resets at: HH:MM`, `Tomorrow at HH:MM`).

### Account Switching Flow

1. User clicks **Apply** on an Antigravity account card.
2. Rust backend verifies and refreshes the OAuth access token using the stored refresh token.
3. Backend safely injects the updated session into the Antigravity IDE configuration database.
4. Active IDE helper processes are gracefully recycled to apply new session state without requiring an IDE restart.
5. "Best" account algorithm allows one-click selection of the account card with the highest remaining quota across visible windows.

---

## 2. OpenAI Codex Subsystem

### Account & Workspace Discovery

- **Multi-Workspace OAuth**: Browser login flow connects with OpenAI OAuth. Accounts with multiple organizations or workspaces are split into dedicated cards with workspace name suffixes.
- **Tier Detection**: Automatically classifies subscription tiers (`Free`, `Plus`, `Pro`, `Team`, `Enterprise`), showing only applicable quota windows (e.g. Plus tiers hide legacy monthly limits).

### Loopback Proxy Router & Model Pools

- **Local Loopback**: Spawns an internal HTTP server on `127.0.0.1:0` protected by 32-byte OsRng bearer tokens.
- **Model Catalog Auto-Discovery**: Probes configured accounts to discover active model availability (`o1`, `gpt-4o`, `o3-mini`, etc.).
- **Account Pools**: Users can group multiple accounts into a pool. When an active account exhausts its 5-hour or weekly limits, the router seamlessly fails over to the next eligible account in the pool.
- **Pool Card Actions & Persistence**: Pool card "Apply" buttons share exact visual design parity with Antigravity and Codex active session buttons. Pool data definitions are fully incorporated into standard encrypted backups (`Settings → Data`).
- **`config.toml` Synchronization**: Automatically synchronizes local `~/.codex/config.toml` with proxy endpoint settings on startup and restores exact byte-for-byte configuration upon app exit, tray quit, or crash recovery.

---

## 3. Claude Code Subsystem

### Multi-Profile Discovery

- **Config Directory Keying**: Monitored profiles are identified by their `CLAUDE_CONFIG_DIR` paths (e.g. `~/.claude.json`, or isolated project configs) without altering local credentials.
- **Auto-Discovery**: Scans standard paths and running processes for active configuration roots.
- **Manual Addition**: Users can add custom config directories via `ClaudeAddAccountModal`.

### Visual & Functional Parity

- Claude cards share full visual alignment with Antigravity and Codex:
  - Account Card Header with copyable configuration path button.
  - Subscription tier badge and usage tone indicators (`success`, `warning`, `critical`).
  - Clear 5-hour and weekly usage progress bars with formatted countdowns.
  - Per-account **Refresh** action using the shared account-card refresh control; it forces a usage probe for only that profile and is disabled while that profile is suspended.
  - Persistent drag-and-drop profile ordering plus the shared account-bar Sort menu.
  - Direct **Reauthenticate** button if tokens become expired or invalid.

### Error Handling & Polling Suspension

- **Platform Visibility Is the Master Enable**: Turning Claude Code off in `Settings → Appearance → Platform Visibility` disables the Claude subsystem, not only its tab. Automatic usage polling, guardrail evaluation, usage-event handling, statusline setup, manual/overlay refresh paths, and backend auto-resume stay inactive until Claude Code is shown again.
- If Claude telemetry returns `401 Unauthorized` or `403 Forbidden`, `useAccountPollSuspension` halts polling for that profile, shows an error banner, and prompts for reauthentication instead of entering infinite polling retry loops.
- **Visible-Profile Idle Coverage**: While the Claude platform is enabled, every discovered profile remains eligible for scheduled usage probing. Active/processing or explicitly tracked profiles can use the faster applicable cadence; inactive, untracked, or process-suspended profiles continue refreshing on **Other idle accounts poll rate** instead of stopping entirely.
- **Manual Refresh Safety**: A suspended Claude profile still blocks the target-only manual card Refresh action. This does not disable its background idle usage polling.
- **Resume Re-Eligibility**: Manual or automatic resume removes the suspension state. A completed automatic resume immediately queues one fresh usage probe for the resumed profile; later scheduled probes can use the faster active/tracked cadence when applicable.
- **Tracked Poll Cadence**: While the Claude platform is enabled, an explicitly tracked Claude profile uses the dedicated Claude poll rate while either guardrail is enabled. With guardrails off, it uses the global tracked-account poll rate from Settings. Other visible profiles continue on the idle-account cadence. Hiding Claude is the hard stop for all Claude polling.
- **Low-Usage Resource Saver**: Users can enable "Reduce frequency refresh claude code usage to saving device resource" in `Settings → Monitoring`. When usage is < 10% of limit, CLI probe executions are throttled back to preserve CPU and battery for eligible untracked polling.

**Related:** [`02-security-and-credentials`](02-security-and-credentials.md) · [`05-claude-guardrails-and-process-lifecycle`](05-claude-guardrails-and-process-lifecycle.md)

**Next →** [`04-desktop-shell-and-overlay`](04-desktop-shell-and-overlay.md)

# Codex Routing, Model Discovery, Usage Dashboard, and Antigravity Failover Design

Date: 2026-09-08
Branch: `feat/keep-alive-all-antigravity-accounts`
PR: #11

## Scope

This design extends the existing Codex model-pool and Antigravity account-management work with four coordinated capabilities:

1. account-specific Codex model discovery and pool validation,
2. a local Codex request router for model-pool traffic,
3. automatic Antigravity account failover on quota exhaustion,
4. per-platform local usage history and dashboards.

The work is intentionally split into phases so each subsystem can be tested and stabilized before the next depends on it.

## Goals

- Discover the real Codex model catalog available to every saved OAuth account.
- Let pool model selection use an editable combobox populated by discovered models.
- Prevent creation of a pool whose dropdown-selected model is unavailable to any selected member.
- Preserve manual free-form model entry, but warn instead of blocking when availability is unknown or unsupported.
- Expose per-account model availability from each account card.
- Cache model discovery for 24 hours and provide an explicit global rescan action.
- Split the Codex tab into `Accounts` and `Pools` subtabs.
- Add a `Pool Routing` toggle that routes Codex requests through QuotaShift when enabled.
- Route each matching request to the eligible pool member with the strongest remaining quota and fail over on exhaustion.
- Add automatic Antigravity account failover when the active session exhausts a relevant quota window.
- Record local usage telemetry sufficient for useful dashboards without storing prompt or response content.
- Add a small `Last used` label to each account card.

## Non-goals

- QuotaShift will not proxy arbitrary internet traffic.
- QuotaShift will not store prompts, messages, generated content, or response bodies for analytics.
- Model discovery will not assume all accounts in one subscription tier have identical rollout access.
- Antigravity token counts will not be fabricated from quota percentages.
- API-key accounts are not required to support ChatGPT account-specific model catalog discovery in the first implementation unless a provider model endpoint is already available and authenticated safely.

# Phase 1 — Codex Model Discovery and Pool Editor

## 1.1 Model discovery source

Every saved Codex OAuth account is scanned independently.

QuotaShift will call the Codex-specific remote model catalog using that account's current OAuth access token and account ID. The implementation must follow the current Codex request shape, including the Codex client-version query parameter and account-scoped authentication headers. The client version should be resolved from the installed Codex client when possible; if it cannot be resolved, QuotaShift uses a tested compatibility value owned by the model-discovery module rather than omitting the parameter.

The discovery result is normalized into a stable account-level model list. At minimum each model record stores:

- canonical model identifier,
- display name when supplied,
- visibility/listability metadata when supplied,
- capability metadata useful to the UI when supplied,
- scan timestamp,
- scan error if discovery failed.

No model is inferred solely from plan name.

## 1.2 Account model cache

Add persistent local cache keyed by Codex account ID.

Persist this shape, with the concrete model type defined by the model-discovery module:

```ts
interface CodexModelCatalogCacheEntry {
  accountId: string;
  planName: string | null;
  models: CodexAvailableModel[];
  fetchedAt: number;
  error?: string;
}
```

Cache freshness is exactly 24 hours from `fetchedAt`.

Behavior:

- account card/model dialog uses fresh cache immediately,
- stale/missing cache triggers background scan when the model UI is opened or pool editing requires it,
- explicit rescan ignores freshness,
- deleting an account deletes its model cache entry,
- importing/restoring accounts does not blindly trust cache from another account ID unless IDs are remapped consistently.

## 1.3 Tier grouping

After individual scans, QuotaShift derives groups by normalized `planName` such as Free, Plus, Pro, Team, Enterprise, Edu, or unknown/custom.

Tier grouping is only an organizational view. It must never replace account-level validation.

For each tier QuotaShift derives:

- union of models available to at least one successfully scanned account in the tier,
- intersection of models available to every successfully scanned account in the tier,
- support count for each model,
- number of scanned and failed accounts.

The pool-model dropdown uses tier headings and model support counts. Pool validation still checks every selected member account directly.

## 1.4 Pool model combobox

Replace the current plain model input with an editable combobox.

The user can:

- type any model identifier manually,
- open the dropdown and select a discovered model,
- filter the dropdown by typing,
- browse discovered options grouped by plan tier.

Selection semantics:

### Dropdown-selected discovered model

This is a strict selection.

For every selected OAuth member:

- model cache must be available,
- the selected model must appear in that member's available model list.

If any selected member lacks the model or has an unresolved scan failure, pool creation/save is blocked and the incompatible rows are highlighted with a precise reason.

### Manually typed model

Manual free-form input remains allowed.

If the typed model is not confirmed for every member:

- show a warning hint,
- identify which accounts do not confirm support,
- allow Save/Create anyway.

A manually typed string that exactly matches a discovered dropdown item is still treated as manual unless it was explicitly selected from the dropdown during the current edit session. This preserves the user's escape hatch intentionally.

## 1.5 Pool member list layout

The member checklist becomes a row-style list.

Requirements:

- maximum five account rows visible at once,
- additional accounts available via vertical scrolling,
- each row shows account label, email, plan, and compatibility state for the current model,
- each row remains keyboard accessible,
- selection uses custom SVG checkbox visuals.

Checked icon shape:

```svg
<svg fill="#000000" viewBox="0 -1.5 27 27" xmlns="http://www.w3.org/2000/svg"><path d="m24 24h-24v-24h18.4v2.4h-16v19.2h20v-8.8h2.4v11.2zm-19.52-12.42 1.807-1.807 5.422 5.422 13.68-13.68 1.811 1.803-15.491 15.491z"></path></svg>
```

Unchecked icon shape:

```svg
<svg fill="#000000" viewBox="0 -0.5 25 25" xmlns="http://www.w3.org/2000/svg"><path d="m24 24h-24v-24h24.8v24zm-1.6-2.4v-19.2h-20v19.2z"></path></svg>
```

Implementation uses `currentColor` or equivalent theme-aware styling while retaining these requested shapes. The underlying control must keep native-equivalent keyboard and accessible checked semantics.

## 1.6 Per-account model dialog

Each Codex account card receives a small icon-only button with tooltip:

`Show available models`

Opening it shows a compact dialog containing:

- account label/email,
- plan tier,
- last model-scan time,
- scan status/error,
- all discovered models,
- a search/filter input,
- a per-account `Rescan` action.

The dialog height fits its content up to a viewport cap of `min(70vh, 520px)`. It does not reserve a fixed tall body. Once content exceeds the cap, only the model-list body scrolls.

## 1.7 Global model rescan

Settings receives:

`Rescan all Codex models`

Behavior:

- scan every saved OAuth Codex account individually,
- refresh expired tokens first where supported,
- scan at most three accounts concurrently,
- report per-account progress and final success/failure counts,
- refresh tier-group derived data after completion.

# Phase 2 — Codex Pool Routing

## 2.1 Codex tab structure

Inside the existing ChatGPT Codex tab, add two subtabs:

- `Accounts`
- `Pools`

The pool cards move to the Pools subtab. Account cards remain in Accounts.

A persistent `Pool Routing` switch is visible in the Codex tab header area on both subtabs.

## 2.2 Local loopback gateway

When Pool Routing is ON, QuotaShift starts a loopback-only HTTP gateway bound to `127.0.0.1` on an automatically selected free port.

The gateway becomes the configured Codex provider base URL. It forwards compatible Codex API traffic upstream after selecting credentials.

Security requirements:

- bind only to loopback,
- do not expose a LAN listener,
- do not log request bodies,
- do not persist prompts or response payloads,
- scrub authorization headers from logs,
- reject unsupported forwarding targets rather than operating as an open proxy.

The selected port is runtime state, not a permanent fixed port. Configuration stores the exact active loopback URL only while routing is enabled.

## 2.3 Client compatibility contract

QuotaShift will route Codex CLI, Codex IDE extension, and Codex desktop traffic only when those clients honor the shared Codex custom-provider/base-URL configuration QuotaShift controls.

Implementation must verify this behavior against the current clients instead of assuming it. If a client bypasses custom provider configuration, QuotaShift must not claim that client is routed; the UI should report unsupported/unverified client coverage rather than silently promising interception.

QuotaShift will not use process injection, TLS interception, system proxy hijacking, or other invasive methods to capture clients that bypass the supported provider configuration.

## 2.4 Routing decision

For each request:

1. determine requested model from the API request path/body in the smallest required parsing scope,
2. find enabled Codex pool(s) whose configured model matches that requested model,
3. determine eligible members,
4. select the best member,
5. inject that member's authentication upstream,
6. forward the request,
7. record routing/usage metadata.

If no pool matches the model, the request uses the normal currently applied Codex account rather than failing solely because routing is enabled.

If more than one pool matches the same model, the most recently activated matching pool wins. `activatedAt` is updated whenever the user applies/activates a pool.

## 2.5 Member eligibility

A member is eligible only if:

- it is still present in the pool,
- its credential can be read/deobfuscated,
- model validation does not positively mark the account incompatible when the pool used a discovered dropdown selection,
- its usage data is not known to be exhausted,
- it is not inside a failure backoff window.

The failure backoff window is 60 seconds by default and is reset on a successful routed request.

A manually typed model may route to members without confirmed catalog support because manual entry intentionally overrides strict validation. A model-not-found response marks that member incompatible for the current model until the next successful catalog rescan or explicit pool edit.

## 2.6 Best-account scoring

Selection maximizes usable headroom, not simply one quota percentage.

For each account, derive a bottleneck score from all relevant returned quota windows for the request/model. The account's effective remaining capacity is the minimum known relevant remaining percentage.

Examples:

- `100% 5h / 1% weekly` scores 1,
- `60% 5h / 60% weekly` scores 60,
- a weekly-only Pro account scores from weekly,
- a monthly-only Free account scores from monthly.

Unknown windows do not become zero automatically. Given equal bottleneck scores, an account with fresher and more complete quota information ranks ahead of one with unknown capacity.

Exact ties after freshness/completeness comparison rotate using a round-robin cursor so one account is not always chosen.

## 2.7 Exhaustion and failover

Failover triggers include:

- fresh usage reports no remaining capacity in a relevant window,
- upstream responds with a recognized quota/rate-limit exhaustion status,
- authentication fails and token refresh cannot repair it,
- model is rejected for the chosen member.

On a retryable exhaustion event:

1. mark the member temporarily unavailable for that model,
2. refresh usage/model state when appropriate,
3. select the next eligible member,
4. retry only when it is safe to replay the request.

Streaming or non-idempotent requests must not be blindly replayed after upstream processing may have begun. Retry is allowed only when the failure is known to have occurred before any response body or stream content was committed to the client.

## 2.8 Routing lifecycle and recovery

Turning Pool Routing ON:

- starts the loopback gateway,
- saves the pre-routing Codex provider configuration needed for restoration,
- writes QuotaShift's loopback base URL/provider configuration,
- verifies gateway health before reporting the switch as enabled.

Turning it OFF:

- stops accepting new routed requests,
- lets in-flight requests finish for up to 10 seconds,
- restores the prior direct provider configuration,
- stops the gateway.

Normal application shutdown performs the same restoration.

On startup, QuotaShift detects stale loopback provider configuration left by a crash. If routing preference is OFF or no QuotaShift listener owns that endpoint, it restores the saved pre-routing provider configuration before normal operation.

# Phase 3 — Antigravity Automatic Failover

## 3.1 Activation

Add an Antigravity automatic failover / round-robin setting using existing saved accounts and runtime-aware switching.

The feature observes the currently applied Antigravity session.

## 3.2 Exhaustion definition

The active account is considered exhausted for failover when any quota pool relevant to active/requested model usage reaches zero or a clearly exhausted state.

Relevant quota windows include every authoritative applicable server-returned window, including 5-hour and weekly windows when present. Missing windows are not fabricated.

If the current active workload's exact model family cannot be resolved, QuotaShift uses the most conservative known bottleneck across the account's applicable returned model pools.

## 3.3 Candidate scoring

Candidate accounts are ranked by bottleneck remaining capacity in the same manner as Codex routing: minimum remaining relevant window.

Only accounts with usable credentials and non-exhausted relevant quota are considered.

Exact ties after freshness/completeness comparison use round-robin rotation among equal candidates.

## 3.4 Switching behavior

Failover reuses the existing runtime-aware `switch_antigravity_account` path:

- IDE running: capture exact executable, switch, reopen,
- `agy` running: replace credential and stop stale CLI process as already designed,
- both running: handle both,
- neither: prepare credentials for next launch.

Hysteresis rules:

- minimum 60-second automatic-switch cooldown,
- do not switch back to the just-abandoned account while the quota window that caused abandonment still reports exhausted,
- only trigger a new automatic switch when the current account is genuinely unusable/exhausted, never merely because another account has more remaining quota.

# Phase 4 — Usage History and Dashboards

## 4.1 Dashboard entry points

Both top-level platform tabs receive a `Usage Dashboard` action:

- Antigravity dashboard,
- Codex dashboard.

The dashboard opens as a dedicated in-app dialog/page sized to content with a viewport maximum.

## 4.2 Time ranges and filters

Default view:

- last 30 days,
- daily buckets,
- all accounts.

Range controls:

- 7d,
- 30d,
- 90d,
- All.

Account filter:

- All accounts,
- one specific account.

Codex additionally supports model filtering when history contains model attribution.

## 4.3 Codex metrics

For routed Codex traffic, record exact account/model attribution and token counters available from the upstream response/protocol.

Track when available:

- input tokens,
- cached input tokens,
- cache-write tokens if provided,
- output tokens,
- reasoning output tokens,
- total tokens,
- estimated credits/cost only when provided by authoritative upstream data.

Do not estimate dollars from undocumented token prices.

Historical Codex local session/rollout files may be imported when attribution to an account/model is deterministic. Data without reliable account attribution is stored/displayed as `Unattributed`, never guessed.

## 4.4 Antigravity metrics

Existing QuotaShift Antigravity APIs expose quota state, not trustworthy per-request token counts.

Therefore the initial Antigravity dashboard records quota-consumption deltas, not fake tokens.

Per daily bucket display the metrics for which observations exist:

- observed 5h quota consumption,
- observed weekly quota consumption,
- model/model-family where known,
- account switch count,
- session activity timestamps.

If future Antigravity telemetry provides exact token counts, the storage schema may add token fields without redefining historical percentages as tokens.

## 4.5 Useful dashboard summaries

Above the chart show compact summaries derived from stored history:

- Today usage,
- last 7 days,
- last 30 days,
- most-used account,
- most-used model for Codex,
- automatic failover/switch count.

Primary visualization is a daily line chart.

For `All accounts`, default to a single aggregate line. The user can switch to one account or explicitly enable a comparison of selected accounts; the default does not render every account as a separate line.

## 4.6 Local history storage

Use SQLite in the Tauri backend, with narrow commands for inserts/imports and daily aggregation queries. Browser localStorage is not used for unbounded telemetry.

Core records:

```text
usage_event
- id
- platform              codex | antigravity
- account_id            nullable for unattributed imports
- model                  nullable
- timestamp
- event_kind
- input_tokens           nullable
- cached_input_tokens    nullable
- cache_write_tokens     nullable
- output_tokens          nullable
- reasoning_tokens       nullable
- total_tokens           nullable
- quota_window_kind      nullable
- quota_before           nullable
- quota_after            nullable
- routed                 boolean
```

Privacy rules:

- never store prompt text,
- never store response text,
- never store authorization headers,
- never store raw OAuth tokens,
- never store request bodies merely for analytics.

Settings exposes retention choices `30 days`, `90 days`, `365 days`, and `Forever`. Default is `Forever`. Pruning runs only when the user selects a finite retention period; there is no silent retention cap.

# Last Used Labels

Add `lastUsedAt` to both Codex and Antigravity account metadata or derive it from the latest attributed usage event.

Display it in small secondary text on the right side of the account email row.

Examples:

- `Last used 2m ago`
- `Last used today, 09:42`
- `Never used`

Update rules:

### Codex

- exact when the local router sends a request with that account,
- update when the user manually Applies the account,
- imported historical session activity updates it only when account attribution is reliable.

### Antigravity

- update on manual Apply,
- update on automatic failover switch,
- update from observed active-session/account activity when attribution is reliable.

A mere background quota refresh does not count as user/model usage.

# UI and Interaction Details

## Codex Accounts subtab

Each account row/card includes:

- label,
- plan,
- email,
- last-used text aligned to the right of the email row,
- usage bars/windows,
- existing Apply/Delete/rename actions,
- new model icon button with `Show available models` tooltip.

## Codex Pools subtab

Contains:

- Pool Routing switch,
- model-pool cards,
- Create/Edit Pool actions,
- pool status including routed/active state,
- current routed account/model indicator while requests are flowing.

## Dialog sizing

Model-list and pool-editor dialogs size to content first and clamp to their viewport maximums. The usage dashboard may use a larger responsive body for charts but must still clamp within the app viewport. Scroll only the inner content region that actually overflows.

# Error Handling

## Model scan

- one account failing does not fail the entire global scan,
- preserve last successful cache while showing stale/error state,
- token-refresh failure is reported per account,
- strict dropdown validation blocks when required account support cannot be confirmed.

## Router

- gateway startup failure leaves direct Codex configuration intact,
- restoration failure is surfaced prominently and retried on next startup,
- account auth failure excludes that candidate for the 60-second backoff,
- upstream failure unrelated to quota is forwarded rather than causing arbitrary account rotation,
- request bodies and tokens are redacted from diagnostic logs.

## Antigravity failover

- failure to find a better usable account leaves the current account unchanged and surfaces a warning,
- switching errors follow the existing toast/status pattern,
- cooldown prevents rapid repeated attempts.

## History

- telemetry-write failure never blocks the primary model request,
- corrupt/unreadable historical imports are skipped with counts,
- dashboard distinguishes `0` from `unknown`.

# Persistence and Migration

Existing Codex pool schema remains compatible. Extend it as follows:

```ts
interface CodexAccountPool {
  id: string;
  name: string;
  model: string;
  accountIds: string[];
  autoSwitch: boolean;
  modelSelectionMode?: "discovered" | "manual";
  activatedAt?: number;
}
```

Older pools without `modelSelectionMode` are treated as `manual` to preserve current free-form behavior. Older pools without `activatedAt` receive it the next time the user applies/activates them.

New preferences include:

- Codex Pool Routing enabled,
- Antigravity automatic failover enabled,
- usage-history retention preference.

Backup/export includes pool metadata and preferences. Usage-history SQLite data is not silently bundled into the existing credential backup; history export requires a separate explicit feature if added later.

# Testing Strategy

Implementation follows TDD.

## Phase 1

- model-response normalization tests,
- 24-hour cache freshness tests,
- account-by-account scan behavior,
- max-three scan concurrency,
- tier union/intersection/support-count derivation,
- strict discovered-model pool validation,
- manual-model warning but allowed save,
- five-row member viewport contract,
- custom checkbox accessibility contract,
- model dialog content-height behavior.

## Phase 2

- loopback-only listener tests,
- client-provider compatibility checks,
- router request-model extraction tests,
- pool match/unmatched fallback tests,
- bottleneck scoring tests,
- freshness/completeness tie-break tests,
- round-robin tie tests,
- 429/quota failover tests,
- no replay after response stream commitment,
- auth-header replacement/redaction tests,
- routing enable/disable config restoration tests,
- 10-second graceful shutdown behavior,
- stale config startup recovery tests.

## Phase 3

- Antigravity exhaustion predicate tests,
- multi-window bottleneck candidate ranking,
- tie rotation,
- 60-second cooldown/hysteresis,
- no-switch when no better usable candidate exists,
- no-switch solely because another account has more quota,
- reuse of runtime-aware switch command contract.

## Phase 4

- SQLite schema/migration tests,
- retention pruning tests,
- token aggregation by day/account/model,
- unattributed import behavior,
- Antigravity quota-delta aggregation,
- last-used timestamp semantics,
- dashboard range/filter aggregation,
- telemetry failure does not block routing.

Final verification must run the repository's full Linux and Windows CI suite after every phase and again after integration.

# Implementation Order

1. Model discovery/cache and pool-editor validation/UI.
2. Codex subtabs and loopback gateway/routing.
3. Antigravity automatic failover.
4. Usage-history persistence, dashboards, and last-used labels.
5. Integration hardening, migration/backup review, and final Linux/Windows verification.

Each phase may introduce RED/GREEN commits during TDD. Before final merge, follow the existing branch-history preference and squash newly added implementation commits into a small clean set when requested.

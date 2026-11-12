# QuotaShift v1.2.2 — Local AI Agent Host API design (implemented draft; verification pending)
Date: 2026-11-12
Parent: [Issue #64](https://github.com/the-long-ride/QuotaShift/issues/64)

## Objective
An AI agent can discover quota state and request an account rotation only when the owner explicitly enables this capability and grants a scoped bearer token. No network API is enabled by default in v1.2.2. The existing Codex router and its bearer token must not implicitly grant this account-control permission.

## Protocol proposal
- A distinct dedicated listener on `127.0.0.1`, default port 45692 or user-selected port 1024–65535, with opt-in startup and automatic shutdown. No binding to `0.0.0.0`, LAN, public IP, or remote host.
- All routes under `/v1`. `GET /v1/accounts` returns only opaque account ID, provider, remaining/used quota percentages, reset time, and verified freshness timestamp (null when unavailable). **No** email, alias, display name, OAuth tokens, refresh tokens, cookies, file paths, login/session state, or arbitrary cloud response bodies.
- `GET /v1/pools` returns enabled pool IDs, provider, member IDs and active pool reference, without aliases or secrets.
- `POST /v1/rotation` accepts `{"mode":"auto","provider":"codex","poolId":"default"}` or `{"mode":"account","provider":"antigravity","accountId":"ag-123","poolId":"default"}`. For `mode=auto`, omitted `poolId` resolves the provider's active enabled pool; ambiguous pools are rejected. For `mode=account`, omitted `poolId` allows selection of **any saved eligible account** of that provider, even outside CLI pools. When `poolId` is supplied, the selected account must also belong to that enabled pool. Requesting the already-active ID is idempotent (no process restart).
- Both request modes use the same authenticated and serialized native Apply dispatcher, effective-identity check, optional restart and conversation-resume flow. Never directly write credentials from an HTTP handler; Claude is read-only.
- `GET /v1/operations/{id}` returns redacted status, when changed, provider and account ID, sanitized failure reason; operation IDs expire.
- Capability token generated cryptographically by native Rust, held only in OS keyring, shown once to owner via explicit Copy button. Constant-time comparison, rotation/revoke support; per-request `Authorization: Bearer`. Reject missing, stale, empty, and invalid secrets with 401, never accept them in URL query.
- Defensive browser-access policy: non-safelisted browser origins rejected, reject unexpected Content-Type, do not enable CORS or `Access-Control-Allow-Origin: *`; use Origin checks and a second explicit user-enabled read/write capability to mitigate localhost CSRF.
- Requests validate JSON schema/size and provider/id against the current in-app account registry; quota freshness labeled clearly rather than inventing live availability.
- Limit concurrency to one rotation; serialize through the same native/renderer account-apply dispatcher used by manual Apply, so active state, monitoring preferences, persistence, and process restart have identical semantics.
- Return HTTP 409 for an in-progress operation, 404 unknown ID, 403 permission denied, 503 when dashboard state unavailable, 429 rate-limited. Never log auth headers, tokens, or raw account JSON; log request IDs and sanitized result only.

## Original implementation plan (historical; parts are now implemented)
1. Native Rust loopback listener and ephemeral capability manager with explicit enable/disable Tauri commands, no router coupling.
2. Redacted account usage snapshot bridge from React account caches to native service; eliminate secrets before serialization, enforce freshness metadata.
3. Rotation request dispatch through a monitored IPC event with request IDs and a native confirmation channel, no direct token access from HTTP handlers.
4. UI settings and read-only default; token generation/copy/revoke and write-scope toggle gated by user intent.
5. Integration tests: remote bind attempts, browser Origin attacks, unauthenticated calls, malformed payload, revocation, token secrecy, race/restart, unknown account, rollback, CLI/desktop coexistence, account ordering, backup restore.
6. Security and privacy audit, then explicit user opt-in release separately from v1.2.2 if verified.

## v1.2.2 ship decision
**Implemented as an explicit opt-in draft.** The service requires a separate OS-keyring bearer token, binds only to loopback, and remains disabled by default. Do not release until security testing and real-device acceptance pass.

## User-confirmed selection and agent skills
- BOTH automatic default CLI pool rotation and explicit eligible account-ID selection are required; direct selection by ID is not restricted to a CLI pool unless the agent explicitly supplies a pool ID. The API may not bypass rate-limit cooldown, identity, quota freshness, credential availability or the single-rotation lock.
- Settings → Monitoring → AI Agent API opens a separate modal with opt-in switch, port, key generate/revoke, read/write permission, connection test and skill installation. Use a dedicated loopback port, never the existing Codex router listener.
- Canonical skill: `~/.agents/skills/quotashift-rotation`; symlink/junction Claude to `~/.claude/skills` and Antigravity to `~/.gemini/config/skills`. Codex reads the canonical folder. Provide OpenCode `opencode.jsonc` skills-array guidance, with native discovery when available. Preserve user-owned files and support safe uninstall.
- The agent consumes `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY` from its runtime environment; no token is ever embedded in a checked-in skill, backup, URL or log.
- Active enabled CLI pools use tracked-account polling cadence, deduplicating requests. Stale or missing quotas never count as newly confirmed exhaustion.
- The Rust `agent_selection` module owns the request selection rules; authenticated HTTP dispatch and frontend Apply are implemented, but end-to-end restart, account authorization and process recovery still require on-device verification.

The Rust `resolve_agent_request` function implements this two-path selection rule; it is a policy-only function, not an HTTP endpoint.

## Implemented phase: authenticated local agent gateway (draft verification)
- Native opt-in `127.0.0.1` listener on a configurable 1024–65535 port. A distinct key is created in the OS keyring, displayed only at generation, and required as a bearer token. Origin-bearing browser requests are rejected, with no CORS headers. Only `GET /v1/accounts`, `GET /v1/pools`, `POST /v1/rotation`, and `GET /v1/operations/{id}` are exposed.
- Read-only quota snapshots are explicitly serialized from provider caches, with only account ID, provider, quota percentage, reset time and freshness. There is no email, label, alias, raw account object or credential in the API schema. Historical Argon carry-forward entries are excluded from fresh eligibility.
- The HTTP request chooses a candidate through Rust pool policy, reserves a single operation, then dispatches an event to the main Tauri renderer. Renderer Apply writes through existing app operations, verifies effective account identity, then acknowledges success/failure. The HTTP 202 response is **not** switching success; agents must poll operation status.
- Monitoring includes a modal to configure the port, read/write permission and key generation/revocation-by-rotation, test the authenticated connection, and install a safe canonical skill at `~/.agents/skills/quotashift-rotation`. Claude and Antigravity link to it or receive a managed copy if symlinks are unavailable.
- A running operation may time out and become failed. If QuotaShift is closed, the endpoint disappears. Startup is opt-in and can be persisted through the QuotaShift setting.
- Environment variables must be assigned in the AI agent's own shell/process: `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY`. Never serialize or store the key in skill files, repo content or ordinary settings backups.
- **Remaining limitations:** the CLI pool's background **automatic** quota-triggered switching/recovery is not yet connected; process restarts and OAuth permissions still require provider-specific real-installation tests. Manual / agent-invoked rotation uses the existing app Apply path, which may still encounter those provider-specific restart limitations.

## Implemented follow-up: unattended CLI-pool auto-failover (experimental)
- For each active enabled auto-switch pool, the current member is refreshed at the tracked poll cadence even if not separately monitored. Changes to the configured poll interval reschedule the dedicated refresh timer.
- Fresh direct Codex OAuth rate-limit windows or exact Antigravity grouped quota observations are required; session-only and Argon carry-forward values do not qualify. A transient loading state cannot count as a new sample. Each window requires at least two independently timestamped exhausted observations separated by five seconds or the configured minimum.
- Only candidates with fresh positive remaining quota are selectable, in the user's ordered CLI pool. No candidate, missing/stale telemetry, completed reset epoch, or a changed active account aborts safely.
- Native preflight requires exactly one identifiable running CLI instance, resolvable project directory and conversation (or explicit opt-in to latest), and a stable PID/start-time identity. The default **Switch Only When Process Is Idle** setting prevents automatic handoff until reliable idle detection is available; users must intentionally disable it to allow rotation of a running CLI.
- The app's existing Restart-on-switch must also be enabled. It applies the selected account through the same native Apply path as the UI. A one-shot continuation prompt, bound to the original PID/start timestamp, is passed to the CLI restore command using sanitized arguments and removed immediately afterward. A failed command submission or unverified effective identity is reported as failure, never success. Successful submission does **not** establish that the resumed process completed work; real-machine acceptance remains open.
- OAuth permission gaps, Claude Desktop reset parity, and guaranteed process recovery are *not* implied fixed by this work.

## Independent review corrections
- `POST /v1/rotation` queues an operation. React must invoke the native begin command before Apply; late queued events cannot execute after their deadline. The 90-second timer reports `timed_out` but **retains the credential lock while frontend Apply is still running**. Finishing that operation releases the lock and yields `failed` even if the late operation succeeded at the provider.
- Codex automatic/agent Apply treats every missing or failed captured CLI restoration outcome and a failed ChatGPT Desktop relaunch as incomplete. It must not report a clean success to the caller.
- The API can display historical usage percentages, but only successful, non-loading direct Codex OAuth or exact Antigravity cloud quota receives a freshness timestamp for rotation eligibility. Failed, cached-exact, or session-only Antigravity observations cannot make an account eligible.
- Runtime acceptance and provider OAuth/reset parity remain outstanding. See `docs/superpowers/reviews/2026-11-12-issue-64-independent-review.md`.

## Follow-up source alignment
- Successful Antigravity IDE exact quota reads must propagate the backend's reported `accuracy` and replace historical cloud quota fields in the live cache. The snapshot must read exact grouped lanes without interpreting an old carried Argon zero as fresh quota; session-only results stay ineligible.
- Saving or rebinding a CLI rotation pool emits `quotashift:cli-rotation-configuration-changed`; the Agent API bridge republishes the redacted snapshot promptly without waiting for an unrelated account update.

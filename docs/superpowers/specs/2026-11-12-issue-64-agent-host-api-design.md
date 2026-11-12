# QuotaShift v1.2.2 — Local AI Agent Host API design (NOT IMPLEMENTED)
Date: 2026-11-12
Parent: [Issue #64](https://github.com/the-long-ride/QuotaShift/issues/64)

## Objective
An AI agent can discover quota state and request an account rotation only when the owner explicitly enables this capability and grants a scoped bearer token. No network API is enabled by default in v1.2.2. The existing Codex router and its bearer token must not implicitly grant this account-control permission.

## Protocol proposal
- A distinct dedicated listener on `127.0.0.1` and `[::1]` (if supported), ephemeral port, with opt-in startup and automatic shutdown. No binding to `0.0.0.0`, LAN, public IP, or remote host.
- All routes under `/v1`. `GET /v1/accounts` returns redacted account ID, provider, alias, plan tier, remaining/used percentages, last refreshed timestamp, and whether a provider supports rotation. **No** OAuth tokens, refresh tokens, cookies, file paths, login/session state, or arbitrary cloud response bodies.
- `GET /v1/pools` returns enabled pool IDs, provider, member IDs and active pool reference, without aliases or secrets.
- `POST /v1/rotation` accepts `{"mode":"auto","provider":"codex","poolId":"default"}` or `{"mode":"account","provider":"antigravity","accountId":"ag-123","poolId":"default"}`. For `mode=auto`, omitted `poolId` resolves the provider's active enabled pool; ambiguous pools are rejected. For `mode=account`, omitted `poolId` allows selection of **any saved eligible account** of that provider, even outside CLI pools. When `poolId` is supplied, the selected account must also belong to that enabled pool. Requesting the already-active ID is idempotent (no process restart).
- Both request modes use the same authenticated and serialized native Apply dispatcher, effective-identity check, optional restart and conversation-resume flow. Never directly write credentials from an HTTP handler; Claude is read-only.
- `GET /v1/operations/{id}` returns redacted status, when changed, provider and account ID, sanitized failure reason; operation IDs expire.
- Capability token generated cryptographically by native Rust, held only in OS keyring, shown once to owner via explicit Copy button. Constant-time comparison, rotation/revoke support; per-request `Authorization: Bearer`. Reject missing, stale, empty, and invalid secrets with 401, never accept them in URL query.
- Defensive browser-access policy: non-safelisted browser origins rejected, reject unexpected Content-Type, do not enable CORS or `Access-Control-Allow-Origin: *`; use Origin checks and a second explicit user-enabled read/write capability to mitigate localhost CSRF.
- Requests validate JSON schema/size and provider/id against the current in-app account registry; quota freshness labeled clearly rather than inventing live availability.
- Limit concurrency to one rotation; serialize through the same native/renderer account-apply dispatcher used by manual Apply, so active state, monitoring preferences, persistence, and process restart have identical semantics.
- Return HTTP 409 for an in-progress operation, 404 unknown ID, 403 permission denied, 503 when dashboard state unavailable, 429 rate-limited. Never log auth headers, tokens, or raw account JSON; log request IDs and sanitized result only.

## Implementation plan (requires separate security review)
1. Native Rust loopback listener and ephemeral capability manager with explicit enable/disable Tauri commands, no router coupling.
2. Redacted account usage snapshot bridge from React account caches to native service; eliminate secrets before serialization, enforce freshness metadata.
3. Rotation request dispatch through a monitored IPC event with request IDs and a native confirmation channel, no direct token access from HTTP handlers.
4. UI settings and read-only default; token generation/copy/revoke and write-scope toggle gated by user intent.
5. Integration tests: remote bind attempts, browser Origin attacks, unauthenticated calls, malformed payload, revocation, token secrecy, race/restart, unknown account, rollback, CLI/desktop coexistence, account ordering, backup restore.
6. Security and privacy audit, then explicit user opt-in release separately from v1.2.2 if verified.

## v1.2.2 ship decision
**Deferred.** QuotaShift v1.2.2 must not expose credential-bearing operations through a new unauthenticated localhost route. The implemented frontend and process fixes do not imply that this API exists.

## User-confirmed selection and agent skills
- BOTH automatic default CLI pool rotation and explicit eligible account-ID selection are required; direct selection by ID is not restricted to a CLI pool unless the agent explicitly supplies a pool ID. The API may not bypass rate-limit cooldown, identity, quota freshness, credential availability or the single-rotation lock.
- Settings → Monitoring → AI Agent API opens a separate modal with opt-in switch, port, key generate/revoke, read/write permission, connection test and skill installation. Use a dedicated loopback port, never the existing Codex router listener.
- Canonical skill: `~/.agents/skills/quotashift-rotation`; symlink/junction Claude to `~/.claude/skills` and Antigravity to `~/.gemini/config/skills`. Codex reads the canonical folder. Provide OpenCode `opencode.jsonc` skills-array guidance, with native discovery when available. Preserve user-owned files and support safe uninstall.
- The agent consumes `QUOTASHIFT_AGENT_API_URL` and `QUOTASHIFT_AGENT_API_KEY` from its runtime environment; no token is ever embedded in a checked-in skill, backup, URL or log.
- Active enabled CLI pools use tracked-account polling cadence, deduplicating requests. Stale or missing quotas never count as newly confirmed exhaustion.
- The Rust `agent_selection` module implements only the **selection policy**. The HTTP listener and native rotation coordinator are **not yet present** and cannot be advertised as functional.

The Rust `resolve_agent_request` function implements this two-path selection rule; it is a policy-only function, not an HTTP endpoint.

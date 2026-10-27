# QuotaShift SIWC implementation — independent source + desktop review
**Date:** 2026-10-23
**Workspace:** Quotashift, Aevra, existing uncommitted working tree; running debug `quotashift.exe`
**Overall result:** NOT READY FOR LIVE SIWC ROUTING. The tested SIWC guard remains effective. All existing offline regression suites pass, but missing code paths prevent end-to-end sign-in and inference.

## Scope and baseline

Reviewed files: `src-tauri/src/codex/siwc/{oauth,registration,models,accounts,store,tests}.rs`, `src-tauri/src/storage/secure_storage/{ops,siwc_native,tests}.rs`, `src-tauri/src/codex/router/{pool_registry,forward,response_utils,responses_transport,siwc_request}.rs`, `src/hooks/codex/useCodexRouterManager.ts`, `src/components/codex/CodexModelPoolV2Editor.tsx`, and `src/utils/codex/codex-pools-v2-migration.ts`. Not a comprehensive review of unrelated edits (large pre-existing working tree).

Cross-checked OpenAI official docs:
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery

### Findings by severity

**R1 — CRITICAL / shipping blocker: no production SIWC call chain.**
Search of workspace found no runtime callers (outside tests and each definition) for `build_siwc_authorization_url`, `validate_siwc_callback`, `register_issued`, `fetch_siwc_models`, `load_native_siwc_secret`, `prepare_siwc_payload`, and `process_sse_stream`. `pool_registry.rs::build_routes_from_config` deliberately rejects every enabled V2 SIWC pool; `forward.rs` only builds Codex OAuth or API-key requests. **Do not remove this guard before a real verified native broker/Responses implementation is active.**

**R2 — HIGH / security: token-field checks are not OIDC signature validation.**
`siwc/oauth.rs::validate_token_claims` only compares issuer, audience and nonce strings; it does not verify JWT signatures from OpenAI JWKS, expiry, token-type claims or the grant returned by the token endpoint. `TokenClaims::is_routable` is a scope hint, not proof of identity or entitlement. `registration.rs::register_issued` can be called with caller-provided identity without a verified-token type. Require a typed verified grant and token-response scopes before credentials are stored or accounts marked routable.

**R3 — HIGH / compatibility and security boundary: V1 fallback is mislabeled SIWC.**
`pool_registry.rs::build_routes_from_config` bypasses V2 auth validation when `pools_v2` is absent; it translates legacy pools to `auth_mode: Siwc` but the `forward.rs` OAuth path still uses legacy `chatgpt.com/backend-api/codex`. The React V2 config builder always sends `poolsV2`, mitigating this for the current screen, but the backend fallback remains reachable from older callers/configs. Separate explicit legacy compatibility mode from official SIWC, or fail closed for V1; add a dedicated compatibility regression test before changing it to avoid breaking historic CLI routes.

**R4 — HIGH / accounting: streaming does not have production terminal-event accounting.**
`responses_transport::process_sse_stream` validates fixture events but is unused by `forward.rs` and `response_utils.rs::build_streaming_response`. `forward.rs` increments `routed_request_count` before stream completion; this counter must be labeled attempted/forwarded, not successful. Implement a streaming state machine over arbitrary TCP chunk boundaries and terminal `response.completed`, `response.failed`, `response.incomplete`, cancellation and truncation. No failover after downstream commit.

**R5 — MEDIUM / account-model correctness: SIWC-specific models not integrated.**
`siwc/models.rs` correctly uses `GET https://api.openai.com/v1/models` and list-visible `models[].slug`, matching SIWC docs, but `CodexModelPoolV2Editor` still shows the legacy Codex account scan catalog for SIWC; there are no independently registered SIWC accounts in the membership selector. User cannot validate a real SIWC model/account entitlement. Do not infer SIWC permission from the Codex scan.

**R6 — MEDIUM / refresh and persistence still incomplete.**
`storage/secure_storage/siwc_native.rs` implements a separate encrypted file and rejects SIWC keys through renderer's generic secure-storage command, but has no live consumer. No durable stable host identifier, per-issued-client/workspace credential broker, identity-aware rotation, multi-account selector, revoke flow, or auth refresh-at-expiry are wired. Tested encryption only with synthetic fixtures.

**R7 — MEDIUM / UX misleading until activation.**
The existing UI lets users choose `Sign in with ChatGPT (SIWC)` in pool settings, but there is no `Continue with ChatGPT` enrollment/authorization in the app. Recommend marking as `Not connected — set up SIWC` and separating saved legacy Codex accounts from SIWC registrations. Preserve disabled drafts and explain migration.

### Running debug desktop verification

Connected Aevra desktop control to the user's existing `quotashift.exe` window (window id 1837206). On **ChatGPT Codex → Model Pools**, observed pool `Luna`, 13 legacy OAuth members, 0 of 1 pools enabled, global Pool Routing Off, and red error `This SIWC pool needs separately authorized native SIWC sign-in. Existing Codex OAuth sessions cannot authorize Model Pool Routing.`

- Opened **Edit Luna** via accessibility ref. The editor displayed its upstream model mapping, SIWC auth and routing policy without crashing.
- Opened Authorization custom dropdown. Its menu remained within the modal and matched trigger width; no clipping on inspected screen.
- Closed edit modal with **Cancel**, leaving saved values untouched.
- Clicked **Enable Luna for routing**: pool remained disabled (0/1), warning remained. Global routing toggle stayed disabled. This confirms fail-closed UI behavior, not actual SIWC authorization.
- Did not edit any live accounts, start the router, open any browser consent flow, or send inference requests.

### Fresh automated verification

| Check | Command | Result |
| --- | --- | --- |
| Rust | `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 437 passed, 1 ignored, 0 failed |
| Node | `pnpm test` | 1,091 passed, 7 TODO, 0 failed |
| Frontend compile/build | `pnpm run build` | Passed (bundle-size warning only) |
| File-length limit | `pnpm run lint:loc` | 556/556 within limit |
| Rust style | `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed |
| SIWC changed-file Prettier | `pnpm exec prettier --check ...` | Passed (targeted files only) |
| Repo-wide format | `pnpm run format:check` | Not rerun; previous Aevra host authorization expired |
| Real SIWC OAuth + inference | — | Not tested: no integrated sign-in/broker; do not claim functional |

No code was changed during this review. No commit or push made. Full source-review scope was SIWC-related changes, not all pre-existing modifications.

## Priority remediation and acceptance tests

1. **P0 Authorization:** Persist stable host ID; loopback listener with precise redirect and single-use state/nonce/PKCE, OAuth code exchange, issuer JWKS signature/expiry/nonce/subject validation; store exact issued registration ID and returned grant scopes. Negative tests: forged ID token, wrong state, missing direct scope, reuse of callback, cross-registration/account mix-up, invalid_grant recovery.
2. **P0 Credential brokerage:** Native-only encrypted per-registration credential storage, atomic refresh-token rotation and singleflight, distinct subject/client ID/workspace, register/revoke/logout, no token in React.
3. **P0 Router integration:** Distinct `Siwc` auth account type, membership validation, dynamic account selection and public `POST /v1/responses` with `store:false`, `stream:true`, complete input, no silent API-billing switch. Separate legacy V1 backend transport and never brand it SIWC.
4. **P0 SSE:** Real stream decoder tests across chunk splits, success/failure/incomplete/truncation, late usage-limit SSE errors, cancellation, no post-commit retry, shared account request counters.
5. **P1 UI:** Continue with ChatGPT account connection and saved registrations, account-specific models from the SIWC catalog, SIWC-only account picker, readiness and permission explanations, multiple concurrently enabled aliases.
6. **Acceptance:** user-consented live Windows OAuth with two distinct accounts, two enabled aliases, model discovery, successful terminal `response.completed`, quota/failover, profile isolation, app restart and refresh, and cross-account credential isolation; independent security reviewer signs off.

**Release gate: BLOCKED.** Keep current fail-closed SIWC router rejection until all P0 work and end-to-end evidence exist.

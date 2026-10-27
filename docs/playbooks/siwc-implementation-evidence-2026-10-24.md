# QuotaShift SIWC integration — implementation and evidence

**Date:** 2026-10-24
**Workspace:** Aevra / Quotashift, local working tree on `main`
**Status:** Source integrated; offline tests pass; **live SIWC release gate remains open** pending user-consented authorization and inference validation.

## Implemented across this and the preceding implementation turns

| Review issue | Implementation now present | Remaining qualification |
|---|---|---|
| R1 Production SIWC call chain | `codex/siwc/{commands,callback,oidc,token_exchange,native_access,models}` and router `siwc_{config,forward,stream}`; native OAuth entrypoint and account-specific Responses routing | Real granted SIWC credentials and `response.completed` from OpenAI have not been tested |
| R2 OIDC and consent | Fixed-issuer OpenAI JWKS + RS256 JWT signature, issuer, audience, expiry and per-attempt nonce; checks token-response plan scopes | No signed real OpenAI test token exercised; provider behavior requires live verification |
| R3 Old V1 fallback | Explicit `LegacyCodexOAuth` routing mode distinct from native SIWC; V2 native references never accept legacy OAuth | Legacy compatibility remains intentionally separate |
| R4 Streaming | Incremental SSE terminal tracker; stream abort error if `response.completed` absent; no postcommit failover; late quota event triggers per-account-model backoff | Upstream HTTP status and terminal completion are tracked separately; detailed success counters not implemented |
| R5 Account model discovery | Per-registration `GET /v1/models` and native catalog checks before route publication; SIWC model list separate from Codex scans | Model eligibility depends on actual enrolled account |
| R6 Credentials and lifecycle | Encrypted native account index/session records; host UUID; in-process serialized refresh rotation; explicit per-registration remote revoke + local removal, differentiated UI warning | Cross-process refresh token rotation lock is not implemented; two distinct running QuotaShift instances need conformance tests |
| R7 UI | Account connection/list/reconnect/model list/disconnect panel, SIWC member picker, shared-model intersection, multiple active independent aliases | Browser OAuth consent, real account selection and model pool enabled state need interactive test |

## In this continuation

- Fixed the React background router update to **await** the asynchronous native SIWC configuration instead of transmitting a Promise.
- Updated both independent model-pool validation layers to allow native `reg_...` references while rejecting legacy Codex IDs as SIWC members.
- Preserved native SIWC memberships during unrelated Codex OAuth account changes.
- Set UI pool card SIWC authorization count from the native registration list rather than from legacy OAuth records.
- Ensured incomplete/failed/truncated SIWC streaming cannot appear as a normal EOF after an HTTP 200; downstream receives a body error. Late quota messages continue to mark account-model backoff.
- Added explicit UI-confirmed sign-out/revocation and synchronized encrypted credential-file index deletion with account removal.
- Audited the native access-token getter to avoid returning tokens that are within the refresh window.
- Ran the running debug QuotaShift desktop with Aevra: ChatGPT Codex → Model Pools rendered the ChatGPT plan account panel in QuotaShift styling. The pre-existing Luna pool stayed disabled; zero SIWC registrations; no credentials or saved pool configuration were modified.
- Maintained the existing experimental Claude Code `/v1/messages` fail-closed gate; this work does not claim the Claude Code non-Claude model translation is available.

## Final reproducible offline checks

| Verification | Command | Latest result |
|---|---|---|
| Rust unit tests on Windows | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-rust-windows.ps1` | **451 passed; 0 failed; 1 ignored** |
| Node tests | `pnpm test` | **1,092 passed; 0 failed; 7 TODO** |
| Rust compile | `cargo check --manifest-path src-tauri/Cargo.toml` | Passed |
| TS/Vite production build | `pnpm run build` | Passed (non-fatal chunk-size advisory) |
| Rust format | `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed |
| Targeted Prettier | `pnpm exec prettier --check src/components/codex/SiwcAccountPanel.tsx src/components/codex/CodexModelPoolsV2Panel.tsx` | Passed |
| File-size gate | `pnpm run lint:loc` | 574/574 passed |
| Full live SIWC login + inference | Not run | Requires explicit browser consent and enabled OpenAI SIWC entitlement |

### Windows loader resolution

`cargo test --lib` previously exited **0xc0000139 STATUS_ENTRYPOINT_NOT_FOUND** before running Rust tests. `objdump -p` showed import of `TaskDialogIndirect` from `comctl32.dll`; this requires Windows Common Controls v6 activation. The Cargo test runner lacked the app manifest used by QuotaShift's executable. `scripts/test-rust-windows.ps1` builds Rust tests, writes a Common Controls v6 **sidecar manifest only next to ignored test executables**, then runs the suite. It changes neither the app executable nor Windows configuration. The workaround successfully ran all 451 tests.

## Remaining release gates

1. User-approved real registration with an eligible ChatGPT plan: verify issued `client_id`, exact scopes, signed ID token and stored identity from OpenAI. Never import legacy Codex OAuth tokens as substitute.
2. Test actual account-specific model discovery, `POST https://api.openai.com/v1/responses` with `store:false`, `stream:true`, and terminal `response.completed`; validate the downstream CLI contract.
3. Test two distinct SIWC accounts and two simultaneously enabled model aliases, quota-denied failover **before** stream commitment, truncated stream behavior after commitment, concurrent refresh, restart and revoke.
4. Verify same-account multi-process refresh protection / rotation across separate QuotaShift instances before declaring cross-process support.
5. Independently assess JWT/JWKS/OAuth callback, API request header isolation and encrypted storage against a live OpenAI response. No API key, token or consent was supplied by the user for this run.

**Release recommendation:** Continue beta validation; do not claim production-ready ChatGPT-plan model routing until these live gates pass. Other existing dirty-tree edits were preserved. No commit or push was performed.

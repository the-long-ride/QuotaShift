# SIWC multi-account Model Pools — implementation checkpoint

**Date:** 2026-10-23. **Status:** PARTIAL / NOT RELEASE-READY.
Source plan: `QuotaShift_SIWC_Model_Pools_9router_Implementation_Plan_2026-10-23.md` shared in the conversation; tasks 00–12.

## Implemented and exercised (offline test fixtures only)

- `src-tauri/src/codex/siwc/registration.rs`: removed synthetic client-ID registration; now records provided issued client IDs and subject. Needs verified OIDC caller.
- `src-tauri/src/codex/siwc/oauth.rs`: SIWC-only plan scope `chatgpt.tokens.use.direct`, correctly encoded dynamic/returning authorize URL, PKCE callback state/issued-client guard. Token-claim helper remains FIELD-ONLY, not JWK signature verification.
- `src/utils/codex/codex-pools-v2-migration.ts`: old Codex OAuth SIWC-labeled pools are preserved as DISABLED drafts with reauthorization diagnostic. Existing API-key pools independent. `codex-pools-v2.ts` reexports stable API.
- `src-tauri/src/storage/secure_storage/siwc_native.rs`: private native-only encrypted credential file distinct from renderer-facing account storage; never a Tauri command. Credential helpers are not yet wired to a verified broker.
- `src-tauri/src/codex/siwc/models.rs`: per-SIWC-registration `GET /v1/models` client and strict list-visible model parser. Not yet used by UI/router.
- `src-tauri/src/codex/router/siwc_request.rs`: additional HTTP preview rejection for `previous_response_id` and explicit system-role input.
- `src-tauri/src/codex/router/responses_transport.rs`: malformed `response.completed` SSE event cannot count as success; validates terminal event JSON/status.
- New synthetic tests in `siwc/tests.rs`, `responses_tests.rs`, `secure_storage/tests.rs`, and updated JS migration/backup tests.

## Test evidence and limitations

RED observed for nonexistent `register_issued`, new OAuth URL helper, auto-enabled legacy SIWC migration, forged completed SSE marker, private SIWC crypto key, and account-specific SIWC catalog module. GREEN results: Rust focused SIWC 19/19; Rust full 437 passed and 1 ignored after catalog tests; Node full 1091 passed + 7 TODO; frontend build passes; LOC 555/555. Re-run full Rust after this evidence update. `cargo fmt -- --check` and targeted `prettier --check` passed. Whole-repo `pnpm run format:check` host approval expired (request `req_c431d92d-9b5a-467b-9740-80f04ecd6c8c`), so repo-wide formatting remains unverified.

## RELEASE BLOCKERS — do not enable SIWC routing yet

1. OIDC loopback listener, callback replay protection, code/token exchange and JWKS SIGNATURE / expiration verification; stable host-ID lifecycle.
2. Native encrypted registration + credential broker with refresh rotation, multi-account consent and readiness.
3. Live account-specific catalog + availability and public Responses transport; streaming completion integrated into gateway.
4. Multi-pool registered-account selection/budget and truthful request vs. quota fallback; native UI enrollment.
5. Independent protocol/security reviewer and explicitly user-consented Windows live sign-in/inference checks.

Existing SIWC model pool rejection remains intentionally fail-closed. Never convert old Codex OAuth tokens to SIWC, never silently bill an API key, never claim success for HTTP 200 without `response.completed`. Claude Code experimental adapter is a separate release.

No code was committed or pushed; numerous unrelated pre-existing working-tree changes were preserved.

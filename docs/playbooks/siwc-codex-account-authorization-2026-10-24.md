# Per-Codex-account SIWC authorization — 2026-10-24

**Workspace:** Aevra / Quotashift
**Status:** Implementation saved; offline tests pass; live OpenAI authorization has not been exercised.

## What changed

1. **New Codex browser login:** `AddAccountModal.tsx` uses a default-ON `CommonSwitch` in `CodexBrowserLoginTab.tsx` to request a second ChatGPT plan-use consent after Codex OAuth login. The switch is deliberately not shown in API-key/local import flows. Consent remains explicit in the OpenAI browser. Declining SIWC does **not** undo saved Codex login.
2. **Existing Codex account cards:** `CodexAccountCard.tsx` adds a compact routing status/action via `CodexCardSiwcAction.tsx`, with default "Not authorized", "Re-login needed", "Consent required" or "Routing Authorized" statuses. `CodexTab.tsx` polls native SIWC registration metadata while the Accounts view is visible and provides per-account reauthorization.
3. **Secure handoff:** `codex-siwc-link.ts` extracts a *non-verified legacy identity hint* from the Codex account's locally saved OpenAI ID token, without mixing tokens or reusing Codex OAuth for inference. It starts native SIWC with the expected subject. Native `callback.rs` checks the separately OpenAI-signed SIWC ID-token subject after nonce/JWKS validation **before** storing credentials, rejecting a different selected ChatGPT user.
4. **Workspace isolation:** A ChatGPT user can have multiple workspaces. SIWC registrations now persist a `linked_codex_account_id` (optional for old standalone registrations), and native views emit `linkedCodexAccountId`. Card UI checks both *explicit account ID link and subject match*, not email or subject alone. Token refresh preserves the link. Existing standalone SIWC registrations remain usable in Model Pools, but are not silently linked to a Codex workspace card.
5. **Styling:** Scoped QuotaShift card row and browser modal styles in `styles/codex/codex-siwc-card.css`, imported before final desktop `ui-polish.css`.

## Design and security limitations

- The old Codex ID token is decoded on the frontend as an **identity hint**, not cryptographically reverified by the card. The *new SIWC* ID token is signature-verified natively. Therefore UI linkage requires user action, signed SIWC identity, and exact `linkedCodexAccountId`; it is not independent cryptographic proof that the SIWC registration targets the same OpenAI workspace as Codex. The browser prompts the user to choose the same account and workspace.
- Missing/old Codex ID token: the card reports re-login needed rather than guessing by email. Reauthenticate Codex with browser first.
- Enabling the switch merely starts a separate OAuth request; the user must separately approve `chatgpt.tokens.use.direct` and have an eligible ChatGPT plan. A native registration must report the granted scope before Model Pool routing can use it.
- API-key Codex accounts are not SIWC accounts and do not show this option; they retain API-key pool routing.
- No live browser OAuth, inference, quota routing, or multi-workspace admission smoke test was performed in this implementation pass. The connected desktop app was the user's portable installed binary, not a verified rebuild of the current working tree.
- Pre-existing uncommitted workspace changes preserved; no commit/push.

## Test evidence (after UI and security changes)

| Check | Result |
| --- | --- |
| `node --test tests/codex/siwc-account-linking.test.mjs` | 5 passed, 0 failed |
| `pnpm test` | 1,097 passed, 7 TODO, 0 failed (1,104 total) |
| `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/test-rust-windows.ps1` | 453 passed, 1 ignored, 0 failed |
| `pnpm run build` | Passed |
| `pnpm run lint:loc` | 579/579 passed |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` | Passed |
| Targeted Prettier --check | Passed |

## Follow-up acceptance

Rebuild the actual debug executable with current sources; add a new Codex browser account (switch defaults on); verify SIWC consent browser opens after Codex succeeds; decline consent and confirm Codex survives with routing Not authorized; approve with same ChatGPT user/workspace and confirm linked status; select different ChatGPT user and confirm native subject mismatch rejection; authorize two workspaces for the same user and confirm each card has its own registration; exercise enabled pools and a complete `response.completed` request.

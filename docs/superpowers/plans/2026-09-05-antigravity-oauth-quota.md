# Antigravity OAuth Quota Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved Antigravity OAuth accounts use the same Cloud Code routing and client identity as the Antigravity IDE so cloud quota is accurate, while never fabricating an unavailable weekly quota.

**Architecture:** Keep OAuth account quota retrieval independent from the local Antigravity language-server path. Use PROD Cloud Code only for `loadCodeAssist` project discovery and the DAILY Cloud Code host for `fetchAvailableModels`; render exact 5-hour/weekly windows only when they are actually present. Preserve the local/exact path as the richer source when available.

**Tech Stack:** Rust/Tauri backend, React/TypeScript frontend, GitHub Actions CI.

**Spec:** Approved design in PR #11 conversation: OAuth cloud quota must use the Antigravity IDE profile, full Google scopes, project discovery, daily model quota, and unavailable weekly semantics.

## Global Constraints

- Do not add a language-server dependency to the OAuth quota path.
- `loadCodeAssist` stays on `https://cloudcode-pa.googleapis.com`.
- `fetchAvailableModels` uses `https://daily-cloudcode-pa.googleapis.com`.
- Identify quota requests as Antigravity IDE, not QuotaShift CLI.
- Request Google scopes for cloud-platform, userinfo email/profile, cclog, and experiments/configs.
- Never convert a missing weekly OAuth quota into 100%.
- Preserve exact local quota data when available.

---

### Task 1: Add failing quota-routing and semantics contracts

**Files:**
- Create: `src-tauri/tests/antigravity_oauth_quota_contract.rs`
- Test: `src-tauri/src/antigravity_quota.rs`

**Interfaces:**
- Consumes: existing `oauth.rs`, `antigravity_remote.rs`, and quota aggregation behavior.
- Produces: explicit contracts for OAuth scopes, PROD/DAILY host split, IDE identity, FULL_ELIGIBILITY_CHECK metadata, and missing-weekly behavior.

- [ ] **Step 1: Write the failing tests**

Add source-contract assertions for the required OAuth scopes and Cloud Code hosts/identity. Change the existing unknown-window quota test so an unlabeled `retrieveUserQuota` bucket cannot populate the weekly lane.

- [ ] **Step 2: Run tests to verify RED**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: FAIL because current code uses one PROD host, `antigravity/cli/2.0`, incomplete OAuth scopes, and maps unlabeled quota into both 5-hour and weekly lanes.

- [ ] **Step 3: Commit RED tests**

Commit message: `test: define antigravity oauth quota contract`

### Task 2: Implement Antigravity IDE Cloud Code routing

**Files:**
- Modify: `src-tauri/src/antigravity_remote.rs`
- Modify: `src-tauri/src/oauth.rs`

**Interfaces:**
- Consumes: existing access/refresh token flow and `cloudaicompanionProject` extraction.
- Produces: PROD project discovery and DAILY model quota requests carrying Antigravity IDE metadata and identity.

- [ ] **Step 1: Split remote configuration**

Introduce distinct project-discovery and quota base URLs, plus an Antigravity IDE version/profile helper. Map Windows/Linux/macOS architecture into Antigravity metadata.

- [ ] **Step 2: Update `loadCodeAssist`**

Send `metadata` with Antigravity IDE type/platform/plugin values and `mode: "FULL_ELIGIBILITY_CHECK"` to PROD Cloud Code.

- [ ] **Step 3: Update `fetchAvailableModels`**

Send project-scoped requests to DAILY Cloud Code with `User-Agent`, `X-Client-Name: antigravity`, and `X-Client-Version` derived from the IDE profile.

- [ ] **Step 4: Expand OAuth scopes**

Include cloud-platform, userinfo.email, userinfo.profile, cclog, and experimentsandconfigs while retaining offline refresh-token behavior.

- [ ] **Step 5: Run tests to verify GREEN**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

### Task 3: Stop fabricating weekly quota

**Files:**
- Modify: `src-tauri/src/antigravity_quota.rs`
- Modify: `src-tauri/src/antigravity_usage.rs`

**Interfaces:**
- Consumes: `fetchAvailableModels` model quota.
- Produces: cloud quota with a known current/five-hour lane and `weekly_percent: None` unless an explicit weekly bucket exists.

- [ ] **Step 1: Remove shared unknown-window duplication**

Do not copy an unlabeled `retrieveUserQuota` bucket into both 5-hour and weekly lanes.

- [ ] **Step 2: Make `fetchAvailableModels` authoritative for OAuth cloud display**

Use it as the normal saved-account cloud source. Do not require `retrieveUserQuota` to produce a valid OAuth quota card.

- [ ] **Step 3: Preserve diagnostics**

Emit non-sensitive diagnostics for host/source, model count, project presence, and whether weekly data was unavailable. Never log access or refresh tokens.

- [ ] **Step 4: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: PASS.

### Task 4: Verify frontend unavailable-window behavior and full CI

**Files:**
- Verify: `src/components/AntigravityTab.tsx`
- Verify: `src/utils/antigravity-quota.ts`

**Interfaces:**
- Consumes: backend `weeklyPercent: null/undefined` semantics.
- Produces: `Unavailable` / `Not available` in the weekly lane instead of 100%.

- [ ] **Step 1: Verify frontend contract**

Confirm the existing UI treats absent `weeklyPercent` as unavailable and does not fall back to `remainingPercent` for weekly.

- [ ] **Step 2: Run full CI**

Run the repository pull-request CI for Linux and Windows.

Expected: frontend build, Rust tests, and Rust checks all pass.

- [ ] **Step 3: Update PR #11 summary**

Document the corrected OAuth quota path and link the fresh CI run.

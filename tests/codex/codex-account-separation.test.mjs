import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { obfuscate, deobfuscate, parseOpenAiAuthClaims } from "../../.test-build/auth/auth.js";
import { parseCodexLocalAuth } from "../../.test-build/codex/current-local-session.js";
import { findCodexAccountMatch } from "../../.test-build/account/current-account.js";
import {
  mergeCodexOAuthRefreshResponse,
  propagateRotatedRefreshToken,
} from "../../.test-build/codex/account/codex-oauth-refresh.js";
import {
  buildMergedCodexUsageEntry,
  detectCodexAccountMismatch,
  extractPriorCodexUsedPercent,
  formatCodexAccountMismatchError,
  mergeCodexResetCredits,
  pruneExpiredCodexResetCredits,
  updateCodexAccountsAfterRefresh,
} from "../../.test-build/codex/codex-usage-merge.js";

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

test("parseOpenAiAuthClaims decodes chatgpt_account_id, plan_type, user_id, and organizations", () => {
  const token = makeJwt({
    email: "user@example.com",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "ws-uuid-123",
      chatgpt_plan_type: "self_serve_business_prolite",
      chatgpt_user_id: "user-abc",
      organizations: [
        { id: "org-1", title: "Kans's Workspace", role: "owner", is_default: true },
        { id: "org-2", title: "Personal", role: "member", is_default: false },
      ],
    },
  });

  const claims = parseOpenAiAuthClaims(token);
  assert.deepEqual(claims, {
    chatgptAccountId: "ws-uuid-123",
    chatgptPlanType: "self_serve_business_prolite",
    chatgptUserId: "user-abc",
    organizations: [
      { id: "org-1", title: "Kans's Workspace", role: "owner", isDefault: true },
      { id: "org-2", title: "Personal", role: "member", isDefault: false },
    ],
  });

  assert.equal(parseOpenAiAuthClaims(null), null);
  assert.equal(parseOpenAiAuthClaims("not-a-jwt"), null);
  assert.equal(parseOpenAiAuthClaims(makeJwt({ email: "only@example.com" })), null);
});

test("parseCodexLocalAuth uses JWT chatgpt_account_id instead of shared-local-session when tokens.account_id is absent", () => {
  const idToken = makeJwt({
    email: "same@example.com",
    name: "Aminek Groek",
    "https://api.openai.com/auth": {
      chatgpt_account_id: "ws-uuid-999",
      chatgpt_plan_type: "self_serve_business_prolite",
    },
  });

  const account = parseCodexLocalAuth({
    auth_mode: "chatgpt",
    tokens: {
      access_token: "access-1",
      refresh_token: "refresh-1",
      id_token: idToken,
    },
  });

  assert.equal(account?.id, "acct-oauth-ws-uuid-999");
  assert.equal(account?.lastPlan, "self_serve_business_prolite");
  const oauth = JSON.parse(deobfuscate(account?.apiKey ?? ""));
  assert.equal(oauth.accountId, "ws-uuid-999");
});

test("findCodexAccountMatch never merges distinct workspace and personal accountIds under the same email", () => {
  const workspaceAcc = {
    id: "acct-oauth-ws-1",
    label: "Aminek (Kans's Workspace)",
    email: "tlr.gmail.0001@gmail.com",
    apiKey: obfuscate(JSON.stringify({ accountId: "ws-1", accessToken: "tok-ws", isOAuth: true })),
  };
  const personalCandidate = {
    id: "acct-oauth-personal-2",
    label: "Aminek (Personal)",
    email: "tlr.gmail.0001@gmail.com",
    apiKey: obfuscate(
      JSON.stringify({ accountId: "personal-2", accessToken: "tok-p", isOAuth: true }),
    ),
  };

  assert.equal(findCodexAccountMatch([workspaceAcc], personalCandidate), undefined);

  const sameWorkspaceCandidate = {
    ...personalCandidate,
    id: "acct-oauth-ws-1",
    apiKey: obfuscate(
      JSON.stringify({ accountId: "ws-1", accessToken: "tok-ws-2", isOAuth: true }),
    ),
  };
  assert.equal(
    findCodexAccountMatch([workspaceAcc], sameWorkspaceCandidate)?.id,
    "acct-oauth-ws-1",
  );

  // Upgrades a legacy shared-local-session card with the same email
  const legacyShared = {
    id: "acct-oauth-shared-local-session",
    label: "tlr.gmail.0001",
    email: "tlr.gmail.0001@gmail.com",
    apiKey: obfuscate(
      JSON.stringify({ accountId: "shared-local-session", accessToken: "tok-old", isOAuth: true }),
    ),
  };
  assert.equal(
    findCodexAccountMatch([legacyShared], personalCandidate)?.id,
    "acct-oauth-shared-local-session",
  );
});

test("mergeCodexOAuthRefreshResponse preserves distinct stored accountId even if refresh response returns a different account_id", () => {
  const merged = mergeCodexOAuthRefreshResponse(
    {
      accessToken: "old-at",
      refreshToken: "old-rt",
      accountId: "personal-uuid-2",
      tokens: { access_token: "old-at", refresh_token: "old-rt", account_id: "personal-uuid-2" },
    },
    {
      access_token: "new-at",
      refresh_token: "new-rt",
      account_id: "business-ws-1",
    },
    "2026-11-27T00:00:00.000Z",
  );

  assert.equal(merged.accountId, "personal-uuid-2");
  assert.equal(merged.tokens.account_id, "personal-uuid-2");
  assert.equal(merged.accessToken, "new-at");
  assert.equal(merged.refreshToken, "new-rt");

  const upgraded = mergeCodexOAuthRefreshResponse(
    {
      accessToken: "old-at",
      refreshToken: "old-rt",
      accountId: "shared-local-session",
    },
    {
      access_token: "new-at",
      account_id: "resolved-uuid-3",
    },
  );
  assert.equal(upgraded.accountId, "resolved-uuid-3");
});

test("propagateRotatedRefreshToken updates sibling accounts sharing the prior refresh token while preserving each accountId", () => {
  const accounts = [
    {
      id: "acct-oauth-ws-1",
      label: "Workspace",
      apiKey: obfuscate(
        JSON.stringify({
          accessToken: "new-at",
          refreshToken: "new-rt",
          accountId: "ws-1",
          isOAuth: true,
        }),
      ),
    },
    {
      id: "acct-oauth-personal-2",
      label: "Personal",
      apiKey: obfuscate(
        JSON.stringify({
          accessToken: "old-at",
          refreshToken: "shared-rt-1",
          accountId: "personal-2",
          isOAuth: true,
        }),
      ),
    },
    {
      id: "acct-oauth-other",
      label: "Other User",
      apiKey: obfuscate(
        JSON.stringify({
          accessToken: "other-at",
          refreshToken: "unrelated-rt",
          accountId: "other-3",
          isOAuth: true,
        }),
      ),
    },
  ];

  const updated = propagateRotatedRefreshToken(accounts, "acct-oauth-ws-1", "shared-rt-1", {
    accessToken: "new-at",
    refreshToken: "new-rt",
    idToken: "new-id",
    lastRefresh: "2026-11-27T00:00:00.000Z",
  });

  const sibling = JSON.parse(deobfuscate(updated[1].apiKey));
  assert.equal(sibling.accessToken, "new-at");
  assert.equal(sibling.refreshToken, "new-rt");
  assert.equal(sibling.idToken, "new-id");
  assert.equal(sibling.accountId, "personal-2");

  const unrelated = JSON.parse(deobfuscate(updated[2].apiKey));
  assert.equal(unrelated.refreshToken, "unrelated-rt");
  assert.equal(unrelated.accountId, "other-3");
});

test("detectCodexAccountMismatch flags cross-workspace /wham/usage payloads when both UUIDs are distinct", () => {
  const mismatch = detectCodexAccountMismatch("personal-uuid-2", {
    account_id: "business-ws-1",
    plan_type: "self_serve_business_prolite",
  });
  assert.deepEqual(mismatch, { expected: "personal-uuid-2", actual: "business-ws-1" });
  assert.match(formatCodexAccountMismatchError(mismatch), /Workspace mismatch/i);

  assert.equal(detectCodexAccountMismatch("business-ws-1", { account_id: "business-ws-1" }), null);
  assert.equal(
    detectCodexAccountMismatch("shared-local-session", { account_id: "business-ws-1" }),
    null,
  );
  assert.equal(detectCodexAccountMismatch("business-ws-1", {}), null);
});

test("mergeCodexResetCredits prunes expired grants and preserves prior valid grants as stale on omission", () => {
  const nowMs = Date.parse("2026-11-27T12:00:00Z");
  const prior = {
    available_count: 2,
    credits: [
      { id: "expired", status: "available", expires_at: "2026-11-27T11:00:00Z" },
      { id: "valid", status: "available", expires_at: "2026-11-29T12:00:00Z" },
    ],
  };

  const pruned = pruneExpiredCodexResetCredits(prior, nowMs);
  assert.equal(pruned?.available_count, 1);
  assert.equal(pruned?.credits?.length, 1);
  assert.equal(pruned?.credits?.[0].id, "valid");

  const preserved = mergeCodexResetCredits(null, prior, nowMs);
  assert.equal(preserved?.available_count, 1);
  assert.equal(preserved?.stale, true);

  const incoming = {
    available_count: 1,
    credits: [{ id: "fresh", status: "available", expires_at: "2026-12-01T00:00:00Z" }],
    stale: true,
    retry_after_at: 1795790000,
  };
  const merged = mergeCodexResetCredits(incoming, prior, nowMs);
  assert.equal(merged?.available_count, 1);
  assert.equal(merged?.stale, true);
  assert.equal(merged?.retry_after_at, 1795790000);
});

test("buildMergedCodexUsageEntry and updateCodexAccountsAfterRefresh keep reset metadata and sibling tokens synced", () => {
  const nowMs = Date.parse("2026-11-27T12:00:00Z");
  const priorCache = {
    primary: { used_percent: 85 },
    rate_limit: {
      reset_credits: {
        available_count: 1,
        credits: [{ id: "c1", status: "available", expires_at: "2026-11-30T00:00:00Z" }],
      },
    },
  };
  assert.equal(extractPriorCodexUsedPercent(priorCache), 85);

  const entry = buildMergedCodexUsageEntry(
    {
      account_id: "ws-1",
      plan_type: "self_serve_business_prolite",
      rate_limit: {
        primary_window: { used_percent: 10, limit_window_seconds: 18000 },
      },
    },
    priorCache,
    nowMs,
  );
  assert.equal(entry.planName, "self_serve_business_prolite");
  assert.equal(entry.rate_limit.reset_credits.available_count, 1);
  assert.equal(entry.rate_limit.reset_credits.stale, true);
  assert.equal(entry.resetCredits.available_count, 1);

  const accounts = [
    {
      id: "acct-oauth-ws-1",
      label: "Workspace",
      apiKey: obfuscate(
        JSON.stringify({ accessToken: "old", refreshToken: "rt-shared", accountId: "ws-1" }),
      ),
    },
    {
      id: "acct-oauth-p-2",
      label: "Personal",
      apiKey: obfuscate(
        JSON.stringify({ accessToken: "old", refreshToken: "rt-shared", accountId: "p-2" }),
      ),
    },
  ];
  const updated = updateCodexAccountsAfterRefresh(accounts, "acct-oauth-ws-1", "rt-shared", {
    accessToken: "fresh-at",
    refreshToken: "rt-rotated",
    accountId: "ws-1",
    lastRefresh: "2026-11-27T12:00:00Z",
  });
  assert.equal(JSON.parse(deobfuscate(updated[0].apiKey)).refreshToken, "rt-rotated");
  assert.equal(JSON.parse(deobfuscate(updated[1].apiKey)).refreshToken, "rt-rotated");
  assert.equal(JSON.parse(deobfuscate(updated[1].apiKey)).accountId, "p-2");
});

test("Wave 2 backend and fetcher wire cached codex resets, id_token_add_organizations, skipResets probe, and mismatch guard", () => {
  const codexRs = fs.readFileSync("src-tauri/src/auth/oauth/codex.rs", "utf8");
  const oauthCmd = fs.readFileSync("src-tauri/src/app/commands/oauth.rs", "utf8");
  const fetcher = fs.readFileSync("src/hooks/codex/useCodexUsageFetcher.ts", "utf8");
  const oauthModal = fs.readFileSync("src/components/codex/modals/codex-oauth-accounts.ts", "utf8");

  assert.match(codexRs, /id_token_add_organizations=true/);
  assert.match(oauthCmd, /get_or_fetch_codex_reset_credits/);
  assert.match(oauthCmd, /skip_resets/);
  assert.match(oauthModal, /skipResets:\s*true/);
  assert.match(fetcher, /detectCodexAccountMismatch/);
  assert.match(fetcher, /buildMergedCodexUsageEntry/);
  assert.match(fetcher, /updateCodexAccountsAfterRefresh/);
});

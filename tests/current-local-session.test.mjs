import test from "node:test";
import assert from "node:assert/strict";

import { extractAntigravitySessionAccount } from "../.test-build/antigravity/current-local-session.js";
import {
  parseCodexLocalAuth,
  buildCodexAuthContent,
} from "../.test-build/codex/current-local-session.js";
import { deobfuscate } from "../.test-build/auth/auth.js";

test("Antigravity parser keeps credentials, email, and fallback label", () => {
  const account = extractAntigravitySessionAccount(
    {
      "antigravityUnifiedStateSync.oauthToken": "access-token",
      "antigravity.refreshToken": "refresh-token",
      "antigravity.profileUrl": "https://example.com/avatar.png",
      "antigravity.authMethod": "consumer",
      "antigravityUnifiedStateSync.userStatus": JSON.stringify({
        userInfo: { email: "User@Example.com" },
      }),
    },
    "Work Profile",
  );

  assert.equal(account?.label, "Work Profile");
  assert.equal(account?.email, "User@Example.com");
  assert.equal(deobfuscate(account?.token ?? ""), "access-token");
  assert.equal(deobfuscate(account?.refreshToken ?? ""), "refresh-token");
  assert.equal(account?.authMethod, "consumer");
});

test("Antigravity parser falls back to id token email and provider label", () => {
  const payload = Buffer.from(JSON.stringify({ email: "id-token@example.com" })).toString(
    "base64url",
  );
  const account = extractAntigravitySessionAccount({
    "antigravityUnifiedStateSync.oauthToken": "access-token",
    "antigravity.idToken": `header.${payload}.signature`,
  });

  assert.equal(account?.email, "id-token@example.com");
  assert.equal(account?.label, "id-token");
});

test("Codex parser extracts OAuth account id and email from auth.json", () => {
  const payload = Buffer.from(JSON.stringify({ email: "codex@example.com" })).toString("base64url");
  const account = parseCodexLocalAuth(
    {
      auth_mode: "chatgpt",
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        account_id: "acct-123",
        id_token: `header.${payload}.signature`,
      },
    },
    "Codex CLI",
  );

  assert.equal(account?.id, "acct-oauth-acct-123");
  assert.equal(account?.label, "Codex CLI");
  assert.equal(account?.email, "codex@example.com");
  const oauth = JSON.parse(deobfuscate(account?.apiKey ?? ""));
  assert.equal(oauth.accountId, "acct-123");
  assert.equal(oauth.accessToken, "access-token");
});

test("Codex parser accepts raw auth.json text returned by the Tauri backend", () => {
  const payload = Buffer.from(JSON.stringify({ email: "drago@example.com" })).toString("base64url");
  const account = parseCodexLocalAuth(
    JSON.stringify({
      auth_mode: "chatgpt",
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        account_id: "acct-drago",
        id_token: `header.${payload}.signature`,
      },
    }),
    "Current Codex",
  );

  assert.equal(account?.id, "acct-oauth-acct-drago");
  assert.equal(account?.label, "Current Codex");
  assert.equal(account?.email, "drago@example.com");
});

test("Codex parser imports API-key auth without inventing an email", () => {
  const account = parseCodexLocalAuth(
    {
      auth_mode: "openai_api_key",
      OPENAI_API_KEY: "sk-test-key",
    },
    "Codex CLI",
  );

  assert.equal(account?.email, undefined);
  assert.equal(account?.id, `acct-apikey-${"sk-test-key".slice(-6)}`);
  assert.equal(deobfuscate(account?.apiKey ?? ""), "sk-test-key");
});

test("Malformed provider sessions return null without throwing", () => {
  assert.equal(extractAntigravitySessionAccount(null), null);
  assert.equal(extractAntigravitySessionAccount({}), null);
  assert.equal(parseCodexLocalAuth(null), null);
  assert.equal(parseCodexLocalAuth({ auth_mode: "unknown" }), null);
  assert.equal(parseCodexLocalAuth("{not-json"), null);
});

test("Codex auth writer preserves OAuth auth shape and API-key auth shape", () => {
  const oauth = JSON.parse(
    buildCodexAuthContent(
      JSON.stringify({
        accessToken: "oauth-access",
        refreshToken: "oauth-refresh",
        accountId: "acct-123",
        idToken: "id-token",
        lastRefresh: "2026-09-20T00:00:00.000Z",
      }),
    ),
  );
  assert.equal(oauth.auth_mode, "chatgpt");
  assert.equal(oauth.OPENAI_API_KEY, null);
  assert.equal(oauth.tokens.access_token, "oauth-access");
  assert.equal(oauth.tokens.refresh_token, "oauth-refresh");
  assert.equal(oauth.tokens.account_id, "acct-123");

  const apiKey = JSON.parse(buildCodexAuthContent("sk-test-key"));
  assert.deepEqual(apiKey, {
    auth_mode: "openai_api_key",
    OPENAI_API_KEY: "sk-test-key",
  });
});

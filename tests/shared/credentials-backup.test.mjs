import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

import {
  buildCredentialsBackupData,
  restoreCredentialsData,
} from "../../.test-build/common/backup/credentials-backup.js";
import { encryptBackup, decryptBackup } from "../../.test-build/common/backup/app-backup.js";
import {
  loadAntigravityAccounts,
  loadCodexAccounts,
  loadCodexPools,
  loadCliRotationPools,
  saveCodexPools,
  saveCliRotationPools,
} from "../../.test-build/common/backup/app-storage.js";

test("buildCredentialsBackupData creates typed credentials payload", () => {
  const agAccounts = [
    { id: "ag-1", email: "ag@test.com", token: "tok1", refreshToken: "ref1", label: "AG 1" },
  ];
  const cxAccounts = [
    { id: "cx-1", email: "cx@test.com", apiKey: "key1", label: "CX 1" },
  ];

  const credData = buildCredentialsBackupData(agAccounts, cxAccounts);
  assert.equal(credData.type, "quotashift_credentials_backup");
  assert.equal(credData.version, 1);
  assert.equal(credData.antigravity.accounts.length, 1);
  assert.equal(credData.antigravity.accounts[0].refreshToken, "ref1");
  assert.equal(credData.codex.accounts.length, 1);
  assert.equal(credData.codex.accounts[0].apiKey, "key1");
  assert.equal(credData.settings, undefined);
  assert.equal(credData.cliPools, undefined);
  assert.equal(credData.pools, undefined);
});

test("credentials backup round-trip with encryption", async () => {
  mockStorage.clear();
  const agAccounts = [
    { id: "ag-1", email: "ag@test.com", token: "tok1", refreshToken: "ref1", label: "AG 1" },
  ];
  const cxAccounts = [
    { id: "cx-1", email: "cx@test.com", apiKey: "key1", label: "CX 1" },
  ];

  const credData = buildCredentialsBackupData(agAccounts, cxAccounts);
  const passphrase = "secret-passphrase";
  const encrypted = await encryptBackup(credData, passphrase);
  assert.ok(typeof encrypted === "string");

  const decrypted = await decryptBackup(encrypted, passphrase);
  assert.equal(decrypted.type, "quotashift_credentials_backup");
  assert.equal(decrypted.antigravity.accounts[0].email, "ag@test.com");
  assert.equal(decrypted.codex.accounts[0].email, "cx@test.com");
});

test("restoreCredentialsData merges accounts without touching pools or settings", () => {
  mockStorage.clear();

  // Set existing model pools and cli pools
  const existingPools = [{ id: "model-1", name: "Pool 1", model: "o3", accountIds: [] }];
  const existingCliPools = [
    {
      id: "cli-1",
      name: "CLI Pool",
      provider: "agy",
      accountIds: ["ag-1"],
      enabled: true,
      autoSwitch: true,
      triggerWindows: ["5h"],
      fallbackLatestEnabled: false,
      switchWhenIdleOnly: false,
    },
  ];
  saveCodexPools(existingPools);
  saveCliRotationPools(existingCliPools);

  const credData = buildCredentialsBackupData(
    [
      { id: "ag-new", email: "ag-new@test.com", token: "tok-new", label: "AG New" },
      { id: "ag-legacy", email: "ag-leg@test.com", token: "tok-leg", refresh_token: "ref-leg", label: "AG Leg" },
    ],
    [{ id: "cx-new", email: "cx-new@test.com", apiKey: "key-new", label: "CX New" }],
  );

  mockStorage.set("antigravity-account-order", JSON.stringify(["ag-new", "ag-other"]));
  mockStorage.set("antigravity-codex-account-order", JSON.stringify(["cx-new", "cx-other"]));

  const res = restoreCredentialsData(credData, [], []);
  assert.equal(res.importedAntigravityCount, 2);
  assert.equal(res.importedCodexCount, 1);

  // Accounts are saved
  const storedAg = loadAntigravityAccounts();
  const storedCx = loadCodexAccounts();
  assert.equal(storedAg.length, 2);
  assert.equal(storedAg[0].email, "ag-new@test.com");
  assert.equal(storedCx.length, 1);
  assert.equal(storedCx[0].email, "cx-new@test.com");

  // Model pools and CLI pools remain untouched!
  const storedPools = loadCodexPools();
  const storedCliPools = loadCliRotationPools();
  assert.equal(storedPools.length, 1);
  assert.equal(storedPools[0].id, "model-1");
  assert.equal(storedCliPools.length, 1);
  assert.equal(storedCliPools[0].id, "cli-1");
  assert.equal(storedCliPools[0].autoSwitch, true);
});

test("SettingsModal renders Data tab in 3 grouped parts including AccountCredentialsSection", () => {
  const modalCode = fs.readFileSync(
    new URL("../../src/components/common/settings/SettingsModal.tsx", import.meta.url),
    "utf8",
  );
  const credCode = fs.readFileSync(
    new URL("../../src/components/common/accounts/AccountCredentialsSection.tsx", import.meta.url),
    "utf8",
  );

  // Check Data tab block
  const dataBlock = modalCode.match(/activeTab === "data"[\s\S]*?activeTab === "(?:logs|help)"/)?.[0] ?? "";
  assert.ok(dataBlock.length > 0, "Data tab block should exist");

  // Part 1: Codex Models
  assert.match(dataBlock, /Codex Models/);
  assert.match(dataBlock, /Rescan all Codex models/);

  // Part 2: Account Credentials subcomponent
  assert.match(dataBlock, /<AccountCredentialsSection/);
  assert.match(credCode, /Account Credentials/);
  assert.match(credCode, /Export credentials/);
  assert.match(credCode, /Import credentials/);

  // Part 3: Full Backup
  assert.match(dataBlock, /Full Backup/);
  assert.match(dataBlock, /Export backup/);
  assert.match(dataBlock, /Import backup/);
});

test("restoreCredentialsData keeps newer existing Codex and Antigravity credentials when imported refresh time is older", async () => {
  mockStorage.clear();
  const { obfuscate } = await import("../../.test-build/auth/auth.js");
  const makeJwt = (iatSec) => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ iat: iatSec })).toString("base64url");
    return `${header}.${body}.sig`;
  };

  const existingCxNewer = {
    id: "acct-oauth-ws-1",
    label: "Workspace Fresh",
    email: "shared@example.com",
    apiKey: obfuscate(
      JSON.stringify({
        accessToken: "at-fresh",
        refreshToken: "rt-fresh",
        accountId: "ws-1",
        lastRefresh: "2026-11-28T12:00:00.000Z",
      }),
    ),
  };
  const existingCxJwtNewer = {
    id: "acct-oauth-jwt-1",
    label: "JWT Fresh",
    email: "jwt@example.com",
    apiKey: obfuscate(
      JSON.stringify({
        accessToken: makeJwt(1_800_005_000),
        refreshToken: "rt-jwt-fresh",
        accountId: "jwt-1",
      }),
    ),
  };
  const existingAgNewer = {
    id: "ag-fresh",
    label: "AG Fresh",
    email: "ag-fresh@example.com",
    token: "tok-fresh",
    refreshToken: "ref-fresh",
    tokenRefreshedAt: Date.parse("2026-11-28T12:00:00.000Z"),
  };
  const existingAgQuotaNewer = {
    id: "ag-quota",
    label: "AG Quota",
    email: "ag-quota@example.com",
    token: "tok-quota-fresh",
    refreshToken: "ref-quota-fresh",
    lastQuotaFetchedAt: Date.parse("2026-11-28T12:00:00.000Z"),
  };

  const olderBackup = {
    version: 1,
    type: "quotashift_credentials_backup",
    createdAt: "2026-11-20T00:00:00.000Z",
    antigravity: {
      accounts: [
        {
          id: "ag-fresh",
          label: "AG Old",
          email: "ag-fresh@example.com",
          token: "tok-old",
          refreshToken: "ref-old",
          tokenRefreshedAt: Date.parse("2026-11-27T00:00:00.000Z"),
        },
        {
          id: "ag-quota",
          label: "AG Old Fallback",
          email: "ag-quota@example.com",
          token: "tok-old-fallback",
          refreshToken: "ref-old-fallback",
        },
      ],
    },
    codex: {
      accounts: [
        {
          id: "acct-oauth-ws-1",
          label: "Workspace Old",
          email: "shared@example.com",
          apiKey: obfuscate(
            JSON.stringify({
              accessToken: "at-old",
              refreshToken: "rt-old",
              accountId: "ws-1",
              lastRefresh: "2026-11-27T12:00:00.000Z",
            }),
          ),
        },
        {
          id: "acct-oauth-jwt-1",
          label: "JWT Old",
          email: "jwt@example.com",
          apiKey: obfuscate(
            JSON.stringify({
              accessToken: makeJwt(1_800_000_000),
              refreshToken: "rt-jwt-old",
              accountId: "jwt-1",
            }),
          ),
        },
        {
          id: "acct-oauth-personal-2",
          label: "Personal Profile",
          email: "shared@example.com",
          apiKey: obfuscate(
            JSON.stringify({
              accessToken: "at-personal",
              refreshToken: "rt-personal",
              accountId: "personal-2",
              lastRefresh: "2026-11-28T13:00:00.000Z",
            }),
          ),
        },
      ],
    },
  };

  const res = restoreCredentialsData(
    olderBackup,
    [existingAgNewer, existingAgQuotaNewer],
    [existingCxNewer, existingCxJwtNewer],
  );
  assert.equal(res.updatedAntigravityCount, 1);
  assert.equal(res.skippedOlderAntigravityCount, 1);
  assert.equal(res.updatedCodexCount, 0);
  assert.equal(res.skippedOlderCodexCount, 2);
  assert.equal(res.importedCodexCount, 1);

  assert.equal(res.accounts.antigravity.find((a) => a.id === "ag-fresh").refreshToken, "ref-fresh");
  assert.equal(
    res.accounts.antigravity.find((a) => a.id === "ag-quota").refreshToken,
    "ref-old-fallback",
  );
  assert.equal(
    res.accounts.codex.find((a) => a.id === "acct-oauth-ws-1").apiKey,
    existingCxNewer.apiKey,
  );
  assert.equal(
    res.accounts.codex.find((a) => a.id === "acct-oauth-jwt-1").apiKey,
    existingCxJwtNewer.apiKey,
  );
  assert.ok(
    res.accounts.codex.some((a) => a.id === "acct-oauth-personal-2"),
    "Distinct Codex accountId sharing the same email must be imported separately",
  );

  // Newer imported Codex credential still updates the existing account
  const newerBackup = {
    version: 1,
    type: "quotashift_credentials_backup",
    createdAt: "2026-11-29T00:00:00.000Z",
    antigravity: { accounts: [] },
    codex: {
      accounts: [
        {
          id: "acct-oauth-ws-1",
          label: "Workspace Even Newer",
          email: "shared@example.com",
          apiKey: obfuscate(
            JSON.stringify({
              accessToken: "at-newest",
              refreshToken: "rt-newest",
              accountId: "ws-1",
              lastRefresh: "2026-11-29T00:00:00.000Z",
            }),
          ),
        },
      ],
    },
  };
  const newerRes = restoreCredentialsData(newerBackup, [], [existingCxNewer]);
  assert.equal(newerRes.updatedCodexCount, 1);
  assert.equal(newerRes.skippedOlderCodexCount, 0);
  assert.equal(newerRes.accounts.codex[0].label, "Workspace Even Newer");

  const { extractJwtRefreshTimeMs } = await import(
    "../../.test-build/common/backup/credential-freshness.js"
  );
  const expOnlyHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
    "base64url",
  );
  const expOnlyBody = Buffer.from(JSON.stringify({ exp: 1_900_000_000 })).toString("base64url");
  assert.equal(extractJwtRefreshTimeMs(`${expOnlyHeader}.${expOnlyBody}.sig`), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackupData,
  extractBackupPayload,
  restoreBackupData,
  encryptBackup,
  decryptBackup,
} from "../../.test-build/common/app-backup.js";
import { readWithCssImports } from "../css-helper.mjs";

const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

test("buildBackupData constructs bundle with version 2 and current accounts", () => {
  const agAccounts = [{ id: "ag-1", label: "AG 1", email: "ag1@test.com", token: "tok1" }];
  const cxAccounts = [{ id: "cx-1", label: "CX 1", email: "cx1@test.com", apiKey: "key1" }];
  const bundle = buildBackupData(agAccounts, cxAccounts, "dark");
  assert.equal(bundle.version, 2);
  assert.equal(bundle.theme, "dark");
  assert.deepEqual(bundle.antigravity.accounts, agAccounts);
  assert.deepEqual(bundle.codex.accounts, cxAccounts);
  assert.ok(Array.isArray(bundle.codex.pools));
});

test("extractBackupPayload extracts accounts from modern format", () => {
  const backup = {
    version: 2,
    antigravity: { accounts: [{ id: "ag-1", email: "ag@test.com", token: "tok" }] },
    codex: { accounts: [{ id: "cx-1", email: "cx@test.com", apiKey: "key" }], pools: [{ id: "pool-1", name: "Pool 1", model: "gpt-4", accountIds: ["cx-1"] }] },
  };
  const payload = extractBackupPayload(backup);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.agAccounts[0].email, "ag@test.com");
  assert.equal(payload.cxAccounts.length, 1);
  assert.equal(payload.cxAccounts[0].email, "cx@test.com");
  assert.equal(payload.pools.length, 1);
});

test("extractBackupPayload extracts accounts from legacy format", () => {
  const legacy = {
    antigravityAccounts: [{ id: "ag-legacy", email: "legacy@test.com", token: "tok" }],
    codexAccounts: [{ id: "cx-legacy", email: "cxlegacy@test.com", apiKey: "key" }],
    pools: [{ id: "pool-leg", name: "Pool Leg", model: "gpt-5", accountIds: ["cx-legacy"] }],
  };
  const payload = extractBackupPayload(legacy);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.agAccounts[0].id, "ag-legacy");
  assert.equal(payload.cxAccounts.length, 1);
  assert.equal(payload.cxAccounts[0].id, "cx-legacy");
  assert.equal(payload.pools.length, 1);
});

test("extractBackupPayload extracts accounts from platforms format", () => {
  const platforms = {
    platforms: {
      antigravity: { accounts: [{ id: "ag-p", email: "p@ag.com", token: "tok" }] },
      codex: { accounts: [{ id: "cx-p", email: "p@cx.com", apiKey: "key" }], pools: [{ id: "pool-p", name: "P", model: "gpt", accountIds: ["cx-p"] }] },
    },
  };
  const payload = extractBackupPayload(platforms);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.agAccounts[0].id, "ag-p");
  assert.equal(payload.cxAccounts.length, 1);
  assert.equal(payload.cxAccounts[0].id, "cx-p");
  assert.equal(payload.pools.length, 1);
});

test("extractBackupPayload extracts from raw account array", () => {
  const rawArray = [
    { id: "ag-arr", email: "ag@arr.com", token: "tok" },
    { id: "cx-arr", email: "cx@arr.com", apiKey: "key" },
  ];
  const payload = extractBackupPayload(rawArray);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.agAccounts[0].id, "ag-arr");
  assert.equal(payload.cxAccounts.length, 1);
  assert.equal(payload.cxAccounts[0].id, "cx-arr");
});

test("extractBackupPayload handles direct arrays and OAuth codex accounts without apiKey", () => {
  const backup = {
    codex: [
      { id: "acct-oauth-1", email: "user1@openai.com", lastPlan: "PLUS" },
      { id: "acct-oauth-2", email: "user2@openai.com", tokens: { access_token: "abc" } },
    ],
    antigravity: [
      { id: "ag-acct-1", email: "ag1@google.com", token: "tok-1" },
    ],
  };
  const payload = extractBackupPayload(backup);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.cxAccounts.length, 2);
  assert.equal(payload.cxAccounts[0].email, "user1@openai.com");
  assert.equal(payload.cxAccounts[1].email, "user2@openai.com");
});

test("extractBackupPayload extracts from mixed data.accounts array", () => {
  const backup = {
    accounts: [
      { id: "ag-acct-x", email: "ag@x.com", token: "tok" },
      { id: "cx-y", email: "cx@y.com", provider: "codex" },
      { id: "acct-oauth-z", email: "cx@z.com" },
    ],
  };
  const payload = extractBackupPayload(backup);
  assert.equal(payload.agAccounts.length, 1);
  assert.equal(payload.cxAccounts.length, 2);
});

test("restoreBackupData merges imported accounts with existing accounts", () => {
  mockStorage.clear();
  const existingAg = [{ id: "ag-keep", email: "keep@ag.com", token: "old-tok" }, { id: "ag-update", email: "update@ag.com", token: "old-tok" }];
  const existingCx = [{ id: "cx-keep", email: "keep@cx.com", apiKey: "old-key" }];
  const backupToRestore = {
    antigravity: {
      accounts: [
        { id: "ag-update", email: "update@ag.com", token: "new-tok", label: "Updated AG" },
        { id: "ag-new", email: "new@ag.com", token: "brand-new-tok" },
      ],
    },
    codex: { accounts: [{ id: "cx-new", email: "new@cx.com", apiKey: "brand-new-key" }] },
  };
  const res = restoreBackupData(backupToRestore, existingAg, existingCx, []);
  assert.equal(res.importedAntigravityCount, 1);
  assert.equal(res.updatedAntigravityCount, 1);
  assert.equal(res.importedCodexCount, 1);
  assert.equal(res.updatedCodexCount, 0);
  assert.equal(res.accounts.antigravity.length, 3);
  const updatedAg = res.accounts.antigravity.find((a) => a.id === "ag-update");
  assert.equal(updatedAg.token, "new-tok");
  assert.equal(updatedAg.label, "Updated AG");
  assert.equal(res.accounts.codex.length, 2);
  assert.ok(mockStorage.has("antigravity-accounts-list"));
  assert.ok(mockStorage.has("antigravity-codex-accounts"));
  assert.ok(mockStorage.has("antigravity-account-order"));
  assert.ok(mockStorage.has("antigravity-codex-account-order"));
});

test("restoreBackupData strictly enforces: existing -> overwrite, not existing -> add, unpresent -> ignored/kept", () => {
  mockStorage.clear();
  // Set up initial custom order in storage
  mockStorage.set("antigravity-account-order", JSON.stringify(["ag-preserved", "ag-to-overwrite"]));
  mockStorage.set("antigravity-codex-account-order", JSON.stringify(["cx-preserved", "cx-to-overwrite"]));

  const existingAg = [
    { id: "ag-preserved", email: "stay@ag.com", label: "Stay AG", token: "keep-token-ag" },
    { id: "ag-to-overwrite", email: "overwrite@ag.com", label: "Old Label AG", token: "old-token-ag" },
  ];
  const existingCx = [
    { id: "cx-preserved", email: "stay@cx.com", label: "Stay CX", apiKey: "keep-key-cx" },
    { id: "cx-to-overwrite", email: "overwrite@cx.com", label: "Old Label CX", apiKey: "old-key-cx" },
  ];

  const backup = {
    version: 2,
    antigravity: {
      accounts: [
        // 1. Existing account with case/whitespace variations -> must overwrite existing, keep ID
        { id: "different-backup-id-1", email: " Overwrite@AG.com ", label: "New Label AG", token: "fresh-token-ag", lastPlan: "Pro" },
        // 2. Not existing account -> must add
        { id: "ag-brand-new", email: "fresh@ag.com", label: "Fresh AG", token: "brand-new-token" },
      ],
    },
    codex: {
      accounts: [
        // 1. Existing account with case variations -> must overwrite existing, keep ID
        { id: "different-backup-id-2", email: "OVERWRITE@cx.com", label: "New Label CX", apiKey: "fresh-key-cx", lastPlan: "Plus" },
        // 2. Not existing account -> must add
        { id: "cx-brand-new", email: "fresh@cx.com", label: "Fresh CX", apiKey: "brand-new-cx-key" },
      ],
    },
  };

  const res = restoreBackupData(backup, existingAg, existingCx, []);

  // Verify counters
  assert.equal(res.updatedAntigravityCount, 1);
  assert.equal(res.importedAntigravityCount, 1);
  assert.equal(res.updatedCodexCount, 1);
  assert.equal(res.importedCodexCount, 1);

  // Verify Antigravity accounts: total should be 3 (1 preserved + 1 overwritten + 1 added)
  assert.equal(res.accounts.antigravity.length, 3);

  // 1. Existing account NOT present in backup -> ignored, preserved untouched
  const agPreserved = res.accounts.antigravity.find((a) => a.id === "ag-preserved");
  assert.ok(agPreserved, "Existing account not in backup must be retained");
  assert.equal(agPreserved.token, "keep-token-ag");
  assert.equal(agPreserved.label, "Stay AG");

  // 2. Existing account present in backup -> overwritten with new fields, keeping local ID
  const agOverwritten = res.accounts.antigravity.find((a) => a.id === "ag-to-overwrite");
  assert.ok(agOverwritten, "Existing matching account must exist with original ID");
  assert.equal(agOverwritten.label, "New Label AG");
  assert.equal(agOverwritten.token, "fresh-token-ag");
  assert.equal(agOverwritten.lastPlan, "Pro");

  // 3. New account in backup -> added
  const agAdded = res.accounts.antigravity.find((a) => a.id === "ag-brand-new");
  assert.ok(agAdded, "New account in backup must be added");
  assert.equal(agAdded.email, "fresh@ag.com");

  // Verify Codex accounts: total should be 3 (1 preserved + 1 overwritten + 1 added)
  assert.equal(res.accounts.codex.length, 3);

  // 1. Existing account NOT present in backup -> ignored, preserved untouched
  const cxPreserved = res.accounts.codex.find((a) => a.id === "cx-preserved");
  assert.ok(cxPreserved, "Existing codex account not in backup must be retained");
  assert.equal(cxPreserved.apiKey, "keep-key-cx");

  // 2. Existing account present in backup -> overwritten with new fields, keeping local ID
  const cxOverwritten = res.accounts.codex.find((a) => a.id === "cx-to-overwrite");
  assert.ok(cxOverwritten, "Existing matching codex account must exist with original ID");
  assert.equal(cxOverwritten.label, "New Label CX");
  assert.equal(cxOverwritten.apiKey, "fresh-key-cx");
  assert.equal(cxOverwritten.lastPlan, "Plus");

  // 3. New account in backup -> added
  const cxAdded = res.accounts.codex.find((a) => a.id === "cx-brand-new");
  assert.ok(cxAdded, "New codex account in backup must be added");
  assert.equal(cxAdded.email, "fresh@cx.com");

  // Verify order preservation: preserved and overwritten maintain position, newly added appended
  const savedAgOrder = JSON.parse(mockStorage.get("antigravity-account-order"));
  assert.deepEqual(savedAgOrder, ["ag-preserved", "ag-to-overwrite", "ag-brand-new"]);

  const savedCxOrder = JSON.parse(mockStorage.get("antigravity-codex-account-order"));
  assert.deepEqual(savedCxOrder, ["cx-preserved", "cx-to-overwrite", "cx-brand-new"]);
});

test("encryptBackup and decryptBackup round-trip encrypted data", async () => {
  const original = {
    antigravity: { accounts: [{ id: "1", email: "secret@ag.com", token: "tok123" }] },
    codex: { accounts: [{ id: "2", email: "secret@cx.com", apiKey: "key123" }] },
  };
  const encrypted = await encryptBackup(original, "my-secure-passphrase-123");
  assert.notEqual(encrypted, JSON.stringify(original));
  const decrypted = await decryptBackup(encrypted, "my-secure-passphrase-123");
  assert.deepEqual(decrypted, original);
});

test("Export contracts: success shows dialog with Open in Explorer and target path", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appSrc = readWithCssImports("src/App.tsx");

  assert.match(appSrc, /\[exportSuccessPath,\s*setExportSuccessPath\]\s*=\s*useState/);
  assert.match(appSrc, /setExportSuccessPath\(path\)/);
  assert.match(appSrc, /title="Backup Exported Successfully"/);
  assert.match(appSrc, /confirmText="Open in Explorer"/);
  assert.match(appSrc, /cancelText="Close"/);
  assert.match(appSrc, /invoke\("open_path_in_file_manager",\s*\{\s*path:\s*target\s*\}\)/);
});

test("Import contracts: selecting a file triggers show_dashboard so dashboard panel opens immediately", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appSrc = readWithCssImports("src/App.tsx");
  const headerSrc = fs.readFileSync(path.resolve("src/components/common/Header.tsx"), "utf-8");

  // App.tsx handles import with show_dashboard
  assert.match(appSrc, /handleImportBackup\s*=\s*async[^{]*\{[\s\S]*?invoke\("show_dashboard"\)/);

  // Header.tsx triggers show_dashboard when reader finishes and on cancel
  assert.match(headerSrc, /handleFileChange\s*=\s*[\s\S]*?invoke\("show_dashboard"\)/);
  assert.match(headerSrc, /addEventListener\("cancel",[\s\S]*?invoke\("show_dashboard"\)/);
});

test("Backend contracts: open_path_in_file_manager is cross-platform for Windows, Linux, and macOS", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const explorerSrc = fs.readFileSync(path.resolve("src-tauri/src/system/explorer.rs"), "utf-8");
  const commandsSrc = fs.readFileSync(path.resolve("src-tauri/src/app/commands.rs"), "utf-8");
  const libSrc = fs.readFileSync(path.resolve("src-tauri/src/lib.rs"), "utf-8");

  // Rust explorer supports Windows /select, Linux xdg-open, and macOS open -R
  assert.match(explorerSrc, /target_os\s*=\s*"windows"[\s\S]*?"explorer"[\s\S]*?\/select,/);
  assert.match(explorerSrc, /target_os\s*=\s*"linux"[\s\S]*?"xdg-open"/);
  assert.match(explorerSrc, /target_os\s*=\s*"macos"[\s\S]*?"open"[\s\S]*?-R/);

  // Tauri command registration
  assert.match(commandsSrc, /pub fn open_path_in_file_manager\(path:\s*String\)/);
  assert.match(libSrc, /open_path_in_file_manager/);
});

test("Import contracts: App.tsx calls restoreBackupData and updates accounts in state", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const appSrc = readWithCssImports("src/App.tsx");

  assert.match(appSrc, /restoreBackupData\(pData,\s*antigravityAccounts,\s*codexAccounts/);
  assert.match(appSrc, /setAntigravityAccounts\(res\.accounts\.antigravity\)/);
  assert.match(appSrc, /setCodexAccounts\(res\.accounts\.codex\)/);
});


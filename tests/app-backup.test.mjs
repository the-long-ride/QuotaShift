import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackupData,
  extractBackupPayload,
  restoreBackupData,
  encryptBackup,
  decryptBackup,
} from "../.test-build/common/app-backup.js";

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
  const appSrc = fs.readFileSync(path.resolve("src/App.tsx"), "utf-8");

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
  const appSrc = fs.readFileSync(path.resolve("src/App.tsx"), "utf-8");
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const header = fs.readFileSync('src/components/common/Header.tsx', 'utf8') +
  (fs.existsSync('src/components/common/SettingsModal.tsx') ? fs.readFileSync('src/components/common/SettingsModal.tsx', 'utf8') : '');
const poolModal = fs.readFileSync('src/components/codex/CodexPoolModal.tsx', 'utf8');

// Task 6 GREEN contracts cover settings-menu rescan progress, completion feedback, and live cache wiring.
test('App persists a per-account Codex model catalog cache', () => {
  assert.match(app, /quotashift_codex_model_catalog_v1/);
  assert.match(app, /codexModelCache/);
  assert.match(app, /codexModelCacheRef/);
  assert.match(app, /loadCodexModelCache/);
  assert.match(app, /saveCodexModelCache/);
  assert.match(app, /CodexModelCatalogCacheEntry/);
});

test('per-account model discovery is OAuth-only, freshness-aware, and normalizes the backend response', () => {
  assert.match(app, /fetchCodexModelCatalog\s*=\s*async\s*\(/);
  assert.match(app, /isCodexModelCacheFresh/);
  assert.match(app, /fetch_chatgpt_models/);
  assert.match(app, /normalizeCodexModelCatalog/);
  assert.match(app, /rawKey\.startsWith\("\{"\)/);
  assert.match(app, /API-key accounts do not expose an account-scoped Codex model catalog/);
});

test('model discovery retries authentication at most once and persists refreshed OAuth credentials', () => {
  assert.match(app, /isRetry\s*=\s*false/);
  assert.match(app, /!isRetry/);
  assert.match(app, /refresh_chatgpt_token/);
  assert.match(app, /return await fetchCodexModelCatalog\([^;]*true\)/);
  assert.match(app, /obfuscate\(JSON\.stringify\(oauthData\)\)/);
});

test('failed scans keep previous catalog data but mark the cache entry stale with an error', () => {
  assert.match(app, /previousEntry/);
  assert.match(app, /models:\s*previousEntry\?\.models\s*\?\?\s*\[\]/);
  assert.match(app, /fetchedAt:\s*previousEntry\?\.fetchedAt\s*\?\?\s*0/);
  assert.match(app, /error:\s*errMsg/);
});

test('global Codex model rescan processes OAuth accounts in explicit batches of at most three', () => {
  assert.match(app, /rescanAllCodexModels\s*=\s*async\s*\(/);
  assert.match(app, /for\s*\(let i = 0; i < oauthAccounts\.length; i \+= 3\)/);
  assert.match(app, /oauthAccounts\.slice\(i, i \+ 3\)/);
  assert.match(app, /Promise\.all/);
  assert.match(app, /codexModelScanProgress/);
});

test('deleting a Codex account also removes and persists its model catalog cache entry', () => {
  assert.match(app, /handleDeleteCodexAccount/);
  assert.match(app, /delete next\[acc\.id\]/);
  assert.match(app, /saveCodexModelCache\(next\)/);
});

test('Header exposes global Codex model rescan as a settings item with live progress', () => {
  assert.match(header, /onRescanAllCodexModels/);
  assert.match(header, /codexModelScanProgress/);
  assert.match(header, /(className="gear-dropdown-item"|className="settings-action-row")[\s\S]*?onRescanAllCodexModels\(\)[\s\S]*?Rescan all Codex models/);
  assert.match(header, /disabled=\{codexModelScanProgress\.running\}/);
  assert.match(header, /Scanning/);
  assert.match(header, /codexModelScanProgress\.completed/);
  assert.match(header, /codexModelScanProgress\.total/);
});

test('App wires global and per-account model scans to Header CodexTab and pool editor', () => {
  assert.match(app, /handleRescanAllCodexModels/);
  assert.match(app, /onRescanAllCodexModels=\{handleRescanAllCodexModels\}/);
  assert.match(app, /codexModelScanProgress=\{codexModelScanProgress\}/);
  assert.match(app, /codexModelCache=\{codexModelCache\}/);
  assert.match(app, /onRescanModels=\{/);
  assert.match(app, /modelCache=\{codexModelCache\}/);
  assert.match(app, /onRequestModelScan=\{/);
  assert.doesNotMatch(app, /void codexModelScanProgress/);
  assert.doesNotMatch(app, /void rescanAllCodexModels/);
});

test('per-account rescan callback awaits discovery and discards the catalog return value', () => {
  assert.match(app, /onRescanModels=\{async \(account\) => \{\s*await fetchCodexModelCatalog\(account, true\);\s*\}\}/);
});

test('global scan reports scanned and failed counts in a user-visible completion summary', () => {
  assert.match(app, /handleRescanAllCodexModels[\s\S]*?rescanAllCodexModels\(\)/);
  assert.match(app, /handleRescanAllCodexModels[\s\S]*?showToast/);
  assert.match(app, /result\.completed[^`]*scanned/);
  assert.match(app, /result\.failed[^`]*failed/);
});

test('pool editor requests stale or missing selected-member catalogs once per open session', () => {
  assert.match(poolModal, /isCodexModelCacheFresh/);
  assert.match(poolModal, /requestedScansRef/);
  assert.match(poolModal, /onRequestModelScan\(account\)/);
  assert.doesNotMatch(poolModal, /void onRequestModelScan/);
});

test('adding a new free tier ChatGPT Codex account fetches its available model catalog', () => {
  assert.match(app, /onAccountAdded=\{async \(id\) => \{[\s\S]*?classifyCodexTier[\s\S]*?=== "FREE"[\s\S]*?fetchCodexModelCatalog\(target, true\)/);
  assert.match(app, /!match && classifyCodexTier[\s\S]*?=== "FREE"[\s\S]*?fetchCodexModelCatalog\(account, true\)/);
});


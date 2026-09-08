import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const tab = fs.readFileSync('src/components/CodexTab.tsx', 'utf8');

test('App persists and wires Codex model pools', () => {
  assert.match(app, /quotashift_codex_account_pools_v1/);
  assert.match(app, /CodexPoolModal/);
  assert.match(app, /handleSaveCodexPool/);
  assert.match(app, /handleDeleteCodexPool/);
  assert.match(app, /handleApplyBestCodexPool/);
  assert.match(app, /pools=\{codexPools\}/);
  assert.match(app, /activePoolId=\{activeCodexPoolId\}/);
  assert.match(app, /onApplyPool=\{handleApplyBestCodexPool\}/);
});

test('pool Apply writes a model override while direct account Apply remains model-null capable', () => {
  assert.match(app, /handleApplyCodexAccount\s*=\s*async\s*\([\s\S]{0,300}modelOverride/);
  assert.match(app, /const\s+model\s*=\s*modelOverride\?\.trim\(\)\s*\|\|\s*null/);
  assert.match(app, /sync_codex_provider_config[\s\S]{0,250}model/);
  assert.match(app, /sync_codex_config[\s\S]{0,250}model/);
  assert.match(app, /handleApplyCodexAccount\(best\.account,\s*pool\.model,\s*pool\.id\)/);
  assert.match(tab, /onApply\(acc\)/);
});

test('deleting a Codex account reconciles pool membership without deleting the pool', () => {
  assert.match(app, /reconcileCodexPools\(codexPoolsRef\.current,\s*list\)/);
  assert.match(app, /saveCodexPools/);
});

test('backup export and import round-trip optional Codex pools', () => {
  assert.match(app, /codex:\s*\{[\s\S]{0,250}pools:\s*loadCodexPools\(\)/);
  assert.match(app, /Array\.isArray\(pData\.pools\)/);
  assert.match(app, /importedIdMap/);
  assert.match(app, /normalizeCodexPools/);
  assert.match(app, /reconcileCodexPools/);
  assert.doesNotMatch(app, /version:\s*3/);
});

test('active auto-switch pools fail over after refresh and preserve the pool model', () => {
  assert.match(app, /maybeAutoFailoverActiveCodexPool/);
  assert.match(app, /findCodexPoolFailover/);
  assert.match(app, /codexFailoverLatchRef/);
  assert.match(app, /await\s+maybeAutoFailoverActiveCodexPool\(\)/);
  assert.match(app, /Promise\.all\(accounts\.map\(\(acc\)\s*=>\s*fetchAccountUsage\(acc\)\)\)[\s\S]{0,250}maybeAutoFailoverActiveCodexPool/);
  assert.match(app, /activeCodexPoolIdRef/);
  assert.match(app, /activePool[\s\S]{0,300}model/);
});

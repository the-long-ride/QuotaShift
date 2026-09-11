import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildCodexRouterConfig } from '../.test-build/codex-router.js';

test('router snapshot exposes only successful model-catalog generation metadata', () => {
  const base = {
    accounts: [{ id: 'a', label: 'A', apiKey: 'secret' }],
    pools: [],
    usageCache: {},
    appliedAccountId: 'a',
    decodeCredential: () => 'sk-test',
  };
  const success = buildCodexRouterConfig({
    ...base,
    modelCache: { a: { accountId: 'a', planName: 'Plus', models: [{ id: 'gpt-review', displayName: 'Review' }], fetchedAt: 123 } },
  });
  assert.equal(success.accounts[0].modelCatalogFetchedAt, 123);
  assert.deepEqual(success.accounts[0].availableModelIds, ['gpt-review']);

  const failed = buildCodexRouterConfig({
    ...base,
    modelCache: { a: { accountId: 'a', planName: 'Plus', models: [{ id: 'gpt-review', displayName: 'Review' }], fetchedAt: 456, error: 'scan failed' } },
  });
  assert.equal(failed.accounts[0].modelCatalogFetchedAt, null);
  assert.equal(failed.accounts[0].availableModelIds, null);
});

const sync = fs.readFileSync('src-tauri/src/codex/sync.rs', 'utf8');
test('router restore tracks whether config.toml originally existed', () => {
  assert.match(sync, /ROUTER_RESTORE_ABSENT_FILE/);
});
